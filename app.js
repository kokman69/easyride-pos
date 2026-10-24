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
  document.documentElement.lang = LANG; document.title = 'Easyride ' + t('fin_cash');
  document.querySelectorAll('[data-i]').forEach(el => el.textContent = t(el.dataset.i));
  document.querySelectorAll('[data-iph]').forEach(el => el.placeholder = t(el.dataset.iph));
  document.querySelectorAll('[data-i-title]').forEach(el => { el.title = t(el.dataset.iTitle); el.setAttribute('aria-label', el.title); });
  ['lang-g','lang-a'].forEach(id => $(id).innerHTML = LANGS.map(([k,n]) => `<option value="${k}" ${k===LANG?'selected':''}>${n}</option>`).join(''));
  ['c-pay','r-pay','r-dep-pay'].forEach(id => { const v = $(id).value; $(id).innerHTML = PAYS.filter(p => id === 'c-pay' || p !== 'installment').map(p => `<option value="${p}" ${p===v?'selected':''}>${esc(tPay(p))}</option>`).join(''); });
  document.querySelectorAll('select.pillsel').forEach(paintPills);
}
function setLang(l){ LANG = l; ls.set('er-lang', l); applyI18n(); if (S.user) { renderAll(); ['c-cust','r-cust'].forEach(id => mountPicker(id, true)); renderVideo(); renderDayBanner(); { const v = [$('fn-count')?.value, $('fn-cnote')?.value]; paintHomeCash(); if ($('fn-count') && v[0]) $('fn-count').value = v[0]; if ($('fn-cnote') && v[1]) $('fn-cnote').value = v[1]; } if (!$('opengate').hidden) $('og-hi').textContent = t('og_hi').replace('{n}', S.user.name || ''); } else renderGate(); }
$('lang-g').onchange = e => setLang(e.target.value);
$('lang-a').onchange = e => setLang(e.target.value);

