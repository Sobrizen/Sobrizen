import test from 'node:test';
import assert from 'node:assert/strict';
import {dayDiff, moveDay} from '../core.mjs';
import {round2} from '../progress-core.mjs';
import {validateTimelineDocument, upgradeTimelineDocument, upsertTimelineRange, timelineRows, timelineSummary, timelineSnapshot} from '../timeline-core.mjs';

const today = '2026-09-28';
const ago = days => moveDay(today, -days);
const id = n => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const event = (n, start, state = 'abstinent', units = 0, cost = 0) => ({id: id(n), started_on: start, state, units_week: units, cost_week: cost, note: ''});
const occasion = (n, date, units = 2, cost = 12) => ({id: id(n), date, units, cost});
const datedPeriod = (n, start, end, state = 'drinking', units = 14, cost = 70) => ({...event(n, start, state, units, cost), ended_on: end});
const document = (start = ago(14)) => ({
  schema_version: 1, timezone: 'Europe/Paris',
  baseline: {started_on: moveDay(start, -365), units_week: 14, cost_week: 70},
  events: [event(1, start)], occasions: [],
  goal: {mode: 'abstain', weekly_limit: null, daily_limit: null, target_on: null, why: '', triggers: [], support_first: false, planned_action: ''},
});

test('validation canonicalizes without changing inputs or conflating declared state and goal', () => {
  const doc = document();
  doc.events.push(event(2, ago(4), 'drinking', '21,005', '70.125'));
  doc.events.reverse();
  doc.occasions = [occasion(1, ago(1))]; // Identifiers may be shared across collections.
  doc.goal.triggers = [' Stress ', 'Stress'];
  const before = JSON.stringify(doc), result = validateTimelineDocument(doc, today);
  assert.equal(result.events[0].state, 'abstinent');
  assert.equal(result.events[1].units_week, 21.01);
  assert.equal(result.events[1].cost_week, 70.13);
  assert.equal(result.goal.mode, 'abstain');
  assert.deepEqual(result.goal.triggers, ['Stress']);
  assert.equal(JSON.stringify(doc), before);
  const zero = document(); zero.baseline.units_week = 0; zero.baseline.cost_week = 0;
  assert.equal(validateTimelineDocument(zero, today).baseline.units_week, 0);
});

test('validation rejects invalid dates, missing/negative amounts, duplicate dates and incompatible limits', () => {
  const mutations = [
    d => { d.schema_version = 2; }, d => { d.unexpected = true; },
    d => { d.timezone = 'Not/A_Timezone'; }, d => { d.baseline.units_week = ''; },
    d => { d.baseline.cost_week = Infinity; }, d => { d.baseline.units_week = -1; },
    d => { d.baseline.started_on = '1899-12-31'; },
    d => { d.events[0].started_on = moveDay(today, 1); },
    d => { d.events[0].started_on = '2026-02-30'; },
    d => { d.baseline.started_on = today; },
    d => { d.events[0].units_week = 1; },
    d => { d.events[0].state = 'drinking'; },
    d => { d.events[0].cost_week = 7000000.01; },
    d => { d.events[0].id = 'invalid'; },
    d => { d.events.push({...d.events[0], id: id(2)}); },
    d => { d.events.push({...d.events[0], started_on: ago(1)}); },
    d => { d.occasions = [occasion(1, ago(2), 0)]; },
    d => { d.occasions = [occasion(1, ago(2), 1000.01)]; },
    d => { d.occasions = [occasion(1, ago(2), 1, 1000000.01)]; },
    d => { d.occasions = [occasion(1, moveDay(d.baseline.started_on, -1))]; },
    d => { d.occasions = [occasion(1, ago(2)), occasion(2, ago(2))]; },
    d => { d.goal.weekly_limit = 1; },
    d => { d.goal.mode = 'reduce'; d.goal.support_first = true; d.goal.daily_limit = 1; },
    d => { d.goal.target_on = '2101-01-01'; },
    d => { d.goal.why = 'x'.repeat(1001); },
    d => { d.events[0].note = 'x'.repeat(301); },
    d => { d.goal.triggers = Array(13).fill('Stress'); },
    d => { d.events = Array(501).fill(d.events[0]); },
    d => { d.occasions = Array(1001).fill(occasion(2, ago(1))); },
  ];
  for (const mutate of mutations) {
    const doc = document(); mutate(doc);
    assert.throws(() => validateTimelineDocument(doc, today));
  }
});

