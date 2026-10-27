/** Declared periods plus sparse recorded exceptions; no invented daily check-ins. */
import {dayKey, parseDay, moveDay, dayDiff} from './core.mjs';
import {numberOrNull, round2, percentChange} from './progress-core.mjs';
import {instantMilliseconds, localDateTime} from './time-core.mjs';

const FIRST_DAY = '1900-01-01';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MODES = new Set(['abstain', 'reduce', 'observe']);
const ESTIMATED = new Set(['baseline', 'period', 'range']);
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

export function validateTimelineDocument(input, today = dayKey(), now = new Date()) {
  parseDay(today);
  const version = input?.schema_version;
  if (![1, 2, 3].includes(version)) throw Error('Version du parcours non prise en charge.');
  const keys = ['schema_version', 'timezone', 'baseline', 'events', 'occasions', 'goal'];
  if (version >= 2) keys.push('ranges');
  const doc = object(input, keys, 'Parcours');
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
    const row = object(value, ['id', 'started_on', 'state', 'units_week', 'cost_week', 'note', ...(version === 3 ? ['stopped_at', 'stop_basis'] : [])], 'Période');
    if (!['abstinent', 'drinking'].includes(row.state)) throw Error('État de période invalide.');
    const units = number(row.units_week, 'Consommation hebdomadaire', 7000, row.state === 'drinking');
    if (row.state === 'abstinent' && units !== 0) throw Error('Une période sans alcool doit avoir une consommation nulle.');
    const started_on = date(row.started_on, 'Début de période', today);
    const clock = {};
    if (Object.hasOwn(row, 'stopped_at') || Object.hasOwn(row, 'stop_basis')) {
      if (row.state !== 'abstinent') throw Error('L’heure d’arrêt est réservée à une période sans alcool.');
      if (row.stopped_at == null && row.stop_basis == null) {
        clock.stopped_at = null; clock.stop_basis = null;
      } else {
        if (typeof row.stopped_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:00(?:\.000)?Z$/u.test(row.stopped_at)) {
          throw Error('L’heure d’arrêt doit être un instant UTC précis à la minute.');
        }
        const millis = instantMilliseconds(row.stopped_at);
        if (millis > instantMilliseconds(now)) throw Error('L’heure d’arrêt ne peut pas être dans le futur.');
        if (localDateTime(millis, doc.timezone).date !== started_on) throw Error('L’heure d’arrêt doit correspondre à la date déclarée dans ton fuseau horaire.');
        if (typeof row.stop_basis !== 'string' || new TextEncoder().encode(row.stop_basis).length > 16384) throw Error('La confirmation de l’heure d’arrêt est invalide.');
        let basis;
        try { basis = JSON.parse(row.stop_basis); } catch { throw Error('La confirmation de l’heure d’arrêt est invalide.'); }
        if (!basis || typeof basis !== 'object' || Array.isArray(basis)) throw Error('La confirmation de l’heure d’arrêt est invalide.');
        clock.stopped_at = new Date(millis).toISOString(); clock.stop_basis = row.stop_basis;
      }
    }
    return {
      id: id(row.id), started_on, state: row.state,
      units_week: units, cost_week: number(row.cost_week, 'Budget hebdomadaire', 7000000),
      note: text(row.note, 'Note de période', 300), ...clock,
    };
  }).sort((a, b) => a.started_on.localeCompare(b.started_on));
  unique(events, 'id', 'Chaque identifiant de période');
  unique(events, 'started_on', 'Chaque date de début');
  if (baseline.started_on > events[0].started_on) throw Error('La référence doit commencer avant ou avec la première période.');

  if (version >= 2 && (!Array.isArray(doc.ranges) || doc.ranges.length > 500)) {
    throw Error('Le parcours peut contenir au maximum 500 périodes datées.');
  }
  const ranges = (version >= 2 ? doc.ranges : []).map(value => {
    const row = object(value, ['id', 'started_on', 'ended_on', 'state', 'units_week', 'cost_week', 'note'], 'Période datée');
    if (!['abstinent', 'drinking'].includes(row.state)) throw Error('État de période datée invalide.');
    const units = number(row.units_week, 'Consommation hebdomadaire', 7000, row.state === 'drinking');
    if (row.state === 'abstinent' && units !== 0) throw Error('Une période sans alcool doit avoir une consommation nulle.');
    const start = date(row.started_on, 'Début de période', today);
    const end = date(row.ended_on, 'Fin de période', today);
    if (end < start) throw Error('La fin de la période doit être le même jour que son début ou après.');
    return {
      id: id(row.id), started_on: start, ended_on: end, state: row.state,
      units_week: units, cost_week: number(row.cost_week, 'Budget hebdomadaire', 7000000),
      note: text(row.note, 'Note de période', 300),
    };
  }).sort((a, b) => a.started_on.localeCompare(b.started_on));
  unique(ranges, 'id', 'Chaque identifiant de période datée');
  for (let i = 1; i < ranges.length; i++) {
    const previous = ranges[i - 1];
    if (ranges[i].started_on <= previous.ended_on) {
      throw Error(`Cette période chevauche celle du ${previous.started_on} au ${previous.ended_on}. Modifie la période existante dans ton historique.`);
    }
  }

  if (!Array.isArray(doc.occasions) || doc.occasions.length > 1000) throw Error('Le parcours peut contenir au maximum 1 000 journées ponctuelles.');
  const occasions = doc.occasions.map(value => {
    const row = object(value, ['id', 'date', 'units', 'cost'], 'Journée ponctuelle');
    const recorded = date(row.date, 'Date de la journée', today);
    if (version === 1 && recorded < baseline.started_on) throw Error('Une journée ne peut pas précéder le début de la référence dans cette version du suivi.');
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
  return {schema_version: version, timezone: doc.timezone, baseline, events, occasions, goal, ...(version >= 2 ? {ranges} : {})};
}

/** Explicit write upgrade; reading a v1 document does not mutate its shape. */
export function upgradeTimelineDocument(input, today = dayKey(), now = new Date()) {
  const doc = validateTimelineDocument(input, today, now);
  return {...doc, schema_version: doc.schema_version === 3 ? 3 : 2, ranges: doc.ranges || []};
}

/** Save/edit one finite interval by stable id; repeated submissions never duplicate it. */
export function upsertTimelineRange(input, period, today = dayKey(), now = new Date()) {
  const doc = upgradeTimelineDocument(input, today, now);
  const selectedId = id(period?.id);
  doc.ranges = [...doc.ranges.filter(row => row.id !== selectedId), period];
  return validateTimelineDocument(doc, today, now);
}

function known(value, max) {
  const result = typeof value === 'number' || typeof value === 'string' ? numberOrNull(value) : null;
  return result !== null && result >= 0 && result <= max ? result : null;
}

function context(document, checks, today, now = new Date()) {
  const doc = validateTimelineDocument(document, today, now);
  const legacy = new Map();
  for (const check of checks) {
    const key = check?.checkin_date;
    if (typeof key !== 'string' || key < FIRST_DAY || key > today) continue;
    try { parseDay(key); } catch { continue; }
    legacy.set(key, check);
  }
  const occasions = new Map(doc.occasions.map(row => [row.date, row]));
  const exceptions = [...new Set([...legacy.keys(), ...occasions.keys()])].sort();
  const historyStart = [doc.events[0].started_on, doc.ranges?.[0]?.started_on, exceptions[0]].filter(Boolean).sort()[0];
  const ctx = {doc, legacy, occasions, exceptions, segments: [], today, historyStart};
  // Only declaration boundaries split estimates. An interval ends inclusively;
  // its next day returns to the underlying event, baseline, or unknown history.
  const boundaries = new Set([doc.baseline.started_on, historyStart, today]);
  for (const event of doc.events) boundaries.add(event.started_on);
  for (const period of doc.ranges || []) {
    boundaries.add(period.started_on);
    boundaries.add(moveDay(period.ended_on, 1));
  }
  const ordered = [...boundaries].filter(day => day <= today).sort();
  ctx.segments = ordered.slice(0, -1).map((start, index) => ({
    start, end: ordered[index + 1], event: activeEvent(ctx, start), range: activeRange(ctx, start),
  }));
  return ctx;
}

function latestStarting(rows, date) {
  let low = 0, high = rows.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (rows[middle].started_on <= date) low = middle + 1;
    else high = middle;
  }
  return low ? rows[low - 1] : null;
}