/* ================= light / dark ================= */
const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
const darkMQ = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
const curTheme = () => document.documentElement.dataset.theme || 'dark';   // dark unless light was picked
function paintTheme(){
  const dark = curTheme() === 'dark';
  document.querySelectorAll('.theme-btn').forEach(b => b.innerHTML = dark ? SUN : MOON);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#17181a' : '#f3f3f4');
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
/* admin = owner (everything); moderator = admin rights except managing staff accounts; consultant = seller */
const isAdmin = () => S.user?.role === 'admin' || S.user?.role === 'moderator';
const isOwner = () => S.user?.role === 'admin';

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
const plateOf = p => String(p?.plate || '').trim();
const normQ = x => String(x || '').toLowerCase().replace(/[\s-]/g, '');
// item codes: "120", "0120" and "00120" are the same code
const normCode = x => normQ(x).replace(/^0+(?=[0-9a-z])/, '');
const codeHit = (p, qq) => !!p.code && !!normCode(qq) && normCode(p.code) === normCode(qq);
const byCode = (qq, avail) => (avail || S.products).find(p => codeHit(p, qq));
/* colours and vehicle kinds typed in Georgian (data) shown in the chosen language; names of people and goods stay as written */
const KA_DATA = { 'ვერცხლისფერი':['Silver','Серебристый','シルバー'], 'წითელი':['Red','Красный','赤'], 'მწვანე':['Green','Зелёный','緑'], 'შავი':['Black','Чёрный','黒'],
  'თეთრი':['White','Белый','白'], 'ლურჯი':['Blue','Синий','青'], 'ცისფერი':['Light blue','Голубой','水色'], 'ყვითელი':['Yellow','Жёлтый','黄'], 'ნაცრისფერი':['Grey','Серый','グレー'],
  'მუქი ნაცრისფერი':['Dark grey','Тёмно-серый','ダークグレー'], 'ღია ნაცრისფერი':['Light grey','Светло-серый','ライトグレー'], 'მუქი':['Dark','Тёмный','ダーク'], 'ღია':['Light','Светлый','ライト'],
  'ყავისფერი':['Brown','Коричневый','茶色'], 'ნარინჯისფერი':['Orange','Оранжевый','オレンジ'], 'ვარდისფერი':['Pink','Розовый','ピンク'], 'იისფერი':['Purple','Фиолетовый','紫'],
  'ოქროსფერი':['Gold','Золотистый','ゴールド'], 'კრემისფერი':['Cream','Кремовый','クリーム'], 'ბეჟი':['Beige','Бежевый','ベージュ'], 'მოვერცხლისფრო':['Silver','Серебристый','シルバー'],
  'გარბენი':['Mileage','Пробег','走行距離'], 'ძრავი':['Engine','Двигатель','エンジン'], 'საბურავები':['Tyres','Шины','タイヤ'] };
let KA_ALL = null;
function locData(s, lg){
  const ix = lg ? langIdx(lg) : li();
  if (s == null || !ix || !/[\u10D0-\u10FF]/.test(s)) return s;
  if (!KA_ALL) { KA_ALL = { ...KA_DATA }; for (const [k, v] of Object.entries(L)) if (/^t_/.test(k) && Array.isArray(v) && v[0]) KA_ALL[v[0]] = v.slice(1); }
  const one = w => KA_ALL[w]?.[ix - 1] ?? KA_ALL[w.toLowerCase()]?.[ix - 1];
  return String(s).replace(/[\u10D0-\u10FF]+(?:[ -][\u10D0-\u10FF]+)*/g, m => one(m) ?? m.split(/([ -])/).map(w => one(w) ?? w).join(''));
}
/* Georgian letters left in a report for another language (names, notes) are written in Latin letters */
const KA_LAT = { 'ა':'a','ბ':'b','გ':'g','დ':'d','ე':'e','ვ':'v','ზ':'z','თ':'t','ი':'i','კ':'k','ლ':'l','მ':'m','ნ':'n','ო':'o','პ':'p','ჟ':'zh','რ':'r','ს':'s','ტ':'t','უ':'u','ფ':'p','ქ':'k','ღ':'gh','ყ':'q','შ':'sh','ჩ':'ch','ც':'ts','ძ':'dz','წ':'ts','ჭ':'ch','ხ':'kh','ჯ':'j','ჰ':'h' };
const kaLatin = s => String(s).replace(/[\u10D0-\u10FF]+/g, w => { const l = [...w].map(ch => KA_LAT[ch] ?? '').join(''); return l.charAt(0).toUpperCase() + l.slice(1); });
/* a nationality typed as a Georgian country name → its code, so every language gets its own name */
const natCode = n => { const s = String(n || '').trim(); if (!/[\u10D0-\u10FF]/.test(s)) return s; const hit = Object.entries(window.ER_COUNTRY_KA || {}).find(([, v]) => v === s); return hit ? hit[0] : s; };
if (window.ER_REPORT) window.ER_REPORT.localize = (s, lg) => kaLatin(locData(s, lg));
const pMeta = p => [tType(p.type), p.year, locData(p.color), p.engine].filter(Boolean).join(' · ');
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
  else if (name === 'sales') ALLV_AT = 0, S.sales = await q(sb.from('sales').select('*').order('created_at', { ascending:false }).limit(1000));
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
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.user) { reload(...TABLES); loadDayReps().then(renderDayBanner); } });
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
const SHIELD = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5 4 5.6v5.9c0 5 3.4 9.1 8 10.5 4.6-1.4 8-5.5 8-10.5V5.6z"/><path d="m8.6 12.2 2.4 2.4 4.6-4.8" fill="none" stroke="var(--role-ink,#161616)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ROLES = ['admin', 'moderator', 'consultant'];
const roleIcon = r => r === 'admin' ? STAR : r === 'moderator' ? SHIELD : PERSON;
const roleCls = r => 'role' + (r === 'admin' ? ' admin' : r === 'moderator' ? ' mod' : '');
const roleKey = r => r === 'admin' ? 'role_admin' : r === 'moderator' ? 'role_mod' : 'role_cons';
const roleBadge = (r, style = '') => `<span class="${roleCls(r)}"${style ? ` style="${style}"` : ''} title="${esc(t(roleKey(r)))}">${roleIcon(r)}</span>`;
async function renderGate(){
  if (!LOGIN) { try { LOGIN = await q(sb.rpc('login_list')) || []; } catch(e){ console.error(e); LOGIN = []; } }
  if (!LOGIN.length) return renderGateOld();
  const paint = () => {
    const list = LOGIN, last = ls.get('er-gemail');
    $('gate-body').innerHTML = `<form id="g-login" class="stack">
      ${list.length ? '' : `<div class="small muted">${esc(t('no_accounts'))}</div>`}
      <label class="f">${esc(t('password'))}<input id="g-pw" type="password" autocomplete="current-password" required autofocus></label>
      <div id="g-err" class="err" hidden></div>
      <button class="btn primary big" id="g-btn" ${list.length ? '' : 'disabled'}>${esc(t('login_btn'))}</button></form>`;
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
        ls.set('er-temp', null);
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
  S.user = { role: ROLES.includes(role) ? role : 'consultant', email: me?.email || '', phone: me?.phone || '',
    name: me?.name || ls.get('er-name') || (S.settings.sellers || [])[0] || '' };
  $('gate').hidden = true; $('app').hidden = false;
  S.tab = 'home'; renderAll();
  await reload(...TABLES);
  loadDayReps().then(renderDayBanner);
  openGateCheck();
  subscribeLive();
}
function showGate(){ S.user = null; S.cart = []; LOGIN = null; $('app').hidden = true; $('gate').hidden = false; renderGate(); }
$('logout').onclick = async () => { ls.set('er-temp', null); try { await sb.auth.signOut(); } catch(e){} showGate(); };

/* ================= tabs ================= */
const ICONS = {
  cash:'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>',
  home:'<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  sale:'<path d="M3 7h18l-2 11H5L3 7z"/><path d="M8 7a4 4 0 0 1 8 0"/>',
  stock:'<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  rent:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  customers:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  report:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  fin:'<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
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
  // sale and rental are filled on the home page; finance → only the register card, now on the cash desk page
  let tabs = isAdmin() ? ['home','cash','stock','customers','report','settings'] : ['home','cash','stock','customers','report'];
  if (isSimple()) tabs = ['home','cash','customers'];
  if (!tabs.includes(S.tab)) S.tab = 'home';
  if (S.tab !== 'home') S.hmode = '';   // back on the home page: the two buttons, nothing open
  placeHome(S.tab === 'home');
  paintMode();
  $('tabs').innerHTML = tabs.map(k => `<button data-tab="${k}" role="tab" aria-selected="${k===S.tab}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg><span>${esc(t('tab_' + k))}</span></button>`).join('');
  ['home','cash','sale','stock','rent','customers','fin','report','settings'].forEach(k => $('v-' + k).hidden = k !== S.tab);
  if (S.tab !== 'cash') $('h-cash').innerHTML = '';   // the register card lives on one page at a time (same ids as on Finance)
  $('p-add').hidden = $('p-add-veh').hidden = !isAdmin();
}
$('tabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.tab = b.dataset.tab; if (S.tab === 'fin') S.fin.ready = null; closeSheet(); buildTabs(); render(); window.scrollTo(0, 0); };
function typeChips(el, cur, onPick, counts){
  const keys = TYPE_KEYS.filter(k => counts[k]);
  el.innerHTML = `<button class="chip" aria-pressed="${!cur}" data-t="">${esc(t('all'))}</button>` + keys.map(k => `<button class="chip" aria-pressed="${cur===k}" data-t="${k}">${esc(tType(k))} <span class="num">${counts[k]}</span></button>`).join('');
  el.onclick = e => { const b = e.target.closest('.chip'); if (b) onPick(b.dataset.t); };
}
const match = (p, qq) => { if (!qq) return true; const hay = [p.plate, p.name, p.brand, p.color, p.code, p.year, tType(p.type), p.note].join(' ').toLowerCase(); return hay.includes(qq.toLowerCase()) || (!!plateOf(p) && normQ(plateOf(p)).includes(normQ(qq))) || (!!p.code && !!normCode(qq) && normCode(p.code).startsWith(normCode(qq))); };

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
$('r-dep-cur').addEventListener('change', () => { const sp = $('r-dep').closest('.f').querySelector('span[data-i="deposit"]'); if (sp) sp.textContent = t('deposit').replace('₾', CUR_SIGN[$('r-dep-cur').value] || '₾'); });
/* small segmented buttons in place of a <select class="pillsel"> (the select stays as the value holder) */
function paintPills(sel){
  let box = sel.nextElementSibling;
  if (!box || !box.classList.contains('pills')) { box = document.createElement('div'); box.className = 'pills' + (sel.classList.contains('cur') ? ' cur' : ''); box.setAttribute('role', 'radiogroup'); sel.after(box);
    box.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; sel.value = b.dataset.v; sel.dispatchEvent(new Event('change', { bubbles:true })); paintPills(sel); }; }
  box.innerHTML = [...sel.options].map(o => `<button type="button" data-v="${esc(o.value)}" role="radio" aria-pressed="${o.value === sel.value}">${esc(o.textContent)}</button>`).join('');
}
function closeOv(){ $('ov').hidden = true; $('ov').innerHTML = ''; document.body.style.overflow = ''; }
$('ov').onclick = e => { if (e.target === $('ov')) closeOv(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('ov').hidden) closeOv(); else closeSheet(); } });
/* vehicle / item details: big photo with thumbnails, every known fact, and "add to sale" */
const MILE_K = 'გარბენი';
const mileOf = p => String(p?.specs?.[MILE_K] ?? '').trim();
function showGallery(p, fromSale){
  if (!p) return;
  const veh = !isEasy(p), photos = p.photos || [];
  const left = (+p.qty || 0) - S.cart.filter(l => l.productId === p.id).reduce((x, l) => x + l.qty, 0);
  const mile = mileOf(p);
  const facts = [
    ['f_type', tType(p.type)], ['f_brand', p.brand], ['f_year', p.year],
    ...(veh ? [['f_mileage', !mile ? '—' : /^\d[\d\s]*$/.test(mile) ? `${mile.replace(/\s/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ${t('km')}` : mile]] : []),
    ['f_color', locData(p.color)], ['f_engine', p.engine], [veh ? 'vin_l' : 'f_code', p.code], ['in_stock_label', `${+p.qty || 0} ${t('pcs')}`]
  ].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');
  const specs = Object.entries(p.specs || {}).filter(([k, v]) => v && k !== MILE_K);
  openOv(`<div class="row between" style="flex-wrap:nowrap;align-items:flex-start"><h2>${plateOf(p) ? `<span class="plate">${esc(plateOf(p))}</span> ` : ''}${esc(pName(p))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div>
    <div class="pdet">
      <div class="pdet-media">${photos.length ? `<div class="pdet-main"><img id="pd-main" src="${esc(photoUrl(photos[0]))}" alt="${esc(pName(p))}">${photos.length > 1 ? `<button type="button" class="pdet-nav prev" data-step="-1" aria-label="‹">‹</button><button type="button" class="pdet-nav next" data-step="1" aria-label="›">›</button><span class="pdet-count num" id="pd-count">1 / ${photos.length}</span>` : ''}</div>
        ${photos.length > 1 ? `<div class="pdet-thumbs">${photos.map((ph, i) => `<button type="button" data-i="${i}" aria-pressed="${i === 0}"><img src="${esc(photoUrl(ph))}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}`
        : `<div class="pdet-main empty muted">${esc(t('cust_no_photo'))}</div>`}</div>
      <div class="pdet-info">
        <div class="pdet-price num">${+p.price ? money(p.price) : esc(t('negotiable'))}</div>
        <dl class="specs pdet-facts">${facts.map(([k, v]) => `<dt>${esc(t(k))}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        ${specs.length ? `<h3 style="margin:6px 0 0">${esc(t('specs_title'))}</h3><dl class="specs">${specs.map(([k, v]) => `<dt>${esc(locData(k))}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
        ${p.note ? `<p class="small" style="color:var(--warn);margin:0">${esc(p.note)}</p>` : ''}
        ${p.source_url ? `<a class="small" href="${esc(p.source_url)}" target="_blank" rel="noopener">${esc(t('view_site'))} ↗</a>` : ''}
        <div class="row" style="gap:8px;margin-top:auto">${fromSale ? `<button type="button" class="btn primary big" id="pd-add" ${left > 0 ? '' : 'disabled'} style="flex:1;width:auto">${esc(t(left > 0 ? 'add_to_sale' : 'out'))}</button>` : ''}
          ${isAdmin() ? `<button type="button" class="btn" id="pd-edit">${esc(t('edit'))}</button>` : ''}</div>
      </div></div>`, 'wide');
  let cur = 0;
  const go = i => { if (!photos.length) return; cur = (i + photos.length) % photos.length; $('pd-main').src = photoUrl(photos[cur]); if ($('pd-count')) $('pd-count').textContent = `${cur + 1} / ${photos.length}`;
    $('ov').querySelectorAll('.pdet-thumbs [data-i]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.i === cur)); };
  $('ov').querySelector('.pdet-media').onclick = e => { const th = e.target.closest('[data-i]'); if (th) return go(+th.dataset.i); const st = e.target.closest('[data-step]'); if (st) return go(cur + +st.dataset.step);
    if (e.target.id === 'pd-main') e.target.closest('.pdet-main').classList.toggle('zoom'); };
  const keys = e => { if (!$('pd-main')) { document.removeEventListener('keydown', keys); return; } if (e.key === 'ArrowRight') go(cur + 1); else if (e.key === 'ArrowLeft') go(cur - 1); };
  document.addEventListener('keydown', keys);
  if ($('pd-add')) $('pd-add').onclick = () => { closeOv(); addToCart(p.id); };
  if ($('pd-edit')) $('pd-edit').onclick = () => { closeOv(); openProduct(p); };
}
async function viewIdPhoto(path){
  if (!path) return;
  openOv(`<div class="row between"><h2>${esc(t('cust_photo'))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div><div id="ph-box" class="muted">${esc(t('loading'))}</div>`);
  try { const d = await q(sb.storage.from('id-photos').createSignedUrl(path, 600)); const b = $('ph-box'); if (b) b.innerHTML = `<img class="big" src="${esc(d.signedUrl)}" alt="${esc(t('cust_photo'))}">`; }
  catch(e){ fail(e); }
}

/* ================= document scan (passport / ID) ================= */
const OCR_W = {};
const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); });
/* one OCR worker per language: "mrz" = model trained on passport / ID machine-readable zones (served with the site),
   eng / rus / kat for the printed page */
async function ocrWorker(lang){
  if (!OCR_W[lang]) OCR_W[lang] = (async () => {
    if (!window.Tesseract) await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
    return window.Tesseract.createWorker(lang, 1, lang === 'mrz' ? { langPath:new URL('ocr', location.href).href, gzip:false } : {});
  })().catch(e => { delete OCR_W[lang]; throw e; });
  return OCR_W[lang];
}
const getOcr = () => ocrWorker('eng');
async function bitmapOf(blob){
  if (window.createImageBitmap) { try { return await createImageBitmap(blob, { imageOrientation:'from-image' }); } catch(e){} }
  return new Promise((res, rej) => { const i = new Image(), u = URL.createObjectURL(blob); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = rej; i.src = u; });
}
// the photo turned by rot degrees and scaled to ~width px, in grey; bin = black/white (Otsu) for the MRZ
function prep(bmp, rot, width, bin){
  const W = bmp.width, H = bmp.height, side = rot === 90 || rot === -90, sw = side ? H : W, sh = side ? W : H, k = Math.min(width / sw, 3);
  const c = document.createElement('canvas'), x = c.getContext('2d', { willReadFrequently:true });
  c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.translate(c.width / 2, c.height / 2); x.rotate(rot * Math.PI / 180);
  x.drawImage(bmp, -W * k / 2, -H * k / 2, W * k, H * k);
  x.setTransform(1, 0, 0, 1, 0, 0);
  const img = x.getImageData(0, 0, c.width, c.height), d = img.data, hist = new Array(256).fill(0);
  for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0; d[i] = d[i + 1] = d[i + 2] = g; hist[g]++; }
  if (bin) {
    const n = d.length / 4; let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sb = 0, wb = 0, best = 0, th = 128;
    for (let i = 0; i < 256; i++) { wb += hist[i]; if (!wb) continue; const wf = n - wb; if (!wf) break; sb += i * hist[i];
      const mb = sb / wb, mf = (sum - sb) / wf, v = wb * wf * (mb - mf) ** 2; if (v > best) { best = v; th = i; } }
    for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = d[i] > th ? 255 : 0;
  }
  x.putImageData(img, 0, 0);
  return c;
}
/* the document itself: the bright card on a darker table / background, found by row and column brightness */
function docCrop(c){
  const W = c.width, H = c.height, k = Math.min(1, 400 / W), sw = Math.max(1, Math.round(W * k)), sh = Math.max(1, Math.round(H * k));
  const t = document.createElement('canvas'); t.width = sw; t.height = sh; const x = t.getContext('2d', { willReadFrequently:true }); x.drawImage(c, 0, 0, sw, sh);
  const d = x.getImageData(0, 0, sw, sh).data, g = new Float32Array(sw * sh); let sum = 0;
  for (let i = 0; i < sw * sh; i++) { g[i] = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000; sum += g[i]; }
  const sorted = Array.from(g).sort((a, b) => a - b), th = Math.max(sum / g.length, sorted[Math.floor(g.length * .55)]) + 12;
  const rows = new Array(sh).fill(0), cols = new Array(sw).fill(0);
  for (let y = 0; y < sh; y++) for (let xx = 0; xx < sw; xx++) if (g[y * sw + xx] > th) { rows[y]++; cols[xx]++; }
  const span = (arr, n, min) => { let a = -1, b = -1; for (let i = 0; i < arr.length; i++) if (arr[i] > n * min) { if (a < 0) a = i; b = i; } return [a, b]; };
  const [y0, y1] = span(rows, sw, .25), [x0, x1] = span(cols, sh, .25);
  if (y0 < 0 || x0 < 0 || (x1 - x0) < sw * .3 || (y1 - y0) < sh * .2 || ((x1 - x0) > sw * .95 && (y1 - y0) > sh * .95)) return c;
  const m = .03, X0 = Math.max(0, (x0 / k) - W * m), Y0 = Math.max(0, (y0 / k) - H * m), X1 = Math.min(W, (x1 + 1) / k + W * m), Y1 = Math.min(H, (y1 + 1) / k + H * m);
  const o = document.createElement('canvas'); o.width = Math.round(X1 - X0); o.height = Math.round(Y1 - Y0);
  o.getContext('2d').drawImage(c, X0, Y0, X1 - X0, Y1 - Y0, 0, 0, o.width, o.height);
  return o;
}
function crop(c, top, h){
  if (top === 0 && h === 1) return c;
  const o = document.createElement('canvas'); o.width = c.width; o.height = Math.round(c.height * h);
  o.getContext('2d').drawImage(c, 0, Math.round(c.height * top), c.width, o.height, 0, 0, o.width, o.height);
  return o;
}
// a real MRZ: most check digits right, a birth date, and a name without digits (text on a licence can look like a broken MRZ)
const goodMrz = r => r && r.checks.filter(Boolean).length >= 2 && !!r.birth && !/\d/.test(r.surname || '') && !/\d/.test(r.given || '');
const CYR_NAT = ['RUS', 'BLR', 'KAZ', 'KGZ'];
const MRZ_PARAMS = { tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<', tessedit_pageseg_mode:'6' };
const finishMrz = best => ({ ...best, nationality: window.MRZ.nationCode(best.nationality, window.ER_COUNTRIES || {}) || window.MRZ.nationCode(best.country, window.ER_COUNTRIES || {}) });
/* a still photo (upload or "take a photo"): MRZ first, then the printed front side; resolves { out, bmp, rot } or null */
async function readDocument(file){
  const bmp = await bitmapOf(file);
  const mw = await ocrWorker('mrz');
  await mw.setParameters(MRZ_PARAMS);
  // [rotation, crop top, crop height, width, black/white]: bottom part first (where the MRZ is), then the whole photo, then turned photos
  const tries = [[0, .5, .5, 1800, 1], [0, .5, .5, 1800, 0], [0, 0, 1, 2000, 1], [180, .5, .5, 1800, 1], [90, .5, .5, 1800, 1], [-90, .5, .5, 1800, 1], [0, .35, .65, 2600, 1], [90, 0, 1, 2000, 1], [-90, 0, 1, 2000, 1]];
  let best = null, bestRot = 0, chev = false, front = null, frontRot = 0;
  for (let k = 0; k < tries.length; k++) {
    const [rot, top, h, width, bin] = tries[k];
    const { data } = await mw.recognize(crop(prep(bmp, rot, width, bin), top, h));
    if (/<{4,}/.test(data.text)) chev = true;
    const r = window.MRZ.parse(data.text);
    if (r && (!best || r.score > best.score)) { best = r; bestRot = rot; }
    if (best?.valid && best.surname) break;
    // no <<<< run in sight (driving licence, front of an ID card): read the printed side first, it is much quicker
    if (k === 0 && !chev && !front) { [front, frontRot] = await readFront(bmp); if (front && frontScore(front) >= 4) return { out:front, bmp, rot:frontRot }; }
  }
  if (goodMrz(best)) return { out:finishMrz(best), bmp, rot:bestRot };
  if (!front) [front, frontRot] = await readFront(bmp);
  return front ? { out:front, bmp, rot:frontRot } : null;
}
/* front side of an ID card or a driving licence (or a passport page without a readable MRZ): names, dates, numbers from the Latin text */
async function readFront(bmp){
  let bestRot = 0;
  const w = await ocrWorker('eng');
  await w.setParameters({ tessedit_char_whitelist:'', tessedit_pageseg_mode:'3' });
  let front = null;
  const card = docCrop(prep(bmp, 0, 2000, 0));
  for (const [rot, width, bin, cc] of [[0, 1800, 0, 1], [0, 1800, 0], [0, 2400, 1, 1], [0, 2400, 1], [90, 1800, 0], [-90, 1800, 0], [180, 1800, 0]]) {
    const { data } = await w.recognize(cc ? prep(card, rot, width, bin) : prep(bmp, rot, width, bin));
    const f = frontOf(data.text);
    if (f && (!front || frontScore(f) > frontScore(front))) { front = f; bestRot = rot; }
    if (front && frontScore(front) >= 4) break;
  }
  return [front, bestRot];
}
/* printed side without <<< lines: a driving licence (numbered fields) or the front of an ID card */
function frontOf(text){
  const lic = window.MRZ.licenceFromText?.(text);
  if (lic && (lic.surname || lic.given)) return { ...lic, valid:!lic.partial };
  const f = window.MRZ.frontFromText(text);
  return f ? { ...f, kind: f.personal ? 'id' : '', nationality: f.personal ? 'GEO' : '', valid:false } : null;
}
const frontScore = f => !f ? 0 : (f.surname ? 1 : 0) + (f.given ? 1 : 0) + (f.birth ? 1 : 0) + (f.personal || f.number ? 1 : 0) + (f.expiry ? .5 : 0);
/* Georgian and Russian names stay in their own script: read the printed page in that language and keep only words matching the MRZ.
   Runs after the form is already filled (Latin name first), so the scan itself is not slowed down. */
async function localNameOf(bmp, rot, out){
  const nat = out.nationality || window.MRZ.nationCode(out.country, window.ER_COUNTRIES || {}), script = nat === 'GEO' ? 'ka' : CYR_NAT.includes(nat) ? 'ru' : '';
  const latin = [out.given, out.surname].filter(Boolean).join(' ');
  if (!script || !latin || !bmp) return '';
  try {
    const w = await ocrWorker(script === 'ka' ? 'kat' : 'rus');
    for (const [width, bin, top, h, psm] of [[2000, 0, 0, 1, '3'], [2400, 1, 0, .7, '3'], [2800, 0, 0, .6, '11']]) {
      await w.setParameters({ tessedit_pageseg_mode:psm });
      const { data } = await w.recognize(crop(prep(bmp, rot, width, bin), top, h));
      const n = window.MRZ.localName(data.text, latin, script);
      if (n) return n;
    }
  } catch(e){ console.error(e); }
  return '';
}

/* live scan: the camera stays open and the machine-readable lines (the <<< rows at the bottom of a passport page /
   back of an ID card) are read straight from the video; it closes the moment the check digits add up.
   Resolves { out, blob } (read), { blob } (plain photo taken instead), null (closed) or undefined (no camera). */
// phones / tablets use their own camera app (a plain photo); a computer with a webcam gets a simple preview with one button
const canLive = () => !!(navigator.mediaDevices?.getUserMedia) && !matchMedia('(pointer:coarse)').matches;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function frameBlob(v){
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  return new Promise(r => c.toBlob(r, 'image/jpeg', .9));
}
// the part of the video under the on-screen guide (with some room above and below), as a canvas
function guideCrop(v, frame, extra){
  const vw = v.videoWidth, vh = v.videoHeight, vr = v.getBoundingClientRect(), g = frame.getBoundingClientRect();
  const k = Math.max(vr.width / vw, vr.height / vh), ox = (vw * k - vr.width) / 2, oy = (vh * k - vr.height) / 2;
  let x = (g.left - vr.left + ox) / k, y = (g.top - vr.top + oy) / k, w = g.width / k, h = g.height / k;
  y -= h * extra; h += 2 * h * extra; x = 0; w = vw;      // full width: the <<< lines may run past the visible edges
  x = Math.max(0, x); y = Math.max(0, y); w = Math.min(vw - x, w); h = Math.min(vh - y, h);
  const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h);
  c.getContext('2d').drawImage(v, x, y, w, h, 0, 0, c.width, c.height);
  return c;
}
async function liveScan(){
  if (!canLive()) return undefined;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:'environment' }, width:{ ideal:1920 }, height:{ ideal:1080 } }, audio:false }); }
  catch(e){ console.error(e); return undefined; }
  return new Promise(resolve => {
    let alive = true;
    openOv(`<div class="row between" style="flex-wrap:nowrap"><h2>${esc(t('scan_live'))}</h2><button type="button" class="btn" id="ls-x">${esc(t('close'))}</button></div>
      <div class="lscam"><video id="ls-v" autoplay muted playsinline></video></div>
      <div class="scanmsg" id="ls-st">${esc(t('scan_photo_hint'))}</div>
      <button type="button" class="btn primary big" id="ls-shot">📷 ${esc(t('scan_take'))}</button>`, 'scanov');
    const ovClick = $('ov').onclick; $('ov').onclick = null;
    const v = $('ls-v'); v.srcObject = stream;
    v.onloadedmetadata = () => { if (v.videoWidth) v.parentElement.style.aspectRatio = `${v.videoWidth} / ${v.videoHeight}`; };
    try { const tr = stream.getVideoTracks()[0], cap = tr.getCapabilities?.() || {}; if (cap.focusMode?.includes('continuous')) tr.applyConstraints({ advanced:[{ focusMode:'continuous' }] }).catch(() => {}); } catch(e){}
    const done = val => { if (!alive) return; alive = false; stream.getTracks().forEach(x => x.stop()); $('ov').onclick = ovClick; closeOv(); resolve(val); };
    $('ls-x').onclick = () => done(null);
    $('ls-shot').onclick = async () => { if (v.readyState >= 2) done({ blob: await frameBlob(v) }); };
  });
}
/* the live scan uses the same overlay as the customer form: keep the form and put it back afterwards */
async function liveScanKeep(){
  const ov = $('ov'), kept = [...ov.childNodes];
  const res = await liveScan();
  if (!kept[0]?.isConnected) { ov.replaceChildren(...kept); ov.hidden = false; document.body.style.overflow = 'hidden'; }
  return res;
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
const scanBtn = () => (canLive() ? `<button type="button" class="btn small scan" data-act="live">${esc(t('scan_id'))}</button>` : `<label class="btn small scan">${esc(t('scan_id'))}<input type="file" accept="image/*" capture="environment" data-act="scan" hidden></label>`)
  + `<label class="btn small scan up">${esc(t('upload_id'))}<input type="file" accept="image/*" data-act="scan" hidden></label>`;
const photoBtns = (style = '') => `<span class="row" style="gap:6px;${style}"><label class="btn small">${esc(t('cust_photo_add'))}<input type="file" accept="image/*" capture="environment" data-act="scan" hidden></label>`
  + `<label class="btn small">${esc(t('upload_photo'))}<input type="file" accept="image/*" data-act="scan" hidden></label></span>`;
const msgHtml = st => st.msg ? `<div class="scanmsg ${st.msg[1]}">${esc(t(st.msg[0]))}</div>` : '';
let OCR_WARM = false;
function mountPicker(boxId, force){
  const st = PICK[boxId] ??= freshPick();
  // load the reader in the background so a scan starts at once
  if (!OCR_WARM) { OCR_WARM = true; setTimeout(() => ocrWorker('mrz').catch(() => { OCR_WARM = false; }), 2500); }
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
      <label class="f">${esc(t('cust_phone'))}<input data-k="phone" data-sel="1" type="tel" inputmode="tel" value="${esc(st.patch?.phone ?? c0.phone ?? '')}" autocomplete="off" placeholder="+995 5__ __ __ __"></label>
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
      <label class="f">${esc(t('cust_doc'))}<select data-k="doc_type"><option value=""></option>${['passport','id','dl'].map(k => `<option value="${k}" ${d.doc_type === k ? 'selected' : ''}>${esc(t('doc_' + k))}</option>`).join('')}</select></label>
      <label class="f">${esc(t('doc_expiry'))}<input data-k="doc_expiry" type="date" value="${esc(d.doc_expiry)}"></label></div>
      <div class="row">
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
      else if (a === 'live') liveInto(boxId);
    });
    box.addEventListener('input', e => {
      const s = PICK[boxId], k = e.target.dataset.k;
      if (e.target.dataset.act === 'q') { s.q = e.target.value; pickerResults(boxId); }
      else if (k && e.target.dataset.sel) { s.patch = { ...(s.patch || {}), [k]: e.target.value }; }
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
async function liveInto(boxId){
  const res = await liveScan();
  if (res === undefined) { toast(t('scan_cam_denied')); return; }
  if (!res?.blob) return;
  const s = PICK[boxId];
  try { s.photo = await compressImage(res.blob, 1600, .8); s.preview = URL.createObjectURL(s.photo); } catch(err){ console.error(err); }
  await scanInto(boxId, res.blob, res.out ? { out:res.out } : null);
}
async function scanInto(boxId, file, pre){
  const s = PICK[boxId], wasSel = s.mode === 'selected';
  if (s.mode === 'search') s.mode = 'new';
  let got = pre || null;
  if (!got) {
    s.msg = ['scanning', '']; mountPicker(boxId, true);
    try { got = await readDocument(file); } catch(err){ console.error(err); }
  }
  const r = got?.out;
  if (!r) { s.msg = ['scan_fail', 'bad']; if (s.mode !== 'selected') s.mode = 'new'; mountPicker(boxId, true); return; }
  const latinName = titleCase([r.given, r.surname].filter(Boolean).join(' '));
  const data = {
    name: r.local || latinName,
    id_number: r.personal || r.number || '', birth_date: r.birth || '', nationality: r.nationality || '',
    doc_type: r.kind || '', doc_expiry: r.expiry || ''
  };
  const ids = [r.personal, r.number].filter(Boolean);
  const known = S.customers.find(c => c.id_number && ids.includes(String(c.id_number).replace(/\s/g, '')));
  if (wasSel && (!known || known.id === s.id)) Object.assign(s, { patch:{ ...(s.patch || {}), ...Object.fromEntries(Object.entries(data).filter(([, v]) => v)) }, msg:['scan_ok', 'ok'] });
  else if (known) Object.assign(s, { mode:'selected', id:known.id, patch:{ ...data, phone:(s.mode === 'new' && s.draft.phone) || '' }, msg:['scan_existing', 'ok'] });
  else {
    const keep = s.mode === 'new' ? s.draft : EMPTY_DRAFT();
    s.mode = 'new';
    s.draft = { ...keep, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v)) };
    s.msg = r.partial || !r.valid ? ['scan_partial', ''] : ['scan_ok', 'ok'];
  }
  mountPicker(boxId, true);
  if (s.mode === 'new') $(boxId).querySelector(s.draft.name ? '[data-k="phone"]' : '[data-k="name"]')?.focus();
  // a Georgian / Russian holder: swap in the name in their own script once it has been read (unless it was edited meanwhile)
  if (s.mode === 'new' && latinName && s.draft.name === latinName) {
    const nat = r.nationality;
    if (nat === 'GEO' || CYR_NAT.includes(nat)) {
      const bmp = got.bmp || (file ? await bitmapOf(file).catch(() => null) : null);
      const local = await localNameOf(bmp, got.rot || 0, r);
      if (local && PICK[boxId] === s && s.mode === 'new' && s.draft.name === latinName) {
        s.draft.name = local;
        const inp = $(boxId).querySelector('[data-k="name"]'); if (inp) inp.value = local;
      }
    }
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
const CUST_EXTRA = ['birth_date','nationality','doc_type','doc_expiry'];
const nullDates = d => { ['birth_date','doc_expiry'].forEach(k => { if (k in d && !d[k]) d[k] = null; }); return d; };
/* returns the customer row or null; throws Error('name') when a new customer has no name */
async function resolveCustomer(boxId){
  const st = PICK[boxId]; if (!st) return null;
  if (st.mode === 'selected') {
    let c = S.customers.find(x => x.id === st.id); if (!c) return null;
    const fill = Object.fromEntries(Object.entries(st.patch || {}).filter(([k, v]) => v && (!c[k] || CUST_EXTRA.includes(k) || (k === 'phone' && String(v).trim() !== String(c.phone || '')))));
    delete fill.name;
    if (Object.keys(fill).length) { c = await q(sb.from('customers').update(fill).eq('id', c.id).select().single()); }
    if (st.photo) await saveIdPhoto(c.id, st.photo);
    return c;
  }
  if (st.mode === 'new') {
    const d = Object.fromEntries(Object.entries(st.draft).map(([k, v]) => [k, String(v || '').trim()]));
    d.nationality = window.MRZ?.nationCode(d.nationality, window.ER_COUNTRIES || {}) || d.nationality.toUpperCase();
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
  const kind = saleKind(), qq = $('s-q').value.trim();
  $('s-pick').classList.toggle('photos', !!S.spPhotos);
  $('sp-photos').textContent = (S.spPhotos ? '✕ ' : '🖼 ') + t(S.spPhotos ? 'sp_photos_hide' : 'sp_photos');
  const left = p => (+p.qty || 0) - S.cart.filter(l => l.productId === p.id).reduce((x, l) => x + l.qty, 0);
  $('sp-veh').hidden = $('sp-vgrid').hidden = kind === 'easy'; $('sp-easy').hidden = kind === 'veh';
  if (kind !== 'veh') {
    const avail = S.products.filter(p => isEasy(p) && left(p) > 0);
    const cq = $('sp-code').value.trim(), hit = cq ? byCode(cq, avail) : null;
    $('sp-hit').innerHTML = hit ? `<button type="button" class="btn primary sphit" data-id="${hit.id}">${hit.photos?.[0] ? `<img src="${esc(photoUrl(hit.photos[0]))}" alt="">` : ''}＋ <span class="num">${esc(hit.code)}</span> · ${esc(pName(hit))} · ${+hit.price ? money(hit.price) : '—'}</button>`
      : cq ? `<span class="small muted">${esc(t('code_none'))}</span>` : '';
    const list = avail.filter(p => match(p, qq) && (!cq || match(p, cq))).sort((x, y) => String(x.code || '').localeCompare(String(y.code || ''), undefined, { numeric:true }) || pName(x).localeCompare(pName(y)));
    $('sp-item').innerHTML = `<option value="">${esc(t('sp_choose'))} (${list.length})</option>` + list.map(p => `<option value="${p.id}">${esc([p.code, pName(p)].filter(Boolean).join(' — '))} · ${+p.price ? money(p.price) : '—'} · ${left(p)} ${esc(t('pcs'))}</option>`).join('');
    // the same items as photo tiles: tap = add to the sale, the small 🔍 = big photo and details
    $('sp-egrid').innerHTML = list.slice(0, 120).map(p => { const ph = p.photos?.[0];
      return `<div class="etile" data-id="${p.id}" role="button" tabindex="0"><div class="eti">${ph ? `<img src="${esc(photoUrl(ph))}" alt="" loading="lazy">` : '<span>📦</span>'}<button type="button" class="etz" data-gal="${p.id}" aria-label="${esc(t('details'))}">🔍</button></div>
        <div class="etb"><span class="num etc">${esc(p.code || '')}</span><span class="etn">${esc(pName(p))}</span><span class="num etp">${+p.price ? money(p.price) : '—'} · ${left(p)} ${esc(t('pcs'))}</span></div></div>`; }).join('');
    if (kind === 'easy') return;
  }
  const avail = S.products.filter(p => !isEasy(p) && left(p) > 0);
  const types = VEH.filter(k => avail.some(p => p.type === k));
  if (!types.includes(S.spType)) S.spType = types[0] || '';
  $('sp-type').innerHTML = types.map(k => `<option value="${k}" ${k === S.spType ? 'selected' : ''}>${esc(tType(k))} (${avail.filter(p => p.type === k).length})</option>`).join('') || `<option value="">—</option>`;
  const list = avail.filter(p => p.type === S.spType && match(p, qq)).sort((x, y) => (plateOf(x) ? 0 : 1) - (plateOf(y) ? 0 : 1) || plateOf(x).localeCompare(plateOf(y), undefined, { numeric:true }) || pName(x).localeCompare(pName(y)));
  $('sp-model').innerHTML = `<option value="">${esc(t('sp_choose'))} (${list.length})</option>` + list.map(p => `<option value="${p.id}">${esc([plateOf(p), pName(p), locData(p.color), p.year].filter(Boolean).join(' · '))} — ${+p.price ? money(p.price) : esc(t('negotiable'))}</option>`).join('');
  // the vehicles as photo tiles too, like the items: tap = add to the sale, 🔍 = big photo and details
  $('sp-vgrid').innerHTML = list.slice(0, 120).map(p => { const ph = p.photos?.[0];
    return `<div class="etile" data-id="${p.id}" role="button" tabindex="0"><div class="eti">${ph ? `<img src="${esc(photoUrl(ph))}" alt="" loading="lazy">` : '<span>🛵</span>'}<button type="button" class="etz" data-gal="${p.id}" aria-label="${esc(t('details'))}">🔍</button></div>
      <div class="etb"><span class="num etc">${esc(plateOf(p) || p.year || '')}</span><span class="etn">${esc(pName(p))}</span><span class="small muted">${esc([locData(p.color), plateOf(p) ? p.year : ''].filter(Boolean).join(' · '))}</span><span class="num etp">${+p.price ? money(p.price) : esc(t('negotiable'))}</span></div></div>`; }).join('');
}
$('sp-type').onchange = e => { S.spType = e.target.value; renderSale(); };
$('sp-photos').onclick = () => { S.spPhotos = !S.spPhotos; renderSimplePick(); };
['sp-model','sp-item'].forEach(id => $(id).onchange = e => { const v = e.target.value; if (!v) return; addToCart(v); e.target.value = ''; });
$('sp-egrid').onclick = $('sp-vgrid').onclick = e => { const z = e.target.closest('[data-gal]'); if (z) return showGallery(S.products.find(x => x.id === z.dataset.gal), true);
  const tl = e.target.closest('.etile'); if (tl) addToCart(tl.dataset.id); };
$('sp-code').oninput = () => renderSimplePick();
const addByCode = () => { const p = byCode($('sp-code').value, S.products.filter(isEasy)); if (!p) return false; addToCart(p.id); $('sp-code').value = ''; renderSale(); $('sp-code').focus(); return true; };
$('sp-code').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); if (!addByCode()) toast(t('code_none')); } };
$('sp-hit').onclick = e => { if (e.target.closest('[data-id]')) addByCode(); };
/* sale catalogue: "all" (vehicles + items), "vehicles" or "items" */
const saleKind = () => ['all', 'veh', 'easy'].includes(S.sKind) ? S.sKind : 'all';
const inSaleKind = (p, k = saleKind()) => k === 'all' || (k === 'easy' ? isEasy(p) : !isEasy(p));
const leftOf = p => (+p.qty || 0) - S.cart.filter(l => l.productId === p.id).reduce((x, l) => x + l.qty, 0);
const erowHtml = p => { const left = leftOf(p);
  const ph = p.photos?.[0];
  return `<div class="erow ${left <= 0 ? 'dis' : ''}" data-id="${p.id}" role="button" tabindex="${left <= 0 ? -1 : 0}" aria-disabled="${left <= 0}">
        <button type="button" class="eph" data-gal="${p.id}" aria-label="${esc(t('details'))}">${ph ? `<img src="${esc(photoUrl(ph))}" alt="" loading="lazy">` : '<span>📦</span>'}</button>
        <span class="code num">${esc(p.code || '—')}</span><span class="nm">${esc(pName(p))}${p.color ? ` <span class="muted small">${esc(locData(p.color))}</span>` : ''}</span>
        <span class="num pr">${+p.price ? money(p.price) : '—'}</span><span class="tag ${left <= 0 ? 'out' : left <= 1 ? 'low' : ''}">${left <= 0 ? esc(t('out')) : left + ' ' + esc(t('pcs'))}</span>
        ${isAdmin() ? `<button type="button" class="btn ghost small" data-edit="${p.id}">${esc(t('edit'))}</button>` : ''}</div>`; };
