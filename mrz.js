/* Easyride POS — reads the machine-readable zone (MRZ) of passports (TD3) and ID cards (TD1/TD2)
   from OCR text, fixes typical OCR mix-ups field by field and checks the check digits. */
(function (root) {
  'use strict';
  const W = [7, 3, 1];
  const val = c => c === '<' ? 0 : /\d/.test(c) ? +c : c.charCodeAt(0) - 55;
  const check = s => String([...s].reduce((a, c, i) => a + val(c) * W[i % 3], 0) % 10);
  const TO_NUM = { O:'0', Q:'0', D:'0', U:'0', I:'1', L:'1', T:'1', Z:'2', S:'5', G:'6', B:'8', A:'4' };
  const TO_ALPHA = { '0':'O', '1':'I', '2':'Z', '5':'S', '6':'G', '8':'B', '4':'A' };
  const num = s => [...s].map(c => TO_NUM[c] || c).join('');
  const alpha = s => [...s].map(c => TO_ALPHA[c] || c).join('');
  const clean = s => s.toUpperCase().replace(/[«‹]/g, '<').replace(/\s+/g, '').replace(/[^A-Z0-9<]/g, '');

  function date(yymmdd, future) {
    if (!/^\d{6}$/.test(yymmdd)) return '';
    let y = +yymmdd.slice(0, 2); const m = yymmdd.slice(2, 4), d = yymmdd.slice(4, 6);
    if (+m < 1 || +m > 12 || +d < 1 || +d > 31) return '';
    const now = new Date().getFullYear() % 100;
    y += future ? 2000 : (y > now ? 1900 : 2000);
    return `${y}-${m}-${d}`;
  }
  const names = s => {
    const [sur, giv = ''] = s.replace(/<+$/, '').split('<<');
    // the <<< filler is often read as L / K / C: drop such runs at the end and filler-only words
    const fix = x => alpha(x).replace(/<[<LKC]{3,}$/, '').split('<').filter(w => w && !/^[LKC]{3,}$/.test(w)).join(' ').trim();
    return { surname: fix(sur || ''), given: fix(giv) };
  };
  // fix a field so its check digit matches, trying OCR-confusion swaps when needed
  function fixed(raw, chk, numeric) {
    let f = numeric ? num(raw) : raw, c = num(chk);
    if (check(f) === c) return { v: f, ok: true };
    const alt = numeric ? raw : num(raw);
    if (check(alt) === c) return { v: alt, ok: true };
    return { v: f, ok: false };
  }

  function td3(l1, l2) {           // passports: 2 × 44
    l1 = l1.padEnd(44, '<').slice(0, 44); l2 = l2.padEnd(44, '<').slice(0, 44);
    const doc = fixed(l2.slice(0, 9), l2[9], false);
    const dob = fixed(l2.slice(13, 19), l2[19], true);
    const exp = fixed(l2.slice(21, 27), l2[27], true);
    const opt = num(l2.slice(28, 42)).replace(/<+$/, '');
    const n = names(l1.slice(5));
    return { format: 'TD3', kind: 'passport', country: alpha(l1.slice(2, 5)).replace(/</g, ''),
      number: doc.v.replace(/</g, ''), nationality: alpha(l2.slice(10, 13)).replace(/</g, ''),
      birth: date(dob.v), sex: { M: 'M', F: 'F' }[l2[20]] || '', expiry: date(exp.v, true),
      personal: /^\d{11}$/.test(opt) ? opt : '', ...n, checks: [doc.ok, dob.ok, exp.ok] };
  }
  function td1(l1, l2, l3) {       // ID cards: 3 × 30
    l1 = l1.padEnd(30, '<').slice(0, 30); l2 = l2.padEnd(30, '<').slice(0, 30);
    const doc = fixed(l1.slice(5, 14), l1[14], false);
    const dob = fixed(l2.slice(0, 6), l2[6], true);
    const exp = fixed(l2.slice(8, 14), l2[14], true);
    const opt = (num(l1.slice(15, 30)) + '|' + num(l2.slice(18, 29))).match(/\d{11}/);
    return { format: 'TD1', kind: 'id', country: alpha(l1.slice(2, 5)).replace(/</g, ''),
      number: doc.v.replace(/</g, ''), nationality: alpha(l2.slice(15, 18)).replace(/</g, ''),
      birth: date(dob.v), sex: { M: 'M', F: 'F' }[l2[7]] || '', expiry: date(exp.v, true),
      personal: opt ? opt[0] : '', ...names(l3 || ''), checks: [doc.ok, dob.ok, exp.ok] };
  }
  function td2(l1, l2) {           // older ID cards: 2 × 36
    l1 = l1.padEnd(36, '<').slice(0, 36); l2 = l2.padEnd(36, '<').slice(0, 36);
    const doc = fixed(l2.slice(0, 9), l2[9], false);
    const dob = fixed(l2.slice(13, 19), l2[19], true);
    const exp = fixed(l2.slice(21, 27), l2[27], true);
    const opt = num(l2.slice(28, 35)).replace(/<+$/, '');
    return { format: 'TD2', kind: 'id', country: alpha(l1.slice(2, 5)).replace(/</g, ''),
      number: doc.v.replace(/</g, ''), nationality: alpha(l2.slice(10, 13)).replace(/</g, ''),
      birth: date(dob.v), sex: { M: 'M', F: 'F' }[l2[20]] || '', expiry: date(exp.v, true),
      personal: /^\d{11}$/.test(opt) ? opt : '', ...names(l1.slice(5)), checks: [doc.ok, dob.ok, exp.ok] };
  }

  // pick the MRZ out of free OCR text
  function parse(text) {
    const lines = String(text || '').split(/\n+/).map(clean).filter(l => l.length >= 25 && (l.match(/</g) || []).length >= 2 || /^[A-Z0-9<]{28,}$/.test(l));
    let best = null;
    const consider = r => { if (!r) return; r.score = r.checks.filter(Boolean).length + (r.surname ? 1 : 0) + (r.birth ? 1 : 0); if (!best || r.score > best.score) best = r; };
    for (let i = 0; i < lines.length; i++) {
      const a = lines[i], b = lines[i + 1] || '', c = lines[i + 2] || '';
      if (/^P[A-Z<]/.test(a) && b.length >= 38) consider(td3(a, b));
      else if (/^[IAC][A-Z<]/.test(a) && a.length >= 28 && a.length <= 33 && b) consider(td1(a, b, c));
      else if (/^[IAC][A-Z<]/.test(a) && a.length >= 34 && a.length <= 38 && b) consider(td2(a, b));
      // the first line is often lost — a lone TD3 second line still gives number, birth date and sex
      else if (!best && a.length >= 40 && /^[A-Z0-9<]{9}\d[A-Z<]{3}\d{6}/.test(num(a.slice(0, 10)) + a.slice(10, 13) + num(a.slice(13, 19)))) consider(td3('P<<<', a));
    }
    if (best) best.valid = best.checks.every(Boolean);
    return best;
  }
  // an 11-digit Georgian personal number printed on the front of an ID card
  const personalFromText = text => (String(text || '').match(/(?<!\d)\d{11}(?!\d)/) || [''])[0];

  root.MRZ = { parse, personalFromText, check };
})(typeof window !== 'undefined' ? window : globalThis);
