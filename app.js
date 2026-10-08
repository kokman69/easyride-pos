/* Easyride POS — app logic (vanilla JS + Supabase) */
(() => {
'use strict';

/* ================= helpers ================= */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const r2 = n => Math.round((+n || 0) * 100) / 100;
const money = n => { n = r2(n); const s = Math.abs(n).toFixed(n % 1 ? 2 : 0).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return (n < 0 ? '−' : '') + s + ' ₾'; };
const pad = n => String(n).padStart(2, '0');
const dayKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const fmtTs = ts => { const d = new Date(ts); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const ls = { get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }, set(k,v){ try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch(e){} } };

/* ================= i18n ================= */
const L = window.I18N, LANGS = window.I18N_LANGS, UNITS = window.I18N_UNITS;
let LANG = ls.get('er-lang') || 'ka';
const li = () => Math.max(0, LANGS.findIndex(l => l[0] === LANG));
const t = k => { const a = L[k]; return a ? (a[li()] ?? a[0]) : k; };
const TYPE_KEYS = ['moped','emoped','escooter','ebike','bike','atv','accessory','part','service','other'];
const VEH = ['moped','emoped','escooter','ebike','bike','atv'];
const RENTABLE = ['bike','ebike','escooter','emoped','moped'];
const PAYS = ['cash','card','transfer','installment'];
const tType = k => L['t_' + k] ? t('t_' + k) : (k || '');
const tPay = k => L['pay_' + k] ? t('pay_' + k) : (k || '');
function rateLabel(r){
  if (!r) return '';
  if (r.other) return t('other_duration');
  const u = UNITS[r.u]; if (!u) return r.d || '';
  const w = u[li()];
  if (LANG === 'ja') return r.n + w;
  if (LANG === 'en' && (r.u === 'd' || r.u === 'w') && r.n > 1) return r.n + ' ' + w + 's';
  return r.n + ' ' + w;
}
function applyI18n(){
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-i]').forEach(el => el.textContent = t(el.dataset.i));
  document.querySelectorAll('[data-iph]').forEach(el => el.placeholder = t(el.dataset.iph));
  ['lang-g','lang-a'].forEach(id => $(id).innerHTML = LANGS.map(([k,n]) => `<option value="${k}" ${k===LANG?'selected':''}>${n}</option>`).join(''));
  ['c-pay','r-pay'].forEach(id => { const v = $(id).value; $(id).innerHTML = PAYS.filter(p => id === 'c-pay' || p !== 'installment').map(p => `<option value="${p}" ${p===v?'selected':''}>${esc(tPay(p))}</option>`).join(''); });
}
function setLang(l){ LANG = l; ls.set('er-lang', l); applyI18n(); if (S.user) renderAll(); else renderGate(); }
$('lang-g').onchange = e => setLang(e.target.value);
$('lang-a').onchange = e => setLang(e.target.value);

/* ================= state ================= */
const S = { products:[], sales:[], rentals:[], customers:[], fleet:[], settings:{ sellers:[], tariffs:[] },
  user:null, cart:[], tab:'sale', sType:'', pType:'', period:'today', loaded:false };
const isAdmin = () => S.user?.role === 'admin';

function toast(x){ const el = $('toast'); el.textContent = x; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2800); }
function fail(e){
  console.error(e);
  const m = (e && (e.message || '')) + '';
  if (m.startsWith('out_of_stock:')) return toast(t('out_of_stock_err') + ' ' + m.slice(13));
  if (e && e.code === '23505') return toast(t('already_rented'));
  if (e && (e.code === '42501' || /row-level security|not_allowed|permission/i.test(m))) return toast(t('no_rights'));
  if (/password_too_short/.test(m)) return toast(t('pw_short'));
  if (!navigator.onLine) return toast(t('offline'));
  toast(t('save_failed'));
}
function arm(btn, fn){
  if (btn.classList.contains('armed')) { btn.classList.remove('armed'); fn(); return; }
  const txt = btn.textContent; btn.classList.add('armed'); btn.textContent = t('confirm_tap');
  setTimeout(() => { if (btn.isConnected) { btn.classList.remove('armed'); btn.textContent = txt; } }, 3000);
}
const pName = p => p.name || '';
const pMeta = p => [tType(p.type), p.year, p.color, p.engine].filter(Boolean).join(' · ');
const fleetLabel = f => [f.model, f.color, f.number ? '#' + f.number : ''].filter(Boolean).join(' · ');
const sellerOpts = sel => (S.settings.sellers || []).map(s => `<option ${s===sel?'selected':''}>${esc(s)}</option>`).join('') || '<option value="">—</option>';

/* ================= Supabase ================= */
const C = window.ER_CONFIG || {};
const configured = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY && !/YOUR-/.test(C.SUPABASE_URL + C.SUPABASE_ANON_KEY) && window.supabase);
const sb = configured ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { auth:{ persistSession:true, autoRefreshToken:true } }) : null;
async function q(p){ const { data, error } = await p; if (error) throw error; return data; }
const photoUrl = path => path ? `${C.SUPABASE_URL}/storage/v1/object/public/products/${path.split('/').map(encodeURIComponent).join('/')}` : '';

async function loadTable(name){
  if (name === 'products') { S.products = await q(sb.from('products').select('*').order('name')); S.loaded = true; }
  else if (name === 'customers') S.customers = await q(sb.from('customers').select('*').order('created_at', { ascending:false }).limit(5000));
  else if (name === 'fleet') S.fleet = await q(sb.from('fleet').select('*'));
  else if (name === 'sales') S.sales = await q(sb.from('sales').select('*').order('created_at', { ascending:false }).limit(1000));
  else if (name === 'rentals') S.rentals = await q(sb.from('rentals').select('*').order('created_at', { ascending:false }).limit(500));
  else if (name === 'settings') { const d = await q(sb.from('settings').select('*').eq('id', 1).maybeSingle()); if (d) S.settings = { sellers:[], tariffs:[], ...d }; }
}
const TABLES = ['products','customers','fleet','sales','rentals','settings'];
async function reload(...names){ try { await Promise.all(names.map(loadTable)); } catch(e){ console.error(e); } if (S.user) render(); }
const pending = {}; let channel = null;
function scheduleReload(name){ clearTimeout(pending[name]); pending[name] = setTimeout(() => reload(name), 350); }
function subscribeLive(){
  if (channel) return;
  channel = sb.channel('er-live');
  TABLES.forEach(tb => channel.on('postgres_changes', { event:'*', schema:'public', table:tb }, () => scheduleReload(tb)));
  channel.subscribe();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.user) reload(...TABLES); });
window.addEventListener('offline', () => { $('banner').textContent = t('offline'); $('banner').hidden = false; });
window.addEventListener('online', () => { $('banner').hidden = true; if (S.user) reload(...TABLES); });

