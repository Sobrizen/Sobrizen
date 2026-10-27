/** Personal encouragement from declared time and actual notes; no medical score. */
import {parseDay, moveDay} from './core.mjs';
import {mergeHealthObservations, healthTrends} from './health-core.mjs';

const METRIC_ORDER = ['mood', 'anxiety', 'concentration', 'energy', 'sleep_quality', 'physical_comfort'];
const MESSAGES = Object.freeze({
  improving: 'Tes dernières notes montrent des changements favorables. Tu avances, à ton rythme.',
  mixed: 'Tes dernières notes montrent des progrès et des points encore difficiles. Chaque avancée compte.',
  difficult: 'Tes dernières notes montrent une période plus difficile. Ce n’est pas un échec : tu peux t’appuyer sur du soutien.',
  steady: 'Tes moyennes restent stables. Ton suivi t’aide à voir ce qui se maintient.',
  beginning: 'Tu construis tes repères. De nouvelles notes permettront de comparer ce que tu ressens.',
  empty: 'Chaque nouveau départ compte. Commence par noter ce que tu ressens aujourd’hui.',
});

function validDay(value, latest = null) {
  if (typeof value !== 'string' || value < '1900-01-01' || (latest && value > latest)) return false;
  try { parseDay(value); return true; } catch { return false; }
}

function presentationTrend(metric, scale = 5) {
  return {...metric, before: metric.previous, after: metric.current,
    beforeCount: metric.previousCount, afterCount: metric.currentCount, scale};
}

function cravingScore(value) {
  const number = typeof value === 'number' ? value
    : typeof value === 'string' && /^(?:[0-9]|10)$/u.test(value.trim()) ? Number(value.trim()) : null;
  return Number.isInteger(number) && number >= 0 && number <= 10 ? number : null;
}

function cravingComparison(checks, today) {
  const currentStart = moveDay(today, -6), previousStart = moveDay(today, -13);
  const byDate = new Map();
  for (const row of Array.isArray(checks) ? checks : []) {
    if (!validDay(row?.checkin_date, today) || row.checkin_date < previousStart) continue;
    // One observation per date. A later cleared duplicate stays unknown.
    byDate.set(row.checkin_date, cravingScore(row.craving));
  }
  const current = [], previous = [];
  for (const [date, value] of byDate) {
    if (value !== null) (date >= currentStart ? current : previous).push(value);
  }
  if (!current.length && !previous.length) return null;
  const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const round = value => value === null ? null : Math.round((value + Number.EPSILON) * 100) / 100;
  const after = average(current), before = average(previous);
  const delta = current.length >= 2 && previous.length >= 2 ? round(after - before) : null;
  return presentationTrend({key: 'craving', label: 'Envie d’alcool', positive: false,
    current: round(after), previous: round(before), currentCount: current.length, previousCount: previous.length,
    delta, direction: delta === null ? 'unknown' : delta === 0 ? 'stable' : delta < 0 ? 'better' : 'worse'}, 10);
}

function milestones(progress, today) {
  const exact = progress?.precision === 'minute';
  const active = progress?.active === true && (exact || progress.precision === 'day')
    && validDay(progress.startDate, today);
  const anchor = exact ? progress?.startedAt : progress?.startDate;
  if (!active || typeof anchor !== 'string' || !anchor) {
    return {currentMilestone: null, nextMilestone: null, milestoneKey: null};
  }
  const eligible = (Array.isArray(progress.stages) ? progress.stages : []).flatMap((stage, index) => {
    const fromMinutes = stage?.fromMinutes;
    if (!Number.isSafeInteger(fromMinutes) || fromMinutes < 0
      || (!exact && (fromMinutes < 1440 || fromMinutes % 1440 !== 0))) return [];
    return [{state: stage.state, value: {
      id: typeof stage.id === 'string' ? stage.id : `duration-${fromMinutes}`,
      index, label: stage.label || stage.rangeLabel || '', fromMinutes,
      targetAt: exact && typeof stage.targetAt === 'string' ? stage.targetAt : null,
      targetDate: validDay(stage.targetDate) ? stage.targetDate : null,
      approx: !exact || stage.approx === true,
    }}];
  });
  const currentMilestone = eligible.findLast(stage => ['past', 'current'].includes(stage.state))?.value || null;
  const nextMilestone = eligible.find(stage => stage.state === 'future'
    && (!currentMilestone || stage.value.fromMinutes > currentMilestone.fromMinutes))?.value || null;
  return {currentMilestone, nextMilestone,
    milestoneKey: JSON.stringify([progress.precision, anchor, currentMilestone?.id || 'start'])};
}

/**
 * Pure presentation data. `progress` is stageProgress's effective result and
 * `today` is the journey's civil date, supplied by the caller. No clock, DOM,
 * storage, request or inferred benefit. The caller owns the consent boundary.
 * `trends` contains six wellbeing measures; the directional lists also include
 * craving when comparable. Missing scores never become zero or a trend.
 */
export function encouragementSummary({progress = null, observations = [], legacyChecks = [], today} = {}) {
  parseDay(today);
  const rows = mergeHealthObservations(observations, legacyChecks, today);
  const measured = healthTrends(rows, today);
  const trends = METRIC_ORDER.map(key => presentationTrend(measured.find(metric => metric.key === key)));
  const cravingTrend = cravingComparison(legacyChecks, today);
  const allTrends = cravingTrend ? [...trends, cravingTrend] : trends;
  const better = allTrends.filter(metric => metric.direction === 'better');
  const worse = allTrends.filter(metric => metric.direction === 'worse');
  const stable = allTrends.filter(metric => metric.direction === 'stable');
  const caps = milestones(progress, today);
  const supportiveState = better.length && worse.length ? 'mixed'
    : worse.length ? 'difficult' : better.length ? 'improving' : stable.length ? 'steady'
      : rows.length || cravingTrend || caps.milestoneKey !== null ? 'beginning' : 'empty';
  const message = supportiveState === 'beginning' && !rows.length && !cravingTrend && caps.milestoneKey !== null
    ? 'Tu avances. Ton premier ressenti donnera un point de départ à tes comparaisons.'
    : MESSAGES[supportiveState];
  return {...caps, trends, better, worse, stable, observationCount: rows.length,
    latestDate: rows.at(-1)?.checkin_date || null, cravingTrend, supportiveState, message};
}
