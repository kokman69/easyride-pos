/* Easyride POS — ready-to-send reports in the style of the team's WhatsApp group,
   in any mix of Georgian / English / Russian / Japanese. Pure text builders; app.js passes plain data. */
window.ER_REPORT = (function () {
  const HEAD = 'TT JAPAN REUSE TRADING LLC\nEASY RIDE BATUMI';
  const FLAG = { ka: '🇬🇪 ქართული', en: '🇬🇧 English', ru: '🇷🇺 Русский', ja: '🇯🇵 日本語' };
  const W = {
    ka: {
      vehSold: d => `${d} — გაიყიდა:`, itemsSold: d => `${d} — გაიყიდა:`, rentReq: 'დღეს მივიღეთ გაქირავების მოთხოვნა.', rentOn: d => `${d} — გაქირავება`,
      model: 'მოდელი', vin: 'VIN', paid: 'გადახდილი თანხა', pay: 'გადახდის მეთოდი', buyer: 'მყიდველი', nat: 'მოქალაქეობა',
      seller: 'გამყიდველი', code: 'კოდი', total: 'სულ', disc: 'ფასდაკლება', note: 'შენიშვნა',
      item: 'გაქირავებული', period: 'ვადა', fee: 'ქირის საფასური', dep: 'დეპოზიტი', cust: 'მომხმარებელი', tel: 'ტელ.',
      start: 'დაწყება', end: 'დასრულება', vid: 'ტრანსპორტის ვიდეო', vidTaken: 'გადაღებულია გატანისას', doc: 'პასპორტი / ID', docTaken: 'ფოტო გადაღებულია, ასლი შენახულია',
      late: 'დაგვიანებით დაბრუნება', h: 'სთ', agr: 'ხელშეკრულება', agrSigned: 'ხელმოწერილია ელექტრონულად'
    },
    en: {
      vehSold: d => `${d} — sold:`, itemsSold: d => `${d} — sold:`, rentReq: 'Today we received a rental request.', rentOn: d => `${d} — rental`,
      model: 'Model', vin: 'VIN', paid: 'Amount paid', pay: 'Payment method', buyer: 'Buyer', nat: 'Nationality',
      seller: 'Seller', code: 'code', total: 'Total', disc: 'Discount', note: 'Note',
      item: 'Rental item', period: 'Rental period', fee: 'Rental fee', dep: 'Deposit', cust: 'Customer', tel: 'Tel',
      start: 'Rental start', end: 'Rental end', vid: 'Vehicle video', vidTaken: 'recorded at hand-over', doc: 'Passport / ID', docTaken: 'photo taken, copy retained',
      late: 'Late return', h: 'h', agr: 'Rental agreement', agrSigned: 'signed electronically'
    },
    ru: {
      vehSold: d => `${d} — продано:`, itemsSold: d => `${d} — продано:`, rentReq: 'Сегодня мы получили заявку на аренду.', rentOn: d => `${d} — аренда`,
      model: 'Модель', vin: 'VIN', paid: 'Оплачено', pay: 'Способ оплаты', buyer: 'Покупатель', nat: 'Гражданство',
      seller: 'Продавец', code: 'код', total: 'Итого', disc: 'Скидка', note: 'Примечание',
      item: 'Предмет аренды', period: 'Срок аренды', fee: 'Стоимость аренды', dep: 'Депозит', cust: 'Клиент', tel: 'Тел.',
      start: 'Начало аренды', end: 'Окончание аренды', vid: 'Видео транспорта', vidTaken: 'снято при выдаче', doc: 'Паспорт / ID', docTaken: 'фото сделано, копия сохранена',
      late: 'Возврат с опозданием', h: 'ч', agr: 'Договор аренды', agrSigned: 'подписан электронно'
    },
    ja: {
      vehSold: d => `${d} — 販売：`, itemsSold: d => `${d} — 販売：`, rentReq: '本日、レンタルの依頼を受けました。', rentOn: d => `${d} — レンタル`,
      model: 'モデル', vin: '車台番号', paid: '支払金額', pay: '支払方法', buyer: '購入者', nat: '国籍',
      seller: '担当者', code: 'コード', total: '合計', disc: '割引', note: 'メモ',
      item: 'レンタル品', period: 'レンタル期間', fee: 'レンタル料金', dep: 'デポジット', cust: 'お客様', tel: '電話',
      start: 'レンタル開始', end: 'レンタル終了', vid: '車両の動画', vidTaken: '貸出時に撮影済み', doc: '旅券 / 身分証', docTaken: '写真撮影済み、コピー保管',
      late: '返却遅延', h: '時間', agr: 'レンタル契約', agrSigned: '電子署名済み'
    }
  };
  const C = {
    GEO: ['საქართველო', 'Georgia', 'Грузия', 'ジョージア'], RUS: ['რუსეთი', 'Russia', 'Россия', 'ロシア'],
    UKR: ['უკრაინა', 'Ukraine', 'Украина', 'ウクライナ'], BLR: ['ბელარუსი', 'Belarus', 'Беларусь', 'ベラルーシ'],
    KAZ: ['ყაზახეთი', 'Kazakhstan', 'Казахстан', 'カザフスタン'], ARM: ['სომხეთი', 'Armenia', 'Армения', 'アルメニア'],
    AZE: ['აზერბაიჯანი', 'Azerbaijan', 'Азербайджан', 'アゼルバイジャン'], TUR: ['თურქეთი', 'Türkiye', 'Турция', 'トルコ'],
    ISR: ['ისრაელი', 'Israel', 'Израиль', 'イスラエル'], IND: ['ინდოეთი', 'India', 'Индия', 'インド'],
    EGY: ['ეგვიპტე', 'Egypt', 'Египет', 'エジプト'], SAU: ['საუდის არაბეთი', 'Saudi Arabia', 'Саудовская Аравия', 'サウジアラビア'],
    ARE: ['არაბთა გაერთ. საამიროები', 'UAE', 'ОАЭ', 'アラブ首長国連邦'], IRN: ['ირანი', 'Iran', 'Иран', 'イラン'],
    USA: ['აშშ', 'USA', 'США', 'アメリカ'], GBR: ['დიდი ბრიტანეთი', 'United Kingdom', 'Великобритания', 'イギリス'],
    DEU: ['გერმანია', 'Germany', 'Германия', 'ドイツ'], FRA: ['საფრანგეთი', 'France', 'Франция', 'フランス'],
    POL: ['პოლონეთი', 'Poland', 'Польша', 'ポーランド'], EST: ['ესტონეთი', 'Estonia', 'Эстония', 'エストニア'],
    JPN: ['იაპონია', 'Japan', 'Япония', '日本'], CHN: ['ჩინეთი', 'China', 'Китай', '中国'], KOR: ['კორეა', 'Korea', 'Корея', '韓国'],
    UZB: ['უზბეკეთი', 'Uzbekistan', 'Узбекистан', 'ウズベキスタン'], KGZ: ['ყირგიზეთი', 'Kyrgyzstan', 'Киргизия', 'キルギス'],
    MDA: ['მოლდოვა', 'Moldova', 'Молдова', 'モルドバ'], ITA: ['იტალია', 'Italy', 'Италия', 'イタリア'], NLD: ['ნიდერლანდები', 'Netherlands', 'Нидерланды', 'オランダ']
  };
  const LI = { ka: 0, en: 1, ru: 2, ja: 3 };
  const country = (code, lg) => { const c = String(code || '').toUpperCase(); return C[c] ? C[c][LI[lg]] : (window.ER_COUNTRIES || {})[c] || c; };
  const line = (k, v) => v ? `* ${k}: ${v}` : '';
  const join = a => a.filter(Boolean).join('\n');

  /* s: { date, lines:[{name,code,vin,veh,qty,price,sum}], total, discount, payLabel(lg), seller, buyer, nat, note, money(n) } */
  function sale(lg, s) {
    const w = W[lg], veh = s.lines.filter(l => l.veh), items = s.lines.filter(l => !l.veh), out = [];
    if (veh.length) out.push(join([w.vehSold(s.date), ...veh.map(l => join([`• ${l.typeLabel(lg)}`, line(w.model, l.name), line(w.vin, l.vin), line(w.paid, s.money(l.sum))]))]));
    if (items.length) out.push(join([w.itemsSold(s.date), ...items.map(l => `* ${l.name}${l.code ? ` (${w.code} ${l.code})` : ''} — ${l.qty > 1 ? `${l.qty} × ${s.money(l.price)} = ` : ''}${s.money(l.sum)}`)]));
    out.push(join([s.discount ? line(w.disc, s.money(s.discount)) : '', (veh.length && !items.length && veh.length === 1) ? '' : line(w.total, s.money(s.total)),
      line(w.pay, s.payLabel(lg)), line(w.buyer, s.buyer), line(w.nat, country(s.nat, lg)), line(w.seller, s.seller), line(w.note, s.note)]));
    return out.filter(Boolean).join('\n\n');
  }
  /* r: { item(lg), period(lg), fee, payLabel(lg), deposit, cust, tel, nat, start, end, docPhoto, signed, seller } */
  function rental(lg, r) {
    const w = W[lg];
    return join([r.today ? w.rentReq : w.rentOn(r.date), line(w.item, r.item(lg)), line(w.period, r.period(lg)), line(w.fee, r.fee), line(w.disc, r.disc), r.late ? line(w.late, `${r.late.hours} ${w.h} — +${r.late.fee} (${w.total}: ${r.late.total})`) : '', line(w.pay, r.payLabel(lg)),
      line(w.dep, typeof r.deposit === 'function' ? r.deposit(lg) : r.deposit), line(w.cust, r.cust), line(w.tel, r.tel), line(w.nat, country(r.nat, lg)),
      r.docPhoto ? line(w.doc, w.docTaken) : '', r.signed ? line(w.agr, w.agrSigned) : '', r.video ? line(w.vid, w.vidTaken) : '',
      line(w.start, r.start), line(w.end, r.end), line(w.seller, r.seller)]);
  }
  /* deposit back at return, as the team writes it in the group: "100Gel (Cash) was returned to the customer - 19:20"
     d: { dep, back, cur, payLabel(lg), fee, feePay(lg), time } */
  const num = n => { n = Math.round(n * 100) / 100; return String(n % 1 ? n.toFixed(2) : n); };
  const RET = {
    en: { back: (a, c, p, t) => `${a}${c === 'GEL' ? 'Gel' : ' ' + c} (${p}) was returned to the customer - ${t}`, veh: t => `The vehicle was returned - ${t}`, kept: (a, c) => `${a}${c === 'GEL' ? 'Gel' : ' ' + c} was kept from the deposit`, late: (a, p) => `Late return fee: ${a}Gel${p ? ` (${p})` : ''}` },
    ka: { back: (a, c, p, t) => `მომხმარებელს დაუბრუნდა ${a} ${c === 'GEL' ? 'ლარი' : c} (${p}) - ${t}`, veh: t => `ტრანსპორტი დაბრუნდა - ${t}`, kept: (a, c) => `დეპოზიტიდან დაკავდა ${a} ${c === 'GEL' ? 'ლარი' : c}`, late: (a, p) => `დაგვიანების ჯარიმა: ${a} ლარი${p ? ` (${p})` : ''}` },
    ru: { back: (a, c, p, t) => `Клиенту возвращено ${a} ${c} (${p}) - ${t}`, veh: t => `Транспорт возвращён - ${t}`, kept: (a, c) => `Удержано из депозита: ${a} ${c}`, late: (a, p) => `Штраф за опоздание: ${a} GEL${p ? ` (${p})` : ''}` },
    ja: { back: (a, c, p, t) => `お客様にデポジット${a} ${c}（${p}）を返却しました - ${t}`, veh: t => `車両が返却されました - ${t}`, kept: (a, c) => `デポジットから${a} ${c}を差し引きました`, late: (a, p) => `延滞料金：${a} GEL${p ? `（${p}）` : ''}` }
  };
  function ret(lg, d) {
    const w = RET[lg], kept = Math.round((d.dep - d.back) * 100) / 100;
    return join([d.dep && d.back ? w.back(num(d.back), d.cur, d.payLabel(lg), d.time) : w.veh(d.time), kept > 0 ? w.kept(num(kept), d.cur) : '', d.fee ? w.late(num(d.fee), d.feePay(lg)) : '']);
  }
  function build(kind, data, langs) {
    if (kind === 'ret') { const ls = langs.filter(l => RET[l]); return ls.map(lg => (ls.length > 1 ? `${FLAG[lg]}\n` : '') + fix(ret(lg, data), lg)).join('\n\n'); }
    const blocks = langs.filter(l => W[l]).map(lg => `${FLAG[lg]}\n${fix(kind === 'rental' ? rental(lg, data) : sale(lg, data), lg)}`);
    return `${HEAD}\n\n${blocks.join('\n\n')}`;
  }

  /* end-of-day report, the same layout the team posts in the WhatsApp group every morning
     d: { date, items:[{pay, amount, name}], cash, card, transfer, inst, total, depStart, depIn, depOut, depEnd (strings),
          exp:[{amount, name}], expCash, opening, bank, closing, working, cardTotal, note, money(n) } */
  const D = {
    ka: { title: x => `📅 ${x} — დღის დახურვის ანგარიში`, sales: 'გაყიდვები', cash: 'ნაღდი ანგარიშსწორება', card: 'ბარათით გადახდა', transfer: 'საბანკო გადმორიცხვა', inst: 'განვადება',
      cashSum: 'ნაღდი გაყიდვები სულ', cardSum: 'ბარათით სულ', trSum: 'გადმორიცხვით სულ', total: 'გაყიდვები სულ', none: 'გაყიდვები არ ყოფილა',
      deps: 'დეპოზიტები', depStart: 'საწყისი დეპოზიტი', depIn: 'მიღებული დეპოზიტი', depOut: 'დაბრუნებული დეპოზიტი', depEnd: 'დღის ბოლოს შენახვაში არსებული დეპოზიტი',
      exps: 'ხარჯები', exp: 'ნაღდი ხარჯი', close: '📊 დღის დახურვა', opening: 'საწყისი სალარო (მხოლოდ ქეში)', daily: 'დღიური გაყიდვები', cashSales: 'ნაღდი გაყიდვები',
      bank: 'სალაროდან გატანილი (სეიფი / ბანკი)', closing: 'დღის ბოლოს სალაროში (მხოლოდ ქეში)', working: 'სამუშაო სალაროში თანხა', cardTotal: 'ჯამში ბარათით მიღებული', note: 'შენიშვნა', by: 'რეპორტი გაგზავნა' },
    en: { title: x => `📅 ${x} — End of Day Report`, sales: 'Sales', cash: 'Cash payment', card: 'Card payment', transfer: 'Bank transfer', inst: 'Installment',
      cashSum: 'Total cash sales', cardSum: 'Total card', trSum: 'Total transfer', total: 'Total sales', none: 'No sales',
      deps: 'Deposits', depStart: 'Opening deposits', depIn: 'Deposits received', depOut: 'Deposits returned', depEnd: 'Deposits held at end of day',
      exps: 'Expenses', exp: 'Cash expense', close: '📊 Day closing', opening: 'Opening cash (cash only)', daily: 'Daily sales', cashSales: 'Cash sales',
      bank: 'Taken out of the register (safe / bank)', closing: 'Cash at end of day (cash only)', working: 'Working register', cardTotal: 'Total received by card', note: 'Note', by: 'Sent by' },
    ru: { title: x => `📅 ${x} — Отчёт о закрытии дня`, sales: 'Продажи', cash: 'Наличные', card: 'Карта', transfer: 'Банковский перевод', inst: 'Рассрочка',
      cashSum: 'Наличные продажи всего', cardSum: 'Картой всего', trSum: 'Переводом всего', total: 'Продажи всего', none: 'Продаж не было',
      deps: 'Депозиты', depStart: 'Депозиты на начало', depIn: 'Получено депозитов', depOut: 'Возвращено депозитов', depEnd: 'Депозиты на хранении на конец дня',
      exps: 'Расходы', exp: 'Расход наличными', close: '📊 Закрытие дня', opening: 'Касса на начало (только наличные)', daily: 'Продажи за день', cashSales: 'Наличные продажи',
      bank: 'Изъято из кассы (сейф / банк)', closing: 'Касса на конец дня (только наличные)', working: 'Рабочая касса', cardTotal: 'Всего получено картой', note: 'Примечание', by: 'Отправил' },
    ja: { title: x => `📅 ${x.split('.').reverse().join('年').replace(/年(\d+)年(\d+)$/, '年$1月$2日')} — 営業終了報告`, sales: '売上', cash: '現金支払い', card: 'カード支払い', transfer: '銀行振込', inst: '分割払い',
      cashSum: '現金売上合計', cardSum: 'カード合計', trSum: '振込合計', total: '売上合計', none: '売上なし',
      deps: 'デポジット', depStart: '開始時のデポジット', depIn: '受け取ったデポジット', depOut: '返金したデポジット', depEnd: '営業終了時点で保管中のデポジット',
      exps: '経費', exp: '現金経費', close: '📊 営業終了報告', opening: '開始時のレジ現金（現金のみ）', daily: '本日の売上合計', cashSales: '現金売上',
      bank: 'レジから持ち出し（金庫・銀行）', closing: '営業終了時のレジ現金（現金のみ）', working: '業務用レジ現金', cardTotal: 'カード決済累計', note: '備考', by: '送信者' }
  };
  const DAYKEY = { cash: 'cash', card: 'card', transfer: 'transfer', installment: 'inst' };
  function dayOne(lg, d) {
    const w = D[lg], m = d.money, out = [w.title(d.date), '', w.sales, ''];
    if (!d.items.length) out.push(`* ${w.none}`);
    const nm = n => typeof n === 'function' ? n(lg) : n;   // names may come per language
    d.items.forEach(it => out.push(`* ${w[DAYKEY[it.pay] || 'cash']}: ${m(it.amount)}${nm(it.name) ? ` — ${nm(it.name)}` : ''}`));
    out.push(`* ${w.cashSum}: ${m(d.cash)}`);
    if (d.card) out.push(`* ${w.cardSum}: ${m(d.card)}`);
    if (d.transfer) out.push(`* ${w.trSum}: ${m(d.transfer)}`);
    out.push(`* ${w.total}: ${m(d.total)}`, '', w.deps, '',
      `* ${w.depStart}: ${d.depStart}`, `* ${w.depIn}: ${d.depIn}`, `* ${w.depOut}: ${d.depOut}`, `* ${w.depEnd}: ${d.depEnd}`);
    if (d.exp.length) { out.push('', w.exps, ''); d.exp.forEach(x => out.push(`* ${w.exp}: ${m(x.amount)}${nm(x.name) ? ` — ${nm(x.name)}` : ''}`)); }
    out.push('', w.close, '', `* ${w.opening}: ${m(d.opening)}`, `* ${w.daily}: ${m(d.total)}`, `* ${w.cashSales}: ${m(d.cash)}`);
    if (d.bank) out.push(`* ${w.bank}: ${m(d.bank)}`);
    if (d.expCash) out.push(`* ${w.exp}: ${m(d.expCash)}`);
    out.push(`* ${w.closing}: ${m(d.closing)}`, `* ${w.working}: ${m(d.working)}`, `* ${w.cardTotal}: ${m(d.cardTotal)}`);
    if (d.note) out.push('', `${w.note}: ${d.note}`);
    if (d.by) out.push('', `${w.by}: ${d.by}`);
    return out.join('\n');
  }
  function day(d, langs) {
    const ls = langs.filter(l => D[l]);
    return ls.map((lg, i) => (ls.length > 1 ? `${FLAG[lg]}\n\n` : '') + fix(dayOne(lg, d), lg)).join('\n\n⸻\n\n');
  }
  /* blocks for other languages must not carry Georgian letters: app.js translates colours / kinds and writes names in Latin */
  const fix = (s, lg) => lg !== 'ka' && typeof api.localize === 'function' ? api.localize(s, lg) : s;
  const api = { build, day, FLAG, langs: Object.keys(W), localize: null };
  return api;
})();