/* ================= auth ================= */
async function boot(){
  applyI18n();
  if (!sb) { $('gate-body').innerHTML = `<div class="banner">${esc(t('not_configured'))}</div>`; return; }
  try { if (ls.get('er-temp') === '1' && !sessionStorage.getItem('er-alive')) await sb.auth.signOut(); } catch(e){}
  try { await loadTable('settings'); } catch(e){ console.error(e); }
  const { data:{ session } } = await sb.auth.getSession();
  if (session) await afterLogin(); else renderGate();
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && S.user) showGate(); });
}
function renderGate(){
  const names = S.settings.sellers || [], last = ls.get('er-name') || '';
  $('gate-body').innerHTML = `<h2>${esc(t('login_title'))}</h2><form id="g-login" class="stack">
    ${names.length ? `<label class="f">${esc(t('who_are_you'))}<select id="g-name">${names.map(n => `<option ${n===last?'selected':''}>${esc(n)}</option>`).join('')}</select></label>` : ''}
    <label class="f">${esc(t('password'))}<input id="g-pw" type="password" autocomplete="current-password" required></label>
    <label class="row small muted"><input type="checkbox" id="g-rem" checked> ${esc(t('remember'))}</label>
    <div id="g-err" class="err" hidden></div>
    <button class="btn primary big" id="g-btn">${esc(t('login_btn'))}</button></form>`;
  $('g-login').onsubmit = async e => {
    e.preventDefault();
    const pw = $('g-pw').value, er = $('g-err'), btn = $('g-btn'); er.hidden = true; btn.disabled = true;
    try {
      let ok = false;
      for (const email of [C.STAFF_EMAIL, C.ADMIN_EMAIL]) {
        const { error } = await sb.auth.signInWithPassword({ email, password: pw });
        if (!error) { ok = true; break; }
      }
      if (!ok) { er.textContent = navigator.onLine ? t('wrong_pw') : t('offline'); er.hidden = false; $('g-pw').select(); return; }
      ls.set('er-name', $('g-name')?.value || '');
      if ($('g-rem').checked) ls.set('er-temp', null); else { ls.set('er-temp', '1'); try { sessionStorage.setItem('er-alive', '1'); } catch(e){} }
      await afterLogin();
    } catch(err){ console.error(err); er.textContent = t('save_failed'); er.hidden = false; }
    finally { btn.disabled = false; }
  };
}
async function afterLogin(){
  let role = null;
  try { role = await q(sb.rpc('my_role')); } catch(e){ console.error(e); }
  if (!role) { await sb.auth.signOut(); renderGate(); $('g-err').textContent = t('no_access_account'); $('g-err').hidden = false; return; }
  S.user = { role: role === 'admin' ? 'admin' : 'consultant', name: ls.get('er-name') || (S.settings.sellers || [])[0] || '' };
  $('gate').hidden = true; $('app').hidden = false;
  S.tab = 'sale'; renderAll();
  await reload(...TABLES);
  subscribeLive();
}
function showGate(){ S.user = null; S.cart = []; $('app').hidden = true; $('gate').hidden = false; renderGate(); }
$('logout').onclick = async () => { ls.set('er-temp', null); try { await sb.auth.signOut(); } catch(e){} showGate(); };

/* ================= tabs ================= */
const ICONS = {
  sale:'<path d="M3 7h18l-2 11H5L3 7z"/><path d="M8 7a4 4 0 0 1 8 0"/>',
  stock:'<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  rent:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  customers:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  report:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'
};
function buildTabs(){
  const tabs = isAdmin() ? ['sale','stock','rent','customers','report','settings'] : ['sale','stock','rent','customers'];
  $('tabs').innerHTML = tabs.map(k => `<button data-tab="${k}" role="tab" aria-selected="${k===S.tab}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg><span>${esc(t('tab_' + k))}</span></button>`).join('');
  ['sale','stock','rent','customers','report','settings'].forEach(k => $('v-' + k).hidden = k !== S.tab);
  $('p-add').hidden = !isAdmin();
}
$('tabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.tab = b.dataset.tab; closeSheet(); buildTabs(); render(); window.scrollTo(0, 0); };
function typeChips(el, cur, onPick, counts){
  const keys = TYPE_KEYS.filter(k => counts[k]);
  el.innerHTML = `<button class="chip" aria-pressed="${!cur}" data-t="">${esc(t('all'))}</button>` + keys.map(k => `<button class="chip" aria-pressed="${cur===k}" data-t="${k}">${esc(tType(k))} <span class="num">${counts[k]}</span></button>`).join('');
  el.onclick = e => { const b = e.target.closest('.chip'); if (b) onPick(b.dataset.t); };
}
const match = (p, qq) => !qq || [p.name, p.brand, p.color, p.code, p.year, tType(p.type), p.note].join(' ').toLowerCase().includes(qq.toLowerCase());

/* ================= images ================= */
function compressImage(file, max = 1400, quality = .82){
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => b ? res(b) : rej(new Error('encode')), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('decode')); };
    img.src = url;
  });
}
async function uploadBlob(bucket, path, blob){
  await q(sb.storage.from(bucket).upload(path, blob, { contentType:'image/jpeg', upsert:false, cacheControl:'31536000' }));
  return path;
}
function openOv(html){ $('ov').innerHTML = `<div class="panel pad stack">${html}</div>`; $('ov').hidden = false; document.body.style.overflow = 'hidden'; $('ov').querySelectorAll('[data-close]').forEach(b => b.onclick = closeOv); }
function closeOv(){ $('ov').hidden = true; $('ov').innerHTML = ''; document.body.style.overflow = ''; }
$('ov').onclick = e => { if (e.target === $('ov')) closeOv(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('ov').hidden) closeOv(); else closeSheet(); } });
function showGallery(p){
  if (!p?.photos?.length) return;
  openOv(`<div class="row between"><h2>${esc(pName(p))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div>
    ${p.photos.map(ph => `<img class="big" src="${esc(photoUrl(ph))}" alt="${esc(pName(p))}" loading="lazy">`).join('')}`);
}
async function viewIdPhoto(path){
  if (!path) return;
  openOv(`<div class="row between"><h2>${esc(t('cust_photo'))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div><div id="ph-box" class="muted">${esc(t('loading'))}</div>`);
  try { const d = await q(sb.storage.from('id-photos').createSignedUrl(path, 600)); const b = $('ph-box'); if (b) b.innerHTML = `<img class="big" src="${esc(d.signedUrl)}" alt="${esc(t('cust_photo'))}">`; }
  catch(e){ fail(e); }
}

