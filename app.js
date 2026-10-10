/* Easyride POS — app logic (vanilla JS + Supabase) */
(() => {
'use strict';

/* ================= helpers ================= */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const r2 = n => Math.round((+n || 0) * 100) / 100;
const CUR_SIGN = { GEL:'₾', USD:'$', EUR:'€' };
const money = (n, cur) => { n = r2(n); const s = Math.abs(n).toFixed(n % 1 ? 2 : 0).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return (n < 0 ? '−' : '') + s + ' ' + (CUR_SIGN[cur || 'GEL'] || cur); };
/* sums kept per currency, e.g. { GEL: 5200, USD: 800 } → "5 200 ₾ + 800 $" */
const addCur = (acc, cur, n) => { cur = cur || 'GEL'; acc[cur] = (acc[cur] || 0) + (+n || 0); return acc; };
const moneyMulti = acc => { const ks = Object.keys(acc).filter(k => acc[k]).sort((a, b) => (a !== 'GEL') - (b !== 'GEL')); return ks.length ? ks.map(k => money(acc[k], k)).join(' + ') : money(0); };
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
/* the same lookups in a chosen language (the agreement can be in another language than the screen) */
const langIdx = lg => Math.max(0, LANGS.findIndex(l => l[0] === lg));
const tL = (k, lg) => { const a = L[k]; return a ? (a[langIdx(lg)] ?? a[0]) : k; };
function rateLabel(r, lg = LANG){
  if (!r) return '';
  if (r.other) return tL('other_duration', lg);
  const u = UNITS[r.u]; if (!u) return r.d || '';
  const w = u[langIdx(lg)];
  if (lg === 'ja') return r.n + w;
  if (lg === 'en' && (r.u === 'd' || r.u === 'w') && r.n > 1) return r.n + ' ' + w + 's';
  return r.n + ' ' + w;
}
function applyI18n(){
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-i]').forEach(el => el.textContent = t(el.dataset.i));
  document.querySelectorAll('[data-iph]').forEach(el => el.placeholder = t(el.dataset.iph));
  document.querySelectorAll('[data-i-title]').forEach(el => { el.title = t(el.dataset.iTitle); el.setAttribute('aria-label', el.title); });
  ['lang-g','lang-a'].forEach(id => $(id).innerHTML = LANGS.map(([k,n]) => `<option value="${k}" ${k===LANG?'selected':''}>${n}</option>`).join(''));
  ['c-pay','r-pay'].forEach(id => { const v = $(id).value; $(id).innerHTML = PAYS.filter(p => id === 'c-pay' || p !== 'installment').map(p => `<option value="${p}" ${p===v?'selected':''}>${esc(tPay(p))}</option>`).join(''); });
}
function setLang(l){ LANG = l; ls.set('er-lang', l); applyI18n(); if (S.user) renderAll(); else renderGate(); }
$('lang-g').onchange = e => setLang(e.target.value);
$('lang-a').onchange = e => setLang(e.target.value);

/* ================= light / dark ================= */
const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
const darkMQ = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
const curTheme = () => document.documentElement.dataset.theme || (darkMQ?.matches ? 'dark' : 'light');
function paintTheme(){
  const dark = curTheme() === 'dark';
  document.querySelectorAll('.theme-btn').forEach(b => b.innerHTML = dark ? SUN : MOON);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#18221c' : '#16231d');
}
document.querySelectorAll('.theme-btn').forEach(b => b.onclick = () => {
  const next = curTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next; ls.set('er-theme', next); paintTheme();
});
darkMQ?.addEventListener?.('change', paintTheme);
paintTheme();

/* ================= state ================= */
const S = { products:[], sales:[], rentals:[], customers:[], fleet:[], staff:[], settings:{ sellers:[], tariffs:[] },
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
  if (/bad_pin/.test(m)) return toast(t('pin_wrong'));
  if (/bad_old_password/.test(m)) return toast(t('pw_old_wrong'));
  if (/name_taken/.test(m)) return toast(t('name_taken'));
  if (/name_required/.test(m)) return toast(t('enter_name'));
  if (/not_self/.test(m)) return toast(t('not_self'));
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
const photoUrl = path => !path ? '' : /^https?:\/\//.test(path) ? path : `${C.SUPABASE_URL}/storage/v1/object/public/products/${path.split('/').map(encodeURIComponent).join('/')}`;
const isOwnPhoto = path => path && !/^https?:\/\//.test(path);

async function loadTable(name){
  if (name === 'products') { S.products = await q(sb.from('products').select('*').order('name')); S.loaded = true; }
  else if (name === 'customers') S.customers = await q(sb.from('customers').select('*').order('created_at', { ascending:false }).limit(5000));
  else if (name === 'fleet') S.fleet = await q(sb.from('fleet').select('*'));
  else if (name === 'sales') S.sales = await q(sb.from('sales').select('*').order('created_at', { ascending:false }).limit(1000));
  else if (name === 'rentals') S.rentals = await q(sb.from('rentals').select('*').order('created_at', { ascending:false }).limit(500));
  else if (name === 'staff') S.staff = isAdmin() ? await q(sb.from('staff').select('*')) : [];
  else if (name === 'settings') { const d = await q(sb.from('settings').select('*').eq('id', 1).maybeSingle()); if (d) S.settings = { sellers:[], tariffs:[], ...d }; }
}
const TABLES = ['products','customers','fleet','sales','rentals','settings','staff'];
async function reload(...names){ try { await Promise.all(names.map(loadTable)); } catch(e){ console.error(e); } if (S.user) render(); }
const pending = {}; let channel = null;
function scheduleReload(name){ clearTimeout(pending[name]); pending[name] = setTimeout(() => reload(name), 350); }
function subscribeLive(){
  if (channel) return;
  channel = sb.channel('er-live');
  TABLES.filter(tb => tb !== 'staff').forEach(tb => channel.on('postgres_changes', { event:'*', schema:'public', table:tb }, () => scheduleReload(tb)));
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
/* login: choose admin or seller, then your own name and password */
let LOGIN = null;
const STAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.8l2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.2l-5.62 2.9 1.07-6.27L2.9 9.4l6.3-.9z"/></svg>';
const PERSON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
async function renderGate(){
  if (!LOGIN) { try { LOGIN = await q(sb.rpc('login_list')) || []; } catch(e){ console.error(e); LOGIN = []; } }
  if (!LOGIN.length) return renderGateOld();
  let role = ls.get('er-grole') === 'admin' ? 'admin' : 'consultant';
  const paint = () => {
    const list = LOGIN.filter(x => x.role === role), last = ls.get('er-gemail');
    $('gate-body').innerHTML = `<h2>${esc(t('login_title'))}</h2><form id="g-login" class="stack">
      <div class="rolepick" role="radiogroup">${[['admin', STAR, 'role_admin'], ['consultant', PERSON, 'role_cons']].map(([k, ic, l]) => `<button type="button" class="rp ${k === 'admin' ? 'adm' : ''}" data-r="${k}" aria-pressed="${role === k}">${ic}<span>${esc(t(l))}</span></button>`).join('')}</div>
      ${list.length ? '' : `<div class="small muted">${esc(t('no_accounts'))}</div>`}
      <label class="f">${esc(t('password'))}<input id="g-pw" type="password" autocomplete="current-password" required></label>
      <label class="row small muted"><input type="checkbox" id="g-rem" checked> ${esc(t('remember'))}</label>
      <div id="g-err" class="err" hidden></div>
      <button class="btn primary big" id="g-btn" ${list.length ? '' : 'disabled'}>${esc(t('login_btn'))}</button></form>`;
    $('gate-body').querySelectorAll('[data-r]').forEach(b => b.onclick = () => { role = b.dataset.r; ls.set('er-grole', role); paint(); $('g-pw')?.focus(); });
    $('g-login').onsubmit = async e => {
      e.preventDefault();
      // everyone has a personal password, so the password itself tells who is logging in
      const pw = $('g-pw').value, er = $('g-err'), btn = $('g-btn'); if (!list.length || !pw) return;
      const emails = list.map(x => x.email).sort((a, b) => (b === last) - (a === last));
      er.hidden = true; btn.disabled = true;
      try {
        let email = null;
        for (const em of emails) { const { error } = await sb.auth.signInWithPassword({ email:em, password:pw }); if (!error) { email = em; break; } }
        if (!email) { er.textContent = navigator.onLine ? t('wrong_pw') : t('offline'); er.hidden = false; $('g-pw').select(); return; }
        ls.set('er-gemail', email);
        if ($('g-rem').checked) ls.set('er-temp', null); else { ls.set('er-temp', '1'); try { sessionStorage.setItem('er-alive', '1'); } catch(e){} }
        sb.rpc('log_login').then(() => {}, () => {});
        await afterLogin();
      } catch(err){ console.error(err); er.textContent = t('save_failed'); er.hidden = false; }
      finally { btn.disabled = false; }
    };
  };
  paint();
}
function renderGateOld(){
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
  let me = null; try { me = await q(sb.rpc('my_profile')); } catch(e){ console.error(e); }
  S.user = { role: role === 'admin' ? 'admin' : 'consultant', email: me?.email || '', phone: me?.phone || '',
    name: me?.name || ls.get('er-name') || (S.settings.sellers || [])[0] || '' };
  $('gate').hidden = true; $('app').hidden = false;
  S.tab = 'sale'; renderAll();
  await reload(...TABLES);
  subscribeLive();
}
function showGate(){ S.user = null; S.cart = []; LOGIN = null; $('app').hidden = true; $('gate').hidden = false; renderGate(); }
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
const isSimple = () => document.documentElement.classList.contains('simple');
function paintMode(){
  const mb = $('mode-btn'), lab = t(isSimple() ? 'mode_full' : 'mode_simple');
  // shows where the button takes you: a monitor = full version, a phone = simple version
  mb.innerHTML = isSimple()
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18h2"/></svg>';
  mb.title = lab; mb.setAttribute('aria-label', lab);
  document.querySelectorAll('details.more').forEach(d => { d.open = true; });
}
$('mode-btn').onclick = () => { document.documentElement.classList.toggle('simple'); ls.set('er-mode', isSimple() ? 'simple' : 'full'); document.querySelectorAll('details.more').forEach(d => delete d.dataset.touched); paintMode(); buildTabs(); render(); };
document.querySelectorAll('details.more > summary').forEach(s => s.addEventListener('click', () => { s.parentElement.dataset.touched = 1; }));
function buildTabs(){
  let tabs = isAdmin() ? ['sale','stock','rent','customers','report','settings'] : ['sale','stock','rent','customers'];
  if (isSimple()) tabs = ['sale','rent'];
  if (!tabs.includes(S.tab)) S.tab = 'sale';
  paintMode();
  $('tabs').innerHTML = tabs.map(k => `<button data-tab="${k}" role="tab" aria-selected="${k===S.tab}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg><span>${esc(t('tab_' + k))}</span></button>`).join('');
  ['sale','stock','rent','customers','report','settings'].forEach(k => $('v-' + k).hidden = k !== S.tab);
  $('p-add').hidden = $('p-add-veh').hidden = !isAdmin();
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
async function uploadBlob(bucket, path, blob, type = 'image/jpeg'){
  await q(sb.storage.from(bucket).upload(path, blob, { contentType:type, upsert:false, cacheControl:'31536000' }));
  return path;
}
function openOv(html, cls = ''){ $('ov').innerHTML = `<div class="panel pad stack ${cls}">${html}</div>`; $('ov').hidden = false; document.body.style.overflow = 'hidden'; $('ov').querySelectorAll('[data-close]').forEach(b => b.onclick = closeOv); }
function closeOv(){ $('ov').hidden = true; $('ov').innerHTML = ''; document.body.style.overflow = ''; }
$('ov').onclick = e => { if (e.target === $('ov')) closeOv(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('ov').hidden) closeOv(); else closeSheet(); } });
function showGallery(p){
  if (!p) return;
  const specs = Object.entries(p.specs || {}).filter(([, v]) => v);
  openOv(`<div class="row between" style="flex-wrap:nowrap"><h2>${esc(pName(p))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div>
    <div class="row between"><span class="muted">${esc(pMeta(p))}</span><b class="num" style="font-size:20px">${+p.price ? money(p.price) : esc(t('negotiable'))}</b></div>
    ${p.photos?.length ? `<div class="gallery">${p.photos.map(ph => `<img src="${esc(photoUrl(ph))}" alt="${esc(pName(p))}" loading="lazy">`).join('')}</div>` : ''}
    ${specs.length ? `<dl class="specs">${specs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
    ${p.note ? `<p class="small" style="color:var(--warn);margin:0">${esc(p.note)}</p>` : ''}`);
}
async function viewIdPhoto(path){
  if (!path) return;
  openOv(`<div class="row between"><h2>${esc(t('cust_photo'))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div><div id="ph-box" class="muted">${esc(t('loading'))}</div>`);
  try { const d = await q(sb.storage.from('id-photos').createSignedUrl(path, 600)); const b = $('ph-box'); if (b) b.innerHTML = `<img class="big" src="${esc(d.signedUrl)}" alt="${esc(t('cust_photo'))}">`; }
  catch(e){ fail(e); }
}

/* ================= document scan (passport / ID) ================= */
let ocrWorker = null;
const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); });
async function getOcr(){
  if (ocrWorker) return ocrWorker;
  if (!window.Tesseract) await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
  ocrWorker = await window.Tesseract.createWorker('eng', 1);
  return ocrWorker;
}
async function bitmapOf(blob){
  if (window.createImageBitmap) { try { return await createImageBitmap(blob, { imageOrientation:'from-image' }); } catch(e){} }
  return new Promise((res, rej) => { const i = new Image(), u = URL.createObjectURL(blob); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = rej; i.src = u; });
}
// the photo turned by rot degrees and scaled to ~width px, greyed where the browser can
function prep(bmp, rot, width){
  const W = bmp.width, H = bmp.height, sw = rot ? H : W, sh = rot ? W : H, k = Math.min(width / sw, 3);
  const c = document.createElement('canvas'), x = c.getContext('2d');
  c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  if ('filter' in x) x.filter = 'grayscale(1)';
  x.translate(c.width / 2, c.height / 2); x.rotate(rot * Math.PI / 180);
  x.drawImage(bmp, -W * k / 2, -H * k / 2, W * k, H * k);
  return c;
}
function crop(c, top, h){
  if (top === 0 && h === 1) return c;
  const o = document.createElement('canvas'); o.width = c.width; o.height = Math.round(c.height * h);
  o.getContext('2d').drawImage(c, 0, Math.round(c.height * top), c.width, o.height, 0, 0, o.width, o.height);
  return o;
}
const goodMrz = r => r && r.checks.filter(Boolean).length >= 2 && (r.surname || r.birth);
async function readDocument(file){
  const w = await getOcr(), bmp = await bitmapOf(file);
  const MRZ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';
  const tries = [[.5, .5, 2000, 0], [0, 1, 1700, 0], [0, 1, 1700, 90], [0, 1, 1700, -90]];
  await w.setParameters({ tessedit_char_whitelist:MRZ_CHARS });
  let best = null;
  for (const [top, h, width, rot] of tries) {
    const { data } = await w.recognize(crop(prep(bmp, rot, width), top, h));
    const r = window.MRZ.parse(data.text);
    if (r && (!best || r.score > best.score)) best = r;
    if (goodMrz(best) && best.valid) break;
  }
  if (goodMrz(best)) return best;
  // front side of a Georgian ID card: at least the 11-digit personal number
  await w.setParameters({ tessedit_char_whitelist:'' });
  const { data } = await w.recognize(prep(bmp, 0, 1700));
  const pn = window.MRZ.personalFromText(data.text);
  return pn ? { partial:true, personal:pn, kind:'id', nationality:'GEO' } : null;
}
const titleCase = s => String(s || '').toLowerCase().replace(/(^|[\s-])\S/g, m => m.toUpperCase());
function ageOf(iso){
  if (!iso) return null; const b = new Date(iso + 'T00:00'), n = new Date();
  if (isNaN(b)) return null; let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}
const fmtDate = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('.') : '';
function ageChip(c){
  const a = ageOf(c?.birth_date), exp = c?.doc_expiry && c.doc_expiry < dayKey(new Date());
  return (a != null ? `<span class="agechip ${a < 18 ? 'minor' : ''}">${esc(t('age_n').replace('{n}', a))}${a < 18 ? ' · ' + esc(t('minor_warn')) : ''}</span>` : '')
    + (exp ? ` <span class="agechip bad">${esc(t('doc_expired'))}</span>` : '');
}
const custLine = c => [c.phone, c.id_number, c.nationality, c.birth_date && fmtDate(c.birth_date)].filter(Boolean).join(' · ');

/* ================= customer picker ================= */
const PICK = {};
const custMatch = (c, qq) => [c.name, c.phone, c.id_number].join(' ').toLowerCase().includes(qq.toLowerCase());
const EMPTY_DRAFT = () => ({ name:'', phone:'', id_number:'', birth_date:'', nationality:'', doc_type:'', doc_expiry:'' });
const freshPick = () => ({ mode:'search', id:null, draft:EMPTY_DRAFT(), patch:null, photo:null, preview:'', q:'', msg:null });
const scanBtn = () => `<label class="btn small scan">${esc(t('scan_id'))}<input type="file" accept="image/*" capture="environment" data-act="scan" hidden></label>`
  + `<label class="btn small scan up">${esc(t('upload_id'))}<input type="file" accept="image/*" data-act="scan" hidden></label>`;
const photoBtns = (style = '') => `<span class="row" style="gap:6px;${style}"><label class="btn small">${esc(t('cust_photo_add'))}<input type="file" accept="image/*" capture="environment" data-act="file" hidden></label>`
  + `<label class="btn small">${esc(t('upload_photo'))}<input type="file" accept="image/*" data-act="file" hidden></label></span>`;
const msgHtml = st => st.msg ? `<div class="scanmsg ${st.msg[1]}">${esc(t(st.msg[0]))}</div>` : '';
function mountPicker(boxId, force){
  const st = PICK[boxId] ??= freshPick();
  const box = $(boxId);
  // a background refresh must not wipe what someone is typing
  if (!force && box.dataset.mode === st.mode && box.contains(document.activeElement)) { if (st.mode === 'search') pickerResults(boxId); return; }
  box.dataset.mode = st.mode;
  if (st.mode === 'selected') {
    const c0 = S.customers.find(x => x.id === st.id); if (!c0) { st.mode = 'search'; return mountPicker(boxId, true); }
    const c = { ...c0, ...Object.fromEntries(Object.entries(st.patch || {}).filter(([k, v]) => v && !c0[k])) };
    box.innerHTML = `<div class="cust"><div class="row between" style="align-items:flex-start;flex-wrap:nowrap"><div style="min-width:0"><b>${esc(c.name)}</b> ${ageChip(c)}
      <div class="small muted">${esc(custLine(c))}</div>
      <div class="small" style="margin-top:4px">${st.photo ? `<span class="tag">${esc(t('cust_photo_new'))}</span>` : c.photo ? `<button type="button" class="btn ghost small" data-act="view" style="padding-left:0">${esc(t('cust_photo_view'))}</button>` : `<span class="tag out">${esc(t('cust_no_photo'))}</span>`}</div></div>
      <button type="button" class="btn small" data-act="change">${esc(t('cust_change'))}</button></div>
      ${msgHtml(st)}
      ${photoBtns('align-self:flex-start')}</div>`;
  } else if (st.mode === 'new') {
    const d = st.draft;
    box.innerHTML = `<div class="cust"><div class="scanrow">${scanBtn()}${st.preview ? `<img class="thumb" src="${st.preview}" alt="">` : ''}</div>${msgHtml(st)}
      <div class="formgrid two">
      <label class="f" style="grid-column:1/-1">${esc(t('cust_name'))}<input data-k="name" value="${esc(d.name)}" autocomplete="off"></label>
      <label class="f">${esc(t('cust_idnum'))}<input data-k="id_number" value="${esc(d.id_number)}" autocomplete="off"></label>
      <label class="f">${esc(t('cust_phone'))}<input data-k="phone" type="tel" value="${esc(d.phone)}" autocomplete="off"></label>
      <label class="f">${esc(t('cust_birth'))} <span class="age-slot">${ageChip(d)}</span><input data-k="birth_date" type="date" value="${esc(d.birth_date)}"></label>
      <label class="f">${esc(t('cust_nat'))}<input data-k="nationality" value="${esc(d.nationality)}" autocomplete="off" maxlength="40"></label>
      <label class="f">${esc(t('cust_doc'))}<select data-k="doc_type"><option value=""></option>${['passport','id'].map(k => `<option value="${k}" ${d.doc_type === k ? 'selected' : ''}>${esc(t('doc_' + k))}</option>`).join('')}</select></label>
      <label class="f">${esc(t('doc_expiry'))}<input data-k="doc_expiry" type="date" value="${esc(d.doc_expiry)}"></label></div>
      <div class="row">${photoBtns()}
      <button type="button" class="btn ghost small" data-act="back">${esc(t('cust_back'))}</button></div></div>`;
  } else {
    box.innerHTML = `<div class="cust"><div class="row" style="flex-wrap:nowrap"><input type="search" data-act="q" value="${esc(st.q)}" placeholder="${esc(t('cust_search_ph'))}">
      <button type="button" class="btn small" data-act="new">${esc(t('cust_new'))}</button></div>
      <div class="scanrow">${scanBtn()}</div>${msgHtml(st)}<div class="res"></div></div>`;
    pickerResults(boxId);
  }
  if (!box.dataset.wired) {
    box.dataset.wired = 1;
    box.addEventListener('click', e => {
      const a = e.target.closest('[data-act]')?.dataset.act, s = PICK[boxId];
      if (a === 'new') { const digits = /^[\d+ ]+$/.test(s.q); Object.assign(s, { mode:'new', photo:null, preview:'', msg:null, draft:{ ...EMPTY_DRAFT(), name: digits ? '' : s.q, phone: digits ? s.q : '' } }); mountPicker(boxId, true); box.querySelector('[data-k="name"]')?.focus(); }
      else if (a === 'back' || a === 'change') { Object.assign(s, { mode:'search', id:null, photo:null, preview:'', patch:null, msg:null }); mountPicker(boxId, true); }
      else if (a === 'pick') { Object.assign(s, { mode:'selected', id:e.target.closest('[data-id]').dataset.id, photo:null, preview:'', patch:null, msg:null }); mountPicker(boxId, true); }
      else if (a === 'view') viewIdPhoto(S.customers.find(x => x.id === s.id)?.photo);
    });
    box.addEventListener('input', e => {
      const s = PICK[boxId], k = e.target.dataset.k;
      if (e.target.dataset.act === 'q') { s.q = e.target.value; pickerResults(boxId); }
      else if (k) { s.draft[k] = e.target.value; if (k === 'birth_date' || k === 'doc_expiry') { const sl = box.querySelector('.age-slot'); if (sl) sl.innerHTML = ageChip(s.draft); } }
    });
    box.addEventListener('change', async e => {
      const act = e.target.dataset.act, file = e.target.files?.[0];
      if (!file || (act !== 'file' && act !== 'scan')) return;
      const s = PICK[boxId];
      try { s.photo = await compressImage(file, 1600, .8); s.preview = URL.createObjectURL(s.photo); } catch(err){ console.error(err); toast(t('photo_fail')); }
      if (act === 'file') { mountPicker(boxId, true); return; }
      await scanInto(boxId, file);
    });
  }
}
async function scanInto(boxId, file){
  const s = PICK[boxId];
  if (s.mode === 'search') s.mode = 'new';
  s.msg = ['scanning', '']; mountPicker(boxId, true);
  let r = null;
  try { r = await readDocument(file); } catch(err){ console.error(err); }
  if (!r) { s.msg = ['scan_fail', 'bad']; if (s.mode !== 'selected') s.mode = 'new'; mountPicker(boxId, true); return; }
  const data = {
    name: r.partial ? '' : titleCase([r.given, r.surname].filter(Boolean).join(' ')),
    id_number: r.personal || r.number || '', birth_date: r.birth || '', nationality: r.nationality || '',
    doc_type: r.kind || '', doc_expiry: r.expiry || ''
  };
  const ids = [r.personal, r.number].filter(Boolean);
  const known = S.customers.find(c => c.id_number && ids.includes(String(c.id_number).replace(/\s/g, '')));
  if (known) Object.assign(s, { mode:'selected', id:known.id, patch:data, msg:['scan_existing', 'ok'] });
  else {
    const keep = s.mode === 'new' ? s.draft : EMPTY_DRAFT();
    s.mode = 'new';
    s.draft = { ...keep, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v)) };
    s.msg = r.partial || !r.valid ? ['scan_partial', ''] : ['scan_ok', 'ok'];
  }
  mountPicker(boxId, true);
  if (s.mode === 'new') $(boxId).querySelector(s.draft.name ? '[data-k="phone"]' : '[data-k="name"]')?.focus();
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
const CUST_EXTRA = ['birth_date','nationality','doc_type','doc_expiry'];
const nullDates = d => { ['birth_date','doc_expiry'].forEach(k => { if (k in d && !d[k]) d[k] = null; }); return d; };
/* returns the customer row or null; throws Error('name') when a new customer has no name */
async function resolveCustomer(boxId){
  const st = PICK[boxId]; if (!st) return null;
  if (st.mode === 'selected') {
    let c = S.customers.find(x => x.id === st.id); if (!c) return null;
    const fill = Object.fromEntries(Object.entries(st.patch || {}).filter(([k, v]) => v && (!c[k] || CUST_EXTRA.includes(k))));
    delete fill.name;
    if (Object.keys(fill).length) { c = await q(sb.from('customers').update(fill).eq('id', c.id).select().single()); }
    if (st.photo) await saveIdPhoto(c.id, st.photo);
    return c;
  }
  if (st.mode === 'new') {
    const d = Object.fromEntries(Object.entries(st.draft).map(([k, v]) => [k, String(v || '').trim()]));
    d.nationality = d.nationality.toUpperCase();
    if (!d.name) { if (!d.phone && !d.id_number && !st.photo) return null; throw new Error('name'); }
    const row = await q(sb.from('customers').insert(nullDates({ ...d, created_by: S.user?.name || '' })).select().single());
    S.customers.unshift(row);
    if (st.photo) await saveIdPhoto(row.id, st.photo);
    return row;
  }
  return null;
}
function resetPicker(boxId){ PICK[boxId] = freshPick(); mountPicker(boxId, true); }

/* ================= sale ================= */
const EASY = ['accessory','part','service','other'];
const isEasy = p => EASY.includes(p.type);
/* vehicles need the buyer with an ID photo; small goods are sold without a customer */
const cartNeedsCust = () => S.cart.some(l => !EASY.includes(l.type));
const hasIdPhoto = (boxId, c) => !!(PICK[boxId]?.photo || c?.photo);
/* phones / tablets: pick from drop-downs instead of the catalogue grid */
function renderSimplePick(){
  const easy = S.sKind === 'easy', qq = $('s-q').value.trim();
  const left = p => (+p.qty || 0) - S.cart.filter(l => l.productId === p.id).reduce((x, l) => x + l.qty, 0);
  $('sp-veh').hidden = easy; $('sp-easy').hidden = !easy;
  const avail = S.products.filter(p => (easy ? isEasy(p) : !isEasy(p)) && left(p) > 0);
  if (easy) {
    const list = avail.filter(p => match(p, qq)).sort((x, y) => String(x.code || '').localeCompare(String(y.code || ''), undefined, { numeric:true }) || pName(x).localeCompare(pName(y)));
    $('sp-item').innerHTML = `<option value="">${esc(t('sp_choose'))} (${list.length})</option>` + list.map(p => `<option value="${p.id}">${esc([p.code, pName(p)].filter(Boolean).join(' — '))} · ${+p.price ? money(p.price) : '—'} · ${left(p)} ${esc(t('pcs'))}</option>`).join('');
    return;
  }
  const types = VEH.filter(k => avail.some(p => p.type === k));
  if (!types.includes(S.spType)) S.spType = types[0] || '';
  $('sp-type').innerHTML = types.map(k => `<option value="${k}" ${k === S.spType ? 'selected' : ''}>${esc(tType(k))} (${avail.filter(p => p.type === k).length})</option>`).join('') || `<option value="">—</option>`;
  const list = avail.filter(p => p.type === S.spType && match(p, qq)).sort((x, y) => pName(x).localeCompare(pName(y)));
  $('sp-model').innerHTML = `<option value="">${esc(t('sp_choose'))} (${list.length})</option>` + list.map(p => `<option value="${p.id}">${esc([pName(p), p.color, p.year].filter(Boolean).join(' · '))} — ${+p.price ? money(p.price) : esc(t('negotiable'))}</option>`).join('');
}
$('sp-type').onchange = e => { S.spType = e.target.value; renderSale(); };
['sp-model','sp-item'].forEach(id => $(id).onchange = e => { const v = e.target.value; if (!v) return; addToCart(v); e.target.value = ''; });
function renderSale(){
  if (isSimple()) renderSimplePick();
  const easy = S.sKind === 'easy';
  $('s-kind').innerHTML = [['veh','kind_veh'],['easy','kind_easy']].map(([k, l]) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${(S.sKind || 'veh') === k}">${esc(t(l))}</button>`).join('');
  $('s-add-easy').hidden = !(easy && isAdmin());
  $('s-q').placeholder = t(easy ? 'easy_search' : 'search_items');
  const pool = S.products.filter(p => easy ? isEasy(p) : !isEasy(p));
  const counts = {}; pool.forEach(p => counts[p.type] = (counts[p.type] || 0) + 1);
  if (S.sType && !counts[S.sType]) S.sType = '';
  typeChips($('s-types'), S.sType, x => { S.sType = x; renderSale(); }, counts);
  const qq = $('s-q').value.trim(), ql = qq.toLowerCase();
  const list = pool.filter(p => (!S.sType || p.type === S.sType) && match(p, qq)).sort((a, b) =>
    (easy && qq ? (String(b.code || '').toLowerCase() === ql) - (String(a.code || '').toLowerCase() === ql) : 0) || ((b.qty > 0) - (a.qty > 0)) || pName(a).localeCompare(pName(b)));
  $('s-list').classList.toggle('elist', easy);
  if (easy && S.loaded) {
    $('s-list').innerHTML = !list.length ? `<div class="empty">${esc(t(pool.length ? 'nothing_found' : 'easy_empty'))}</div>` : list.map(p => {
      const inCart = S.cart.filter(l => l.productId === p.id).reduce((x, l) => x + l.qty, 0), left = (+p.qty || 0) - inCart;
      return `<div class="erow ${left <= 0 ? 'dis' : ''}" data-id="${p.id}" role="button" tabindex="${left <= 0 ? -1 : 0}" aria-disabled="${left <= 0}">
        <span class="code num">${esc(p.code || '—')}</span><span class="nm">${esc(pName(p))}${p.color ? ` <span class="muted small">${esc(p.color)}</span>` : ''}</span>
        <span class="num pr">${+p.price ? money(p.price) : '—'}</span><span class="tag ${left <= 0 ? 'out' : left <= 1 ? 'low' : ''}">${left <= 0 ? esc(t('out')) : left + ' ' + esc(t('pcs'))}</span>
        ${isAdmin() ? `<button type="button" class="btn ghost small" data-edit="${p.id}">${esc(t('edit'))}</button>` : ''}</div>`;
    }).join('');
    renderCart(); return;
  }
  $('s-list').innerHTML = !S.loaded ? `<div class="empty">${esc(t('loading'))}</div>`
    : !S.products.length ? `<div class="empty" style="grid-column:1/-1">${esc(t(isAdmin() ? 'stock_empty_admin' : 'stock_empty'))}</div>`
    : !list.length ? `<div class="empty" style="grid-column:1/-1">${esc(t('nothing_found'))}</div>`
    : list.map(p => {
      const inCart = S.cart.filter(l => l.productId === p.id).reduce((a, l) => a + l.qty, 0), left = (+p.qty || 0) - inCart;
      const tag = left <= 0 ? `<span class="tag out">${esc(t('out'))}</span>` : `<span class="tag ${left <= 1 ? 'low' : ''}">${left} ${esc(t('pcs'))}</span>`;
      const ph = p.photos?.[0];
      return `<div class="pcard ${left <= 0 ? 'dis' : ''}" data-id="${p.id}" role="button" tabindex="${left <= 0 ? -1 : 0}" aria-disabled="${left <= 0}">
        <div class="ph">${ph ? `<img src="${esc(photoUrl(ph))}" alt="" loading="lazy">` : esc(t('cust_no_photo'))}</div>
        <button type="button" class="gal" data-gal="${p.id}" aria-label="${esc(t('details'))}">${esc(t('details'))}${p.photos?.length > 1 ? ' · ' + p.photos.length : ''}</button>
        <div class="bd"><span class="nm">${esc(pName(p))}</span><span class="meta">${esc(pMeta(p))}</span>
        ${p.note ? `<span class="meta" style="color:var(--warn)">${esc(p.note)}</span>` : ''}
        <span class="pr"><span class="num">${+p.price ? money(p.price) : esc(t('negotiable'))}</span>${tag}</span></div></div>`;
    }).join('');
  renderCart();
}
$('s-q').oninput = () => renderSale();
$('s-kind').onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; S.sKind = b.dataset.k; S.sType = ''; $('s-q').value = ''; renderSale(); $('s-q').focus(); };
$('s-add-easy').onclick = () => openProduct(null, { type:'accessory', qty:1 });
// a scanner or typed code + Enter adds the item straight to the receipt
$('s-q').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const qq = $('s-q').value.trim().toLowerCase(); if (!qq) return;
  const p = S.products.find(x => String(x.code || '').toLowerCase() === qq);
  if (p) { e.preventDefault(); addToCart(p.id); $('s-q').value = ''; renderSale(); }
});
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
  const ed = e.target.closest('[data-edit]'); if (ed) { openProduct(S.products.find(p => p.id === ed.dataset.edit)); return; }
  const c = e.target.closest('.pcard, .erow'); if (c && !c.classList.contains('dis')) addToCart(c.dataset.id);
};
$('s-list').onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && (e.target.classList.contains('pcard') || e.target.classList.contains('erow'))) { e.preventDefault(); if (!e.target.classList.contains('dis')) addToCart(e.target.dataset.id); } };
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
  $('c-cust-wrap').hidden = !cartNeedsCust();
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
    if (cartNeedsCust()) {
      const st = PICK['c-cust'], pre = st?.mode === 'selected' ? S.customers.find(c => c.id === st.id) : null;
      if (!st || st.mode === 'search') { toast(t('need_customer')); return; }
      if (!hasIdPhoto('c-cust', pre)) { toast(t('need_id_photo')); return; }
      try { cust = await resolveCustomer('c-cust'); } catch(e){ if (e.message === 'name') { toast(t('cust_need_name')); return; } throw e; }
      if (!cust) { toast(t('need_customer')); return; }
    }
    const x = cartTotals();
    const lines = S.cart.map(l => ({ product_id:l.productId, name:l.name.trim(), type:l.type, list_price:l.listPrice, unit_price:r2(l.unitPrice), qty:l.qty, pct:+l.pct || 0 }));
    await q(sb.rpc('record_sale', { p_lines:lines, p_extra:x.extra, p_seller:$('c-seller').value, p_payment:$('c-pay').value, p_customer:cust?.id || null, p_note:$('c-note').value.trim() }));
    const repData = saleReportData({ lines, total:x.total, extra:x.extra, payment:$('c-pay').value, seller:$('c-seller').value, cust, note:$('c-note').value.trim(), date:new Date(), currency:'GEL' });
    S.cart = []; $('c-disc').value = 0; $('c-note').value = ''; resetPicker('c-cust'); closeSheet();
    toast(t('sale_saved') + ' · ' + money(x.total));
    await reload('products', 'sales', 'customers');
    showReport('sale', repData);
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
  if (act === 'gal') return showGallery(p);
  if (!isAdmin()) return;
  if (act === 'edit') return openProduct(p);
  if (act === 'del') return arm(b, async () => {
    try { await q(sb.from('products').delete().eq('id', p.id)); if (p.photos?.some(isOwnPhoto)) sb.storage.from('products').remove(p.photos.filter(isOwnPhoto)).catch(() => {}); toast(t('deleted')); await reload('products'); } catch(err){ fail(err); }
  });
  try { const nq = Math.max(0, (+p.qty || 0) + (act === 'inc' ? 1 : -1)); p.qty = nq; renderStock(); await q(sb.from('products').update({ qty:nq, updated_at:new Date().toISOString() }).eq('id', p.id)); } catch(err){ fail(err); reload('products'); }
};
$('p-add').onclick = () => openProduct(null, { type:'accessory', qty:1 });
$('p-add-veh').onclick = () => openProduct(null, { type:'moped', qty:1 });
/* two simple forms: an item (name, quantity, price — the code is given automatically)
   and a vehicle (type, model, VIN, colour, year, engine, price, photos) */
