/* Bilievent 2027 show calendar: filter shows, build a company year, export milestones (.ics), request to join. Nothing is sent to a server. */
(function () {
  const el = document.getElementById('cal-data'); if (!el) return;
  const D = JSON.parse(el.textContent);
  const AR = document.documentElement.lang === 'ar';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAY = 864e5, P = s => new Date(s + 'T00:00:00'), add = (d, n) => new Date(+d + n * DAY);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const LOC = AR ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB';
  const f = (d, o) => d.toLocaleDateString(LOC, o || { day: 'numeric', month: 'short' });
  const T = AR ? {
    months: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
    ev: { confirmed: 'التاريخ مؤكد', tbc: 'التاريخ للتأكيد', month: 'الشهر فقط' }, type: { ex: 'معرض', conf: 'مؤتمر' },
    add: 'أضف إلى عامي', added: 'ضمن عامي ✓', src: 'المصدر', shows: 'معرض', none: 'لا توجد معارض بهذه الفلاتر. جرّب إزالة بعضها.',
    full: d => 'الدورة الكاملة متاحة: يبدأ التجهيز ' + d, short: w => 'دورة مضغوطة: بقي ' + w + ' أسابيع على المعرض', past: 'انتهى المعرض', monthOnly: 'اليوم لم يُعلن بعد: نؤكده مع المنظم',
    m: { prep: 'بدء البرنامج: قائمة الأهداف والميزانية', targets: 'اعتماد قائمة 40 شركة وإرسال الدعوات', speaker: 'تأكيد فقرة المتحدث وخطة التغطية', rt: 'الطاولة المستديرة التنفيذية', booth: 'تركيب الجناح واختبار الكاميرات والسماعات', show: 'أيام المعرض: تسجيل وتقييم مباشر', fu: 'المتابعة المكثفة 72 ساعة', d30: 'مراجعة الفرص بعد 30 يوماً', d90: 'تقرير العائد بعد 90 يوماً' },
    clash: (a, b) => 'تتقاطع أيام ' + a + ' مع ' + b + '. الجناح الثابت في مكان واحد: سنقترح نسخة ثانية من الجناح أو اختيار أحدهما.',
    tight: (a, b) => 'بين ' + a + ' و' + b + ' أقل من أسبوع: الجناح ينتقل مباشرة، ونخطط النقل مسبقاً.',
    rtClash: (a, b) => 'موعد الطاولة المستديرة لـ' + a + ' يقع أثناء ' + b + '. سننقلها يوماً أو يومين.',
    copied: 'نُسخ رابط عامك', ics: 'تم تنزيل ملف التقويم', count: n => n + ' معرض', emptyYear: 'لم تختر أي معرض بعد. اضغط "أضف إلى عامي" على أي معرض.',
    mail: 'طلب الانضمام إلى برنامج Bilievent 2027', allm: 'كل الأشهر', alli: 'كل القطاعات', allc: 'كل المدن', shown: n => n + ' معرض ظاهر', qmonth: 'فترة هادئة'
  } : {
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    ev: { confirmed: 'Dates confirmed', tbc: 'Dates to confirm', month: 'Month only' }, type: { ex: 'Exhibition', conf: 'Conference' },
    add: 'Add to my year', added: 'In my year ✓', src: 'Source', shows: 'shows', none: 'No shows match these filters. Try removing one.',
    full: d => 'Full 8-week cycle available: prep starts ' + d, short: w => 'Compressed cycle: ' + w + ' weeks to the show', past: 'This show has ended', monthOnly: 'Day not announced yet: we confirm it with the organiser',
    m: { prep: 'Programme starts: target list, goals and budget', targets: 'Top-40 target list locked, invitations out', speaker: 'Speaker slot and media plan confirmed', rt: 'Executive roundtable', booth: 'Signature booth installed, cameras and headsets tested', show: 'Show days: live capture and AI scoring', fu: '72-hour follow-up', d30: 'Day 30 pipeline review', d90: 'Day 90 ROI report' },
    clash: (a, b) => a + ' and ' + b + ' overlap. The signature booth can be at one show at a time: we will propose a second kit or help you pick one.',
    tight: (a, b) => 'Less than a week between ' + a + ' and ' + b + ': the booth moves straight across, and we plan the transfer in advance.',
    rtClash: (a, b) => 'The roundtable for ' + a + ' falls during ' + b + '. We will move it by a day or two.',
    copied: 'Link to your year copied', ics: 'Calendar file downloaded', count: n => n + (n === 1 ? ' show' : ' shows'), emptyYear: 'No shows picked yet. Press “Add to my year” on any show.',
    mail: 'Request to join the Bilievent 2027 programme', allm: 'All months', alli: 'All industries', allc: 'All cities', shown: n => n + ' shown', qmonth: 'Quiet period'
  };
  const IND = D.ind, S = D.shows, byId = Object.fromEntries(S.map(x => [x.id, x]));
  const name = x => (AR && x.na) ? x.na : x.n;

  function ms(x) {
    const s = P(x.s), e = P(x.e);
    return [['prep', add(s, -56)], ['targets', add(s, -42)], ['speaker', add(s, -28)], ['rt', add(s, -14)], ['booth', add(s, -2)], ['show', s, e], ['fu', e, add(e, 3)], ['d30', add(e, 30)], ['d90', add(e, 90)]];
  }
  function status(x) {
    const s = P(x.s), e = P(x.e);
    if (e < today) return ['past', T.past];
    if (x.ev === 'month') return ['warn', T.monthOnly];
    if (add(s, -56) >= today) return ['ok', T.full(f(add(s, -56), { day: 'numeric', month: 'long' }))];
    return ['warn', T.short(Math.max(1, Math.floor((s - today) / (7 * DAY))))];
  }
  const range = x => {
    const s = P(x.s), e = P(x.e);
    if (x.ev === 'month') return f(s, { month: 'long', year: 'numeric' });
    return x.s === x.e ? f(s, { day: 'numeric', month: 'long' }) : (s.getMonth() === e.getMonth() ? s.getDate() + '–' + f(e, { day: 'numeric', month: 'long' }) : f(s) + ' – ' + f(e));
  };

  /* state */
  let sel = [];
  try { const h = location.hash.match(/y=([^&]+)/); if (h) sel = decodeURIComponent(h[1]).split(',').filter(id => byId[id]); else sel = JSON.parse(localStorage.getItem('bili-year') || '[]').filter(id => byId[id]); } catch (e) { sel = []; }
  const F = { q: '', m: '', i: '', c: '', t: '', conf: false };
  const save = () => { try { localStorage.setItem('bili-year', JSON.stringify(sel)); } catch (e) { } };

  /* filters UI */
  const fi = $('#f-ind'), fc = $('#f-city');
  fi.innerHTML = `<option value="">${T.alli}</option>` + Object.entries(IND).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  const cities = [...new Set(S.map(x => x.city))].sort((a, b) => S.filter(x => x.city === b).length - S.filter(x => x.city === a).length);
  fc.innerHTML = `<option value="">${T.allc}</option>` + cities.map(c => `<option value="${esc(c)}">${esc((D.cities[c]) || c)}</option>`).join('');
  $('#f-q').addEventListener('input', e => { F.q = e.target.value.trim().toLowerCase(); render(); });
  fi.addEventListener('change', e => { F.i = e.target.value; render(); });
  fc.addEventListener('change', e => { F.c = e.target.value; render(); });
  $('#f-conf').addEventListener('change', e => { F.conf = e.target.checked; render(); });
  $$('#f-type button').forEach(b => b.addEventListener('click', () => { $$('#f-type button').forEach(x => x.setAttribute('aria-pressed', x === b)); F.t = b.dataset.t; render(); }));

  const match = (x, skipMonth) => (!F.q || (x.n + ' ' + x.na + ' ' + x.venue + ' ' + x.org + ' ' + (IND[x.i] || '')).toLowerCase().includes(F.q)) && (!F.i || x.i === F.i) && (!F.c || x.city === F.c) && (!F.t || x.t === F.t) && (!F.conf || x.ev === 'confirmed') && (skipMonth || !F.m || x.s.slice(5, 7) === F.m);
  const quietIn = m => D.quiet.filter(q => q[0].slice(5, 7) <= m && q[1].slice(5, 7) >= m);

  function strip() {
    const counts = Array(12).fill(0); S.filter(x => match(x, true)).forEach(x => counts[+x.s.slice(5, 7) - 1]++);
    const mx = Math.max(1, ...counts);
    $('#mstrip').innerHTML = counts.map((n, i) => { const m = String(i + 1).padStart(2, '0'), q = quietIn(m).length; return `<button type="button" data-m="${m}" aria-pressed="${F.m === m}" ${n ? '' : 'disabled'} class="${q ? 'q' : ''}" aria-label="${T.months[i]}: ${n} ${T.shows}"><b>${T.months[i]}</b><span>${n}</span><i><u style="width:${Math.round(n / mx * 100)}%"></u></i></button>`; }).join('');
    $$('#mstrip button').forEach(b => b.addEventListener('click', () => { F.m = F.m === b.dataset.m ? '' : b.dataset.m; render(); }));
  }
  function card(x) {
    const on = sel.includes(x.id), [sk, st] = status(x), s = P(x.s);
    const day = x.ev === 'month' ? '–' : (x.s === x.e ? s.getDate() : s.getDate() + '–' + (P(x.e).getMonth() === s.getMonth() ? P(x.e).getDate() : P(x.e).getDate()));
    const meta = [D.cities[x.city] || x.city, x.venue, x.org].filter(Boolean).map(esc).join(' · ');
    return `<article class="show${on ? ' on' : ''}${sk === 'past' ? ' past' : ''}" data-id="${x.id}"><div class="dt"><b dir="ltr">${day}</b><span>${T.months[s.getMonth()]}</span></div>
<div><h4>${esc(name(x))}</h4><div class="meta">${meta}</div>
<div class="tags"><span class="chip">${esc(IND[x.i] || '')}</span><span class="chip">${T.type[x.t]}</span><span class="ev ${x.ev}">${T.ev[x.ev]}</span>${x.src ? `<a class="src" href="${esc(x.src)}" target="_blank" rel="noopener">${T.src}</a>` : ''}</div>
<div class="st ${sk}">${st}</div></div>
<button class="btn sm add" type="button" aria-pressed="${on}" ${sk === 'past' ? 'disabled' : ''} aria-label="${esc((on ? T.added : T.add) + ': ' + name(x))}">${on ? T.added : T.add}</button></article>`;
  }
  function list() {
    const rows = S.filter(x => match(x)); $('#f-count').textContent = T.shown(rows.length);
    if (!rows.length) { $('#shows').innerHTML = `<p class="empty" style="display:block;padding:30px 0">${T.none}</p>`; return; }
    const g = {}; rows.forEach(x => (g[x.s.slice(0, 7)] = g[x.s.slice(0, 7)] || []).push(x));
    $('#shows').innerHTML = Object.entries(g).map(([k, xs]) => { const m = k.slice(5, 7), q = quietIn(m);
      return `<section class="mgroup" aria-label="${T.months[+m - 1]} ${k.slice(0, 4)}"><h3>${AR ? T.months[+m - 1] : new Date(k + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long' })} ${k.slice(0, 4)} <small>${T.count(xs.length)}</small></h3>${q.map(z => `<div class="qband">${T.qmonth}: ${esc(AR ? z[3] : z[2])}</div>`).join('')}${xs.map(card).join('')}</section>`; }).join('');
    $$('#shows .add').forEach(b => b.addEventListener('click', () => toggle(b.closest('.show').dataset.id)));
  }
  function toggle(id) { sel = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]; save(); render(); }

  function year() {
    const xs = sel.map(id => byId[id]).sort((a, b) => a.s < b.s ? -1 : 1);
    $('#y-count').textContent = T.count(xs.length);
    const bar = $('#yearbar'); if (bar) { bar.hidden = !xs.length; $('#yb-n').textContent = T.count(xs.length); }
    $('#y-sum').innerHTML = xs.length ? `<div><b>${xs.length}</b><span>${AR ? 'معارض' : 'shows'}</span></div><div><b>${40 * xs.length}</b><span>${AR ? 'شركة مستهدفة كحد أقصى' : 'target companies, max'}</span></div><div><b>${xs.length}</b><span>${AR ? 'طاولات مستديرة' : 'roundtables'}</span></div>` : '';
    $('#y-list').innerHTML = xs.length ? xs.map(x => `<li><div><b>${esc(name(x))}</b><span>${range(x)} · ${esc(D.cities[x.city] || x.city)}</span><br><span>${AR ? 'يبدأ التجهيز' : 'Prep starts'} ${f(add(P(x.s), -56), { day: 'numeric', month: 'short', year: 'numeric' })}</span></div><button type="button" data-id="${x.id}" aria-label="${AR ? 'إزالة' : 'Remove'} ${esc(name(x))}">×</button></li>`).join('') : '';
    $('#y-none').hidden = !!xs.length; $('#y-acts').hidden = !xs.length;
    $$('#y-list button').forEach(b => b.addEventListener('click', () => toggle(b.dataset.id)));
    const w = [];
    for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
      const a = xs[i], b = xs[j]; if (a.ev === 'month' || b.ev === 'month') continue;
      if (P(b.s) <= P(a.e)) w.push(T.clash(name(a), name(b)));
      else if ((P(b.s) - P(a.e)) / DAY < 7) w.push(T.tight(name(a), name(b)));
      const rt = add(P(b.s), -14); if (rt >= P(a.s) && rt <= P(a.e)) w.push(T.rtClash(name(b), name(a)));
    }
    $('#y-warn').innerHTML = w.map(t => `<p>${esc(t)}</p>`).join('');
    const ta = $('#j-shows'); if (ta) ta.value = xs.map(x => '• ' + x.n + ' (' + x.s + (x.e !== x.s ? ' → ' + x.e : '') + ', ' + x.city + ')').join('\n');
    gantt(xs);
  }
  function gantt(xs) {
    const g = $('#gantt'); if (!g) return;
    g.hidden = !xs.length; if (!xs.length) return;
    const Y0 = P('2027-01-01'), Y1 = P('2028-01-01'), span = Y1 - Y0;
    const pos = d => Math.max(0, Math.min(100, (d - Y0) / span * 100));
    const bar = (cls, a, b, title) => { const l = pos(a), r = pos(b || a); if (r <= 0 && l <= 0 || l >= 100) return ''; return `<i class="${cls}" style="inset-inline-start:${l}%;width:${Math.max(0, r - l)}%" title="${esc(title)}"></i>`; };
    const qz = D.quiet.map(q => bar('gq', P(q[0]), P(q[1]), AR ? q[3] : q[2])).join('');
    $('#g-rows').innerHTML = xs.map(x => { const M = Object.fromEntries(ms(x).map(r => [r[0], r]));
      return `<div class="gr"><b>${esc(name(x))}</b><div class="tr">${qz}${bar('gp', M.prep[1], M.rt[1], T.m.prep)}${bar('g90', M.show[2], M.d90[1], T.m.d90)}${bar('grt', M.rt[1], null, T.m.rt)}${bar('gs', M.show[1], add(M.show[2], 1), T.m.show)}${bar('gf', add(M.show[2], 1), add(M.show[2], 4), T.m.fu)}</div></div>`; }).join('');
  }
  function render() { strip(); list(); year(); }

  /* .ics */
  const pad = n => String(n).padStart(2, '0'), ymd = d => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  const icsEsc = s => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const enc = new TextEncoder(), fold = l => { const out = []; while (enc.encode(l).length > 74) { let k = 74; while (enc.encode(l.slice(0, k)).length > 74) k--; if (/[\uD800-\uDBFF]/.test(l[k - 1])) k--; out.push(l.slice(0, k)); l = ' ' + l.slice(k); } out.push(l); return out.join('\r\n'); };
  function ics(xs) {
    const now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bilievent//ROI Programme 2027//' + (AR ? 'AR' : 'EN'), 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsEsc(AR ? 'برنامج Bilievent 2027' : 'Bilievent programme 2027'), 'X-WR-TIMEZONE:Asia/Riyadh'];
    xs.forEach(x => ms(x).forEach(([k, a, b]) => {
      if (x.ev === 'month' && k !== 'show') return;
      const end = add(b || a, 1);
      L.push('BEGIN:VEVENT', 'UID:' + x.id + '-' + k + '@roi.bilievent.com', 'DTSTAMP:' + now, 'DTSTART;VALUE=DATE:' + ymd(a), 'DTEND;VALUE=DATE:' + ymd(end),
        fold('SUMMARY:' + icsEsc((k === 'show' ? '' : T.m[k] + ' · ') + x.n + (k === 'show' ? ' · ' + T.m.show : ''))),
        fold('LOCATION:' + icsEsc([x.venue, x.city, AR ? 'السعودية' : 'Saudi Arabia'].filter(Boolean).join(', '))),
        fold('DESCRIPTION:' + icsEsc((AR ? 'برنامج Bilievent السنوي. ' : 'Bilievent annual programme. ') + T.ev[x.ev] + '. ' + (x.src ? x.src : ''))), 'TRANSP:TRANSPARENT', 'END:VEVENT');
    }));
    L.push('END:VCALENDAR');
    return L.join('\r\n') + '\r\n';
  }
  $('#y-ics').addEventListener('click', () => {
    const xs = sel.map(id => byId[id]); if (!xs.length) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics(xs)], { type: 'text/calendar;charset=utf-8' }));
    a.download = 'bilievent-programme-2027.ics'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    window.toast && toast(T.ics);
  });
  $('#y-link').addEventListener('click', () => {
    const u = location.origin + location.pathname + '#y=' + encodeURIComponent(sel.join(','));
    history.replaceState(null, '', '#y=' + encodeURIComponent(sel.join(',')));
    (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => window.toast && toast(T.copied), () => window.toast && toast(u));
  });
  /* join form → email / WhatsApp (nothing stored) */
  const jf = $('#join-form');
  if (jf) jf.addEventListener('submit', e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(jf));
    const body = (AR ? `الاسم: ${d.name}\nالشركة: ${d.company}\nالبريد: ${d.email}\nالجوال: ${d.phone}\nالقطاع: ${d.sector}\n\nالمعارض المختارة:\n${d.shows}\n\n${d.msg || ''}` : `Name: ${d.name}\nCompany: ${d.company}\nEmail: ${d.email}\nMobile: ${d.phone}\nIndustry: ${d.sector}\n\nShows picked for 2027:\n${d.shows}\n\n${d.msg || ''}`)
      + '\n\n' + location.origin + location.pathname + '#y=' + encodeURIComponent(sel.join(','));
    if (e.submitter && e.submitter.value === 'wa') window.open('https://wa.me/966551260551?text=' + encodeURIComponent(T.mail + '\n' + body), '_blank', 'noopener');
    else location.href = 'mailto:belal@bilievent.com?cc=ezekiel@bilievent.com,wecare@bilievent.com&subject=' + encodeURIComponent(T.mail + ' · ' + d.company) + '&body=' + encodeURIComponent(body);
  });
  const js = $('#j-sector'); if (js) js.innerHTML = Object.values(IND).map(v => `<option>${esc(v)}</option>`).join('');
  render();
})();
