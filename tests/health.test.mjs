import test from 'node:test';
import assert from 'node:assert/strict';
import {moveDay} from '../core.mjs';
import {timelineSnapshot, upsertTimelineRange} from '../timeline-core.mjs';
import {HEALTH_METRICS, validateHealthEntry, mergeHealthObservations, healthJourney, stageProgress, healthTrends} from '../health-core.mjs';

const today = '2026-10-25';
const ago = days => moveDay(today, -days);
const id = n => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const event = (n, started_on, state = 'abstinent', units_week = 0) => ({id: id(n), started_on, state, units_week, cost_week: 0, note: ''});
const document = (start = ago(30)) => ({
  schema_version: 1, timezone: 'Europe/Paris',
  baseline: {started_on: '2020-01-01', units_week: 14, cost_week: 70},
  events: [event(1, start)], occasions: [],
  goal: {mode: 'abstain', weekly_limit: null, daily_limit: null, target_on: null, why: '', triggers: [], support_first: false, planned_action: ''},
});
const stages = [0, 7, 28, 90, 180, 365].map(fromDays => ({id: `stage-${fromDays}`, fromDays, title: `Repère ${fromDays}`}));
const metric = (rows, key, date = today) => healthTrends(rows, date).find(row => row.key === key);

test('a sparse write preserves missing measurements and never writes alcohol status', () => {
  const input = {checkin_date: ago(2), mood: ' 4 ', energy: '', sleep_quality: '  ', anxiety: '2', note: '  Une journée calme.  ', sober_today: false};
  const before = JSON.stringify(input);
  assert.deepEqual(validateHealthEntry(input, today), {
    checkin_date: ago(2), mood: 4, energy: null, sleep_quality: null, anxiety: 2,
    concentration: null, physical_comfort: null, note: 'Une journée calme.',
  });
  assert.equal(JSON.stringify(input), before);
  assert.equal(HEALTH_METRICS.length, 6);
  assert.equal(HEALTH_METRICS.find(row => row.key === 'anxiety').positive, false);
});

test('health validation rejects false dates, future observations, empty entries and unsafe score coercions', () => {
  for (const date of ['1899-12-31', '2026-02-29', '2026-02-30', '2026-1-02', '', null, moveDay(today, 1)]) {
    assert.throws(() => validateHealthEntry({checkin_date: date, mood: 3}, today));
  }
  for (const value of [0, 6, -1, 2.5, NaN, Infinity, false, true, [], [4], {}, 'n/a', '0x4', '2e0']) {
    assert.throws(() => validateHealthEntry({checkin_date: today, mood: value, energy: 3}, today));
  }
  for (const input of [null, [], {}, {checkin_date: today}, {checkin_date: today, mood: '', note: 'Une note seule'}, {checkin_date: today, mood: null}]) {
    assert.throws(() => validateHealthEntry(input, today));
  }
  assert.throws(() => validateHealthEntry({checkin_date: today, mood: 3, note: 'x'.repeat(1001)}, today));
  assert.throws(() => validateHealthEntry({checkin_date: today, mood: 3, note: {}}, today));
  assert.equal(validateHealthEntry({checkin_date: '2024-02-29', mood: 1, note: 'x'.repeat(1000)}, today).note.length, 1000);
  assert.equal(validateHealthEntry({checkin_date: '1900-01-01', mood: 3}, today).checkin_date, '1900-01-01');
  assert.equal(validateHealthEntry({checkin_date: today, mood: 5, note: ' '}, today).note, null);
});

test('dates before the supported history cannot enter observations or a personal health journey', () => {
  assert.deepEqual(mergeHealthObservations([{checkin_date: '1899-12-31', mood: 4}], [{checkin_date: '1899-12-30', energy: 3}], today), []);
  const journey = healthJourney({current: {state: 'abstinent'}, currentStreakStartedOn: '1899-12-31', currentStreak: 0, lastConsumptionOn: '1899-12-30'}, today);
  assert.equal(journey.active, false);
  assert.equal(journey.lastConsumptionOn, null);
});

test('new observations override only their known fields, retain legacy mood and energy, and deduplicate dates', () => {
  const legacy = [
    {checkin_date: ago(3), mood: 2, energy: 3, sober_today: true, note: 'Ancienne note de consommation'},
    {checkin_date: ago(2), mood: 4, energy: 5, sober_today: false},
    {checkin_date: ago(1), mood: 0, energy: false, sober_today: true},
  ];
  const rows = [
    {checkin_date: ago(3), mood: 5, energy: null, anxiety: 3, note: 'Ressenti'},
    {checkin_date: ago(3), sleep_quality: 4},
    {checkin_date: ago(2), mood: 'bad', energy: '', physical_comfort: 2},
    {checkin_date: moveDay(today, 1), mood: 4},
    {checkin_date: '2026-02-30', mood: 4},
  ];
  const before = JSON.stringify({rows, legacy});
  const result = mergeHealthObservations(rows, legacy, today);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], {
    checkin_date: ago(3), mood: 5, energy: 3, sleep_quality: 4, anxiety: 3,
    concentration: null, physical_comfort: null, note: 'Ressenti',
  });
  assert.equal(result[1].mood, 4);
  assert.equal(result[1].energy, 5);
  assert.equal(result[1].physical_comfort, 2);
  assert.equal(result[1].note, null);
  assert.equal('sober_today' in result[0], false);
  assert.equal(JSON.stringify({rows, legacy}), before);
});

