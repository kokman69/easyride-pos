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
  const SWAP = { O:'0', '0':'O', Q:'0', D:'0', I:'1', '1':'I', L:'1', S:'5', '5':'S', B:'8', '8':'B', Z:'2', '2':'Z', G:'6', '6':'G' };
  function fixed(raw, chk, numeric) {
    let f = numeric ? num(raw) : raw, c = num(chk);
    if (check(f) === c) return { v: f, ok: true };
    const alt = numeric ? raw : num(raw);
    if (check(alt) === c) return { v: alt, ok: true };
    if (!numeric) {          // document numbers mix letters and digits: try the usual O/0, I/1, S/5 … swaps
      const pos = [...f].map((ch, i) => SWAP[ch] ? i : -1).filter(i => i >= 0).slice(0, 8);
      for (let m = 1; m < (1 << pos.length); m++) {
        const a = [...f]; pos.forEach((p, j) => { if (m & (1 << j)) a[p] = SWAP[a[p]]; });
        const v = a.join(''); if (check(v) === c) return { v, ok: true };
      }
    }
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

  /* front side of an ID card / data page of a passport, read as plain text (Latin part):
     labels like "Surname", "Given name(s)", dates DD.MM.YYYY, the 11-digit personal number */
  function frontFromText(text){
    const lines = String(text || '').split(/\n/).map(l => l.replace(/[|_~«»"'`]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const latinWord = l => (l.match(/\b[A-Z][A-Z-]{1,}(?:\s+[A-Z][A-Z-]{1,})*\b/) || [''])[0];
    const after = (re, stop) => {
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(re); if (!m) continue;
        const rest = lines[i].slice(m.index + m[0].length).replace(/^[\s:\/.,-]+/, '');
        const own = latinWord(rest.replace(/[a-z]+/g, ' ').trim());
        if (own && !stop.test(own)) return own;
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) { const w = latinWord(lines[j]); if (w && !stop.test(w) && w.length > 1) return w; }
      }
      return '';
    };
    const STOP = /^(SURNAME|NAME|NAMES|GIVEN|SEX|DATE|BIRTH|PERSONAL|NO|CARD|GEO|GEORGIA|NATIONALITY|PLACE|EXPIRY|ISSUE|AUTHORITY|PASSPORT|ID|M|F)$/;
    const surname = after(/\bsur\s*name\b/i, STOP);
    const given = after(/\b(given\s*names?|first\s*names?|(?<!sur\s?)name)\b/i, STOP);
    const dates = [...String(text || '').matchAll(/\b([0-3]\d)[.\/ -]([01]\d)[.\/ -]((?:19|20)\d\d)\b/g)]
      .map(m => `${m[3]}-${m[2]}-${m[1]}`).filter(d => !isNaN(new Date(d))).sort();
    const today = new Date().toISOString().slice(0, 10), adult = String(new Date().getFullYear() - 14);
    const birth = dates.find(d => d.slice(0, 4) <= adult) || '';
    const expiry = [...dates].reverse().find(d => d > today) || '';
    const personal = personalFromText(text);
    if (!surname && !given && !personal) return null;
    return { partial: !(surname || given), surname, given, personal, birth, expiry };
  }


  /* driving licence (EU / Georgian / Russian layout): numbered fields
     1. surname  2. given names  3. date (and place) of birth  4a. issued  4b. valid until  4c. authority  4d. personal number  5. licence number */
  function licenceFromText(text){
    const raw = String(text || '');
    const lines = raw.split(/\n/).map(l => l.replace(/[|_~«»"'`]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const field = re => { for (let i = 0; i < lines.length; i++) { const m = lines[i].match(re); if (m) return { rest: lines[i].slice(m.index + m[0].length).replace(/^[\s:.,)-]+/, ''), i }; } return null; };
    const isLic = /\b4\s?[abcd]\s?[.,)]/i.test(raw) || (/(^|\n)\s*1\s?[.,)]/.test(raw) && /(^|\n)\s*2\s?[.,)]/.test(raw) && /(^|\n)\s*5\s?[.,)]/.test(raw)) || /DRIV|LICEN|PERMIS|FÜHRER|ВОДИТЕЛЬСК|მართვის/i.test(raw);
    if (!isLic) return null;
    const latin = s => { const w = String(s || '').replace(/[^A-Za-z\s-]/g, ' ').match(/\b[A-Z][A-Z-]{1,}(?:\s+[A-Z][A-Z-]{1,})*\b/); return w ? w[0] : ''; };
    const STOP = /^(DRIVING|LICENCE|LICENSE|PERMIS|GEORGIA|GEO|RUS|RUSSIA|MIA|SSA|GIBDD)$/;
    const nameAt = re => { const f = field(re); if (!f) return '';
      let w = latin(f.rest); if (w && !STOP.test(w)) return w;
      for (let j = f.i + 1; j < Math.min(f.i + 2, lines.length); j++) { if (/^\s*\d\s?[.,)]/.test(lines[j])) break; w = latin(lines[j]); if (w && !STOP.test(w)) return w; }
      return ''; };
    const dateIn = s => { const m = String(s || '').match(/([0-3]\d)[.\/ -]([01]\d)[.\/ -]((?:19|20)\d\d)/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
    let surname = nameAt(/^\s*1\s?[.,)]/), given = nameAt(/^\s*2\s?[.,)]/);
    const birth = dateIn(field(/^\s*3\s?[.,)]/)?.rest);
    const f4b = field(/\b4\s?b\s?[.,)]?/i), expiry = dateIn(f4b?.rest) || (() => { const ds = [...raw.matchAll(/\b([0-3]\d)[.\/ -]([01]\d)[.\/ -]((?:19|20)\d\d)\b/g)].map(m => `${m[3]}-${m[2]}-${m[1]}`).sort(); const today = new Date().toISOString().slice(0, 10); return ds.reverse().find(d => d > today) || ''; })();
    const f4d = field(/\b4\s?d\s?[.,)]?/i), personal = ((f4d?.rest || '').match(/\d{11}/) || [''])[0] || personalFromText(raw);
    const f5 = field(/^\s*5\s?[.,)]/), number = f5 ? f5.rest.split(/\s\d{1,2}\s?[a-z]?\s?[.,)]/i)[0].replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 14) : '';
    if (!surname && !given) return null;
    const nat = /\bRUS\b|РОССИ/i.test(raw) ? 'RUS' : (personal || /\bGEO\b|GEORGIA|საქართველო/i.test(raw)) ? 'GEO' : '';
    // Russian licences print every name twice (Cyrillic, then Latin); read as Latin text the Cyrillic half is noise → keep the second half
    const half = n => { const w = String(n || '').split(/\s+/).filter(Boolean); return nat === 'RUS' && w.length >= 2 && w.length % 2 === 0 ? w.slice(w.length / 2).join(' ') : n; };
    surname = half(surname); given = half(given);
    return { kind:'dl', surname, given, birth, expiry, personal, number, nationality:nat, partial: !(surname && given && (birth || personal)) };
  }

  /* names in the holder's own script: Georgian / Cyrillic words read from the printed page are kept only
     when they transliterate back to the Latin name of the MRZ (so OCR noise can never become a name) */
  const RU = { А:'A',Б:'B',В:'V',Г:'G',Д:'D',Е:'E',Ё:'E',Ж:'ZH',З:'Z',И:'I',Й:'I',К:'K',Л:'L',М:'M',Н:'N',О:'O',П:'P',Р:'R',С:'S',Т:'T',У:'U',Ф:'F',Х:'KH',Ц:'TS',Ч:'CH',Ш:'SH',Щ:'SHCH',Ъ:'IE',Ы:'Y',Ь:'',Э:'E',Ю:'IU',Я:'IA',І:'I',Ї:'I',Є:'IE',Ґ:'G',Ў:'U',Қ:'K',Ғ:'G',Ң:'N',Ү:'U',Ұ:'U',Һ:'H',Ә:'A',Ө:'O' };
  const KA = { ა:'A',ბ:'B',გ:'G',დ:'D',ე:'E',ვ:'V',ზ:'Z',თ:'T',ი:'I',კ:'K',ლ:'L',მ:'M',ნ:'N',ო:'O',პ:'P',ჟ:'ZH',რ:'R',ს:'S',ტ:'T',უ:'U',ფ:'P',ქ:'K',ღ:'GH',ყ:'Q',შ:'SH',ჩ:'CH',ც:'TS',ძ:'DZ',წ:'TS',ჭ:'CH',ხ:'KH',ჯ:'J',ჰ:'H' };
  // compare loosely: spellings differ between transliteration systems (Y/I, KH/H, IA/YA, J/DZH …)
  const loose = s => String(s).toUpperCase().replace(/[^A-Z]/g, '').replace(/KH/g, 'H').replace(/(TS|TZ|C)/g, 'TS').replace(/[YJ]/g, 'I').replace(/IE/g, 'E').replace(/W/g, 'V').replace(/X/g, 'KS').replace(/(.)\1+/g, '$1');
  const translit = w => [...String(w).toUpperCase()].map(ch => RU[ch] ?? KA[ch.toLowerCase()] ?? KA[ch] ?? (/[A-Z]/.test(ch) ? ch : '')).join('');
  const lev = (a, b) => { const d = Array.from({ length:a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1)); return d[a.length][b.length]; };
  // text: OCR output of the page in Georgian or Russian; latin: "GIVEN SURNAME" from the MRZ
  function localName(text, latin, script) {
    const re = script === 'ka' ? /[ა-ჰ]{2,}/g : /[А-ЯЁІЇЄҐЎҚҒҢҮҰҺӘӨа-яёіїєґўқғңүұһәө]{2,}/g;
    const words = [...new Set(String(text || '').match(re) || [])];
    const out = [];
    for (const tok of String(latin || '').split(/\s+/).filter(Boolean)) {
      const want = loose(tok); let best = null, bd = 99;
      for (const w of words) { const d = lev(loose(translit(w)), want); if (d < bd) { bd = d; best = w; } }
      if (!best || bd > Math.max(1, Math.floor(want.length / 5))) return '';     // every part must match, or keep Latin
      out.push(best);
    }
    const cap = w => script === 'ka' ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    return out.map(cap).join(' ');
  }
  // nationality as an ISO 3166 alpha-3 code (OCR noise and full country names are mapped where possible)
  function nationCode(v, countries) {
    const raw = String(v || '').trim();
    const mk = raw.replace(/[\u1C90-\u1CBA]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xBC0));   // Mtavruli capitals → ordinary letters
    const KA_C = { 'საქართველო':'GEO', 'რუსეთი':'RUS', 'უკრაინა':'UKR', 'ბელარუსი':'BLR', 'ყაზახეთი':'KAZ', 'სომხეთი':'ARM', 'აზერბაიჯანი':'AZE', 'თურქეთი':'TUR', 'ისრაელი':'ISR', 'ინდოეთი':'IND' };
    if (KA_C[mk]) return KA_C[mk];
    const RU_C = { 'РОССИЯ':'RUS', 'РОССИЙСКАЯ ФЕДЕРАЦИЯ':'RUS', 'КАЗАХСТАН':'KAZ', 'БЕЛАРУСЬ':'BLR', 'УКРАИНА':'UKR', 'ГРУЗИЯ':'GEO' };
    if (RU_C[raw.toUpperCase()]) return RU_C[raw.toUpperCase()];
    const s = raw.toUpperCase().replace(/[^A-Z ]/g, '').trim();
    if (!s) return '';
    if (s === 'D') return 'DEU';
    if (countries[s]) return s;
    const byName = Object.entries(countries).find(([, n]) => n.toUpperCase() === s || n.toUpperCase().startsWith(s + ' ') || s.startsWith(n.toUpperCase()));
    if (byName) return byName[0];
    const ALIAS = { RUSSIA:'RUS', USA:'USA', 'UNITED STATES':'USA', AMERICA:'USA', UK:'GBR', ENGLAND:'GBR', BRITAIN:'GBR', 'GREAT BRITAIN':'GBR', KOREA:'KOR', 'SOUTH KOREA':'KOR', IRAN:'IRN', TURKEY:'TUR', TURKIYE:'TUR', MOLDOVA:'MDA', CZECHIA:'CZE', 'CZECH REPUBLIC':'CZE', VIETNAM:'VNM', SYRIA:'SYR', UAE:'ARE', EMIRATES:'ARE', HOLLAND:'NLD' };
    if (ALIAS[s]) return ALIAS[s];
    return '';
  }

  root.MRZ = { parse, personalFromText, frontFromText, licenceFromText, check, localName, translit, nationCode };
})(typeof window !== 'undefined' ? window : globalThis);
