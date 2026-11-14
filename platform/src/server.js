const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const { one, all, run, J, tx } = require('./db');
const S = require('./scoring');
const I = require('./insights');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '6mb' }));
app.use(express.text({ type: 'text/csv', limit: '4mb' }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; media-src 'self' blob:; font-src 'self'" });
  next();
});

// ---------- auth ----------
const hash = pw => { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex'); };
const verify = (pw, h) => { const [salt, k] = String(h).split(':'); if (!salt || !k) return false; const a = crypto.scryptSync(pw, salt, 64); const b = Buffer.from(k, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const cookie = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=').map(decodeURIComponent)).filter(x => x[0]));
const SECURE = process.env.COOKIE_SECURE === '1';
function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  run("INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,datetime('now','+30 days'))", token, userId);
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}${SECURE ? '; Secure' : ''}`);
}
function auth(req, res, next) {
  const t = cookie(req).sid;
  const u = t && one("SELECT u.*, o.name org_name, o.type org_type FROM sessions s JOIN users u ON u.id=s.user_id JOIN orgs o ON o.id=u.org_id WHERE s.token=? AND s.expires_at>datetime('now') AND u.active=1", t);
  if (!u) return res.status(401).json({ error: 'Please sign in.' });
  req.user = u; req.org = one('SELECT * FROM orgs WHERE id=?', u.org_id); next();
}
const role = (...r) => (req, res, next) => r.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have permission for this.' });
// CSRF: state-changing requests must be JSON or CSV from our own pages (SameSite=Lax cookie + content-type check).
app.use('/api', (req, res, next) => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !/application\/json|text\/csv/.test(req.headers['content-type'] || '')) return res.status(415).json({ error: 'Unsupported content type.' }); next(); });

const attempts = new Map();
app.post('/api/login', (req, res) => {
  const ip = req.ip; const a = attempts.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60e3) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 10) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  const { email, password } = req.body || {};
  const u = email && one('SELECT * FROM users WHERE email=? AND active=1', String(email).trim());
  if (!u || !verify(String(password || ''), u.pass_hash)) { a.n++; attempts.set(ip, a); return res.status(401).json({ error: 'Email or password is incorrect.' }); }
  attempts.delete(ip); startSession(res, u.id); res.json({ ok: true });
});
app.post('/api/signup', (req, res) => {
  if (process.env.ALLOW_SIGNUP !== '1') return res.status(403).json({ error: 'Sign-up is by invitation. Book a demo to get an account.' });
  const { company, name, email, password } = req.body || {};
  if (!company || !name || !email || String(password || '').length < 8) return res.status(400).json({ error: 'Company, name, email and a password of 8+ characters are required.' });
  if (one('SELECT id FROM users WHERE email=?', email)) return res.status(409).json({ error: 'This email already has an account.' });
  const id = tx(() => { const o = run('INSERT INTO orgs(name) VALUES(?)', company).lastInsertRowid; return run("INSERT INTO users(org_id,name,email,pass_hash,role) VALUES(?,?,?,?,'admin')", o, name, email, hash(password)).lastInsertRowid; });
  startSession(res, id); res.json({ ok: true });
});
app.post('/api/logout', (req, res) => { const t = cookie(req).sid; if (t) run('DELETE FROM sessions WHERE token=?', t); res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0'); res.json({ ok: true }); });

const api = express.Router();
api.use(auth);
const ownEx = (req, id) => one('SELECT * FROM exhibitions WHERE id=? AND org_id=?', id, req.user.org_id);
const ownLead = (req, id) => one('SELECT * FROM leads WHERE id=? AND org_id=?', id, req.user.org_id);
const leadOut = l => l && ({ ...l, interests: J(l.interests), reasons: J(l.reasons), flags: J(l.flags) });
const str = (v, n = 300) => (v === undefined || v === null) ? null : String(v).slice(0, n);

api.get('/me', (req, res) => {
  const { pass_hash, ...u } = req.user;
  res.json({ user: u, org: { ...req.org, icp_sectors: J(req.org.icp_sectors), weights: req.org.weights ? JSON.parse(req.org.weights) : S.DEFAULT_WEIGHTS }, team: all('SELECT id,name,role,email,phone,active FROM users WHERE org_id=? ORDER BY name', req.user.org_id) });
});

// ---------- exhibitions & costs ----------
api.get('/exhibitions', (req, res) => {
  const ex = all('SELECT * FROM exhibitions WHERE org_id=? ORDER BY COALESCE(start_date, created_at) DESC', req.user.org_id);
  res.json(ex.map(e => { const r = I.roiFor(e); return { ...e, total_cost: r.total_cost, captured: r.captured, qualified: r.qualified, won: r.won, pipeline: r.pipeline, roi: r.roi, cpql: r.cpql }; }));
});
const EXF = ['name', 'venue', 'city', 'start_date', 'end_date', 'stand', 'size_m2', 'status', 'goal_qualified', 'goal_pipeline', 'goal_cpql', 'notes'];
api.post('/exhibitions', role('admin', 'manager'), (req, res) => {
  const b = req.body || {}; if (!b.name) return res.status(400).json({ error: 'Exhibition name is required.' });
  const id = run(`INSERT INTO exhibitions(org_id,${EXF.join(',')}) VALUES(?,${EXF.map(() => '?').join(',')})`, req.user.org_id, ...EXF.map(f => b[f] === '' ? null : (b[f] ?? (f === 'status' ? 'planning' : null)))).lastInsertRowid;
  res.json(one('SELECT * FROM exhibitions WHERE id=?', id));
});
api.get('/exhibitions/:id', (req, res) => {
  const e = ownEx(req, req.params.id); if (!e) return res.status(404).json({ error: 'Not found.' });
  const team = all(`SELECT u.id,u.name,u.role,COUNT(l.id) leads,SUM(CASE WHEN l.tier!='cold' THEN 1 ELSE 0 END) qualified FROM leads l JOIN users u ON u.id=l.created_by WHERE l.exhibition_id=? GROUP BY u.id ORDER BY leads DESC`, e.id);
  res.json({ ...I.roiFor(e), costs_detail: all('SELECT * FROM costs WHERE exhibition_id=? ORDER BY id', e.id), traffic: I.traffic(e.id), team });
});
api.put('/exhibitions/:id', role('admin', 'manager'), (req, res) => {
  const e = ownEx(req, req.params.id); if (!e) return res.status(404).json({ error: 'Not found.' });
  const b = { ...e, ...req.body };
  run(`UPDATE exhibitions SET ${EXF.map(f => f + '=?').join(',')} WHERE id=?`, ...EXF.map(f => b[f] === '' ? null : b[f]), e.id);
  res.json(one('SELECT * FROM exhibitions WHERE id=?', e.id));
});
api.delete('/exhibitions/:id', role('admin'), (req, res) => { const e = ownEx(req, req.params.id); if (!e) return res.status(404).json({ error: 'Not found.' }); run('DELETE FROM exhibitions WHERE id=?', e.id); res.json({ ok: true }); });
api.put('/exhibitions/:id/costs', role('admin', 'manager'), (req, res) => {
  const e = ownEx(req, req.params.id); if (!e) return res.status(404).json({ error: 'Not found.' });
  const lines = Array.isArray(req.body) ? req.body : [];
  tx(() => { run('DELETE FROM costs WHERE exhibition_id=?', e.id); for (const c of lines) if (c.category && Number(c.amount) >= 0) run('INSERT INTO costs(exhibition_id,category,label,amount) VALUES(?,?,?,?)', e.id, str(c.category, 60), str(c.label, 120), Number(c.amount) || 0); });
  res.json(all('SELECT * FROM costs WHERE exhibition_id=?', e.id));
});

// ---------- leads ----------
const LF = ['company', 'name', 'title', 'email', 'phone', 'sector', 'company_size', 'timeline', 'budget', 'authority', 'notes', 'next_step', 'next_due'];
function route(org, l) {
  // hot: sales person with the fewest open hot leads; warm: nurture by a manager or sales; cold: none.
  if (l.tier === 'cold') return { owner_id: null, next_step: 'No follow-up', next_due: null };
  const pool = all(`SELECT u.id, (SELECT COUNT(*) FROM leads x WHERE x.owner_id=u.id AND x.tier='hot' AND x.stage NOT IN ('won','lost')) open_hot FROM users u WHERE u.org_id=? AND u.active=1 AND u.role IN ('sales','manager','admin') ORDER BY CASE u.role WHEN 'sales' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, open_hot, u.id`, org.id);
  const owner = pool[0] ? pool[0].id : null;
  const due = new Date(Date.now() + (l.tier === 'hot' ? 1 : 3) * 864e5).toISOString().slice(0, 10);
  return { owner_id: owner, next_step: l.tier === 'hot' ? 'Call or WhatsApp within 24 hours' : 'Nurture: send material, follow up in 3 days', next_due: due };
}
function webhook(org, event, lead) {
  if (!org.webhook_url || !/^https:\/\//.test(org.webhook_url)) return;
  fetch(org.webhook_url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event, lead: leadOut(lead) }), signal: AbortSignal.timeout(5000) }).catch(() => {});
}
api.get('/leads', (req, res) => {
  const p = [req.user.org_id]; let w = 'l.org_id=?';
  if (req.query.exhibition) { w += ' AND l.exhibition_id=?'; p.push(req.query.exhibition); }
  if (req.query.tier) { w += ' AND l.tier=?'; p.push(req.query.tier); }
  if (req.query.mine === '1') { w += ' AND l.owner_id=?'; p.push(req.user.id); }
  if (req.user.role === 'staff') { w += ' AND l.created_by=?'; p.push(req.user.id); }
  const rows = all(`SELECT l.*, u.name owner_name, e.name exhibition_name FROM leads l LEFT JOIN users u ON u.id=l.owner_id LEFT JOIN exhibitions e ON e.id=l.exhibition_id WHERE ${w} ORDER BY l.score DESC, l.captured_at DESC LIMIT 5000`, ...p);
  res.json(rows.map(leadOut));
});
api.post('/leads', (req, res) => {
  const b = req.body || {};
  if (b.client_uid) { const dup = one('SELECT * FROM leads WHERE client_uid=? AND org_id=?', b.client_uid, req.user.org_id); if (dup) return res.json(leadOut(dup)); }
  if (b.exhibition_id && !ownEx(req, b.exhibition_id)) return res.status(400).json({ error: 'Unknown exhibition.' });
  if (!b.company && !b.name && !b.email && !b.phone) return res.status(400).json({ error: 'Add at least a name, company, email or phone.' });
  const ext = S.extract(b.notes || '', b.title || '');
  const l = { ...b }; for (const k of ['budget', 'timeline', 'authority', 'company_size', 'email', 'phone']) if (!l[k] && ext[k]) l[k] = ext[k];
  l.engagement = Math.max(Number(l.engagement) || 0, ext.engagement || 0);
  l.flags = [...new Set([...(Array.isArray(l.flags) ? l.flags : []), ...(ext.flags || [])])];
  const sc = S.score(l, req.org); const rt = route(req.org, sc);
  const id = run(`INSERT INTO leads(org_id,exhibition_id,created_by,owner_id,client_uid,captured_at,source,${LF.join(',')},interests,engagement,flags,score,tier,reasons)
    VALUES(?,?,?,?,?,COALESCE(?,datetime('now')),?,${LF.map(() => '?').join(',')},?,?,?,?,?,?)`,
    req.user.org_id, b.exhibition_id || null, req.user.id, rt.owner_id, str(b.client_uid, 64), str(b.captured_at, 25), str(b.source || 'form', 12),
    ...LF.map(f => f === 'next_step' ? rt.next_step : f === 'next_due' ? rt.next_due : str(l[f], f === 'notes' ? 4000 : 300)),
    JSON.stringify((l.interests || []).slice(0, 12)), l.engagement, JSON.stringify(l.flags), sc.score, sc.tier, JSON.stringify(sc.reasons)).lastInsertRowid;
  run("INSERT INTO activities(lead_id,user_id,type,body) VALUES(?,?,'captured',?)", id, req.user.id, `Captured via ${b.source || 'form'} · scored ${sc.score} (${sc.tier})`);
  const lead = one('SELECT l.*, u.name owner_name FROM leads l LEFT JOIN users u ON u.id=l.owner_id WHERE l.id=?', id); webhook(req.org, 'lead.created', lead);
  res.json(leadOut(lead));
});
api.get('/leads/:id', (req, res) => {
  const l = ownLead(req, req.params.id); if (!l) return res.status(404).json({ error: 'Not found.' });
  res.json({ ...leadOut(l), owner: l.owner_id ? one('SELECT id,name,phone FROM users WHERE id=?', l.owner_id) : null, exhibition: l.exhibition_id ? one('SELECT id,name FROM exhibitions WHERE id=?', l.exhibition_id) : null,
    activities: all('SELECT a.*, u.name user_name FROM activities a LEFT JOIN users u ON u.id=a.user_id WHERE lead_id=? ORDER BY a.at DESC, a.id DESC', l.id) });
});
api.put('/leads/:id', (req, res) => {
  const l = ownLead(req, req.params.id); if (!l) return res.status(404).json({ error: 'Not found.' });
  const b = req.body || {}; const m = { ...leadOut(l), ...b };
  const sc = S.score(m, req.org);
  const STAGES = ['new', 'contacted', 'meeting', 'proposal', 'won', 'lost'];
  const stage = STAGES.includes(m.stage) ? m.stage : l.stage;
  const won_at = stage === 'won' ? (l.won_at || new Date().toISOString().slice(0, 19).replace('T', ' ')) : null;
  const first = l.first_contact_at || (stage !== 'new' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null);
  run(`UPDATE leads SET ${LF.map(f => f + '=?').join(',')}, interests=?, engagement=?, flags=?, owner_id=?, stage=?, value=?, won_at=?, lost_reason=?, first_contact_at=?, score=?, tier=?, reasons=?, updated_at=datetime('now') WHERE id=?`,
    ...LF.map(f => str(m[f], f === 'notes' ? 4000 : 300)), JSON.stringify(m.interests || []), Number(m.engagement) || 0, JSON.stringify(m.flags || []),
    m.owner_id || null, stage, Number(m.value) || 0, won_at, str(m.lost_reason), first, sc.score, sc.tier, JSON.stringify(sc.reasons), l.id);
  if (stage !== l.stage) run('INSERT INTO activities(lead_id,user_id,type,body) VALUES(?,?,?,?)', l.id, req.user.id, 'stage', `Stage: ${l.stage} → ${stage}${stage === 'won' ? ` · SAR ${Number(m.value || 0).toLocaleString()}` : ''}`);
  if (sc.score !== l.score) run("INSERT INTO activities(lead_id,user_id,type,body) VALUES(?,?,'rescored',?)", l.id, req.user.id, `Re-scored ${l.score} → ${sc.score}`);
  const out = one('SELECT * FROM leads WHERE id=?', l.id); webhook(req.org, 'lead.updated', out); res.json(leadOut(out));
});
api.delete('/leads/:id', role('admin', 'manager'), (req, res) => { const l = ownLead(req, req.params.id); if (!l) return res.status(404).json({ error: 'Not found.' }); run('DELETE FROM leads WHERE id=?', l.id); res.json({ ok: true }); });
api.post('/leads/:id/activities', (req, res) => {
  const l = ownLead(req, req.params.id); if (!l) return res.status(404).json({ error: 'Not found.' });
  const { type = 'note', body = '' } = req.body || {};
  const T = ['note', 'call', 'whatsapp', 'email', 'meeting']; if (!T.includes(type)) return res.status(400).json({ error: 'Unknown activity type.' });
  run('INSERT INTO activities(lead_id,user_id,type,body) VALUES(?,?,?,?)', l.id, req.user.id, type, str(body, 2000));
  if (type !== 'note' && !l.first_contact_at) run("UPDATE leads SET first_contact_at=datetime('now'), stage=CASE WHEN stage='new' THEN 'contacted' ELSE stage END WHERE id=?", l.id);
  res.json({ ok: true });
});
api.post('/extract', (req, res) => res.json(S.extract(String(req.body?.text || ''), String(req.body?.title || ''))));

// CSV export
const csvCell = v => { const s = v === null || v === undefined ? '' : String(v); const safe = /^[=+\-@]/.test(s) ? "'" + s : s; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
api.get('/export/leads.csv', (req, res) => {
  const rows = all('SELECT l.*, e.name exhibition, u.name owner FROM leads l LEFT JOIN exhibitions e ON e.id=l.exhibition_id LEFT JOIN users u ON u.id=l.owner_id WHERE l.org_id=? ORDER BY l.captured_at', req.user.org_id);
  const cols = ['id', 'exhibition', 'captured_at', 'source', 'company', 'name', 'title', 'email', 'phone', 'sector', 'company_size', 'interests', 'timeline', 'budget', 'authority', 'score', 'tier', 'owner', 'stage', 'value', 'won_at', 'notes'];
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="bilievent-leads.csv"' });
  res.send('﻿' + [cols.join(','), ...rows.map(r => cols.map(c => csvCell(c === 'interests' ? J(r[c]).join('; ') : r[c])).join(','))].join('\n'));
});
// CSV import of CRM outcomes: email or company, stage, value, won_date
function parseCSV(t) { const rows = []; let row = [], cell = '', q = false; for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; } else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch; } if (cell || row.length) { row.push(cell); rows.push(row); } return rows.filter(r => r.some(c => c.trim())); }
api.post('/import/outcomes', role('admin', 'manager'), (req, res) => {
  const rows = parseCSV(String(req.body || '').replace(/^﻿/, '')); if (rows.length < 2) return res.status(400).json({ error: 'The CSV needs a header row and at least one row.' });
  const h = rows[0].map(x => x.trim().toLowerCase()); const ix = k => h.findIndex(x => x === k || x.includes(k));
  const iE = ix('email'), iC = ix('company'), iS = ix('stage'), iV = ix('value') >= 0 ? ix('value') : ix('amount'), iD = ix('date');
  if (iS < 0 || (iE < 0 && iC < 0)) return res.status(400).json({ error: 'Columns needed: email or company, and stage. Optional: value, won date.' });
  let matched = 0, unmatched = [];
  tx(() => { for (const r of rows.slice(1)) {
    const em = iE >= 0 ? r[iE].trim() : '', co = iC >= 0 ? r[iC].trim() : '';
    const l = (em && one('SELECT * FROM leads WHERE org_id=? AND email=? COLLATE NOCASE ORDER BY captured_at DESC', req.user.org_id, em)) || (co && one('SELECT * FROM leads WHERE org_id=? AND company=? COLLATE NOCASE ORDER BY score DESC', req.user.org_id, co));
    if (!l) { unmatched.push(em || co); continue; }
    let st = (r[iS] || '').trim().toLowerCase(); st = /won|closed won|فاز|مكتسب/.test(st) ? 'won' : /lost|closed lost|خسر/.test(st) ? 'lost' : /proposal|quote|عرض/.test(st) ? 'proposal' : /meeting|demo|اجتماع/.test(st) ? 'meeting' : 'contacted';
    const val = iV >= 0 ? Number(String(r[iV]).replace(/[^0-9.]/g, '')) || 0 : l.value; const wd = st === 'won' ? ((iD >= 0 && r[iD].trim()) || new Date().toISOString().slice(0, 10)) : null;
    run("UPDATE leads SET stage=?, value=?, won_at=?, first_contact_at=COALESCE(first_contact_at,datetime('now')), updated_at=datetime('now') WHERE id=?", st, val, wd, l.id);
    run("INSERT INTO activities(lead_id,user_id,type,body) VALUES(?,?,'crm',?)", l.id, req.user.id, `CRM import: ${st}${val ? ` · SAR ${val.toLocaleString()}` : ''}`); matched++;
  } });
  res.json({ matched, unmatched: unmatched.length, unmatched_sample: unmatched.slice(0, 10) });
});

// ---------- dashboards, improvements, learning ----------
api.get('/overview', (req, res) => {
  const exs = all('SELECT * FROM exhibitions WHERE org_id=? ORDER BY COALESCE(start_date,created_at) DESC', req.user.org_id);
  const cur = req.query.exhibition ? ownEx(req, req.query.exhibition) : (exs.find(e => e.status === 'live') || exs.find(e => e.status === 'measured') || exs[0]);
  const series = exs.slice().reverse().map(e => { const r = I.roiFor(e); return { id: e.id, name: e.name, start_date: e.start_date, cpql: r.cpql, roi: r.roi, qualified: r.qualified, won: r.won, total_cost: r.total_cost }; });
  res.json({ current: cur ? { ...I.roiFor(cur), d30: I.roiFor(cur, 30), d90: I.roiFor(cur, 90) } : null, series,
    hot_today: all("SELECT l.*, u.name owner_name FROM leads l LEFT JOIN users u ON u.id=l.owner_id WHERE l.org_id=? AND l.tier='hot' AND l.stage IN ('new','contacted') ORDER BY l.next_due, l.score DESC LIMIT 6", req.user.org_id).map(leadOut),
    improvements: cur ? all("SELECT * FROM improvements WHERE exhibition_id=? AND status!='rejected' ORDER BY id LIMIT 3", cur.id) : [] });
});
api.post('/exhibitions/:id/recommend', (req, res) => { const e = ownEx(req, req.params.id); if (!e) return res.status(404).json({ error: 'Not found.' }); res.json(I.recommend(e, req.user.org_id)); });
api.get('/improvements', (req, res) => res.json(all('SELECT i.*, e.name exhibition_name FROM improvements i JOIN exhibitions e ON e.id=i.exhibition_id WHERE i.org_id=? ORDER BY e.start_date DESC, i.id', req.user.org_id)));
api.put('/improvements/:id', role('admin', 'manager'), (req, res) => {
  const i = one('SELECT * FROM improvements WHERE id=? AND org_id=?', req.params.id, req.user.org_id); if (!i) return res.status(404).json({ error: 'Not found.' });
  const st = ['proposed', 'approved', 'in_delivery', 'delivered', 'rejected']; const s = req.body?.status;
  if (!st.includes(s)) return res.status(400).json({ error: 'Unknown status.' });
  run('UPDATE improvements SET status=? WHERE id=?', s, i.id); res.json(one('SELECT * FROM improvements WHERE id=?', i.id));
});
api.post('/model/learn', role('admin'), (req, res) => {
  const leads = all('SELECT * FROM leads WHERE org_id=?', req.user.org_id);
  const r = S.learn(leads, req.org.weights ? JSON.parse(req.org.weights) : S.DEFAULT_WEIGHTS);
  if (r.changed) { run('UPDATE orgs SET weights=? WHERE id=?', JSON.stringify(r.weights), req.user.org_id); const org = one('SELECT * FROM orgs WHERE id=?', req.user.org_id);
    tx(() => { for (const l of leads) { const s = S.score(leadOut(l), org); run('UPDATE leads SET score=?, tier=?, reasons=? WHERE id=?', s.score, s.tier, JSON.stringify(s.reasons), l.id); } }); }
  res.json(r);
});
api.post('/model/reset', role('admin'), (req, res) => { run('UPDATE orgs SET weights=NULL WHERE id=?', req.user.org_id); res.json({ ok: true }); });

// ---------- settings & team ----------
api.put('/org', role('admin'), (req, res) => {
  const b = req.body || {}; const o = req.org;
  if (b.webhook_url && !/^https:\/\//.test(b.webhook_url)) return res.status(400).json({ error: 'Webhook must be an https:// address.' });
  run('UPDATE orgs SET name=?, icp_sectors=?, webhook_url=?, hot_threshold=?, warm_threshold=? WHERE id=?', str(b.name ?? o.name, 120), JSON.stringify(b.icp_sectors ?? J(o.icp_sectors)), b.webhook_url ?? o.webhook_url, Math.max(50, Math.min(95, Number(b.hot_threshold ?? o.hot_threshold))), Math.max(10, Math.min(70, Number(b.warm_threshold ?? o.warm_threshold))), o.id);
  res.json({ ok: true });
});
api.post('/users', role('admin'), (req, res) => {
  const { name, email, role: r = 'sales', phone } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });
  if (!['admin', 'manager', 'sales', 'staff'].includes(r)) return res.status(400).json({ error: 'Unknown role.' });
  if (one('SELECT id FROM users WHERE email=?', email)) return res.status(409).json({ error: 'This email already has an account.' });
  const temp = crypto.randomBytes(6).toString('base64url');
  run('INSERT INTO users(org_id,name,email,pass_hash,role,phone) VALUES(?,?,?,?,?,?)', req.user.org_id, str(name, 80), str(email, 120), hash(temp), r, str(phone, 30));
  res.json({ ok: true, temporary_password: temp });
});
api.put('/users/:id', role('admin'), (req, res) => {
  const u = one('SELECT * FROM users WHERE id=? AND org_id=?', req.params.id, req.user.org_id); if (!u) return res.status(404).json({ error: 'Not found.' });
  const b = req.body || {}; if (u.id === req.user.id && (b.active === 0 || (b.role && b.role !== 'admin'))) return res.status(400).json({ error: 'You cannot remove your own admin access.' });
  run('UPDATE users SET role=?, active=?, phone=? WHERE id=?', b.role || u.role, b.active ?? u.active, b.phone ?? u.phone, u.id); res.json({ ok: true });
});
api.post('/password', (req, res) => {
  const { current, next } = req.body || {}; if (String(next || '').length < 8) return res.status(400).json({ error: 'Use at least 8 characters.' });
  if (!verify(String(current || ''), req.user.pass_hash)) return res.status(400).json({ error: 'Current password is incorrect.' });
  run('UPDATE users SET pass_hash=? WHERE id=?', hash(next), req.user.id); res.json({ ok: true });
});

// ---------- optional AI (Claude) for business-card reading ----------
api.post('/ai/card', async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY; if (!key) return res.status(501).json({ error: 'Card reading needs an AI key on the server (ANTHROPIC_API_KEY). Type the details instead.' });
  const img = String(req.body?.image || ''); const m = img.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/); if (!m) return res.status(400).json({ error: 'Send a JPEG or PNG photo.' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 400, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }, { type: 'text', text: 'Read this business card (Arabic or English). Reply with JSON only: {"name","title","company","email","phone","sector"}. Use null when missing.' }] }] }) });
    const j = await r.json(); const t = (j.content || []).map(c => c.text || '').join(''); const o = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); res.json(o);
  } catch { res.status(502).json({ error: 'Could not read the card. Type the details instead.' }); }
});

app.use('/api', api);
app.get('/health', (req, res) => res.json({ ok: true }));
const pub = path.join(__dirname, '..', 'public');
app.use(express.static(pub, { maxAge: '1h', setHeaders: (res, p) => { if (p.endsWith('sw.js') || p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(pub, 'index.html')));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Something went wrong. Please try again.' }); });

if (require.main === module) { const port = Number(process.env.PORT) || 8080; app.listen(port, () => console.log(`Bilievent ROI listening on :${port}`)); }
module.exports = { app, hash };
