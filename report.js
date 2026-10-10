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
  const country = (code, lg) => { const c = String(code || '').toUpperCase(); return C[c] ? C[c][LI[lg]] : c; };
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
    return join([r.today ? w.rentReq : w.rentOn(r.date), line(w.item, r.item(lg)), line(w.period, r.period(lg)), line(w.fee, r.fee), r.late ? line(w.late, `${r.late.hours} ${w.h} — +${r.late.fee} (${w.total}: ${r.late.total})`) : '', line(w.pay, r.payLabel(lg)),
      line(w.dep, r.deposit), line(w.cust, r.cust), line(w.tel, r.tel), line(w.nat, country(r.nat, lg)),
      r.docPhoto ? line(w.doc, w.docTaken) : '', r.signed ? line(w.agr, w.agrSigned) : '', r.video ? line(w.vid, w.vidTaken) : '',
      line(w.start, r.start), line(w.end, r.end), line(w.seller, r.seller)]);
  }
  function build(kind, data, langs) {
    const blocks = langs.filter(l => W[l]).map(lg => `${FLAG[lg]}\n${kind === 'rental' ? rental(lg, data) : sale(lg, data)}`);
    return `${HEAD}\n\n${blocks.join('\n\n')}`;
  }
  return { build, FLAG, langs: Object.keys(W) };
})();