test('changing the stop date recalculates dated milestones without altering stored observations', () => {
  const doc = document(ago(30));
  const observations = [{checkin_date: ago(15), mood: 3}, {checkin_date: ago(2), mood: 4}];
  const before = JSON.stringify(observations);
  const first = stageProgress(timelineSnapshot(doc, [], today), stages, today);
  assert.equal(first.days, 30);
  assert.equal(first.stageIndex, 2);
  assert.equal(first.stages[2].state, 'current');
  assert.equal(first.stages[3].targetDate, moveDay(ago(30), 90));
  doc.events[0].started_on = ago(5);
  const corrected = stageProgress(timelineSnapshot(doc, [], today), stages, today);
  assert.equal(corrected.days, 5);
  assert.equal(corrected.stageIndex, 0);
  assert.equal(corrected.stages[1].targetDate, moveDay(today, 2));
  assert.equal(JSON.stringify(observations), before);
  assert.equal(mergeHealthObservations(observations, [], today).length, 2);
});

test('a retrospectively reported drinking day moves the health start after that day', () => {
  const doc = document();
  doc.occasions.push({id: id(2), date: ago(10), units: 3, cost: 12});
  const snapshot = timelineSnapshot(doc, [], today);
  const journey = healthJourney(snapshot, today);
  assert.deepEqual(journey, {active: true, startDate: ago(9), days: 9, totalSoberDays: 29, lastConsumptionOn: ago(10)});
  assert.equal(snapshot.current.started_on, ago(30));
  assert.equal(stageProgress(snapshot, stages, today).stages[2].targetDate, moveDay(ago(9), 28));
});

test('an inclusive drinking range recalculates the current period and preserves earlier sober days', () => {
  const doc = upsertTimelineRange(document(), {...event(2, ago(10), 'drinking', 14), ended_on: ago(7)}, today);
  const journey = healthJourney(timelineSnapshot(doc, [], today), today);
  assert.deepEqual(journey, {active: true, startDate: ago(6), days: 6, totalSoberDays: 26, lastConsumptionOn: ago(7)});
  const changed = upsertTimelineRange(doc, {...event(2, ago(5), 'drinking', 14), ended_on: ago(3)}, today);
  assert.equal(healthJourney(timelineSnapshot(changed, [], today), today).days, 2);
});

test('a current resumption removes personal projections while retaining observations and earlier history', () => {
  const doc = document();
  doc.events.push(event(2, ago(2), 'drinking', 14));
  const rows = [{checkin_date: ago(20), mood: 2}, {checkin_date: ago(1), mood: 4}];
  const before = JSON.stringify({doc, rows, stages});
  const progress = stageProgress(timelineSnapshot(doc, [], today), stages, today);
  assert.equal(progress.active, false);
  assert.equal(progress.days, null);
  assert.equal(progress.startDate, null);
  assert.equal(progress.totalSoberDays, 28);
  assert.equal(progress.lastConsumptionOn, today);
  assert.equal(progress.stageIndex, -1);
  assert.ok(progress.stages.every(stage => stage.state === 'information' && stage.targetDate === null));
  assert.equal(mergeHealthObservations(rows, [], today).length, 2);
  assert.equal(JSON.stringify({doc, rows, stages}), before);
});

test('a drinking occasion today immediately removes projections despite a declared abstinent period', () => {
  const doc = document();
  doc.occasions.push({id: id(2), date: today, units: 1, cost: 0});
  const snapshot = timelineSnapshot(doc, [], today);
  assert.equal(snapshot.current.event.state, 'abstinent');
  assert.equal(healthJourney(snapshot, today).active, false);
  assert.equal(healthJourney(snapshot, today).totalSoberDays, 30);
});

test('an explicit start today is active day zero and does not award a completed sober day', () => {
  const progress = stageProgress(timelineSnapshot(document(today), [], today), stages, today);
  assert.equal(progress.active, true);
  assert.equal(progress.days, 0);
  assert.equal(progress.totalSoberDays, 0);
  assert.equal(progress.stageIndex, 0);
  assert.equal(progress.stages[0].targetDate, today);
  assert.equal(progress.stages[1].targetDate, moveDay(today, 7));
});

