import test from 'node:test';
import assert from 'node:assert/strict';
import {moveDay} from '../core.mjs';
import {zonedDateTimeToInstant} from '../time-core.mjs';
import {validateTimelineDocument, upgradeTimelineDocument, timelineSnapshot, timelineStopBasis, upsertTimelineRange} from '../timeline-core.mjs';
import {healthJourney, stageProgress, mergeHealthObservations} from '../health-core.mjs';

const today = '2026-10-25', now = '2026-10-25T12:30:00Z';
const id = n => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const event = (n, started_on, state = 'abstinent', units_week = 0) => ({id: id(n), started_on, state, units_week, cost_week: 0, note: ''});
const occasion = (n, date, units = 2, cost = 10) => ({id: id(n), date, units, cost});
const document = (date = today, time = '13:10', checks = []) => {
  const doc = {
    schema_version: 3, timezone: 'Europe/Paris', baseline: {started_on: '2020-01-01', units_week: 14, cost_week: 70},
    events: [event(1, date)], occasions: [], ranges: [],
    goal: {mode: 'abstain', weekly_limit: null, daily_limit: null, target_on: null, why: '', triggers: [], support_first: false, planned_action: ''},
  };
  if (time !== null) {
    doc.events[0].stopped_at = zonedDateTimeToInstant(date, time, doc.timezone);
    doc.events[0].stop_basis = timelineStopBasis(doc, checks, date);
  }
  return doc;
};
const confirm = (doc, checks = []) => {const row = doc.events.at(-1); row.stop_basis = timelineStopBasis(doc, checks, row.started_on); return doc;};
const stages = [0, 20, 60, 360, 1440, 2880, 10080, 40320].map(fromMinutes => ({id: `m-${fromMinutes}`, fromMinutes}));

test('v3 saves a confirmed minute clock and older schemas never acquire invented times', () => {
  const doc = document(), before = JSON.stringify(doc);
  const saved = validateTimelineDocument(doc, today, now);
  assert.equal(saved.events[0].stopped_at, '2026-10-25T12:10:00.000Z');
  assert.equal(upgradeTimelineDocument(saved, today, now).schema_version, 3);
  assert.equal(JSON.stringify(doc), before);
  for (const version of [1, 2]) {
    const old = document(today, null); old.schema_version = version;
    if (version === 1) delete old.ranges;
    assert.equal('stopped_at' in validateTimelineDocument(old, today, now).events[0], false);
    old.events[0].stopped_at = saved.events[0].stopped_at; old.events[0].stop_basis = saved.events[0].stop_basis;
    assert.throws(() => validateTimelineDocument(old, today, now), /champ inconnu/);
  }
  const unknown = document(today, null); Object.assign(unknown.events[0], {stopped_at: null, stop_basis: null});
  assert.equal(validateTimelineDocument(unknown, today, now).events[0].stopped_at, null);
});

test('clock validation rejects future, mismatched, malformed or unpaired timestamps and oversized provenance', () => {
  const mutations = [
    doc => {doc.events[0].stopped_at = '2026-10-25T12:31:00Z';},
    doc => {doc.events[0].stopped_at = '2026-10-24T12:10:00Z';},
    doc => {doc.events[0].stopped_at = '2026-02-30T12:10:00Z';},
    doc => {doc.events[0].stopped_at = '2026-10-25T13:10:00+01:00';},
    doc => {doc.events[0].stopped_at = '2026-10-25T12:10:30Z';},
    doc => {delete doc.events[0].stop_basis;},
    doc => {delete doc.events[0].stopped_at;},
    doc => {doc.events[0].stop_basis = '[]';},
    doc => {doc.events[0].stop_basis = 'null';},
    doc => {doc.events[0].stop_basis = '{bad json';},
    doc => {doc.events[0].stop_basis = JSON.stringify({large: 'x'.repeat(16384)});},
    doc => {doc.events[0].state = 'drinking'; doc.events[0].units_week = 7;},
  ];
  for (const mutate of mutations) {const doc = document(); mutate(doc); assert.throws(() => validateTimelineDocument(doc, today, now));}
});