/* ================= customer picker ================= */
const PICK = {};
const custMatch = (c, qq) => [c.name, c.phone, c.id_number].join(' ').toLowerCase().includes(qq.toLowerCase());
const freshPick = () => ({ mode:'search', id:null, draft:{ name:'', phone:'', id_number:'' }, photo:null, preview:'', q:'' });
function mountPicker(boxId, force){
  const st = PICK[boxId] ??= freshPick();
  const box = $(boxId);
  // a background refresh must not wipe what someone is typing
  if (!force && box.dataset.mode === st.mode && box.contains(document.activeElement)) { if (st.mode === 'search') pickerResults(boxId); return; }
  box.dataset.mode = st.mode;
  if (st.mode === 'selected') {
    const c = S.customers.find(x => x.id === st.id); if (!c) { st.mode = 'search'; return mountPicker(boxId, true); }
    box.innerHTML = `<div class="cust"><div class="row between" style="align-items:flex-start;flex-wrap:nowrap"><div style="min-width:0"><b>${esc(c.name)}</b>
      <div class="small muted">${esc([c.phone, c.id_number].filter(Boolean).join(' · '))}</div>
      <div class="small" style="margin-top:4px">${st.photo ? `<span class="tag">${esc(t('cust_photo_new'))}</span>` : c.photo ? `<button type="button" class="btn ghost small" data-act="view" style="padding-left:0">${esc(t('cust_photo_view'))}</button>` : `<span class="tag out">${esc(t('cust_no_photo'))}</span>`}</div></div>
      <button type="button" class="btn small" data-act="change">${esc(t('cust_change'))}</button></div>
      <label class="btn small" style="align-self:flex-start">${esc(t('cust_photo_add'))}<input type="file" accept="image/*" capture="environment" data-act="file" hidden></label></div>`;
  } else if (st.mode === 'new') {
    box.innerHTML = `<div class="cust"><div class="formgrid two">
      <label class="f">${esc(t('cust_name'))}<input data-k="name" value="${esc(st.draft.name)}" autocomplete="off"></label>
      <label class="f">${esc(t('cust_phone'))}<input data-k="phone" type="tel" value="${esc(st.draft.phone)}" autocomplete="off"></label>
      <label class="f" style="grid-column:1/-1">${esc(t('cust_idnum'))}<input data-k="id_number" value="${esc(st.draft.id_number)}" autocomplete="off"></label></div>
      <div class="row">${st.preview ? `<img class="thumb" src="${st.preview}" alt="">` : ''}<label class="btn small">${esc(t('cust_photo_add'))}<input type="file" accept="image/*" capture="environment" data-act="file" hidden></label>
      <button type="button" class="btn ghost small" data-act="back">${esc(t('cust_back'))}</button></div></div>`;
  } else {
    box.innerHTML = `<div class="cust"><div class="row" style="flex-wrap:nowrap"><input type="search" data-act="q" value="${esc(st.q)}" placeholder="${esc(t('cust_search_ph'))}">
      <button type="button" class="btn small" data-act="new">${esc(t('cust_new'))}</button></div><div class="res"></div></div>`;
    pickerResults(boxId);
  }
  if (!box.dataset.wired) {
    box.dataset.wired = 1;
    box.addEventListener('click', e => {
      const a = e.target.closest('[data-act]')?.dataset.act, s = PICK[boxId];
      if (a === 'new') { const digits = /^[\d+ ]+$/.test(s.q); Object.assign(s, { mode:'new', photo:null, preview:'', draft:{ name: digits ? '' : s.q, phone: digits ? s.q : '', id_number:'' } }); mountPicker(boxId, true); box.querySelector('[data-k="name"]')?.focus(); }
      else if (a === 'back' || a === 'change') { Object.assign(s, { mode:'search', id:null, photo:null, preview:'' }); mountPicker(boxId, true); }
      else if (a === 'pick') { Object.assign(s, { mode:'selected', id:e.target.closest('[data-id]').dataset.id, photo:null, preview:'' }); mountPicker(boxId, true); }
      else if (a === 'view') viewIdPhoto(S.customers.find(x => x.id === s.id)?.photo);
    });
    box.addEventListener('input', e => { const s = PICK[boxId]; if (e.target.dataset.act === 'q') { s.q = e.target.value; pickerResults(boxId); } else if (e.target.dataset.k) s.draft[e.target.dataset.k] = e.target.value; });
    box.addEventListener('change', async e => {
      if (e.target.dataset.act !== 'file' || !e.target.files[0]) return;
      const s = PICK[boxId]; toast(t('photo_saving'));
      try { s.photo = await compressImage(e.target.files[0], 1600, .8); s.preview = URL.createObjectURL(s.photo); mountPicker(boxId, true); } catch(err){ console.error(err); toast(t('photo_fail')); }
    });
  }
}
function pickerResults(boxId){
  const st = PICK[boxId], res = $(boxId).querySelector('.res'); if (!res) return;
  const qq = st.q.trim(); if (!qq) { res.innerHTML = ''; return; }
  const list = S.customers.filter(c => custMatch(c, qq)).slice(0, 6);
  res.innerHTML = list.length ? list.map(c => `<button type="button" data-act="pick" data-id="${c.id}"><b>${esc(c.name)}</b> <span class="small muted">${esc([c.phone, c.id_number].filter(Boolean).join(' · '))}</span></button>`).join('') : `<div class="small muted">${esc(t('nothing_found'))}</div>`;
}
async function saveIdPhoto(custId, blob){
  const path = `${custId}/${Date.now()}.jpg`;
  await uploadBlob('id-photos', path, blob);
  await q(sb.from('customers').update({ photo: path }).eq('id', custId));
  return path;
}
/* returns {id,name,phone} or null; throws Error('name') when a new customer has no name */
async function resolveCustomer(boxId){
  const st = PICK[boxId]; if (!st) return null;
  if (st.mode === 'selected') {
    const c = S.customers.find(x => x.id === st.id); if (!c) return null;
    if (st.photo) await saveIdPhoto(c.id, st.photo);
    return { id:c.id, name:c.name, phone:c.phone || '' };
  }
  if (st.mode === 'new') {
    const d = { name: st.draft.name.trim(), phone: st.draft.phone.trim(), id_number: st.draft.id_number.trim() };
    if (!d.name) { if (!d.phone && !d.id_number && !st.photo) return null; throw new Error('name'); }
    const row = await q(sb.from('customers').insert({ ...d, created_by: S.user?.name || '' }).select().single());
    S.customers.unshift(row);
    if (st.photo) await saveIdPhoto(row.id, st.photo);
    return { id:row.id, name:row.name, phone:row.phone || '' };
  }
  return null;
}
function resetPicker(boxId){ PICK[boxId] = freshPick(); mountPicker(boxId, true); }