const VEH_ADD = ['moped','emoped','escooter','ebike','bike','atv'];
function openProduct(p, preset){
  const v = p || { photos:[], ...preset }, veh = !EASY.includes(v.type || 'accessory');
  let photos = (v.photos || []).map(path => ({ path }));
  const fld = (k, lab, extra = '', full = false) => `<label class="f"${full ? ' style="grid-column:1/-1"' : ''}>${esc(t(lab))}<input id="pf-${k}" value="${esc(v[k] ?? '')}" ${extra}></label>`;
  const body = veh
    ? `<div><div class="small muted" style="font-weight:600;margin-bottom:6px">${esc(t('photos'))}</div><div class="phgrid" id="pf-ph"></div></div>
      <div class="formgrid">
        <label class="f">${esc(t('f_type'))}<select id="pf-type">${(VEH_ADD.includes(v.type) ? VEH_ADD : [v.type, ...VEH_ADD]).map(k => `<option value="${k}" ${v.type === k ? 'selected' : ''}>${esc(tType(k))}</option>`).join('')}</select></label>
        ${fld('name', 'f_model', 'required placeholder="Honda Dio / Yadea GT25 …"')}
        ${fld('code', 'f_vin', 'required autocapitalize="characters" spellcheck="false" placeholder="LR4R4UE03T6907005"', true)}
        ${fld('color', 'f_color')}${fld('year', 'f_year', 'inputmode="numeric" maxlength="4"')}
        ${fld('engine', 'f_engine', 'placeholder="49 cc / 1200 W"')}${fld('price', 'f_price', 'type="number" min="0" step="1" inputmode="decimal"')}
        ${p ? fld('qty', 'f_qty', 'type="number" min="0" step="1" inputmode="numeric"') : ''}
        ${fld('note', 'note', '', true)}</div>`
    : `<div class="formgrid">
        ${fld('name', 'f_name', 'required list="pf-names" autocomplete="off"', true)}
        <datalist id="pf-names">${[...new Set(S.products.filter(x => EASY.includes(x.type)).map(x => x.name).filter(Boolean))].sort().map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        ${fld('qty', 'f_qty', 'type="number" min="0" step="1" inputmode="numeric" required')}${fld('price', 'f_price', 'type="number" min="0" step="0.01" inputmode="decimal" required')}
        <div class="f" style="grid-column:1/-1"><span>${esc(t('f_code'))}</span><b class="num" style="font-size:18px">${esc(v.code || t('code_auto'))}</b></div></div>`;
  openOv(`<form id="pf" class="stack"><div class="row between"><h2>${esc(t(veh ? (p ? 'edit_vehicle' : 'new_vehicle') : (p ? 'edit_item' : 'new_item')))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div>
    ${body}<div id="pf-err" class="err" hidden></div>
    <button class="btn primary big" type="submit" id="pf-save">${esc(t('save'))}</button></form>`);
  const drawPhotos = () => {
    if (!$('pf-ph')) return;
    $('pf-ph').innerHTML = photos.map((ph, i) => `<div class="p"><img src="${esc(ph.preview || photoUrl(ph.path))}" alt=""><button type="button" data-rm="${i}" aria-label="${esc(t('remove_photo'))}">×</button></div>`).join('')
      + `<label class="add">${esc(t('add_photos'))}<input type="file" accept="image/*" multiple hidden id="pf-file"></label>`;
    $('pf-file').onchange = async e => {
      const files = [...e.target.files].slice(0, 8); if (!files.length) return; toast(t('photo_saving'));
      for (const f of files) { try { const blob = await compressImage(f); photos.push({ blob, preview:URL.createObjectURL(blob) }); } catch(err){ toast(t('photo_fail')); } }
      drawPhotos();
    };
  };
  drawPhotos();
  if ($('pf-ph')) $('pf-ph').onclick = e => { const b = e.target.closest('[data-rm]'); if (b) { photos.splice(+b.dataset.rm, 1); drawPhotos(); } };
  $('pf').onsubmit = async e => {
    e.preventDefault();
    const g = k => ($('pf-' + k)?.value ?? '').trim(), err = $('pf-err'); err.hidden = true;
    let data;
    if (veh) {
      const vin = g('code').toUpperCase().replace(/\s+/g, '');
      if (!vin) { err.textContent = t('vin_required'); err.hidden = false; $('pf-code').focus(); return; }
      if (S.products.some(x => x.id !== p?.id && String(x.code || '').toUpperCase() === vin)) { err.textContent = t('vin_exists'); err.hidden = false; $('pf-code').focus(); return; }
      data = { name:g('name'), type:g('type'), code:vin, color:g('color'), year:g('year'), engine:g('engine'), note:g('note'),
        price:Math.max(0, +g('price') || 0), qty: p ? Math.max(0, Math.round(+g('qty') || 0)) : 1 };
    } else {
      data = { name:g('name'), price:Math.max(0, r2(g('price'))), qty:Math.max(0, Math.round(+g('qty') || 0)) };
      if (!p) data.type = 'accessory';
    }
    const btn = $('pf-save'); btn.disabled = true;
    try {
      if (veh) {
        if (photos.some(x => x.blob)) toast(t('uploading'));
        const paths = [];
        for (const ph of photos) paths.push(ph.path || await uploadBlob('products', `p/${uid()}.jpg`, ph.blob));
        data.photos = paths;
        const removed = (v.photos || []).filter(x => !paths.includes(x) && isOwnPhoto(x));
        if (removed.length) sb.storage.from('products').remove(removed).catch(() => {});
      }
      data.updated_at = new Date().toISOString();
      let row;
      if (p) row = await q(sb.from('products').update(data).eq('id', p.id).select().single());
      else row = await q(sb.from('products').insert(data).select().single());
      closeOv(); toast(!veh && row?.code ? `${t('saved')} · ${t('f_code')} ${row.code}` : t('saved')); await reload('products');
    } catch(err2){ fail(err2); btn.disabled = false; }
  };
}