test('twenty minutes of abstinence is exact and does not become a whole sober day', () => {
  const snapshot = timelineSnapshot(document(), [], today, now), journey = healthJourney(snapshot, today, now);
  assert.equal(snapshot.stopClock.valid, true);
  assert.equal(snapshot.currentStreak, 0);
  assert.equal(snapshot.totalSoberDays, 0);
  assert.equal(journey.active, true);
  assert.equal(journey.precision, 'minute');
  assert.equal(journey.elapsedMinutes, 20);
  assert.equal(journey.elapsedDays, 0);
  assert.equal(journey.hours, 0);
  assert.equal(journey.minutes, 20);
  assert.equal(journey.elapsedLabel, '20 min');
  const progress = stageProgress(snapshot, stages, today, now);
  assert.equal(progress.stageIndex, 1);
  assert.equal(progress.stages[1].state, 'current');
  assert.equal(progress.stages[2].state, 'future');
  assert.equal(progress.stages[2].targetAt, '2026-10-25T13:10:00.000Z');
  assert.equal(progress.stages[2].targetDate, today);
  assert.equal(progress.stages[2].approx, false);
  assert.equal(stageProgress(snapshot, stages, today, '2026-10-25T12:29:59Z').stageIndex, 0);
});

test('a confirmed last drink may follow consumption on the same date without rewriting the alcohol ledger', () => {
  const doc = document(); doc.occasions.push(occasion(2, today)); confirm(doc);
  const snapshot = timelineSnapshot(doc, [], today, now);
  assert.equal(snapshot.current.state, 'drinking');
  assert.equal(snapshot.todayActual.alcohol_units, 2);
  assert.equal(snapshot.summary.units, 2);
  assert.equal(snapshot.summary.cost, 10);
  assert.equal(snapshot.totalSoberDays, 0);
  assert.equal(snapshot.stopClock.valid, true);
  assert.equal(healthJourney(snapshot, today, now).elapsedMinutes, 20);
  const dayAfter = '2026-10-26', oneDayLater = '2026-10-26T12:10:00Z';
  const later = timelineSnapshot(doc, [], dayAfter, oneDayLater);
  assert.equal(later.currentStreak, 0);
  assert.equal(later.totalSoberDays, 0);
  assert.equal(healthJourney(later, dayAfter, oneDayLater).elapsedDays, 1);
});

test('a new same-date consumption invalidates the clock until explicit reconfirmation', () => {
  const doc = document();
  doc.occasions.push(occasion(2, today));
  let snapshot = timelineSnapshot(doc, [], today, now);
  assert.equal(snapshot.stopClock.valid, false);
  assert.equal(snapshot.stopClock.reason, 'consumption-changed');
  assert.equal(snapshot.stopClock.startedAt, doc.events[0].stopped_at);
  assert.equal(healthJourney(snapshot, today, now).elapsedMinutes, null);
  confirm(doc);
  assert.equal(timelineSnapshot(doc, [], today, now).stopClock.valid, true);
  doc.occasions[0].units = 3;
  assert.equal(timelineSnapshot(doc, [], today, now).stopClock.valid, false);
  confirm(doc);
  assert.equal(timelineSnapshot(doc, [], today, now).stopClock.valid, true);
});

test('consumption strictly after the declared stop invalidates the old clock even if abstinence resumes', () => {
  const start = moveDay(today, -10), doc = document(start);
  doc.occasions.push(occasion(2, moveDay(today, -3)));
  const snapshot = timelineSnapshot(doc, [], today, now);
  assert.equal(snapshot.stopClock.valid, false);
  assert.equal(snapshot.stopClock.reason, 'later-consumption');
  assert.equal(snapshot.current.state, 'abstinent');
  const journey = healthJourney(snapshot, today, now);
  assert.equal(journey.precision, 'day');
  assert.equal(journey.startDate, moveDay(today, -2));
  assert.equal(journey.elapsedMinutes, null);
  const rows = [{checkin_date: moveDay(today, -5), mood: 3}];
  assert.equal(mergeHealthObservations(rows, [], today).length, 1);
});

test('a later explicit drinking event prevents recycling an old stop time', () => {
  const doc = document(moveDay(today, -10));
  doc.events.push(event(2, moveDay(today, -2), 'drinking', 7));
  const snapshot = timelineSnapshot(doc, [], today, now);
  assert.equal(snapshot.stopClock.valid, false);
  assert.equal(snapshot.stopClock.startedAt, null);
  assert.equal(snapshot.stopClock.reason, 'not-abstinent');
  doc.events.push(event(3, today));
  const restarted = healthJourney(timelineSnapshot(doc, [], today, now), today, now);
  assert.equal(restarted.active, true);
  assert.equal(restarted.precision, 'day');
  assert.equal(restarted.elapsedMinutes, null);
});

