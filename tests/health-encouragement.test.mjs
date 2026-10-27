import test from 'node:test';
import assert from 'node:assert/strict';
import {encouragementSummary} from '../health-encouragement.mjs';
import {stageProgress} from '../health-core.mjs';
import {HEALTH_STAGES} from '../health-evidence.mjs';
import {dayDiff, moveDay} from '../core.mjs';

const today = '2026-10-27';
const now = '2026-10-27T12:00:00Z';
const ago = days => moveDay(today, -days);
const summary = options => encouragementSummary({today, ...options});
const samples = (before, after) => [13, 7, 6, 0].map((days, index) => ({
  checkin_date: ago(days), ...(index < 2 ? before : after),
}));
function progress({start = ago(2), at = start + 'T12:00:00Z', precise = true, active = true, instant = now} = {}) {
  return stageProgress({
    current: {state: active ? 'abstinent' : 'drinking', source: 'period'},
    currentStreak: active ? dayDiff(today, start) : 0,
    currentStreakStartedOn: active ? start : null,
    totalSoberDays: 23, lastConsumptionOn: active ? null : today,
    stopClock: {valid: precise && active, date: start, startedAt: at, timeZone: 'UTC'},
  }, HEALTH_STAGES, today, instant);
}

test('encouragement keeps mental measures first and exposes real averages and sample counts', () => {
  const result = summary({observations: samples({mood: 2, anxiety: 4, concentration: 2}, {mood: 4, anxiety: 2, concentration: 3})});
  assert.deepEqual(result.trends.map(row => row.key), ['mood', 'anxiety', 'concentration', 'energy', 'sleep_quality', 'physical_comfort']);
  assert.deepEqual(result.better.map(row => row.key), ['mood', 'anxiety', 'concentration']);
  const mood = result.better[0];
  assert.deepEqual([mood.before, mood.after, mood.beforeCount, mood.afterCount, mood.scale], [2, 4, 2, 2, 5]);
  assert.equal(mood.before, mood.previous); assert.equal(mood.after, mood.current);
  assert.equal(result.better[1].delta, -2); assert.equal(result.better[1].direction, 'better');
  assert.equal(result.observationCount, 4); assert.equal(result.latestDate, today);
  assert.equal(result.supportiveState, 'improving');
});

test('mixed observations preserve every worse and stable measure alongside the gains', () => {
  const result = summary({observations: samples(
    {mood: 2, anxiety: 1, concentration: 3, energy: 4, sleep_quality: 2, physical_comfort: 3},
    {mood: 4, anxiety: 3, concentration: 3, energy: 2, sleep_quality: 4, physical_comfort: 3},
  ), legacyChecks: samples({craving: 2}, {craving: 5})});
  assert.deepEqual(result.better.map(row => row.key), ['mood', 'sleep_quality']);
  assert.deepEqual(result.worse.map(row => row.key), ['anxiety', 'energy', 'craving']);
  assert.deepEqual(result.stable.map(row => row.key), ['concentration', 'physical_comfort']);
  assert.equal(result.supportiveState, 'mixed');
  assert.match(result.message, /points encore difficiles/);
});

test('a harder period is acknowledged without being called failure', () => {
  const result = summary({observations: samples({energy: 5}, {energy: 3})});
  assert.equal(result.supportiveState, 'difficult');
  assert.equal(result.better.length, 0); assert.equal(result.worse.length, 1);
  assert.match(result.message, /plus difficile/); assert.match(result.message, /n’est pas un échec/);
});

test('unchanged averages produce a steady state, not a fabricated improvement', () => {
  const result = summary({observations: samples({mood: 3, anxiety: 2}, {mood: 3, anxiety: 2})});
  assert.equal(result.supportiveState, 'steady');
  assert.equal(result.better.length, 0); assert.equal(result.worse.length, 0);
  assert.deepEqual(result.stable.map(row => row.delta), [0, 0]);
});

test('one point per window cannot produce a favorable trend even after a large change', () => {
  const result = summary({observations: [{checkin_date: ago(7), mood: 1}, {checkin_date: today, mood: 5}]});
  assert.equal(result.trends[0].before, 1); assert.equal(result.trends[0].after, 5);
  assert.equal(result.trends[0].delta, null); assert.equal(result.trends[0].direction, 'unknown');
  assert.equal(result.supportiveState, 'beginning'); assert.deepEqual(result.better, []);
});

test('empty, invalid and future observations remain empty instead of becoming zero', () => {
  const result = summary({observations: [
    {checkin_date: today, mood: null, energy: ''},
    {checkin_date: today, mood: false, anxiety: 0},
    {checkin_date: moveDay(today, 1), mood: 5},
    {checkin_date: '2026-02-30', mood: 5},
    {checkin_date: '1899-12-31', mood: 5},
  ]});
  assert.equal(result.supportiveState, 'empty'); assert.equal(result.observationCount, 0);
  assert.equal(result.latestDate, null); assert.equal(result.cravingTrend, null);
  assert.ok(result.trends.every(row => row.before === null && row.after === null && row.delta === null));
  assert.throws(() => encouragementSummary({today: 'not-a-date'}));
});

test('legacy mood and energy are merged per field without double-counting dates', () => {
  const result = summary({
    legacyChecks: [{checkin_date: today, mood: 1, energy: 3, craving: 4}],
    observations: [{checkin_date: today, mood: 4}, {checkin_date: today, mood: 5, energy: null}],
  });
  assert.equal(result.observationCount, 1);
  assert.equal(result.trends.find(row => row.key === 'mood').after, 5);
  assert.equal(result.trends.find(row => row.key === 'energy').after, 3);
  assert.equal(result.cravingTrend.after, 4);
  assert.equal(result.supportiveState, 'beginning');
});