/* ================= rent ================= */
const curTariff = () => (S.settings.tariffs || [])[+$('r-type').value];
const UNIT_MS = { m:6e4, h:36e5, d:864e5, w:6048e5 };
const toLocalInput = d => `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDT = ts => { const d = new Date(ts); return isNaN(d) ? '' : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
/* late return: up to 30 min is free; after that every started hour = 10% of the daily rate the customer signed for
   (31–90 min late = 1 h, 91–150 min = 2 h, …) */
const rentDaily = r => +(r.contract?.raw?.daily) || +dailyRate(r.type) || 0;
function lateCalc(r){
  if (!r.ends_at || r.status !== 'active') return { hours:0, daily:rentDaily(r), fee:0 };
  const ms = Date.now() - new Date(r.ends_at) - 30 * 6e4, hours = ms > 0 ? Math.ceil(ms / 36e5) : 0, daily = rentDaily(r);   // first 30 min are free
  return { hours, daily, fee:r2(hours * daily * 0.1) };
}
const rentSum = r => r2((+r.price || 0) + (+r.late_fee || 0));
function dueLabel(r){
  if (!r.ends_at) return '';
  const late = r.status === 'active' && new Date(r.ends_at) < new Date();
  return ` · <span class="due ${late ? 'late' : ''}">${esc(t(late ? 'overdue' : 'return_by'))} ${fmtTs(r.ends_at)}</span>`;
}
function renderRent(){
  const T = S.settings.tariffs || [], curT = $('r-type').value;
  $('r-type').innerHTML = T.map((x, i) => `<option value="${i}" ${String(i) === curT ? 'selected' : ''}>${esc(tType(x.type))}</option>`).join('');
  fillRates(false); fillUnits();
  $('r-seller').innerHTML = sellerOpts($('r-seller').value || S.user?.name);
  mountPicker('r-cust'); if (!$('r-video').childElementCount) renderVideo();
  const act = S.rentals.filter(r => r.status === 'active');
  const lateTag = r => { const l = lateCalc(r); return l.fee ? `<div class="small due late num">+${money(l.fee)} · ${l.hours} ${esc(t('hours_short'))}</div>` : ''; };
  const cBtn = r => (r.contract ? `<button class="btn ghost small" data-act="contract">${esc(t('contract_view'))}</button>` : '') + (r.video ? `<button class="btn ghost small" data-act="video">🎥 ${esc(t('video_short'))}</button>` : '');
  const eBtn = () => `<button class="btn ghost small" data-act="rrep">${esc(t('report_btn'))}</button>` + (isAdmin() ? `<button class="btn ghost small" data-act="redit">${esc(t('edit'))}</button>` : '');
  $('r-active').innerHTML = act.length ? act.map(r => `<div class="tariff" data-id="${r.id}"><div style="min-width:0"><b>${esc(tType(r.type))}</b>${r.unit_label ? ` · ${esc(r.unit_label)}` : ''} · ${esc(rateLabel(r.rate))}
      <div class="small muted">${esc(r.customer_name || '')} ${esc(r.phone || '')} · ${esc(t('started'))} ${fmtTs(r.created_at)}${dueLabel(r)}${+r.deposit ? ` · ${esc(t('deposit'))} ${money(r.deposit)}` : ''}</div>${cBtn(r)}${eBtn()}</div>
      <div style="text-align:right"><div class="num">${money(r.price)}</div>${lateTag(r)}<button class="btn small" data-act="ret">${esc(t('returned_btn'))}</button></div></div>`).join('')
    : `<div class="empty small">${esc(t('nothing_rented'))}</div>`;
  const done = S.rentals.filter(r => r.status === 'returned').slice(0, 50);
  $('r-history').innerHTML = `<div class="pad"><h3>${esc(t('rent_recent'))}</h3></div>` + (done.length ? `<table><thead><tr><th>${esc(t('col_time'))}</th><th>${esc(t('col_vehicle'))}</th><th>${esc(t('col_customer'))}</th><th>${esc(t('seller'))}</th><th class="r">${esc(t('col_amount'))}</th><th></th></tr></thead><tbody>${done.map(r => `<tr data-id="${r.id}"><td class="num">${fmtTs(r.created_at)}</td><td>${esc(tType(r.type))}${r.unit_label ? ` · ${esc(r.unit_label)}` : ''} · ${esc(rateLabel(r.rate))}</td><td>${esc(r.customer_name || '—')}</td><td>${esc(r.seller || '')}</td><td class="r num">${money(rentSum(r))}${+r.late_fee ? `<div class="small due late">+${money(r.late_fee)}</div>` : ''}</td><td style="white-space:nowrap">${cBtn(r)}${eBtn()}</td></tr>`).join('')}</tbody></table>` : `<div class="empty small">${esc(t('rent_none_done'))}</div>`);
}
function setEnd(force){
  const el = $('r-end'), x = curTariff(), r = x?.rates?.[+$('r-rate').value];
  if (el.dataset.manual && !force) return;
  if (r && UNIT_MS[r.u]) el.value = toLocalInput(new Date(Date.now() + r.n * UNIT_MS[r.u]));
  else if (!el.value) el.value = toLocalInput(new Date(Date.now() + 36e5));
}
function fillRates(setPrice = true){
  const x = curTariff(), cur = $('r-rate').value;
  $('r-rate').innerHTML = (x?.rates || []).map((r, i) => `<option value="${i}" ${String(i) === cur ? 'selected' : ''}>${esc(rateLabel(r))} — ${money(r.p)}</option>`).join('') + `<option value="x" ${cur === 'x' ? 'selected' : ''}>${esc(t('other_duration'))}</option>`;
  if (setPrice || $('r-price').value === '') { const r = x?.rates?.[+$('r-rate').value]; if (r) $('r-price').value = r.p; }
  if (setPrice) delete $('r-end').dataset.manual;
  setEnd(false);
}
const stockLabel = p => [pName(p), p.color, p.code ? '№ ' + p.code : ''].filter(Boolean).join(' · ');
function unitOptions(type){
  const busy = new Set(S.rentals.filter(r => r.status === 'active').flatMap(r => [r.unit_id && 'f:' + r.unit_id, r.product_id && 'p:' + r.product_id]).filter(Boolean));
  const byLabel = (a, b) => a.label.localeCompare(b.label, undefined, { numeric:true });
  // only units with a frame number can be rented out — the number is shown in the list
  const fleet = S.fleet.filter(f => f.type === type && String(f.number || '').trim()).map(f => ({ key:'f:' + f.id, label:fleetLabel(f) })).sort(byLabel);
  const stock = S.products.filter(p => p.type === type && +p.qty > 0 && String(p.code || '').trim()).map(p => ({ key:'p:' + p.id, label:stockLabel(p) })).sort(byLabel);
  return { busy, groups:[['grp_fleet', fleet], ['grp_stock', stock]].filter(([, l]) => l.length) };
}
function fillUnits(){
  const x = curTariff(), cur = $('r-unit').value;
  const { busy, groups } = x ? unitOptions(x.type) : { busy:new Set(), groups:[] };
  $('r-unit').innerHTML = `<option value="">${esc(t('choose_unit'))}</option>` + groups.map(([g, list]) => `<optgroup label="${esc(t(g))}">${list.map(u => `<option value="${u.key}" ${busy.has(u.key) ? 'disabled' : ''} ${u.key === cur && !busy.has(u.key) ? 'selected' : ''}>${esc(u.label)}${busy.has(u.key) ? ' — ' + esc(t('rented_tag')) : ''}</option>`).join('')}</optgroup>`).join('');
  $('r-unit-hint').hidden = groups.length > 0; $('r-unit-hint').textContent = t('unit_none_vin');
}
$('r-type').onchange = () => { $('r-rate').value = '0'; fillRates(true); fillUnits(); };
$('r-rate').onchange = () => fillRates(true);
$('r-end').oninput = () => { $('r-end').dataset.manual = '1'; };

/* ---------- rental agreement ---------- */
const RU_LANG = ['RUS','BLR','UKR','KAZ','KGZ','UZB','ARM','AZE','TJK','TKM','MDA'];
const langFor = nat => nat === 'GEO' ? 'ka' : RU_LANG.includes(nat) ? 'ru' : nat === 'JPN' ? 'ja' : nat ? 'en' : LANG;
const dailyRate = type => (S.settings.tariffs || []).find(x => x.type === type)?.rates?.find(r => r.u === 'd' && +r.n === 1)?.p;
/* raw = what is stored with the rental; turned into display strings in the reader's language */
function contractStrings(raw, lg){
  const pen = raw.daily ? `${money(r2(raw.daily * .1))} ${tL('per_hour', lg)}` : '';
  return {
    name: raw.name, doc: raw.doc, idnum: raw.idnum || '—', dob: fmtDate(raw.dob), phone: raw.phone,
    vehicle: [tL('t_' + raw.type, lg), raw.unit].filter(Boolean).join(' · '),
    period: rateLabel(raw.rate, lg), start: fmtDT(raw.start), end: raw.end ? fmtDT(raw.end) : '',
    price: `${money(raw.price)}${raw.pay ? ' · ' + tL('pay_' + raw.pay, lg) : ''}`,
    deposit: +raw.deposit ? money(raw.deposit) : '', pen, seller: raw.seller, signedAt: raw.signed_at ? fmtDT(raw.signed_at) : ''
  };
}
const langChips = cur => `<div class="langpick noprint" role="group" aria-label="${esc(t('contract_lang'))}">${LANGS.map(([k, n]) => `<button type="button" class="chip" data-lang="${k}" aria-pressed="${k === cur}">${esc(n)}</button>`).join('')}</div>`;

function signaturePad(box){
  const cv = box.querySelector('canvas'), x = cv.getContext('2d'); let drawing = false, has = false, last = null;
  const size = () => { const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.lineWidth = 2.6; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#10141a'; x.fillStyle = '#fff'; x.fillRect(0, 0, r.width, r.height); has = false; box.classList.remove('has'); };
  const pt = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); drawing = true; last = pt(e); x.beginPath(); x.arc(last[0], last[1], 1.2, 0, 7); x.fillStyle = '#10141a'; x.fill(); has = true; box.classList.add('has'); });
  cv.addEventListener('pointermove', e => { if (!drawing) return; const p = pt(e); x.beginPath(); x.moveTo(last[0], last[1]); x.lineTo(p[0], p[1]); x.stroke(); last = p; });
  ['pointerup','pointercancel','pointerleave'].forEach(ev => cv.addEventListener(ev, () => { drawing = false; }));
  requestAnimationFrame(size);
  return { clear:size, has:() => has, blob:() => new Promise(r => cv.toBlob(r, 'image/png')) };
}

/* shows the agreement for signing; resolves with { lang, blob } or null when cancelled */
function askSignature(raw){
  return new Promise(resolve => {
    let lg = langFor(raw.nat);
    openOv(`<div class="row between noprint" style="flex-wrap:wrap;gap:8px"><div class="small muted" style="flex:1;min-width:200px">${esc(t('contract_for_customer'))}</div>${langChips(lg)}</div>
      <div id="ct-body"></div>
      <div class="stack"><div class="small" style="font-weight:700" id="ct-signlbl"></div>
        <div class="sigpad" id="ct-pad"><canvas></canvas><span class="hint" id="ct-hint"></span></div></div>
      <div class="cbar"><button type="button" class="btn" id="ct-clear"></button><button type="button" class="btn" id="ct-cancel"></button><button type="button" class="btn primary big" id="ct-ok" style="width:auto"></button></div>`, 'wide');
    const pad = signaturePad($('ct-pad'));
    const paint = () => {
      $('ct-body').innerHTML = window.ER_CONTRACT.html(lg, contractStrings(raw, lg));
      $('ct-signlbl').textContent = tL('sign_here', lg); $('ct-hint').textContent = tL('sign_here', lg);
      $('ct-clear').textContent = tL('sign_clear', lg); $('ct-cancel').textContent = tL('cancel', lg); $('ct-ok').textContent = tL('sign_confirm', lg);
      $('ov').querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === lg));
    };
    paint();
    $('ov').querySelector('.langpick').onclick = e => { const b = e.target.closest('[data-lang]'); if (b) { lg = b.dataset.lang; paint(); } };
    $('ct-clear').onclick = () => pad.clear();
    const done = v => { $('ov').onclick = ovClick; closeOv(); resolve(v); };
    $('ct-cancel').onclick = () => done(null);
    const ovClick = $('ov').onclick; $('ov').onclick = null;   // a stray tap outside must not close it mid-signature
    $('ct-ok').onclick = async () => { if (!pad.has()) { toast(tL('sign_need', lg)); return; } done({ lang:lg, blob: await pad.blob() }); };
  });
}
async function viewContract(r){
  const c = r.contract; if (!c?.raw) { toast(t('contract_none')); return; }
  let lg = c.lang || LANG, url = '';
  openOv(`<div class="row between noprint" style="flex-wrap:wrap;gap:8px">${langChips(lg)}<div class="row"><button type="button" class="btn small" id="cv-print">${esc(t('print'))}</button><button type="button" class="btn small" data-close>${esc(t('close'))}</button></div></div><div id="cv-body"></div>`, 'wide');
  const paint = () => { $('cv-body').innerHTML = window.ER_CONTRACT.html(lg, contractStrings({ ...c.raw, signed_at:c.signed_at }, lg), url); $('ov').querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === lg)); };
  paint();
  $('ov').querySelector('.langpick').onclick = e => { const b = e.target.closest('[data-lang]'); if (b) { lg = b.dataset.lang; paint(); } };
  $('cv-print').onclick = () => window.print();
  if (r.signature) { try { url = (await q(sb.storage.from('id-photos').createSignedUrl(r.signature, 600))).signedUrl; if ($('cv-body')) paint(); } catch(e){ console.error(e); } }
}

/* ---------- video of the vehicle at hand-over (proof of condition for the deposit) ---------- */
const VID_MAX = 50 * 1024 * 1024;
let RV = null;   // { blob, url, ext }
const vidExt = type => /mp4/.test(type) ? 'mp4' : /quicktime|mov/.test(type) ? 'mov' : /3gpp/.test(type) ? '3gp' : 'webm';
const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
function setVideo(blob){
  if (RV?.url) URL.revokeObjectURL(RV.url);
  RV = blob ? { blob, url:URL.createObjectURL(blob), ext:vidExt(blob.type || '') } : null; renderVideo();
}
function renderVideo(){
  const box = $('r-video'); if (!box) return;
  box.innerHTML = RV
    ? `<video src="${RV.url}" controls playsinline preload="metadata"></video>
       <div class="row between"><span class="small muted num">${(RV.blob.size / 1048576).toFixed(1)} MB</span><button type="button" class="btn ghost small danger" data-vact="rm">${esc(t('remove'))}</button></div>`
    : `<div class="row" style="gap:6px">${canRecord() ? `<button type="button" class="btn small" data-vact="rec">🎥 ${esc(t('video_record'))}</button>` : `<label class="btn small">🎥 ${esc(t('video_record'))}<input type="file" accept="video/*" capture="environment" data-vact="file" hidden></label>`}
       <label class="btn small">${esc(t('video_upload'))}<input type="file" accept="video/*" data-vact="file" hidden></label></div>
       <div class="small muted">${esc(t('video_hint'))}</div>`;
}
$('r-video').onclick = e => { const a = e.target.closest('[data-vact]')?.dataset.vact; if (a === 'rm') setVideo(null); else if (a === 'rec') recordVideo(); };
$('r-video').onchange = e => {
  const f = e.target.files?.[0]; if (!f) return;
  if (f.size > VID_MAX) { toast(t('video_too_big')); e.target.value = ''; return; }
  setVideo(f);
};
/* in-app recorder: 720p at a low bitrate, so a 2-minute walk-around stays well under the size limit */
async function recordVideo(){
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:'environment' }, width:{ ideal:1280 }, height:{ ideal:720 } }, audio:false }); }
  catch(e){ console.error(e); toast(t('camera_denied')); return; }
  const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported?.(m)) || '';
  let rec = null, chunks = [], t0 = 0, timer = null;
  const stop = () => { stream.getTracks().forEach(x => x.stop()); clearInterval(timer); };
  openOv(`<div class="row between"><h2>${esc(t('video_record'))}</h2><button type="button" class="btn" id="vr-x">${esc(t('close'))}</button></div>
    <video id="vr-v" autoplay muted playsinline class="vrec"></video>
    <div class="row between"><b class="num" id="vr-t">0:00</b><span class="small muted">${esc(t('video_max'))}</span></div>
    <button type="button" class="btn primary big" id="vr-go">● ${esc(t('video_start'))}</button>`);
  $('vr-v').srcObject = stream;
  $('vr-x').onclick = () => { if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop(); } stop(); closeOv(); };
  $('vr-go').onclick = () => {
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    chunks = []; rec = new MediaRecorder(stream, mime ? { mimeType:mime, videoBitsPerSecond:1500000 } : { videoBitsPerSecond:1500000 });
    rec.ondataavailable = ev => { if (ev.data?.size) chunks.push(ev.data); };
    rec.onstop = () => { stop(); const blob = new Blob(chunks, { type:(rec.mimeType || mime || 'video/webm').split(';')[0] }); closeOv(); if (blob.size > VID_MAX) { toast(t('video_too_big')); return; } setVideo(blob); };
    rec.start(1000); t0 = Date.now();
    $('vr-go').textContent = '■ ' + t('video_stop'); $('vr-go').classList.add('danger');
    timer = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); if ($('vr-t')) $('vr-t').textContent = `${Math.floor(s / 60)}:${pad(s % 60)}`; if (s >= 180) rec.stop(); }, 500);
  };
}
async function uploadRentalVideo(rentalId){
  if (!RV) return;
  const v = RV, path = `${rentalId}.${v.ext}`;
  toast(t('video_uploading'));
  try { await uploadBlob('rental-videos', path, v.blob, v.blob.type || 'video/' + v.ext); await q(sb.from('rentals').update({ video:path }).eq('id', rentalId)); setVideo(null); }
  catch(e){ console.error(e); toast(t('video_fail')); }
}
async function viewVideo(path){
  if (!path) return;
  openOv(`<div class="row between"><h2>${esc(t('veh_video'))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div><div id="vv-box" class="muted">${esc(t('loading'))}</div>`);
  try { const d = await q(sb.storage.from('rental-videos').createSignedUrl(path, 3600)); const b = $('vv-box'); if (b) b.innerHTML = `<video class="vrec" src="${esc(d.signedUrl)}" controls playsinline autoplay></video>`; }
  catch(e){ fail(e); }
}

$('r-save').onclick = async () => {
  const x = curTariff(); if (!x) return;
  const uv = $('r-unit').value, kind = uv.slice(0, 2), uid_ = uv.slice(2);
  const f = kind === 'f:' ? S.fleet.find(y => y.id === uid_) : null, sp = kind === 'p:' ? S.products.find(y => y.id === uid_) : null;
  if (unitOptions(x.type).groups.length && !f && !sp) { toast(t('need_unit')); return; }
  const btn = $('r-save'); btn.disabled = true;
  try {
    let cust = null;
    { const st = PICK['r-cust'], pre = st?.mode === 'selected' ? S.customers.find(c => c.id === st.id) : null;
      if (!st || st.mode === 'search') { toast(t('need_customer')); return; }
      if (!hasIdPhoto('r-cust', pre)) { toast(t('need_id_photo')); return; } }
    try { cust = await resolveCustomer('r-cust'); } catch(e){ if (e.message === 'name') { toast(t('cust_need_name')); return; } throw e; }
    if (!cust) { toast(t('need_customer')); return; }
    const rv = $('r-rate').value, r = x.rates?.[+rv], rate = rv === 'x' ? { other:true } : r ? { n:r.n, u:r.u, p:r.p } : null;
    setEnd(false);   // start counts from now unless someone typed the return time
    const start = new Date(), endV = $('r-end').value, end = endV ? new Date(endV) : null;
    const unitLabel = f ? fleetLabel(f) : sp ? stockLabel(sp) : '';
    const row = { type:x.type, rate, price:r2($('r-price').value), deposit:r2($('r-dep').value), unit_id:f?.id || null, product_id:sp?.id || null, unit_label:unitLabel,
      customer_id:cust.id, customer_name:cust.name, phone:cust.phone || '', seller:$('r-seller').value, payment:$('r-pay').value, created_by:S.user?.name || '',
      ends_at: end && !isNaN(end) ? end.toISOString() : null };
    const raw = { name:cust.name, doc:cust.doc_type || 'other', idnum:cust.id_number || '', dob:cust.birth_date || '', phone:cust.phone || '', nat:cust.nationality || '',
      type:x.type, unit:unitLabel, rate, start:start.toISOString(), end:row.ends_at, price:row.price, pay:row.payment, deposit:row.deposit, daily:dailyRate(x.type) || 0, seller:row.seller };
    btn.disabled = false;
    const sig = await askSignature(raw);
    if (!sig) return;
    btn.disabled = true;
    const signedAt = new Date().toISOString();
    const saved = await q(sb.from('rentals').insert({ ...row, contract:{ v:1, lang:sig.lang, signed_at:signedAt, raw } }).select().single());
    try { const path = `contracts/${saved.id}.png`; await uploadBlob('id-photos', path, sig.blob, 'image/png'); await q(sb.from('rentals').update({ signature:path }).eq('id', saved.id)); }
    catch(e){ console.error(e); toast(t('sign_fail')); }
    await uploadRentalVideo(saved.id);
    $('r-dep').value = 0; $('r-unit').value = ''; delete $('r-end').dataset.manual; $('r-end').value = ''; resetPicker('r-cust'); toast(t('rent_started'));
    await reload('rentals', 'customers');
    showReport('rental', rentalReportData(S.rentals.find(y => y.id === saved.id) || { ...saved, contract:true }));
  } catch(e){ fail(e); } finally { btn.disabled = false; }
};
$('r-active').addEventListener('click', e => { const vb = e.target.closest('[data-act="video"]'); if (vb) viewVideo(S.rentals.find(r => r.id === vb.closest('[data-id]').dataset.id)?.video); });
$('r-history').addEventListener('click', e => { const vb = e.target.closest('[data-act="video"]'); if (vb) viewVideo(S.rentals.find(r => r.id === vb.closest('[data-id]').dataset.id)?.video); });
$('r-active').onclick = async e => {
  const eb = e.target.closest('[data-act="redit"]'); if (eb) { openRentalEdit(eb.closest('[data-id]').dataset.id); return; }
  const rb = e.target.closest('[data-act="rrep"]'); if (rb) { showReport('rental', rentalReportData(S.rentals.find(r => r.id === rb.closest('[data-id]').dataset.id))); return; }
  const cb = e.target.closest('[data-act="contract"]'); if (cb) { viewContract(S.rentals.find(r => r.id === cb.closest('[data-id]').dataset.id)); return; }
  const b = e.target.closest('[data-act="ret"]'); if (!b) return;
  const r = S.rentals.find(x => x.id === b.closest('[data-id]').dataset.id); if (r) openReturn(r);
};
/* return: late fee shown, "paid" must be pressed before the rental can be finished */
async function openReturn(r){
  let late = lateCalc(r);
  try { const v = await q(sb.rpc('rental_late', { p_id:r.id })); if (v) late = v; } catch(e){ console.error(e); }
  const fee = +late.fee || 0, row = (k, v) => v ? `<div class="kv"><span class="muted">${esc(t(k))}</span><b class="num">${v}</b></div>` : '';
  openOv(`<div class="row between"><h2>${esc(t('return_title'))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div>
    <div><b>${esc(tType(r.type))}</b>${r.unit_label ? ` · ${esc(r.unit_label)}` : ''} · ${esc(rateLabel(r.rate))}<div class="small muted">${esc(r.customer_name || '')} ${esc(r.phone || '')}</div></div>
    <div class="stack" style="gap:4px">${row('started', fmtTs(r.created_at))}${row('return_by', r.ends_at ? fmtTs(r.ends_at) : '')}${row('returned_at', fmtTs(new Date()))}${row('rent_fee', money(r.price))}</div>
    ${fee ? `<div class="latebox stack">
        <div class="row between"><b>${esc(t('late_by'))} ${late.hours} ${esc(t('hours_short'))}</b><b class="num">+${money(fee)}</b></div>
        <div class="small muted num">${late.hours} × 10% × ${money(late.daily)} (${esc(t('daily_rate'))})</div>
        <div class="row between" style="font-size:18px"><span>${esc(t('total_due'))}</span><b class="num">${money(r2(+r.price + fee))}</b></div>
        <label class="f"><span>${esc(t('payment'))}</span><select id="rt-pay">${PAYS.map(k => `<option value="${k}" ${k === (r.payment || 'cash') ? 'selected' : ''}>${esc(tPay(k))}</option>`).join('')}</select></label>
        <button type="button" class="btn big paidbtn" id="rt-paid" aria-pressed="false">${esc(t('mark_paid'))} · ${money(fee)}</button></div>`
      : `<div class="okbox">${esc(t(r.ends_at ? 'on_time' : 'no_end_time'))}</div>`}
    <button type="button" class="btn primary big" id="rt-done" ${fee ? 'disabled' : ''}>${esc(t('finish_rental'))}</button>
    ${fee ? `<div class="small muted" id="rt-hint">${esc(t('paid_first'))}</div>` : ''}`);
  if ($('rt-paid')) $('rt-paid').onclick = () => { const on = $('rt-paid').getAttribute('aria-pressed') !== 'true'; $('rt-paid').setAttribute('aria-pressed', on); $('rt-done').disabled = !on; $('rt-hint').hidden = on; };
  $('rt-done').onclick = async () => {
    const btn = $('rt-done'); btn.disabled = true;
    try {
      await q(sb.rpc('return_rental', { p_id:r.id, p_fee:fee, p_payment:$('rt-pay')?.value || '' }));
      closeOv(); toast(t('return_saved') + (fee ? ' · +' + money(fee) : '')); await reload('rentals');
    } catch(err){
      if (/fee_changed/.test(err?.message || '')) { toast(t('fee_changed')); closeOv(); openReturn(r); return; }
      fail(err); btn.disabled = false;
    }
  };
}
$('r-history').onclick = e => { const eb = e.target.closest('[data-act="redit"]'); if (eb) { openRentalEdit(eb.closest('[data-id]').dataset.id); return; }
  const rb = e.target.closest('[data-act="rrep"]'); if (rb) { showReport('rental', rentalReportData(S.rentals.find(r => r.id === rb.closest('[data-id]').dataset.id))); return; } const cb = e.target.closest('[data-act="contract"]'); if (cb) viewContract(S.rentals.find(r => r.id === cb.closest('[data-id]').dataset.id)); };

/* admin: fix a rental — same PIN as for sales, checked again on the server */
function openRentalEdit(id){ if (!isAdmin()) return; const r = S.rentals.find(x => x.id === id); if (r) askPin(pin => editRental(r, pin)); }
function editRental(r, pin){
  const opt = (list, v, lab) => { const all = list.includes(v) || !v ? list : [v, ...list]; return all.map(k => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(lab ? lab(k) : k)}</option>`).join(''); };
  const rt = r.rate || {}, u0 = rt.other ? 'x' : (rt.u || 'h');
  const loc = ts => ts ? toLocalInput(new Date(ts)) : '';
  openOv(`<form id="re" class="stack"><div class="row between"><h2>${esc(t('edit_rental'))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div>
    <div class="formgrid two">
      <label class="f">${esc(t('started'))}<input id="re-start" type="datetime-local" required value="${loc(r.created_at)}"></label>
      <label class="f">${esc(t('return_by'))}<input id="re-end" type="datetime-local" value="${loc(r.ends_at)}"></label>
      <label class="f">${esc(t('vehicle'))}<select id="re-type">${opt(RENTABLE, r.type, tType)}</select></label>
      <label class="f">${esc(t('unit'))}<input id="re-unit" value="${esc(r.unit_label || '')}"></label>
      <label class="f">${esc(t('tariff'))}<span class="row" style="flex-wrap:nowrap;gap:6px"><input id="re-n" type="number" min="1" step="1" inputmode="numeric" class="num" style="width:80px" value="${+rt.n || 1}">
        <select id="re-u">${['m','h','d','w'].map(k => `<option value="${k}" ${k === u0 ? 'selected' : ''}>${esc(UNITS[k][li()])}</option>`).join('')}<option value="x" ${u0 === 'x' ? 'selected' : ''}>${esc(t('other_duration'))}</option></select></span></label>
      <label class="f">${esc(t('price'))}<input id="re-price" type="number" min="0" step="0.01" inputmode="decimal" value="${+r.price || 0}"></label>
      <label class="f">${esc(t('deposit'))}<input id="re-dep" type="number" min="0" step="0.01" inputmode="decimal" value="${+r.deposit || 0}"></label>
      <label class="f">${esc(t('seller'))}<select id="re-seller"><option value=""></option>${opt(S.settings.sellers || [], r.seller || '')}</select></label>
      <label class="f">${esc(t('payment'))}<select id="re-pay"><option value=""></option>${opt(PAYS, r.payment || '', tPay)}</select></label>
      <label class="f">${esc(t('cust_name'))}<input id="re-cname" value="${esc(r.customer_name || '')}"></label>
      <label class="f">${esc(t('cust_phone'))}<input id="re-phone" type="tel" value="${esc(r.phone || '')}"></label>
      <label class="f">${esc(t('rent_status'))}<select id="re-status"><option value="active" ${r.status === 'active' ? 'selected' : ''}>${esc(t('st_active'))}</option><option value="returned" ${r.status === 'returned' ? 'selected' : ''}>${esc(t('returned_btn'))}</option><option value="cancelled" ${r.status === 'cancelled' ? 'selected' : ''}>${esc(t('st_cancelled'))}</option></select></label>
      <label class="f">${esc(t('late_fee'))}<input id="re-late" type="number" min="0" step="0.01" inputmode="decimal" value="${+r.late_fee || 0}"></label>
      <label class="f">${esc(t('returned_at'))}<input id="re-ret" type="datetime-local" value="${loc(r.returned_at)}"></label></div>
    ${r.contract ? `<p class="small muted" style="margin:0">${esc(t('rental_edit_note'))}</p>` : ''}
    <button class="btn primary big" type="submit" id="re-save">${esc(t('save'))}</button>
    <button class="btn danger big" type="button" id="re-cancel">${esc(t('cancel_rental'))}</button></form>`);
  $('re-cancel').onclick = () => arm($('re-cancel'), async () => {
    try { await q(sb.rpc('edit_rental', { p_pin:pin, p_id:r.id, p_patch:{ status:'cancelled' } })); closeOv(); toast(t('rental_cancelled')); await reload('rentals'); }
    catch(err){ fail(err); }
  });
  $('re').onsubmit = async e => {
    e.preventDefault();
    const start = new Date($('re-start').value); if (isNaN(start)) return;
    const iso = v => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? d.toISOString() : null; };
    const u = $('re-u').value, price = r2($('re-price').value), status = $('re-status').value;
    const patch = { created_at:start.toISOString(), day:dayKey(start), ends_at:iso($('re-end').value), type:$('re-type').value, unit_label:$('re-unit').value.trim(),
      rate: u === 'x' ? { other:true } : { n:Math.max(1, +$('re-n').value || 1), u, p:price }, price, deposit:r2($('re-dep').value),
      seller:$('re-seller').value, payment:$('re-pay').value, customer_name:$('re-cname').value.trim(), phone:$('re-phone').value.trim(),
      late_fee:r2($('re-late').value), status, returned_at: status === 'returned' ? (iso($('re-ret').value) || r.returned_at || new Date().toISOString()) : null };
    const btn = $('re-save'); btn.disabled = true;
    try { await q(sb.rpc('edit_rental', { p_pin:pin, p_id:r.id, p_patch:patch })); closeOv(); toast(t('saved')); await reload('rentals'); }
    catch(err){ fail(err); btn.disabled = false; }
  };
}

