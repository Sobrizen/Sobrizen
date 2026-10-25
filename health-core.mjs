/** Self-reported wellbeing and evidence milestones; never a medical assessment. */
import {dayKey, parseDay, moveDay, dayDiff} from './core.mjs';

export const HEALTH_METRICS = Object.freeze([
  {key: 'mood', label: 'Humeur', low: 'Très difficile', high: 'Très bonne', positive: true},
  {key: 'energy', label: 'Énergie', low: 'Très faible', high: 'Très bonne', positive: true},
  {key: 'sleep_quality', label: 'Sommeil', low: 'Très difficile', high: 'Très réparateur', positive: true},
  {key: 'anxiety', label: 'Anxiété', low: 'Aucune', high: 'Très forte', positive: false},
  {key: 'concentration', label: 'Concentration', low: 'Très difficile', high: 'Très facile', positive: true},
  {key: 'physical_comfort', label: 'Confort physique', low: 'Très difficile', high: 'Très bon', positive: true},
].map(metric => Object.freeze(metric)));

function validDay(value, today) {
  if (typeof value !== 'string') return null;
  try { parseDay(value); } catch { return null; }
  if (value < '1900-01-01') return null;
  return today && value > today ? null : value;
}

function score(value, strict = false, label = 'Ressenti') {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return null;
  // Form controls supply strings. Accept only a literal scale value, not booleans,
  // arrays, hexadecimal values or other implicit Number() coercions.
  const result = typeof value === 'number' ? value
    : typeof value === 'string' && /^[1-5]$/u.test(value.trim()) ? Number(value.trim()) : null;
  if (Number.isInteger(result) && result >= 1 && result <= 5) return result;
  if (strict) throw Error(`${label} : choisis une valeur entière de 1 à 5.`);
  return null;
}

function note(value, strict = false) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    if (strict) throw Error('La note doit être un texte.');
    return null;
  }
  const result = value.trim();
  if (result.length > 1000) {
    if (strict) throw Error('La note est limitée à 1 000 caractères.');
    return null;
  }
  return result || null;
}

function emptyObservation(date) {
  return {checkin_date: date, ...Object.fromEntries(HEALTH_METRICS.map(({key}) => [key, null])), note: null};
}

/** Canonical write payload. No alcohol status or inferred measurements are added. */
export function validateHealthEntry(input, today = dayKey()) {
  parseDay(today);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Ressenti invalide.');
  if (!validDay(input.checkin_date)) throw Error('Date du ressenti invalide.');
  if (input.checkin_date > today) throw Error('Une journée future ne peut pas être renseignée.');
  const result = emptyObservation(input.checkin_date);
  for (const {key, label} of HEALTH_METRICS) result[key] = score(input[key], true, label);
  if (!HEALTH_METRICS.some(({key}) => result[key] !== null)) throw Error('Renseigne au moins un ressenti de 1 à 5.');
  result.note = note(input.note, true);
  return result;
}

/**
 * Sparse observations, one date per row, ordered oldest first. New measurements
 * take precedence independently; valid historical mood/energy remain usable.
 * Old alcohol declarations and notes are deliberately not turned into health data.
 */
export function mergeHealthObservations(rows = [], legacyChecks = [], today = dayKey()) {
  parseDay(today);
  const observations = new Map();
  function destination(row) {
    const date = validDay(row?.checkin_date, today);
    if (!date) return null;
    if (!observations.has(date)) observations.set(date, emptyObservation(date));
    return observations.get(date);
  }
  for (const row of Array.isArray(legacyChecks) ? legacyChecks : []) {
    const target = destination(row);
    if (!target) continue;
    for (const key of ['mood', 'energy']) {
      const value = score(row[key]);
      if (value !== null) target[key] = value;
    }
  }
  for (const row of Array.isArray(rows) ? rows : []) {
    const target = destination(row);
    if (!target) continue;
    for (const {key} of HEALTH_METRICS) {
      const value = score(row[key]);
      if (value !== null) target[key] = value;
    }
    const text = note(row.note);
    if (text !== null) target.note = text;
  }
  return [...observations.values()]
    .filter(row => HEALTH_METRICS.some(({key}) => row[key] !== null))
    .sort((a, b) => a.checkin_date.localeCompare(b.checkin_date));
}