test('declaring 14 days immediately credits 14 closed sober days; editing to 30 or 7 recalculates', () => {
  const doc = document(), original = JSON.stringify(doc);
  for (const days of [14, 30, 7]) {
    const changed = structuredClone(doc); changed.events[0].started_on = ago(days);
    const snapshot = timelineSnapshot(changed, [], today);
    assert.equal(snapshot.totalSoberDays, days);
    assert.equal(snapshot.current.days, days);
    assert.equal(snapshot.currentStreak, days);
    assert.equal(snapshot.bestStreak, days);
    assert.equal(snapshot.summary.days, days);
    assert.equal(snapshot.summary.units, 0);
    assert.equal(snapshot.summary.cost, 0);
    assert.equal(snapshot.summary.saved, days * 10);
    assert.equal(snapshot.summary.estimatedDays, days);
    assert.equal(snapshot.summary.comparisonPercent, -100);
    assert.deepEqual(snapshot.summary.todayActual, {units: null, cost: null});
    assert.equal(snapshot.summary.provisional, false);
    assert.deepEqual(snapshot.bestPeriods[0], {start: ago(days), end: ago(1), days, ongoing: true});
    assert.equal(changed.baseline.started_on, doc.baseline.started_on);
  }
  assert.equal(JSON.stringify(doc), original);
});

test('restarts preserve former stops and their exact inclusive dates', () => {
  const doc = document(ago(30));
  doc.events.push(event(2, ago(20), 'drinking', 21, 70), event(3, ago(7)));
  const snapshot = timelineSnapshot(doc, [], today);
  assert.equal(snapshot.totalSoberDays, 17);
  assert.equal(snapshot.currentStreak, 7);
  assert.equal(snapshot.bestStreak, 10);
  assert.equal(snapshot.current.days, 7);
  assert.deepEqual(snapshot.bestPeriods, [
    {start: ago(30), end: ago(21), days: 10, ongoing: false},
    {start: ago(7), end: ago(1), days: 7, ongoing: true},
  ]);
  assert.equal(snapshot.summary.units, 39);
  assert.equal(snapshot.summary.cost, 130);
  assert.equal(snapshot.summary.saved, 170);
  assert.equal(snapshot.current.state, 'abstinent');
  assert.equal(doc.goal.mode, 'abstain');
});

test('a punctual drinking day splits streaks without replacing the declared period or the goal', () => {
  const doc = document(); doc.occasions.push(occasion(1, ago(3)));
  const snapshot = timelineSnapshot(doc, [], today);
  assert.equal(snapshot.totalSoberDays, 13);
  assert.equal(snapshot.currentStreak, 2);
  assert.equal(snapshot.bestStreak, 11);
  assert.equal(snapshot.summary.units, 2);
  assert.equal(snapshot.summary.cost, 12);
  assert.equal(snapshot.summary.saved, 128);
  assert.equal(snapshot.summary.actualDays, 1);
  assert.equal(snapshot.summary.estimatedDays, 13);
  assert.deepEqual(snapshot.bestPeriods, [
    {start: ago(14), end: ago(4), days: 11, ongoing: false},
    {start: ago(2), end: ago(1), days: 2, ongoing: true},
  ]);
  assert.equal(snapshot.current.state, 'abstinent');
  assert.equal(snapshot.current.days, 14);
  assert.equal(doc.goal.mode, 'abstain');
});

test('today’s actual occasion immediately updates totals and savings, but never adds an elapsed day', () => {
  const doc = document(), before = timelineSnapshot(doc, [], today);
  doc.occasions.push(occasion(1, today, 3, 18));
  const snapshot = timelineSnapshot(doc, [], today);
  assert.equal(snapshot.totalSoberDays, 14);
  assert.equal(snapshot.currentStreak, 0);
  assert.equal(snapshot.bestStreak, 14);
  assert.equal(snapshot.bestPeriods[0].ongoing, false);
  assert.equal(snapshot.summary.days, 14);
  assert.equal(snapshot.summary.quantityDays, 14);
  assert.equal(snapshot.summary.units, 3);
  assert.equal(snapshot.summary.cost, 18);
  assert.equal(snapshot.summary.saved, 122);
  assert.equal(snapshot.summary.comparisonPercent, before.summary.comparisonPercent);
  assert.deepEqual(snapshot.summary.todayActual, {units: 3, cost: 18});
  assert.equal(snapshot.summary.provisional, true);
  const rows = timelineRows(doc, [], ago(14), today, today);
  assert.equal(rows.length, 15);
  assert.equal(rows.at(-1).source, 'occasion');
  assert.equal(rows.at(-1).provisional, true);
  assert.equal(rows.at(-1).estimated, false);
  const closed = timelineSummary(doc, [], ago(14), ago(1), today);
  assert.equal(closed.cost, 0);
  assert.equal(closed.saved, 140);
  assert.equal(closed.provisional, false);
});

