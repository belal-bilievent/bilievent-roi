// API tests on a fresh temporary database: auth, tenancy, scoring, routing, ROI, import, improvements.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os'), path = require('node:path'), fs = require('node:fs');
process.env.DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'roi-')), 't.db');
const { run } = require('../src/db');
const { app, hash } = require('../src/server');
const S = require('../src/scoring');

let base, srv;
const jar = {};
async function call(who, method, url, body, csv) {
  const r = await fetch(base + url, { method, headers: { ...(body !== undefined ? { 'content-type': csv ? 'text/csv' : 'application/json' } : {}), ...(jar[who] ? { cookie: jar[who] } : {}) }, body: body === undefined ? undefined : csv ? body : JSON.stringify(body) });
  const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0];
  const ct = r.headers.get('content-type') || ''; return { status: r.status, body: ct.includes('json') ? await r.json() : await r.text() };
}
test.before(async () => {
  const a = run("INSERT INTO orgs(name,icp_sectors) VALUES('Org A','[\"Hospitals\"]')").lastInsertRowid;
  const b = run("INSERT INTO orgs(name) VALUES('Org B')").lastInsertRowid;
  run("INSERT INTO users(org_id,name,email,pass_hash,role) VALUES(?,?,?,?,?)", a, 'Admin A', 'a@test.sa', hash('password-a'), 'admin');
  run("INSERT INTO users(org_id,name,email,pass_hash,role) VALUES(?,?,?,?,?)", a, 'Sales A', 's@test.sa', hash('password-s'), 'sales');
  run("INSERT INTO users(org_id,name,email,pass_hash,role) VALUES(?,?,?,?,?)", b, 'Admin B', 'b@test.sa', hash('password-b'), 'admin');
  await new Promise(r => { srv = app.listen(0, () => { base = 'http://127.0.0.1:' + srv.address().port; r(); }); });
});
test.after(() => srv.close());

