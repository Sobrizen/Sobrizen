/** Declared periods plus sparse recorded exceptions; no invented daily check-ins. */
import {dayKey, parseDay, moveDay, dayDiff} from './core.mjs';
import {numberOrNull, round2, percentChange} from './progress-core.mjs';

const FIRST_DAY = '1900-01-01';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MODES = new Set(['abstain', 'reduce', 'observe']);
const ESTIMATED = new Set(['baseline', 'period']);
const ACTUAL = new Set(['legacy', 'occasion']);

function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${label} invalide.`);
  if (Object.keys(value).some(key => !keys.includes(key))) throw Error(`${label} contient un champ inconnu.`);
  return value;
}

function date(value, label, latest) {
  if (typeof value !== 'string') throw Error(`${label} : date invalide.`);
  const result = value.trim();
  parseDay(result);
  if (result < FIRST_DAY || (latest && result > latest)) throw Error(`${label} : date hors limites.`);
  return result;
}

function number(value, label, max, positive = false) {
  const raw = typeof value === 'number' || typeof value === 'string' ? numberOrNull(value) : null;
  if (raw === null || raw < 0 || raw > max) throw Error(`${label} : renseigne un nombre entre 0 et ${max}.`);
  const result = round2(raw);
  if (positive && result <= 0) throw Error(`${label} doit être supérieur à zéro.`);
  return result;
}

function optionalNumber(value, label, max) {
  return value === null || value === undefined ? null : number(value, label, max);
}

function text(value, label, max) {
  if (value === undefined) return '';
  if (typeof value !== 'string') throw Error(`${label} invalide.`);
  const result = value.trim();
  if (result.length > max) throw Error(`${label} : ${max} caractères maximum.`);
  return result;
}

function id(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw Error('Identifiant de période ou de journée invalide.');
  return value.toLowerCase();
}

function unique(rows, field, label) {
  if (new Set(rows.map(row => row[field])).size !== rows.length) throw Error(`${label} doit être unique.`);
}

export function validateTimelineDocument(input, today = dayKey()) {
  parseDay(today);
  const doc = object(input, ['schema_version', 'timezone', 'baseline', 'events', 'occasions', 'goal'], 'Parcours');
  if (doc.schema_version !== 1) throw Error('Version du parcours non prise en charge.');
  if (typeof doc.timezone !== 'string' || !doc.timezone || doc.timezone.length > 100) throw Error('Fuseau horaire invalide.');
  try { new Intl.DateTimeFormat('fr-FR', {timeZone: doc.timezone}).format(0); }
  catch { throw Error('Fuseau horaire invalide.'); }

  const base = object(doc.baseline, ['started_on', 'units_week', 'cost_week'], 'Référence initiale');
  const baseline = {
    started_on: date(base.started_on, 'Début de la référence', today),
    units_week: number(base.units_week, 'Consommation de référence', 7000),
    cost_week: number(base.cost_week, 'Budget de référence', 7000000),
  };
  if (!Array.isArray(doc.events) || doc.events.length < 1 || doc.events.length > 500) {
    throw Error('Le parcours doit contenir entre 1 et 500 périodes.');
  }
  const events = doc.events.map(value => {
    const row = object(value, ['id', 'started_on', 'state', 'units_week', 'cost_week', 'note'], 'Période');
    if (!['abstinent', 'drinking'].includes(row.state)) throw Error('État de période invalide.');
    const units = number(row.units_week, 'Consommation hebdomadaire', 7000, row.state === 'drinking');
    if (row.state === 'abstinent' && units !== 0) throw Error('Une période sans alcool doit avoir une consommation nulle.');
    return {
      id: id(row.id), started_on: date(row.started_on, 'Début de période', today), state: row.state,
      units_week: units, cost_week: number(row.cost_week, 'Budget hebdomadaire', 7000000),
      note: text(row.note, 'Note de période', 300),
    };
  }).sort((a, b) => a.started_on.localeCompare(b.started_on));
  unique(events, 'id', 'Chaque identifiant de période');
  unique(events, 'started_on', 'Chaque date de début');
  if (baseline.started_on > events[0].started_on) throw Error('La référence doit commencer avant ou avec la première période.');

  if (!Array.isArray(doc.occasions) || doc.occasions.length > 1000) throw Error('Le parcours peut contenir au maximum 1 000 journées ponctuelles.');
  const occasions = doc.occasions.map(value => {
    const row = object(value, ['id', 'date', 'units', 'cost'], 'Journée ponctuelle');
    const recorded = date(row.date, 'Date de la journée', today);
    if (recorded < baseline.started_on) throw Error('Une journée ne peut pas précéder le début de la référence.');
    return {id: id(row.id), date: recorded, units: number(row.units, 'Verres de la journée', 1000, true), cost: number(row.cost, 'Dépenses de la journée', 1000000)};
  }).sort((a, b) => a.date.localeCompare(b.date));
  unique(occasions, 'id', 'Chaque identifiant de journée');
  unique(occasions, 'date', 'Chaque journée ponctuelle');

  const rawGoal = object(doc.goal, ['mode', 'weekly_limit', 'daily_limit', 'target_on', 'why', 'triggers', 'support_first', 'planned_action'], 'Cap');
  if (!MODES.has(rawGoal.mode)) throw Error('Choisis un cap valide.');
  if (typeof rawGoal.support_first !== 'boolean') throw Error('Choix d’accompagnement invalide.');
  const weekly = optionalNumber(rawGoal.weekly_limit, 'Limite hebdomadaire', 7000);
  const daily = optionalNumber(rawGoal.daily_limit, 'Limite quotidienne', 1000);
  if ((rawGoal.mode !== 'reduce' || rawGoal.support_first) && (weekly !== null || daily !== null)) {
    throw Error('Les limites chiffrées sont réservées au cap de réduction sans accompagnement prioritaire.');
  }
  if (!Array.isArray(rawGoal.triggers) || rawGoal.triggers.length > 12) throw Error('Choisis au maximum 12 situations.');
  const triggers = [...new Set(rawGoal.triggers.map(value => text(value, 'Situation', 80)))];
  if (triggers.some(value => !value)) throw Error('Une situation ne peut pas être vide.');
  const goal = {
    mode: rawGoal.mode, weekly_limit: weekly, daily_limit: daily,
    target_on: rawGoal.target_on === null || rawGoal.target_on === undefined ? null : date(rawGoal.target_on, 'Date de l’objectif', '2100-12-31'),
    why: text(rawGoal.why, 'Raison personnelle', 1000), triggers,
    support_first: rawGoal.support_first, planned_action: text(rawGoal.planned_action, 'Prochaine action', 500),
  };
  return {schema_version: 1, timezone: doc.timezone, baseline, events, occasions, goal};
}

function known(value, max) {
  const result = typeof value === 'number' || typeof value === 'string' ? numberOrNull(value) : null;
  return result !== null && result >= 0 && result <= max ? result : null;
}

function context(document, checks, today) {
  const doc = validateTimelineDocument(document, today);
  const legacy = new Map();
  for (const check of checks) {
    const key = check?.checkin_date;
    if (typeof key !== 'string' || key < FIRST_DAY || key > today) continue;
    try { parseDay(key); } catch { continue; }
    legacy.set(key, check);
  }
  const occasions = new Map(doc.occasions.map(row => [row.date, row]));
  const exceptions = [...new Set([...legacy.keys(), ...occasions.keys()])].sort();
  const segments = [];
  let start = doc.baseline.started_on;
  // Real older records remain available; the intervening days stay unknown.
  if (exceptions[0] && exceptions[0] < start) segments.push({start: exceptions[0], end: start, event: null});
  let event = null;
  for (const next of doc.events) {
    if (start < next.started_on) segments.push({start, end: next.started_on, event});
    start = next.started_on;
    event = next;
  }
  if (start < today) segments.push({start, end: today, event});
  return {doc, legacy, occasions, exceptions, segments, today};
}

function activeEvent(ctx, date) {
  const events = ctx.doc.events;
  let low = 0, high = events.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (events[middle].started_on <= date) low = middle + 1;
    else high = middle;
  }
  return low ? events[low - 1] : null;
}

function emptyRow(date, event = null) {
  return {checkin_date: date, sober_today: null, alcohol_units: null, alcohol_cost_eur: null, status_source: 'unknown', units_source: 'unknown', cost_source: 'unknown', event_id: event?.id || null};
}

function baseRow(ctx, date, selectedEvent) {
  if (date < ctx.doc.baseline.started_on || date > ctx.today) {
    return emptyRow(date);
  }
  const event = selectedEvent === undefined ? activeEvent(ctx, date) : selectedEvent;
  const reference = event || ctx.doc.baseline;
  const source = event ? 'period' : 'baseline';
  return {
    checkin_date: date, sober_today: event ? event.state === 'abstinent' : null,
    alcohol_units: reference.units_week / 7, alcohol_cost_eur: reference.cost_week / 7,
    status_source: source, units_source: source, cost_source: source, event_id: event?.id || null,
  };
}

function withProvenance(row) {
  const sources = new Set([row.status_source, row.units_source, row.cost_source]);
  return {...row, source: sources.size === 1 ? sources.values().next().value : 'mixed', estimated: ESTIMATED.has(row.units_source) || ESTIMATED.has(row.cost_source)};
}

function effectiveRow(ctx, date, base = baseRow(ctx, date)) {
  const row = {...base};
  const check = ctx.legacy.get(date);
  if (check) {
    const units = known(check.alcohol_units, 1000);
    if (check.sober_today === true) {
      row.sober_today = true; row.status_source = 'legacy';
      row.alcohol_units = 0; row.units_source = 'legacy';
    } else if (check.sober_today === false) {
      row.sober_today = false; row.status_source = 'legacy';
      row.alcohol_units = units !== null && units > 0 ? units : null;
      row.units_source = row.alcohol_units === null ? 'unknown' : 'legacy';
    } else if (units !== null) {
      row.alcohol_units = units; row.units_source = 'legacy';
      if (units > 0) { row.sober_today = false; row.status_source = 'legacy'; }
    }
    const cost = known(check.alcohol_cost_eur, 1000000);
    if (cost !== null) { row.alcohol_cost_eur = cost; row.cost_source = 'legacy'; }
  }
  const occasion = ctx.occasions.get(date);
  if (occasion) {
    row.sober_today = false; row.alcohol_units = occasion.units; row.alcohol_cost_eur = occasion.cost;
    row.status_source = 'occasion'; row.units_source = 'occasion'; row.cost_source = 'occasion';
  }
  return withProvenance({...row, provisional: date === ctx.today});
}

function actualTodayRow(ctx) {
  return effectiveRow(ctx, ctx.today, emptyRow(ctx.today, activeEvent(ctx, ctx.today)));
}

function range(start, end, today) {
  parseDay(start); parseDay(end);
  const last = end < today ? end : moveDay(today, -1);
  return {start, end: last, days: last < start ? 0 : dayDiff(last, start) + 1};
}

function accumulator() {
  return {units: 0, cost: 0, soberDays: 0, quantityDays: 0, costDays: 0, estimatedDays: 0, estimatedUnitsDays: 0, estimatedCostDays: 0, actualDays: 0, actualUnitsDays: 0, actualCostDays: 0};
}

function add(acc, row, count) {
  const unitsKnown = row.alcohol_units !== null;
  const costKnown = row.alcohol_cost_eur !== null;
  if (row.sober_today === true) acc.soberDays += count;
  if (unitsKnown) { acc.quantityDays += count; acc.units += row.alcohol_units * count; }
  if (costKnown) { acc.costDays += count; acc.cost += row.alcohol_cost_eur * count; }
  const estimatedUnits = unitsKnown && ESTIMATED.has(row.units_source);
  const estimatedCost = costKnown && ESTIMATED.has(row.cost_source);
  const actualUnits = unitsKnown && ACTUAL.has(row.units_source);
  const actualCost = costKnown && ACTUAL.has(row.cost_source);
  if (estimatedUnits) acc.estimatedUnitsDays += count;
  if (estimatedCost) acc.estimatedCostDays += count;
  if (estimatedUnits || estimatedCost) acc.estimatedDays += count;
  if (actualUnits) acc.actualUnitsDays += count;
  if (actualCost) acc.actualCostDays += count;
  if (actualUnits || actualCost || ACTUAL.has(row.status_source)) acc.actualDays += count;
}

function summarize(ctx, start, end) {
  const window = range(start, end, ctx.today), acc = accumulator(), referenceAcc = accumulator();
  const referenceStart = start > ctx.doc.baseline.started_on ? start : ctx.doc.baseline.started_on;
  const referenceDays = window.end < referenceStart ? 0 : dayDiff(window.end, referenceStart) + 1;
  if (window.days) {
    const stop = moveDay(window.end, 1);
    for (const segment of ctx.segments) {
      const from = segment.start > start ? segment.start : start;
      const until = segment.end < stop ? segment.end : stop;
      if (until > from) {
        add(acc, baseRow(ctx, from, segment.event), dayDiff(until, from));
        const referenceFrom = from > referenceStart ? from : referenceStart;
        if (until > referenceFrom) add(referenceAcc, baseRow(ctx, referenceFrom, segment.event), dayDiff(until, referenceFrom));
      }
    }
    for (const day of ctx.exceptions) {
      if (day < start || day > window.end) continue;
      const base = baseRow(ctx, day);
      const actual = effectiveRow(ctx, day, base);
      add(acc, base, -1);
      add(acc, actual, 1);
      if (day >= referenceStart) {
        add(referenceAcc, base, -1);
        add(referenceAcc, actual, 1);
      }
    }
  }
  const quantityComplete = window.days > 0 && acc.quantityDays === window.days;
  const costComplete = window.days > 0 && acc.costDays === window.days;
  const includesToday = start <= ctx.today && end >= ctx.today;
  let saved = referenceAcc.costDays
    ? round2(ctx.doc.baseline.cost_week * referenceAcc.costDays / 7 - referenceAcc.cost)
    : !window.days || (includesToday && !referenceDays) ? 0 : null;
  const comparisonPercent = referenceDays > 0 && referenceAcc.quantityDays === referenceDays && ctx.doc.baseline.units_week > 0
    ? percentChange(referenceAcc.units, ctx.doc.baseline.units_week * referenceDays / 7) : null;
  const todayActual = {units: null, cost: null};
  if (includesToday) {
    const row = actualTodayRow(ctx);
    todayActual.units = row.alcohol_units;
    todayActual.cost = row.alcohol_cost_eur;
    if (todayActual.units !== null) acc.units += todayActual.units;
    if (todayActual.cost !== null) {
      acc.cost += todayActual.cost;
      if (saved !== null) saved = round2(saved - todayActual.cost);
    }
  }
  const provisional = todayActual.units !== null || todayActual.cost !== null;
  return {
    ...window, ...acc, units: round2(acc.units) || 0, cost: round2(acc.cost) || 0,
    saved, quantityComplete, costComplete, comparisonPercent, todayActual, provisional,
    referenceStart, referenceDays, referenceQuantityDays: referenceAcc.quantityDays, referenceCostDays: referenceAcc.costDays,
  };
}

/** Inclusive query: days/coverage/comparison stay closed; actual today is separate. */
export function timelineSummary(doc, checks = [], start, end, today = dayKey()) {
  return summarize(context(doc, checks, today), start, end);
}

/** Intended for bounded charts/export. Values retain daily estimate precision. */
export function timelineRows(doc, checks = [], start, end, today = dayKey()) {
  const ctx = context(doc, checks, today), window = range(start, end, today);
  if (window.days > 366) throw Error('Choisis au maximum 366 journées pour le détail de la courbe.');
  const rows = Array.from({length: window.days}, (_, index) => effectiveRow(ctx, moveDay(start, index)));
  if (start <= today && end >= today) rows.push(actualTodayRow(ctx));
  return rows;
}

function soberPeriods(ctx) {
  const runs = [];
  function append(start, end, sober) {
    if (end <= start) return;
    const last = runs.at(-1);
    if (last?.sober === sober && last.end === start) last.end = end;
    else runs.push({start, end, sober});
  }
  let index = 0;
  for (const segment of ctx.segments) {
    let cursor = segment.start;
    const sober = segment.event?.state === 'abstinent';
    while (index < ctx.exceptions.length && ctx.exceptions[index] < segment.start) index++;
    while (index < ctx.exceptions.length && ctx.exceptions[index] < segment.end) {
      const day = ctx.exceptions[index++];
      append(cursor, day, sober);
      const next = moveDay(day, 1);
      append(day, next, effectiveRow(ctx, day, baseRow(ctx, day, segment.event)).sober_today === true);
      cursor = next;
    }
    append(cursor, segment.end, sober);
  }
  const soberToday = effectiveRow(ctx, ctx.today).sober_today === true;
  return runs.filter(run => run.sober).map(run => ({
    start: run.start, end: moveDay(run.end, -1), days: dayDiff(run.end, run.start),
    ongoing: run.end === ctx.today && soberToday,
  }));
}

export function timelineSnapshot(doc, checks = [], today = dayKey()) {
  const ctx = context(doc, checks, today);
  const event = ctx.doc.events.at(-1);
  const periods = soberPeriods(ctx);
  const bestPeriods = [...periods].sort((a, b) => b.days - a.days || b.start.localeCompare(a.start));
  return {
    current: {event, state: event.state, started_on: event.started_on, days: dayDiff(today, event.started_on), units_week: event.units_week, cost_week: event.cost_week},
    totalSoberDays: periods.reduce((total, period) => total + period.days, 0),
    currentStreak: periods.find(period => period.ongoing)?.days || 0,
    bestStreak: bestPeriods[0]?.days || 0,
    bestPeriods,
    firstEventDate: ctx.doc.events[0].started_on,
    summary: summarize(ctx, ctx.doc.events[0].started_on, today),
  };
}