test('known legacy values override estimates independently; a new occasion replaces the whole actual day', () => {
  const doc = document(ago(7)); doc.events[0] = event(1, ago(7), 'drinking', 21, 70);
  doc.occasions.push(occasion(2, ago(3), 4, 5));
  const checks = [
    {checkin_date: ago(6), sober_today: true, alcohol_cost_eur: null},
    {checkin_date: ago(5), sober_today: false, alcohol_units: null, alcohol_cost_eur: 0},
    {checkin_date: ago(4), alcohol_units: 5, alcohol_cost_eur: null},
    {checkin_date: ago(3), sober_today: false, alcohol_units: 2, alcohol_cost_eur: 3},
    {checkin_date: moveDay(today, 1), sober_today: true, alcohol_cost_eur: 100},
  ];
  const before = JSON.stringify({doc, checks});
  const rows = timelineRows(doc, checks, ago(7), ago(1), today);
  const byDate = new Map(rows.map(row => [row.checkin_date, row]));
  assert.equal(byDate.get(ago(6)).sober_today, true);
  assert.equal(byDate.get(ago(6)).alcohol_units, 0);
  assert.equal(byDate.get(ago(6)).units_source, 'legacy');
  assert.equal(byDate.get(ago(6)).alcohol_cost_eur, 10);
  assert.equal(byDate.get(ago(6)).cost_source, 'period');
  assert.equal(byDate.get(ago(5)).sober_today, false);
  assert.equal(byDate.get(ago(5)).alcohol_units, null);
  assert.equal(byDate.get(ago(5)).units_source, 'unknown');
  assert.equal(byDate.get(ago(5)).alcohol_cost_eur, 0);
  assert.equal(byDate.get(ago(3)).alcohol_units, 4);
  assert.equal(byDate.get(ago(3)).alcohol_cost_eur, 5);
  assert.equal(byDate.get(ago(3)).source, 'occasion');
  const summary = timelineSummary(doc, checks, ago(7), today, today);
  assert.equal(summary.units, 18);
  assert.equal(summary.cost, 55);
  assert.equal(summary.saved, 15);
  assert.equal(summary.quantityDays, 6);
  assert.equal(summary.costDays, 7);
  assert.equal(summary.soberDays, 1);
  assert.equal(summary.actualDays, 4);
  assert.equal(summary.estimatedDays, 5);
  assert.equal(summary.comparisonPercent, null);
  assert.equal(JSON.stringify({doc, checks}), before);
});

test('baseline zero is an estimate, not sobriety; explicit older sober days still count', () => {
  const doc = document(today); doc.baseline.units_week = 0; doc.baseline.cost_week = 0;
  const noChecks = timelineSnapshot(doc, [], today);
  assert.equal(noChecks.totalSoberDays, 0);
  assert.equal(noChecks.current.days, 0);
  assert.equal(noChecks.currentStreak, 0);
  assert.equal(noChecks.summary.days, 0);
  assert.equal(noChecks.summary.saved, 0);
  assert.equal(noChecks.summary.comparisonPercent, null);
  const row = timelineRows(doc, [], ago(1), today, today);
  assert.equal(row[0].alcohol_units, 0);
  assert.equal(row[0].sober_today, null);
  assert.equal(row[0].source, 'baseline');
  assert.equal(row[1].alcohol_units, null);
  assert.equal(row[1].alcohol_cost_eur, null);
  assert.equal(row[1].provisional, true);
  const snapshot = timelineSnapshot(doc, [{checkin_date: ago(1), sober_today: true}], today);
  assert.equal(snapshot.totalSoberDays, 1);
  assert.equal(snapshot.currentStreak, 1);
  assert.equal(snapshot.current.days, 0);
});

test('today’s legacy unknown fields never fall back to unfinished-day estimates', () => {
  const doc = document(), checks = [{checkin_date: today, sober_today: false, alcohol_units: null, alcohol_cost_eur: 0}];
  const snapshot = timelineSnapshot(doc, checks, today);
  assert.equal(snapshot.totalSoberDays, 14);
  assert.equal(snapshot.currentStreak, 0);
  assert.deepEqual(snapshot.summary.todayActual, {units: null, cost: 0});
  assert.equal(snapshot.summary.provisional, true);
  assert.equal(snapshot.summary.saved, 140);
  const current = timelineRows(doc, checks, today, today, today)[0];
  assert.equal(current.alcohol_units, null);
  assert.equal(current.alcohol_cost_eur, 0);
  assert.equal(current.estimated, false);
  assert.equal(current.sober_today, false);
  const empty = timelineRows(doc, [], today, today, today)[0];
  assert.equal(empty.alcohol_units, null);
  assert.equal(empty.alcohol_cost_eur, null);
});

test('real records older than the reference preserve former stops and historical chart points', () => {
  const doc = document();
  const oldStart = moveDay(doc.baseline.started_on, -400);
  const checks = Array.from({length: 20}, (_, index) => ({
    checkin_date: moveDay(oldStart, index), sober_today: true, alcohol_cost_eur: 0,
  }));
  checks.push({checkin_date: moveDay(oldStart, 20), sober_today: false, alcohol_units: 3, alcohol_cost_eur: 25});
  const before = JSON.stringify({doc, checks});
  const snapshot = timelineSnapshot(doc, checks, today);
  assert.equal(snapshot.totalSoberDays, 34);
  assert.equal(snapshot.currentStreak, 14);
  assert.equal(snapshot.bestStreak, 20);
  assert.deepEqual(snapshot.bestPeriods[0], {start: oldStart, end: moveDay(oldStart, 19), days: 20, ongoing: false});
  const oldRows = timelineRows(doc, checks, oldStart, moveDay(oldStart, 21), today);
  assert.equal(oldRows[0].source, 'legacy');
  assert.equal(oldRows[20].alcohol_units, 3);
  assert.equal(oldRows[20].alcohol_cost_eur, 25);
  assert.equal(oldRows[21].alcohol_units, null);
  assert.equal(oldRows[21].alcohol_cost_eur, null);
  assert.equal(oldRows[21].source, 'unknown');
  const oldSummary = timelineSummary(doc, checks, oldStart, moveDay(oldStart, 21), today);
  assert.equal(oldSummary.units, 3);
  assert.equal(oldSummary.cost, 25);
  assert.equal(oldSummary.soberDays, 20);
  assert.equal(oldSummary.estimatedDays, 0);
  assert.equal(oldSummary.saved, null);
  assert.equal(oldSummary.comparisonPercent, null);
  assert.equal(oldSummary.referenceDays, 0);
  assert.equal(JSON.stringify({doc, checks}), before);
});