test('login required and wrong password rejected', async () => {
  assert.equal((await call('x', 'GET', '/api/me')).status, 401);
  assert.equal((await call('x', 'POST', '/api/login', { email: 'a@test.sa', password: 'nope' })).status, 401);
  assert.equal((await call('a', 'POST', '/api/login', { email: 'a@test.sa', password: 'password-a' })).status, 200);
  assert.equal((await call('a', 'GET', '/api/me')).body.user.email, 'a@test.sa');
});
test('non-JSON writes are refused (CSRF guard)', async () => {
  const r = await fetch(base + '/api/exhibitions', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: jar.a }, body: 'name=x' });
  assert.equal(r.status, 415);
});
let exId, hotId;
test('exhibition, costs, capture, scoring and routing', async () => {
  exId = (await call('a', 'POST', '/api/exhibitions', { name: 'Test Expo', start_date: '2026-01-10', end_date: '2026-01-12', goal_cpql: 500 })).body.id;
  await call('a', 'PUT', `/api/exhibitions/${exId}/costs`, [{ category: 'Space rental', amount: 60000 }, { category: 'Build', amount: 40000 }]);
  const hot = (await call('a', 'POST', '/api/leads', { exhibition_id: exId, name: 'Dr. Hot', title: 'Procurement Director', company: 'Hospital group', sector: 'Hospitals', email: 'hot@x.sa', phone: '0551234567', notes: 'Budget approved, wants a quote this month', company_size: 'large', engagement: 3, interests: ['Imaging'] })).body;
  assert.equal(hot.tier, 'hot'); assert.ok(hot.score >= 70); assert.ok(hot.reasons.find(r => r.label === 'Budget approved'));
  assert.ok(hot.owner_id, 'hot lead is routed to an owner'); hotId = hot.id;
  const cold = (await call('a', 'POST', '/api/leads', { exhibition_id: exId, name: 'Student', notes: 'student looking for a job' })).body;
  assert.equal(cold.tier, 'cold'); assert.ok(cold.score <= 15); assert.equal(cold.owner_id, null);
  const ar = (await call('a', 'POST', '/api/leads', { exhibition_id: exId, name: 'عميل', title: 'مدير المشتريات', notes: 'الميزانية معتمدة ونحتاج عرض سعر هذا الشهر' })).body;
  assert.equal(ar.budget, 'approved'); assert.equal(ar.timeline, 'now'); assert.equal(ar.authority, 'decision_maker');
});
test('offline duplicates are ignored by client_uid', async () => {
  const b = { exhibition_id: exId, name: 'Dup', client_uid: 'uid-123' };
  const a1 = (await call('a', 'POST', '/api/leads', b)).body, a2 = (await call('a', 'POST', '/api/leads', b)).body;
  assert.equal(a1.id, a2.id);
});
test('tenancy: org B cannot see or edit org A data', async () => {
  await call('b', 'POST', '/api/login', { email: 'b@test.sa', password: 'password-b' });
  assert.equal((await call('b', 'GET', `/api/leads/${hotId}`)).status, 404);
  assert.equal((await call('b', 'PUT', `/api/leads/${hotId}`, { stage: 'won' })).status, 404);
  assert.equal((await call('b', 'GET', '/api/leads')).body.length, 0);
  assert.equal((await call('b', 'GET', `/api/exhibitions/${exId}`)).status, 404);
});
test('roles: sales cannot change budgets or settings', async () => {
  await call('s', 'POST', '/api/login', { email: 's@test.sa', password: 'password-s' });
  assert.equal((await call('s', 'PUT', `/api/exhibitions/${exId}/costs`, [])).status, 403);
  assert.equal((await call('s', 'PUT', '/api/org', { name: 'x' })).status, 403);
});
test('won deal flows into ROI; CRM import attributes revenue', async () => {
  await call('a', 'PUT', `/api/leads/${hotId}`, { stage: 'won', value: 150000 });
  let r = (await call('a', 'GET', `/api/exhibitions/${exId}`)).body;
  assert.equal(r.total_cost, 100000); assert.equal(r.won, 150000); assert.equal(r.roi, 1.5);
  const imp = (await call('a', 'POST', '/api/import/outcomes', 'email,stage,value,won date\nhot@x.sa,Closed Won,250000,2026-02-01\nnobody@x.sa,won,1,2026-02-01\n', true)).body;
  assert.equal(imp.matched, 1); assert.equal(imp.unmatched, 1);
  r = (await call('a', 'GET', `/api/exhibitions/${exId}`)).body; assert.equal(r.won, 250000);
});
test('CSV export neutralises formulas', async () => {
  await call('a', 'POST', '/api/leads', { exhibition_id: exId, name: '=HYPERLINK("x")' });
  const csv = (await call('a', 'GET', '/api/export/leads.csv')).body;
  assert.ok(csv.includes("'=HYPERLINK")); assert.ok(!/,=HYPERLINK/.test(csv));
});
test('improvement engine proposes changes from data', async () => {
  for (let i = 0; i < 12; i++) await call('a', 'POST', '/api/leads', { exhibition_id: exId, name: 'Visitor ' + i, captured_at: `2026-01-10 ${String(7 + (i % 3)).padStart(2, '0')}:10:00`, interests: ['Imaging'] });
  const recs = (await call('a', 'POST', `/api/exhibitions/${exId}/recommend`, {})).body;
  assert.ok(Array.isArray(recs) && recs.length >= 1);
  assert.equal((await call('a', 'PUT', `/api/improvements/${recs[0].id}`, { status: 'approved' })).body.status, 'approved');
});
test('learning needs enough closed outcomes', () => {
  const r = S.learn([{ stage: 'won' }]); assert.equal(r.changed, false);
  const leads = []; for (let i = 0; i < 60; i++) leads.push({ stage: i % 3 === 0 ? 'won' : 'lost', budget: i % 3 === 0 ? 'approved' : 'none', authority: 'influencer', timeline: 'year', company_size: 'mid' });
  const r2 = S.learn(leads); assert.ok(r2.changed); assert.ok(r2.weights.budget.approved > S.DEFAULT_WEIGHTS.budget.approved);
});