test('missing, unknown, stale or future starts cannot fabricate a personal timeline', () => {
  const good = timelineSnapshot(document(ago(10)), [], today);
  for (const snapshot of [
    null, undefined, {}, {profile: {sobriety_date: ago(90)}},
    {...good, current: {...good.current, state: 'unknown'}},
    {...good, current: {...good.current, source: 'unknown'}},
    {...good, currentStreakStartedOn: null},
    {...good, currentStreakStartedOn: moveDay(today, 1)},
    {...good, currentStreakStartedOn: '2026-02-30'},
    {...good, currentStreak: 20},
    {...good, currentStreak: -1},
    {...good, lastConsumptionOn: today},
  ]) {
    const result = stageProgress(snapshot, stages, today);
    assert.equal(result.active, false);
    assert.equal(result.days, null);
    assert.ok(result.stages.every(stage => stage.targetDate === null));
  }
  assert.equal(healthJourney(null, today).totalSoberDays, null);
  assert.equal(healthJourney({...good, lastConsumptionOn: moveDay(today, 1)}, today).lastConsumptionOn, null);
  assert.equal(healthJourney(good, moveDay(today, 1)).active, false);
});

test('milestone dates and windows remain exact across leap day and Paris clock changes', () => {
  const previousTimezone = process.env.TZ;
  try {
    process.env.TZ = 'Europe/Paris';
    for (const [start, date] of [['2024-02-28', '2024-03-01'], ['2026-03-28', '2026-03-30'], ['2026-10-24', '2026-10-26']]) {
      const snapshot = timelineSnapshot(document(start), [], date);
      const progress = stageProgress(snapshot, [{fromDays: 0}, {fromDays: 2}, {fromDays: 7}], date);
      assert.equal(progress.days, 2);
      assert.equal(progress.stageIndex, 1);
      assert.equal(progress.stages[1].targetDate, date);
      assert.equal(progress.stages[2].targetDate, moveDay(date, 5));
      const rows = [-13, -7, -6, 0].map((offset, index) => ({checkin_date: moveDay(date, offset), mood: index < 2 ? 2 : 4}));
      const trend = metric(rows, 'mood', date);
      assert.equal(trend.currentCount, 2);
      assert.equal(trend.previousCount, 2);
      assert.equal(trend.delta, 2);
    }
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('trends compare only actual observations in adjacent inclusive windows and invert anxiety', () => {
  const rows = [
    {checkin_date: ago(14), mood: 5, anxiety: 1},
    {checkin_date: ago(13), mood: 2, anxiety: 5},
    {checkin_date: ago(7), mood: 2, anxiety: 3},
    {checkin_date: ago(6), mood: 4, anxiety: 2},
    {checkin_date: today, mood: 4, anxiety: 2},
    {checkin_date: moveDay(today, 1), mood: 1, anxiety: 5},
  ];
  const mood = metric(rows, 'mood');
  assert.equal(mood.current, 4);
  assert.equal(mood.previous, 2);
  assert.equal(mood.currentCount, 2);
  assert.equal(mood.previousCount, 2);
  assert.equal(mood.delta, 2);
  assert.equal(mood.direction, 'better');
  const anxiety = metric(rows, 'anxiety');
  assert.equal(anxiety.current, 2);
  assert.equal(anxiety.previous, 4);
  assert.equal(anxiety.delta, -2);
  assert.equal(anxiety.direction, 'better');
  assert.equal(metric(rows, 'energy').current, null);
  assert.equal(metric(rows, 'energy').direction, 'unknown');
});

test('single points, invalid values and duplicate dates cannot produce a claimed trend', () => {
  const rows = [
    {checkin_date: ago(8), mood: 2, anxiety: 3},
    {checkin_date: ago(7), mood: null, anxiety: 3},
    {checkin_date: ago(6), mood: 4, anxiety: 4},
    {checkin_date: ago(6), mood: 5, anxiety: 4},
    {checkin_date: today, mood: '', anxiety: 4},
  ];
  const mood = metric(rows, 'mood');
  assert.equal(mood.current, 5);
  assert.equal(mood.currentCount, 1);
  assert.equal(mood.previousCount, 1);
  assert.equal(mood.delta, null);
  assert.equal(mood.direction, 'unknown');
  assert.equal(metric(rows, 'anxiety').direction, 'worse');
  const stable = metric(rows.map(row => ({...row, anxiety: 3})), 'anxiety');
  assert.equal(stable.direction, 'stable');
  assert.equal(stable.delta, 0);
  assert.throws(() => healthTrends(rows, today, 0));
  assert.throws(() => healthTrends(rows, today, 2.5));
});

test('milestone definitions must be ordered and remain unmodified', () => {
  const snapshot = timelineSnapshot(document(), [], today);
  const before = JSON.stringify(stages);
  stageProgress(snapshot, stages, today);
  assert.equal(JSON.stringify(stages), before);
  for (const invalid of [null, [{fromDays: -1}], [{fromDays: 1.5}], [{fromDays: 7}, {fromDays: 0}], [{fromDays: 0}, {fromDays: 0}]]) {
    assert.throws(() => stageProgress(snapshot, invalid, today));
  }
  assert.equal(stageProgress(snapshot, [], today).stageIndex, -1);
});