/* ================= sale ================= */
function renderSale(){
  const counts = {}; S.products.forEach(p => counts[p.type] = (counts[p.type] || 0) + 1);
  typeChips($('s-types'), S.sType, x => { S.sType = x; renderSale(); }, counts);
  const qq = $('s-q').value.trim();
  const list = S.products.filter(p => (!S.sType || p.type === S.sType) && match(p, qq)).sort((a, b) => ((b.qty > 0) - (a.qty > 0)) || pName(a).localeCompare(pName(b)));
  $('s-list').innerHTML = !S.loaded ? `<div class="empty">${esc(t('loading'))}</div>`
    : !S.products.length ? `<div class="empty" style="grid-column:1/-1">${esc(t(isAdmin() ? 'stock_empty_admin' : 'stock_empty'))}</div>`
    : !list.length ? `<div class="empty" style="grid-column:1/-1">${esc(t('nothing_found'))}</div>`
    : list.map(p => {
      const inCart = S.cart.filter(l => l.productId === p.id).reduce((a, l) => a + l.qty, 0), left = (+p.qty || 0) - inCart;
      const tag = left <= 0 ? `<span class="tag out">${esc(t('out'))}</span>` : `<span class="tag ${left <= 1 ? 'low' : ''}">${left} ${esc(t('pcs'))}</span>`;
      const ph = p.photos?.[0];
      return `<div class="pcard ${left <= 0 ? 'dis' : ''}" data-id="${p.id}" role="button" tabindex="${left <= 0 ? -1 : 0}" aria-disabled="${left <= 0}">
        <div class="ph">${ph ? `<img src="${esc(photoUrl(ph))}" alt="" loading="lazy">` : esc(t('cust_no_photo'))}</div>
        ${p.photos?.length > 1 ? `<button type="button" class="gal" data-gal="${p.id}">${esc(t('photos'))} ${p.photos.length}</button>` : ''}
        <div class="bd"><span class="nm">${esc(pName(p))}</span><span class="meta">${esc(pMeta(p))}</span>
        ${p.note ? `<span class="meta" style="color:var(--warn)">${esc(p.note)}</span>` : ''}
        <span class="pr"><span class="num">${+p.price ? money(p.price) : esc(t('negotiable'))}</span>${tag}</span></div></div>`;
    }).join('');
  renderCart();
}
$('s-q').oninput = () => renderSale();
function addToCart(id){
  const p = S.products.find(x => x.id === id); if (!p) return;
  const inCart = S.cart.filter(l => l.productId === p.id).reduce((a, l) => a + l.qty, 0);
  if (inCart >= (+p.qty || 0)) return;
  const ex = S.cart.find(l => l.productId === p.id);
  if (ex) ex.qty++; else S.cart.push({ key:uid(), productId:p.id, name:pName(p), type:p.type, listPrice:+p.price || 0, unitPrice:+p.price || 0, qty:1, pct:0 });
  renderSale(); toast(pName(p) + ' +1');
}
$('s-list').onclick = e => {
  const g = e.target.closest('[data-gal]'); if (g) { e.stopPropagation(); return showGallery(S.products.find(x => x.id === g.dataset.gal)); }
  const c = e.target.closest('.pcard'); if (c && !c.classList.contains('dis')) addToCart(c.dataset.id);
};
$('s-list').onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('pcard')) { e.preventDefault(); if (!e.target.classList.contains('dis')) addToCart(e.target.dataset.id); } };
$('s-custom').onclick = () => {
  S.cart.push({ key:uid(), productId:null, name:'', type:'other', listPrice:0, unitPrice:0, qty:1, pct:0, custom:true });
  openSheet(); renderCart(); const ins = $('c-lines').querySelectorAll('input[data-k="name"]'); ins[ins.length - 1]?.focus();
};
$('c-clear').onclick = () => { S.cart = []; $('c-disc').value = 0; resetPicker('c-cust'); renderSale(); };
const lineTotal = l => r2(l.qty * l.unitPrice * (1 - (+l.pct || 0) / 100));
function cartTotals(){ const sub = S.cart.reduce((a, l) => a + lineTotal(l), 0), list = S.cart.reduce((a, l) => a + l.qty * l.listPrice, 0), extra = Math.max(0, +$('c-disc').value || 0); return { sub, list, extra, total: r2(Math.max(0, sub - extra)) }; }
function renderCart(){
  $('c-seller').innerHTML = sellerOpts($('c-seller').value || S.user?.name);
  if (!PICK['c-cust']) mountPicker('c-cust');
  if (S.cart.length && document.activeElement?.closest('#c-lines') && $('c-lines').querySelectorAll('.line').length === S.cart.length) { updTotals(); return; }
  $('c-lines').innerHTML = !S.cart.length ? `<div class="empty small">${esc(t('pick_hint'))}</div>` : S.cart.map(l => `<div class="line" data-key="${l.key}">
    <div style="min-width:0">${l.custom ? `<input data-k="name" placeholder="${esc(t('what_sold'))}" value="${esc(l.name)}">` : `<b>${esc(l.name)}</b><div class="small muted">${esc(tType(l.type))}${l.listPrice ? ' · ' + esc(t('list_price')) + ' ' + money(l.listPrice) : ''}</div>`}</div>
    <div style="text-align:right"><div class="num" data-out="tot">${money(lineTotal(l))}</div><button class="btn ghost small" data-act="rm">${esc(t('remove'))}</button></div>
    <div class="ctl"><label>${esc(t('qty'))}<input data-k="qty" type="number" min="1" step="1" value="${l.qty}" inputmode="numeric"></label>
      <label>${esc(t('unit_price'))}<input data-k="unitPrice" type="number" min="0" step="1" value="${l.unitPrice}" inputmode="decimal"></label>
      <label>${esc(t('disc_pct'))}<input data-k="pct" type="number" min="0" max="100" step="1" value="${l.pct}" inputmode="decimal"></label></div></div>`).join('');
  updTotals();
}
$('c-lines').oninput = e => {
  const row = e.target.closest('.line'), k = e.target.dataset.k; if (!row || !k) return;
  const l = S.cart.find(x => x.key === row.dataset.key);
  if (k === 'name') l.name = e.target.value;
  else { let v = +e.target.value || 0; if (k === 'qty') v = Math.max(1, Math.round(v)); if (k === 'pct') v = Math.min(100, Math.max(0, v)); l[k] = v; }
  row.querySelector('[data-out="tot"]').textContent = money(lineTotal(l)); updTotals();
};
$('c-lines').onchange = e => { if (e.target.dataset.k === 'qty') { e.target.blur(); renderSale(); } };
$('c-lines').onclick = e => { if (e.target.dataset.act !== 'rm') return; const key = e.target.closest('.line').dataset.key; S.cart = S.cart.filter(l => l.key !== key); renderSale(); };
$('c-disc').oninput = updTotals;
function updTotals(){
  const x = cartTotals(), saved = x.list - x.total, n = S.cart.reduce((a, l) => a + l.qty, 0);
  $('c-total').textContent = money(x.total);
  $('c-sub').textContent = S.cart.length ? (saved > 0.004 && x.list ? `${t('discount')} ${money(saved)}` : `${n} ${t('units')}`) : '';
  $('c-save').disabled = !S.cart.length;
  $('cartbar').hidden = !S.cart.length; $('cb-count').textContent = `${n} ${t('units')}`; $('cb-total').textContent = money(x.total);
}
function openSheet(){ $('receipt').classList.add('open'); }
function closeSheet(){ $('receipt').classList.remove('open'); }
$('cartbar').onclick = openSheet; $('c-close').onclick = closeSheet;
$('c-save').onclick = async () => {
  if (!S.cart.length) return;
  if (S.cart.some(l => l.custom && !l.name.trim())) { toast(t('enter_name')); return; }
  const btn = $('c-save'); btn.disabled = true;
  try {
    let cust = null;
    try { cust = await resolveCustomer('c-cust'); } catch(e){ if (e.message === 'name') { toast(t('cust_need_name')); return; } throw e; }
    const x = cartTotals();
    const lines = S.cart.map(l => ({ product_id:l.productId, name:l.name.trim(), type:l.type, list_price:l.listPrice, unit_price:r2(l.unitPrice), qty:l.qty, pct:+l.pct || 0 }));
    await q(sb.rpc('record_sale', { p_lines:lines, p_extra:x.extra, p_seller:$('c-seller').value, p_payment:$('c-pay').value, p_customer:cust?.id || null, p_note:$('c-note').value.trim() }));
    S.cart = []; $('c-disc').value = 0; $('c-note').value = ''; resetPicker('c-cust'); closeSheet();
    toast(t('sale_saved') + ' · ' + money(x.total));
    await reload('products', 'sales', 'customers');
  } catch(e){ fail(e); } finally { updTotals(); }
};

