// Explainable lead scoring. Every point in the score comes from a named factor,
// and the weights are recalibrated from each organisation's won and lost leads.

const DEFAULT_WEIGHTS = {
  authority: { decision_maker: 26, influencer: 15, user: 6, unknown: 0 },
  budget: { approved: 22, planned: 12, none: 0, unknown: 4 },
  timeline: { now: 20, quarter: 16, year: 8, exploring: 2, unknown: 3 },
  size: { enterprise: 10, large: 8, mid: 6, small: 3, unknown: 2 },
  engagement: { 0: 0, 1: 4, 2: 8, 3: 12 },
  icp_sector: 6,
  contact_complete: 4,
};
const LABEL = {
  authority: { decision_maker: 'Decision-maker', influencer: 'Influences the decision', user: 'End user', unknown: 'Role not known' },
  budget: { approved: 'Budget approved', planned: 'Budget planned', none: 'No budget', unknown: 'Budget not known' },
  timeline: { now: 'Buying now', quarter: 'Buying this quarter', year: 'Buying this year', exploring: 'Exploring', unknown: 'Timeline not known' },
  size: { enterprise: 'Enterprise company', large: 'Large company', mid: 'Mid-size company', small: 'Small company', unknown: 'Company size not known' },
  engagement: { 0: 'Brief visit', 1: 'Asked questions', 2: 'Saw a demo', 3: 'Requested meeting or quote' },
};
const MAX = () => 26 + 22 + 20 + 10 + 12 + 6 + 4; // 100

function weightsFor(org) {
  try { const w = org && org.weights ? JSON.parse(org.weights) : null; return w || DEFAULT_WEIGHTS; } catch { return DEFAULT_WEIGHTS; }
}

function score(lead, org) {
  const w = weightsFor(org);
  const reasons = [];
  const add = (factor, key, pts) => { if (pts) reasons.push({ factor, key, label: (LABEL[factor] && LABEL[factor][key]) || key, points: Math.round(pts) }); return pts || 0; };
  let s = 0;
  s += add('authority', lead.authority || 'unknown', w.authority[lead.authority || 'unknown'] ?? 0);
  s += add('budget', lead.budget || 'unknown', w.budget[lead.budget || 'unknown'] ?? 0);
  s += add('timeline', lead.timeline || 'unknown', w.timeline[lead.timeline || 'unknown'] ?? 0);
  s += add('size', lead.company_size || 'unknown', w.size[lead.company_size || 'unknown'] ?? 0);
  const eg = Math.max(0, Math.min(3, Number(lead.engagement) || 0));
  s += add('engagement', String(eg), w.engagement[eg] ?? 0);
  let icp = [];
  try { icp = JSON.parse(org?.icp_sectors || '[]'); } catch {}
  if (lead.sector && icp.some(x => x.toLowerCase() === String(lead.sector).toLowerCase())) { s += w.icp_sector; reasons.push({ factor: 'icp', key: 'match', label: `Target sector: ${lead.sector}`, points: w.icp_sector }); }
  if (lead.email && lead.phone) { s += w.contact_complete; reasons.push({ factor: 'contact', key: 'complete', label: 'Email and mobile captured', points: w.contact_complete }); }
  let flags = []; try { flags = Array.isArray(lead.flags) ? lead.flags : JSON.parse(lead.flags || '[]'); } catch {}
  let final = Math.round(Math.max(0, Math.min(100, (s / MAX()) * 100)));
  if (flags.includes('competitor') || flags.includes('student')) { final = Math.min(final, 15); reasons.push({ factor: 'flag', key: flags.join(','), label: flags.includes('competitor') ? 'Competitor: capped' : 'Student or job seeker: capped', points: 0 }); }
  const hot = org?.hot_threshold ?? 70, warm = org?.warm_threshold ?? 55;
  const tier = final >= hot ? 'hot' : final >= warm ? 'warm' : 'cold';
  reasons.sort((a, b) => b.points - a.points);
  return { score: final, tier, reasons };
}