test('moving the reference forward never erases older facts or applies its estimates before validity', () => {
  const doc = document(), oldDay = moveDay(doc.baseline.started_on, -100);
  const checks = [{checkin_date: oldDay, sober_today: true, alcohol_cost_eur: 25}];
  const original = timelineSummary(doc, checks, oldDay, today, today);
  assert.equal(original.saved, 140); // Older 25 € remains visible, outside this reference comparison.
  assert.equal(original.cost, 3675); // 365 baseline days at 10 €, plus the actual older expense.
  assert.equal(original.referenceDays, 379);
  const changed = structuredClone(doc);
  changed.baseline.started_on = changed.events[0].started_on;
  const snapshot = timelineSnapshot(changed, checks, today);
  assert.equal(snapshot.totalSoberDays, 15);
  assert.equal(snapshot.currentStreak, 14);
  assert.equal(snapshot.summary.saved, 140);
  const summary = timelineSummary(changed, checks, oldDay, today, today);
  assert.equal(summary.cost, 25);
  assert.equal(summary.costDays, 15);
  assert.equal(summary.saved, 140);
  assert.equal(summary.comparisonPercent, -100);
  assert.equal(summary.referenceStart, changed.baseline.started_on);
  assert.equal(summary.referenceDays, 14);
  assert.equal(summary.referenceCostDays, 14);
  assert.equal(summary.referenceQuantityDays, 14);
  assert.equal(timelineRows(changed, checks, oldDay, oldDay, today)[0].alcohol_cost_eur, 25);
});

test('cost remains independent of sober status; negative savings and zero comparisons remain honest', () => {
  const doc = document(); doc.events[0].cost_week = 7;
  const snapshot = timelineSnapshot(doc, [], today);
  assert.equal(snapshot.totalSoberDays, 14);
  assert.equal(snapshot.summary.cost, 14);
  assert.equal(snapshot.summary.saved, 126);
  doc.baseline.units_week = 0; doc.baseline.cost_week = 0;
  assert.equal(timelineSnapshot(doc, [], today).summary.saved, -14);
  assert.equal(timelineSnapshot(doc, [], today).summary.comparisonPercent, null);
  const noMeasurement = timelineSummary(doc, [], moveDay(doc.baseline.started_on, -3), moveDay(doc.baseline.started_on, -1), today);
  assert.equal(noMeasurement.quantityDays, 0);
  assert.equal(noMeasurement.costDays, 0);
  assert.equal(noMeasurement.saved, null);
});

test('century-scale history uses periods while daily chart output remains bounded', () => {
  const doc = document('1900-01-01'); doc.baseline.started_on = '1900-01-01';
  const snapshot = timelineSnapshot(doc, [], today), days = dayDiff(today, '1900-01-01');
  assert.equal(snapshot.totalSoberDays, days);
  assert.equal(snapshot.currentStreak, days);
  assert.equal(snapshot.summary.days, days);
  assert.equal(snapshot.summary.saved, days * 10);
  assert.equal(snapshot.bestPeriods.length, 1);
  assert.throws(() => timelineRows(doc, [], '1900-01-01', today, today), /366/);
  assert.equal(timelineRows(doc, [], ago(366), today, today).length, 367);
  assert.deepEqual(timelineRows(doc, [], moveDay(today, 1), moveDay(today, 5), today), []);
});

test('segment aggregates equal bounded daily samples across baseline, periods, and sparse corrections', () => {
  const doc = document(ago(25));
  doc.baseline.units_week = 10.01; doc.baseline.cost_week = 31.21;
  doc.events.push(event(2, ago(16), 'drinking', 10.03, 18.19), event(3, ago(6)));
  doc.occasions = [occasion(1, ago(22), 1.25, 5.6), occasion(2, ago(9), 2.55, 0)];
  const checks = [
    {checkin_date: ago(28), sober_today: true, alcohol_cost_eur: 0},
    {checkin_date: ago(18), sober_today: false, alcohol_units: null, alcohol_cost_eur: null},
    {checkin_date: ago(13), sober_today: true, alcohol_cost_eur: 2.1},
    {checkin_date: ago(4), sober_today: true, alcohol_cost_eur: null},
  ];
  for (const span of [30, 25, 17, 6, 1]) {
    const rows = timelineRows(doc, checks, ago(span), ago(1), today);
    const summary = timelineSummary(doc, checks, ago(span), ago(1), today);
    assert.equal(summary.units, round2(rows.reduce((total, row) => total + (row.alcohol_units ?? 0), 0)));
    assert.equal(summary.cost, round2(rows.reduce((total, row) => total + (row.alcohol_cost_eur ?? 0), 0)));
    assert.equal(summary.quantityDays, rows.filter(row => row.alcohol_units !== null).length);
    assert.equal(summary.costDays, rows.filter(row => row.alcohol_cost_eur !== null).length);
    assert.equal(summary.soberDays, rows.filter(row => row.sober_today === true).length);
    assert.equal(summary.estimatedDays, rows.filter(row => row.estimated).length);
  }
});