/* ================= stock ================= */
function renderStock(){
  const counts = {}; S.products.forEach(p => counts[p.type] = (counts[p.type] || 0) + 1);
  typeChips($('p-types'), S.pType, x => { S.pType = x; renderStock(); }, counts);
  const units = S.products.reduce((a, p) => a + (+p.qty || 0), 0), value = S.products.reduce((a, p) => a + (+p.qty || 0) * (+p.price || 0), 0);
  const out = S.products.filter(p => !(+p.qty > 0)).length, veh = S.products.filter(p => VEH.includes(p.type)).reduce((a, p) => a + (+p.qty || 0), 0);
  $('p-stats').innerHTML = [['st_units', units], ['st_vehicles', veh], ['st_value', money(value)], ['st_out', out]].map(([k, v]) => `<div class="panel stat"><h3>${esc(t(k))}</h3><div class="v num">${v}</div></div>`).join('');
  const qq = $('p-q').value.trim(), only = $('p-instock').checked, adm = isAdmin();
  const list = S.products.filter(p => (!S.pType || p.type === S.pType) && match(p, qq) && (!only || +p.qty > 0)).sort((a, b) => (a.type || '').localeCompare(b.type || '') || pName(a).localeCompare(pName(b)));
  if (!S.loaded) { $('p-list').innerHTML = `<div class="empty">${esc(t('loading'))}</div>`; return; }
  if (!list.length) { $('p-list').innerHTML = `<div class="empty">${esc(t(S.products.length ? 'nothing_found' : (adm ? 'stock_empty_admin' : 'stock_empty')))}</div>`; return; }
  $('p-list').innerHTML = list.map(p => `<div class="item" data-id="${p.id}">
    <button class="ph" data-act="gal" aria-label="${esc(t('photos'))}">${p.photos?.[0] ? `<img src="${esc(photoUrl(p.photos[0]))}" alt="" loading="lazy">` : esc(t('cust_no_photo'))}</button>
    <div style="min-width:0"><b>${esc(pName(p))}</b><div class="small muted">${esc(pMeta(p))}${p.code ? ' · ' + esc(p.code) : ''}</div>
      ${p.note ? `<div class="small" style="color:var(--warn)">${esc(p.note)}</div>` : ''}<div class="num" style="font-weight:700;margin-top:2px">${+p.price ? money(p.price) : esc(t('negotiable'))}</div></div>
    <div class="side">${adm ? `<span class="qtyctl"><button data-act="dec" aria-label="−">−</button><span class="num" style="min-width:24px;text-align:center">${+p.qty || 0}</span><button data-act="inc" aria-label="+">+</button></span>` : `<span class="tag ${+p.qty > 0 ? '' : 'out'}">${+p.qty || 0} ${esc(t('pcs'))}</span>`}
      ${adm ? `<span class="acts"><button class="btn ghost small" data-act="edit">${esc(t('edit'))}</button><button class="btn ghost small danger" data-act="del">${esc(t('remove'))}</button></span>` : ''}</div></div>`).join('');
}
$('p-q').oninput = renderStock; $('p-instock').onchange = renderStock;
$('p-list').onclick = async e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const p = S.products.find(x => x.id === b.closest('.item').dataset.id); if (!p) return;
  const act = b.dataset.act;
  if (act === 'gal') return p.photos?.length ? showGallery(p) : (isAdmin() && openProduct(p));
  if (!isAdmin()) return;
  if (act === 'edit') return openProduct(p);
  if (act === 'del') return arm(b, async () => {
    try { await q(sb.from('products').delete().eq('id', p.id)); if (p.photos?.length) sb.storage.from('products').remove(p.photos).catch(() => {}); toast(t('deleted')); await reload('products'); } catch(err){ fail(err); }
  });
  try { const nq = Math.max(0, (+p.qty || 0) + (act === 'inc' ? 1 : -1)); p.qty = nq; renderStock(); await q(sb.from('products').update({ qty:nq, updated_at:new Date().toISOString() }).eq('id', p.id)); } catch(err){ fail(err); reload('products'); }
};
$('p-add').onclick = () => openProduct(null);
function openProduct(p){
  const v = p || { type:'moped', qty:1, photos:[] };
  let photos = (v.photos || []).map(path => ({ path }));
  const fld = (k, lab, extra = '') => `<label class="f">${esc(t(lab))}<input id="pf-${k}" value="${esc(v[k] ?? '')}" ${extra}></label>`;
  openOv(`<form id="pf" class="stack"><div class="row between"><h2>${esc(t(p ? 'edit_item' : 'new_item'))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div>
    <div><div class="small muted" style="font-weight:600;margin-bottom:6px">${esc(t('photos'))}</div><div class="phgrid" id="pf-ph"></div></div>
    <div class="formgrid"><label class="f" style="grid-column:1/-1">${esc(t('f_name'))}<input id="pf-name" required value="${esc(v.name || '')}" placeholder="Honda Dio / LS2 …"></label>
      <label class="f">${esc(t('f_type'))}<select id="pf-type">${TYPE_KEYS.map(k => `<option value="${k}" ${v.type === k ? 'selected' : ''}>${esc(tType(k))}</option>`).join('')}</select></label>
      ${fld('price', 'f_price', 'type="number" min="0" step="1" inputmode="decimal"')}${fld('qty', 'f_qty', 'type="number" min="0" step="1" inputmode="numeric"')}
      ${fld('brand', 'f_brand')}${fld('year', 'f_year', 'inputmode="numeric"')}${fld('color', 'f_color')}${fld('engine', 'f_engine', 'placeholder="49 cc / 1200 W"')}${fld('code', 'f_code')}
      <label class="f" style="grid-column:1/-1">${esc(t('note'))}<input id="pf-note" value="${esc(v.note || '')}"></label></div>
    <div id="pf-err" class="err" hidden></div>
    <button class="btn primary big" type="submit" id="pf-save">${esc(t('save'))}</button></form>`);
  const drawPhotos = () => {
    $('pf-ph').innerHTML = photos.map((ph, i) => `<div class="p"><img src="${esc(ph.preview || photoUrl(ph.path))}" alt=""><button type="button" data-rm="${i}" aria-label="${esc(t('remove_photo'))}">×</button></div>`).join('')
      + `<label class="add">${esc(t('add_photos'))}<input type="file" accept="image/*" multiple hidden id="pf-file"></label>`;
    $('pf-file').onchange = async e => {
      const files = [...e.target.files].slice(0, 8); if (!files.length) return; toast(t('photo_saving'));
      for (const f of files) { try { const blob = await compressImage(f); photos.push({ blob, preview:URL.createObjectURL(blob) }); } catch(err){ toast(t('photo_fail')); } }
      drawPhotos();
    };
  };
  drawPhotos();
  $('pf-ph').onclick = e => { const b = e.target.closest('[data-rm]'); if (b) { photos.splice(+b.dataset.rm, 1); drawPhotos(); } };
  $('pf').onsubmit = async e => {
    e.preventDefault();
    const g = k => $('pf-' + k).value.trim(), btn = $('pf-save'); btn.disabled = true;
    try {
      if (photos.some(x => x.blob)) toast(t('uploading'));
      const paths = [];
      for (const ph of photos) paths.push(ph.path || await uploadBlob('products', `p/${uid()}.jpg`, ph.blob));
      const data = { name:g('name'), type:g('type'), brand:g('brand'), year:g('year'), color:g('color'), engine:g('engine'), code:g('code'),
        price:Math.max(0, +g('price') || 0), qty:Math.max(0, Math.round(+g('qty') || 0)), note:g('note'), photos:paths, updated_at:new Date().toISOString() };
      if (p) await q(sb.from('products').update(data).eq('id', p.id)); else await q(sb.from('products').insert(data));
      const removed = (v.photos || []).filter(x => !paths.includes(x));
      if (removed.length) sb.storage.from('products').remove(removed).catch(() => {});
      closeOv(); toast(t('saved')); await reload('products');
    } catch(err){ fail(err); btn.disabled = false; }
  };
}

