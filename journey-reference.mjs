/** Personal reference dates and estimates never create or change daily records. */
import {dayKey, parseDay, moveDay, dayDiff} from './core.mjs';
import {numberOrNull, round2, spanSummary, percentChange} from './progress-core.mjs';

const FIRST_DAY = '1900-01-01';
const MAX_UNITS = 7000;
const MAX_COST = 7000000;

export function referenceStartDay(journey) {
  const value = journey?.started_at;
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  const datePart = text.match(/^\d{4}-\d{2}-\d{2}(?=$|[T\s])/u)?.[0];
  if (!datePart) return null;
  try {
    // Reject dates that Date would silently roll into the following month.
    parseDay(datePart);
    if (text === datePart) return datePart;
    const date = new Date(text);
    if (!Number.isFinite(date.getTime())) return null;
    const localDay = dayKey(date);
    parseDay(localDay);
    return localDay;
  } catch {
    return null;
  }
}

function requiredEstimate(value, label, max) {
  const number = typeof value === 'number' || typeof value === 'string'
    ? numberOrNull(value) : null;
  if (number === null || number < 0 || number > max) {
    throw Error(`${label} : renseigne une estimation entre 0 et ${max}.`);
  }
  return round2(number);
}

export function validateJourneyReference(input, today = dayKey()) {
  parseDay(today);
  const start = typeof input?.started_on === 'string' ? input.started_on.trim() : '';
  parseDay(start);
  if (start < FIRST_DAY || start > today) {
    throw Error('Choisis une date entre le 1er janvier 1900 et aujourd’hui.');
  }
  return {
    started_on: start,
    baseline_units_week: requiredEstimate(input.baseline_units_week, 'Ancienne consommation par semaine', MAX_UNITS),
    baseline_cost_week: requiredEstimate(input.baseline_cost_week, 'Ancien budget alcool par semaine', MAX_COST),
  };
}

function knownEstimate(value, max) {
  const number = typeof value === 'number' || typeof value === 'string'
    ? numberOrNull(value) : null;
  return number !== null && number >= 0 && number <= max ? number : null;
}

export function journeyReferenceSummary(checks, journey, settings, today = dayKey()) {
  parseDay(today);
  const baselineUnits = knownEstimate(settings?.baseline_units_week, MAX_UNITS);
  const baselineCost = knownEstimate(settings?.baseline_cost_week, MAX_COST);
  const start = referenceStartDay(journey);
  if (!start || start < FIRST_DAY || start > today) {
    return {
      start: null, days: null, summary: null, comparisonPercent: null,
      closedKnownDays: 0, closedExpectedDays: 0, baselineUnits, baselineCost,
    };
  }

  const references = {baseline_cost_week: baselineCost};
  const summary = spanSummary(checks, start, today, today, references);
  // Today's recorded totals are visible, but an unfinished day is never compared.
  const closed = spanSummary(checks, start, moveDay(today, -1), today, references);
  const comparisonPercent = closed.quantityComplete && baselineUnits !== null && baselineUnits > 0
    ? percentChange(closed.units, baselineUnits * closed.expected / 7) : null;

  return {
    start,
    days: dayDiff(today, start),
    summary,
    comparisonPercent,
    closedKnownDays: closed.quantityDays,
    closedExpectedDays: closed.expected,
    baselineUnits,
    baselineCost,
  };
}
