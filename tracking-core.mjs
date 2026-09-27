/** Calendar tracking views. Missing entries and unknown amounts are never zero. */
import {dayKey, parseDay, moveDay, dayDiff} from './core.mjs';
import {
  addMonths, annualRange, yearCount, spanSummary, indexChecks,
  unitsOf, costOf, round2, percentChange,
} from './progress-core.mjs';

const SCALES = new Set(['week', 'month', 'year']);
const earlier = (a, b) => a < b ? a : b;
const later = (a, b) => a > b ? a : b;
const firstOfMonth = date => `${date.slice(0, 7)}-01`;
const monday = date => moveDay(date, -((parseDay(date).getDay() + 6) % 7));

/**
 * Offset 0 is the current calendar week/month or current anniversary year.
 * Negative offsets navigate history. The first intersecting period and current
 * period are the bounds; their before-tracking/future days remain visible.
 */
export function trackingRange(anchor, scale = 'week', offset = 0, today = dayKey()) {
  parseDay(anchor);
  parseDay(today);
  if (anchor > today) throw Error('Le début du suivi ne peut pas être dans le futur.');
  if (!SCALES.has(scale)) throw Error('Période invalide.');
  if (!Number.isInteger(offset)) throw Error('Décalage de période invalide.');

  let start, end, minOffset, index, months;
  if (scale === 'week') {
    const current = monday(today);
    minOffset = -dayDiff(current, monday(anchor)) / 7;
    offset = Math.max(minOffset, Math.min(0, offset));
    start = moveDay(current, offset * 7);
    end = moveDay(start, 6);
  } else if (scale === 'month') {
    const [year, month] = today.split('-').map(Number);
    const [anchorYear, anchorMonth] = anchor.split('-').map(Number);
    minOffset = (anchorYear - year) * 12 + anchorMonth - month;
    offset = Math.max(minOffset, Math.min(0, offset));
    start = addMonths(firstOfMonth(today), offset);
    end = moveDay(addMonths(start, 1), -1);
  } else {
    const currentIndex = yearCount(anchor, today) - 1;
    minOffset = -currentIndex;
    offset = Math.max(minOffset, Math.min(0, offset));
    index = currentIndex + offset;
    ({start, end, months} = annualRange(anchor, index));
  }
  // Avoid exposing negative zero to consumers or URL state.
  offset = offset || 0;
  minOffset = minOffset || 0;
  return {
    anchor, scale, offset, start, end, days: dayDiff(end, start) + 1,
    canPrev: offset > minOffset, canNext: offset < 0, minOffset,
    ...(scale === 'year' ? {index, months} : {}),
  };
}

function precedingPeriod(range) {
  const end = moveDay(range.start, -1);
  if (range.scale === 'week') return {start: moveDay(range.start, -7), end};
  if (range.scale === 'month') return {start: addMonths(range.start, -1), end};
  return {start: addMonths(range.anchor, (range.index - 1) * 12), end};
}

function difference(current, previous) {
  return {current, previous, delta: round2(current - previous), percent: percentChange(current, previous)};
}

/**
 * Summary includes entered values for today; comparison deliberately excludes
 * today. It compares the same N first closed days of the preceding period.
 * Each metric requires its own complete coverage. A shorter previous period
 * yields no comparison rather than silently comparing unequal durations.
 * Summary totals retain spanSummary semantics: consult quantityDays/costDays
 * before displaying a zero, because no known amount is not a confirmed zero.
 */
export function trackingSummary(checks, range, today = dayKey(), settings = {}) {
  parseDay(today);
  const start = later(range.start, range.anchor);
  const summary = {
    ...spanSummary(checks, start, range.end, today, settings),
    provisional: start <= today && today <= range.end,
  };
  const closedEnd = earlier(range.end, moveDay(today, -1));
  const days = closedEnd < start ? 0 : dayDiff(closedEnd, start) + 1;
  const comparison = {
    days,
    current: days ? {start, end: closedEnd} : null,
    previous: null,
    units: null,
    cost: null,
    reason: null,
  };

  if (!days) comparison.reason = 'no-closed-days';
  else {
    const previousPeriod = precedingPeriod(range);
    if (previousPeriod.start < range.anchor || start !== range.start) {
      comparison.reason = 'before-tracking';
    } else if (dayDiff(previousPeriod.end, previousPeriod.start) + 1 < days) {
      comparison.reason = 'different-length';
    } else {
      const previousEnd = moveDay(previousPeriod.start, days - 1);
      comparison.previous = {start: previousPeriod.start, end: previousEnd};
      const current = spanSummary(checks, start, closedEnd, today, settings);
      const previous = spanSummary(checks, previousPeriod.start, previousEnd, today, settings);
      if (current.quantityComplete && previous.quantityComplete) {
        comparison.units = difference(current.units, previous.units);
      }
      if (current.costComplete && previous.costComplete) {
        comparison.cost = difference(current.cost, previous.cost);
      }
      if (!comparison.units || !comparison.cost) comparison.reason = 'incomplete';
    }
  }
  return {summary, comparison};
}

function baseLabel(start, annual) {
  return parseDay(start).toLocaleDateString('fr-FR', annual
    ? {month: 'short'}
    : {day: 'numeric', month: 'short'});
}

/**
 * Day points in week/month; twelve anniversary-month buckets in year.
 * Coverage values are COUNTS of known days, not percentages. `expected` counts
 * elapsed tracked days; `days` is the full calendar bucket. Unknown/future values
 * are null. Annual sums with gaps or an unfinished month remain visible but are
 * marked per field as Partial: render them separately from complete-month lines.
 */
export function trackingPoints(checks, range, today = dayKey()) {
  parseDay(today);
  const map = indexChecks(checks, today);
  const annual = range.scale === 'year';
  const buckets = annual ? range.months : Array.from({length: range.days}, (_, i) => {
    const date = moveDay(range.start, i);
    return {start: date, end: date};
  });

  return buckets.map(({start, end}) => {
    const days = dayDiff(end, start) + 1;
    const trackedStart = later(start, range.anchor);
    const stop = earlier(end, today);
    const expected = stop < trackedStart ? 0 : dayDiff(stop, trackedStart) + 1;
    const future = start > today;
    const beforeTracking = end < range.anchor;
    const provisional = start <= today && today <= end;
    let units = 0, cost = 0, unitsCoverage = 0, costCoverage = 0;

    for (let i = 0; i < expected; i++) {
      const row = map.get(moveDay(trackedStart, i));
      const quantity = unitsOf(row), expenditure = costOf(row);
      if (quantity !== null) { units += quantity; unitsCoverage++; }
      if (expenditure !== null) { cost += expenditure; costCoverage++; }
    }

    const fullyClosed = expected === days && !provisional && !future && !beforeTracking;
    const unitsComplete = fullyClosed && unitsCoverage === days;
    const costComplete = fullyClosed && costCoverage === days;
    const unitsPartial = expected > 0 && !unitsComplete;
    const costPartial = expected > 0 && !costComplete;
    const partial = unitsPartial || costPartial;
    const label = baseLabel(start, annual);
    const suffix = future ? ' · à venir' : beforeTracking ? ' · avant le suivi' : partial ? ' · partiel' : '';

    return {
      date: start, start, end, days, expected,
      units: unitsCoverage ? round2(units) : null,
      cost: costCoverage ? round2(cost) : null,
      unitsCoverage, costCoverage, unitsComplete, costComplete,
      unitsPartial, costPartial, partial, provisional, future, beforeTracking,
      label: label + suffix,
    };
  });
}
