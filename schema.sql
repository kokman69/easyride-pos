-- =====================================================================
--  Easyride POS — Supabase database
--  Run this whole file once in Supabase → SQL Editor → New query → Run.
--  Safe to run again: it only creates what is missing.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Staff accounts and roles --------------------------------
-- Two shared logins: one admin, one consultant. The e-mails must match
-- the users you create in Authentication → Users and js/config.js.
create table if not exists public.staff (
  email text primary key,
  role  text not null check (role in ('admin','consultant'))
);
insert into public.staff (email, role) values
  ('admin@easyride.app', 'admin'),
  ('staff@easyride.app', 'consultant')
on conflict (email) do nothing;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.staff where email = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() is not null
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

-- ---------- Tables ---------------------------------------------------
create table if not exists public.settings (
  id         int primary key default 1 check (id = 1),
  sellers    text[] not null default '{}',
  tariffs    jsonb  not null default '[]',
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  type       text not null default 'moped',
  brand      text default '',
  year       text default '',
  color      text default '',
  engine     text default '',
  code       text default '',
  price      numeric(10,2) not null default 0 check (price >= 0),
  qty        int not null default 0 check (qty >= 0),
  note       text default '',
  photos     text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text default '',
  id_number  text default '',
  photo      text default '',          -- path in the private "id-photos" bucket
  created_at timestamptz not null default now(),
  created_by text default ''
);
create index if not exists customers_name_idx on public.customers (lower(name));

create table if not exists public.fleet (
  id         uuid primary key default gen_random_uuid(),
  type       text not null,
  model      text default '',
  color      text default '',
  number     text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  day            date not null default ((now() at time zone 'Asia/Tbilisi')::date),
  lines          jsonb not null,
  list_total     numeric(12,2) not null default 0,
  extra_discount numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  seller         text default '',
  payment        text default '',
  customer_id    uuid references public.customers(id) on delete set null,
  customer_name  text default '',
  phone          text default '',
  note           text default '',
  created_by     text default ''
);
create index if not exists sales_day_idx on public.sales (day desc);

create table if not exists public.rentals (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  day           date not null default ((now() at time zone 'Asia/Tbilisi')::date),
  type          text not null,
  rate          jsonb,
  price         numeric(10,2) not null default 0,
  deposit       numeric(10,2) not null default 0,
  unit_id       uuid references public.fleet(id) on delete set null,
  unit_label    text default '',
  customer_id   uuid references public.customers(id) on delete set null,
  customer_name text default '',
  phone         text default '',
  seller        text default '',
  payment       text default '',
  status        text not null default 'active' check (status in ('active','returned')),
  returned_at   timestamptz,
  created_by    text default ''
);
create index if not exists rentals_day_idx on public.rentals (day desc);
-- one unit cannot be rented twice at the same time
create unique index if not exists rentals_one_active_per_unit
  on public.rentals (unit_id) where status = 'active' and unit_id is not null;

-- ---------- Row level security ---------------------------------------
alter table public.staff     enable row level security;
alter table public.settings  enable row level security;
alter table public.products  enable row level security;
alter table public.customers enable row level security;
alter table public.fleet     enable row level security;
alter table public.sales     enable row level security;
alter table public.rentals   enable row level security;