const pcardHtml = p => { const left = leftOf(p);
  const tag = left <= 0 ? `<span class="tag out">${esc(t('out'))}</span>` : `<span class="tag ${left <= 1 ? 'low' : ''}">${left} ${esc(t('pcs'))}</span>`;
  const ph = p.photos?.[0];
  return `<div class="pcard ${left <= 0 ? 'dis' : ''}" data-id="${p.id}" role="button" tabindex="${left <= 0 ? -1 : 0}" aria-disabled="${left <= 0}">
        <div class="ph">${ph ? `<img src="${esc(photoUrl(ph))}" alt="" loading="lazy">` : esc(t('cust_no_photo'))}</div>
        <button type="button" class="gal" data-gal="${p.id}" aria-label="${esc(t('details'))}">🔍 ${esc(t('details'))}${p.photos?.length > 1 ? ' · ' + p.photos.length : ''}</button>
        <div class="bd"><span class="nm">${plateOf(p) ? `<span class="plate">${esc(plateOf(p))}</span> ` : ''}${esc(pName(p))}</span><span class="meta">${esc(pMeta(p))}</span>
        ${p.note ? `<span class="meta" style="color:var(--warn)">${esc(p.note)}</span>` : ''}
        <span class="pr"><span class="num">${+p.price ? money(p.price) : esc(t('negotiable'))}</span>${tag}</span></div></div>`; };
function renderSale(){
  renderDayBanner();
  if (isSimple() || S.tab === 'home') renderSimplePick();
  const kind = saleKind(), easy = kind === 'easy';
  $('s-kind').innerHTML = [['all','kind_all'],['veh','kind_veh'],['easy','kind_items']].map(([k, l]) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${kind === k}">${esc(t(l))} <span class="num">${S.products.filter(p => inSaleKind(p, k)).length}</span></button>`).join('');
  $('s-add-easy').hidden = !(kind !== 'veh' && isAdmin());
  $('s-q').placeholder = t(kind === 'veh' ? 'search_items' : 'easy_search');
  const pool = S.products.filter(p => inSaleKind(p));
  const counts = {}; pool.forEach(p => counts[p.type] = (counts[p.type] || 0) + 1);
  if (S.sType && !counts[S.sType]) S.sType = '';
  typeChips($('s-types'), S.sType, x => { S.sType = x; renderSale(); }, counts);
  const qq = $('s-q').value.trim(), ql = qq.toLowerCase();
  const list = pool.filter(p => (!S.sType || p.type === S.sType) && match(p, qq)).sort((a, b) =>
    (qq ? (String(b.code || '').toLowerCase() === ql) - (String(a.code || '').toLowerCase() === ql) : 0) || ((b.qty > 0) - (a.qty > 0)) || pName(a).localeCompare(pName(b)));
  const vl = list.filter(p => !isEasy(p)), el = list.filter(isEasy);
  const box = $('s-list');
  box.classList.toggle('elist', !!el.length && !vl.length);
  box.classList.toggle('mixed', !!el.length && !!vl.length);
  if (!S.loaded) box.innerHTML = `<div class="empty">${esc(t('loading'))}</div>`;
  else if (!S.products.length) box.innerHTML = `<div class="empty" style="grid-column:1/-1">${esc(t(isAdmin() ? 'stock_empty_admin' : 'stock_empty'))}</div>`;
  else if (!list.length) box.innerHTML = `<div class="empty" style="grid-column:1/-1">${esc(t(pool.length ? 'nothing_found' : (easy ? 'easy_empty' : 'nothing_found')))}</div>`;
  else if (vl.length && el.length) box.innerHTML = `<div class="mixhead"><b>${esc(t('kind_veh'))}</b><span class="num">${vl.length}</span></div><div class="plist">${vl.map(pcardHtml).join('')}</div>
      <div class="mixhead"><b>${esc(t('kind_items'))}</b><span class="num">${el.length}</span></div><div class="plist elist">${el.map(erowHtml).join('')}</div>`;
  else box.innerHTML = (el.length ? el.map(erowHtml) : vl.map(pcardHtml)).join('');
  renderCart();
}
$('s-q').oninput = () => renderSale();
$('s-kind').onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; S.sKind = b.dataset.k; S.sType = ''; $('s-q').value = ''; renderSale(); $('s-q').focus(); };
$('s-add-easy').onclick = () => openProduct(null, { type:'accessory', qty:1 });
// a scanner or typed code + Enter adds the item straight to the receipt
$('s-q').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const qq = $('s-q').value.trim().toLowerCase(); if (!qq) return;
  const p = S.products.find(x => String(x.code || '').toLowerCase() === qq) || byCode(qq);
  if (p) { e.preventDefault(); addToCart(p.id); $('s-q').value = ''; renderSale(); }
});
function addToCart(id){
  const p = S.products.find(x => x.id === id); if (!p) return;
  const inCart = S.cart.filter(l => l.productId === p.id).reduce((a, l) => a + l.qty, 0);
  if (inCart >= (+p.qty || 0)) return;
  const ex = S.cart.find(l => l.productId === p.id);
  if (ex) ex.qty++; else S.cart.push({ key:uid(), productId:p.id, name:[plateOf(p), pName(p)].filter(Boolean).join(' · '), type:p.type, listPrice:+p.price || 0, unitPrice:+p.price || 0, qty:1, pct:0 });
  renderSale(); toast(pName(p) + ' +1');
}
$('s-list').onclick = e => {
  const g = e.target.closest('[data-gal]'); if (g) { e.stopPropagation(); return showGallery(S.products.find(x => x.id === g.dataset.gal), true); }
  const ph = e.target.closest('.pcard .ph'); if (ph) { e.stopPropagation(); return showGallery(S.products.find(x => x.id === ph.closest('.pcard').dataset.id), true); }
  const ed = e.target.closest('[data-edit]'); if (ed) { openProduct(S.products.find(p => p.id === ed.dataset.edit)); return; }
  const c = e.target.closest('.pcard, .erow'); if (c && !c.classList.contains('dis')) addToCart(c.dataset.id);
};
$('s-list').onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && (e.target.classList.contains('pcard') || e.target.classList.contains('erow'))) { e.preventDefault(); if (!e.target.classList.contains('dis')) addToCart(e.target.dataset.id); } };
$('s-custom').onclick = () => {
  S.cart.push({ key:uid(), productId:null, name:'', type:'other', listPrice:0, unitPrice:0, qty:1, pct:0, custom:true });
  openSheet(); renderCart(); const ins = $('c-lines').querySelectorAll('input[data-k="name"]'); ins[ins.length - 1]?.focus();
};
$('c-clear').onclick = () => { S.cart = []; $('c-disc').value = ''; resetPicker('c-cust'); renderSale(); };
const lineTotal = l => r2(l.qty * l.unitPrice * (1 - (+l.pct || 0) / 100));
/* a discount typed as an amount ("15") or a percent of the total ("10%") */
const discOf = (v, base) => { const s = String(v ?? '').replace(',', '.').trim(); if (!s) return 0; const n = parseFloat(s); if (!(n > 0)) return 0; return r2(Math.min(base, /%$/.test(s) ? base * n / 100 : n)); };
function cartTotals(){ const sub = S.cart.reduce((a, l) => a + lineTotal(l), 0), list = S.cart.reduce((a, l) => a + l.qty * l.listPrice, 0), extra = discOf($('c-disc').value, sub); return { sub, list, extra, total: r2(Math.max(0, sub - extra)) }; }
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
    const args = { p_lines:lines, p_extra:x.extra, p_seller:$('c-seller').value, p_payment:$('c-pay').value, p_customer:cust?.id || null, p_note:$('c-note').value.trim() };
    // one key per checkout: a double tap or a retry after a lost connection can never record the sale twice
    const sig = JSON.stringify(args);
    if (S.saleSig !== sig || !S.saleKey) { S.saleSig = sig; S.saleKey = crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2); }
    try { await q(sb.rpc('record_sale', { ...args, p_key:S.saleKey })); }
    catch(e){ if (!missingFn(e)) throw e; await q(sb.rpc('record_sale', args)); }
    S.saleKey = S.saleSig = null;
    const repData = saleReportData({ lines, total:x.total, extra:x.extra, payment:$('c-pay').value, seller:$('c-seller').value, cust, note:$('c-note').value.trim(), date:new Date(), currency:'GEL' });
    S.cart = []; $('c-disc').value = ''; $('c-note').value = ''; resetPicker('c-cust'); closeSheet();
    toast(t('sale_saved') + ' · ' + money(x.total));
    await reload('products', 'sales', 'customers');
    showReport('sale', repData);
  } catch(e){ fail(e); } finally { updTotals(); }
};

