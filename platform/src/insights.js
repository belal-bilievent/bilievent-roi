// ROI attribution and the improvement engine.
const { all, one, run, J } = require('./db');

const OPEN_PIPE = ['meeting', 'proposal', 'won'];
const day = d => (d ? new Date(d.replace(' ', 'T') + (d.length <= 19 && !d.endsWith('Z') ? 'Z' : '')) : null);
const hoursBetween = (a, b) => (day(b) - day(a)) / 36e5;

function roiFor(ex, windowDays) {
  const leads = all('SELECT * FROM leads WHERE exhibition_id=?', ex.id);
  const costs = all('SELECT category, SUM(amount) amount FROM costs WHERE exhibition_id=? GROUP BY category ORDER BY amount DESC', ex.id);
  const total_cost = costs.reduce((s, c) => s + c.amount, 0);
  const end = ex.end_date || ex.start_date;
  const cutoff = windowDays && end ? new Date(day(end).getTime() + windowDays * 864e5) : null;
  const inWin = l => !cutoff || (l.won_at && day(l.won_at) <= cutoff);
  const captured = leads.length;
  const hot = leads.filter(l => l.tier === 'hot').length, warm = leads.filter(l => l.tier === 'warm').length;
  const qualified = hot + warm;
  const opps = leads.filter(l => OPEN_PIPE.includes(l.stage));
  const pipeline = opps.reduce((s, l) => s + (l.value || 0), 0);
  const wonL = leads.filter(l => l.stage === 'won' && inWin(l));
  const won = wonL.reduce((s, l) => s + (l.value || 0), 0);
  const contacted = leads.filter(l => l.first_contact_at && l.tier === 'hot');
  const within24 = contacted.filter(l => hoursBetween(l.captured_at, l.first_contact_at) <= 24).length;
  const resp = contacted.length ? contacted.reduce((s, l) => s + Math.max(0, hoursBetween(l.captured_at, l.first_contact_at)), 0) / contacted.length : null;
  return {
    exhibition: ex, total_cost, costs, captured, hot, warm, cold: captured - qualified, qualified,
    opportunities: opps.length, pipeline, won_count: wonL.length, won,
    roi: total_cost ? won / total_cost : null, cpql: qualified ? total_cost / qualified : null,
    cost_per_visitor: captured ? total_cost / captured : null, cost_per_won: wonL.length ? total_cost / wonL.length : null,
    avg_deal: wonL.length ? won / wonL.length : null, hot_contacted_24h: hot ? within24 / hot : null, avg_response_hours: resp,
    goals: { qualified: ex.goal_qualified, pipeline: ex.goal_pipeline, cpql: ex.goal_cpql },
  };
}

function traffic(exId) {
  const rows = all("SELECT captured_at, tier FROM leads WHERE exhibition_id=? AND source!='import'", exId);
  const byHour = {}, byDay = {};
  for (const r of rows) { const d = day(r.captured_at); if (!d) continue; const h = (d.getUTCHours() + 3) % 24; byHour[h] = (byHour[h] || 0) + 1; const k = d.toISOString().slice(0, 10); byDay[k] = byDay[k] || { all: 0, hot: 0 }; byDay[k].all++; if (r.tier === 'hot') byDay[k].hot++; }
  return { byHour, byDay };
}