test('a drinking range ending on the stop date can coexist with a clock, a later range cannot', () => {
  const doc = document();
  doc.ranges.push({...event(2, moveDay(today, -3), 'drinking', 14), ended_on: today}); confirm(doc);
  const snapshot = timelineSnapshot(doc, [], today, now);
  assert.equal(snapshot.current.state, 'drinking');
  assert.equal(snapshot.stopClock.valid, true);
  const earlier = document(moveDay(today, -4));
  const ranged = upsertTimelineRange(earlier, {...event(3, moveDay(today, -5), 'drinking', 14), ended_on: moveDay(today, -2)}, today, now);
  confirm(ranged);
  const blocked = timelineSnapshot(ranged, [], today, now);
  assert.equal(blocked.current.state, 'abstinent');
  assert.equal(blocked.stopClock.valid, false);
  assert.equal(blocked.stopClock.reason, 'later-consumption');
  assert.equal(ranged.schema_version, 3);
});

test('the stored basis retains its v3 shape while feelings, purchases and timestamps preserve the clock', () => {
  const doc = document();
  const checks = [{id: id(3), checkin_date: today, sober_today: false, alcohol_units: 2, alcohol_cost_eur: 5, updated_at: '2026-10-25T12:00:00Z', mood: 2, note: 'initial'}];
  confirm(doc, checks);
  const original = doc.events[0].stop_basis;
  assert.equal(JSON.parse(original).legacy.updated_at, checks[0].updated_at);
  checks[0].mood = 5; checks[0].note = 'other'; doc.events[0].note = 'other';
  assert.equal(timelineStopBasis(doc, checks, today), original);
  assert.equal(timelineSnapshot(doc, checks, today, now).stopClock.valid, true);
  checks[0].updated_at = '2026-10-25T12:15:00Z';
  checks[0].alcohol_cost_eur = 25; checks[0].craving = 0;
  assert.notEqual(timelineStopBasis(doc, checks, today), original);
  assert.equal(timelineSnapshot(doc, checks, today, now).stopClock.valid, true);
  assert.equal(healthJourney(timelineSnapshot(doc, checks, today, now), today, now).elapsedMinutes, 20);
  assert.equal(doc.events[0].stop_basis, original, 'Reading must not rewrite the persisted confirmation');
  assert.equal(JSON.parse(timelineStopBasis(doc, [{checkin_date: today, mood: 4}], today)).legacy, null);
});

test('a first sober daily answer on the stop date preserves the declared minute, including purchases', () => {
  for (const start of [today, moveDay(today, -1)]) {
    const doc = document(start), original = doc.events[0].stop_basis;
    const expected = healthJourney(timelineSnapshot(doc, [], today, now), today, now).elapsedMinutes;
    const checks = [{id: id(3), checkin_date: start, sober_today: true, alcohol_units: 0, alcohol_cost_eur: 12, craving: 0}];
    const snapshot = timelineSnapshot(doc, checks, today, now);
    assert.equal(snapshot.stopClock.valid, true);
    assert.equal(healthJourney(snapshot, today, now).precision, 'minute');
    assert.equal(healthJourney(snapshot, today, now).elapsedMinutes, expected);
    assert.equal(doc.events[0].stop_basis, original);
    if (start === today) {assert.equal(snapshot.totalSoberDays, 0); assert.equal(snapshot.todayActual.sober_today, true);}
  }
});

test('a craving-only legacy marker under an unchanged canonical occasion preserves time and the alcohol ledger', () => {
  const doc = document(); doc.occasions.push(occasion(2, today)); confirm(doc);
  const original = doc.events[0].stop_basis;
  const checks = [{id: id(3), checkin_date: today, sober_today: false, alcohol_units: null, alcohol_cost_eur: null, craving: 3}];
  const snapshot = timelineSnapshot(doc, checks, today, now), journey = healthJourney(snapshot, today, now);
  assert.equal(snapshot.stopClock.valid, true); assert.equal(journey.precision, 'minute');
  assert.equal(journey.elapsedMinutes, 20); assert.equal(snapshot.totalSoberDays, 0);
  assert.equal(snapshot.todayActual.sober_today, false); assert.equal(snapshot.todayActual.alcohol_units, 2);
  assert.equal(snapshot.todayActual.alcohol_cost_eur, 10); assert.equal(doc.events[0].stop_basis, original);
  checks[0].craving = 0; checks[0].mood = 5;
  assert.equal(timelineSnapshot(doc, checks, today, now).stopClock.valid, true);
  checks[0].alcohol_units = 2;
  assert.equal(timelineSnapshot(doc, checks, today, now).stopClock.reason, 'consumption-changed');
});