/* ================= rent ================= */
const curTariff = () => (S.settings.tariffs || [])[+$('r-type').value];
function renderRent(){
  const T = S.settings.tariffs || [], curT = $('r-type').value;
  $('r-type').innerHTML = T.map((x, i) => `<option value="${i}" ${String(i) === curT ? 'selected' : ''}>${esc(tType(x.type))}</option>`).join('');
  fillRates(false); fillUnits();
  $('r-seller').innerHTML = sellerOpts($('r-seller').value || S.user?.name);
  mountPicker('r-cust');
  const act = S.rentals.filter(r => r.status === 'active');
  $('r-active').innerHTML = act.length ? act.map(r => `<div class="tariff" data-id="${r.id}"><div style="min-width:0"><b>${esc(tType(r.type))}</b>${r.unit_label ? ` · ${esc(r.unit_label)}` : ''} · ${esc(rateLabel(r.rate))}
      <div class="small muted">${esc(r.customer_name || '')} ${esc(r.phone || '')} · ${esc(t('started'))} ${fmtTs(r.created_at)}${+r.deposit ? ` · ${esc(t('deposit'))} ${money(r.deposit)}` : ''}</div></div>
      <div style="text-align:right"><div class="num">${money(r.price)}</div><button class="btn small" data-act="ret">${esc(t('returned_btn'))}</button></div></div>`).join('')
    : `<div class="empty small">${esc(t('nothing_rented'))}</div>`;
  const done = S.rentals.filter(r => r.status !== 'active').slice(0, 50);
  $('r-history').innerHTML = `<div class="pad"><h3>${esc(t('rent_recent'))}</h3></div>` + (done.length ? `<table><thead><tr><th>${esc(t('col_time'))}</th><th>${esc(t('col_vehicle'))}</th><th>${esc(t('col_customer'))}</th><th>${esc(t('seller'))}</th><th class="r">${esc(t('col_amount'))}</th></tr></thead><tbody>${done.map(r => `<tr><td class="num">${fmtTs(r.created_at)}</td><td>${esc(tType(r.type))}${r.unit_label ? ` · ${esc(r.unit_label)}` : ''} · ${esc(rateLabel(r.rate))}</td><td>${esc(r.customer_name || '—')}</td><td>${esc(r.seller || '')}</td><td class="r num">${money(r.price)}</td></tr>`).join('')}</tbody></table>` : `<div class="empty small">${esc(t('rent_none_done'))}</div>`);
}
function fillRates(setPrice = true){
  const x = curTariff(), cur = $('r-rate').value;
  $('r-rate').innerHTML = (x?.rates || []).map((r, i) => `<option value="${i}" ${String(i) === cur ? 'selected' : ''}>${esc(rateLabel(r))} — ${money(r.p)}</option>`).join('') + `<option value="x" ${cur === 'x' ? 'selected' : ''}>${esc(t('other_duration'))}</option>`;
  if (setPrice || $('r-price').value === '') { const r = x?.rates?.[+$('r-rate').value]; if (r) $('r-price').value = r.p; }
}
function fillUnits(){
  const x = curTariff(), cur = $('r-unit').value;
  const busy = new Set(S.rentals.filter(r => r.status === 'active' && r.unit_id).map(r => r.unit_id));
  const units = S.fleet.filter(f => x && f.type === x.type).sort((a, b) => fleetLabel(a).localeCompare(fleetLabel(b), undefined, { numeric:true }));
  $('r-unit').innerHTML = `<option value="">${esc(t('choose_unit'))}</option>` + units.map(f => `<option value="${f.id}" ${busy.has(f.id) ? 'disabled' : ''} ${f.id === cur && !busy.has(f.id) ? 'selected' : ''}>${esc(fleetLabel(f))}${busy.has(f.id) ? ' — ' + esc(t('rented_tag')) : ''}</option>`).join('');
  $('r-unit-hint').hidden = !!units.length; $('r-unit-hint').textContent = t('unit_none');
}
$('r-type').onchange = () => { $('r-rate').value = '0'; fillRates(true); fillUnits(); };
$('r-rate').onchange = () => fillRates(true);
$('r-save').onclick = async () => {
  const x = curTariff(); if (!x) return;
  const f = S.fleet.find(y => y.id === $('r-unit').value);
  if (S.fleet.some(y => y.type === x.type) && !f) { toast(t('need_unit')); return; }
  const btn = $('r-save'); btn.disabled = true;
  try {
    let cust = null;
    try { cust = await resolveCustomer('r-cust'); } catch(e){ if (e.message === 'name') { toast(t('cust_need_name')); return; } throw e; }
    if (!cust) { toast(t('need_customer')); return; }
    const rv = $('r-rate').value, r = x.rates?.[+rv];
    await q(sb.from('rentals').insert({ type:x.type, rate: rv === 'x' ? { other:true } : r ? { n:r.n, u:r.u, p:r.p } : null,
      price:r2($('r-price').value), deposit:r2($('r-dep').value), unit_id:f?.id || null, unit_label:f ? fleetLabel(f) : '',
      customer_id:cust.id, customer_name:cust.name, phone:cust.phone, seller:$('r-seller').value, payment:$('r-pay').value, created_by:S.user?.name || '' }));
    $('r-dep').value = 0; $('r-unit').value = ''; resetPicker('r-cust'); toast(t('rent_started'));
    await reload('rentals', 'customers');
  } catch(e){ fail(e); } finally { btn.disabled = false; }
};
$('r-active').onclick = async e => {
  const b = e.target.closest('[data-act="ret"]'); if (!b) return; b.disabled = true;
  try { await q(sb.from('rentals').update({ status:'returned', returned_at:new Date().toISOString() }).eq('id', b.closest('[data-id]').dataset.id)); toast(t('return_saved')); await reload('rentals'); }
  catch(err){ fail(err); b.disabled = false; }
};