test('leap years and Paris clock changes retain exact civil-day durations', () => {
  const originalTimezone = process.env.TZ;
  try {
    process.env.TZ = 'Europe/Paris';
    assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, 'Europe/Paris');
    for (const [start, today] of [['2024-02-28', '2024-03-01'], ['2026-03-28', '2026-03-30'], ['2026-10-24', '2026-10-26']]) {
      const doc = document();
      doc.baseline.started_on = start;
      doc.events[0].started_on = start;
      const snapshot = timelineSnapshot(doc, [], today);
      assert.equal(snapshot.current.days, 2);
      assert.equal(snapshot.totalSoberDays, 2);
      assert.equal(snapshot.currentStreak, 2);
      assert.equal(snapshot.summary.saved, 20);
      assert.equal(timelineRows(doc, [], start, today, today).length, 3);
      const ranged = upsertTimelineRange(doc, datedPeriod(20, start, start), today);
      const updated = timelineSnapshot(ranged, [], today);
      assert.equal(updated.totalSoberDays, 1);
      assert.equal(updated.currentStreakStartedOn, moveDay(start, 1));
      assert.equal(updated.summary.units, 2);
      assert.equal(updated.summary.cost, 10);
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test('v1 reads keep their shape; an explicit v2 upgrade preserves declarations and facts', () => {
  const original = document(), before = JSON.stringify(original);
  assert.equal('ranges' in validateTimelineDocument(original, today), false);
  const upgraded = upgradeTimelineDocument(original, today);
  assert.equal(upgraded.schema_version, 2);
  assert.deepEqual(upgraded.ranges, []);
  assert.deepEqual(upgraded.events, original.events);
  assert.deepEqual(upgraded.goal, original.goal);
  assert.deepEqual(upgradeTimelineDocument(upgraded, today), upgraded);
  assert.equal(JSON.stringify(original), before);
  const same = upsertTimelineRange(upgraded, datedPeriod(2, ago(6), ago(5), 'drinking', '14,005', '70.125'), today);
  assert.equal(same.ranges[0].units_week, 14.01);
  assert.equal(same.ranges[0].cost_week, 70.13);
  assert.equal(same.ranges[0].note, '');
});

test('finite ranges enforce date, state and amount limits and reject inclusive overlaps clearly', () => {
  const valid = upsertTimelineRange(document(), datedPeriod(2, ago(10), ago(8)), today);
  const mutations = [
    d => { delete d.ranges; }, d => { d.ranges = null; },
    d => { d.ranges = Array(501).fill(d.ranges[0]); },
    d => { d.ranges[0].ended_on = ago(11); },
    d => { d.ranges[0].ended_on = moveDay(today, 1); },
    d => { d.ranges[0].started_on = '1899-12-31'; },
    d => { d.ranges[0].started_on = '2026-02-30'; },
    d => { d.ranges[0].ended_on = ''; },
    d => { d.ranges[0].state = 'unknown'; },
    d => { d.ranges[0].units_week = 0; },
    d => { d.ranges[0].units_week = 7000.01; },
    d => { d.ranges[0].units_week = ''; },
    d => { d.ranges[0].cost_week = null; },
    d => { d.ranges[0].cost_week = -1; },
    d => { d.ranges[0].cost_week = 7000000.01; },
    d => { d.ranges[0].state = 'abstinent'; },
    d => { d.ranges[0].note = 'x'.repeat(301); },
    d => { d.ranges[0].id = 'invalid'; },
    d => { d.ranges[0].unexpected = true; },
    d => { d.ranges.push({...d.ranges[0], started_on: ago(5), ended_on: ago(4)}); },
  ];
  for (const change of mutations) {
    const doc = structuredClone(valid); change(doc);
    assert.throws(() => validateTimelineDocument(doc, today));
  }
  for (const [start, end] of [[ago(12), ago(10)], [ago(8), ago(6)], [ago(9), ago(9)], [ago(11), ago(7)]]) {
    assert.throws(() => upsertTimelineRange(valid, datedPeriod(3, start, end), today), /chevauche.*\d{4}-\d{2}-\d{2}.*historique/);
  }
  const adjacent = upsertTimelineRange(valid, datedPeriod(3, ago(7), ago(7), 'abstinent', 0, 0), today);
  assert.equal(adjacent.ranges.length, 2);
  assert.equal(adjacent.ranges[1].started_on, moveDay(adjacent.ranges[0].ended_on, 1));
});

test('a late drinking day updates the actual stop date, past record and effective history', () => {
  const doc = document(ago(30));
  doc.occasions.push(occasion(2, ago(10), 3, 12));
  const result = timelineSnapshot(doc, [], today);
  assert.equal(result.totalSoberDays, 29);
  assert.equal(result.currentStreak, 9);
  assert.equal(result.currentStreakStartedOn, ago(9));
  assert.equal(result.bestStreak, 20);
  assert.equal(result.lastConsumptionOn, ago(10));
  assert.equal(result.current.event.started_on, ago(30)); // The original declaration remains editable.
  assert.equal(result.summary.units, 3);
  assert.equal(result.summary.cost, 12);
  assert.equal(result.summary.saved, 288);
  const actual = result.effectivePeriods.find(row => row.source === 'occasion');
  assert.equal(actual.start, ago(10));
  assert.equal(actual.end, ago(10));
  assert.equal(actual.state, 'drinking');
  assert.equal(actual.occasion_id, id(2));
  assert.equal(actual.units, 3);
  assert.equal(actual.units_week, null);
  assert.equal(doc.goal.mode, 'abstain');
});

test('an inclusive closed range splits an existing stop and restoring/editing it has no lasting side effects', () => {
  const original = document(ago(30)), before = JSON.stringify(original);
  const doc = upsertTimelineRange(original, datedPeriod(2, ago(10), ago(7)), today);
  const saved = timelineSnapshot(doc, [], today);
  assert.equal(saved.totalSoberDays, 26);
  assert.equal(saved.currentStreak, 6);
  assert.equal(saved.currentStreakStartedOn, ago(6));
  assert.equal(saved.bestStreak, 20);
  assert.equal(saved.summary.units, 8);
  assert.equal(saved.summary.cost, 40);
  assert.equal(saved.summary.saved, 260);
  assert.deepEqual(saved.bestPeriods, [
    {start: ago(30), end: ago(11), days: 20, ongoing: false},
    {start: ago(6), end: ago(1), days: 6, ongoing: true},
  ]);
  const restored = timelineRows(doc, [], ago(7), ago(6), today);
  assert.equal(restored[0].source, 'range');
  assert.equal(restored[0].range_id, id(2));
  assert.equal(restored[1].source, 'period');
  assert.equal(restored[1].range_id, null);
  assert.equal(restored[1].sober_today, true);
  assert.deepEqual(upsertTimelineRange(doc, doc.ranges[0], today), doc);
  const edited = upsertTimelineRange(doc, datedPeriod(2, ago(5), ago(3)), today);
  const updated = timelineSnapshot(edited, [], today);
  assert.equal(edited.ranges.length, 1);
  assert.equal(updated.totalSoberDays, 27);
  assert.equal(updated.currentStreak, 2);
  assert.equal(updated.bestStreak, 25);
  assert.equal(updated.summary.cost, 30);
  assert.equal(updated.summary.saved, 270);
  assert.equal(timelineRows(edited, [], ago(10), ago(10), today)[0].sober_today, true);
  assert.deepEqual(edited.events, original.events);
  assert.deepEqual(edited.goal, original.goal);
  assert.deepEqual(edited.occasions, []);
  assert.equal(JSON.stringify(original), before);
});

test('ending a historical range restores the actual underlying event and preserves subsequent restarts', () => {
  const original = document(ago(30));
  original.events.push(event(2, ago(20), 'drinking', 21, 70), event(3, ago(10)));
  const before = JSON.stringify(original.events);
  const doc = upsertTimelineRange(original, datedPeriod(4, ago(25), ago(18), 'abstinent', 0, 0), today);
  const snapshot = timelineSnapshot(doc, [], today);
  assert.equal(snapshot.totalSoberDays, 23);
  assert.equal(snapshot.currentStreak, 10);
  assert.equal(snapshot.bestStreak, 13);
  assert.equal(snapshot.summary.units, 21);
  assert.equal(snapshot.summary.cost, 70);
  const rows = new Map(timelineRows(doc, [], ago(26), ago(9), today).map(row => [row.checkin_date, row]));
  assert.equal(rows.get(ago(18)).sober_today, true);
  assert.equal(rows.get(ago(18)).source, 'range');
  assert.equal(rows.get(ago(17)).sober_today, false);
  assert.equal(rows.get(ago(17)).event_id, id(2));
  assert.equal(rows.get(ago(17)).alcohol_units, 3);
  assert.equal(rows.get(ago(10)).sober_today, true);
  assert.equal(rows.get(ago(10)).event_id, id(3));
  assert.equal(JSON.stringify(doc.events), before);
  assert.equal(doc.goal.mode, 'abstain');
});

test('facts and finite ranges before the baseline affect history without inventing a reference or filling unknown gaps', () => {
  const original = upgradeTimelineDocument(document(ago(14)), today); original.baseline.started_on = ago(20);
  original.occasions.push(occasion(2, ago(35), 3, 12));
  const doc = upsertTimelineRange(original, datedPeriod(3, ago(40), ago(38)), today);
  const snapshot = timelineSnapshot(doc, [], today);
  assert.equal(snapshot.historyStart, ago(40));
  assert.equal(snapshot.firstEventDate, ago(14));
  assert.equal(snapshot.summary.start, ago(40));
  assert.equal(snapshot.summary.units, 21);
  assert.equal(snapshot.summary.cost, 102);
  assert.equal(snapshot.summary.saved, 140);
  assert.equal(snapshot.summary.referenceStart, ago(20));
  assert.equal(snapshot.summary.referenceCostDays, 20);
  assert.equal(snapshot.summary.quantityDays, 24);
  assert.equal(snapshot.totalSoberDays, 14);
  assert.equal(snapshot.currentStreak, 14);
  assert.deepEqual(doc.baseline, original.baseline);
  const rows = new Map(timelineRows(doc, [], ago(40), ago(14), today).map(row => [row.checkin_date, row]));
  assert.equal(rows.get(ago(39)).source, 'range');
  assert.equal(rows.get(ago(39)).alcohol_units, 2);
  assert.equal(rows.get(ago(37)).source, 'unknown');
  assert.equal(rows.get(ago(37)).alcohol_units, null);
  assert.equal(rows.get(ago(35)).source, 'occasion');
  assert.equal(rows.get(ago(21)).alcohol_cost_eur, null);
  assert.equal(rows.get(ago(20)).source, 'baseline');
  const older = timelineSummary(doc, [], ago(40), ago(21), today);
  assert.equal(older.units, 9);
  assert.equal(older.cost, 42);
  assert.equal(older.saved, null);
  assert.equal(older.referenceDays, 0);
  assert.equal(older.comparisonPercent, null);
  const sober = upsertTimelineRange(doc, datedPeriod(3, ago(40), ago(36), 'abstinent', 0, 0), today);
  const updated = timelineSnapshot(sober, [], today);
  assert.equal(updated.totalSoberDays, 19);
  assert.equal(updated.currentStreak, 14);
  assert.equal(updated.bestPeriods.find(period => period.start === ago(40)).days, 5);
  assert.equal(updated.summary.saved, 140);
});

test('an occasion before the first event enters home totals and can move before the reference without moving it', () => {
  const doc = upgradeTimelineDocument(document(ago(14)), today); doc.baseline.started_on = ago(20);
  doc.occasions.push(occasion(2, ago(18), 3, 12));
  const first = timelineSnapshot(doc, [], today);
  assert.equal(first.historyStart, ago(18));
  assert.equal(first.summary.units, 9); // The actual day plus three reference days.
  assert.equal(first.summary.cost, 42);
  doc.occasions[0].date = ago(30);
  const old = timelineSnapshot(doc, [], today);
  assert.equal(old.historyStart, ago(30));
  assert.equal(old.summary.units, 15); // The older fact plus six valid reference days.
  assert.equal(old.summary.cost, 72);
  assert.equal(old.summary.saved, 140);
  assert.equal(doc.baseline.started_on, ago(20));
  assert.equal(old.totalSoberDays, 14);
});

test('known real metrics override finite-range estimates independently without double counting', () => {
  const doc = upsertTimelineRange(document(), datedPeriod(2, ago(7), ago(1), 'drinking', 21, 70), today);
  doc.occasions.push(occasion(3, ago(3), 4, 5));
  const checks = [
    {checkin_date: ago(6), sober_today: true, alcohol_cost_eur: null},
    {checkin_date: ago(5), sober_today: false, alcohol_units: null, alcohol_cost_eur: 0},
    {checkin_date: ago(4), alcohol_units: 5, alcohol_cost_eur: null},
    {checkin_date: ago(3), sober_today: false, alcohol_units: 2, alcohol_cost_eur: 3},
  ];
  const summary = timelineSummary(doc, checks, ago(7), ago(1), today);
  assert.equal(summary.units, 18);
  assert.equal(summary.cost, 55);
  assert.equal(summary.soberDays, 1);
  assert.equal(summary.quantityDays, 6);
  assert.equal(summary.costDays, 7);
  assert.equal(summary.estimatedDays, 5);
  assert.equal(summary.actualDays, 4);
  assert.equal(summary.comparisonPercent, null);
  const snapshot = timelineSnapshot(doc, checks, today);
  assert.equal(snapshot.totalSoberDays, 8);
  assert.equal(snapshot.currentStreak, 0);
  assert.equal(snapshot.currentStreakStartedOn, today);
  const actual = timelineRows(doc, checks, ago(6), ago(6), today)[0];
  assert.equal(actual.units_source, 'legacy');
  assert.equal(actual.cost_source, 'range');
  assert.equal(actual.alcohol_cost_eur, 10);
});

test('today uses the effective declared or real state without charging an estimated full day', () => {
  const original = document();
  const doc = upsertTimelineRange(original, datedPeriod(2, ago(2), today), today);
  const declared = timelineSnapshot(doc, [], today);
  assert.equal(declared.current.state, 'drinking');
  assert.equal(declared.current.source, 'range');
  assert.equal(declared.current.range.id, id(2));
  assert.equal(declared.current.event.id, original.events[0].id);
  assert.equal(declared.currentStreak, 0);
  assert.equal(declared.currentStreakStartedOn, null);
  assert.equal(declared.totalSoberDays, 12);
  assert.equal(declared.summary.units, 4);
  assert.equal(declared.summary.cost, 20);
  assert.equal(declared.todayActual.alcohol_units, null);
  assert.equal(declared.todayActual.alcohol_cost_eur, null);
  assert.deepEqual(declared.summary.todayActual, {units: null, cost: null});
  assert.equal(timelineRows(doc, [], today, today, today)[0].alcohol_units, null);
  original.occasions.push(occasion(3, today, 3, 12));
  const real = timelineSnapshot(original, [], today);
  assert.equal(real.current.state, 'drinking');
  assert.equal(real.current.source, 'occasion');
  assert.equal(real.todayActual.alcohol_units, 3);
  assert.equal(real.todayActual.alcohol_cost_eur, 12);
  assert.equal(real.currentStreak, 0);
  assert.equal(real.currentStreakStartedOn, null);
  assert.equal(real.summary.units, 3);
  assert.equal(real.summary.cost, 12);
  assert.equal(real.totalSoberDays, 14);
  assert.equal(real.summary.saved, 128);
});

test('v2 analytic summaries equal bounded daily samples across unknown history, ranges and actual exceptions', () => {
  let doc = document(ago(40)); doc.baseline.started_on = ago(50);
  doc.events.push(event(2, ago(20), 'drinking', 14, 31.21), event(3, ago(3)));
  for (const period of [
    datedPeriod(4, ago(300), ago(296), 'abstinent', 0, 0),
    datedPeriod(5, ago(90), ago(85), 'drinking', 10.03, 18.19),
    datedPeriod(6, ago(35), ago(32), 'drinking', 8.21, 32.23),
    datedPeriod(7, ago(18), ago(15), 'abstinent', 0, 7.33),
  ]) doc = upsertTimelineRange(doc, period, today);
  doc.occasions = [occasion(8, ago(70), 2, 5), occasion(9, ago(34), 3, 12), occasion(10, today, 3.2, 12)];
  const checks = [
    {checkin_date: ago(298), sober_today: false, alcohol_units: null, alcohol_cost_eur: null},
    {checkin_date: ago(16), sober_today: true, alcohol_cost_eur: 2.1},
  ];
  for (const span of [366, 120, 60, 30, 10, 1]) {
    const rows = timelineRows(doc, checks, ago(span), ago(1), today);
    const summary = timelineSummary(doc, checks, ago(span), today, today);
    assert.equal(summary.units, round2(rows.reduce((total, row) => total + (row.alcohol_units ?? 0), 0) + 3.2));
    assert.equal(summary.cost, round2(rows.reduce((total, row) => total + (row.alcohol_cost_eur ?? 0), 0) + 12));
    assert.equal(summary.soberDays, rows.filter(row => row.sober_today === true).length);
    assert.equal(summary.quantityDays, rows.filter(row => row.alcohol_units !== null).length);
    assert.equal(summary.costDays, rows.filter(row => row.alcohol_cost_eur !== null).length);
    assert.equal(summary.estimatedDays, rows.filter(row => row.estimated).length);
    assert.equal(summary.actualDays, rows.filter(row => ['legacy', 'occasion'].includes(row.status_source) || ['legacy', 'occasion'].includes(row.units_source) || ['legacy', 'occasion'].includes(row.cost_source)).length);
  }
  const before = JSON.stringify({doc, checks});
  timelineSnapshot(doc, checks, today);
  assert.equal(JSON.stringify({doc, checks}), before);
});

test('long histories and maximum range counts use interval boundaries instead of generated daily facts', () => {
  const original = document('1900-01-01'); original.baseline.started_on = '1900-01-01';
  const doc = upsertTimelineRange(original, datedPeriod(2, '1950-01-01', '1999-12-31', 'drinking', 7, 7), today);
  const snapshot = timelineSnapshot(doc, [], today);
  const drinkingDays = dayDiff('2000-01-01', '1950-01-01');
  assert.equal(snapshot.totalSoberDays, dayDiff(today, '1900-01-01') - drinkingDays);
  assert.equal(snapshot.currentStreakStartedOn, '2000-01-01');
  assert.equal(snapshot.summary.units, drinkingDays);
  assert.equal(snapshot.summary.cost, drinkingDays);
  assert.ok(snapshot.effectivePeriods.length <= 4);
  assert.equal(doc.events.length, 1);
  assert.equal(doc.occasions.length, 0);
  assert.equal(doc.ranges.length, 1);
  const maximum = upgradeTimelineDocument(original, today);
  maximum.ranges = Array.from({length: 500}, (_, index) => {
    const day = moveDay('1900-01-01', index * 2);
    return datedPeriod(index + 2, day, day);
  });
  assert.equal(validateTimelineDocument(maximum, today).ranges.length, 500);
  assert.equal(timelineSnapshot(maximum, [], today).totalSoberDays, dayDiff(today, '1900-01-01') - 500);
});