/* ================= stock ================= */
/* stock: vehicles and items apart; what is left is listed first, sold / used-up ones underneath, greyed out with a red mark */
function soldInfo(){
  const m = {};
  S.sales.forEach(s => (s.lines || []).forEach(l => { if (l.product_id && (!m[l.product_id] || s.day > m[l.product_id])) m[l.product_id] = s.day; }));
  return m;
}
function renderStock(){
  const easy = S.pKind === 'easy', inKind = p => easy ? isEasy(p) : !isEasy(p);
  $('p-kind').innerHTML = [['veh','kind_veh'],['easy','kind_easy']].map(([k, l]) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${(S.pKind || 'veh') === k}">${esc(t(l))} <span class="num">${S.products.filter(p => k === 'easy' ? isEasy(p) : !isEasy(p)).length}</span></button>`).join('');
  const pool = S.products.filter(inKind);
  const counts = {}; pool.forEach(p => counts[p.type] = (counts[p.type] || 0) + 1);
  if (S.pType && !counts[S.pType]) S.pType = '';
  typeChips($('p-types'), S.pType, x => { S.pType = x; renderStock(); }, counts);
  const units = S.products.reduce((a, p) => a + (+p.qty || 0), 0), value = S.products.reduce((a, p) => a + (+p.qty || 0) * (+p.price || 0), 0);
  const out = S.products.filter(p => !(+p.qty > 0)).length, veh = S.products.filter(p => VEH.includes(p.type)).reduce((a, p) => a + (+p.qty || 0), 0);
  $('p-stats').innerHTML = [['st_units', units], ['st_vehicles', veh], ['st_value', money(value)], ['st_out', out]].map(([k, v]) => `<div class="panel stat"><h3>${esc(t(k))}</h3><div class="v num">${v}</div></div>`).join('');
  const qq = $('p-q').value.trim(), only = $('p-instock').checked, adm = isAdmin();
  const sorter = (a, b) => (a.type || '').localeCompare(b.type || '') || (plateOf(a) ? 0 : 1) - (plateOf(b) ? 0 : 1) || plateOf(a).localeCompare(plateOf(b), undefined, { numeric:true }) || pName(a).localeCompare(pName(b));
  const shown = pool.filter(p => (!S.pType || p.type === S.pType) && match(p, qq));
  const have = shown.filter(p => +p.qty > 0).sort(sorter), gone = only ? [] : shown.filter(p => !(+p.qty > 0)).sort(sorter);
  if (!S.loaded) { $('p-list').innerHTML = `<div class="empty">${esc(t('loading'))}</div>`; return; }
  const filt = qq || S.pType ? `<div class="filtbar small"><span>${esc(t('shown_n').replace('{n}', have.length + gone.length).replace('{all}', pool.length))}</span><button type="button" class="btn ghost small" data-act="clearf">✕ ${esc(t('clear_filter'))}</button></div>` : '';
  if (!have.length && !gone.length) { $('p-list').innerHTML = filt + `<div class="empty">${esc(t(pool.length ? 'nothing_found' : (adm ? 'stock_empty_admin' : 'stock_empty')))}</div>`; return; }
  const sold = soldInfo();
  const row = p => { const g = !(+p.qty > 0), sd = sold[p.id];
    return `<div class="item ${g ? 'gone' : ''}" data-id="${p.id}">
    <button class="ph" data-act="gal" aria-label="${esc(t('photos'))}">${p.photos?.[0] ? `<img src="${esc(photoUrl(p.photos[0]))}" alt="" loading="lazy">` : esc(t('cust_no_photo'))}${g ? `<span class="goneband">${esc(t(easy ? 'used_up' : 'sold_tag'))}</span>` : ''}</button>
    <div style="min-width:0"><b>${plateOf(p) ? `<span class="plate">${esc(plateOf(p))}</span> ` : ''}${esc(pName(p))}</b>${g ? ` <span class="tag out">${esc(t(easy ? 'used_up' : 'sold_tag'))}${sd ? ' · ' + esc(fmtDate(sd)) : ''}</span>` : ''}<div class="small muted">${esc(pMeta(p))}${p.code ? ' · ' + esc(p.code) : ''}</div>
      ${p.note ? `<div class="small" style="color:var(--warn)">${esc(p.note)}</div>` : ''}<div class="num" style="font-weight:700;margin-top:2px">${+p.price ? money(p.price) : esc(t('negotiable'))}</div></div>
    <div class="side">${adm ? `<span class="qtyctl"><button data-act="dec" aria-label="−">−</button><span class="num" style="min-width:24px;text-align:center">${+p.qty || 0}</span><button data-act="inc" aria-label="+">+</button></span>` : `<span class="tag ${+p.qty > 0 ? '' : 'out'}">${+p.qty || 0} ${esc(t('pcs'))}</span>`}
      ${adm ? `<span class="acts"><button class="btn ghost small" data-act="edit">${esc(t('edit'))}</button><button class="btn ghost small danger" data-act="del">${esc(t('remove'))}</button></span>` : ''}</div></div>`; };
  $('p-list').innerHTML = filt
    + `<div class="stockhead"><b>${esc(t(easy ? 'in_stock_items' : 'in_stock_veh'))}</b><span class="num">${have.length}</span></div>`
    + (have.length ? have.map(row).join('') : `<div class="empty small">—</div>`)
    + (gone.length ? `<div class="stockhead gonehead"><b>${esc(t(easy ? 'used_up_list' : 'sold_list'))}</b><span class="num">${gone.length}</span></div>` + gone.map(row).join('') : '');
}
$('p-kind').onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; S.pKind = b.dataset.k; S.pType = ''; renderStock(); };
// the browser must not refill the search box after a reload (a leftover "8" hid most of the stock)
$('p-q').value = '';
$('p-q').oninput = renderStock; $('p-instock').onchange = renderStock;
$('p-list').onclick = async e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  if (b.dataset.act === 'clearf') { $('p-q').value = ''; S.pType = ''; renderStock(); return; }
  const p = S.products.find(x => x.id === b.closest('.item').dataset.id); if (!p) return;
  const act = b.dataset.act;
  if (act === 'gal') return showGallery(p);
  if (!isAdmin()) return;
  if (act === 'edit') return openProduct(p);
  if (act === 'del') return arm(b, async () => {
    try { await q(sb.from('products').delete().eq('id', p.id)); if (p.photos?.some(isOwnPhoto)) sb.storage.from('products').remove(p.photos.filter(isOwnPhoto)).catch(() => {}); toast(t('deleted')); await reload('products'); } catch(err){ fail(err); }
  });
  if (act === 'inc' || act === 'dec') openStockAdjust(p, act === 'inc' ? 1 : -1);
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
        ${fld('plate', 'f_plate', 'autocapitalize="characters" spellcheck="false" placeholder="BA2148"')}
        ${fld('code', 'f_vin', 'required autocapitalize="characters" spellcheck="false" placeholder="LR4R4UE03T6907005"', true)}
        ${fld('color', 'f_color')}${fld('year', 'f_year', 'inputmode="numeric" maxlength="4"')}
        <label class="f">${esc(t('f_mileage'))}, ${esc(t('km'))}<input id="pf-mileage" value="${esc(mileOf(v))}" inputmode="numeric" placeholder="12500"></label>
        ${fld('engine', 'f_engine', 'placeholder="49 cc / 1200 W"')}${fld('price', 'f_price', 'type="number" min="0" step="1" inputmode="decimal"')}
        ${p ? fld('qty', 'f_qty', 'type="number" min="0" step="1" inputmode="numeric"') : ''}
        ${fld('note', 'note', '', true)}</div>`
    : `<div><div class="small muted" style="font-weight:600;margin-bottom:6px">${esc(t('photos'))}</div><div class="phgrid" id="pf-ph"></div></div>
      <div class="formgrid">
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
      // the camera straight away, or pictures that are already on the phone
      + `<label class="add cam">${esc(t('ph_camera'))}<input type="file" accept="image/*" capture="environment" hidden class="pf-file"></label>`
      + `<label class="add">${esc(t('ph_gallery'))}<input type="file" accept="image/*" multiple hidden class="pf-file"></label>`;
    $('pf-ph').querySelectorAll('.pf-file').forEach(inp => inp.onchange = async e => {
      const files = [...e.target.files].slice(0, 8); if (!files.length) return; toast(t('photo_saving'));
      for (const f of files) { try { const blob = await compressImage(f); photos.push({ blob, preview:URL.createObjectURL(blob) }); } catch(err){ toast(t('photo_fail')); } }
      drawPhotos();
    });
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
      const plate = g('plate').toUpperCase().replace(/[\s-]/g, '');
      if (plate && S.products.some(x => x.id !== p?.id && normQ(plateOf(x)) === normQ(plate))) { err.textContent = t('plate_exists'); err.hidden = false; $('pf-plate').focus(); return; }
      data = { name:g('name'), type:g('type'), code:vin, plate, color:g('color'), year:g('year'), engine:g('engine'), note:g('note'),
        price:Math.max(0, +g('price') || 0), qty: p ? Math.max(0, Math.round(+g('qty') || 0)) : 1 };
      const sp = { ...(p?.specs || {}) }, mi = g('mileage').replace(/\s+/g, ' ');
      if (mi) sp[MILE_K] = mi; else delete sp[MILE_K];
      data.specs = sp;
    } else {
      data = { name:g('name'), price:Math.max(0, r2(g('price'))), qty:Math.max(0, Math.round(+g('qty') || 0)) };
      if (!p) data.type = 'accessory';
    }
    const btn = $('pf-save'); btn.disabled = true;
    try {
      {  // photos for vehicles and items alike
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
/* when the vehicle is due back: the stored end, or start + the rate's length for older rows */
const dueAt = r => { if (r.ends_at) return new Date(r.ends_at); const u = UNIT_MS[r.rate?.u]; return u && r.rate?.n ? new Date(new Date(r.created_at).getTime() + r.rate.n * u) : null; };
function dueBadge(r){
  const d = dueAt(r); if (!d || isNaN(d)) return '';
  const now = new Date(), mins = Math.round((d - now) / 6e4), late = r.status === 'active' && mins < 0;
  const hm = pad(d.getHours()) + ':' + pad(d.getMinutes()), day = dayKey(d) === dayKey(now) ? '' : pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' ';
  const span = m => { m = Math.abs(m); return m >= 1440 ? Math.floor(m / 1440) + t('u_d_short') + ' ' + Math.floor(m % 1440 / 60) + t('u_h_short') : m >= 60 ? Math.floor(m / 60) + t('u_h_short') + ' ' + (m % 60) + t('u_m_short') : m + t('u_m_short'); };
  const left = r.status !== 'active' ? '' : late ? ' · +' + span(mins) : ' · ' + span(mins);
  return `<span class="dueb ${late ? 'late' : mins <= 30 && r.status === 'active' ? 'soon' : ''}" title="${esc(t(late ? 'overdue' : 'return_by'))}">⏰ ${day}${hm}<small>${left}</small></span>`;
}
function renderRent(){
  const T = S.settings.tariffs || [], curT = $('r-type').value;
  $('r-type').innerHTML = T.map((x, i) => `<option value="${i}" ${String(i) === curT ? 'selected' : ''}>${esc(tType(x.type))}</option>`).join('');
  fillRates(false); fillUnits();
  $('r-seller').innerHTML = sellerOpts($('r-seller').value || S.user?.name);
  mountPicker('r-cust'); if (!$('r-video').childElementCount) renderVideo();
  const act = S.rentals.filter(r => r.status === 'active');
  const lateTag = r => { const l = lateCalc(r); return l.fee ? `<div class="small due late num">+${money(l.fee)} · ${l.hours} ${esc(t('hours_short'))}</div>` : ''; };
  const cBtn = r => (r.contract ? `<button class="btn ghost small" data-act="contract">${esc(t('contract_view'))}</button><button class="btn ghost small" data-act="cshare">📤 ${esc(t('contract_share_btn'))}</button>` : '') + (r.signature ? `<button class="btn ghost small" data-act="sig">✍️ ${esc(t('signature'))}</button>` : '') + (r.video ? `<button class="btn ghost small" data-act="video">🎥 ${esc(t('video_short'))}</button>` : '');
  const eBtn = () => `<button class="btn ghost small" data-act="rrep">${esc(t('report_btn'))}</button>` + (isAdmin() ? `<button class="btn ghost small" data-act="redit">${esc(t('edit'))}</button>` : '');
  $('r-active').innerHTML = act.length ? act.map(r => `<div class="tariff" data-id="${r.id}"><div style="min-width:0"><b>${esc(tType(r.type))}</b>${r.unit_label ? ` · ${esc(locData(r.unit_label))}` : ''} · ${esc(rateLabel(r.rate))}
      <div class="small muted">${esc(r.customer_name || '')} ${esc(r.phone || '')} · ${esc(t('started'))} ${fmtTs(r.created_at)}${dueLabel(r)}${+r.deposit ? ` · ${esc(t('deposit'))} ${money(r.deposit, r.deposit_currency || 'GEL')}${r.deposit_payment ? ' · ' + esc(tPay(r.deposit_payment)) : ''}` : ''}</div>${cBtn(r)}${eBtn()}</div>
      <div style="text-align:right">${dueBadge(r)}<div class="num">${money(r.price)}</div>${lateTag(r)}<button class="btn ghost small" data-act="sendall" title="${esc(t('send_files_title'))}">📎</button><button class="btn small" data-act="ret">${esc(t('returned_btn'))}</button></div></div>`).join('')
    : `<div class="empty small">${esc(t('nothing_rented'))}</div>`;
  const done = S.rentals.filter(r => r.status === 'returned').slice(0, 50);
  $('r-history').innerHTML = `<div class="pad"><h3>${esc(t('rent_recent'))}</h3></div>` + (done.length ? `<table><thead><tr><th>${esc(t('col_time'))}</th><th>${esc(t('col_vehicle'))}</th><th>${esc(t('col_customer'))}</th><th>${esc(t('seller'))}</th><th class="r">${esc(t('col_amount'))}</th><th></th></tr></thead><tbody>${done.map(r => `<tr data-id="${r.id}"><td class="num">${fmtTs(r.created_at)}</td><td>${esc(tType(r.type))}${r.unit_label ? ` · ${esc(locData(r.unit_label))}` : ''} · ${esc(rateLabel(r.rate))}</td><td>${esc(r.customer_name || '—')}</td><td>${esc(r.seller || '')}</td><td class="r num">${money(rentSum(r))}${+r.late_fee ? `<div class="small due late">+${money(r.late_fee)}</div>` : ''}</td><td style="white-space:nowrap">${cBtn(r)}${eBtn()}</td></tr>`).join('')}</tbody></table>` : `<div class="empty small">${esc(t('rent_none_done'))}</div>`);
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
  if (setPrice || $('r-price').value === '') { const r = x?.rates?.[+$('r-rate').value]; if (r) $('r-price').value = r.p; } paintRentFinal();
  if (setPrice) delete $('r-end').dataset.manual;
  setEnd(false);
}
const stockLabel = p => [plateOf(p), pName(p), p.color, p.code ? '№ ' + p.code : ''].filter(Boolean).join(' · ');
function unitOptions(type){
  const busy = new Set(S.rentals.filter(r => r.status === 'active').flatMap(r => [r.unit_id && 'f:' + r.unit_id, r.product_id && 'p:' + r.product_id]).filter(Boolean));
  const byLabel = (a, b) => a.label.localeCompare(b.label, undefined, { numeric:true });
  // petrol mopeds only with a number (frame / plate); electric ones, scooters and bikes always — the number is shown in the list
  // the number written like BA2148 (letters + digits), not a long VIN
  const needNo = type === 'moped', isNo = v => /^[A-Z]{1,3}\d{3,6}$/.test(String(v || '').toUpperCase().replace(/[\s-]/g, '')), qq = ($('r-unit-q')?.value || '').trim().toLowerCase().replace(/[\s-]/g, '');
  const hit = l => !qq || l.toLowerCase().replace(/[\s-]/g, '').includes(qq);
  const fleet = S.fleet.filter(f => f.type === type && (!needNo || isNo(f.number))).map(f => ({ key:'f:' + f.id, label:fleetLabel(f) })).filter(u => hit(u.label)).sort(byLabel);
  const stock = S.products.filter(p => p.type === type && +p.qty > 0 && (!needNo || isNo(plateOf(p)) || isNo(p.code))).map(p => ({ key:'p:' + p.id, label:stockLabel(p), pl:plateOf(p) })).filter(u => hit(u.label)).sort((a, b) => (a.pl ? 0 : 1) - (b.pl ? 0 : 1) || byLabel(a, b));
  return { busy, groups:[['grp_fleet', fleet], ['grp_stock', stock]].filter(([, l]) => l.length) };
}
function fillUnits(){
  const x = curTariff(), cur = $('r-unit').value;
  const { busy, groups } = x ? unitOptions(x.type) : { busy:new Set(), groups:[] };
  $('r-unit').innerHTML = `<option value="">${esc(t('choose_unit'))}</option>` + groups.map(([g, list]) => `<optgroup label="${esc(t(g))}">${list.map(u => `<option value="${u.key}" ${busy.has(u.key) ? 'disabled' : ''} ${u.key === cur && !busy.has(u.key) ? 'selected' : ''}>${esc(locData(u.label))}${busy.has(u.key) ? ' — ' + esc(t('rented_tag')) : ''}</option>`).join('')}</optgroup>`).join('');
  drawExtraUnits();
  $('r-unit-hint').hidden = groups.length > 0; $('r-unit-hint').textContent = t(($('r-unit-q').value || '').trim() ? 'nothing_found' : x?.type === 'moped' ? 'unit_none_vin' : 'unit_none');
}
$('r-unit-q').oninput = () => { fillUnits(); const o = [...$('r-unit').options].filter(x => x.value && !x.disabled); if (o.length === 1) $('r-unit').value = o[0].value; };
/* several vehicles for one customer: extra unit rows of the same type (one rental record each, one signature) */
let XU = [];
function unitOptHtml(cur, taken){
  const x = curTariff(); const { busy, groups } = x ? unitOptions(x.type) : { busy:new Set(), groups:[] };
  return `<option value="">${esc(t('choose_unit'))}</option>` + groups.map(([g, list]) => `<optgroup label="${esc(t(g))}">${list.map(u => { const off = busy.has(u.key) || (taken.has(u.key) && u.key !== cur);
    return `<option value="${u.key}" ${off ? 'disabled' : ''} ${u.key === cur ? 'selected' : ''}>${esc(locData(u.label))}${busy.has(u.key) ? ' — ' + esc(t('rented_tag')) : ''}</option>`; }).join('')}</optgroup>`).join('');
}
function drawExtraUnits(){
  const box = $('r-units-x'); if (!box) return;
  box.innerHTML = XU.map((k, i) => `<div class="unitrow"><select data-xu="${i}" aria-label="unit ${i + 2}">${unitOptHtml(k, new Set([$('r-unit').value, ...XU.filter((_, j) => j !== i)]))}</select><button type="button" class="btn ghost addunit" data-xrm="${i}" aria-label="×">×</button></div>`).join('');
  const n = 1 + XU.length, note = $('r-units-note');
  note.hidden = n < 2; note.textContent = n < 2 ? '' : t('units_count').replace('{n}', n).replace('{sum}', money(r2(rentFinal().price * n)));
  paintRentFinal();
}
/* rental price after the discount (per vehicle) */
const rentFinal = () => { const list = r2(+$('r-price').value || 0), disc = discOf($('r-disc').value, list); return { list, disc, price:r2(Math.max(0, list - disc)) }; };
function paintRentFinal(){ const f = rentFinal(), el = $('r-final'); if (!el) return; el.innerHTML = f.disc ? `${money(f.price)} <span class="small muted" style="text-decoration:line-through">${money(f.list)}</span>` : money(f.price); }
$('r-disc').addEventListener('input', drawExtraUnits);
$('r-unit-add').onclick = () => { XU.push(''); drawExtraUnits(); $('r-units-x').querySelector(`[data-xu="${XU.length - 1}"]`)?.focus(); };
$('r-units-x').onchange = e => { const sel = e.target.closest('[data-xu]'); if (sel) { XU[+sel.dataset.xu] = sel.value; drawExtraUnits(); } };
$('r-units-x').onclick = e => { const b = e.target.closest('[data-xrm]'); if (b) { XU.splice(+b.dataset.xrm, 1); drawExtraUnits(); } };
$('r-unit').addEventListener('change', drawExtraUnits); $('r-price').addEventListener('input', drawExtraUnits);
$('r-type').onchange = () => { XU = []; $('r-rate').value = '0'; fillRates(true); fillUnits(); };
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
    price: `${money(raw.price)}${+raw.disc ? ` (${tL('discount', lg)} −${money(raw.disc)})` : ''}${raw.pay ? ' · ' + tL('pay_' + raw.pay, lg) : ''}`,
    deposit: +raw.deposit ? money(raw.deposit, raw.dep_cur || 'GEL') + (raw.dep_pay ? ' · ' + tL('pay_' + raw.dep_pay, lg) : '') : '', pen, seller: raw.seller, signedAt: raw.signed_at ? fmtDT(raw.signed_at) + (raw.base_id ? ' · ' + tL('sig_reused', lg) : '') : ''
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
function askSignature(raw, prev){
  return new Promise(resolve => {
    let lg = langFor(raw.nat), reuse = !!prev, prevUrl = '';
    openOv(`<div class="row between noprint" style="flex-wrap:wrap;gap:8px"><div class="small muted" style="flex:1;min-width:200px">${esc(t('contract_for_customer'))}</div>${langChips(lg)}</div>
      <div id="ct-body"></div>
      <div class="stack"><div class="small" style="font-weight:700" id="ct-signlbl"></div>
        <div class="sigpad" id="ct-pad"><canvas></canvas><span class="hint" id="ct-hint"></span></div></div>
      <div class="cbar"><button type="button" class="btn" id="ct-clear"></button><button type="button" class="btn" id="ct-cancel"></button><button type="button" class="btn primary big" id="ct-ok" style="width:auto"></button></div>`, 'wide');
    const pad = signaturePad($('ct-pad'));
    const paint = () => {
      // a customer who signed before: the new agreement carries that signature with its own date; "sign again" is still possible
      $('ct-body').innerHTML = window.ER_CONTRACT.html(lg, contractStrings(reuse ? { ...raw, signed_at:prev.contract.signed_at, base_id:prev.id } : raw, lg), reuse ? prevUrl : '');
      $('ct-pad').parentElement.hidden = reuse; $('ct-clear').hidden = reuse;
      if ($('ct-again')) $('ct-again').hidden = !reuse;
      $('ct-signlbl').textContent = tL('sign_here', lg); $('ct-hint').textContent = tL('sign_here', lg);
      $('ct-clear').textContent = tL('sign_clear', lg); $('ct-cancel').textContent = tL('cancel', lg); $('ct-ok').textContent = reuse ? tL('sig_use_prev', lg) : tL('sign_confirm', lg);
      if ($('ct-again')) $('ct-again').textContent = tL('sig_new', lg);
      $('ov').querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === lg));
    };
    if (prev) {
      $('ct-cancel').insertAdjacentHTML('beforebegin', '<button type="button" class="btn" id="ct-again"></button>');
      $('ct-again').onclick = () => { reuse = false; paint(); };
      q(sb.storage.from('id-photos').createSignedUrl(prev.signature, 600)).then(d => { prevUrl = d.signedUrl; if (reuse && $('ct-body')) paint(); }).catch(e => console.error(e));
    }
    paint();
    $('ov').querySelector('.langpick').onclick = e => { const b = e.target.closest('[data-lang]'); if (b) { lg = b.dataset.lang; paint(); } };
    $('ct-clear').onclick = () => pad.clear();
    const done = v => { $('ov').onclick = ovClick; closeOv(); resolve(v); };
    $('ct-cancel').onclick = () => done(null);
    const ovClick = $('ov').onclick; $('ov').onclick = null;   // a stray tap outside must not close it mid-signature
    $('ct-ok').onclick = async () => {
      if (reuse) { try { const blob = await q(sb.storage.from('id-photos').download(prev.signature)); done({ lang:lg, blob, reuse:prev }); } catch(e){ console.error(e); toast(t('sign_fail')); reuse = false; paint(); } return; }
      if (!pad.has()) { toast(tL('sign_need', lg)); return; } done({ lang:lg, blob: await pad.blob() }); };
  });
}
async function viewContract(r, share, opts = {}){
  const c = r.contract; if (!c?.raw) { toast(t('contract_none')); return; }
  let lg = c.lang || LANG, url = '', pdf = null, pdfLang = '';
  openOv(`${opts.done ? `<div class="okbox noprint">✅ ${esc(t('rent_done_signed'))}</div>
    ${custWaBtn('cv-wa', true)}
    <div class="row noprint" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn big" id="cv-rep" style="flex:1;width:auto">📤 ${esc(t('rent_done_report'))}</button>
      <button type="button" class="btn big" id="cv-files" style="flex:1;width:auto">📎 ${esc(t('rent_done_files'))}</button></div>` : ''}
    <div class="row between noprint" style="flex-wrap:wrap;gap:8px">${langChips(lg)}<button type="button" class="btn small" data-close>${esc(t('close'))}</button></div>
    <div class="row noprint cvacts" style="gap:6px;flex-wrap:wrap"><button type="button" class="btn primary" id="cv-share">📤 ${esc(t('contract_share'))}</button>
      <button type="button" class="btn" id="cv-copy">📋 ${esc(t('copy'))}</button><button type="button" class="btn" id="cv-dl">⬇️ PDF</button>
      <button type="button" class="btn" id="cv-print">${esc(t('print'))}</button></div><div id="cv-body"></div>`, 'wide');
  const paint = () => { $('cv-body').innerHTML = window.ER_CONTRACT.html(lg, contractStrings({ ...c.raw, signed_at:c.signed_at }, lg), url); $('ov').querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === lg)); };
  paint();
  // the PDF is made in the background as soon as the agreement opens, so "share" can hand it over straight away
  const stored = () => r.signature && lg === c.lang ? q(sb.storage.from('id-photos').download(r.signature.replace(/\.png$/, '.pdf'))).catch(() => contractPdf(r, lg)) : contractPdf(r, lg);
  const getPdf = () => { if (!pdf || pdfLang !== lg) { pdfLang = lg; pdf = stored(); pdf.catch(e => { console.error(e); pdf = null; }); } return pdf; };
  getPdf();
  $('ov').querySelector('.langpick').onclick = e => { const b = e.target.closest('[data-lang]'); if (b) { lg = b.dataset.lang; paint(); getPdf(); } };
  $('cv-print').onclick = () => window.print();
  if ($('cv-rep')) $('cv-rep').onclick = () => showReport('rental', rentalReportData(r));
  if ($('cv-files')) $('cv-files').onclick = () => sendRentalFiles(r);
  if ($('cv-wa')) armCustWa('cv-wa', r);
  $('cv-copy').onclick = async () => {
    const txt = contractText(r, lg);
    try { await navigator.clipboard.writeText(txt); } catch(e){ const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    toast(t('copied'));
  };
  const busy = (b, on) => { b.disabled = on; b.classList.toggle('busy', on); };
  $('cv-dl').onclick = async e => { const b = e.currentTarget; busy(b, true); try { downloadBlob(await getPdf(), contractFileName(r)); } catch(err){ fail(err); } busy(b, false); };
  $('cv-share').onclick = async e => { const b = e.currentTarget; busy(b, true); try { await sharePdf(await getPdf(), r, lg); } catch(err){ fail(err); } busy(b, false); };
  if (share) $('cv-share').click();          // "share" straight from the list: the share sheet opens as soon as the PDF is ready
  if (r.signature) { try { url = (await q(sb.storage.from('id-photos').createSignedUrl(r.signature, 600))).signedUrl; if ($('cv-body')) paint(); } catch(e){ console.error(e); } }
}