test('new drinking without a canonical occasion still invalidates, even when its quantity is unknown', () => {
  for (const alcohol_units of [null, 2]) {
    const doc = document();
    const checks = [{id: id(3), checkin_date: today, sober_today: false, alcohol_units, alcohol_cost_eur: null, craving: 3}];
    assert.equal(timelineSnapshot(doc, checks, today, now).stopClock.reason, 'consumption-changed');
  }
});

test('drinking legacy identities, statuses and quantities remain protected after confirmation', () => {
  for (const alcohol_units of [null, 2]) {
    const initial = {id: id(3), checkin_date: today, sober_today: false, alcohol_units, alcohol_cost_eur: 5};
    const doc = document(today, '13:10', [initial]);
    for (const changed of [
      {...initial, id: id(4)}, {...initial, alcohol_units: alcohol_units === null ? 2 : 3},
      {...initial, sober_today: true, alcohol_units: 0},
    ]) assert.equal(timelineSnapshot(doc, [changed], today, now).stopClock.reason, 'consumption-changed');
    assert.equal(timelineSnapshot(doc, [{...initial, alcohol_cost_eur: 20, craving: 8}], today, now).stopClock.valid, true);
  }
});

test('canonical purchase corrections preserve time but occasion identity and quantity changes do not', () => {
  const doc = document(); doc.occasions.push(occasion(2, today)); confirm(doc);
  doc.occasions[0].cost = 0;
  assert.equal(timelineSnapshot(doc, [], today, now).stopClock.valid, true);
  doc.occasions[0].id = id(4);
  assert.equal(timelineSnapshot(doc, [], today, now).stopClock.reason, 'consumption-changed');
  doc.occasions[0].id = id(2); doc.occasions[0].units = 3;
  assert.equal(timelineSnapshot(doc, [], today, now).stopClock.reason, 'consumption-changed');
});

test('a drinking range budget is independent of its identity, boundaries and quantity', () => {
  const doc = document();
  doc.ranges.push({...event(2, moveDay(today, -3), 'drinking', 14), ended_on: today, cost_week: 35}); confirm(doc);
  doc.ranges[0].cost_week = 70;
  assert.equal(timelineSnapshot(doc, [], today, now).stopClock.valid, true);
  doc.ranges[0].units_week = 21;
  assert.equal(timelineSnapshot(doc, [], today, now).stopClock.reason, 'consumption-changed');
  doc.ranges[0].units_week = 14; doc.ranges[0].id = id(4);
  assert.equal(timelineSnapshot(doc, [], today, now).stopClock.reason, 'consumption-changed');
});

test('a sparse purchase-only record is not a drinking declaration', () => {
  const doc = document();
  const checks = [{id: id(3), checkin_date: today, sober_today: null, alcohol_units: null, alcohol_cost_eur: 12}];
  assert.equal(timelineSnapshot(doc, checks, today, now).stopClock.valid, true);
  assert.equal(healthJourney(timelineSnapshot(doc, checks, today, now), today, now).elapsedMinutes, 20);
});

test('later legacy consumption still interrupts the earlier clock', () => {
  const doc = document(moveDay(today, -2));
  const checks = [{id: id(3), checkin_date: moveDay(today, -1), sober_today: false, alcohol_units: null, alcohol_cost_eur: null}];
  const snapshot = timelineSnapshot(doc, checks, today, now);
  assert.equal(snapshot.stopClock.reason, 'later-consumption');
  assert.equal(healthJourney(snapshot, today, now).elapsedMinutes, null);
});