/* ================= WhatsApp-style reports ================= */
const fmtD = d => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
const fmtShort = ts => { const d = new Date(ts); return isNaN(d) ? '' : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const repMoney = cur => n => { const v = r2(n); return `${v.toLocaleString('en-US', { maximumFractionDigits:2 })} ${cur === 'GEL' ? 'GEL' : cur}`; };
function saleReportData({ lines, total, extra, payment, seller, cust, note, date, currency }){
  const m = repMoney(currency || 'GEL');
  return { date:fmtD(date), money:m, total, discount:+extra || 0, seller, note, buyer:cust?.name || '', nat:cust?.nationality || '',
    payLabel: lg => payment ? tL('pay_' + payment, lg) : '',
    lines: (lines || []).map(l => { const p = S.products.find(x => x.id === l.product_id); const qty = +l.qty || 1, price = +l.unit_price || 0;
      return { name:l.name, code:p?.code || l.code || '', vin:l.vin || '', veh:VEH.includes(l.type), qty, price, sum:r2(l.total ?? qty * price), typeLabel: lg => tL('t_' + l.type, lg) }; }) };
}
function rentalReportData(r){
  if (!r) return null;
  const c = S.customers.find(x => x.id === r.customer_id) || {}, raw = r.contract?.raw || {};
  return { item: lg => [tL('t_' + r.type, lg), r.unit_label].filter(Boolean).join(' · '), period: lg => rateLabel(r.rate, lg),
    fee: repMoney('GEL')(r.price), payLabel: lg => r.payment ? tL('pay_' + r.payment, lg) : '', deposit: +r.deposit ? repMoney('GEL')(r.deposit) : '',
    cust: r.customer_name || c.name || '', tel: r.phone || c.phone || '', nat: c.nationality || raw.nat || '',
    docPhoto: !!c.photo, signed: !!r.contract, video: !!r.video, late: +r.late_fee ? { hours:+r.late_hours || 0, fee:repMoney('GEL')(r.late_fee), total:repMoney('GEL')(rentSum(r)) } : null, today: dayKey(new Date(r.created_at)) === dayKey(new Date()), date: fmtD(new Date(r.created_at)), start: fmtShort(r.created_at), end: r.ends_at ? fmtShort(r.ends_at) : '', seller: r.seller || '' };
}
function repLangs(){ try { const v = JSON.parse(ls.get('er-rep-langs') || 'null'); if (Array.isArray(v) && v.length) return v; } catch(e){} return ['en', 'ja']; }
function showReport(kind, data){
  if (!data) return;
  let langs = repLangs();
  openOv(`<div class="row between"><h2>${esc(t('report_title'))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div>
    <div class="langpick" id="rp-langs">${window.ER_REPORT.langs.map(k => `<button type="button" class="chip" data-l="${k}"></button>`).join('')}</div>
    <textarea id="rp-text" class="reptext" rows="14" spellcheck="false"></textarea>
    <div class="row" style="gap:8px"><button type="button" class="btn primary big" id="rp-copy" style="flex:1;width:auto">${esc(t('copy'))}</button>
      <a class="btn big wa" id="rp-wa" target="_blank" rel="noopener" style="flex:1;width:auto">${esc(t('send_wa'))}</a></div>`);
  const paint = () => {
    $('rp-langs').querySelectorAll('[data-l]').forEach(b => { b.textContent = window.ER_REPORT.FLAG[b.dataset.l]; b.setAttribute('aria-pressed', langs.includes(b.dataset.l)); });
    $('rp-text').value = window.ER_REPORT.build(kind, data, window.ER_REPORT.langs.filter(l => langs.includes(l)));
    $('rp-wa').href = 'https://wa.me/?text=' + encodeURIComponent($('rp-text').value);
  };
  paint();
  $('rp-langs').onclick = e => { const b = e.target.closest('[data-l]'); if (!b) return; const l = b.dataset.l;
    langs = langs.includes(l) ? (langs.length > 1 ? langs.filter(x => x !== l) : langs) : [...langs, l]; ls.set('er-rep-langs', JSON.stringify(langs)); paint(); };
  $('rp-text').oninput = () => { $('rp-wa').href = 'https://wa.me/?text=' + encodeURIComponent($('rp-text').value); };
  $('rp-copy').onclick = async () => {
    const txt = $('rp-text').value;
    try { await navigator.clipboard.writeText(txt); } catch(e){ $('rp-text').select(); document.execCommand('copy'); }
    toast(t('copied'));
  };
}

/* ================= customers ================= */
function renderCustomers(){
  const qq = $('k-q').value.trim(), list = S.customers.filter(c => !qq || custMatch(c, qq));
  const nS = {}, nR = {};
  S.sales.forEach(s => s.customer_id && (nS[s.customer_id] = (nS[s.customer_id] || 0) + 1));
  S.rentals.forEach(r => r.customer_id && r.status !== 'cancelled' && (nR[r.customer_id] = (nR[r.customer_id] || 0) + 1));
  $('k-list').innerHTML = !list.length ? `<div class="empty">${esc(t(S.customers.length ? 'nothing_found' : 'cust_none'))}</div>` : list.slice(0, 300).map(c => `<div class="citem" data-id="${c.id}">
    <div style="min-width:0"><b>${esc(c.name)}</b> ${ageChip(c)}<div class="small muted num">${esc(custLine(c) || '—')}</div>
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
      <label class="f">${esc(t('cust_idnum'))}<input id="kf-id" value="${esc(c?.id_number || '')}"></label>
      <label class="f">${esc(t('cust_birth'))}<input id="kf-birth" type="date" value="${esc(c?.birth_date || '')}"></label>
      <label class="f">${esc(t('cust_nat'))}<input id="kf-nat" value="${esc(c?.nationality || '')}" maxlength="40"></label>
      <label class="f">${esc(t('cust_doc'))}<select id="kf-doc"><option value=""></option>${['passport','id'].map(k => `<option value="${k}" ${c?.doc_type === k ? 'selected' : ''}>${esc(t('doc_' + k))}</option>`).join('')}</select></label>
      <label class="f">${esc(t('doc_expiry'))}<input id="kf-exp" type="date" value="${esc(c?.doc_expiry || '')}"></label></div>
    <div class="row"><span id="kf-ph">${c?.photo ? `<button type="button" class="btn ghost small" id="kf-view">${esc(t('cust_photo_view'))}</button>` : `<span class="tag out">${esc(t('cust_no_photo'))}</span>`}</span>
      <label class="btn small">${esc(t('cust_photo_add'))}<input type="file" class="kf-file" accept="image/*" capture="environment" hidden></label>
      <label class="btn small">${esc(t('upload_photo'))}<input type="file" class="kf-file" accept="image/*" hidden></label></div>
    <button class="btn primary big" type="submit" id="kf-save">${esc(t('save'))}</button></form>`);
  if ($('kf-view')) $('kf-view').onclick = () => viewIdPhoto(c.photo);
  document.querySelectorAll('.kf-file').forEach(inp => inp.onchange = async e => { if (!e.target.files[0]) return; toast(t('photo_saving')); try { photo = await compressImage(e.target.files[0], 1600, .8); $('kf-ph').innerHTML = `<img class="thumb" src="${URL.createObjectURL(photo)}" alt="">`; } catch(err){ toast(t('photo_fail')); } });
  $('kf').onsubmit = async e => {
    e.preventDefault();
    const d = nullDates({ name:$('kf-name').value.trim(), phone:$('kf-phone').value.trim(), id_number:$('kf-id').value.trim(),
      birth_date:$('kf-birth').value, nationality:$('kf-nat').value.trim().toUpperCase(), doc_type:$('kf-doc').value, doc_expiry:$('kf-exp').value }); if (!d.name) return;
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
  const sales = S.sales.filter(inR), rents = S.rentals.filter(x => inR(x) && x.status !== 'cancelled');
  const rev = sales.reduce((acc, x) => addCur(acc, x.currency, x.total), {}), rentRev = rents.reduce((s, x) => s + rentSum(x), 0);
  const disc = sales.filter(x => (x.currency || 'GEL') === 'GEL').reduce((s, x) => s + Math.max(0, (+x.list_total || 0) - (+x.total || 0)), 0);
  const units = sales.reduce((s, x) => s + (x.lines || []).reduce((qq, l) => qq + (+l.qty || 0), 0), 0);
  $('rp-stats').innerHTML = [['rs_sales_rev', moneyMulti(rev)], ['rs_rent_rev', money(rentRev)], ['rs_count', sales.length + ' / ' + units], ['rs_disc', money(disc)]].map(([k, v]) => `<div class="panel stat"><h3>${esc(t(k))}</h3><div class="v num">${v}</div></div>`).join('');
  const bs = {}, g = k => bs[k] ??= { n:0, veh:0, sum:{}, rent:0 };
  sales.forEach(s => { const o = g(s.seller || '—'); o.n++; addCur(o.sum, s.currency, s.total); o.veh += (s.lines || []).filter(l => VEH.includes(l.type)).reduce((qq, l) => qq + (+l.qty || 0), 0); });
  rents.forEach(r => { g(r.seller || '—').rent += rentSum(r); });
  const sk = Object.keys(bs).sort((x, y) => bs[y].n - bs[x].n);
  $('rp-sellers').innerHTML = sk.length ? `<table><thead><tr><th>${esc(t('seller'))}</th><th class="r">${esc(t('col_sales'))}</th><th class="r">${esc(t('col_veh'))}</th><th class="r">${esc(t('col_sum'))}</th><th class="r">${esc(t('col_rent'))}</th></tr></thead><tbody>${sk.map(k => `<tr><td>${esc(k)}</td><td class="r num">${bs[k].n}</td><td class="r num">${bs[k].veh}</td><td class="r num">${moneyMulti(bs[k].sum)}</td><td class="r num">${money(bs[k].rent)}</td></tr>`).join('')}</tbody></table>` : `<div class="empty small">${esc(t('no_records'))}</div>`;
  const bt = {}; sales.forEach(s => (s.lines || []).forEach(l => { const o = bt[l.type || 'other'] ??= { q:0, sum:{} }; o.q += +l.qty || 0; addCur(o.sum, s.currency, l.total); }));
  const tk = Object.keys(bt).sort((x, y) => bt[y].q - bt[x].q);
  $('rp-types').innerHTML = tk.length ? `<table><thead><tr><th>${esc(t('col_type'))}</th><th class="r">${esc(t('col_units'))}</th><th class="r">${esc(t('col_sum'))}*</th></tr></thead><tbody>${tk.map(k => `<tr><td>${esc(tType(k))}</td><td class="r num">${bt[k].q}</td><td class="r num">${moneyMulti(bt[k].sum)}</td></tr>`).join('')}</tbody></table><div class="pad small muted">${esc(t('excl_extra'))}</div>` : `<div class="empty small">${esc(t('no_records'))}</div>`;
  $('rp-sales').innerHTML = sales.length ? `<table><thead><tr><th>${esc(t('col_time'))}</th><th>${esc(t('col_items'))}</th><th>${esc(t('seller'))}</th><th>${esc(t('payment'))}</th><th class="r">${esc(t('col_amount'))}</th><th></th></tr></thead><tbody>${sales.map(s => `<tr data-id="${s.id}"><td class="num">${fmtTs(s.created_at)}</td>
    <td>${(s.lines || []).map(l => `${esc(l.name)}${l.qty > 1 ? ` ×${l.qty}` : ''}${+l.unit_price !== +l.list_price && +l.list_price ? ` <span class="strike">${money(l.list_price)}</span>` : ''}${+l.pct ? ` <span class="tag low">−${+l.pct}%</span>` : ''}${l.vin ? ` <span class="small muted num">VIN ${esc(l.vin)}</span>` : ''}`).join('<br>')}${s.customer_name ? `<div class="small muted">${esc(s.customer_name)} ${esc(s.phone || '')}</div>` : ''}${s.note ? `<div class="small muted">${esc(s.note)}</div>` : ''}</td>
    <td>${esc(s.seller || '')}</td><td>${esc(tPay(s.payment))}</td><td class="r num"><b>${money(s.total, s.currency)}</b>${+s.extra_discount ? `<div class="small muted">−${money(s.extra_discount, s.currency)}</div>` : ''}</td>
    <td style="white-space:nowrap"><button class="btn ghost small" data-act="srep">${esc(t('report_btn'))}</button>${isAdmin() ? `<button class="btn ghost small" data-act="edit">${esc(t('edit'))}</button><button class="btn ghost small danger" data-act="void">${esc(t('void'))}</button>` : ''}</td></tr>`).join('')}</tbody></table>` : `<div class="empty small">${esc(t('no_records'))}</div>`;
}
$('rp-period').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; S.period = b.dataset.p; $('rp-from').value = ''; $('rp-to').value = ''; renderReport(); };
$('rp-from').onchange = $('rp-to').onchange = () => { S.period = 'custom'; renderReport(); };
$('rp-sales').onclick = e => {
  const sr = e.target.closest('[data-act="srep"]'); if (sr) { const s = S.sales.find(x => x.id === sr.closest('tr').dataset.id); if (s) showReport('sale', saleReportData({ lines:s.lines || [], total:s.total, extra:s.extra_discount, payment:s.payment, seller:s.seller, cust:S.customers.find(c => c.id === s.customer_id) || (s.customer_name ? { name:s.customer_name } : null), note:s.note, date:new Date(s.created_at), currency:s.currency || 'GEL' })); return; }
  const eb = e.target.closest('[data-act="edit"]'); if (eb && isAdmin()) { const sale = S.sales.find(x => x.id === eb.closest('tr').dataset.id); askPin(pin => editSale(sale, pin)); return; }
  const b = e.target.closest('[data-act="void"]'); if (!b || !isAdmin()) return;
  const id = b.closest('tr').dataset.id;
  arm(b, async () => { try { await q(sb.rpc('void_sale', { p_id:id })); toast(t('voided')); await reload('sales', 'products'); } catch(err){ fail(err); } });
};

/* every sale edit needs the admin PIN; the server checks it again when saving */
function askPin(then){
  openOv(`<form id="pin" class="stack" style="max-width:320px;margin:0 auto;width:100%"><div class="row between"><h2>${esc(t('pin_title'))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div>
    <input id="pin-v" type="password" inputmode="numeric" autocomplete="off" maxlength="12" class="num" style="font-size:28px;text-align:center;letter-spacing:.4em" aria-label="${esc(t('pin_title'))}">
    <div id="pin-err" class="err" hidden>${esc(t('pin_wrong'))}</div>
    <button class="btn primary big" type="submit" id="pin-ok">${esc(t('pin_go'))}</button></form>`);
  $('pin-v').focus();
  $('pin').onsubmit = async e => {
    e.preventDefault();
    const pin = $('pin-v').value.trim(); if (!pin) return;
    const btn = $('pin-ok'); btn.disabled = true; $('pin-err').hidden = true;
    try { if (await q(sb.rpc('check_admin_pin', { p_pin:pin }))) { closeOv(); then(pin); return; } $('pin-err').hidden = false; $('pin-v').select(); }
    catch(err){ fail(err); } finally { if ($('pin-ok')) btn.disabled = false; }
  };
}
/* admin: fix any field of a recorded sale */
function editSale(s, pin){
  if (!s) return;
  let lines = (s.lines || []).map(l => ({ ...l }));
  const cur = s.currency || 'GEL', d0 = new Date(s.created_at);
  const opt = (list, v, lab) => { const all = list.includes(v) || !v ? list : [v, ...list]; return all.map(k => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(lab ? lab(k) : k)}</option>`).join(''); };
  openOv(`<form id="se" class="stack"><div class="row between"><h2>${esc(t('edit_sale'))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div>
    <div class="formgrid two">
      <label class="f">${esc(t('date_time'))}<input id="se-dt" type="datetime-local" required value="${toLocalInput(d0)}"></label>
      <label class="f">${esc(t('seller'))}<select id="se-seller"><option value=""></option>${opt(S.settings.sellers || [], s.seller || '')}</select></label>
      <label class="f">${esc(t('payment'))}<select id="se-pay"><option value=""></option>${opt(PAYS, s.payment || '', tPay)}</select></label>
      <label class="f">${esc(t('currency'))}<select id="se-cur">${opt(Object.keys(CUR_SIGN), cur)}</select></label>
      <label class="f">${esc(t('cust_name'))}<input id="se-cname" value="${esc(s.customer_name || '')}"></label>
      <label class="f">${esc(t('cust_phone'))}<input id="se-phone" type="tel" value="${esc(s.phone || '')}"></label>
      <label class="f" style="grid-column:1/-1">${esc(t('note'))}<input id="se-note" value="${esc(s.note || '')}"></label></div>
    <div class="small muted" style="font-weight:600">${esc(t('lines'))}</div><div id="se-lines" class="stack" style="gap:10px"></div>
    <button type="button" class="btn small" id="se-add" style="align-self:flex-start">${esc(t('line_add'))}</button>
    <div class="formgrid two"><label class="f">${esc(t('extra_disc'))}<input id="se-extra" type="number" min="0" step="0.01" inputmode="decimal" value="${+s.extra_discount || 0}"></label>
      <div class="f"><span>${esc(t('total'))}</span><b class="num" id="se-total" style="display:block;font-size:20px;padding-top:6px"></b></div></div>
    <p class="small muted" style="margin:0">${esc(t('sale_edit_note'))}</p>
    <button class="btn primary big" type="submit" id="se-save">${esc(t('save'))}</button></form>`);
  const total = () => r2(Math.max(0, lines.reduce((a, l) => a + (+l.qty || 0) * (+l.unit_price || 0), 0) - (+$('se-extra').value || 0)));
  const upd = () => { $('se-total').textContent = money(total(), $('se-cur').value); };
  const paintLines = () => {
    $('se-lines').innerHTML = lines.map((l, i) => `<div class="eline" data-i="${i}">
      <input data-k="name" value="${esc(l.name || '')}" placeholder="${esc(t('col_item'))}" aria-label="${esc(t('col_item'))}" style="grid-column:1/-1">
      <select data-k="type" aria-label="${esc(t('col_type'))}">${TYPE_KEYS.map(k => `<option value="${k}" ${k === (l.type || 'other') ? 'selected' : ''}>${esc(tType(k))}</option>`).join('')}</select>
      <input data-k="qty" type="number" min="0" step="1" inputmode="numeric" value="${+l.qty || 0}" aria-label="${esc(t('qty'))}" class="num">
      <input data-k="unit_price" type="number" min="0" step="0.01" inputmode="decimal" value="${+l.unit_price || 0}" aria-label="${esc(t('unit_price'))}" class="num">
      <button type="button" class="btn ghost small danger" data-act="rm" aria-label="${esc(t('remove'))}">×</button></div>`).join('');
    upd();
  };
  paintLines();
  $('se-lines').oninput = $('se-lines').onchange = e => { const i = +e.target.closest('[data-i]')?.dataset.i, k = e.target.dataset.k; if (!k || isNaN(i)) return; lines[i][k] = ['qty','unit_price'].includes(k) ? +e.target.value : e.target.value; upd(); };
  $('se-lines').onclick = e => { const b = e.target.closest('[data-act="rm"]'); if (!b) return; lines.splice(+b.closest('[data-i]').dataset.i, 1); paintLines(); };
  $('se-add').onclick = () => { lines.push({ product_id:null, name:'', type:'other', list_price:0, unit_price:0, qty:1, pct:0 }); paintLines(); $('se-lines').querySelector('.eline:last-child input')?.focus(); };
  $('se-extra').oninput = $('se-cur').onchange = upd;
  $('se').onsubmit = async e => {
    e.preventDefault();
    const dt = new Date($('se-dt').value); if (isNaN(dt)) return;
    const clean = lines.filter(l => String(l.name || '').trim() || +l.unit_price).map(l => {
      const qty = +l.qty || 0, up = r2(l.unit_price), lp = Math.max(+l.list_price || 0, up);
      return { ...l, name:String(l.name || '').trim(), qty, unit_price:up, list_price:lp, pct: lp && up < lp ? r2((1 - up / lp) * 100) : 0, total:r2(qty * up) };
    });
    const patch = { created_at:dt.toISOString(), day:dayKey(dt), lines:clean, list_total:r2(clean.reduce((a, l) => a + l.qty * l.list_price, 0)),
      extra_discount:r2(+$('se-extra').value || 0), total:total(), seller:$('se-seller').value, payment:$('se-pay').value, currency:$('se-cur').value,
      customer_name:$('se-cname').value.trim(), phone:$('se-phone').value.trim(), note:$('se-note').value.trim() };
    const btn = $('se-save'); btn.disabled = true;
    try { await q(sb.rpc('edit_sale', { p_pin:pin, p_id:s.id, p_patch:patch })); closeOv(); toast(t('saved')); await reload('sales'); }
    catch(err){ fail(err); btn.disabled = false; }
  };
}

/* ================= settings ================= */
function renderSettings(){
  const sl = S.settings.sellers || [];
  renderStaffList();
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
$('sf-add').onclick = async () => {
  const name = $('sf-name').value.trim(), pw = $('sf-pw').value, role = $('sf-role').value;
  if (!name) { $('sf-name').focus(); return; } if (pw.length < 6) { toast(t('pw_short')); $('sf-pw').focus(); return; }
  const btn = $('sf-add'); btn.disabled = true;
  try { await q(sb.rpc('admin_create_staff', { p_name:name, p_role:role, p_password:pw, p_phone:'' })); $('sf-name').value = ''; $('sf-pw').value = ''; toast(t('staff_created')); await reload('staff', 'settings'); }
  catch(e){ fail(e); } finally { btn.disabled = false; }
};
$('st-staff').onclick = e => { const b = e.target.closest('[data-email]'); if (b) openStaff(b.dataset.email); };
$('st-log').onclick = () => openStaff(null);

/* ================= profiles + activity log ================= */
const staffName = x => x?.name || x?.email || '';
function renderStaffList(){
  const list = [...S.staff].sort((a, b) => (b.active - a.active) || (a.role === 'admin' ? -1 : 1) - (b.role === 'admin' ? -1 : 1) || staffName(a).localeCompare(staffName(b)));
  $('st-staff').innerHTML = list.length ? list.map(x => `<button type="button" class="tariff staffrow ${x.active ? '' : 'off'}" data-email="${esc(x.email)}">
      <span class="row" style="gap:8px;flex-wrap:nowrap"><span class="role ${x.role === 'admin' ? 'admin' : ''}">${x.role === 'admin' ? STAR : PERSON}</span><b>${esc(x.name || t('shared_account'))}</b>${x.active ? '' : ` <span class="tag out">${esc(t('inactive'))}</span>`}</span>
      <span class="small muted">${esc(x.phone || '')} ›</span></button>`).join('') : `<div class="small muted">—</div>`;
}
$('who-btn').onclick = () => openMe();
function openMe(){
  const u = S.user; if (!u) return;
  openOv(`<div class="row between"><h2>${esc(t('my_profile'))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div>
    <div class="row" style="gap:10px"><span class="role ${isAdmin() ? 'admin' : ''}">${isAdmin() ? STAR : PERSON}</span><span class="muted">${esc(t(isAdmin() ? 'role_admin' : 'role_cons'))}</span></div>
    <form id="me-f" class="stack"><div class="formgrid two">
      <label class="f">${esc(t('cust_name'))}<input id="me-name" value="${esc(u.name)}" required></label>
      <label class="f">${esc(t('cust_phone'))}<input id="me-phone" type="tel" value="${esc(u.phone || '')}"></label></div>
      <button class="btn primary" id="me-save">${esc(t('save'))}</button></form>
    <form id="me-pw" class="stack"><h3 style="margin:8px 0 0">${esc(t('change_pw'))}</h3><div class="formgrid two">
      <label class="f">${esc(t('pw_old'))}<input id="me-old" type="password" autocomplete="current-password" required></label>
      <label class="f">${esc(t('pw_new'))}<input id="me-new" type="password" autocomplete="new-password" minlength="6" required></label></div>
      <button class="btn" id="me-pw-save">${esc(t('change_pw'))}</button></form>
    ${isAdmin() ? `<button type="button" class="btn ghost" id="me-staff">${esc(t('staff_title'))} ›</button>` : ''}`);
  $('me-f').onsubmit = async e => {
    e.preventDefault(); const btn = $('me-save'); btn.disabled = true;
    try { const name = $('me-name').value.trim(), phone = $('me-phone').value.trim();
      await q(sb.rpc('update_my_profile', { p_name:name, p_phone:phone })); Object.assign(S.user, { name, phone }); toast(t('saved')); closeOv(); renderAll(); await reload('sales', 'rentals', 'settings', 'staff'); }
    catch(err){ fail(err); } finally { btn.disabled = false; }
  };
  $('me-pw').onsubmit = async e => {
    e.preventDefault(); const nw = $('me-new').value; if (nw.length < 6) { toast(t('pw_short')); return; }
    const btn = $('me-pw-save'); btn.disabled = true;
    try { await q(sb.rpc('my_set_password', { p_old:$('me-old').value, p_new:nw })); $('me-old').value = $('me-new').value = ''; toast(t('pw_changed')); }
    catch(err){ fail(err); } finally { btn.disabled = false; }
  };
  if ($('me-staff')) $('me-staff').onclick = () => { closeOv(); S.tab = 'settings'; buildTabs(); render(); $('st-staff')?.scrollIntoView({ block:'center' }); };
}
/* admin: one employee (email) or everybody (null) — details, totals, everything they did */
async function openStaff(email){
  if (!isAdmin()) return;
  const x = email ? S.staff.find(y => y.email === email) : null; if (email && !x) return;
  const me = x && x.email === S.user.email, nm = x?.name || '';
  const [a, b] = [dayKey(new Date(Date.now() - 29 * 864e5)), dayKey(new Date())], today = dayKey(new Date());
  const mine = arr => arr.filter(r => !x || (r.seller || '') === nm);
  const sl = mine(S.sales), rl = mine(S.rentals.filter(r => r.status !== 'cancelled'));
  const st = (arr, from, sum) => { const f = arr.filter(r => r.day >= from && r.day <= b); return `${f.length} · ${money(f.reduce((s, r) => s + sum(r), 0))}`; };
  openOv(`<div class="row between"><h2>${x ? `<span class="role ${x.role === 'admin' ? 'admin' : ''}" style="vertical-align:-4px">${x.role === 'admin' ? STAR : PERSON}</span> ${esc(x.name || t('shared_account'))}` : esc(t('all_activity'))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div>
    ${x ? `<form id="sx" class="stack"><div class="formgrid two">
      <label class="f">${esc(t('cust_name'))}<input id="sx-name" value="${esc(x.name || '')}"></label>
      <label class="f">${esc(t('cust_phone'))}<input id="sx-phone" type="tel" value="${esc(x.phone || '')}"></label>
      <label class="f">${esc(t('role'))}<select id="sx-role" ${me ? 'disabled' : ''}><option value="consultant">${esc(t('role_cons'))}</option><option value="admin" ${x.role === 'admin' ? 'selected' : ''}>${esc(t('role_admin'))}</option></select></label>
      <label class="f">${esc(t('pw_new'))}<input id="sx-pw" type="password" autocomplete="new-password" placeholder="${esc(t('pw_keep'))}"></label></div>
      <label class="row small"><input type="checkbox" id="sx-active" ${x.active ? 'checked' : ''} ${me ? 'disabled' : ''}> ${esc(t('account_active'))}</label>
      <button class="btn primary" id="sx-save">${esc(t('save'))}</button></form>` : ''}
    ${!x || x.name ? `<div class="stats small3">${[['sale_today', st(sl, today, r => +r.total || 0)], ['p_month30', st(sl, a, r => +r.total || 0)], ['rent_today', st(rl, today, rentSum)], ['rent_month30', st(rl, a, rentSum)]].map(([k, v]) => `<div class="panel stat"><h3>${esc(t(k))}</h3><div class="v num">${v}</div></div>`).join('')}</div>` : ''}
    <h3 style="margin:6px 0 0">${esc(t('activity'))}</h3><div id="sx-log" class="actlog"><div class="small muted">${esc(t('loading'))}</div></div>`, 'wide');
  if (x) $('sx').onsubmit = async e => {
    e.preventDefault(); const pw = $('sx-pw').value; if (pw && pw.length < 6) { toast(t('pw_short')); return; }
    const patch = { name:$('sx-name').value.trim(), phone:$('sx-phone').value.trim() };
    if (!me) Object.assign(patch, { role:$('sx-role').value, active:$('sx-active').checked });
    if (pw) patch.password = pw;
    const btn = $('sx-save'); btn.disabled = true;
    try { await q(sb.rpc('admin_update_staff', { p_email:x.email, p_patch:patch })); toast(t('saved')); if (me) S.user.name = patch.name || S.user.name; closeOv(); await reload('staff', 'settings', 'sales', 'rentals'); renderAll(); }
    catch(err){ fail(err); btn.disabled = false; }
  };
  let rows = [];
  try { let qq = sb.from('audit_log').select('*'); if (x) qq = qq.eq('email', x.email); rows = await q(qq.order('at', { ascending:false }).limit(400)) || []; }
  catch(e){ console.error(e); if ($('sx-log')) $('sx-log').innerHTML = `<div class="small muted">${esc(t('save_failed'))}</div>`; return; }
  if (!$('sx-log')) return;
  const saleTx = new Set(rows.filter(e => e.tbl === 'sales' && e.action !== 'update').map(e => e.txid));
  const items = rows.map(e => logLine(e, saleTx)).filter(Boolean);
  let lastDay = '';
  $('sx-log').innerHTML = items.length ? items.map(({ e, icon, text }) => { const d = fmtD(new Date(e.at)), head = d !== lastDay ? `<div class="logday">${esc(d)}</div>` : ''; lastDay = d;
    return `${head}<div class="logrow"><span class="num muted">${fmtTime(e.at)}</span><span class="logic">${icon}</span><span>${x ? '' : `<b>${esc(e.name || e.email)}</b> · `}${text}</span></div>`; }).join('') : `<div class="small muted">${esc(t('no_records'))}</div>`;
}
const fmtTime = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const LOGF = { price:'price', qty:'qty', seller:'seller', payment:'payment', total:'total', status:'rent_status', name:'cust_name', phone:'cust_phone', deposit:'deposit',
  late_fee:'late_fee', ends_at:'return_by', returned_at:'returned_at', unit_label:'unit', type:'col_type', customer_name:'col_customer', note:'note', extra_discount:'extra_disc',
  created_at:'col_time', currency:'currency', code:'code', color:'f_color', year:'f_year', model:'f_name', number:'fleet_num', id_number:'cust_id', sellers:'sellers', tariffs:'tariffs_title', role:'role', active:'account_active' };
const LOG_SKIP = ['day','txid','signature','contract','created_by','updated_at','rate','photo','photos','list_total','late_paid_at','late_hours','late_payment','cancelled_at','user_id'];
function logVal(k, v){
  if (v == null || v === '') return '—';
  if (/(_at)$/.test(k)) return fmtTs(v);
  if (['price','total','deposit','late_fee','extra_discount'].includes(k)) return money(v);
  if (k === 'status') return t(v === 'active' ? 'st_active' : v === 'returned' ? 'returned_btn' : v === 'cancelled' ? 'st_cancelled' : v);
  if (k === 'payment') return tPay(v); if (k === 'type') return tType(v);
  if (k === 'role') return t(v === 'admin' ? 'role_admin' : 'role_cons');
  if (k === 'active') return t(v ? 'yes' : 'no');
  if (Array.isArray(v)) return v.every(i => typeof i !== 'object') ? v.join(', ') : '…';
  if (typeof v === 'object') return '…';
  return String(v);
}
const IC = { sale:'🛒', rent:'🛵', ret:'↩️', cancel:'✖️', edit:'✏️', stock:'📦', cust:'👤', login:'🔑', staff:'👥', set:'⚙️', fleet:'🚲' };
function logLine(e, saleTx){
  const d = e.data || {}, row = d._row || d;
  const ch = Object.keys(d).filter(k => k !== '_row' && !LOG_SKIP.includes(k) && d[k] && typeof d[k] === 'object' && !Array.isArray(d[k]) && 'to' in d[k]);
  const diff = ch.map(k => `${esc(LOGF[k] ? t(LOGF[k]) : k)}: ${esc(logVal(k, d[k].from))} → <b>${esc(logVal(k, d[k].to))}</b>`).join(' · ');
  const L = (icon, label, rest) => ({ e, icon:IC[icon], text:`${esc(t(label))}${rest ? ': ' + rest : ''}` });
  const veh = r => esc([tType(r.type), r.unit_label].filter(Boolean).join(' · '));
  switch (e.tbl + ':' + e.action) {
    case ':login': return L('login', 'log_login');
    case 'sales:insert': return L('sale', 'log_sale', `${esc((d.lines || []).map(l => l.name + (+l.qty > 1 ? ' ×' + l.qty : '')).join(', '))} — <b>${money(d.total)}</b>${d.customer_name ? ' · ' + esc(d.customer_name) : ''}`);
    case 'sales:update': return L('edit', 'log_sale_edit', `${esc((row.lines || []).map(l => l.name).join(', ') || money(row.total))}${diff ? ' — ' + diff : ''}${d.lines ? ' · ' + esc(t('lines')) : ''}`);
    case 'sales:delete': return L('cancel', 'log_sale_void', `${esc((d.lines || []).map(l => l.name).join(', '))} — ${money(d.total)}`);
    case 'rentals:insert': return L('rent', 'log_rent', `${veh(d)} · ${esc(d.customer_name || '')} — <b>${money(d.price)}</b>`);
    case 'rentals:update': {
      if (!ch.length) return null;
      if (d.status?.to === 'returned') return L('ret', 'log_rent_return', `${veh(row)} · ${esc(row.customer_name || '')}${+row.late_fee ? ` — ${esc(t('late_fee'))} <b>${money(row.late_fee)}</b>` : ''}`);
      if (d.status?.to === 'cancelled') return L('cancel', 'log_rent_cancel', `${veh(row)} · ${esc(row.customer_name || '')} — ${money(row.price)}`);
      return L('edit', 'log_rent_edit', `${veh(row)} · ${esc(row.customer_name || '')} — ${diff}`);
    }
    case 'rentals:delete': return L('cancel', 'log_rent_cancel', `${veh(d)} · ${esc(d.customer_name || '')}`);
    case 'products:insert': return L('stock', 'log_prod_add', `${esc(d.name || '')}${d.code ? ' (' + esc(d.code) + ')' : ''} · ${d.qty} · ${money(d.price)}`);
    case 'products:update': if (!ch.length || (ch.every(k => k === 'qty') && saleTx.has(e.txid))) return null; return L('stock', 'log_prod_edit', `${esc(row.name || '')} — ${diff}`);
    case 'products:delete': return L('cancel', 'log_prod_del', esc(d.name || ''));
    case 'customers:insert': return L('cust', 'log_cust_add', `${esc(d.name || '')} ${esc(d.phone || '')}`);
    case 'customers:update': if (!ch.length) return null; return L('cust', 'log_cust_edit', `${esc(row.name || '')} — ${diff}`);
    case 'customers:delete': return L('cancel', 'log_cust_del', esc(d.name || ''));
    case 'fleet:insert': case 'fleet:update': case 'fleet:delete': return L('fleet', 'log_fleet', `${esc(fleetLabel(row))}${diff ? ' — ' + diff : ''}`);
    case 'settings:update': return ch.length ? L('set', 'log_settings', ch.map(k => esc(LOGF[k] ? t(LOGF[k]) : k)).join(', ')) : null;
    case 'staff:staff_create': return L('staff', 'log_staff_create', `${esc(d.name || '')} · ${esc(logVal('role', d.role))}`);
    case 'staff:staff_update': return L('staff', 'log_staff_edit', `${esc(d.who || '')} — ${Object.keys(d).filter(k => k !== 'who' && d[k] != null).map(k => `${esc(LOGF[k] ? t(LOGF[k]) : k)}: ${esc(k === 'password' ? '***' : logVal(k, d[k]))}`).join(' · ')}`);
  }
  return { e, icon:'•', text:esc(e.tbl + ' ' + e.action) };
}

/* ================= render ================= */
function render(){ if (!S.user) return; ({ sale:renderSale, stock:renderStock, rent:renderRent, customers:renderCustomers, report:renderReport, settings:renderSettings })[S.tab](); }
function renderAll(){
  applyI18n(); buildTabs();
  $('who-name').textContent = S.user?.name || '';
  const rl = S.user ? t(isAdmin() ? 'role_admin' : 'role_cons') : '';
  $('who-role').innerHTML = !S.user ? '' : isAdmin()
    ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.8l2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.2l-5.62 2.9 1.07-6.27L2.9 9.4l6.3-.9z"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
  $('who-role').title = rl; $('who-role').setAttribute('aria-label', rl); $('who-role').setAttribute('role', 'img');
  $('who-role').className = 'role' + (isAdmin() ? ' admin' : '');
  ['c-cust','r-cust'].forEach(id => mountPicker(id));
  render();
}

boot();
})();