function activeEvent(ctx, date) {
  return latestStarting(ctx.doc.events, date);
}

function activeRange(ctx, date) {
  const period = latestStarting(ctx.doc.ranges || [], date);
  return period && date <= period.ended_on ? period : null;
}

function emptyRow(date, event = null, period = null) {
  return {checkin_date: date, sober_today: null, alcohol_units: null, alcohol_cost_eur: null, status_source: 'unknown', units_source: 'unknown', cost_source: 'unknown', event_id: event?.id || null, range_id: period?.id || null, occasion_id: null};
}

function baseRow(ctx, date, selected) {
  if (date > ctx.today) return emptyRow(date);
  const event = selected ? selected.event : activeEvent(ctx, date);
  const period = selected ? selected.range : activeRange(ctx, date);
  if (!period && date < ctx.doc.baseline.started_on) return emptyRow(date, event);
  const reference = period || event || ctx.doc.baseline;
  const source = period ? 'range' : event ? 'period' : 'baseline';
  return {
    checkin_date: date, sober_today: period || event ? reference.state === 'abstinent' : null,
    alcohol_units: reference.units_week / 7, alcohol_cost_eur: reference.cost_week / 7,
    status_source: source, units_source: source, cost_source: source,
    event_id: event?.id || null, range_id: period?.id || null, occasion_id: null,
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
    row.occasion_id = occasion.id;
  }
  return withProvenance({...row, provisional: date === ctx.today});
}

