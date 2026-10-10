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
-- petrol moped rental rate: 1 day (24 h) = 60 ₾; edit in the app
update public.settings
   set tariffs = tariffs || '[{"type":"moped","rates":[{"n":1,"u":"d","p":60}]}]'::jsonb
 where id = 1 and not exists (select 1 from jsonb_array_elements(tariffs) e where e->>'type' = 'moped');

-- ---------- v3: sales can be in GEL or USD ----------
alter table public.sales add column if not exists currency text not null default 'GEL';

-- ---------- v4: document details, return time, signed agreements, admin can fix sales ----------
alter table public.customers add column if not exists birth_date  date;
alter table public.customers add column if not exists nationality text default '';
alter table public.customers add column if not exists doc_type    text default '';
alter table public.customers add column if not exists doc_expiry  date;
alter table public.rentals   add column if not exists ends_at   timestamptz;
alter table public.rentals   add column if not exists contract  jsonb;      -- {v, lang, signed_at, raw:{…what the customer saw…}}
alter table public.rentals   add column if not exists signature text default '';  -- PNG in the private "id-photos" bucket
do $$ begin
  if not exists (select 1 from pg_policies where policyname='sales_admin_update') then
    create policy sales_admin_update on public.sales for update to authenticated
      using (public.is_admin()) with check (public.is_admin()); end if;
end $$;