/** Use the effective timeline, including retroactive occasions and finite ranges. */
export function healthJourney(snapshot, today = dayKey()) {
  parseDay(today);
  const knownCount = value => Number.isInteger(value) && value >= 0 ? value : null;
  const totalSoberDays = knownCount(snapshot?.totalSoberDays);
  const lastConsumptionOn = validDay(snapshot?.lastConsumptionOn, today);
  const startDate = validDay(snapshot?.currentStreakStartedOn, today);
  const days = knownCount(snapshot?.currentStreak);
  // A stale or contradictory snapshot cannot become a personal health timeline.
  // Day zero is a valid declared start, not a completed sober day.
  const active = snapshot?.current?.state === 'abstinent'
    && snapshot?.current?.source !== 'unknown'
    && startDate !== null && days !== null && dayDiff(today, startDate) === days
    && (lastConsumptionOn === null || lastConsumptionOn < startDate);
  return {active, startDate: active ? startDate : null, days: active ? days : null, totalSoberDays, lastConsumptionOn};
}

/** Stage states describe elapsed time, never that a health benefit was acquired. */
export function stageProgress(snapshot, stages = [], today = dayKey()) {
  const journey = healthJourney(snapshot, today);
  if (!Array.isArray(stages)) throw Error('Les repères scientifiques sont invalides.');
  let previous = -1;
  for (const stage of stages) {
    if (!Number.isInteger(stage?.fromDays) || stage.fromDays < 0 || stage.fromDays <= previous) {
      throw Error('Les repères doivent avoir des durées croissantes en jours entiers.');
    }
    previous = stage.fromDays;
  }
  const stageIndex = journey.active ? stages.findLastIndex(stage => stage.fromDays <= journey.days) : -1;
  return {
    ...journey,
    stageIndex,
    stages: stages.map((stage, index) => ({
      ...stage,
      state: !journey.active ? 'information' : index < stageIndex ? 'past' : index === stageIndex ? 'current' : 'future',
      targetDate: journey.active ? moveDay(journey.startDate, stage.fromDays) : null,
    })),
  };
}

/** Actual scores in adjacent civil-date windows; absent days never become zeros. */
export function healthTrends(rows, today = dayKey(), windowDays = 7) {
  parseDay(today);
  if (!Number.isInteger(windowDays) || windowDays < 1) throw Error('La période de comparaison doit être un nombre positif de jours.');
  const observations = mergeHealthObservations(rows, [], today);
  const currentStart = moveDay(today, 1 - windowDays);
  const previousStart = moveDay(today, 1 - 2 * windowDays);
  const currentRows = observations.filter(row => row.checkin_date >= currentStart);
  const previousRows = observations.filter(row => row.checkin_date >= previousStart && row.checkin_date < currentStart);
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return HEALTH_METRICS.map(({key, label, positive}) => {
    const currentScores = currentRows.map(row => row[key]).filter(value => value !== null);
    const previousScores = previousRows.map(row => row[key]).filter(value => value !== null);
    const currentMean = average(currentScores), previousMean = average(previousScores);
    const enough = currentScores.length >= 2 && previousScores.length >= 2;
    const delta = enough ? round(currentMean - previousMean) : null;
    const direction = delta === null ? 'unknown' : delta === 0 ? 'stable'
      : (positive ? delta > 0 : delta < 0) ? 'better' : 'worse';
    return {
      key, label, positive,
      current: currentMean === null ? null : round(currentMean),
      previous: previousMean === null ? null : round(previousMean),
      currentCount: currentScores.length,
      previousCount: previousScores.length,
      delta, direction,
    };
  });
}