do $$ begin
  -- staff: everyone logged in can see who is admin/consultant
  if not exists (select 1 from pg_policies where policyname='staff_read') then
    create policy staff_read on public.staff for select to authenticated using (true); end if;

  -- settings: seller names + rental rates are readable on the login screen
  if not exists (select 1 from pg_policies where policyname='settings_read') then
    create policy settings_read on public.settings for select to anon, authenticated using (true); end if;
  if not exists (select 1 from pg_policies where policyname='settings_admin_write') then
    create policy settings_admin_write on public.settings for all to authenticated using (public.is_admin()) with check (public.is_admin()); end if;

  -- products: staff read, admin writes (sales change stock through record_sale)
  if not exists (select 1 from pg_policies where policyname='products_read') then
    create policy products_read on public.products for select to authenticated using (public.is_staff()); end if;
  if not exists (select 1 from pg_policies where policyname='products_admin_write') then
    create policy products_admin_write on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin()); end if;

  -- customers: staff read/add/edit, admin deletes
  if not exists (select 1 from pg_policies where policyname='customers_read') then
    create policy customers_read on public.customers for select to authenticated using (public.is_staff()); end if;
  if not exists (select 1 from pg_policies where policyname='customers_insert') then
    create policy customers_insert on public.customers for insert to authenticated with check (public.is_staff()); end if;
  if not exists (select 1 from pg_policies where policyname='customers_update') then
    create policy customers_update on public.customers for update to authenticated using (public.is_staff()) with check (public.is_staff()); end if;
  if not exists (select 1 from pg_policies where policyname='customers_delete') then
    create policy customers_delete on public.customers for delete to authenticated using (public.is_admin()); end if;

  -- fleet: staff read, admin writes
  if not exists (select 1 from pg_policies where policyname='fleet_read') then
    create policy fleet_read on public.fleet for select to authenticated using (public.is_staff()); end if;
  if not exists (select 1 from pg_policies where policyname='fleet_admin_write') then
    create policy fleet_admin_write on public.fleet for all to authenticated using (public.is_admin()) with check (public.is_admin()); end if;

  -- sales: staff read; created only through record_sale(), removed only through void_sale()
  if not exists (select 1 from pg_policies where policyname='sales_read') then
    create policy sales_read on public.sales for select to authenticated using (public.is_staff()); end if;

  -- rentals: staff read/add/return, admin deletes
  if not exists (select 1 from pg_policies where policyname='rentals_read') then
    create policy rentals_read on public.rentals for select to authenticated using (public.is_staff()); end if;
  if not exists (select 1 from pg_policies where policyname='rentals_insert') then
    create policy rentals_insert on public.rentals for insert to authenticated with check (public.is_staff()); end if;
  if not exists (select 1 from pg_policies where policyname='rentals_update') then
    create policy rentals_update on public.rentals for update to authenticated using (public.is_staff()) with check (public.is_staff()); end if;
  if not exists (select 1 from pg_policies where policyname='rentals_delete') then
    create policy rentals_delete on public.rentals for delete to authenticated using (public.is_admin()); end if;
end $$;