-- ---------- v5: editing a sale needs the admin PIN, checked on the server ----------
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.admin_pin (id int primary key default 1 check (id = 1), pin_hash text not null);
alter table public.admin_pin enable row level security;   -- no policies: nobody can read it from the app
revoke all on public.admin_pin from anon, authenticated;
-- set / change the PIN (stored only as a bcrypt hash):
--   insert into public.admin_pin values (1, extensions.crypt('NEW-PIN', extensions.gen_salt('bf')))
--   on conflict (id) do update set pin_hash = excluded.pin_hash;
create or replace function public.check_admin_pin(p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then return false; end if;
  perform pg_sleep(0.4);   -- slows down guessing
  return exists (select 1 from public.admin_pin where id = 1 and pin_hash = crypt(coalesce(p_pin, ''), pin_hash));
end $$;
create or replace function public.edit_sale(p_pin text, p_id uuid, p_patch jsonb) returns public.sales
language plpgsql security definer set search_path = public, extensions as $$
declare r public.sales;
begin
  if not public.check_admin_pin(p_pin) then raise exception 'bad_pin'; end if;
  update public.sales set
    created_at     = coalesce((p_patch->>'created_at')::timestamptz, created_at),
    day            = coalesce((p_patch->>'day')::date, day),
    lines          = coalesce(p_patch->'lines', lines),
    list_total     = coalesce((p_patch->>'list_total')::numeric, list_total),
    extra_discount = coalesce((p_patch->>'extra_discount')::numeric, extra_discount),
    total          = coalesce((p_patch->>'total')::numeric, total),
    seller         = coalesce(p_patch->>'seller', seller),
    payment        = coalesce(p_patch->>'payment', payment),
    currency       = coalesce(p_patch->>'currency', currency),
    customer_name  = coalesce(p_patch->>'customer_name', customer_name),
    phone          = coalesce(p_patch->>'phone', phone),
    note           = coalesce(p_patch->>'note', note)
  where id = p_id returning * into r;
  if r.id is null then raise exception 'not_found'; end if;
  return r;
end $$;
revoke execute on function public.check_admin_pin(text) from public, anon;
revoke execute on function public.edit_sale(text, uuid, jsonb) from public, anon;
grant execute on function public.check_admin_pin(text) to authenticated;
grant execute on function public.edit_sale(text, uuid, jsonb) to authenticated;
-- sales are no longer editable directly, only through edit_sale()
drop policy if exists sales_admin_update on public.sales;

-- ---------- v6: editing a rental also needs the admin PIN ----------
create or replace function public.edit_rental(p_pin text, p_id uuid, p_patch jsonb) returns public.rentals
language plpgsql security definer set search_path = public, extensions as $$
declare r public.rentals;
begin
  if not public.check_admin_pin(p_pin) then raise exception 'bad_pin'; end if;
  update public.rentals set
    created_at    = coalesce((p_patch->>'created_at')::timestamptz, created_at),
    day           = coalesce((p_patch->>'day')::date, day),
    ends_at       = case when p_patch ? 'ends_at' then (p_patch->>'ends_at')::timestamptz else ends_at end,
    type          = coalesce(p_patch->>'type', type),
    unit_label    = coalesce(p_patch->>'unit_label', unit_label),
    rate          = coalesce(p_patch->'rate', rate),
    price         = coalesce((p_patch->>'price')::numeric, price),
    deposit       = coalesce((p_patch->>'deposit')::numeric, deposit),
    seller        = coalesce(p_patch->>'seller', seller),
    payment       = coalesce(p_patch->>'payment', payment),
    customer_name = coalesce(p_patch->>'customer_name', customer_name),
    phone         = coalesce(p_patch->>'phone', phone),
    status        = coalesce(p_patch->>'status', status),
    returned_at   = case when p_patch ? 'returned_at' then (p_patch->>'returned_at')::timestamptz else returned_at end
  where id = p_id returning * into r;
  if r.id is null then raise exception 'not_found'; end if;
  return r;
end $$;
revoke execute on function public.edit_rental(text, uuid, jsonb) from public, anon;
grant execute on function public.edit_rental(text, uuid, jsonb) to authenticated;

-- =====================================================================
-- v7: personal logins (admin + each seller), profiles, activity log,
--     rental cancel and the late-return fee (10% of the daily rate per late hour)
-- =====================================================================
alter table public.staff add column if not exists user_id    uuid;
alter table public.staff add column if not exists name       text;
alter table public.staff add column if not exists phone      text not null default '';
alter table public.staff add column if not exists active     boolean not null default true;
alter table public.staff add column if not exists created_at timestamptz not null default now();
create unique index if not exists staff_name_uq on public.staff (lower(name)) where name is not null;
update public.staff s set user_id = u.id from auth.users u where lower(u.email) = s.email and s.user_id is null;
update public.staff set name = 'კოკა' where email = 'admin@easyride.app' and name is null;
-- the old shared seller login stays usable until the admin creates personal accounts and switches it off
update public.staff set name = 'საერთო (ძველი)' where email = 'staff@easyride.app' and name is null;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.staff where email = lower(coalesce(auth.jwt() ->> 'email', '')) and active
$$;
create or replace function public.my_profile() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('email', email, 'role', role, 'name', coalesce(name, ''), 'phone', phone)
    from public.staff where email = lower(coalesce(auth.jwt() ->> 'email', '')) and active
$$;
-- names shown on the login screen (no passwords, no personal data)
create or replace function public.login_list() returns table (name text, email text, role text)
language sql stable security definer set search_path = public as $$
  select name, email, role from public.staff where active and name is not null order by role, name
$$;

-- ---------- activity log ----------
create table if not exists public.audit_log (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  email  text not null default '',
  name   text not null default '',
  action text not null,              -- insert / update / delete / login / staff_create / staff_update
  tbl    text not null default '',
  row_id text default '',
  txid   bigint default txid_current(),
  data   jsonb
);
create index if not exists audit_log_at_idx    on public.audit_log (at desc);
create index if not exists audit_log_email_idx on public.audit_log (email, at desc);
alter table public.audit_log enable row level security;
drop policy if exists audit_admin_read on public.audit_log;
create policy audit_admin_read on public.audit_log for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.audit_log from anon, authenticated;

create or replace function public.audit_write(p_action text, p_tbl text, p_row text, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(coalesce(auth.jwt() ->> 'email', '')); v_name text;
begin
  select name into v_name from public.staff where email = v_email;
  insert into public.audit_log (email, name, action, tbl, row_id, data)
  values (v_email, coalesce(v_name, v_email), p_action, coalesce(p_tbl, ''), coalesce(p_row, ''), p_data);
end $$;
revoke execute on function public.audit_write(text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.audit_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_new jsonb; v_d jsonb := '{}'; k text;
begin
  if coalesce(current_setting('er.skip_audit', true), '') = '1' then return null; end if;
  if tg_op = 'INSERT' then v_d := to_jsonb(new);
  elsif tg_op = 'DELETE' then v_d := to_jsonb(old);
  else
    v_old := to_jsonb(old); v_new := to_jsonb(new);
    for k in select jsonb_object_keys(v_new) loop
      if k <> 'updated_at' and (v_new -> k) is distinct from (v_old -> k) then
        v_d := v_d || jsonb_build_object(k, jsonb_build_object('from', v_old -> k, 'to', v_new -> k));
      end if;
    end loop;
    if v_d = '{}'::jsonb then return null; end if;
    v_d := v_d || jsonb_build_object('_row', v_new - 'contract' - 'photos' - 'lines');
  end if;
  v_d := v_d - 'contract' - 'photos';
  perform public.audit_write(lower(tg_op), tg_table_name, coalesce(v_new ->> 'id', v_old ->> 'id', v_d ->> 'id'), v_d);
  return null;
end $$;
do $$ declare tb text; begin
  foreach tb in array array['sales','rentals','products','customers','fleet','settings'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', tb);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.audit_trg()', tb);
  end loop;
end $$;

create or replace function public.log_login() returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.is_staff() then perform public.audit_write('login', '', '', null); end if;
end $$;

-- ---------- staff accounts (admin creates them; nobody else can) ----------
create or replace function public.rename_seller(p_old text, p_new text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_old is null or p_old = p_new then return; end if;
  perform set_config('er.skip_audit', '1', true);
  update public.sales   set seller = p_new where seller = p_old;
  update public.rentals set seller = p_new where seller = p_old;
  update public.settings set sellers = array_replace(sellers, p_old, p_new) where id = 1;
  perform set_config('er.skip_audit', '0', true);
end $$;
revoke execute on function public.rename_seller(text, text) from public, anon, authenticated;

create or replace function public.admin_create_staff(p_name text, p_role text, p_password text, p_phone text default '') returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := gen_random_uuid(); v_email text; v_inst uuid;
begin
  if not public.is_admin() then raise exception 'not_allowed' using errcode = '42501'; end if;
  p_name := btrim(coalesce(p_name, ''));
  if p_name = '' then raise exception 'name_required'; end if;
  if p_role not in ('admin','consultant') then raise exception 'bad_role'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'password_too_short'; end if;
  if exists (select 1 from public.staff where lower(name) = lower(p_name)) then raise exception 'name_taken'; end if;
  v_email := 'u-' || substr(replace(v_id::text, '-', ''), 1, 12) || '@easyride.app';
  select instance_id into v_inst from auth.users where instance_id is not null limit 1;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values (coalesce(v_inst, '00000000-0000-0000-0000-000000000000'), v_id, 'authenticated', 'authenticated', v_email,
      crypt(p_password, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
      '', '', '', '', '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now());
  insert into public.staff (email, role, user_id, name, phone) values (v_email, p_role, v_id, p_name, coalesce(p_phone, ''));
  update public.settings set sellers = array_append(sellers, p_name) where id = 1 and not (p_name = any(sellers));
  perform public.audit_write('staff_create', 'staff', v_email, jsonb_build_object('name', p_name, 'role', p_role));
  return v_email;
end $$;

-- p_patch: {name, phone, role, active, password}
create or replace function public.admin_update_staff(p_email text, p_patch jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff; v_name text; v_pw text := p_patch ->> 'password';
begin
  if not public.is_admin() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into s from public.staff where email = lower(p_email);
  if s.email is null then raise exception 'not_found'; end if;
  if s.email = lower(coalesce(auth.jwt() ->> 'email', '')) and (p_patch ->> 'active' = 'false' or p_patch ->> 'role' = 'consultant') then
    raise exception 'not_self'; end if;
  v_name := nullif(btrim(coalesce(p_patch ->> 'name', '')), '');
  if v_name is not null and v_name is distinct from s.name then
    if exists (select 1 from public.staff where lower(name) = lower(v_name) and email <> s.email) then raise exception 'name_taken'; end if;
    perform public.rename_seller(s.name, v_name);
    update public.settings set sellers = array_append(sellers, v_name) where id = 1 and not (v_name = any(sellers));
  end if;
  if v_pw is not null and v_pw <> '' then
    if length(v_pw) < 6 then raise exception 'password_too_short'; end if;
    update auth.users set encrypted_password = crypt(v_pw, gen_salt('bf')), updated_at = now() where lower(email) = s.email;
  end if;
  update public.staff set
    name   = coalesce(v_name, name),
    phone  = coalesce(p_patch ->> 'phone', phone),
    role   = case when p_patch ->> 'role' in ('admin','consultant') then p_patch ->> 'role' else role end,
    active = coalesce((p_patch ->> 'active')::boolean, active)
  where email = s.email;
  perform public.audit_write('staff_update', 'staff', s.email, (p_patch - 'password') || case when v_pw <> '' then '{"password":"***"}'::jsonb else '{}'::jsonb end || jsonb_build_object('who', coalesce(s.name, s.email)));
end $$;

-- every user: own name / phone, own password (old one required)
create or replace function public.update_my_profile(p_name text, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.staff; v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  select * into s from public.staff where email = lower(coalesce(auth.jwt() ->> 'email', '')) and active;
  if s.email is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v_name is not null and v_name is distinct from s.name then
    if exists (select 1 from public.staff where lower(name) = lower(v_name) and email <> s.email) then raise exception 'name_taken'; end if;
    perform public.rename_seller(s.name, v_name);
    update public.settings set sellers = array_append(sellers, v_name) where id = 1 and not (v_name = any(sellers));
  end if;
  update public.staff set name = coalesce(v_name, name), phone = coalesce(p_phone, phone) where email = s.email;
  perform public.audit_write('staff_update', 'staff', s.email, jsonb_build_object('name', v_name, 'phone', p_phone, 'who', coalesce(s.name, s.email)));
end $$;
create or replace function public.my_set_password(p_old text, p_new text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if length(coalesce(p_new, '')) < 6 then raise exception 'password_too_short'; end if;
  perform pg_sleep(0.4);
  if not exists (select 1 from auth.users where id = auth.uid() and encrypted_password = crypt(coalesce(p_old, ''), encrypted_password)) then
    raise exception 'bad_old_password'; end if;
  update auth.users set encrypted_password = crypt(p_new, gen_salt('bf')), updated_at = now() where id = auth.uid();
  perform public.audit_write('staff_update', 'staff', lower(coalesce(auth.jwt() ->> 'email', '')), '{"password":"***"}');
end $$;

-- ---------- rentals: cancel + late fee ----------
alter table public.rentals add column if not exists late_hours   int not null default 0;
alter table public.rentals add column if not exists late_fee     numeric(10,2) not null default 0;
alter table public.rentals add column if not exists late_payment text not null default '';
alter table public.rentals add column if not exists late_paid_at timestamptz;
alter table public.rentals add column if not exists cancelled_at timestamptz;
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.rentals'::regclass and contype = 'c'
            and pg_get_constraintdef(oid) ilike '%status%' loop
    execute format('alter table public.rentals drop constraint %I', c);
  end loop;
end $$;
alter table public.rentals add constraint rentals_status_check check (status in ('active','returned','cancelled'));

-- late hours (every started hour after ends_at) × 10% of the daily rate the customer signed for
create or replace function public.rental_late(p_id uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare r public.rentals; v_daily numeric; v_h int := 0;
begin
  if not public.is_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into r from public.rentals where id = p_id;
  if r.id is null then raise exception 'not_found'; end if;
  v_daily := nullif((r.contract -> 'raw' ->> 'daily')::numeric, 0);
  if v_daily is null then
    select (rt ->> 'p')::numeric into v_daily from public.settings s, jsonb_array_elements(s.tariffs) t, jsonb_array_elements(t -> 'rates') rt
     where s.id = 1 and t ->> 'type' = r.type and rt ->> 'u' = 'd' and (rt ->> 'n')::int = 1 limit 1;
  end if;
  if r.ends_at is not null and now() > r.ends_at then v_h := ceil(extract(epoch from now() - r.ends_at) / 3600)::int; end if;
  return json_build_object('hours', v_h, 'daily', coalesce(v_daily, 0), 'fee', round(v_h * coalesce(v_daily, 0) * 0.10, 2));
end $$;
create or replace function public.return_rental(p_id uuid, p_fee numeric, p_payment text) returns public.rentals
language plpgsql security definer set search_path = public as $$
declare r public.rentals; l json;
begin
  if not public.is_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into r from public.rentals where id = p_id for update;
  if r.id is null or r.status <> 'active' then raise exception 'not_active'; end if;
  l := public.rental_late(p_id);
  if (l ->> 'fee')::numeric <> coalesce(p_fee, 0) then raise exception 'fee_changed'; end if;
  update public.rentals set status = 'returned', returned_at = now(),
         late_hours = (l ->> 'hours')::int, late_fee = (l ->> 'fee')::numeric,
         late_payment = case when (l ->> 'fee')::numeric > 0 then coalesce(p_payment, '') else '' end,
         late_paid_at = case when (l ->> 'fee')::numeric > 0 then now() end
   where id = p_id returning * into r;
  return r;
end $$;

create or replace function public.edit_rental(p_pin text, p_id uuid, p_patch jsonb) returns public.rentals
language plpgsql security definer set search_path = public, extensions as $$
declare r public.rentals;
begin
  if not public.check_admin_pin(p_pin) then raise exception 'bad_pin'; end if;
  update public.rentals set
    created_at    = coalesce((p_patch->>'created_at')::timestamptz, created_at),
    day           = coalesce((p_patch->>'day')::date, day),
    ends_at       = case when p_patch ? 'ends_at' then (p_patch->>'ends_at')::timestamptz else ends_at end,
    type          = coalesce(p_patch->>'type', type),
    unit_label    = coalesce(p_patch->>'unit_label', unit_label),
    rate          = coalesce(p_patch->'rate', rate),
    price         = coalesce((p_patch->>'price')::numeric, price),
    deposit       = coalesce((p_patch->>'deposit')::numeric, deposit),
    late_fee      = coalesce((p_patch->>'late_fee')::numeric, late_fee),
    seller        = coalesce(p_patch->>'seller', seller),
    payment       = coalesce(p_patch->>'payment', payment),
    customer_name = coalesce(p_patch->>'customer_name', customer_name),
    phone         = coalesce(p_patch->>'phone', phone),
    status        = coalesce(p_patch->>'status', status),
    returned_at   = case when p_patch ? 'returned_at' then (p_patch->>'returned_at')::timestamptz else returned_at end,
    cancelled_at  = case when p_patch->>'status' = 'cancelled' then coalesce(cancelled_at, now())
                         when p_patch ? 'status' then null else cancelled_at end
  where id = p_id returning * into r;
  if r.id is null then raise exception 'not_found'; end if;
  return r;
end $$;

revoke execute on function public.my_profile() from public;
revoke execute on function public.log_login() from public, anon;
revoke execute on function public.admin_create_staff(text, text, text, text) from public, anon;
revoke execute on function public.admin_update_staff(text, jsonb) from public, anon;
revoke execute on function public.update_my_profile(text, text) from public, anon;
revoke execute on function public.my_set_password(text, text) from public, anon;
revoke execute on function public.rental_late(uuid) from public, anon;
revoke execute on function public.return_rental(uuid, numeric, text) from public, anon;
grant execute on function public.login_list() to anon, authenticated;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.log_login() to authenticated;
grant execute on function public.admin_create_staff(text, text, text, text) to authenticated;
grant execute on function public.admin_update_staff(text, jsonb) to authenticated;
grant execute on function public.update_my_profile(text, text) to authenticated;
grant execute on function public.my_set_password(text, text) to authenticated;
grant execute on function public.rental_late(uuid) to authenticated;
grant execute on function public.return_rental(uuid, numeric, text) to authenticated;
grant select on public.audit_log to authenticated;

-- ---------- v8: petrol moped 1 day (24 h) = 60 ₾ (was entered as 50 by mistake) ----------
update public.settings
   set tariffs = (select jsonb_agg(case when t->>'type' = 'moped'
                    then jsonb_set(t, '{rates}', (select jsonb_agg(case when r->>'u' = 'd' and (r->>'n')::int = 1 then jsonb_set(r, '{p}', '60') else r end) from jsonb_array_elements(t->'rates') r))
                    else t end) from jsonb_array_elements(tariffs) t)
 where id = 1;
update public.rentals set contract = jsonb_set(contract, '{raw,daily}', '60')
 where type = 'moped' and contract is not null and (contract->'raw'->>'daily')::numeric = 50;

-- ---------- v9: late fee — up to 30 minutes late is free; after that every started hour counts ----------
create or replace function public.rental_late(p_id uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare r public.rentals; v_daily numeric; v_h int := 0;
begin
  if not public.is_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into r from public.rentals where id = p_id;
  if r.id is null then raise exception 'not_found'; end if;
  v_daily := nullif((r.contract -> 'raw' ->> 'daily')::numeric, 0);
  if v_daily is null then
    select (rt ->> 'p')::numeric into v_daily from public.settings s, jsonb_array_elements(s.tariffs) t, jsonb_array_elements(t -> 'rates') rt
     where s.id = 1 and t ->> 'type' = r.type and rt ->> 'u' = 'd' and (rt ->> 'n')::int = 1 limit 1;
  end if;
  if r.ends_at is not null and now() > r.ends_at + interval '30 minutes' then
    v_h := ceil(extract(epoch from now() - r.ends_at - interval '30 minutes') / 3600)::int;
  end if;
  return json_build_object('hours', v_h, 'daily', coalesce(v_daily, 0), 'fee', round(v_h * coalesce(v_daily, 0) * 0.10, 2));
end $$;

-- ---------- v10: items (small goods) get automatic running codes; Georgian item names → English ----------
update public.products p set name = m.en, updated_at = now()
  from (values ('ბორბლის საკეტი','Wheel lock'), ('ელექტრო პორტატული ნასოსი','Portable electric pump'),
               ('ინსტრუმენტების ჩანთა','Tool bag'), ('მეტალის საკიდი M','Metal rack M'), ('მეტალის საკიდი S','Metal rack S'),
               ('ნიღაბი','Face mask'), ('ტელწფონის წვიმისგან დამცავი','Phone rain cover'), ('ტელეფონის წვიმისგან დამცავი','Phone rain cover'),
               ('ქოლგა','Umbrella'), ('ჩანთა','Bag'), ('წელის ჩანთა','Waist bag'), ('წვიმისგან დამცავი ქეისი','Waterproof case'),
               ('ხელთათმანი','Gloves'), ('ტელეფონის დამჭერი','Phone holder'),
               ('charging cable','Charging cable 3-in-1'), ('USB cabel','USB cable'), ('USB Cabel','USB cable')) as m(ka, en)
 where p.name = m.ka and p.type in ('accessory','part','service','other');

-- every item without a code gets the next number (00008, 00009, …), alphabetically
with mx as (select coalesce(max(code::int), 0) n from public.products where code ~ '^[0-9]{1,9}$' and type in ('accessory','part','service','other')),
     todo as (select id, row_number() over (order by name, price, created_at) rn from public.products
               where coalesce(code, '') = '' and type in ('accessory','part','service','other'))
update public.products p set code = lpad((mx.n + todo.rn)::text, 5, '0') from mx, todo where p.id = todo.id;

create sequence if not exists public.item_code_seq;
select setval('public.item_code_seq', greatest(1, (select coalesce(max(code::int), 0) from public.products
               where code ~ '^[0-9]{1,9}$' and type in ('accessory','part','service','other'))));
create or replace function public.item_code_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type in ('accessory','part','service','other') and coalesce(btrim(new.code), '') = '' then
    loop
      new.code := lpad(nextval('public.item_code_seq')::text, 5, '0');
      exit when not exists (select 1 from public.products where code = new.code);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists item_code on public.products;
create trigger item_code before insert or update of code, type on public.products for each row execute function public.item_code_trg();
