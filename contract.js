/* Easyride POS — short, plain-language rental agreement in 4 languages.
   Based on the shop's Russian "Договор Аренды Транспортного Средства"; every term of the original is kept,
   the blanks are filled automatically from the rental. Placeholders: {name} {doc} ... */
window.ER_CONTRACT = (function () {
  const LESSOR = { name: 'TT JAPAN REUSE TRADING LLC', reg: '405827299', director: 'Risa Tanaka', passport: 'TT4229235' };
  const T = {
    ka: {
      title: 'სატრანსპორტო საშუალების ქირავნობის ხელშეკრულება',
      place: 'ბათუმი',
      lessor: 'გამქირავებელი', renter: 'დამქირავებელი',
      lessorLine: 'შპს {lname} (ს/ნ {lreg}), დირექტორი {ldir} (პასპორტი {lpass})',
      renterLine: '{name} · {doc} {idnum}{dobPart}{phonePart}',
      dob: 'დაბ.', tel: 'ტელ.',
      docs: { passport: 'პასპორტი', id: 'პირადობა', other: 'დოკუმენტი' },
      sum: [['vehicle', 'ტრანსპორტი'], ['period', 'ვადა'], ['start', 'დაწყება'], ['end', 'დაბრუნება არაუგვიანეს'], ['price', 'ქირა'], ['deposit', 'დეპოზიტი'], ['address', 'აღება და დაბრუნება']],
      address: 'ბათუმი, რეჯებ ნიჟარაძის ქ. №18, კომერციული ფართი №3 (EASY RIDE BATUMI)',
      paidNote: 'გადახდილია',
      s: [
        ['გადახდა და დეპოზიტი', [
          'ქირა იხდება ხელმოწერის დღეს, ტრანსპორტის გადმოცემამდე — ნაღდით ან უნაღდოდ (ანგარიშზე გადარიცხვით).',
          'დეპოზიტი ბრუნდება ტრანსპორტის დაბრუნების შემდეგ, თუ პირობები დაცულია. ზიანის თანხა დეპოზიტიდან იქვითება; თუ ზიანი დეპოზიტზე მეტია, სხვაობას სრულად იხდით.']],
        ['თქვენ ვალდებული ხართ', [
          'იმოძრაოთ საქართველოს კანონმდებლობისა და საგზაო მოძრაობის წესების დაცვით და ტრანსპორტი გამოიყენოთ მხოლოდ დანიშნულებისამებრ. მოპედი და ელ. მოპედი მოძრაობს სავალ ნაწილზე, ავტომობილებთან ერთად; ველოსიპედი, ელ. სკუტერი და ელ. კვადროციკლი — მხოლოდ იქ, სადაც ეს კანონით დაშვებულია.',
          'მოპედზე, ელ. მოპედზე და ელ. კვადროციკლზე ჩაფხუტი სავალდებულოა მძღოლისთვისაც და მგზავრისთვისაც მთელი მგზავრობის განმავლობაში; ველოსიპედზე და ელ. სკუტერზე — რეკომენდებულია.',
          'აღებისას შეამოწმოთ ტრანსპორტის გარეგნობა და ტექნიკური მდგომარეობა და ნებისმიერი ხარვეზი მაშინვე გვაცნობოთ. თუ არ გვაცნობებთ, ითვლება, რომ ტრანსპორტი გადმოგეცათ გამართული და უნაკლო.',
          'გაუფრთხილდეთ როგორც საკუთარს და დააბრუნოთ დროულად, იმავე მდგომარეობაში (ბუნებრივი ცვეთის გარდა). ზედმეტად დაბინძურებულის დაბრუნებისას სპეციალური დასუფთავების ღირებულებას იხდით.',
          'ავარიის, ქურდობის, დაკარგვის, ხანძრის, მესამე პირის მიერ დაზიანების ან სხვა საგანგებო შემთხვევისას დაუყოვნებლივ გვაცნობოთ, საჭიროებისას — სამართალდამცავებსაც, და სრულად დაგვეხმაროთ აქტების, ოქმებისა და სხვა დოკუმენტების გაფორმებაში.']],
        ['აკრძალულია', [
          'მართვა ალკოჰოლური, ნარკოტიკული, ფსიქოტროპული ან სხვა ნივთიერების ზემოქმედების ქვეშ.',
          'რბოლებში, შეჯიბრებებში მონაწილეობა, სახიფათო მართვა, ან ტრანსპორტის გამოყენება კანონსაწინააღმდეგო მიზნით.',
          'ჩვენი წერილობითი თანხმობის გარეშე: ტრანსპორტის სხვისთვის გადაცემა ან ქვექირავნობა (ამ შემთხვევაში მის ქმედებებზეც თქვენ აგებთ პასუხს), თვითნებური შეკეთება, ან ქალაქის ფარგლებს გარეთ გატანა.']],
        ['პასუხისმგებლობა', [
          'დაზიანებისას ანაზღაურებთ შეკეთებას და მიყენებულ ზიანს სრულად. დაკარგვის, განადგურების ან გამოუსადეგარ მდგომარეობაში მოყვანისას — ტრანსპორტის (ან მისი ნაწილის) სრულ ღირებულებას, მიუხედავად ბრალისა.',
          'დაბრუნების დაგვიანება: ჯარიმა — დღიური ქირის 10% ყოველ დაგვიანებულ საათზე{penPart}; პირველი 30 წუთი უფასოა.',
          'ქირის პერიოდში საგზაო წესების დარღვევისთვის დაკისრებულ ჯარიმებს თქვენ იხდით, მათ შორის მათაც, რომლის შესახებ SMS ან სხვა შეტყობინება დაბრუნებიდან 48 საათში მოვა.',
          'ასევე ანაზღაურებთ თქვენი ქმედებით ან უმოქმედობით გამოწვეულ ხარჯებს: დაბრუნება, ძებნა, ტრანსპორტირება, ევაკუაცია, სპეციალური დასუფთავება, დოკუმენტების გაფორმება.']],
        ['ხელშეკრულების მოქმედება', [
          'მოქმედებს ხელმოწერის მომენტიდან (თარიღი ზემოთ) ორივე მხარის მიერ ვალდებულებების სრულ შესრულებამდე. შეიძლება ნებისმიერ დროს შეწყდეს მხარეთა წერილობითი შეთანხმებით.',
          'გამქირავებელს შეუძლია ცალმხრივად შეწყვიტოს ხელშეკრულება და დაუყოვნებლივ მოითხოვოს ტრანსპორტის დაბრუნება, თუ ის დაზიანდა ან დაზიანების საფრთხე არსებობს, თუ ირღვევა ექსპლუატაციის წესები ან ტრანსპორტი არადანიშნულებისამებრ გამოიყენება. ამ დროს მიყენებულ ზიანს სრულად ანაზღაურებთ.']],
        ['დავები', [
          'დავები წყდება მოლაპარაკებით. თუ 10 დღეში ვერ შევთანხმდით, დავას განიხილავს საქართველოს სასამართლო. ყველა სხვა საკითხი რეგულირდება საქართველოს კანონმდებლობით.']]
      ],
      agree: 'ხელმოწერით ვადასტურებ, რომ წავიკითხე, გავიგე და ვეთანხმები ამ პირობებს.',
      lessorSign: 'გამქირავებლის სახელით', renterSign: 'დამქირავებლის ხელმოწერა', signedAt: 'ხელმოწერილია'
    },
    en: {
      title: 'Vehicle Rental Agreement',
      place: 'Batumi',
      lessor: 'Lessor', renter: 'Renter',
      lessorLine: '{lname} (ID {lreg}), represented by director {ldir} (passport {lpass})',
      renterLine: '{name} · {doc} {idnum}{dobPart}{phonePart}',
      dob: 'born', tel: 'tel.',
      docs: { passport: 'passport', id: 'ID card', other: 'document' },
      sum: [['vehicle', 'Vehicle'], ['period', 'Period'], ['start', 'Start'], ['end', 'Return no later than'], ['price', 'Rent'], ['deposit', 'Deposit'], ['address', 'Pick-up & return']],
      address: 'Batumi, 18 Rejeb Nizharadze St., commercial unit 3 (EASY RIDE BATUMI)',
      paidNote: 'paid',
      s: [
        ['Payment and deposit', [
          'The rent is paid on the day of signing, before you receive the vehicle — in cash or by bank transfer/card.',
          'The deposit is returned after you bring the vehicle back, if the terms are kept. Any damage is deducted from it; if the damage is larger than the deposit, you pay the rest in full.']],
        ['You must', [
          'Follow Georgian law and traffic rules and use the vehicle only for its purpose. Mopeds and e-mopeds ride on the road together with cars; bicycles, e-scooters and e-ATVs only where the law allows.',
          'Helmet is mandatory on mopeds, e-mopeds and e-ATVs for both driver and passenger for the whole ride; on bicycles and e-scooters it is recommended.',
          'Check the look and technical condition of the vehicle when you receive it and tell us about any defect right away. If you don\'t, the vehicle is considered handed over in good working order with no defects.',
          'Take care of it as your own and return it on time in the same condition (normal wear excepted). If it comes back excessively dirty, you pay for special cleaning.',
          'In case of an accident, theft, loss, fire, damage by others or any other emergency, inform us immediately — and the police when required — and fully help with reports and paperwork.']],
        ['Not allowed', [
          'Riding under the influence of alcohol, drugs, psychotropic or any other impairing substances.',
          'Racing, competitions, dangerous riding, or any illegal use.',
          'Without our written consent: giving or sub-renting the vehicle to anyone (you are then responsible for their actions), repairing it yourself, or taking it outside the city.']],
        ['Liability', [
          'Damage: you pay for the repair and all losses in full. Loss, destruction or making it unusable: the full value of the vehicle (or the part), regardless of fault.',
          'Late return: penalty of 10% of the daily rent for every hour of delay{penPart}; the first 30 minutes are free.',
          'Traffic fines for the rental period are yours, including those we are notified about by SMS or otherwise within 48 hours after return.',
          'You also cover costs caused by your actions or inaction: return, search, transport, towing, special cleaning and paperwork.']],
        ['Term and termination', [
          'Valid from signing (date above) until both sides have fully met their obligations. It can be ended at any time by mutual written agreement.',
          'The lessor may end it unilaterally and demand the vehicle back immediately if it is damaged or at risk of damage, if the rules of use are broken or the vehicle is misused. You then compensate the damage in full.']],
        ['Disputes', [
          'Disputes are settled by negotiation. If not settled within 10 days, they go to the competent court of Georgia. Everything else is governed by the law of Georgia.']]
      ],
      agree: 'By signing I confirm that I have read, understood and accept these terms.',
      lessorSign: 'For the lessor', renterSign: 'Renter\'s signature', signedAt: 'Signed'
    },
    ru: {
      title: 'Договор аренды транспортного средства',
      place: 'Батуми',
      lessor: 'Арендодатель', renter: 'Арендатор',
      lessorLine: '{lname} (ИН {lreg}), в лице директора {ldir} (паспорт {lpass})',
      renterLine: '{name} · {doc} {idnum}{dobPart}{phonePart}',
      dob: 'дата рожд.', tel: 'тел.',
      docs: { passport: 'паспорт', id: 'удостоверение личности', other: 'документ' },
      sum: [['vehicle', 'Транспорт'], ['period', 'Срок'], ['start', 'Начало'], ['end', 'Вернуть не позднее'], ['price', 'Арендная плата'], ['deposit', 'Депозит'], ['address', 'Получение и возврат']],
      address: 'Батуми, ул. Реджеба Нижарадзе, 18, коммерческое помещение №3 (EASY RIDE BATUMI)',
      paidNote: 'оплачено',
      s: [
        ['Оплата и депозит', [
          'Аренда оплачивается в день подписания, до передачи транспорта — наличными или безналично (переводом на счёт).',
          'Депозит возвращается после возврата транспорта при соблюдении условий. Ущерб удерживается из депозита; если ущерб больше депозита, разницу вы доплачиваете полностью.']],
        ['Вы обязаны', [
          'Соблюдать законы Грузии и ПДД и использовать транспорт только по назначению. Мопед и электромопед едут по проезжей части вместе с автомобилями; велосипед, электросамокат и электроквадроцикл — только там, где это разрешено законом.',
          'На мопеде, электромопеде и электроквадроцикле шлем обязателен для водителя и пассажира в течение всей поездки; на велосипеде и электросамокате — рекомендуется.',
          'При получении проверить внешний вид и техническое состояние и сразу сообщить о любых недостатках. Если вы не сообщили, считается, что транспорт передан исправным и без недостатков.',
          'Беречь как своё и вернуть вовремя в том же состоянии (кроме нормального износа). Если транспорт возвращён сильно загрязнённым, вы оплачиваете специальную чистку.',
          'При ДТП, краже, утрате, пожаре, повреждении третьими лицами или другом происшествии — немедленно сообщить нам, при необходимости — в полицию, и полностью содействовать оформлению актов, протоколов и документов.']],
        ['Запрещено', [
          'Управлять в состоянии алкогольного, наркотического, психотропного или иного опьянения.',
          'Гонки, соревнования, опасная езда, использование в незаконных целях.',
          'Без нашего письменного согласия: передавать транспорт другим лицам или в субаренду (за их действия отвечаете вы), ремонтировать самостоятельно, вывозить за пределы города.']],
        ['Ответственность', [
          'Повреждение — вы оплачиваете ремонт и весь ущерб полностью. Утрата, уничтожение или приведение в негодность — полную стоимость транспорта (или его части) независимо от вины.',
          'Просрочка возврата: штраф 10% суточной арендной платы за каждый час просрочки{penPart}; первые 30 минут — бесплатно.',
          'Штрафы за нарушения ПДД в период аренды оплачиваете вы, включая те, о которых мы получим SMS или иное уведомление в течение 48 часов после возврата.',
          'Также вы возмещаете расходы, возникшие из-за ваших действий или бездействия: возврат, поиск, транспортировка, эвакуация, специальная чистка, оформление документов.']],
        ['Срок действия и расторжение', [
          'Действует с момента подписания (дата выше) до полного исполнения обязательств обеими сторонами. Может быть расторгнут в любое время по взаимному письменному соглашению.',
          'Арендодатель вправе в одностороннем порядке расторгнуть договор и потребовать немедленного возврата транспорта при его повреждении или риске повреждения, при нарушении правил эксплуатации или использовании не по назначению. Ущерб вы возмещаете в полном объёме.']],
        ['Споры', [
          'Споры решаются переговорами. Если спор не решён за 10 дней, его рассматривает компетентный суд Грузии. Всё остальное регулируется законодательством Грузии.']]
      ],
      agree: 'Подписывая, я подтверждаю, что прочитал(а), понял(а) и принимаю эти условия.',
      lessorSign: 'От имени арендодателя', renterSign: 'Подпись арендатора', signedAt: 'Подписано'
    },
    ja: {
      title: '車両レンタル契約書',
      place: 'バトゥミ',
      lessor: '貸主', renter: '借主',
      lessorLine: '{lname}（法人番号 {lreg}）代表取締役 {ldir}（旅券 {lpass}）',
      renterLine: '{name}・{doc} {idnum}{dobPart}{phonePart}',
      dob: '生年月日', tel: '電話',
      docs: { passport: '旅券', id: '身分証明書', other: '身分証' },
      sum: [['vehicle', '車両'], ['period', '期間'], ['start', '開始'], ['end', '返却期限'], ['price', 'レンタル料'], ['deposit', '保証金'], ['address', '受取・返却場所']],
      address: 'バトゥミ市 レジェブ・ニジャラゼ通り18番 商業区画3号（EASY RIDE BATUMI）',
      paidNote: '支払済',
      s: [
        ['支払いと保証金', [
          'レンタル料は署名日、車両の引き渡し前に現金またはキャッシュレス（口座振込）でお支払いください。',
          '保証金は、条件が守られていれば車両の返却後に返金します。損害額は保証金から差し引き、保証金を超える分は全額お支払いいただきます。']],
        ['借主の義務', [
          'ジョージアの法律と交通ルールを守り、車両を本来の目的にのみ使用してください。モペッド・電動モペッドは車道を自動車と一緒に走行します。自転車・電動キックボード・電動バギーは法律で認められた場所でのみ使用できます。',
          'モペッド・電動モペッド・電動バギーでは、運転者・同乗者とも走行中は常にヘルメット着用が義務です。自転車・電動キックボードでは着用を推奨します。',
          '受け取り時に外観と技術的な状態を確認し、不具合があればすぐにお知らせください。申告がない場合、車両は正常で不具合のない状態で引き渡されたものとみなします。',
          '自分の物のように大切に扱い、期限までに同じ状態で返却してください（通常の消耗を除く）。著しく汚れている場合は特別清掃費をいただきます。',
          '事故・盗難・紛失・火災・第三者による損傷・その他の緊急事態の際は、直ちに当店へ、必要に応じて警察へ連絡し、報告書・調書などの書類作成に全面的にご協力ください。']],
        ['禁止事項', [
          '飲酒・薬物・向精神薬など、運転能力を低下させる物質の影響下での運転。',
          'レース・競技への参加、危険運転、違法な目的での使用。',
          '当店の書面による同意なしに：第三者への貸与・転貸（その場合、第三者の行為も借主の責任となります）、自分での修理、市外への持ち出し。']],
        ['責任', [
          '損傷：修理費と損害の全額をお支払いいただきます。紛失・破壊・使用不能にした場合：過失の有無にかかわらず車両（または部品）の全額。',
          '返却遅延：遅延1時間ごとに1日料金の10%の違約金{penPart}。最初の30分は無料です。',
          'レンタル期間中の交通違反の罰金は借主の負担です。返却後48時間以内にSMS等で通知されたものも含みます。',
          '借主の作為・不作為により生じた費用（返却・捜索・運搬・レッカー・特別清掃・書類作成）も負担していただきます。']],
        ['契約期間と解除', [
          '署名時（上記の日付）から双方の義務が完全に履行されるまで有効です。双方の書面合意によりいつでも解除できます。',
          '車両の損傷またはその恐れがある場合、使用ルール違反や目的外使用の場合、貸主は一方的に契約を解除し、直ちに車両の返却を求めることができます。その場合、損害は全額賠償していただきます。']],
        ['紛争', [
          '紛争は協議により解決します。10日以内に解決しない場合は、ジョージアの管轄裁判所で審理されます。その他の事項はジョージアの法律に従います。']]
      ],
      agree: '署名により、上記の条件を読み、理解し、同意したことを確認します。',
      lessorSign: '貸主代理', renterSign: '借主署名', signedAt: '署名日時'
    }
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fill = (s, d) => s.replace(/\{(\w+)\}/g, (_, k) => d[k] ?? '');

  /* d = { name, doc:'passport'|'id'|'other', idnum, dob, phone, vehicle, period, start, end, price, deposit, pen, seller, signedAt } — all already formatted strings */
  function html(lang, d, signatureUrl) {
    const L = T[lang] || T.en;
    const v = {
      ...d, lname: LESSOR.name, lreg: LESSOR.reg, ldir: LESSOR.director, lpass: LESSOR.passport,
      doc: L.docs[d.doc] || L.docs.other,
      dobPart: d.dob ? ` · ${L.dob} ${d.dob}` : '', phonePart: d.phone ? ` · ${L.tel} ${d.phone}` : '',
      penPart: d.pen ? ` (${d.pen})` : ''
    };
    const vals = { ...v, address: L.address };
    const rows = L.sum.filter(([k]) => vals[k]).map(([k, label]) => `<dt>${esc(label)}</dt><dd>${esc(vals[k])}</dd>`).join('');
    return `<article class="contract" lang="${lang}">
      <header><h2>${esc(L.title)}</h2><div class="small muted">${esc(L.place)} · <span class="num">${esc(d.start || '')}</span></div></header>
      <p><b>${esc(L.lessor)}:</b> ${esc(fill(L.lessorLine, v))}<br><b>${esc(L.renter)}:</b> ${esc(fill(L.renterLine, v))}</p>
      <dl class="csum">${rows}</dl>
      ${L.s.map(([h, items], i) => `<section><h3>${i + 1}. ${esc(h)}</h3><ul>${items.map(x => `<li>${esc(fill(x, v))}</li>`).join('')}</ul></section>`).join('')}
      <p class="agree"><b>${esc(L.agree)}</b></p>
      <div class="csign">
        <div><div class="small muted">${esc(L.lessorSign)}</div><div>${esc(LESSOR.name)}${d.seller ? ` · ${esc(d.seller)}` : ''}</div></div>
        <div><div class="small muted">${esc(L.renterSign)}</div>${signatureUrl ? `<img class="sigimg" src="${esc(signatureUrl)}" alt="">` : ''}
          ${d.signedAt ? `<div class="small muted">${esc(L.signedAt)}: <span class="num">${esc(d.signedAt)}</span></div>` : ''}</div>
      </div>
    </article>`;
  }
  return { html, langs: Object.keys(T), LESSOR };
})();