/* ================= customers ================= */
function renderCustomers(){
  const qq = $('k-q').value.trim(), list = S.customers.filter(c => !qq || custMatch(c, qq));
  const nS = {}, nR = {};
  S.sales.forEach(s => s.customer_id && (nS[s.customer_id] = (nS[s.customer_id] || 0) + 1));
  S.rentals.forEach(r => r.customer_id && (nR[r.customer_id] = (nR[r.customer_id] || 0) + 1));
  $('k-list').innerHTML = !list.length ? `<div class="empty">${esc(t(S.customers.length ? 'nothing_found' : 'cust_none'))}</div>` : list.slice(0, 300).map(c => `<div class="citem" data-id="${c.id}">
    <div style="min-width:0"><b>${esc(c.name)}</b><div class="small muted num">${esc([c.phone, c.id_number].filter(Boolean).join(' · ') || '—')}</div>
      <div class="small muted">${esc(t('cust_purchases'))}: <span class="num">${nS[c.id] || 0}</span> · ${esc(t('cust_rentals'))}: <span class="num">${nR[c.id] || 0}</span></div></div>
    <div class="acts row" style="justify-content:flex-end;gap:2px">${c.photo ? `<button class="btn ghost small" data-act="view">${esc(t('cust_photo_view'))}</button>` : `<span class="tag out">${esc(t('cust_no_photo'))}</span>`}
      <button class="btn ghost small" data-act="edit">${esc(t('edit'))}</button>${isAdmin() ? `<button class="btn ghost small danger" data-act="del">${esc(t('remove'))}</button>` : ''}</div></div>`).join('');
}
$('k-q').oninput = renderCustomers;
$('k-add').onclick = () => openCustomer(null);
$('k-list').onclick = e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const c = S.customers.find(x => x.id === b.closest('[data-id]').dataset.id); if (!c) return;
  if (b.dataset.act === 'view') viewIdPhoto(c.photo);
  if (b.dataset.act === 'edit') openCustomer(c);
  if (b.dataset.act === 'del' && isAdmin()) arm(b, async () => {
    try { await q(sb.from('customers').delete().eq('id', c.id)); if (c.photo) sb.storage.from('id-photos').remove([c.photo]).catch(() => {}); toast(t('deleted')); await reload('customers'); } catch(err){ fail(err); }
  });
};
function openCustomer(c){
  let photo = null;
  openOv(`<form id="kf" class="stack"><div class="row between"><h2>${esc(t(c ? 'edit_customer' : 'cust_new'))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div>
    <div class="formgrid two"><label class="f">${esc(t('cust_name'))}<input id="kf-name" required value="${esc(c?.name || '')}"></label>
      <label class="f">${esc(t('cust_phone'))}<input id="kf-phone" type="tel" value="${esc(c?.phone || '')}"></label>
      <label class="f" style="grid-column:1/-1">${esc(t('cust_idnum'))}<input id="kf-id" value="${esc(c?.id_number || '')}"></label></div>
    <div class="row"><span id="kf-ph">${c?.photo ? `<button type="button" class="btn ghost small" id="kf-view">${esc(t('cust_photo_view'))}</button>` : `<span class="tag out">${esc(t('cust_no_photo'))}</span>`}</span>
      <label class="btn small">${esc(t('cust_photo_add'))}<input type="file" id="kf-file" accept="image/*" capture="environment" hidden></label></div>
    <button class="btn primary big" type="submit" id="kf-save">${esc(t('save'))}</button></form>`);
  if ($('kf-view')) $('kf-view').onclick = () => viewIdPhoto(c.photo);
  $('kf-file').onchange = async e => { if (!e.target.files[0]) return; toast(t('photo_saving')); try { photo = await compressImage(e.target.files[0], 1600, .8); $('kf-ph').innerHTML = `<img class="thumb" src="${URL.createObjectURL(photo)}" alt="">`; } catch(err){ toast(t('photo_fail')); } };
  $('kf').onsubmit = async e => {
    e.preventDefault();
    const d = { name:$('kf-name').value.trim(), phone:$('kf-phone').value.trim(), id_number:$('kf-id').value.trim() }; if (!d.name) return;
    const btn = $('kf-save'); btn.disabled = true;
    try {
      let id = c?.id;
      if (c) await q(sb.from('customers').update(d).eq('id', c.id));
      else id = (await q(sb.from('customers').insert({ ...d, created_by:S.user?.name || '' }).select().single())).id;
      if (photo) await saveIdPhoto(id, photo);
      closeOv(); toast(t('saved')); await reload('customers');
    } catch(err){ fail(err); btn.disabled = false; }
  };
}

/* ================= report ================= */
const PERIODS = ['today','yesterday','week','month','all'];
function periodRange(){
  const n = new Date();
  if (S.period === 'custom') return [$('rp-from').value || '0000', $('rp-to').value || '9999'];
  if (S.period === 'today') return [dayKey(n), dayKey(n)];
  if (S.period === 'yesterday') { const y = new Date(n); y.setDate(y.getDate() - 1); return [dayKey(y), dayKey(y)]; }
  if (S.period === 'week') { const w = new Date(n); w.setDate(w.getDate() - 6); return [dayKey(w), dayKey(n)]; }
  if (S.period === 'month') return [dayKey(new Date(n.getFullYear(), n.getMonth(), 1)), dayKey(n)];
  return ['0000', '9999'];
}
function renderReport(){
  $('rp-period').innerHTML = PERIODS.map(k => `<button class="chip" aria-pressed="${S.period === k}" data-p="${k}">${esc(t('p_' + k))}</button>`).join('');
  const [a, b] = periodRange(), inR = x => x.day >= a && x.day <= b;
  const sales = S.sales.filter(inR), rents = S.rentals.filter(inR);
  const rev = sales.reduce((s, x) => s + (+x.total || 0), 0), rentRev = rents.reduce((s, x) => s + (+x.price || 0), 0);
  const disc = sales.reduce((s, x) => s + Math.max(0, (+x.list_total || 0) - (+x.total || 0)), 0);
  const units = sales.reduce((s, x) => s + (x.lines || []).reduce((qq, l) => qq + (+l.qty || 0), 0), 0);
  $('rp-stats').innerHTML = [['rs_sales_rev', money(rev)], ['rs_rent_rev', money(rentRev)], ['rs_count', sales.length + ' / ' + units], ['rs_disc', money(disc)]].map(([k, v]) => `<div class="panel stat"><h3>${esc(t(k))}</h3><div class="v num">${v}</div></div>`).join('');
  const bs = {}, g = k => bs[k] ??= { n:0, veh:0, sum:0, rent:0 };
  sales.forEach(s => { const o = g(s.seller || '—'); o.n++; o.sum += +s.total || 0; o.veh += (s.lines || []).filter(l => VEH.includes(l.type)).reduce((qq, l) => qq + (+l.qty || 0), 0); });
  rents.forEach(r => { g(r.seller || '—').rent += +r.price || 0; });
  const sk = Object.keys(bs).sort((x, y) => bs[y].sum - bs[x].sum);
  $('rp-sellers').innerHTML = sk.length ? `<table><thead><tr><th>${esc(t('seller'))}</th><th class="r">${esc(t('col_sales'))}</th><th class="r">${esc(t('col_veh'))}</th><th class="r">${esc(t('col_sum'))}</th><th class="r">${esc(t('col_rent'))}</th></tr></thead><tbody>${sk.map(k => `<tr><td>${esc(k)}</td><td class="r num">${bs[k].n}</td><td class="r num">${bs[k].veh}</td><td class="r num">${money(bs[k].sum)}</td><td class="r num">${money(bs[k].rent)}</td></tr>`).join('')}</tbody></table>` : `<div class="empty small">${esc(t('no_records'))}</div>`;
  const bt = {}; sales.forEach(s => (s.lines || []).forEach(l => { const o = bt[l.type || 'other'] ??= { q:0, sum:0 }; o.q += +l.qty || 0; o.sum += +l.total || 0; }));
  const tk = Object.keys(bt).sort((x, y) => bt[y].sum - bt[x].sum);
  $('rp-types').innerHTML = tk.length ? `<table><thead><tr><th>${esc(t('col_type'))}</th><th class="r">${esc(t('col_units'))}</th><th class="r">${esc(t('col_sum'))}*</th></tr></thead><tbody>${tk.map(k => `<tr><td>${esc(tType(k))}</td><td class="r num">${bt[k].q}</td><td class="r num">${money(bt[k].sum)}</td></tr>`).join('')}</tbody></table><div class="pad small muted">${esc(t('excl_extra'))}</div>` : `<div class="empty small">${esc(t('no_records'))}</div>`;
  $('rp-sales').innerHTML = sales.length ? `<table><thead><tr><th>${esc(t('col_time'))}</th><th>${esc(t('col_items'))}</th><th>${esc(t('seller'))}</th><th>${esc(t('payment'))}</th><th class="r">${esc(t('col_amount'))}</th><th></th></tr></thead><tbody>${sales.map(s => `<tr data-id="${s.id}"><td class="num">${fmtTs(s.created_at)}</td>
    <td>${(s.lines || []).map(l => `${esc(l.name)}${l.qty > 1 ? ` ×${l.qty}` : ''}${+l.unit_price !== +l.list_price && +l.list_price ? ` <span class="strike">${money(l.list_price)}</span>` : ''}${+l.pct ? ` <span class="tag low">−${+l.pct}%</span>` : ''}`).join('<br>')}${s.customer_name ? `<div class="small muted">${esc(s.customer_name)} ${esc(s.phone || '')}</div>` : ''}${s.note ? `<div class="small muted">${esc(s.note)}</div>` : ''}</td>
    <td>${esc(s.seller || '')}</td><td>${esc(tPay(s.payment))}</td><td class="r num"><b>${money(s.total)}</b>${+s.extra_discount ? `<div class="small muted">−${money(s.extra_discount)}</div>` : ''}</td>
    <td><button class="btn ghost small danger" data-act="void">${esc(t('void'))}</button></td></tr>`).join('')}</tbody></table>` : `<div class="empty small">${esc(t('no_records'))}</div>`;
}
$('rp-period').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; S.period = b.dataset.p; $('rp-from').value = ''; $('rp-to').value = ''; renderReport(); };
$('rp-from').onchange = $('rp-to').onchange = () => { S.period = 'custom'; renderReport(); };
$('rp-sales').onclick = e => {
  const b = e.target.closest('[data-act="void"]'); if (!b || !isAdmin()) return;
  const id = b.closest('tr').dataset.id;
  arm(b, async () => { try { await q(sb.rpc('void_sale', { p_id:id })); toast(t('voided')); await reload('sales', 'products'); } catch(err){ fail(err); } });
};