test('semantic comparison accepts key ordering but rejects incomplete or malformed stored provenance', () => {
  const doc = document();
  doc.events[0].stop_basis = JSON.stringify({legacy: null, range: null, occasion: null});
  assert.equal(timelineSnapshot(doc, [], today, now).stopClock.valid, true);
  for (const basis of [
    {}, {occasion: null, range: null}, {occasion: null, range: null, legacy: null, unknown: true},
    {occasion: null, range: null, legacy: {sober_today: true}},
    {occasion: null, range: null, legacy: {id: id(3), checkin_date: today, sober_today: 'false', alcohol_units: 0, alcohol_cost_eur: null, updated_at: null}},
  ]) {
    doc.events[0].stop_basis = JSON.stringify(basis);
    assert.equal(timelineSnapshot(doc, [], today, now).stopClock.reason, 'consumption-changed');
  }
});

test('changing a historical stop date requires a matching instant and recomputes elapsed duration', () => {
  const doc = document(moveDay(today, -2));
  assert.equal(healthJourney(timelineSnapshot(doc, [], today, now), today, now).elapsedMinutes, 2960);
  doc.events[0].started_on = moveDay(today, -1);
  assert.throws(() => validateTimelineDocument(doc, today, now), /correspondre à la date/);
  doc.events[0].stopped_at = zonedDateTimeToInstant(doc.events[0].started_on, '13:10', doc.timezone);
  confirm(doc);
  const journey = healthJourney(timelineSnapshot(doc, [], today, now), today, now);
  assert.equal(journey.elapsedMinutes, 1520);
  assert.equal(journey.elapsedDays, 1);
});

test('unknown hours never generate minute values or sub-day target dates', () => {
  const doc = document(today, null), snapshot = timelineSnapshot(doc, [], today, now);
  const progress = stageProgress(snapshot, stages, today, now);
  assert.equal(progress.active, true);
  assert.equal(progress.precision, 'day');
  assert.equal(progress.elapsedMinutes, null);
  assert.equal(progress.startedAt, null);
  assert.equal(progress.stageIndex, 0);
  for (const stage of progress.stages.filter(row => row.fromMinutes < 1440)) {
    assert.equal(stage.state, 'information');
    assert.equal(stage.targetAt, null);
    assert.equal(stage.targetDate, null);
  }
  assert.equal(progress.stages[4].targetDate, moveDay(today, 1));
  assert.equal(progress.stages[4].approx, true);
  const older = stageProgress(timelineSnapshot(document(moveDay(today, -7), null), [], today, now), stages, today, now);
  assert.equal(older.stageIndex, 6);
  assert.equal(older.stages[6].state, 'current');
  assert.equal(older.stages[6].approx, true);
  assert.equal(older.stages[1].state, 'information');
});

test('real-hour milestones cross daylight saving boundaries without treating a date as 24 hours', () => {
  const date = '2026-03-29', instant = '2026-03-29T10:00:00Z';
  const doc = document('2026-03-28', '12:00');
  const snapshot = timelineSnapshot(doc, [], date, instant);
  const progress = stageProgress(snapshot, stages, date, instant);
  assert.equal(snapshot.currentStreak, 1);
  assert.equal(progress.calendarDays, 1);
  assert.equal(progress.elapsedMinutes, 1380);
  assert.equal(progress.elapsedDays, 0);
  assert.equal(progress.stages[4].state, 'future');
  assert.equal(progress.stages[4].targetAt, '2026-03-29T11:00:00.000Z');
});

test('invalid or unconfirmed snapshot clocks cannot masquerade as exact elapsed time', () => {
  const good = timelineSnapshot(document(), [], today, now);
  for (const clock of [
    {...good.stopClock, valid: false},
    {...good.stopClock, startedAt: '2026-10-25T12:40:00Z'},
    {...good.stopClock, startedAt: 'bad'},
    {...good.stopClock, date: '2026-10-24'},
    {...good.stopClock, date: '2026-10-26', startedAt: '2026-10-25T12:10:00Z'},
    {...good.stopClock, timeZone: 'Invalid/Zone'},
  ]) {
    const journey = healthJourney({...good, stopClock: clock}, today, now);
    assert.equal(journey.precision, 'day');
    assert.equal(journey.elapsedMinutes, null);
  }
  const futureDate = {...good.stopClock, date: '2026-10-26', startedAt: '2026-10-26T11:00:00Z'};
  assert.equal(healthJourney({...good, stopClock: futureDate}, today, '2026-10-26T12:00:00Z').precision, 'day');
});
