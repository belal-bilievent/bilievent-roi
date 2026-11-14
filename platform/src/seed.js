// Creates a demo workspace with realistic sample data. Safe to re-run: it rebuilds only the demo org.
const { one, all, run, tx } = require('./db');
const { hash } = require('./server');
const S = require('./scoring');
const I = require('./insights');

let seed = 42; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a, w) => { if (!w) return a[Math.floor(rnd() * a.length)]; const t = w.reduce((s, x) => s + x, 0); let r = rnd() * t; for (let i = 0; i < a.length; i++) { r -= w[i]; if (r <= 0) return a[i]; } return a[a.length - 1]; };

const DEMO_EMAIL = process.env.DEMO_EMAIL || 'demo@bilievent.com';
const DEMO_PASS = process.env.DEMO_PASSWORD || 'BilieventDemo2026';

tx(() => {
  const old = one("SELECT id FROM orgs WHERE name='Bilievent Demo · Medical Systems Co.'");
  if (old) run('DELETE FROM orgs WHERE id=?', old.id);
  const org = run("INSERT INTO orgs(name,icp_sectors) VALUES('Bilievent Demo · Medical Systems Co.', ?)", JSON.stringify(['Healthcare', 'Hospitals', 'Pharma'])).lastInsertRowid;
  const U = {};
  for (const [k, name, email, role] of [['admin', 'Demo Admin', DEMO_EMAIL, 'admin'], ['mgr', 'Rakan S.', 'rakan.demo@bilievent.com', 'manager'], ['s1', 'Lina M.', 'lina.demo@bilievent.com', 'sales'], ['s2', 'Fahad A.', 'fahad.demo@bilievent.com', 'sales'], ['st', 'Reem K.', 'reem.demo@bilievent.com', 'staff']]) {
    run('DELETE FROM users WHERE email=?', email);
    U[k] = run('INSERT INTO users(org_id,name,email,pass_hash,role) VALUES(?,?,?,?,?)', org, name, email, hash(k === 'admin' ? DEMO_PASS : DEMO_PASS + k), role).lastInsertRowid;
  }
  const orgRow = one('SELECT * FROM orgs WHERE id=?', org);
  const shows = [
    ['Healthcare Expo 2023', '2023-11-06', 355000, 520, 0.42e6, 0.35],
    ['Healthcare Expo 2024', '2024-11-04', 370000, 640, 0.71e6, 0.55],
    ['Saudi Food Show 2025', '2025-05-12', 265000, 470, 0.39e6, 0.6],
    ['Healthcare Expo 2025', '2025-11-03', 390000, 780, 1.02e6, 0.75],
    ['Healthcare Expo 2026', '2026-11-02', 410000, 900, 1.39e6, 0.92],
  ];
  const companies = ['Hospital group', 'University hospital', 'Private clinic chain', 'Pharma distributor', 'Polyclinic group', 'Government hospital', 'Dental centres', 'Medical lab network', 'Home-care provider', 'Rehab centre'];
  const cities = ['Riyadh', 'Jeddah', 'Dammam', 'Qassim', 'Madinah', 'Khobar', 'Abha'];
  const first = ['Faisal', 'Noura', 'Omar', 'Sara', 'Khalid', 'Huda', 'Abdullah', 'Reem', 'Majed', 'Lama', 'Turki', 'Hessa', 'Yousef', 'Amal', 'Saad'];
  const last = ['Al-Harbi', 'Al-Qahtani', 'Basheer', 'Al-Dosari', 'Rahman', 'Al-Shehri', 'Al-Otaibi', 'Al-Ghamdi', 'Al-Mutairi', 'Al-Zahrani'];
  const titles = [['Procurement Director', 'decision_maker'], ['CEO', 'decision_maker'], ['Head of Biomedical', 'decision_maker'], ['Operations Manager', 'influencer'], ['IT Manager', 'influencer'], ['Biomedical Engineer', 'user'], ['Nurse Supervisor', 'user'], ['Sales Rep', 'user']];
  const interests = ['Imaging', 'Patient kiosks', 'Service contracts', 'Cold-chain'];
  const costSplit = [['Space rental', 0.44], ['Stand design & build', 0.23], ['Staff & travel', 0.17], ['AV & screens', 0.06], ['Giveaways & print', 0.04], ['Media & invitations', 0.06]];
  for (const [name, start, cost, n, wonTarget, quality] of shows) {
    const end = new Date(new Date(start).getTime() + 2 * 864e5).toISOString().slice(0, 10);
    const ex = run('INSERT INTO exhibitions(org_id,name,venue,city,start_date,end_date,stand,size_m2,status,goal_qualified,goal_pipeline,goal_cpql) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      org, name, name.includes('Food') ? 'Riyadh Front' : 'Riyadh Front', 'Riyadh', start, end, name.includes('Food') ? 'C22' : 'B14', name.includes('2026') ? 54 : 48, 'measured', Math.round(n * 0.3), wonTarget * 3, 1500).lastInsertRowid;
    for (const [c, s] of costSplit) run('INSERT INTO costs(exhibition_id,category,amount) VALUES(?,?,?)', ex, c, Math.round(cost * s));
    const leads = [];
    for (let i = 0; i < n; i++) {
      const [title, authority] = pick(titles, [2, 1, 1.5, 3, 2, 3, 2, 1].map((w, j) => j < 3 ? w * (0.6 + quality) : w));
      const flags = rnd() < 0.05 ? ['student'] : rnd() < 0.03 ? ['competitor'] : [];
      const d = new Date(new Date(start).getTime() + Math.floor(rnd() * 3) * 864e5);
      const hour = pick([10, 11, 12, 13, 14, 15, 16, 17, 18, 19], [3, 6, 8, 10, 7, 6, 9, 12, 8, 4]);
      d.setUTCHours(hour - 3, Math.floor(rnd() * 60));
      const l = { company: `${pick(companies)} · ${pick(cities)}`, name: `${pick(first)} ${pick(last)}`, title, authority, sector: pick(['Hospitals', 'Healthcare', 'Pharma', 'Education', 'Retail'], [4, 3, 2, 1, 1]),
        company_size: pick(['enterprise', 'large', 'mid', 'small', 'unknown'], [2, 3, 3, 2, 1]), budget: pick(['approved', 'planned', 'none', 'unknown'], [1 + quality, 2, 1.5, 3]),
        timeline: pick(['now', 'quarter', 'year', 'exploring', 'unknown'], [0.6 + quality * 0.5, 1.5, 2, 2, 1.5]), engagement: pick([0, 1, 2, 3], [3, 3, 2, 1 + quality]),
        interests: [pick(interests, [5, 2, 2, 1])], flags, email: rnd() < 0.8 ? `contact${ex}${i}@example.sa` : null, phone: rnd() < 0.7 ? `05${Math.floor(10000000 + rnd() * 89999999)}` : null,
        source: pick(['qr', 'form', 'card', 'voice'], [4 * quality, 4 * (1 - quality) + 1, 1, 1 * quality]), captured_at: d.toISOString().slice(0, 19).replace('T', ' ') };
      if (/Food/.test(name)) l.interests = [pick(['Cold-chain', 'Patient kiosks'])];
      const sc = S.score(l, orgRow); Object.assign(l, sc);
      // follow-up speed improves with quality (later shows)
      if (l.tier !== 'cold') { const hrs = l.tier === 'hot' ? (rnd() < quality ? 2 + rnd() * 20 : 30 + rnd() * 90) : 24 + rnd() * 120; l.first_contact_at = new Date(d.getTime() + hrs * 36e5).toISOString().slice(0, 19).replace('T', ' '); l.fast = hrs <= 24; }
      leads.push(l);
    }
    // outcomes: hot & fast win more
    for (const l of leads) {
      if (l.tier === 'cold') { l.stage = 'new'; l.value = 0; continue; }
      const p = l.tier === 'hot' ? (l.fast ? 0.42 : 0.14) : 0.06;
      const r = rnd(); l.stage = r < p ? 'won' : r < p + 0.25 ? 'lost' : r < p + 0.45 ? 'proposal' : r < p + 0.6 ? 'meeting' : 'contacted';
      l.value = ['won', 'proposal', 'meeting'].includes(l.stage) ? Math.round((20000 + rnd() * 90000) / 1000) * 1000 : 0;
    }
    const wonSum = leads.filter(l => l.stage === 'won').reduce((s, l) => s + l.value, 0) || 1;
    const k = wonTarget / wonSum;
    for (const l of leads) {
      if (l.stage === 'won') { l.value = Math.round(l.value * k / 100) * 100; l.won_at = new Date(new Date(end).getTime() + (10 + rnd() * 75) * 864e5).toISOString().slice(0, 10); }
      else if (l.value) l.value = Math.round(l.value * k * 1.2 / 100) * 100;
      const owner = l.tier === 'cold' ? null : pick([U.mgr, U.s1, U.s2]);
      const id = run(`INSERT INTO leads(org_id,exhibition_id,created_by,owner_id,captured_at,source,company,name,title,email,phone,sector,company_size,interests,timeline,budget,authority,engagement,flags,score,tier,reasons,stage,value,won_at,first_contact_at,next_step)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, org, ex, pick([U.st, U.s1, U.s2, U.mgr]), owner, l.captured_at, l.source, l.company, l.name, l.title, l.email, l.phone, l.sector, l.company_size,
        JSON.stringify(l.interests), l.timeline, l.budget, l.authority, l.engagement, JSON.stringify(l.flags), l.score, l.tier, JSON.stringify(l.reasons), l.stage, l.value, l.won_at || null, l.first_contact_at || null,
        l.tier === 'hot' ? 'Call or WhatsApp within 24 hours' : l.tier === 'warm' ? 'Nurture: send material' : 'No follow-up').lastInsertRowid;
      run("INSERT INTO activities(lead_id,user_id,type,body,at) VALUES(?,?,'captured',?,?)", id, U.st, `Captured via ${l.source} · scored ${l.score} (${l.tier})`, l.captured_at);
      if (l.first_contact_at) run("INSERT INTO activities(lead_id,user_id,type,body,at) VALUES(?,?,'whatsapp','Follow-up sent on WhatsApp',?)", id, owner, l.first_contact_at);
    }
    I.recommend(one('SELECT * FROM exhibitions WHERE id=?', ex), org);
  }
  // an upcoming show in planning
  const nx = run("INSERT INTO exhibitions(org_id,name,venue,city,start_date,end_date,stand,size_m2,status,goal_qualified,goal_pipeline,goal_cpql) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", org, 'Healthcare Expo 2027', 'Riyadh Front', 'Riyadh', '2027-11-08', '2027-11-10', 'B14', 72, 'planning', 350, 5000000, 1200).lastInsertRowid;
  for (const [c, s] of costSplit) run('INSERT INTO costs(exhibition_id,category,label,amount) VALUES(?,?,?,?)', nx, c, 'Budget', Math.round(480000 * s));
  run("UPDATE improvements SET status='delivered' WHERE org_id=? AND exhibition_id IN (SELECT id FROM exhibitions WHERE org_id=? AND start_date<'2026-01-01')", org, org);
});
console.log(`Demo workspace ready. Sign in with ${DEMO_EMAIL} / ${process.env.DEMO_PASSWORD ? '(DEMO_PASSWORD)' : DEMO_PASS}`);