// Improvement engine: each rule reads the show's own data and proposes a change Bilievent can deliver.
function recommend(ex, orgId) {
  const r = roiFor(ex);
  const leads = all('SELECT * FROM leads WHERE exhibition_id=?', ex.id);
  if (leads.length < 10) return [];
  const t = traffic(ex.id);
  const recs = [];
  const pct = x => Math.round(x * 100) + '%';
  if (r.hot && r.hot_contacted_24h !== null && r.hot_contacted_24h < 0.85) {
    const fast = leads.filter(l => l.first_contact_at && hoursBetween(l.captured_at, l.first_contact_at) <= 24 && ['won', 'lost'].includes(l.stage));
    const slow = leads.filter(l => l.first_contact_at && hoursBetween(l.captured_at, l.first_contact_at) > 24 && ['won', 'lost'].includes(l.stage));
    const wr = a => a.length ? a.filter(l => l.stage === 'won').length / a.length : null;
    const extra = wr(fast) !== null && wr(slow) !== null && wr(slow) > 0 ? ` Leads contacted within 24 hours closed at ${(wr(fast) / wr(slow)).toFixed(1)}× the rate of slower ones.` : '';
    recs.push({ rule_key: 'followup24', category: 'Follow-up', title: '24-hour follow-up rule for hot leads', rationale: `Only ${pct(r.hot_contacted_24h)} of hot leads were contacted within 24 hours.${extra}`, expected: 'Higher close rate on hot leads' });
  }
  const hours = Object.entries(t.byHour).map(([h, n]) => [Number(h), n]);
  if (hours.length >= 4) {
    const avg = hours.reduce((s, [, n]) => s + n, 0) / hours.length; const peak = hours.sort((a, b) => b[1] - a[1])[0];
    if (peak[1] > avg * 1.6) recs.push({ rule_key: 'peakstaff', category: 'Staffing', title: `Add stand staff around ${peak[0]}:00`, rationale: `Captures peak at ${peak[0]}:00 with ${peak[1]} visitors, ${(peak[1] / avg).toFixed(1)}× the hourly average. Visitors wait when the team is fixed all day.`, expected: 'Shorter waits, more qualified conversations' });
  }
  const days = Object.entries(t.byDay).sort(); const totalHot = days.reduce((s, [, v]) => s + v.hot, 0);
  if (days.length >= 2 && totalHot >= 5 && days[0][1].hot / totalHot >= 0.4) recs.push({ rule_key: 'day1', category: 'Staffing', title: 'Put your strongest specialists on day 1', rationale: `${pct(days[0][1].hot / totalHot)} of hot leads arrived on the first day.`, expected: 'More hot leads handled by senior staff' });
  const ints = {}; leads.filter(l => l.tier !== 'cold').forEach(l => J(l.interests).forEach(i => { ints[i] = (ints[i] || 0) + 1; }));
  const top = Object.entries(ints).sort((a, b) => b[1] - a[1]);
  if (top.length >= 2 && r.qualified && top[0][1] / r.qualified >= 0.35) recs.push({ rule_key: 'hero', category: 'Content', title: `Make "${top[0][0]}" the hero of the stand`, rationale: `${pct(top[0][1] / r.qualified)} of qualified leads asked about ${top[0][0]}, yet it shares space with every other product.`, expected: 'More demos of the product buyers came for' });
  if (r.captured && r.cold / r.captured >= 0.6) recs.push({ rule_key: 'invite', category: 'Activation', title: 'Pre-show invitations to target accounts', rationale: `${pct(r.cold / r.captured)} of captured visitors were cold. Inviting target accounts before the show raises the share of qualified visits.`, expected: 'Higher share of qualified visitors' });
  const manual = leads.filter(l => l.source === 'form').length;
  if (leads.length && manual / leads.length > 0.7) recs.push({ rule_key: 'capture', category: 'Capture', title: 'Switch the team to badge and QR capture', rationale: `${pct(manual / leads.length)} of leads were typed by hand, which slows the stand and loses contact details.`, expected: 'Faster capture, complete contact data' });
  if (r.cpql && ex.goal_cpql && r.cpql > ex.goal_cpql * 1.15) {
    const big = r.costs[0];
    recs.push({ rule_key: 'cost', category: 'Budget', title: `Review ${big ? big.category.toLowerCase() : 'the largest cost line'}`, rationale: `Cost per qualified lead was SAR ${Math.round(r.cpql).toLocaleString()} against a goal of SAR ${Math.round(ex.goal_cpql).toLocaleString()}.${big ? ` ${big.category} was the largest cost at SAR ${Math.round(big.amount).toLocaleString()}.` : ''}`, expected: 'Lower cost per qualified lead' });
  }
  for (const x of recs) run(`INSERT INTO improvements(org_id,exhibition_id,rule_key,title,rationale,category,expected) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(exhibition_id,rule_key) DO UPDATE SET title=excluded.title, rationale=excluded.rationale, expected=excluded.expected`, orgId, ex.id, x.rule_key, x.title, x.rationale, x.category, x.expected);
  return all('SELECT * FROM improvements WHERE exhibition_id=? ORDER BY id', ex.id);
}

module.exports = { roiFor, traffic, recommend, day, hoursBetween };