function actualTodayRow(ctx) {
  return effectiveRow(ctx, ctx.today, emptyRow(ctx.today, activeEvent(ctx, ctx.today), activeRange(ctx, ctx.today)));
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
        add(acc, baseRow(ctx, from, segment), dayDiff(until, from));
        const referenceFrom = from > referenceStart ? from : referenceStart;
        if (until > referenceFrom) add(referenceAcc, baseRow(ctx, referenceFrom, segment), dayDiff(until, referenceFrom));
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
export function timelineSummary(doc, checks = [], start, end, today = dayKey(), now = new Date()) {
  return summarize(context(doc, checks, today, now), start, end);
}

/** Intended for bounded charts/export. Values retain daily estimate precision. */
export function timelineRows(doc, checks = [], start, end, today = dayKey(), now = new Date()) {
  const ctx = context(doc, checks, today, now), window = range(start, end, today);
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
    const sober = baseRow(ctx, segment.start, segment).sober_today === true;
    while (index < ctx.exceptions.length && ctx.exceptions[index] < segment.start) index++;
    while (index < ctx.exceptions.length && ctx.exceptions[index] < segment.end) {
      const day = ctx.exceptions[index++];
      append(cursor, day, sober);
      const next = moveDay(day, 1);
      append(day, next, effectiveRow(ctx, day, baseRow(ctx, day, segment)).sober_today === true);
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

/** Displayable effective history, split only at declarations and real exceptions. */
function effectivePeriods(ctx) {
  const result = [];
  function append(start, until, input) {
    start = start < ctx.historyStart ? ctx.historyStart : start;
    if (until <= start) return;
    const row = withProvenance(input);
    const fields = {
      state: row.sober_today === true ? 'abstinent' : row.sober_today === false ? 'drinking' : 'unknown',
      source: row.source, event_id: row.event_id, range_id: row.range_id, occasion_id: row.occasion_id,
      units_week: row.alcohol_units !== null && ESTIMATED.has(row.units_source) ? round2(row.alcohol_units * 7) : null,
      cost_week: row.alcohol_cost_eur !== null && ESTIMATED.has(row.cost_source) ? round2(row.alcohol_cost_eur * 7) : null,
      units: ACTUAL.has(row.units_source) ? row.alcohol_units : null,
      cost: ACTUAL.has(row.cost_source) ? row.alcohol_cost_eur : null,
      provisional: Boolean(row.provisional),
    };
    const last = result.at(-1), end = moveDay(until, -1);
    if (last && moveDay(last.end, 1) === start && Object.keys(fields).every(key => last[key] === fields[key])) last.end = end;
    else result.push({start, end, ...fields});
  }
  let index = 0;
  for (const segment of ctx.segments) {
    let cursor = segment.start;
    const base = baseRow(ctx, segment.start, segment);
    while (index < ctx.exceptions.length && ctx.exceptions[index] < segment.start) index++;
    while (index < ctx.exceptions.length && ctx.exceptions[index] < segment.end) {
      const day = ctx.exceptions[index++], next = moveDay(day, 1);
      append(cursor, day, base);
      append(day, next, effectiveRow(ctx, day, baseRow(ctx, day, segment)));
      cursor = next;
    }
    append(cursor, segment.end, base);
  }
  // Today's state is useful for navigation; its estimated quantity/cost never
  // contributes a completed day or a monetary credit to totals and records.
  append(ctx.today, moveDay(ctx.today, 1), effectiveRow(ctx, ctx.today));
  return result;
}

/** Facts the user has seen when explicitly confirming a last-drink time. */
export function timelineStopBasis(doc, checks = [], date) {
  parseDay(date);
  const identifier = value => typeof value === 'string' ? (UUID.test(value) ? value.toLowerCase() : value) : null;
  const amount = (value, max) => {const valueKnown = known(value, max); return valueKnown === null ? null : round2(valueKnown);};
  const occasion = (doc?.occasions || []).find(row => row.date === date);
  const range = (doc?.ranges || []).find(row => row.state === 'drinking' && row.started_on <= date && row.ended_on >= date);
  let check = null;
  for (const row of Array.isArray(checks) ? checks : []) if (row?.checkin_date === date) check = row;
  const sober = typeof check?.sober_today === 'boolean' ? check.sober_today : null;
  const units = known(check?.alcohol_units, 1000), cost = known(check?.alcohol_cost_eur, 1000000);
  return JSON.stringify({
    occasion: occasion ? {id: identifier(occasion.id), date, units: amount(occasion.units, 1000), cost: amount(occasion.cost, 1000000)} : null,
    range: range ? {id: identifier(range.id), started_on: range.started_on, ended_on: range.ended_on, state: 'drinking', units_week: amount(range.units_week, 7000), cost_week: amount(range.cost_week, 7000000)} : null,
    legacy: check && (sober !== null || units !== null || cost !== null) ? {
      id: identifier(check.id), checkin_date: date, sober_today: sober,
      alcohol_units: units, alcohol_cost_eur: cost,
      updated_at: typeof check.updated_at === 'string' ? check.updated_at : null,
    } : null,
  });
}

/**
 * Keep the persisted v3 basis unchanged, but compare facts about drinking.
 * Purchases and record timestamps do not locate a new last drink; a new sober
 * daily answer likewise cannot remove the previously confirmed minute clock.
 */
function sameStopConsumptionBasis(expectedText, actualText, date) {
  if (expectedText === actualText) return true;
  const keys = (value, fields) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
  const identifier = value => value === null || typeof value === 'string';
  const quantity = (value, maximum, positive = false) => value === null
    || typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum && (!positive || value > 0);
  const day = value => {
    if (typeof value !== 'string' || value < FIRST_DAY) return false;
    try { parseDay(value); return true; } catch { return false; }
  };
  function valid(basis) {
    if (!keys(basis, ['occasion', 'range', 'legacy'])) return false;
    const occasion = basis.occasion, range = basis.range, legacy = basis.legacy;
    if (occasion !== null && (!keys(occasion, ['id', 'date', 'units', 'cost'])
      || !identifier(occasion.id) || occasion.date !== date || !quantity(occasion.units, 1000, true)
      || !quantity(occasion.cost, 1000000))) return false;
    if (range !== null && (!keys(range, ['id', 'started_on', 'ended_on', 'state', 'units_week', 'cost_week'])
      || !identifier(range.id) || !day(range.started_on) || !day(range.ended_on)
      || range.started_on > date || range.ended_on < date || range.state !== 'drinking'
      || !quantity(range.units_week, 7000, true) || !quantity(range.cost_week, 7000000))) return false;
    if (legacy !== null && (!keys(legacy, ['id', 'checkin_date', 'sober_today', 'alcohol_units', 'alcohol_cost_eur', 'updated_at'])
      || !identifier(legacy.id) || legacy.checkin_date !== date
      || ![null, true, false].includes(legacy.sober_today) || !quantity(legacy.alcohol_units, 1000)
      || !quantity(legacy.alcohol_cost_eur, 1000000)
      || !(legacy.updated_at === null || typeof legacy.updated_at === 'string'))) return false;
    return true;
  }
  try {
    const expected = JSON.parse(expectedText), actual = JSON.parse(actualText);
    if (!valid(expected) || !valid(actual)) return false;
    const occasion = row => row && [row.id, row.date, row.units];
    const range = row => row && [row.id, row.started_on, row.ended_on, row.state, row.units_week];
    const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
    if (!same(occasion(expected.occasion), occasion(actual.occasion))
      || !same(range(expected.range), range(actual.range))) return false;
    const drinking = row => row && (row.sober_today === false || row.alcohol_units > 0)
      ? [row.id, row.checkin_date, row.sober_today, row.alcohol_units] : null;
    if (same(drinking(expected.legacy), drinking(actual.legacy))) return true;
    // A craving-only daily record must carry sober_today=false (NOT NULL) when
    // its day already has a canonical occasion. No extra quantity is asserted.
    // The occasion's identity and quantity were checked above; a new positive
    // legacy quantity or a changed existing drinking record still invalidates.
    return expected.legacy === null && actual.occasion !== null
      && actual.legacy?.sober_today === false && actual.legacy.alcohol_units === null;
  } catch { return false; }
}

function stopClock(ctx, history, todayRow) {
  const event = ctx.doc.events.at(-1);
  const clock = {startedAt: event.state === 'abstinent' ? event.stopped_at || null : null,
    date: event.state === 'abstinent' ? event.started_on : null, timeZone: ctx.doc.timezone, valid: false, reason: null};
  if (event.state !== 'abstinent') return {...clock, reason: 'not-abstinent'};
  if (!event.stopped_at) return {...clock, reason: 'time-unknown'};
  // An explicit later drinking declaration always interrupts a previous clock,
  // even if day-level corrections would hide one of its estimated daily rows.
  if ((ctx.doc.ranges || []).some(row => row.state === 'drinking' && row.ended_on > event.started_on)
    || history.some(row => row.state === 'drinking' && row.end > event.started_on)) {
    return {...clock, reason: 'later-consumption'};
  }
  const basis = timelineStopBasis(ctx.doc, [...ctx.legacy.values()], event.started_on);
  if (!sameStopConsumptionBasis(event.stop_basis, basis, event.started_on)) return {...clock, reason: 'consumption-changed'};
  if (todayRow.sober_today !== true) {
    const declared = JSON.parse(basis);
    const sameDay = ctx.today === event.started_on && (
      declared.occasion || declared.range?.ended_on === event.started_on
      || declared.legacy?.sober_today === false || declared.legacy?.alcohol_units > 0
    );
    if (!sameDay) return {...clock, reason: 'not-abstinent'};
  }
  return {...clock, valid: true};
}

export function timelineSnapshot(doc, checks = [], today = dayKey(), now = new Date()) {
  const ctx = context(doc, checks, today, now);
  const event = ctx.doc.events.at(-1);
  const period = activeRange(ctx, today), declaration = period || event;
  const todayRow = effectiveRow(ctx, today), realToday = actualTodayRow(ctx);
  const periods = soberPeriods(ctx);
  const bestPeriods = [...periods].sort((a, b) => b.days - a.days || b.start.localeCompare(a.start));
  const currentPeriod = periods.find(period => period.ongoing);
  const history = effectivePeriods(ctx);
  return {
    current: {
      event, range: period, state: todayRow.sober_today === true ? 'abstinent' : 'drinking', source: todayRow.status_source,
      started_on: declaration.started_on, days: dayDiff(today, declaration.started_on),
      units_week: declaration.units_week, cost_week: declaration.cost_week,
    },
    totalSoberDays: periods.reduce((total, period) => total + period.days, 0),
    currentStreak: currentPeriod?.days || 0,
    currentStreakStartedOn: todayRow.sober_today === true ? currentPeriod?.start || today : null,
    bestStreak: bestPeriods[0]?.days || 0,
    bestPeriods, effectivePeriods: history, todayActual: realToday,
    lastConsumptionOn: history.findLast(period => period.state === 'drinking')?.end || null,
    stopClock: stopClock(ctx, history, todayRow),
    historyStart: ctx.historyStart,
    firstEventDate: ctx.doc.events[0].started_on,
    summary: summarize(ctx, ctx.historyStart, today),
  };
}