/* ================= settings ================= */
function renderSettings(){
  const sl = S.settings.sellers || [];
  $('st-sellers').innerHTML = sl.length ? sl.map((s, i) => `<div class="tariff"><span>${esc(s)}</span><button class="btn ghost small danger" data-i="${i}">${esc(t('remove'))}</button></div>`).join('') : `<div class="small muted">${esc(t('no_sellers'))}</div>`;
  const ft = $('fl-type').value; $('fl-type').innerHTML = RENTABLE.map(k => `<option value="${k}" ${k === ft ? 'selected' : ''}>${esc(tType(k))}</option>`).join('');
  const fl = [...S.fleet].sort((a, b) => (a.type + fleetLabel(a)).localeCompare(b.type + fleetLabel(b), undefined, { numeric:true }));
  $('st-fleet').innerHTML = fl.length ? fl.map(f => `<div class="tariff" data-id="${f.id}"><span><span class="tag">${esc(tType(f.type))}</span> ${esc(fleetLabel(f))}</span><button class="btn ghost small danger" data-act="del">${esc(t('remove'))}</button></div>`).join('') : `<div class="small muted">${esc(t('fleet_empty'))}</div>`;
  if (!document.activeElement?.closest('#st-tariffs'))
    $('st-tariffs').innerHTML = (S.settings.tariffs || []).map((x, ti) => `<div style="margin-bottom:12px"><b>${esc(tType(x.type))}</b>${x.rates.map((r, ri) => `<div class="tariff"><span>${esc(rateLabel(r))}</span><input class="num" type="number" min="0" data-t="${ti}" data-r="${ri}" value="${r.p}" inputmode="decimal" aria-label="${esc(rateLabel(r))}"></div>`).join('')}</div>`).join('');
}
async function saveSettings(patch){ try { await q(sb.from('settings').update({ ...patch, updated_at:new Date().toISOString() }).eq('id', 1)); toast(t('saved')); await reload('settings'); } catch(e){ fail(e); } }
$('st-add').onclick = () => { const n = $('st-new').value.trim(); if (!n) return; $('st-new').value = ''; saveSettings({ sellers:[...(S.settings.sellers || []), n] }); };
$('st-sellers').onclick = e => { const b = e.target.closest('[data-i]'); if (b) arm(b, () => saveSettings({ sellers:S.settings.sellers.filter((_, i) => i !== +b.dataset.i) })); };
$('st-save-t').onclick = () => { const T = JSON.parse(JSON.stringify(S.settings.tariffs || [])); $('st-tariffs').querySelectorAll('input').forEach(i => { T[+i.dataset.t].rates[+i.dataset.r].p = Math.max(0, +i.value || 0); }); saveSettings({ tariffs:T }); };
$('fl-add').onclick = async () => {
  const d = { type:$('fl-type').value, model:$('fl-model').value.trim(), color:$('fl-color').value.trim(), number:$('fl-num').value.trim() };
  if (!d.model && !d.number) { $('fl-model').focus(); return; }
  try { await q(sb.from('fleet').insert(d)); $('fl-num').value = ''; $('fl-num').focus(); toast(t('saved')); await reload('fleet'); } catch(e){ fail(e); }
};
$('st-fleet').onclick = e => { const b = e.target.closest('[data-act="del"]'); if (!b) return; const id = b.closest('[data-id]').dataset.id; arm(b, async () => { try { await q(sb.from('fleet').delete().eq('id', id)); toast(t('deleted')); await reload('fleet'); } catch(err){ fail(err); } }); };
$('pw-save').onclick = async () => {
  const a = $('pw-admin').value, c = $('pw-cons').value; if (!a && !c) return;
  if ((a && a.length < 6) || (c && c.length < 6)) { toast(t('pw_short')); return; }
  if (a && c && a === c) { toast(t('pw_same')); return; }
  const btn = $('pw-save'); btn.disabled = true;
  try {
    if (c) await q(sb.rpc('admin_set_password', { p_role:'consultant', p_password:c }));
    if (a) await q(sb.rpc('admin_set_password', { p_role:'admin', p_password:a }));
    $('pw-admin').value = ''; $('pw-cons').value = ''; toast(t('pw_changed'));
  } catch(e){ fail(e); } finally { btn.disabled = false; }
};

/* ================= render ================= */
function render(){ if (!S.user) return; ({ sale:renderSale, stock:renderStock, rent:renderRent, customers:renderCustomers, report:renderReport, settings:renderSettings })[S.tab](); }
function renderAll(){
  applyI18n(); buildTabs();
  $('who-name').textContent = S.user?.name || '';
  $('who-role').textContent = S.user ? t(isAdmin() ? 'role_admin' : 'role_cons') : '';
  $('who-role').className = 'role' + (isAdmin() ? ' admin' : '');
  ['c-cust','r-cust'].forEach(id => mountPicker(id));
  render();
}

boot();
})();