-- ---------- Sales: record and void (stock changes in the same step) ---
-- p_lines: [{product_id|null, name, type, list_price, unit_price, qty, pct}]
create or replace function public.record_sale(
  p_lines jsonb, p_extra numeric, p_seller text, p_payment text,
  p_customer uuid, p_note text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l jsonb; v_lines jsonb := '[]'; v_qty int; v_unit numeric; v_pct numeric; v_line_total numeric;
  v_list numeric := 0; v_sub numeric := 0; v_total numeric; v_id uuid;
  v_cname text := ''; v_phone text := ''; v_pid uuid;
begin
  if not public.is_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'empty_sale'; end if;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_qty  := greatest(1, coalesce((l->>'qty')::int, 1));
    v_unit := greatest(0, coalesce((l->>'unit_price')::numeric, 0));
    v_pct  := least(100, greatest(0, coalesce((l->>'pct')::numeric, 0)));
    v_line_total := round(v_qty * v_unit * (1 - v_pct / 100), 2);
    v_pid := nullif(l->>'product_id', '')::uuid;
    if v_pid is not null then
      update public.products set qty = qty - v_qty, updated_at = now()
       where id = v_pid and qty >= v_qty;
      if not found then raise exception 'out_of_stock:%', coalesce(l->>'name', ''); end if;
    end if;
    v_list := v_list + v_qty * greatest(0, coalesce((l->>'list_price')::numeric, 0));
    v_sub  := v_sub + v_line_total;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_pid, 'name', coalesce(l->>'name', ''), 'type', coalesce(l->>'type', 'other'),
      'list_price', coalesce((l->>'list_price')::numeric, 0), 'unit_price', v_unit,
      'qty', v_qty, 'pct', v_pct, 'total', v_line_total));
  end loop;

  v_total := greatest(0, v_sub - greatest(0, coalesce(p_extra, 0)));
  if p_customer is not null then
    select name, phone into v_cname, v_phone from public.customers where id = p_customer;
  end if;

  insert into public.sales (lines, list_total, extra_discount, total, seller, payment,
                            customer_id, customer_name, phone, note, created_by)
  values (v_lines, round(v_list, 2), round(greatest(0, coalesce(p_extra, 0)), 2), round(v_total, 2),
          coalesce(p_seller, ''), coalesce(p_payment, ''), p_customer,
          coalesce(v_cname, ''), coalesce(v_phone, ''), coalesce(p_note, ''),
          coalesce(auth.jwt() ->> 'email', ''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.void_sale(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l jsonb; v_lines jsonb;
begin
  if not public.is_admin() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select lines into v_lines from public.sales where id = p_id;
  if v_lines is null then return; end if;
  for l in select * from jsonb_array_elements(v_lines) loop
    if nullif(l->>'product_id', '') is not null then
      update public.products set qty = qty + coalesce((l->>'qty')::int, 0), updated_at = now()
       where id = (l->>'product_id')::uuid;
    end if;
  end loop;
  delete from public.sales where id = p_id;
end $$;

-- Admin changes the admin or consultant password from the app.
create or replace function public.admin_set_password(p_role text, p_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_role not in ('admin','consultant') then raise exception 'bad_role'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'password_too_short'; end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where lower(email) in (select email from public.staff where role = p_role);
end $$;

revoke all on function public.record_sale(jsonb, numeric, text, text, uuid, text) from public, anon;
revoke all on function public.void_sale(uuid) from public, anon;
revoke all on function public.admin_set_password(text, text) from public, anon;
grant execute on function public.record_sale(jsonb, numeric, text, text, uuid, text) to authenticated;
grant execute on function public.void_sale(uuid) to authenticated;
grant execute on function public.admin_set_password(text, text) to authenticated;
grant execute on function public.my_role() to authenticated;

-- ---------- Photo storage --------------------------------------------
-- "products": product photos, visible to anyone with the link to a photo.
-- "id-photos": ID documents, private — only logged-in staff can open them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('products',  'products',  true,  5242880, array['image/jpeg','image/png','image/webp']),
  ('id-photos', 'id-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

do $$ begin
  if not exists (select 1 from pg_policies where policyname='product_photos_admin_insert') then
    create policy product_photos_admin_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'products' and public.is_admin()); end if;
  if not exists (select 1 from pg_policies where policyname='product_photos_admin_update') then
    create policy product_photos_admin_update on storage.objects for update to authenticated
      using (bucket_id = 'products' and public.is_admin()); end if;
  if not exists (select 1 from pg_policies where policyname='product_photos_admin_delete') then
    create policy product_photos_admin_delete on storage.objects for delete to authenticated
      using (bucket_id = 'products' and public.is_admin()); end if;
  if not exists (select 1 from pg_policies where policyname='id_photos_staff_read') then
    create policy id_photos_staff_read on storage.objects for select to authenticated
      using (bucket_id = 'id-photos' and public.is_staff()); end if;
  if not exists (select 1 from pg_policies where policyname='id_photos_staff_insert') then
    create policy id_photos_staff_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'id-photos' and public.is_staff()); end if;
  if not exists (select 1 from pg_policies where policyname='id_photos_admin_delete') then
    create policy id_photos_admin_delete on storage.objects for delete to authenticated
      using (bucket_id = 'id-photos' and public.is_admin()); end if;
end $$;

-- ---------- Live updates between phones ------------------------------
do $$
declare t text;
begin
  foreach t in array array['products','customers','fleet','sales','rentals','settings'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- Starting settings (edit later in the app) ----------------
insert into public.settings (id, sellers, tariffs) values (1,
  array['კოკა','ჯონი','ანრიკო','ანრი'],
  '[{"type":"bike","rates":[{"n":1,"u":"h","p":15},{"n":1,"u":"d","p":60}]},
    {"type":"escooter","rates":[{"n":30,"u":"m","p":20},{"n":1,"u":"h","p":30},{"n":2,"u":"h","p":50},{"n":3,"u":"h","p":65},{"n":1,"u":"d","p":90},{"n":3,"u":"d","p":270},{"n":1,"u":"w","p":550}]},
    {"type":"emoped","rates":[{"n":30,"u":"m","p":20},{"n":1,"u":"h","p":30},{"n":2,"u":"h","p":50},{"n":3,"u":"h","p":65},{"n":1,"u":"d","p":90},{"n":3,"u":"d","p":270},{"n":1,"u":"w","p":550}]}]'::jsonb)
on conflict (id) do nothing;

-- ---------- v2: specs from easyride.ge, renting units straight from stock ----------
alter table public.products add column if not exists specs jsonb not null default '{}';
alter table public.products add column if not exists source_url text default '';
alter table public.rentals add column if not exists product_id uuid references public.products(id) on delete set null;
create unique index if not exists rentals_one_active_per_product
  on public.rentals (product_id) where status = 'active' and product_id is not null;
-- petrol moped rental rate (1 day 50 ₾, as in the rent-to-own example on easyride.ge); edit in the app
update public.settings
   set tariffs = tariffs || '[{"type":"moped","rates":[{"n":1,"u":"d","p":50}]}]'::jsonb
 where id = 1 and not exists (select 1 from jsonb_array_elements(tariffs) e where e->>'type' = 'moped');

-- ---------- v3: sales can be in GEL or USD ----------
alter table public.sales add column if not exists currency text not null default 'GEL';