// ---- extraction from free notes (Arabic and English), no external service needed ----
const RX = {
  budget_approved: /(budget (is )?(approved|allocated|confirmed)|approved budget|الميزانية (معتمدة|موجودة|متوفرة)|ميزانية معتمدة|تم اعتماد الميزانية)/i,
  budget_planned: /(budget (planned|next year|in planning)|planning (a )?budget|ميزانية (مخططة|السنة القادمة)|نخطط للميزانية)/i,
  budget_none: /(no budget|without budget|لا توجد ميزانية|ما عندنا ميزانية|بدون ميزانية)/i,
  now: /(urgent|asap|this month|immediately|this week|عاجل|هذا الشهر|فوراً|فورا|هذا الأسبوع)/i,
  quarter: /(this quarter|next (month|quarter)|within 3 months|q[1-4]|هذا الربع|الشهر القادم|خلال ثلاثة أشهر|خلال 3 أشهر)/i,
  year: /(this year|next year|later this year|هذه السنة|السنة القادمة|هذا العام|العام القادم)/i,
  exploring: /(just looking|exploring|researching|نستكشف|نتعرف|مجرد اطلاع)/i,
  decision: /(\bceo\b|\bcfo\b|\bcoo\b|founder|owner|director|head of|general manager|\bvp\b|procurement|مدير|رئيس|مالك|المؤسس|المشتريات)/i,
  influencer: /(manager|lead|specialist|engineer|consultant|supervisor|مشرف|أخصائي|مهندس|مستشار)/i,
  meeting: /(demo|meeting|quote|proposal|call (me|back)|visit us|عرض سعر|اجتماع|موعد|زيارة|عرض توضيحي|ديمو)/i,
  competitor: /(competitor|منافس)/i,
  student: /(student|job seeker|looking for (a )?job|cv|طالب|أبحث عن وظيفة|سيرة ذاتية)/i,
  enterprise: /(group|holding|ministry|government|hospital group|مجموعة|وزارة|حكومي|شركة قابضة)/i,
};
function extract(text = '', title = '') {
  const t = `${text} ${title}`;
  const out = {};
  if (RX.budget_approved.test(t)) out.budget = 'approved'; else if (RX.budget_none.test(t)) out.budget = 'none'; else if (RX.budget_planned.test(t)) out.budget = 'planned';
  if (RX.now.test(t)) out.timeline = 'now'; else if (RX.quarter.test(t)) out.timeline = 'quarter'; else if (RX.year.test(t)) out.timeline = 'year'; else if (RX.exploring.test(t)) out.timeline = 'exploring';
  if (RX.decision.test(title || t)) out.authority = 'decision_maker'; else if (RX.influencer.test(title || t)) out.authority = 'influencer';
  if (RX.meeting.test(t)) out.engagement = 3;
  if (RX.enterprise.test(t)) out.company_size = 'enterprise';
  const flags = []; if (RX.competitor.test(t)) flags.push('competitor'); if (RX.student.test(t)) flags.push('student');
  if (flags.length) out.flags = flags;
  const em = t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/); if (em) out.email = em[0];
  const ph = t.match(/(\+?966|0)5\d[\s-]?\d{3}[\s-]?\d{4}/); if (ph) out.phone = ph[0].replace(/[\s-]/g, '');
  return out;
}

// ---- learning: recalibrate weights from closed outcomes ----
function learn(leads, current = DEFAULT_WEIGHTS) {
  const closed = leads.filter(l => l.stage === 'won' || l.stage === 'lost');
  if (closed.length < 20) return { weights: current, changed: false, reason: `Needs at least 20 closed leads (has ${closed.length}).` };
  const base = closed.filter(l => l.stage === 'won').length / closed.length || 0.0001;
  const w = JSON.parse(JSON.stringify(current));
  const changes = [];
  for (const [factor, field] of [['authority', 'authority'], ['budget', 'budget'], ['timeline', 'timeline'], ['size', 'company_size']]) {
    for (const key of Object.keys(w[factor])) {
      const grp = closed.filter(l => (l[field] || 'unknown') === key);
      if (grp.length < 5) continue;
      const rate = grp.filter(l => l.stage === 'won').length / grp.length;
      const lift = Math.max(0.5, Math.min(1.6, (rate + 0.02) / (base + 0.02)));
      const before = w[factor][key];
      const after = Math.round(Math.max(0, Math.min(30, (DEFAULT_WEIGHTS[factor][key] || before) * (0.5 + 0.5 * lift))));
      if (after !== before) { w[factor][key] = after; changes.push({ factor, key, before, after, win_rate: Math.round(rate * 100) }); }
    }
  }
  return { weights: w, changed: changes.length > 0, changes, base_win_rate: Math.round(base * 100), closed: closed.length };
}

module.exports = { score, extract, learn, DEFAULT_WEIGHTS, LABEL };