/* ---------- the agreement as a PDF: contract text + the customer's signature, A4 pages ---------- */
const PDF_LIBS = ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];
let PDF_READY = null;
const pdfLibs = () => PDF_READY ??= Promise.all([window.html2canvas || loadScript(PDF_LIBS[0]), window.jspdf || loadScript(PDF_LIBS[1])]).catch(e => { PDF_READY = null; throw e; });
const blobUrlData = b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
const SIG_CACHE = {};
async function signatureData(path){
  if (!path) return '';
  if (!SIG_CACHE[path]) SIG_CACHE[path] = q(sb.storage.from('id-photos').download(path)).then(blobUrlData).catch(e => { delete SIG_CACHE[path]; throw e; });
  return SIG_CACHE[path];
}
const contractFileName = r => {
  const raw = r.contract?.raw || {}, who = String(raw.name || r.customer_name || '').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_');
  return `Easyride_${tL('contract_view', 'en')}_${who || 'customer'}_${dayKey(new Date(r.contract?.signed_at || r.created_at))}.pdf`;
};
async function contractPdf(r, lg){
  const c = r.contract;
  const [sig] = await Promise.all([signatureData(r.signature).catch(e => { console.error(e); return ''; }), pdfLibs()]);
  const PW = 794, PH = Math.round(PW * 297 / 210), M = 52;          // A4 at 96 dpi, top/bottom margin
  const box = document.createElement('div'); box.className = 'pdfsheet';
  box.innerHTML = window.ER_CONTRACT.html(lg, contractStrings({ ...c.raw, signed_at:c.signed_at }, lg), sig);
  document.body.appendChild(box);
  try {
    await document.fonts?.ready;
    await Promise.all([...box.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(res => { i.onload = i.onerror = res; })));
    const top0 = box.getBoundingClientRect().top, total = box.scrollHeight;
    // page breaks only between lines / paragraphs, never through a line of text
    const cuts = [...new Set([...box.querySelectorAll('.contract > *:not(.agree), .contract section > h3, .contract li, .contract dt, .contract dd, .csign')]
      .map(el => Math.ceil(el.getBoundingClientRect().bottom - top0)))].sort((a, b) => a - b);
    const SC = 2, cv = await window.html2canvas(box, { scale:SC, backgroundColor:'#ffffff', useCORS:true, logging:false, windowWidth:PW });
    const { jsPDF } = window.jspdf, doc = new jsPDF({ unit:'mm', format:'a4', compress:true });
    const room = PH - 2 * M;
    for (let y = 0, page = 0; y < total - 2; page++) {
      let end = Math.min(total, y + room);
      if (end < total) { const c2 = cuts.filter(v => v > y + room * .5 && v <= y + room).pop(); if (c2) end = c2; }
      const pc = document.createElement('canvas'); pc.width = PW * SC; pc.height = PH * SC;
      const x = pc.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, pc.width, pc.height);
      x.drawImage(cv, 0, y * SC, PW * SC, (end - y) * SC, 0, M * SC, PW * SC, (end - y) * SC);
      x.fillStyle = '#8a948e'; x.font = `${11 * SC}px sans-serif`; x.textAlign = 'right';
      x.fillText(String(page + 1), (PW - 40) * SC, (PH - 24) * SC);
      if (page) doc.addPage();
      doc.addImage(pc.toDataURL('image/jpeg', .86), 'JPEG', 0, 0, 210, 297);
      y = end;
    }
    return doc.output('blob');
  } finally { box.remove(); }
}
function contractText(r, lg){
  const d = document.createElement('div');
  d.innerHTML = window.ER_CONTRACT.html(lg, contractStrings({ ...r.contract.raw, signed_at:r.contract.signed_at }, lg), '');
  d.querySelectorAll('li').forEach(li => li.prepend('• '));
  d.querySelectorAll('dt').forEach(dt => dt.append(': '));
  d.style.cssText = 'position:fixed;left:-9999px;top:0;width:700px;white-space:normal'; document.body.appendChild(d);
  const txt = d.innerText.replace(/\n{3,}/g, '\n\n').trim(); d.remove();
  return txt + (r.signature ? `\n\n✍️ ${tL('signed_e', lg)}` : '');
}
function downloadBlob(blob, name){
  const a = document.createElement('a'), u = URL.createObjectURL(blob);
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}
/* the phone's share sheet (WhatsApp, Telegram, Viber, mail …) with the PDF attached; where that is not possible the PDF is saved */
async function sharePdf(blob, r, lg){
  const file = new File([blob], contractFileName(r), { type:'application/pdf' });
  if (navigator.canShare?.({ files:[file] })) {
    try { await navigator.share({ files:[file], title:tL('contract_view', lg) }); return; }
    catch(e){ if (e.name === 'AbortError') return; if (e.name === 'NotAllowedError') { toast(t('share_again')); return; } console.error(e); }
  }
  downloadBlob(blob, file.name); toast(t('pdf_saved'));
}
/* all agreements of one customer (newest first) */
function customerContracts(c){
  const list = S.rentals.filter(r => r.customer_id === c.id && r.contract?.raw);
  // several vehicles rented at once share one agreement: show it once
  const seen = new Set();
  return list.filter(r => { const k = r.contract.signed_at || r.id; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}
function openCustomerContracts(c){
  const list = customerContracts(c);
  if (!list.length) { toast(t('contract_none')); return; }
  if (list.length === 1) { viewContract(list[0]); return; }
  openOv(`<div class="row between"><h2>📄 ${esc(t('contract_view'))} · ${esc(c.name)}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div>
    <div class="stack" id="cc-list">${list.map(r => `<button type="button" class="btn ccpick" data-id="${r.id}" style="justify-content:space-between;text-align:left"><span>${esc(r.contract.raw.unit || r.unit_label || '')}</span><span class="small muted num">${esc(fmtDT(r.contract.signed_at || r.created_at))}</span></button>`).join('')}</div>`);
  $('cc-list').onclick = e => { const b = e.target.closest('[data-id]'); if (b) viewContract(S.rentals.find(r => r.id === b.dataset.id)); };
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
async function uploadRentalVideo(rentalId, ids){
  if (!RV) return;
  const v = RV, path = `${rentalId}.${v.ext}`;
  toast(t('video_uploading'));
  try { await uploadBlob('rental-videos', path, v.blob, v.blob.type || 'video/' + v.ext); await q(sb.from('rentals').update({ video:path }).in('id', ids?.length ? ids : [rentalId])); setVideo(null); }
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
  const unitOf = uv => { const kind = uv.slice(0, 2), id = uv.slice(2); const f = kind === 'f:' ? S.fleet.find(y => y.id === id) : null, sp = kind === 'p:' ? S.products.find(y => y.id === id) : null;
    return { f, sp, label: f ? fleetLabel(f) : sp ? stockLabel(sp) : '' }; };
  const units = [$('r-unit').value, ...XU].map(unitOf);
  const { f, sp } = units[0];
  if (unitOptions(x.type).groups.length && units.some(u => !u.f && !u.sp)) { toast(t('need_unit')); return; }
  const btn = $('r-save'); btn.disabled = true;
  try {
    let cust = null;
    { const st = PICK['r-cust'], pre = st?.mode === 'selected' ? S.customers.find(c => c.id === st.id) : null;
      if (!st || st.mode === 'search') { toast(t('need_customer')); return; }
      if (!hasIdPhoto('r-cust', pre)) { toast(t('need_id_photo')); return; }
      const ph = st.mode === 'new' ? st.draft.phone : (st.patch?.phone ?? pre?.phone);
      if (!String(ph || '').trim()) { toast(t('need_phone')); $('r-cust').querySelector('[data-k="phone"]')?.focus(); return; } }
    try { cust = await resolveCustomer('r-cust'); } catch(e){ if (e.message === 'name') { toast(t('cust_need_name')); return; } throw e; }
    if (!cust) { toast(t('need_customer')); return; }
    const rv = $('r-rate').value, r = x.rates?.[+rv], rate = rv === 'x' ? { other:true } : r ? { n:r.n, u:r.u, p:r.p } : null;
    setEnd(false);   // start counts from now unless someone typed the return time
    const start = new Date(), endV = $('r-end').value, end = endV ? new Date(endV) : null;
    const unitLabel = units[0].label;
    const fin = rentFinal();
    const row = { type:x.type, rate, price:fin.price, deposit:r2($('r-dep').value), deposit_currency:$('r-dep-cur').value || 'GEL', deposit_payment:+$('r-dep').value ? $('r-dep-pay').value : '', unit_id:f?.id || null, product_id:sp?.id || null, unit_label:unitLabel,
      customer_id:cust.id, customer_name:cust.name, phone:cust.phone || '', seller:$('r-seller').value, payment:$('r-pay').value, created_by:S.user?.name || '',
      ends_at: end && !isNaN(end) ? end.toISOString() : null };
    const raw = { name:cust.name, doc:cust.doc_type || 'other', idnum:cust.id_number || '', dob:cust.birth_date || '', phone:cust.phone || '', nat:cust.nationality || '',
      type:x.type, unit:units.map(u => u.label).filter(Boolean).join(' + '), rate, start:start.toISOString(), end:row.ends_at, price:row.price, ...(fin.disc ? { list:fin.list, disc:fin.disc } : {}), pay:row.payment, deposit:row.deposit, dep_cur:row.deposit_currency, dep_pay:row.deposit_payment, daily:dailyRate(x.type) || 0, seller:row.seller };
    btn.disabled = false;
    // signed before (the latest signed rental of this customer): no new signature needed
    const prevSigned = S.rentals.filter(y => y.customer_id === cust.id && y.signature && y.contract?.signed_at).sort((p, q2) => String(q2.created_at).localeCompare(String(p.created_at)))[0] || null;
    const sig = await askSignature(raw, prevSigned);
    if (!sig) return;
    btn.disabled = true;
    const signedAt = sig.reuse ? sig.reuse.contract.signed_at : new Date().toISOString();
    const raw2 = sig.reuse ? { ...raw, base_id:sig.reuse.id } : raw;
    const rows = units.map((u, i) => ({ ...row, ...(i ? { deposit:0, deposit_payment:'' } : {}), unit_id:u.f?.id || null, product_id:u.sp?.id || null, unit_label:u.label, contract:{ v:1, lang:sig.lang, signed_at:signedAt, raw:raw2 } }));
    const savedAll = await q(sb.from('rentals').insert(rows).select());
    const saved = savedAll[0];
    try { const path = `contracts/${saved.id}.png`; await uploadBlob('id-photos', path, sig.blob, 'image/png'); await q(sb.from('rentals').update({ signature:path }).in('id', savedAll.map(y => y.id)));
      // the signed agreement is also kept as a PDF next to the signature (made in the background)
      const signedRow = { ...saved, signature:path };
      await contractPdf(signedRow, sig.lang).then(pdf => uploadBlob('id-photos', path.replace(/\.png$/, '.pdf'), pdf, 'application/pdf')).catch(e => console.error('contract pdf', e)); }
    catch(e){ console.error(e); toast(t('sign_fail')); }
    await uploadRentalVideo(saved.id, savedAll.map(y => y.id));
    XU = []; drawExtraUnits();
    $('r-dep').value = 0; $('r-disc').value = ''; $('r-dep-cur').value = 'GEL'; paintPills($('r-dep-cur')); $('r-unit-q').value = ''; $('r-unit').value = ''; delete $('r-end').dataset.manual; $('r-end').value = ''; resetPicker('r-cust'); toast(t('rent_started'));
    await reload('rentals', 'customers');
    const done = S.rentals.find(y => y.id === saved.id);
    if (done?.contract) viewContract(done, false, { done:true }); else showReport('rental', rentalReportData(done || { ...saved, contract:true }));
  } catch(e){ fail(e); } finally { btn.disabled = false; }
};
const sigClick = e => { const b = e.target.closest('[data-act="sig"]'); if (b) viewSignature(S.rentals.find(r => r.id === b.closest('[data-id]').dataset.id)); };
$('r-active').addEventListener('click', sigClick); $('r-history').addEventListener('click', sigClick);
async function viewSignature(r){
  if (!r?.signature) return;
  openOv(`<div class="row between"><h2>✍️ ${esc(t('signature'))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div>
    <div class="small muted">${esc(r.customer_name || '')} · ${r.contract?.signed_at ? fmtDT(r.contract.signed_at) : fmtTs(r.created_at)}</div><div id="sg-box" class="sigview muted">${esc(t('loading'))}</div>`);
  try { const d = await q(sb.storage.from('id-photos').createSignedUrl(r.signature, 600)); const b = $('sg-box'); if (b) b.innerHTML = `<img src="${esc(d.signedUrl)}" alt="${esc(t('signature'))}">`; }
  catch(e){ fail(e); }
}
$('r-active').addEventListener('click', e => { const vb = e.target.closest('[data-act="video"]'); if (vb) viewVideo(S.rentals.find(r => r.id === vb.closest('[data-id]').dataset.id)?.video); });
$('r-history').addEventListener('click', e => { const vb = e.target.closest('[data-act="video"]'); if (vb) viewVideo(S.rentals.find(r => r.id === vb.closest('[data-id]').dataset.id)?.video); });
$('r-active').onclick = async e => {
  const eb = e.target.closest('[data-act="redit"]'); if (eb) { openRentalEdit(eb.closest('[data-id]').dataset.id); return; }
  const rb = e.target.closest('[data-act="rrep"]'); if (rb) { const rr = S.rentals.find(r => r.id === rb.closest('[data-id]').dataset.id); showReport('rental', rentalReportData(rr), { rental:rr }); return; }
  const cb = e.target.closest('[data-act="contract"]'); if (cb) { viewContract(S.rentals.find(r => r.id === cb.closest('[data-id]').dataset.id)); return; }
  const fa = e.target.closest('[data-act="sendall"]'); if (fa) { sendRentalFiles(S.rentals.find(r => r.id === fa.closest('[data-id]').dataset.id)); return; }
  const sb2 = e.target.closest('[data-act="cshare"]'); if (sb2) { viewContract(S.rentals.find(r => r.id === sb2.closest('[data-id]').dataset.id), true); return; }
  const b = e.target.closest('[data-act="ret"]'); if (!b) return;
  const r = S.rentals.find(x => x.id === b.closest('[data-id]').dataset.id); if (r) openReturn(r);
};
/* return: late fee shown, "paid" must be pressed before the rental can be finished */
async function openReturn(r){
  let late = lateCalc(r);
  try { const v = await q(sb.rpc('rental_late', { p_id:r.id })); if (v) late = v; } catch(e){ console.error(e); }
  const fee = +late.fee || 0, row = (k, v) => v ? `<div class="kv"><span class="muted">${esc(t(k))}</span><b class="num">${v}</b></div>` : '';
  openOv(`<div class="row between"><h2>${esc(t('return_title'))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div>
    <div><b>${esc(tType(r.type))}</b>${r.unit_label ? ` · ${esc(locData(r.unit_label))}` : ''} · ${esc(rateLabel(r.rate))}<div class="small muted">${esc(r.customer_name || '')} ${esc(r.phone || '')}</div></div>
    <div class="stack" style="gap:4px">${row('started', fmtTs(r.created_at))}${row('return_by', r.ends_at ? fmtTs(r.ends_at) : '')}${row('returned_at', fmtTs(new Date()))}${row('rent_fee', money(r.price))}</div>
    ${fee ? `<div class="latebox stack">
        <div class="row between"><b>${esc(t('late_by'))} ${late.hours} ${esc(t('hours_short'))}</b><b class="num">+${money(fee)}</b></div>
        <div class="small muted num">${late.hours} × 10% × ${money(late.daily)} (${esc(t('daily_rate'))})</div>
        <div class="row between" style="font-size:18px"><span>${esc(t('total_due'))}</span><b class="num">${money(r2(+r.price + fee))}</b></div>
        <label class="f"><span>${esc(t('payment'))}</span><select id="rt-pay">${PAYS.map(k => `<option value="${k}" ${k === (r.payment || 'cash') ? 'selected' : ''}>${esc(tPay(k))}</option>`).join('')}</select></label>
        <button type="button" class="btn big paidbtn" id="rt-paid" aria-pressed="false">${esc(t('mark_paid'))} · ${money(fee)}</button></div>`
      : `<div class="okbox">${esc(t(r.ends_at ? 'on_time' : 'no_end_time'))}</div>`}
    ${+r.deposit ? `<div class="stack" style="gap:4px"><label class="f">${esc(t('dep_returned'))} (${esc(CUR_SIGN[r.deposit_currency || 'GEL'] || r.deposit_currency)})<input id="rt-dep" type="number" min="0" max="${+r.deposit}" step="0.01" inputmode="decimal" class="num" value="${+r.deposit}"></label>
      <div class="small muted" id="rt-kept"></div></div>` : ''}
    <button type="button" class="btn primary big" id="rt-done" ${fee ? 'disabled' : ''}>${esc(t('finish_rental'))}</button>
    ${fee ? `<div class="small muted" id="rt-hint">${esc(t('paid_first'))}</div>` : ''}`);
  if ($('rt-paid')) $('rt-paid').onclick = () => { const on = $('rt-paid').getAttribute('aria-pressed') !== 'true'; $('rt-paid').setAttribute('aria-pressed', on); $('rt-done').disabled = !on; $('rt-hint').hidden = on; };
  // part of the deposit can be kept (damage, fuel …): typed by hand, shown in the report
  const depBack = () => $('rt-dep') ? Math.min(+r.deposit, Math.max(0, r2($('rt-dep').value))) : 0;
  if ($('rt-dep')) { const kept = () => { const k = r2(+r.deposit - depBack()); $('rt-kept').textContent = k > 0 ? `${t('dep_kept')}: ${money(k, r.deposit_currency || 'GEL')}` : ''; }; $('rt-dep').oninput = kept; kept(); }
  $('rt-done').onclick = async () => {
    const btn = $('rt-done'); btn.disabled = true;
    const back = depBack(), feePay = $('rt-pay')?.value || '', at = new Date();
    try {
      await q(sb.rpc('return_rental', { p_id:r.id, p_fee:fee, p_payment:feePay }));
      closeOv(); toast(t('return_saved') + (fee ? ' · +' + money(fee) : '')); await reload('rentals');
      const rr = S.rentals.find(x => x.id === r.id) || r;
      showReport('ret', { dep:+r.deposit || 0, back, cur:r.deposit_currency || 'GEL', payLabel: lg => tL('pay_' + (r.deposit_payment || 'cash'), lg),
        fee, feePay: lg => feePay ? tL('pay_' + feePay, lg) : '', time:`${pad(at.getHours())}:${pad(at.getMinutes())}` }, { rental:rr });
    } catch(err){
      if (/fee_changed/.test(err?.message || '')) { toast(t('fee_changed')); closeOv(); openReturn(r); return; }
      fail(err); btn.disabled = false;
    }
  };
}
$('r-history').onclick = e => { const eb = e.target.closest('[data-act="redit"]'); if (eb) { openRentalEdit(eb.closest('[data-id]').dataset.id); return; }
  const rb = e.target.closest('[data-act="rrep"]'); if (rb) { const rr = S.rentals.find(r => r.id === rb.closest('[data-id]').dataset.id); showReport('rental', rentalReportData(rr), { rental:rr }); return; } const sb2 = e.target.closest('[data-act="cshare"]'); if (sb2) { viewContract(S.rentals.find(r => r.id === sb2.closest('[data-id]').dataset.id), true); return; } const cb = e.target.closest('[data-act="contract"]'); if (cb) viewContract(S.rentals.find(r => r.id === cb.closest('[data-id]').dataset.id)); };

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
      <label class="f">${esc(t('deposit'))}<span class="row" style="flex-wrap:nowrap;gap:6px"><input id="re-dep" type="number" min="0" step="0.01" inputmode="decimal" value="${+r.deposit || 0}">
        <select id="re-dep-cur" style="width:auto">${['GEL','USD','EUR'].map(c => `<option value="${c}" ${(r.deposit_currency || 'GEL') === c ? 'selected' : ''}>${CUR_SIGN[c]}</option>`).join('')}</select></span></label>
      <label class="f">${esc(t('dep_payment'))}<select id="re-dep-pay"><option value=""></option>${['cash','card','transfer'].map(k => `<option value="${k}" ${r.deposit_payment === k ? 'selected' : ''}>${esc(tPay(k))}</option>`).join('')}</select></label>
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
      rate: u === 'x' ? { other:true } : { n:Math.max(1, +$('re-n').value || 1), u, p:price }, price, deposit:r2($('re-dep').value), deposit_currency:$('re-dep-cur').value, deposit_payment:$('re-dep-pay').value,
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
  return { date:fmtD(date), money:m, total, discount:+extra || 0, seller, note, buyer:cust?.name || '', nat:natCode(cust?.nationality),
    payLabel: lg => payment ? tL('pay_' + payment, lg) : '',
    lines: (lines || []).map(l => { const p = S.products.find(x => x.id === l.product_id); const qty = +l.qty || 1, price = +l.unit_price || 0;
      return { name:l.name, code:p?.code || l.code || '', vin:l.vin || '', veh:VEH.includes(l.type), qty, price, sum:r2(l.total ?? qty * price), typeLabel: lg => tL('t_' + l.type, lg) }; }) };
}
function rentalReportData(r){
  if (!r) return null;
  const c = S.customers.find(x => x.id === r.customer_id) || {}, raw = r.contract?.raw || {};
  return { item: lg => [tL('t_' + r.type, lg), r.unit_label].filter(Boolean).join(' · '), period: lg => rateLabel(r.rate, lg),
    fee: repMoney('GEL')(r.price), disc: +raw.disc ? repMoney('GEL')(raw.disc) : '', payLabel: lg => r.payment ? tL('pay_' + r.payment, lg) : '', deposit: +r.deposit ? lg => repMoney(r.deposit_currency || 'GEL')(r.deposit) + (r.deposit_payment ? ' · ' + tL('pay_' + r.deposit_payment, lg) : '') : '',
    cust: r.customer_name || c.name || '', tel: r.phone || c.phone || '', nat: natCode(c.nationality || raw.nat),
    docPhoto: !!c.photo, signed: !!r.contract, video: !!r.video, late: +r.late_fee ? { hours:+r.late_hours || 0, fee:repMoney('GEL')(r.late_fee), total:repMoney('GEL')(rentSum(r)) } : null, today: dayKey(new Date(r.created_at)) === dayKey(new Date()), date: fmtD(new Date(r.created_at)), start: fmtShort(r.created_at), end: r.ends_at ? fmtShort(r.ends_at) : '', seller: r.seller || '' };
}
function repLangs(){ try { const v = JSON.parse(ls.get('er-rep-langs') || 'null'); if (Array.isArray(v) && v.length) return v; } catch(e){} return ['en', 'ja']; }
function showReport(kind, data, opts = {}){
  if (!data) return;
  let langs = repLangs();
  openOv(`<div class="row between"><h2>${esc(t('report_title'))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div>
    <div class="langpick" id="rp-langs">${window.ER_REPORT.langs.map(k => `<button type="button" class="chip" data-l="${k}"></button>`).join('')}</div>
    <textarea id="rp-text" class="reptext" rows="14" spellcheck="false"></textarea>
    <div class="row" style="gap:8px"><button type="button" class="btn primary big" id="rp-copy" style="flex:1;width:auto">${esc(t('copy'))}</button>
      <a class="btn big wa" id="rp-wa" target="_blank" rel="noopener" style="flex:1;width:auto">${esc(t('send_wa'))}</a></div>
    ${opts.rental ? `<div class="stack" style="gap:6px;border-top:1px solid var(--line);padding-top:10px">${custWaBtn('rp-cwa', false)}<button type="button" class="btn" id="rp-files">📎 ${esc(t('rent_done_files'))}</button></div>` : ''}`);
  if (opts.rental) { armCustWa('rp-cwa', opts.rental); $('rp-files').onclick = () => sendRentalFiles(opts.rental); }
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
/* customers: glass cards in Easy Ride yellow — number, avatar, name, nationality with flag, status; "show" opens stats and details */
S.kOpen = S.kOpen || {};
const KCOL = ['#FFE680','#FFD27A','#FFC2A8','#E9E3FF','#C9F0E3','#CFE6FF','#FFD6E8'];
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
const hashN = s => [...String(s || '')].reduce((a, ch) => (a * 31 + ch.codePointAt(0)) >>> 0, 7);
function natInfo(raw){
  const v = String(raw || '').trim(); if (!v) return null;
  const C = window.ER_COUNTRIES || {}, up = v.toUpperCase();
  let a3 = C[up] ? up : Object.keys(C).find(k => C[k].toLowerCase() === v.toLowerCase());
  const a2 = a3 && (window.ER_ISO2 || {})[a3];
  if (!a2) return { flag:'<span class="kflag">🌐</span>', name:v };
  const lg = LANGS_ISO[li()] || 'en';
  let name = lg === 'ka' && (window.ER_COUNTRY_KA || {})[a3] || C[a3];
  if (!(lg === 'ka' && (window.ER_COUNTRY_KA || {})[a3]) && lg !== 'en') {
    try { if (Intl.DisplayNames.supportedLocalesOf([lg]).length) name = new Intl.DisplayNames([lg], { type:'region', fallback:'none' }).of(a2) || name; } catch(e){}
  }
  // a picture: Windows shows emoji flags as two letters
  return { flag:`<img class="kflag" src="https://flagcdn.com/w40/${a2.toLowerCase()}.png" width="26" height="19" alt="" loading="lazy" onerror="this.remove()">`, name };
}
const LANGS_ISO = ['ka', 'en', 'ru', 'ja'];
function renderCustomers(){
  const qq = $('k-q').value.trim(), list = S.customers.filter(c => !qq || custMatch(c, qq));
  const st = {}, g = id => st[id] ??= { s:0, r:0, sum:0, last:'' };
  S.sales.forEach(s => { if (!s.customer_id) return; const o = g(s.customer_id); o.s++; if (gel(s)) o.sum += +s.total || 0; if (s.created_at > o.last) o.last = s.created_at; });
  S.rentals.forEach(r => { if (!r.customer_id || r.status === 'cancelled') return; const o = g(r.customer_id); o.r++; o.sum += rentSum(r); if (r.created_at > o.last) o.last = r.created_at; });
  const hasContract = {}; S.rentals.forEach(r => { if (r.customer_id && r.contract?.raw) hasContract[r.customer_id] = 1; });
  const mx = { s:1, r:1, sum:1 }; Object.values(st).forEach(o => { mx.s = Math.max(mx.s, o.s); mx.r = Math.max(mx.r, o.r); mx.sum = Math.max(mx.sum, o.sum); });
  const level = o => !o ? 'new' : (o.sum >= 1000 || o.s + o.r >= 5) ? 'vip' : (o.s + o.r >= 2) ? 'regular' : 'new';
  const bar = (cls, v, max, label, txt) => `<div class="kbar ${cls}"><span class="kb-track"><span class="kb-fill" style="width:${Math.max(4, Math.round(100 * v / max))}%"></span></span><span class="kb-v"><b class="num">${txt}</b> ${esc(label)}</span></div>`;
  $('k-list').className = 'kglass';
  $('k-list').innerHTML = !list.length ? `<div class="empty">${esc(t(S.customers.length ? 'nothing_found' : 'cust_none'))}</div>` : list.slice(0, 300).map((c, i) => {
    const o = st[c.id], open = !!S.kOpen[c.id], nat = natInfo(c.nationality), lv = level(o), col = KCOL[hashN(c.id) % KCOL.length];
    const facts = [['cust_phone', c.phone], ['cust_idnum', c.id_number], ['cust_birth', c.birth_date && fmtDate(c.birth_date)], ['cust_doc', c.doc_type && t('doc_' + c.doc_type)],
      ['doc_expiry', c.doc_expiry && fmtDate(c.doc_expiry)], ['k_last', o?.last && fmtTs(o.last)], ['k_since', c.created_at && fmtDate(String(c.created_at).slice(0, 10))]].filter(([, v]) => v);
    return `<div class="kcard ${open ? 'open' : ''}" data-id="${c.id}">
      <div class="kmain">
        <span class="knum num">${String(i + 1).padStart(2, '0')}</span>
        <span class="kava" style="--kc:${col}">${esc(initials(c.name))}</span>
        <div class="kcol kname"><small>${esc(t('k_name'))}</small><b>${esc(c.name)}</b>${ageChip(c)}</div>
        <div class="kcol knat"><small>${esc(t('cust_nat'))}</small><b>${nat ? `${nat.flag}${esc(nat.name)}` : '—'}</b></div>
        <div class="kcol klv"><small>${esc(t('k_level'))}</small><b class="lv-${lv}">${esc(t('k_lv_' + lv))}</b></div>
        <button type="button" class="kbtn" data-act="toggle" aria-expanded="${open}">${esc(t(open ? 'k_hide' : 'k_show'))} <span class="kcar">⌃</span></button>
      </div>
      ${open ? `<div class="kmore">
        <div class="kstat"><small>${esc(t('k_stat'))}</small>
          ${bar('b1', o?.r || 0, mx.r, t('cust_rentals'), o?.r || 0)}${bar('b2', o?.s || 0, mx.s, t('cust_purchases'), o?.s || 0)}${bar('b3', o?.sum || 0, mx.sum, t('k_spent'), money(o?.sum || 0))}</div>
        <div class="kdesc"><small>${esc(t('k_details'))}</small>
          <dl>${facts.map(([k, v]) => `<dt>${esc(t(k))}</dt><dd class="num">${esc(v)}</dd>`).join('') || `<dd class="muted">—</dd>`}</dl>
          <div class="kacts">${hasContract[c.id] ? `<button class="btn ghost small" data-act="contracts">📄 ${esc(t('contract_view'))}</button>` : ''}${c.photo ? `<button class="btn ghost small" data-act="view">${esc(t('cust_photo_view'))}</button>` : `<span class="tag out">${esc(t('cust_no_photo'))}</span>`}
            <button class="btn ghost small" data-act="edit">${esc(t('edit'))}</button>${isAdmin() ? `<button class="btn ghost small danger" data-act="del">${esc(t('remove'))}</button>` : ''}</div></div>
      </div>` : ''}</div>`; }).join('');
}
$('k-q').oninput = renderCustomers;
$('k-add').onclick = () => openCustomer(null);
$('k-list').onclick = e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const c = S.customers.find(x => x.id === b.closest('[data-id]').dataset.id); if (!c) return;
  if (b.dataset.act === 'toggle') { if (S.kOpen[c.id]) delete S.kOpen[c.id]; else S.kOpen[c.id] = 1; renderCustomers(); return; }
  if (b.dataset.act === 'view') viewIdPhoto(c.photo);
  if (b.dataset.act === 'contracts') openCustomerContracts(c);
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
      <label class="f">${esc(t('cust_doc'))}<select id="kf-doc"><option value=""></option>${['passport','id','dl'].map(k => `<option value="${k}" ${c?.doc_type === k ? 'selected' : ''}>${esc(t('doc_' + k))}</option>`).join('')}</select></label>
      <label class="f">${esc(t('doc_expiry'))}<input id="kf-exp" type="date" value="${esc(c?.doc_expiry || '')}"></label></div>
    <div class="scanrow">${canLive() ? `<button type="button" class="btn small scan" id="kf-live">${esc(t('scan_id'))}</button>` : `<label class="btn small scan">${esc(t('scan_id'))}<input type="file" accept="image/*" capture="environment" class="kf-scan" hidden></label>`}
      <label class="btn small scan up">${esc(t('upload_id'))}<input type="file" accept="image/*" class="kf-scan" hidden></label></div>
    <div id="kf-msg"></div>
    <div class="row"><span id="kf-ph">${c?.photo ? `<button type="button" class="btn ghost small" id="kf-view">${esc(t('cust_photo_view'))}</button>` : `<span class="tag out">${esc(t('cust_no_photo'))}</span>`}</span>
      <label class="btn small">${esc(t('cust_photo_add'))}<input type="file" class="kf-file" accept="image/*" capture="environment" hidden></label>
      <label class="btn small">${esc(t('upload_photo'))}<input type="file" class="kf-file" accept="image/*" hidden></label></div>
    <button class="btn primary big" type="submit" id="kf-save">${esc(t('save'))}</button></form>`);
  if ($('kf-view')) $('kf-view').onclick = () => viewIdPhoto(c.photo);
  // read the passport / ID / driving licence and fill the form (the picture is kept as the ID photo)
  const kmsg = (k, cls = '') => { $('kf-msg').innerHTML = k ? `<div class="scanmsg ${cls}">${esc(t(k))}</div>` : ''; };
  const fillFrom = async (blob, pre) => {
    if (!pre) kmsg('scanning');
    try { photo = await compressImage(blob, 1600, .8); $('kf-ph').innerHTML = `<img class="thumb" src="${URL.createObjectURL(photo)}" alt="">`; } catch(err){ console.error(err); }
    let got = pre || null;
    if (!got) { try { got = await readDocument(blob); } catch(err){ console.error(err); } }
    const r = got?.out; if (!$('kf')) return;
    if (!r) { kmsg('scan_fail', 'bad'); return; }
    const latin = titleCase([r.given, r.surname].filter(Boolean).join(' '));
    const set = (id, v) => { if (v) $(id).value = v; };
    set('kf-name', r.local || latin); set('kf-id', r.personal || r.number); set('kf-birth', r.birth);
    set('kf-nat', r.nationality); set('kf-exp', r.expiry); if (r.kind) $('kf-doc').value = r.kind;
    kmsg(r.partial || !r.valid ? 'scan_partial' : 'scan_ok', r.partial || !r.valid ? '' : 'ok');
    // Georgian / Russian holders: their name in their own script, once it has been read
    if (latin && !r.local) (got.bmp ? Promise.resolve(got.bmp) : bitmapOf(blob)).then(bmp => localNameOf(bmp, got.rot || 0, r)).then(n => { if (n && $('kf-name') && $('kf-name').value === latin) $('kf-name').value = n; });
  };
  if ($('kf-live')) $('kf-live').onclick = async () => { const res = await liveScanKeep(); if (res?.blob) fillFrom(res.blob, res.out ? { out:res.out } : null); else if (res === undefined) toast(t('scan_cam_denied')); };
  document.querySelectorAll('.kf-scan').forEach(inp => inp.onchange = e => { const f = e.target.files?.[0]; if (f) fillFrom(f); e.target.value = ''; });
  document.querySelectorAll('.kf-file').forEach(inp => inp.onchange = async e => { if (!e.target.files[0]) return; toast(t('photo_saving')); try { photo = await compressImage(e.target.files[0], 1600, .8); $('kf-ph').innerHTML = `<img class="thumb" src="${URL.createObjectURL(photo)}" alt="">`; } catch(err){ toast(t('photo_fail')); } });
  $('kf').onsubmit = async e => {
    e.preventDefault();
    const d = nullDates({ name:$('kf-name').value.trim(), phone:$('kf-phone').value.trim(), id_number:$('kf-id').value.trim(),
      birth_date:$('kf-birth').value, nationality:(window.MRZ?.nationCode($('kf-nat').value, window.ER_COUNTRIES || {}) || $('kf-nat').value.trim().toUpperCase()), doc_type:$('kf-doc').value, doc_expiry:$('kf-exp').value }); if (!d.name) return;
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
  renderVehSold(sales);
  $('rp-sales').innerHTML = sales.length ? `<table><thead><tr><th>${esc(t('col_time'))}</th><th>${esc(t('col_items'))}</th><th>${esc(t('seller'))}</th><th>${esc(t('payment'))}</th><th class="r">${esc(t('col_amount'))}</th><th></th></tr></thead><tbody>${sales.map(s => `<tr data-id="${s.id}"><td class="num">${fmtTs(s.created_at)}</td>
    <td>${(s.lines || []).map(l => `${esc(l.name)}${l.qty > 1 ? ` ×${l.qty}` : ''}${+l.unit_price !== +l.list_price && +l.list_price ? ` <span class="strike">${money(l.list_price)}</span>` : ''}${+l.pct ? ` <span class="tag low">−${+l.pct}%</span>` : ''}${l.vin ? ` <span class="small muted num">VIN ${esc(l.vin)}</span>` : ''}`).join('<br>')}${s.customer_name ? `<div class="small muted">${esc(s.customer_name)} ${esc(s.phone || '')}</div>` : ''}${s.note ? `<div class="small muted">${esc(s.note)}</div>` : ''}</td>
    <td>${esc(s.seller || '')}</td><td>${esc(tPay(s.payment))}</td><td class="r num"><b>${money(s.total, s.currency)}</b>${+s.extra_discount ? `<div class="small muted">−${money(s.extra_discount, s.currency)}</div>` : ''}</td>
    <td style="white-space:nowrap"><button class="btn ghost small" data-act="srep">${esc(t('report_btn'))}</button>${isAdmin() ? `<button class="btn ghost small" data-act="edit">${esc(t('edit'))}</button><button class="btn ghost small danger" data-act="void">${esc(t('void'))}</button>` : ''}</td></tr>`).join('')}</tbody></table>` : `<div class="empty small">${esc(t('no_records'))}</div>`;
}
/* vehicles sold per type — all time (every sale, not only the 1000 loaded ones) and in the chosen period */
let ALLV = null, ALLV_AT = 0, VS_OPEN = '';
async function loadAllVehSales(){
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const part = await q(sb.from('sales').select('lines,currency').order('created_at', { ascending:true }).range(from, from + 999));
    rows.push(...(part || [])); if (!part || part.length < 1000) break;
  }
  ALLV = rows; ALLV_AT = Date.now();
}
const vehName = l => String(l.name || '—').replace(/^[A-Z]{2}\s?\d{3,4}\s*·\s*/, '').trim() || '—';
function vehTally(sales){
  const o = {};
  sales.forEach(s => (s.lines || []).forEach(l => { if (!VEH.includes(l.type)) return;
    const x = o[l.type] ??= { q:0, sum:{}, models:{} }, qn = +l.qty || 0;
    x.q += qn; addCur(x.sum, s.currency, l.total ?? (qn * (+l.unit_price || 0)));
    const m = x.models[vehName(l)] ??= { q:0, sum:{} }; m.q += qn; addCur(m.sum, s.currency, l.total ?? (qn * (+l.unit_price || 0))); }));
  return o;
}
function renderVehSold(periodSales){
  const box = $('rp-vall'); if (!box) return;
  if (!ALLV || Date.now() - ALLV_AT > 60000) {
    if (!ALLV) box.innerHTML = `<div class="small muted pad">${esc(t('loading'))}</div>`;
    loadAllVehSales().then(() => { if (S.tab === 'report') renderVehSold(periodSales); }).catch(e => { console.error(e); if (!ALLV) box.innerHTML = `<div class="small muted pad">${esc(t('save_failed'))}</div>`; });
    if (!ALLV) return;
  }
  const all = vehTally(ALLV), per = vehTally(periodSales);
  const types = VEH.filter(k => all[k]);
  const total = types.reduce((n, k) => n + all[k].q, 0);
  $('rp-vall-n').textContent = total ? `${t('total')}: ${total} ${t('pcs')}` : '';
  if (!types.length) { box.innerHTML = `<div class="empty">${esc(t('no_records'))}</div>`; return; }
  if (VS_OPEN && !all[VS_OPEN]) VS_OPEN = '';
  box.innerHTML = `<div class="vsold">${types.map(k => `<button type="button" class="vtile" data-t="${k}" aria-pressed="${VS_OPEN === k}">
      <span class="vt-n num">${all[k].q}</span><span class="vt-l">${esc(tType(k))}</span>
      <span class="vt-s num">${moneyMulti(all[k].sum)}</span>
      <span class="vt-p small">${esc(t('in_period'))}: <b class="num">${per[k]?.q || 0}</b></span></button>`).join('')}</div>
    ${VS_OPEN ? (() => { const ms = Object.entries(all[VS_OPEN].models).sort((a, b) => b[1].q - a[1].q || a[0].localeCompare(b[0]));
      return `<div class="tw"><table><thead><tr><th>${esc(tType(VS_OPEN))} — ${esc(t('model_col'))}</th><th class="r">${esc(t('col_units'))}</th><th class="r">${esc(t('col_sum'))}</th></tr></thead>
        <tbody>${ms.map(([n, m]) => `<tr><td>${esc(n)}</td><td class="r num">${m.q}</td><td class="r num">${moneyMulti(m.sum)}</td></tr>`).join('')}</tbody></table></div>`; })() : `<div class="small muted pad" style="padding-top:0">${esc(t('vsold_hint'))}</div>`}`;
}
$('rp-vall').onclick = e => { const b = e.target.closest('.vtile'); if (!b) return; VS_OPEN = VS_OPEN === b.dataset.t ? '' : b.dataset.t; renderReport(); };
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
  const list = [...S.staff].sort((a, b) => (b.active - a.active) || ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || staffName(a).localeCompare(staffName(b)));
  $('st-staff').innerHTML = list.length ? list.map(x => `<button type="button" class="tariff staffrow ${x.active ? '' : 'off'}" data-email="${esc(x.email)}">
      <span class="row" style="gap:8px;flex-wrap:nowrap">${roleBadge(x.role)}<b>${esc(x.name || t('shared_account'))}</b>${x.active ? '' : ` <span class="tag out">${esc(t('inactive'))}</span>`}</span>
      <span class="small muted">${esc(x.phone || '')} ›</span></button>`).join('') : `<div class="small muted">—</div>`;
  // sellers that are in the sellers list but have no login yet: one password field each
  const have = new Set(S.staff.map(x => String(x.name || '').toLowerCase()));
  const missing = isOwner() ? (S.settings.sellers || []).filter(n => n && !have.has(n.toLowerCase())) : [];
  $('st-noacc').innerHTML = missing.length ? `<div class="noacc"><div class="small" style="font-weight:600">${esc(t('no_login_yet'))}</div>
    ${missing.map(n => `<div class="row" style="flex-wrap:nowrap;gap:6px" data-n="${esc(n)}"><b style="min-width:70px">${esc(n)}</b><input type="password" autocomplete="new-password" placeholder="${esc(t('password'))}" aria-label="${esc(t('password'))} ${esc(n)}"><button type="button" class="btn small primary" data-act="mk">${esc(t('create_login'))}</button></div>`).join('')}</div>` : '';
}
$('st-noacc').onclick = async e => {
  const b = e.target.closest('[data-act="mk"]'); if (!b) return;
  const row = b.closest('[data-n]'), pw = row.querySelector('input').value;
  if (pw.length < 6) { toast(t('pw_short')); row.querySelector('input').focus(); return; }
  b.disabled = true;
  try { await q(sb.rpc('admin_create_staff', { p_name:row.dataset.n, p_role:'consultant', p_password:pw, p_phone:'' })); toast(t('staff_created') + ' · ' + row.dataset.n); await reload('staff', 'settings'); }
  catch(err){ fail(err); b.disabled = false; }
};
$('who-btn').onclick = () => openMe();
function openMe(){
  const u = S.user; if (!u) return;
  openOv(`<div class="row between"><h2>${esc(t('my_profile'))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div>
    <div class="row" style="gap:10px">${roleBadge(u.role)}<span class="muted">${esc(t(roleKey(u.role)))}</span></div>
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
  openOv(`<div class="row between"><h2>${x ? `${roleBadge(x.role, 'vertical-align:-4px')} ${esc(x.name || t('shared_account'))}` : esc(t('all_activity'))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div>
    ${x && !isOwner() ? `<div class="small muted">${esc(t(roleKey(x.role)))}${x.phone ? ' · ' + esc(x.phone) : ''}</div>` : ''}
    ${x && isOwner() ? `<form id="sx" class="stack"><div class="formgrid two">
      <label class="f">${esc(t('cust_name'))}<input id="sx-name" value="${esc(x.name || '')}"></label>
      <label class="f">${esc(t('cust_phone'))}<input id="sx-phone" type="tel" value="${esc(x.phone || '')}"></label>
      <label class="f">${esc(t('role'))}<select id="sx-role" ${me ? 'disabled' : ''}>${['consultant', 'moderator', 'admin'].map(r => `<option value="${r}" ${x.role === r ? 'selected' : ''}>${esc(t(roleKey(r)))}</option>`).join('')}</select></label>
      <label class="f">${esc(t('pw_new'))}<input id="sx-pw" type="password" autocomplete="new-password" placeholder="${esc(t('pw_keep'))}"></label></div>
      <label class="row small"><input type="checkbox" id="sx-active" ${x.active ? 'checked' : ''} ${me ? 'disabled' : ''}> ${esc(t('account_active'))}</label>
      <button class="btn primary" id="sx-save">${esc(t('save'))}</button></form>` : ''}
    ${!x || x.name ? `<div class="stats small3">${[['sale_today', st(sl, today, r => +r.total || 0)], ['p_month30', st(sl, a, r => +r.total || 0)], ['rent_today', st(rl, today, rentSum)], ['rent_month30', st(rl, a, rentSum)]].map(([k, v]) => `<div class="panel stat"><h3>${esc(t(k))}</h3><div class="v num">${v}</div></div>`).join('')}</div>` : ''}
    <h3 style="margin:6px 0 0">${esc(t('activity'))}</h3><div id="sx-log" class="actlog"><div class="small muted">${esc(t('loading'))}</div></div>`, 'wide');
  if (x && $('sx')) $('sx').onsubmit = async e => {
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
  if (k === 'role') return t(roleKey(v));
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
  const veh = r => esc([tType(r.type), locData(r.unit_label)].filter(Boolean).join(' · '));
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

/* ================= finance: dashboard, cash register, expenses, CSV ================= */
/* deposits are money held for the customer — they count in the cash drawer, never in revenue */
const EXP_CATS = ['rent','salary','fuel','repair','parts','utilities','marketing','tax','supplies','other'];
const STOCK_REASONS = ['received','writeoff','damaged','correction','supplier_return','customer_return','other'];
const missingFn = e => /PGRST202|PGRST205|42P01|42883|does not exist|Could not find/i.test((e?.code || '') + ' ' + (e?.message || ''));
S.fin = { ready:null, expenses:[], cash:null, moves:[], from:'', to:'' };
async function loadFin(){
  const today = dayKey(new Date());
  try {
    const [ex, cs] = await Promise.all([
      q(sb.from('expenses').select('*').order('created_at', { ascending:false }).limit(2000)),
      q(sb.from('cash_sessions').select('*').eq('day', today).limit(1))
    ]);
    S.fin.expenses = ex || []; S.fin.cash = (cs || [])[0] || null; S.fin.ready = true;
    S.fin.moves = [];
    if (isAdmin()) try { S.fin.moves = await q(sb.from('stock_moves').select('*').order('at', { ascending:false }).limit(60)) || []; } catch(e){ console.error(e); }
  } catch(e){ if (missingFn(e)) S.fin.ready = false; else { console.error(e); S.fin.ready = S.fin.ready ?? false; } }
}
const gel = x => (x.currency || 'GEL') === 'GEL';
const isCash = p => p === 'cash';
/* every cash movement of one day, worked out from the real records */
function cashFlow(day){
  const sales = S.sales.filter(s => s.day === day && gel(s) && isCash(s.payment)).reduce((a, s) => a + (+s.total || 0), 0);
  const rentsToday = S.rentals.filter(r => r.day === day && r.status !== 'cancelled');
  const rentFees = rentsToday.filter(r => isCash(r.payment)).reduce((a, r) => a + (+r.price || 0), 0);
  const late = S.rentals.filter(r => +r.late_fee && isCash(r.late_payment) && r.returned_at && dayKey(new Date(r.returned_at)) === day).reduce((a, r) => a + (+r.late_fee || 0), 0);
  const depCash = r => +r.deposit && isCash(r.deposit_payment) && (r.deposit_currency || 'GEL') === 'GEL';
  const depIn = S.rentals.filter(r => r.day === day && depCash(r)).reduce((a, r) => a + (+r.deposit || 0), 0);
  const backAt = r => r.returned_at || r.cancelled_at;
  const depOut = S.rentals.filter(r => depCash(r) && r.status !== 'active' && backAt(r) && dayKey(new Date(backAt(r))) === day).reduce((a, r) => a + (+r.deposit || 0), 0);
  const exp = S.fin.expenses.filter(x => x.day === day && gel(x) && isCash(x.payment)).reduce((a, x) => a + (+x.amount || 0), 0);
  const opening = +S.fin.cash?.opening || 0;
  return { opening, sales, rentFees, late, depIn, depOut, exp, expected:r2(opening + sales + rentFees + late + depIn - depOut - exp) };
}
function finRange(){ return [$('fn-from').value || '0000', $('fn-to').value || '9999']; }
function renderFin(){
  if (S.fin.ready === null) { $('fn-body').innerHTML = `<div class="empty">${esc(t('loading'))}</div>`; loadFin().then(() => S.tab === 'fin' && renderFin()); return; }
  if (!S.fin.ready) { $('fn-body').innerHTML = `<div class="panel pad small">${esc(t('fin_need_db'))}</div>`; return; }
  if (!$('fn-from').value) { const n = new Date(); $('fn-from').value = dayKey(new Date(n.getFullYear(), n.getMonth(), 1)); $('fn-to').value = dayKey(n); }
  const today = dayKey(new Date()), [a, b] = finRange(), inR = x => x.day >= a && x.day <= b;
  const parts = [];
  if (isAdmin()) parts.push(dashHtml(a, b, inR));
  parts.push(cashHtml(today));
  parts.push(expHtml(inR));
  if (isAdmin()) parts.push(movesHtml());
  $('fn-body').innerHTML = parts.join('');
}
function tile(k, v, cls = '', sub = ''){ return `<div class="panel stat ${cls}"><h3>${esc(t(k))}</h3><div class="v num">${v}</div>${sub ? `<div class="small muted">${sub}</div>` : ''}</div>`; }
function dashHtml(a, b, inR){
  const sales = S.sales.filter(inR), rents = S.rentals.filter(r => inR(r) && r.status !== 'cancelled'), exps = S.fin.expenses.filter(inR);
  const rev = sales.reduce((acc, x) => addCur(acc, x.currency, x.total), {});
  const rentRev = rents.reduce((s, r) => s + rentSum(r), 0);
  const expSum = exps.reduce((acc, x) => addCur(acc, x.currency, x.amount), {});
  const net = r2((rev.GEL || 0) + rentRev - (expSum.GEL || 0));
  const active = S.rentals.filter(r => r.status === 'active');
  const held = active.reduce((acc, r) => +r.deposit ? addCur(acc, r.deposit_currency || 'GEL', r.deposit) : acc, {});
  const overdue = active.filter(r => r.ends_at && new Date(r.ends_at) < new Date());
  const inStock = S.products.filter(p => +p.qty > 0);
  const val = inStock.reduce((s, p) => s + (+p.price || 0) * (+p.qty || 0), 0);
  const vehN = inStock.filter(p => !isEasy(p)).reduce((s, p) => s + (+p.qty || 0), 0);
  const low = S.products.filter(p => isEasy(p) && +p.qty === 1);
  const noPrice = inStock.filter(p => !+p.price).length;
  return `<div class="stats">${tile('rs_sales_rev', moneyMulti(rev))}${tile('rs_rent_rev', money(rentRev))}${tile('fin_expenses', moneyMulti(expSum))}${tile('fin_net', money(net), net < 0 ? 'neg' : '', esc(t('fin_net_hint')))}</div>
  <div class="stats">${tile('fin_dep_held', moneyMulti(held), '', esc(t('fin_dep_hint')) + ' · ' + active.filter(r => +r.deposit).length)}${tile('fin_overdue', String(overdue.length), overdue.length ? 'neg' : '')}${tile('fin_stock_val', money(val), '', `${vehN} ${esc(t('kind_veh'))}${noPrice ? ' · ' + noPrice + ' ' + esc(t('fin_no_price')) : ''}`)}${tile('fin_low', String(low.length))}</div>
  ${overdue.length ? `<div class="panel"><div class="pad"><h3>${esc(t('fin_overdue'))}</h3></div><div class="tw"><table><tbody>${overdue.map(r => `<tr><td>${esc(locData(r.unit_label || ''))}</td><td>${esc(r.customer_name || '')} <span class="muted small">${esc(r.phone || '')}</span></td><td class="num"><span class="due late">${fmtTs(r.ends_at)}</span></td><td class="r num">${+r.deposit ? money(r.deposit, r.deposit_currency) : ''}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
  ${low.length ? `<div class="panel"><div class="pad"><h3>${esc(t('fin_low'))}</h3></div><div class="pad small">${low.map(p => `<span class="tag low">${esc(p.code ? p.code + ' · ' : '')}${esc(pName(p))}</span>`).join(' ')}</div></div>` : ''}
  <div class="panel pad row" style="gap:8px;flex-wrap:wrap"><b style="margin-right:auto">${esc(t('fin_export'))}</b>
    <button type="button" class="btn small" data-csv="sales">⬇ ${esc(t('tab_sale'))}</button><button type="button" class="btn small" data-csv="rentals">⬇ ${esc(t('tab_rent'))}</button><button type="button" class="btn small" data-csv="expenses">⬇ ${esc(t('fin_expenses'))}</button></div>`;
}
function cashHtml(today){
  const c = S.fin.cash, f = cashFlow(today);
  const rows = [['fin_opening', f.opening], ['fin_cash_sales', f.sales], ['fin_cash_rent', f.rentFees], ['fin_cash_late', f.late], ['fin_dep_in', f.depIn], ['fin_dep_out', -f.depOut], ['fin_cash_exp', -f.exp]];
  const tbl = `<dl class="specs">${rows.map(([k, v]) => `<dt>${esc(t(k))}</dt><dd class="num">${money(v)}</dd>`).join('')}<dt><b>${esc(t('fin_expected'))}</b></dt><dd class="num"><b>${money(f.expected)}</b></dd></dl>`;
  let body;
  if (!c) body = `<p class="small muted" style="margin:0">${esc(t('fin_cash_closed_hint'))}</p>
    <div class="row" style="gap:8px;flex-wrap:nowrap"><input id="fn-open-amt" type="number" min="0" step="0.01" inputmode="decimal" placeholder="${esc(t('fin_opening'))}"><button type="button" class="btn primary" id="fn-open">${esc(t('fin_open'))}</button></div>`;
  else if (!c.closed_at) body = `<div class="small muted">${esc(t('fin_opened'))} ${fmtTs(c.opened_at)} · ${esc(c.opened_by || '')}</div>${tbl}
    <div class="row" style="gap:8px;flex-wrap:nowrap"><input id="fn-count" type="number" min="0" step="0.01" inputmode="decimal" placeholder="${esc(t('fin_counted'))}"><button type="button" class="btn primary" id="fn-close">🔒 ${esc(t('h_close_day'))}</button></div>
    <input id="fn-cnote" placeholder="${esc(t('note'))}">`;
  else body = `<div class="small muted">${esc(t('fin_closed_at'))} ${fmtTs(c.closed_at)} · ${esc(c.closed_by || '')}</div>
    <dl class="specs"><dt>${esc(t('fin_expected'))}</dt><dd class="num">${money(c.expected)}</dd><dt>${esc(t('fin_counted'))}</dt><dd class="num">${money(c.counted)}</dd><dt><b>${esc(t('fin_diff'))}</b></dt><dd class="num"><b style="color:${+c.difference < 0 ? 'var(--danger)' : +c.difference > 0 ? 'var(--warn)' : 'var(--green)'}">${money(c.difference)}</b></dd></dl>
    ${c.note ? `<div class="small">${esc(c.note)}</div>` : ''}${isAdmin() ? `<button type="button" class="btn ghost small" id="fn-reopen">${esc(t('fin_reopen'))}</button>` : ''}`;
  return `<div class="panel pad stack"><div class="row between"><h3 style="margin:0">💵 ${esc(t('fin_cash'))} · <span class="num">${today}</span></h3><span class="tag ${c && !c.closed_at ? '' : 'out'}">${esc(t(!c ? 'fin_not_open' : c.closed_at ? 'fin_closed' : 'fin_is_open'))}</span></div>${body}
    <button type="button" class="btn" data-dayrep="">📤 ${esc(t('day_title'))}</button></div>`;
}
function expHtml(inR){
  const list = S.fin.expenses.filter(inR);
  const byCat = {}; list.forEach(x => { if (gel(x)) byCat[x.category] = (byCat[x.category] || 0) + (+x.amount || 0); });
  return `<div class="panel pad stack"><h3 style="margin:0">${esc(t('fin_add_exp'))}</h3>
    <div class="formgrid"><label class="f">${esc(t('col_amount'))}<input id="fe-amt" type="number" min="0.01" step="0.01" inputmode="decimal"></label>
      <label class="f">${esc(t('fin_cat'))}<select id="fe-cat">${EXP_CATS.map(k => `<option value="${k}">${esc(t('ec_' + k))}</option>`).join('')}</select></label>
      <label class="f">${esc(t('payment'))}<select id="fe-pay">${['cash','card','transfer'].map(k => `<option value="${k}">${esc(tPay(k))}</option>`).join('')}</select></label>
      <label class="f">${esc(t('note'))}<input id="fe-note" maxlength="300"></label></div>
    <button type="button" class="btn primary" id="fe-save">${esc(t('save'))}</button></div>
  <div class="panel"><div class="pad row between"><h3 style="margin:0">${esc(t('fin_expenses'))}</h3><span class="small muted">${Object.entries(byCat).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${esc(t('ec_' + k))} <b class="num">${money(v)}</b>`).join(' · ')}</span></div>
  ${list.length ? `<div class="tw"><table><thead><tr><th>${esc(t('col_time'))}</th><th>${esc(t('fin_cat'))}</th><th>${esc(t('note'))}</th><th>${esc(t('payment'))}</th><th>${esc(t('seller'))}</th><th class="r">${esc(t('col_amount'))}</th><th></th></tr></thead><tbody>${list.map(x => `<tr data-id="${x.id}"><td class="num">${fmtTs(x.created_at)}</td><td>${esc(t('ec_' + x.category))}</td><td>${esc(x.note || '')}</td><td>${esc(tPay(x.payment))}</td><td>${esc(x.seller || '')}</td><td class="r num"><b>${money(x.amount, x.currency)}</b></td><td>${isAdmin() ? `<button type="button" class="btn ghost small danger" data-del-exp="${x.id}">${esc(t('remove'))}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty small">${esc(t('no_records'))}</div>`}</div>`;
}
function movesHtml(){
  const m = S.fin.moves || [];
  return `<div class="panel"><div class="pad"><h3 style="margin:0">${esc(t('fin_moves'))}</h3></div>${m.length ? `<div class="tw"><table><thead><tr><th>${esc(t('col_time'))}</th><th>${esc(t('sp_item'))}</th><th class="r">±</th><th class="r">${esc(t('in_stock_label'))}</th><th>${esc(t('sr_reason'))}</th><th></th></tr></thead><tbody>${m.map(x => `<tr><td class="num">${fmtTs(x.at)}</td><td>${esc(x.product || '')}</td><td class="r num" style="color:${x.delta < 0 ? 'var(--danger)' : 'var(--green)'}">${x.delta > 0 ? '+' : ''}${x.delta}</td><td class="r num">${x.qty_after ?? ''}</td><td>${esc(t('sr_' + x.reason) || x.reason)}${x.note ? ` <span class="small muted">${esc(x.note)}</span>` : ''}</td><td class="small muted">${esc(S.staff.find(y => y.email === x.email)?.name || String(x.email || '').replace(/@.*/, ''))}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty small">${esc(t('no_records'))}</div>`}</div>`;
}
/* CSV — UTF-8 with BOM so Excel shows Georgian correctly */
function csvOf(rows){ const cell = v => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }; return '\ufeff' + rows.map(r => r.map(cell).join(',')).join('\r\n'); }
function exportCsv(kind){
  const [a, b] = finRange(), inR = x => x.day >= a && x.day <= b; let rows;
  if (kind === 'sales') rows = [['date','time','items','qty','list_total','discount','total','currency','payment','seller','customer','phone','note','id'],
    ...S.sales.filter(inR).map(s => [s.day, fmtTs(s.created_at), (s.lines || []).map(l => l.name + (l.qty > 1 ? ' x' + l.qty : '')).join(' | '), (s.lines || []).reduce((n, l) => n + (+l.qty || 0), 0), s.list_total, s.extra_discount, s.total, s.currency || 'GEL', s.payment, s.seller, s.customer_name, s.phone, s.note, s.id])];
  else if (kind === 'rentals') rows = [['date','start','return_by','returned_at','status','type','unit','customer','phone','price','late_fee','payment','deposit','deposit_currency','deposit_payment','seller','id'],
    ...S.rentals.filter(inR).map(r => [r.day, fmtTs(r.created_at), r.ends_at ? fmtTs(r.ends_at) : '', r.returned_at ? fmtTs(r.returned_at) : '', r.status, r.type, r.unit_label, r.customer_name, r.phone, r.price, r.late_fee, r.payment, r.deposit, r.deposit_currency, r.deposit_payment, r.seller, r.id])];
  else rows = [['date','time','category','amount','currency','payment','note','seller','created_by','id'],
    ...S.fin.expenses.filter(inR).map(x => [x.day, fmtTs(x.created_at), x.category, x.amount, x.currency, x.payment, x.note, x.seller, x.created_by, x.id])];
  downloadBlob(new Blob([csvOf(rows)], { type:'text/csv;charset=utf-8' }), `easyride-${kind}-${a === '0000' ? 'all' : a}_${b === '9999' ? 'all' : b}.csv`);
}
$('fn-from').onchange = $('fn-to').onchange = () => renderFin();
$('fn-refresh').onclick = async () => { await Promise.all([reload('sales', 'rentals', 'products'), loadFin()]); renderFin(); };
const finClick = async e => {
  const cv = e.target.closest('[data-csv]'); if (cv) return exportCsv(cv.dataset.csv);
  const del = e.target.closest('[data-del-exp]');
  if (del) return arm(del, async () => { try { await q(sb.from('expenses').delete().eq('id', del.dataset.delExp)); toast(t('deleted')); await loadFin(); reFin(); } catch(err){ fail(err); } });
  const id = e.target.id, btn = e.target.closest('button'); if (!btn) return;
  try {
    if (id === 'fe-save') {
      const amt = r2($('fe-amt').value); if (!(amt > 0)) { toast(t('fin_need_amt')); return; }
      if ($('fe-cat').value === 'other' && !$('fe-note').value.trim()) { toast(t('sr_need_note')); return; }
      btn.disabled = true;
      await q(sb.from('expenses').insert({ amount:amt, category:$('fe-cat').value, payment:$('fe-pay').value, note:$('fe-note').value.trim(), seller:S.user?.name || '' }));
      toast(t('saved') + ' · ' + money(amt)); await loadFin(); reFin();
    } else if (id === 'fn-open') {
      const v = $('fn-open-amt').value; if (v === '' || +v < 0) { toast(t('fin_need_amt')); return; }
      btn.disabled = true; await q(sb.rpc('cash_open', { p_opening:r2(v), p_note:'' })); await loadFin(); reFin();
    } else if (id === 'fn-close') {
      const v = $('fn-count').value; if (v === '' || +v < 0) { toast(t('fin_need_amt')); return; }
      btn.disabled = true; await reload('sales', 'rentals'); await loadFin();
      await q(sb.rpc('cash_close', { p_counted:r2(v), p_expected:cashFlow(dayKey(new Date())).expected, p_note:$('fn-cnote').value.trim() }));
      await loadFin(); reFin(); toast(t('fin_closed') + ' · ' + t('fin_diff') + ': ' + money(+S.fin.cash?.difference || 0));
    } else if (id === 'fn-reopen') { await q(sb.rpc('cash_reopen')); await loadFin(); reFin(); }
  } catch(err){ fail(err); btn.disabled = false; }
};
const reFin = () => S.tab === 'cash' ? paintHomeCash() : renderFin();
$('fn-body').onclick = finClick;
/* stock change with a reason: received, write-off, damaged, correction … (kept in stock_moves) */
function openStockAdjust(p, sign){
  openOv(`<h2>${esc(pName(p))}</h2><div class="small muted">${esc(t('in_stock_label'))}: <b class="num">${+p.qty || 0}</b></div>
    <div class="formgrid"><label class="f">${esc(t('sr_delta'))}<input id="sa-n" type="number" step="1" inputmode="numeric" value="${sign > 0 ? 1 : -1}"></label>
    <label class="f">${esc(t('sr_reason'))}<select id="sa-r">${STOCK_REASONS.map(k => `<option value="${k}" ${k === (sign > 0 ? 'received' : 'writeoff') ? 'selected' : ''}>${esc(t('sr_' + k))}</option>`).join('')}</select></label>
    <label class="f" style="grid-column:1/-1">${esc(t('note'))}<input id="sa-note" maxlength="300"></label></div>
    <div class="row" style="gap:8px"><button type="button" class="btn primary" id="sa-ok" style="flex:1">${esc(t('save'))}</button><button type="button" class="btn" data-close>${esc(t('cancel'))}</button></div>`);
  $('sa-ok').onclick = async () => {
    const d = Math.trunc(+$('sa-n').value || 0), reason = $('sa-r').value, note = $('sa-note').value.trim();
    if (!d) { toast(t('sr_need_delta')); return; }
    if ((+p.qty || 0) + d < 0) { toast(t('sr_negative')); return; }
    if (reason === 'other' && !note) { toast(t('sr_need_note')); return; }
    $('sa-ok').disabled = true;
    try {
      try { await q(sb.rpc('adjust_stock', { p_id:p.id, p_delta:d, p_reason:reason, p_note:note })); }
      catch(e){ if (!missingFn(e)) throw e; await q(sb.from('products').update({ qty:(+p.qty || 0) + d, updated_at:new Date().toISOString() }).eq('id', p.id)); }
      closeOv(); toast(t('saved')); S.fin.ready = null; await reload('products');
    } catch(err){ fail(err); $('sa-ok').disabled = false; }
  };
}

/* ================= morning: yesterday's end-of-day report = a new work day starts ================= */
S.dayRep = { ready:null, last:null, list:[] };
async function loadDayReps(){
  try { S.dayRep.list = await q(sb.from('day_reports').select('*').order('day', { ascending:false }).limit(40)) || []; S.dayRep.last = S.dayRep.list[0] || null; S.dayRep.ready = true; }
  catch(e){ S.dayRep.ready = false; if (!missingFn(e)) console.error(e); }
}
const dayShift = (k, n) => { const [y, m, d] = k.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n)); };
const ddmm = k => k.split('-').reverse().join('.');
const repOf = k => S.dayRep.list.find(r => r.day === k);
/* every number of one day, worked out from the records (deposits apart from sales) */
function dayFigures(day){
  const items = [], add = (pay, amount, name) => { if (+amount) items.push({ pay: pay || 'cash', amount:r2(amount), name }); };
  S.sales.filter(s => s.day === day && gel(s)).forEach(s => add(s.payment, s.total, (s.lines || []).map(l => l.name + (l.qty > 1 ? ' ×' + l.qty : '')).join(', ')));
  S.rentals.filter(r => r.day === day && r.status !== 'cancelled').forEach(r => add(r.payment, r.price, `${t('tab_rent')} · ${r.unit_label || tType(r.type)}`));
  S.rentals.filter(r => +r.late_fee && r.returned_at && dayKey(new Date(r.returned_at)) === day).forEach(r => add(r.late_payment, r.late_fee, `${t('late_fee')} · ${r.unit_label || ''}`));
  const sum = p => r2(items.filter(i => p(i.pay)).reduce((a, i) => a + i.amount, 0));
  const cash = sum(p => p === 'cash'), card = sum(p => p === 'card'), transfer = sum(p => p === 'transfer'), total = sum(() => true);
  // deposits per currency: held at the start, received, returned, held at the end
  const back = r => r.returned_at || r.cancelled_at, bd = r => back(r) ? dayKey(new Date(back(r))) : null;
  const dep = { start:{}, in:{}, out:{}, end:{} }, cur = r => r.deposit_currency || 'GEL';
  S.rentals.filter(r => +r.deposit).forEach(r => {
    const c = cur(r), v = +r.deposit, open = r.status === 'active', b = bd(r);
    if (r.day < day && (open || (b && b >= day))) dep.start[c] = (dep.start[c] || 0) + v;
    if (r.day === day) dep.in[c] = (dep.in[c] || 0) + v;
    if (!open && b === day) dep.out[c] = (dep.out[c] || 0) + v;
    if (r.day <= day && (open || (b && b > day))) dep.end[c] = (dep.end[c] || 0) + v;
  });
  const exp = (S.fin.expenses || []).filter(x => x.day === day && gel(x) && isCash(x.payment)).map(x => ({ amount:+x.amount, name:t('ec_' + x.category) + (x.note ? ' · ' + x.note : '') }));
  return { items, cash, card, transfer, total, dep, exp, expCash:r2(exp.reduce((a, x) => a + x.amount, 0)) };
}
const depStr = acc => { const ks = Object.keys(acc).filter(k => acc[k]); return ks.length ? ks.map(k => `${r2(acc[k]).toLocaleString('en-US')} ${k}`).join(' / ') : '0 GEL'; };
const gelStr = n => `${r2(n).toLocaleString('en-US')} GEL`;
function dayLangs(){ try { const v = JSON.parse(ls.get('er-day-langs') || 'null'); if (Array.isArray(v) && v.length) return v; } catch(e){} return ['ka', 'en', 'ja']; }
/* the morning banner on the sale screen: yesterday's report not sent yet → one big button */
function renderDayBanner(){
  const el = $('day-banner'); if (!el) return;
  if (!S.user || S.dayRep.ready !== true) { el.hidden = true; return; }
  const y = lastDay(), sent = repOf(y);
  if (sent) { el.hidden = false; el.className = 'daybar ok';
    el.innerHTML = `<span>✅ ${esc(t('day_started'))} · ${fmtTs(sent.sent_at)}${sent.seller ? ' · ' + esc(sent.seller) : ''}</span><button type="button" class="btn ghost small" data-dayrep="${y}">${esc(t('day_resend'))}</button>`; return; }
  el.hidden = false; el.className = 'daybar';
  el.innerHTML = `<span>☀️ ${esc(t('day_not_sent').replace('{d}', ddmm(y)))}</span><button type="button" class="btn primary" data-dayrep="${y}">📤 ${esc(t('day_send_btn'))}</button>`;
}
document.addEventListener('click', e => { const b = e.target.closest('[data-dayrep]'); if (b) openDayReport(b.dataset.dayrep); });
async function openDayReport(day){
  day = day || lastDay();
  openOv(`<div class="empty">${esc(t('loading'))}</div>`, 'wide');
  await Promise.all([reload('sales', 'rentals'), loadDayReps(), S.fin.ready ? null : loadFin()]);
  if (S.dayRep.ready !== true) { openOv(`<div class="row between"><h2>${esc(t('day_title'))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div><p>${esc(t('fin_need_db'))}</p>`); return; }
  // the report of the day before gives the opening cash, the working register and the running card total
  const prev = S.dayRep.list.find(r => r.day < day), mine = repOf(day), pd = prev?.data || {}, md = mine?.data || {};
  let langs = dayLangs();
  const f0 = dayFigures(day);
  const val = (k, d) => md[k] ?? d;
  openOv(`<div class="row between"><h2>📤 ${esc(t('day_title'))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div>
    ${mine ? `<div class="okbox small">✅ ${esc(t('day_already'))} ${fmtTs(mine.sent_at)}${mine.seller ? ' · ' + esc(mine.seller) : ''}</div>` : ''}
    <div class="formgrid">
      <label class="f">${esc(t('day_date'))}<input id="dr-day" type="date" value="${day}" max="${dayKey(new Date())}"></label>
      <label class="f">${esc(t('fin_opening'))}<input id="dr-open" type="number" step="0.01" inputmode="decimal" value="${val('opening_cash', pd.closing_cash ?? 0)}"></label>
      <label class="f">${esc(t('day_bank'))}<input id="dr-bank" type="number" step="0.01" min="0" inputmode="decimal" value="${val('bank_deposit', 0)}"></label>
      <label class="f">${esc(t('day_working'))}<input id="dr-work" type="number" step="0.01" min="0" inputmode="decimal" value="${val('working_cash', pd.working_cash ?? 91)}"></label>
      <label class="f">${esc(t('day_card_total'))}<input id="dr-cardt" type="number" step="0.01" min="0" inputmode="decimal" value="${val('card_total', r2((+pd.card_total || 0) + f0.card))}"></label>
      <label class="f">${esc(t('note'))}<input id="dr-note" maxlength="500" value="${esc(md.note || '')}"></label>
    </div>
    ${prev ? `<div class="small muted">${esc(t('day_prev'))}: ${ddmm(prev.day)} · ${esc(t('fin_opening'))} → ${gelStr(pd.closing_cash || 0)}</div>` : ''}
    <div class="langpick" id="dr-langs">${window.ER_REPORT.langs.map(k => `<button type="button" class="chip" data-l="${k}"></button>`).join('')}</div>
    <textarea id="dr-text" class="reptext" rows="16" spellcheck="false"></textarea>
    <div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn primary big" id="dr-send" style="flex:2;width:auto">📤 ${esc(t('day_send_start'))}</button>
      <button type="button" class="btn big" id="dr-copy" style="flex:1;width:auto">${esc(t('copy'))}</button></div>
    <div class="small muted">${esc(t('day_hint'))}</div>`, 'wide');
  let edited = false;
  const figures = () => {
    const d = $('dr-day').value || day, f = dayFigures(d), num = id => r2($(id).value);
    const closing = r2(num('dr-open') + f.cash - num('dr-bank') - f.expCash);
    return { d, f, data:{ opening_cash:num('dr-open'), closing_cash:closing, bank_deposit:num('dr-bank'), working_cash:num('dr-work'), card_total:num('dr-cardt'),
      cash:f.cash, card:f.card, transfer:f.transfer, total:f.total, exp_cash:f.expCash, dep_end:f.dep.end, note:$('dr-note').value.trim() } };
  };
  const paint = () => {
    $('dr-langs').querySelectorAll('[data-l]').forEach(b => { b.textContent = window.ER_REPORT.FLAG[b.dataset.l]; b.setAttribute('aria-pressed', langs.includes(b.dataset.l)); });
    if (edited) return;
    const { d, f, data } = figures();
    $('dr-text').value = window.ER_REPORT.day({ date:ddmm(d), items:f.items, cash:f.cash, card:f.card, transfer:f.transfer, total:f.total,
      depStart:depStr(f.dep.start), depIn:depStr(f.dep.in), depOut:depStr(f.dep.out), depEnd:depStr(f.dep.end), exp:f.exp, expCash:f.expCash,
      opening:data.opening_cash, bank:data.bank_deposit, closing:data.closing_cash, working:data.working_cash, cardTotal:data.card_total, note:data.note, by:S.user?.name || '', money:gelStr },
      window.ER_REPORT.langs.filter(l => langs.includes(l)));
  };
  paint();
  $('dr-day').onchange = () => { $('ov').hidden = true; openDayReport($('dr-day').value || day); };
  ['dr-open','dr-bank','dr-work','dr-cardt','dr-note'].forEach(id => $(id).oninput = paint);
  $('dr-text').oninput = () => { edited = true; };
  $('dr-langs').onclick = e => { const b = e.target.closest('[data-l]'); if (!b) return; const l = b.dataset.l;
    langs = langs.includes(l) ? (langs.length > 1 ? langs.filter(x => x !== l) : langs) : [...langs, l]; ls.set('er-day-langs', JSON.stringify(langs)); edited = false; paint(); };
  $('dr-copy').onclick = async () => { const txt = $('dr-text').value; try { await navigator.clipboard.writeText(txt); } catch(e){ $('dr-text').select(); document.execCommand('copy'); } toast(t('copied')); };
  $('dr-send').onclick = async () => {
    const { d, data } = figures(), txt = $('dr-text').value, btn = $('dr-send'); btn.disabled = true;
    // saved first (the phone's share sheet would take the page to the background)
    try { await q(sb.rpc('start_day', { p_day:d, p_data:data, p_text:txt, p_seller:S.user?.name || '' })); }
    catch(err){ fail(err); btn.disabled = false; return; }
    S.fin.ready = null; await loadDayReps(); renderDayBanner();
    toast(t('day_saved')); S.onDayStarted?.();
    let shared = false;
    if (navigator.share) { try { await navigator.share({ text:txt }); shared = true; } catch(e){ if (e?.name === 'AbortError') shared = true; } }
    if (!shared) { const a = document.createElement('a'); a.href = 'https://wa.me/?text=' + encodeURIComponent(txt); a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }
    closeOv(); render();
  };
}


/* ================= home: the sale or the rental form on the left, today's sales / rentals on the right ================= */
const HOME_PARTS = [['s-kind', 'h-sale-pick'], ['s-pick', 'h-sale-pick'], ['receipt', 'h-sale-cart'], ['r-form', 'h-rent']];
const HOME_BACK = {};
// the existing sale picker, cart and rental form are moved onto the home page (their buttons keep working) and back again
function placeHome(on){
  document.documentElement.classList.toggle('athome', on);
  for (const [id, slot] of HOME_PARTS) {
    const el = $(id); if (!el) continue;
    if (!HOME_BACK[id]) HOME_BACK[id] = { parent:el.parentNode, next:el.nextSibling };
    if (on) { if (el.parentNode !== $(slot)) $(slot).appendChild(el); }
    else if (el.parentNode !== HOME_BACK[id].parent) HOME_BACK[id].parent.insertBefore(el, HOME_BACK[id].next && HOME_BACK[id].next.parentNode === HOME_BACK[id].parent ? HOME_BACK[id].next : null);
  }
}
const hMode = () => S.hmode || '';
const go = tab => { S.tab = tab; closeSheet(); buildTabs(); render(); window.scrollTo(0, 0); };
function renderHome(){
  const m = hMode();
  $('h-mode').innerHTML = [['sale', 'tab_sale', '🛒'], ['rent', 'tab_rent', '🛵']].map(([k, l, ic]) => `<button type="button" role="tab" data-m="${k}" aria-selected="${m === k}">${ic} ${esc(t(l))}</button>`).join('');
  $('h-sale').dataset.off = m !== 'sale'; $('h-rent').dataset.off = m !== 'rent';   // one form at a time, opened by its button
  renderSale(); renderRent();
  $('h-go-settings').hidden = !isAdmin();
}
/* cash desk: vehicles out now, today's rentals and sales (with their buttons), the register card to close the day */
function renderCash(){
  const today = dayKey(new Date()), adm = isAdmin();
  const edit = `${adm ? `<button type="button" class="btn ghost small" data-act="redit" title="${esc(t('edit'))}" aria-label="${esc(t('edit'))}">✏️</button>` : ''}`;
  const act = S.rentals.filter(r => r.status === 'active').sort((a, b) => String(a.ends_at || '9').localeCompare(String(b.ends_at || '9')));
  const rents = [...act, ...S.rentals.filter(r => r.day === today && r.status === 'returned')];
  const todays = S.rentals.filter(r => r.day === today && r.status !== 'cancelled');
  $('h-rent-sum').textContent = todays.length ? money(todays.reduce((a, r) => a + rentSum(r), 0)) : '';
  $('h-rented').innerHTML = rents.length ? rents.map(r => { const p = S.products.find(x => x.id === r.product_id), ph = p?.photos?.[0], out = r.status === 'active';
    return `<div class="hcard ${out ? 'is-out' : 'is-back'}" data-id="${r.id}"><div class="hcard-ph">${ph ? `<img src="${esc(photoUrl(ph))}" alt="" loading="lazy">` : `<span>${esc(tType(r.type))}</span>`}<span class="rstat ${out ? 'out' : 'back'}">${esc(t(out ? 'h_out' : 'h_back'))}</span></div>
      <div class="hcard-b"><b>${esc(locData(r.unit_label) || tType(r.type))}</b><small>${esc(r.customer_name || '')}${r.phone ? ' · ' + esc(r.phone) : ''}</small><small>${fmtTs(r.created_at)}</small>${out ? dueBadge(r) : ''}<span class="num">${money(rentSum(r))}</span></div>
      <div class="hcard-a">${out ? `<button type="button" class="btn small" data-act="ret">${esc(t('returned_btn'))}</button>` : ''}${r.contract ? `<button type="button" class="btn ghost small" data-act="contract">📄</button>` : ''}<button type="button" class="btn ghost small" data-act="sendall">📎</button><button type="button" class="btn ghost small" data-act="rrep">📤</button>${edit}</div></div>`; }).join('')
    : `<div class="empty small">${esc(t('h_none_today'))}</div>`;
  const sales = S.sales.filter(x => x.day === today);
  $('h-sold-sum').textContent = sales.length ? moneyMulti(sales.reduce((acc, x) => addCur(acc, x.currency, x.total), {})) : '';
  $('h-sold').innerHTML = sales.length ? sales.map(x => `<div class="hrow" data-id="${x.id}"><span class="num muted">${fmtTs(x.created_at).slice(-5)}</span>
      <span class="hrow-n">${esc((x.lines || []).map(l => l.name + (l.qty > 1 ? ' ×' + l.qty : '')).join(', '))}<small>${esc(tPay(x.payment))}${x.seller ? ' · ' + esc(x.seller) : ''}${+x.extra_discount ? ' · −' + money(x.extra_discount, x.currency) : ''}</small></span>
      <b class="num">${money(x.total, x.currency)}</b><span class="row" style="gap:4px;flex-wrap:nowrap"><button type="button" class="btn ghost small" data-act="srep" title="${esc(t('report_btn'))}">📤</button>${adm ? `<button type="button" class="btn ghost small" data-act="sedit" title="${esc(t('edit'))}" aria-label="${esc(t('edit'))}">✏️</button>` : ''}</span></div>`).join('')
    : `<div class="empty small">${esc(t('h_none_today'))}</div>`;
  if (S.fin.ready) paintHomeCash(); else { $('h-cash').innerHTML = `<div class="panel pad small">${esc(t('loading'))}</div>`; loadFin().then(() => S.tab === 'cash' && paintHomeCash()); }
}
$('h-mode').onclick = e => { const b = e.target.closest('[data-m]'); if (!b) return; S.hmode = S.hmode === b.dataset.m ? '' : b.dataset.m; renderHome(); };
const homeClick = e => {
  const g = e.target.closest('[data-go]'); if (g) return go(g.dataset.go);
  const row = e.target.closest('[data-id]'), a = e.target.closest('[data-act]')?.dataset.act; if (!row || !a) return;
  if (row.closest('#h-sold')) { const x = S.sales.find(y => y.id === row.dataset.id); if (!x) return;
    if (a === 'srep') showReport('sale', saleRepFromRow(x)); else if (a === 'sedit' && isAdmin()) askPin(pin => editSale(x, pin)); return; }
  const r = S.rentals.find(y => y.id === row.dataset.id); if (!r) return;
  if (a === 'ret') openReturn(r);
  else if (a === 'contract') viewContract(r);
  else if (a === 'sendall') sendRentalFiles(r);
  else if (a === 'rrep') showReport('rental', rentalReportData(r), { rental:r });
  else if (a === 'redit') openRentalEdit(r.id);
};
$('v-home').addEventListener('click', homeClick);
$('v-cash').addEventListener('click', e => { if (!e.target.closest('#h-cash')) homeClick(e); });
/* closing the day: the register card (expected cash, counted cash, note) on the cash desk page */
function paintHomeCash(){
  const box = $('h-cash'); if (!box || S.tab !== 'cash') return;
  if (!S.fin.ready) { box.innerHTML = `<div class="panel pad small">${esc(t(S.fin.ready === false ? 'fin_need_db' : 'loading'))}</div>`; return; }
  $('fn-body').innerHTML = '';   // one copy of the register on the page (the same ids)
  box.innerHTML = cashHtml(dayKey(new Date()));
}
$('h-cash').onclick = finClick;
document.querySelectorAll('.brand').forEach(b => { if (b.closest('#app')) { b.style.cursor = 'pointer'; b.dataset.iTitle = 'tab_home'; b.title = t('tab_home'); b.onclick = () => go('home'); } });
/* closing the shift: counted cash against what should be in the drawer */
async function closeShift(){
  await Promise.all([reload('sales', 'rentals'), loadFin()]);
  if (!S.fin.ready) { toast(t('fin_need_db')); return; }
  const c = S.fin.cash, today = dayKey(new Date());
  if (!c) { toast(t('fin_not_open')); return; }
  if (c.closed_at) { toast(t('fin_closed') + ' · ' + fmtTs(c.closed_at)); return; }
  const f = cashFlow(today);
  openOv(`<div class="row between"><h2>${esc(t('h_close_shift'))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div>
    <dl class="specs">${[['fin_opening', f.opening], ['fin_cash_sales', f.sales], ['fin_cash_rent', f.rentFees], ['fin_cash_late', f.late], ['fin_dep_in', f.depIn], ['fin_dep_out', -f.depOut], ['fin_cash_exp', -f.exp]].map(([k, v]) => `<dt>${esc(t(k))}</dt><dd class="num">${money(v)}</dd>`).join('')}
      <dt><b>${esc(t('fin_expected'))}</b></dt><dd class="num"><b>${money(f.expected)}</b></dd></dl>
    <label class="f">${esc(t('fin_counted'))}<input id="cs-count" type="number" min="0" step="0.01" inputmode="decimal"></label>
    <label class="f">${esc(t('note'))}<input id="cs-note" maxlength="300"></label>
    <button type="button" class="btn primary big" id="cs-ok">${esc(t('fin_close'))}</button>`);
  $('cs-ok').onclick = async () => {
    const v = $('cs-count').value; if (v === '' || +v < 0) { toast(t('fin_need_amt')); return; }
    $('cs-ok').disabled = true;
    try { const r = await q(sb.rpc('cash_close', { p_counted:r2(v), p_expected:f.expected, p_note:$('cs-note').value.trim() })); closeOv(); toast(`${t('fin_closed')} · ${t('fin_diff')}: ${money(r?.difference ?? (r2(v) - f.expected))}`); await loadFin(); render(); }
    catch(err){ fail(err); $('cs-ok').disabled = false; }
  };
}
/* after login: one button opens the register; yesterday's report goes to WhatsApp on the way */
/* the last working day before today: the last one that was closed, else the last one opened, else yesterday */
async function loadLastDay(){
  const today = dayKey(new Date());
  try { const rows = await q(sb.from('cash_sessions').select('day,closed_at,counted,expected').lt('day', today).order('day', { ascending:false }).limit(10)) || [];
    S.lastCash = rows.find(r => r.closed_at) || rows[0] || null; }
  catch(e){ S.lastCash = null; if (!missingFn(e)) console.error(e); }
  S.lastDay = S.lastCash?.day || dayShift(today, -1);
}
const lastDay = () => S.lastDay || dayShift(dayKey(new Date()), -1);
async function openGateCheck(){
  try { await Promise.all([loadFin(), loadDayReps(), loadLastDay()]); renderDayBanner(); } catch(e){ console.error(e); }
  if (!S.user || !S.fin.ready || S.dayRep.ready !== true || S.fin.cash) { $('opengate').hidden = true; return; }
  $('og-hi').textContent = t('og_hi').replace('{n}', S.user.name || '');
  $('og-skip').hidden = !isAdmin();
  $('opengate').hidden = false;
}
$('og-skip').onclick = () => { $('opengate').hidden = true; };
$('og-open').onclick = async () => {
  const y = lastDay(), b = $('og-open');
  if (repOf(y)) {           // that day's report already went out: the register just opens with the cash counted at closing
    b.disabled = true;
    const open = S.lastCash?.day === y && S.lastCash.counted != null ? +S.lastCash.counted : +(repOf(y).data?.closing_cash || 0);
    try { await q(sb.rpc('cash_open', { p_opening:r2(open), p_note:'' })); } catch(e){ if (!/already_open/.test(e?.message || '')) { fail(e); b.disabled = false; return; } }
    b.disabled = false; S.fin.ready = null; await loadFin(); $('opengate').hidden = true; toast(t('og_opened')); render(); return;
  }
  S.onDayStarted = async () => { S.onDayStarted = null; await loadFin(); $('opengate').hidden = true; render(); };
  openDayReport(y);
};


const saleRepFromRow = s => saleReportData({ lines:s.lines || [], total:s.total, extra:s.extra_discount, payment:s.payment, seller:s.seller, cust:S.customers.find(c => c.id === s.customer_id) || (s.customer_name ? { name:s.customer_name } : null), note:s.note, date:new Date(s.created_at), currency:s.currency || 'GEL' });
/* the signed agreement (PDF), the customer's ID photo and the hand-over video of a rental, as files to send */
async function rentalFiles(r){
  const files = [], who = String(r.customer_name || 'customer').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_');
  if (r.contract?.raw) {
    try {
      const lg = r.contract.lang || LANG;
      const pdf = r.signature ? await q(sb.storage.from('id-photos').download(r.signature.replace(/\.png$/, '.pdf'))).catch(() => contractPdf(r, lg)) : await contractPdf(r, lg);
      files.push(new File([pdf], contractFileName(r), { type:'application/pdf' }));
    } catch(e){ console.error(e); }
  }
  const c = S.customers.find(x => x.id === r.customer_id);
  if (c?.photo) { try { const b = await q(sb.storage.from('id-photos').download(c.photo)); files.push(new File([b], `ID_${who}.jpg`, { type:b.type || 'image/jpeg' })); } catch(e){ console.error(e); } }
  if (r.video) { try { const b = await q(sb.storage.from('rental-videos').download(r.video)), ext = String(r.video).split('.').pop() || 'mp4'; files.push(new File([b], `Video_${who}.${ext}`, { type:b.type || 'video/' + ext })); } catch(e){ console.error(e); } }
  return files;
}
/* the customer's phone as WhatsApp wants it: digits with the country code (Georgian 5xx xx xx xx gets 995) */
const waNum = ph => { let d = String(ph || '').replace(/[^\d+]/g, ''); if (d.startsWith('+')) return d.slice(1).replace(/\D/g, ''); d = d.replace(/\D/g, '').replace(/^00/, ''); if (/^5\d{8}$/.test(d)) d = '995' + d; else if (/^0\d{9}$/.test(d)) d = '995' + d.slice(1); return d.length >= 8 ? d : ''; };
const LINK_TTL = 7 * 864e2;   // links in the message work for 7 days
/* a wa.me link to the customer's number with the signed agreement (PDF) and the hand-over video as links */
async function custWaUrl(r){
  const num = waNum(r.phone || S.customers.find(c => c.id === r.customer_id)?.phone); if (!num) throw new Error('no_phone');
  const lg = r.contract?.lang || LANG, lines = [tL('wa_c_hi', lg).replace('{n}', r.customer_name || '')];
  if (r.signature) {
    const pdfPath = r.signature.replace(/\.png$/, '.pdf');
    let s = await sb.storage.from('id-photos').createSignedUrl(pdfPath, LINK_TTL);
    if (s.error || !s.data?.signedUrl) { await uploadBlob('id-photos', pdfPath, await contractPdf(r, lg), 'application/pdf'); s = await sb.storage.from('id-photos').createSignedUrl(pdfPath, LINK_TTL); }
    if (s.data?.signedUrl) lines.push('📄 ' + tL('wa_c_contract', lg) + ':\n' + s.data.signedUrl);
  }
  if (r.video) { const v = await sb.storage.from('rental-videos').createSignedUrl(r.video, LINK_TTL); if (v.data?.signedUrl) lines.push('🎬 ' + tL('wa_c_video', lg) + ':\n' + v.data.signedUrl); }
  const d = dueAt(r); if (d && !isNaN(d)) lines.push('⏰ ' + tL('return_by', lg) + ': ' + fmtTs(d));
  lines.push(tL('wa_c_bye', lg));
  return 'https://wa.me/' + num + '?text=' + encodeURIComponent(lines.join('\n\n'));
}
/* a button that becomes ready once the links are made (so the tap opens WhatsApp straight away) */
function armCustWa(id, r){
  const b = $(id); if (!b) return;
  const num = waNum(r.phone || S.customers.find(c => c.id === r.customer_id)?.phone);
  if (!num) { b.classList.add('off'); b.removeAttribute('href'); b.onclick = e => { e.preventDefault(); toast(t('wa_c_nophone')); }; return; }
  b.querySelector('small').textContent = '+' + num;
  b.onclick = e => { if (!b.href) { e.preventDefault(); toast(t('sf_preparing')); } };
  custWaUrl(r).then(u => { if ($(id) === b) { b.href = u; b.classList.remove('wait'); } }).catch(e => { console.error(e); b.classList.add('off'); b.onclick = ev => { ev.preventDefault(); toast(t('wa_c_fail')); }; });
}
const custWaBtn = (id, big) => `<a class="btn ${big ? 'primary big' : ''} wabtn wait" id="${id}" target="_blank" rel="noopener">💬 ${esc(t('wa_c_btn'))} <small></small></a>`;
const fileKb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
/* files are fetched first; the button then hands them to the phone's share sheet (WhatsApp …) in one tap */
function sendRentalFiles(r){
  openOv(`<div class="row between"><h2>📎 ${esc(t('send_files_title'))}</h2><button type="button" class="btn" data-close>${esc(t('close'))}</button></div>
    <div class="small muted">${esc(r.customer_name || '')} · ${esc(locData(r.unit_label) || tType(r.type))} · ${fmtTs(r.created_at)}</div>
    ${custWaBtn('sf-wa', true)}
    <div id="sf-list" class="sflist"><div class="muted">${esc(t('sf_preparing'))}</div></div>
    <button type="button" class="btn big" id="sf-send" disabled>📤 ${esc(t('sf_send'))}</button>
    <button type="button" class="btn" id="sf-dl" disabled>⬇️ ${esc(t('sf_download'))}</button>`);
  let files = []; armCustWa('sf-wa', r);
  rentalFiles(r).then(f => {
    files = f; if (!$('sf-list')) return;
    const icon = x => x.type === 'application/pdf' ? '📄' : x.type.startsWith('video') ? '🎬' : '🖼';
    $('sf-list').innerHTML = f.length ? f.map(x => `<div class="sfrow"><span>${icon(x)}</span><span class="hrow-n">${esc(x.name)}</span><span class="num muted">${fileKb(x.size)}</span></div>`).join('') : `<div class="muted">${esc(t('sf_none'))}</div>`;
    $('sf-send').disabled = $('sf-dl').disabled = !f.length;
  });
  $('sf-dl').onclick = () => { files.forEach((x, i) => setTimeout(() => downloadBlob(x, x.name), i * 400)); };
  $('sf-send').onclick = async () => {
    if (navigator.canShare?.({ files })) { try { await navigator.share({ files, title:`Easyride · ${r.customer_name || ''}` }); } catch(e){ if (e?.name !== 'AbortError') { console.error(e); toast(t('sf_share_fail')); } } }
    else { $('sf-dl').click(); toast(t('sf_downloaded')); }
  };
}

/* ================= render ================= */
function render(){ if (!S.user) return; ({ sale:renderSale, stock:renderStock, rent:renderRent, customers:renderCustomers, report:renderReport, fin:renderFin, settings:renderSettings, home:renderHome, cash:renderCash })[S.tab](); }
function renderAll(){
  applyI18n(); buildTabs();
  $('who-name').textContent = S.user?.name || '';
  const rl = S.user ? t(roleKey(S.user.role)) : '';
  $('who-role').innerHTML = !S.user ? '' : roleIcon(S.user.role);
  $('who-role').title = rl; $('who-role').setAttribute('aria-label', rl); $('who-role').setAttribute('role', 'img');
  $('who-role').className = S.user ? roleCls(S.user.role) : 'role';
  // creating / editing staff accounts stays with the owner (admin)
  const sf = $('sf-add')?.closest('.panel'); if (sf) sf.querySelectorAll('#sf-add, .formgrid').forEach(el => el.hidden = !isOwner());
  ['c-cust','r-cust'].forEach(id => mountPicker(id));
  render();
}

boot();
})();