test('craving zero is a valid observation and a decrease is favorable with enough data', () => {
  const result = summary({legacyChecks: samples({craving: 8}, {craving: '0'})});
  const trend = result.cravingTrend;
  assert.deepEqual([trend.before, trend.after, trend.beforeCount, trend.afterCount, trend.delta, trend.scale], [8, 0, 2, 2, -8, 10]);
  assert.equal(trend.direction, 'better'); assert.equal(trend.positive, false);
  assert.deepEqual(result.better.map(row => row.key), ['craving']);
  assert.equal(result.supportiveState, 'improving');
  assert.equal(result.observationCount, 0); assert.equal(result.latestDate, null);
  assert.ok(result.trends.every(row => row.current === null));
});

test('absent craving values, coercions and old observations never create a zero or a trend', () => {
  for (const craving of [undefined, null, '', ' ', false, true, [], {}, NaN, Infinity, -1, 11, '0x0', '2.5']) {
    assert.equal(summary({legacyChecks: samples({craving}, {craving})}).cravingTrend, null);
  }
  assert.equal(summary({legacyChecks: [{checkin_date: ago(14), craving: 5}, {checkin_date: moveDay(today, 1), craving: 0}]}).cravingTrend, null);
});

test('craving comparisons need two distinct dates in each inclusive seven-day window', () => {
  const rows = samples({craving: 6}, {craving: 2});
  const result = summary({legacyChecks: [rows[1], {...rows[1]}, rows[2], rows[3]]});
  assert.equal(result.cravingTrend.beforeCount, 1); assert.equal(result.cravingTrend.afterCount, 2);
  assert.equal(result.cravingTrend.delta, null); assert.equal(result.cravingTrend.direction, 'unknown');
  const cleared = summary({legacyChecks: [...rows, {checkin_date: today, craving: null}]});
  assert.equal(cleared.cravingTrend.afterCount, 1); assert.equal(cleared.cravingTrend.delta, null);
});

test('craving difficulty cannot be hidden by improved wellbeing', () => {
  const result = summary({observations: samples({mood: 2}, {mood: 4}), legacyChecks: samples({craving: 1}, {craving: 6})});
  assert.equal(result.supportiveState, 'mixed');
  assert.deepEqual(result.better.map(row => row.key), ['mood']);
  assert.deepEqual(result.worse.map(row => row.key), ['craving']);
});

test('precise milestones use the effective stages and a stable key between clock ticks', () => {
  const initial = summary({progress: progress({start: today, at: today + 'T11:40:00Z'})});
  const tick = summary({progress: progress({start: today, at: today + 'T11:40:00Z', instant: today + 'T12:01:00Z'})});
  assert.equal(initial.currentMilestone.id, 'first-days');
  assert.equal(initial.nextMilestone.id, 'six-hours');
  assert.equal(initial.nextMilestone.targetAt, today + 'T17:40:00.000Z');
  assert.equal(initial.nextMilestone.approx, false);
  assert.equal(initial.milestoneKey, tick.milestoneKey);
  const reached = summary({progress: progress({start: today, at: today + 'T11:40:00Z', instant: today + 'T17:40:00Z'})});
  assert.equal(reached.currentMilestone.id, 'six-hours');
  assert.notEqual(reached.milestoneKey, initial.milestoneKey);
});

test('unknown hours never confirm a six-hour milestone or expose an exact target instant', () => {
  const result = summary({progress: progress({start: today, precise: false})});
  assert.equal(result.currentMilestone, null);
  assert.equal(result.nextMilestone.id, 'one-day'); assert.equal(result.nextMilestone.fromMinutes, 1440);
  assert.equal(result.nextMilestone.targetAt, null); assert.equal(result.nextMilestone.targetDate, moveDay(today, 1));
  assert.equal(result.nextMilestone.approx, true);
  const week = summary({progress: progress({start: ago(7), precise: false})});
  assert.equal(week.currentMilestone.id, 'first-weeks'); assert.equal(week.currentMilestone.approx, true);
  assert.equal(week.currentMilestone.targetAt, null); assert.equal(week.nextMilestone.targetAt, null);
});

test('a corrected stop or precision changes the milestone key without inventing a health gain', () => {
  const first = summary({progress: progress()});
  const changed = summary({progress: progress({start: ago(3)})});
  const unknown = summary({progress: progress({precise: false})});
  assert.notEqual(first.milestoneKey, changed.milestoneKey);
  assert.notEqual(first.milestoneKey, unknown.milestoneKey);
  for (const result of [first, changed, unknown]) {
    assert.deepEqual(result.better, []); assert.equal(result.supportiveState, 'beginning');
    assert.equal(result.observationCount, 0);
  }
});

test('an inactive stop produces no new milestone while keeping the observation history', () => {
  const observations = samples({mood: 2}, {mood: 4});
  const result = summary({progress: progress({active: false}), observations});
  assert.equal(result.currentMilestone, null); assert.equal(result.nextMilestone, null); assert.equal(result.milestoneKey, null);
  assert.equal(result.observationCount, 4); assert.equal(result.latestDate, today);
  assert.equal(result.supportiveState, 'improving'); assert.equal(result.better[0].key, 'mood');
});

test('the presentation model is deterministic and never mutates supplied data', () => {
  const input = {today, progress: progress(), observations: samples({mood: 2}, {mood: 4}), legacyChecks: samples({craving: 5}, {craving: 3})};
  const before = structuredClone(input);
  function freeze(value) {if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);} return value;}
  freeze(input);
  assert.deepEqual(encouragementSummary(input), encouragementSummary(input));
  assert.deepEqual(input, before);
});
