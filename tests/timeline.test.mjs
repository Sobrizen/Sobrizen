import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {dayDiff, moveDay} from '../core.mjs';
import {round2} from '../progress-core.mjs';
import {validateTimelineDocument, timelineRows, timelineSummary, timelineSnapshot} from '../timeline-core.mjs';

const today = '2026-09-28';
const ago = days => moveDay(today, -days);
const id = n => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const event = (n, start, state = 'abstinent', units = 0, cost = 0) => ({id: id(n), started_on: start, state, units_week: units, cost_week: cost, note: ''});
const occasion = (n, date, units = 2, cost = 12) => ({id: id(n), date, units, cost});
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
  const moduleUrl = new URL('../timeline-core.mjs', import.meta.url).href;
  const doc = document();
  const script = `
    import assert from 'node:assert/strict';
    import {timelineSnapshot, timelineRows} from ${JSON.stringify(moduleUrl)};
    const template = ${JSON.stringify(doc)};
    for (const [start,today] of [['2024-02-28','2024-03-01'],['2026-03-28','2026-03-30'],['2026-10-24','2026-10-26']]) {
      const doc = structuredClone(template);
      doc.baseline.started_on = start;
      doc.events[0].started_on = start;
      const snapshot = timelineSnapshot(doc, [], today);
      assert.equal(snapshot.current.days, 2);
      assert.equal(snapshot.totalSoberDays, 2);
      assert.equal(snapshot.currentStreak, 2);
      assert.equal(snapshot.summary.saved, 20);
      assert.equal(timelineRows(doc, [], start, today, today).length, 3);
    }
  `;
  execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: {...process.env, TZ: 'Europe/Paris'}, timeout: 5000, stdio: 'pipe',
  });
});
