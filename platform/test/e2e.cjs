// Browser walk-through of every screen. Run with the server on :8080 and seeded demo data.
const { chromium } = require('playwright');
const OUT = process.argv[2] || '/tmp/roi-e2e';
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const B = 'http://localhost:8080/';
  const shot = async n => { await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}/${n}.png` }); };
  await p.goto(B); await p.waitForSelector('#lf'); await shot('01-login');
  await p.fill('#em', 'demo@bilievent.com'); await p.fill('#pw', 'wrong'); await p.click('#lf button'); await p.waitForTimeout(400);
  const err = await p.textContent('#err');
  await p.fill('#pw', 'BilieventDemo2026'); await p.click('#lf button'); await p.waitForSelector('#kp .kpi'); await shot('02-overview');
  await p.click('[data-w=d30]'); const d30 = await p.textContent('#kp .ink .v');
  await p.goto(B + '#/exhibitions'); await p.waitForSelector('table.t tbody tr'); await shot('03-exhibitions');
  await p.click('table.t tbody tr:first-child a'); await p.waitForSelector('#cf'); await shot('04-exhibition');
  await p.goto(B + '#/capture'); await p.waitForSelector('#cap');
  await p.fill('#c-name', 'Dr. Test Visitor'); await p.fill('#c-title', 'Procurement Director'); await p.fill('#c-company', 'Hospital group · Riyadh'); await p.fill('#c-email', 'test@visitor.sa'); await p.fill('#c-phone', '0550000000');
  await p.click('#ints button >> nth=0'); await p.fill('#c-notes', 'الميزانية معتمدة ونحتاج عرض سعر هذا الشهر'); await p.click('#c-company'); await p.waitForTimeout(500);
  await shot('05-capture-filled'); await p.click('#cap button.btn:has-text("Save and score")'); await p.waitForSelector('#feed tr.hlrow'); await shot('06-capture-saved');
  const saved = await p.textContent('#feed tr.hlrow');
  await p.goto(B + '#/leads'); await p.waitForSelector('#lt tr'); await p.click('[data-t=hot]'); await p.fill('#lq', 'Test Visitor'); await p.waitForTimeout(300); await shot('07-leads');
  const found = await p.textContent('#cnt');
  await p.click('#lt tr:first-child a'); await p.waitForSelector('#lfm'); await shot('08-lead');
  await p.click('#stg [data-s=won]'); await p.fill('#l-value', '120000'); await p.click('#lfm button.btn'); await p.waitForTimeout(800);
  const timeline = await p.textContent('.tl');
  await p.goto(B + '#/roi'); await p.waitForSelector('.donut'); await shot('09-roi');
  await p.goto(B + '#/improvements'); await p.waitForSelector('.rec'); await shot('10-improvements');
  await p.selectOption('select[data-id] >> nth=0', 'approved'); await p.waitForTimeout(400);
  await p.goto(B + '#/report/5'); await p.waitForSelector('.report'); await shot('11-report');
  await p.goto(B + '#/settings'); await p.waitForSelector('#of'); await shot('12-settings');
  await p.click('#learn'); await p.waitForTimeout(1200); const learn = await p.textContent('#lr');
  // offline capture
  await p.goto(B + '#/capture'); await p.waitForSelector('#cap'); await p.context().setOffline(true);
  await p.fill('#c-name', 'Offline Visitor'); await p.click('#cap button.btn:has-text("Save and score")'); await p.waitForTimeout(300);
  const q = await p.evaluate(() => JSON.parse(localStorage.getItem('roi.queue') || '[]').length); await shot('13-offline');
  await p.context().setOffline(false); await p.evaluate(() => dispatchEvent(new Event('online'))); await p.waitForTimeout(1500);
  const q2 = await p.evaluate(() => JSON.parse(localStorage.getItem('roi.queue') || '[]').length);
  // mobile
  const m = await b.newPage({ viewport: { width: 390, height: 844 } }); await m.context().addCookies(await p.context().cookies());
  await m.goto(B + '#/capture'); await m.waitForSelector('#cap'); await m.waitForTimeout(400); await m.screenshot({ path: `${OUT}/14-mobile-capture.png`, fullPage: true });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth);
  console.log(JSON.stringify({ loginError: err, d30, saved, found, timelineHasWon: /won/.test(timeline), learn, offlineQueued: q, afterSync: q2, mobileWidth: overflow, errors: errs }, null, 1));
  await b.close();
})();
