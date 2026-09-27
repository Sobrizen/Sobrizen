import test from 'node:test';
import assert from 'node:assert/strict';
import {moveDay, dayDiff} from '../core.mjs';
import {trackingRange, trackingSummary, trackingPoints} from '../tracking-core.mjs';

const entries = (start, end, units = 2, cost = 4) => Array.from(
  {length: dayDiff(end, start) + 1}, (_, i) => ({
    checkin_date: moveDay(start, i), sober_today: units === 0,
    alcohol_units: units, alcohol_cost_eur: cost,
  }),
);

test('calendar weeks start on Monday and navigation clamps to tracked history and current week', () => {
  const current = trackingRange('2026-09-16', 'week', 0, '2026-09-27');
  assert.equal(current.start, '2026-09-21');
  assert.equal(current.end, '2026-09-27');
  assert.equal(current.days, 7);
  assert.equal(current.canPrev, true);
  assert.equal(current.canNext, false);
  const first = trackingRange('2026-09-16', 'week', -99, '2026-09-27');
  assert.equal(first.start, '2026-09-14');
  assert.equal(first.offset, -1);
  assert.equal(first.canPrev, false);
  assert.equal(first.canNext, true);
  assert.equal(trackingRange('2026-09-16', 'week', 99, '2026-09-28').start, '2026-09-28');
});

test('civil months keep their actual length and handle leap days and year transitions', () => {
  const feb = trackingRange('2023-12-31', 'month', -1, '2024-03-31');
  assert.equal(feb.start, '2024-02-01');
  assert.equal(feb.end, '2024-02-29');
  assert.equal(feb.days, 29);
  assert.equal(trackingRange('2023-12-31', 'month', -999, '2024-03-31').start, '2023-12-01');
  assert.equal(trackingRange('2023-12-31', 'month', 4, '2024-03-31').offset, 0);
});

test('anniversary years use the original anchor without leap-day drift', () => {
  const current = trackingRange('2024-02-29', 'year', 0, '2026-09-27');
  assert.equal(current.index, 2);
  assert.equal(current.start, '2026-02-28');
  assert.equal(current.end, '2027-02-27');
  assert.equal(current.months[1].start, '2026-03-29');
  const first = trackingRange('2024-02-29', 'year', -999, '2026-09-27');
  assert.equal(first.index, 0);
  assert.equal(first.canPrev, false);
  const previous = trackingRange('2024-02-29', 'year', -1, '2026-09-27');
  assert.equal(moveDay(previous.end, 1), current.start);
  const anniversary = trackingRange('2024-02-29', 'year', 0, '2028-02-29');
  assert.equal(anniversary.start, '2028-02-29');
  assert.equal(anniversary.months.length, 12);
});

test('anniversary months retain original day and partition the year without overlap', () => {
  const range = trackingRange('2026-01-31', 'year', 0, '2026-09-27');
  assert.deepEqual(range.months[0], {start: '2026-01-31', end: '2026-02-27'});
  assert.deepEqual(range.months[1], {start: '2026-02-28', end: '2026-03-30'});
  assert.equal(range.months[2].start, '2026-03-31');
  assert.equal(range.months.reduce((sum, month) => sum + dayDiff(month.end, month.start) + 1, 0), range.days);
  for (let i = 1; i < 12; i++) assert.equal(moveDay(range.months[i - 1].end, 1), range.months[i].start);
});

test('invalid dates, future anchors and fractional offsets fail explicitly', () => {
  assert.throws(() => trackingRange('2026-02-30', 'week', 0, '2026-09-27'));
  assert.throws(() => trackingRange('2026-09-28', 'week', 0, '2026-09-27'));
  assert.throws(() => trackingRange('2026-09-01', 'day', 0, '2026-09-27'));
  assert.throws(() => trackingRange('2026-09-01', 'week', 0.5, '2026-09-27'));
});

test('a first period ignores existing entries before the tracking anchor', () => {
  const today = '2026-09-17';
  const range = trackingRange('2026-09-16', 'week', 0, today);
  const checks = entries('2026-09-14', '2026-09-20');
  const {summary, comparison} = trackingSummary(checks, range, today);
  assert.equal(summary.start, '2026-09-16');
  assert.equal(summary.expected, 2);
  assert.equal(summary.units, 4);
  assert.equal(comparison.reason, 'before-tracking');
  const points = trackingPoints(checks, range, today);
  assert.equal(points[0].beforeTracking, true);
  assert.equal(points[0].units, null);
  assert.equal(points[0].expected, 0);
  assert.equal(points[3].provisional, true);
  assert.equal(points[4].future, true);
  assert.equal(points[4].units, null);
});

test('current week compares only matching closed days, excluding today and later previous-week days', () => {
  const today = '2026-09-24';
  const range = trackingRange('2026-09-01', 'week', 0, today);
  const checks = [
    ...entries('2026-09-14', '2026-09-16', 4, 10),
    ...entries('2026-09-17', '2026-09-20', 80, 500),
    ...entries('2026-09-21', '2026-09-23', 2, 5),
    ...entries(today, today, 99, 900),
  ];
  const {summary, comparison} = trackingSummary(checks, range, today);
  assert.equal(summary.units, 105);
  assert.equal(comparison.days, 3);
  assert.deepEqual(comparison.current, {start: '2026-09-21', end: '2026-09-23'});
  assert.deepEqual(comparison.previous, {start: '2026-09-14', end: '2026-09-16'});
  assert.deepEqual(comparison.units, {current: 6, previous: 12, delta: -6, percent: -50});
  assert.deepEqual(comparison.cost, {current: 15, previous: 30, delta: -15, percent: -50});
  assert.equal(comparison.reason, null);
});

test('partial month compares equal elapsed days, while 31 closed days never compare to 28', () => {
  const checks = entries('2026-01-01', '2026-04-30');
  let today = '2026-03-11';
  let range = trackingRange('2026-01-01', 'month', 0, today);
  let result = trackingSummary(checks, range, today);
  assert.equal(result.comparison.days, 10);
  assert.deepEqual(result.comparison.previous, {start: '2026-02-01', end: '2026-02-10'});
  assert.equal(result.comparison.units.delta, 0);
  today = '2026-04-02';
  range = trackingRange('2026-01-01', 'month', -1, today);
  result = trackingSummary(checks, range, today);
  assert.equal(result.comparison.days, 31);
  assert.equal(result.comparison.units, null);
  assert.equal(result.comparison.cost, null);
  assert.equal(result.comparison.reason, 'different-length');
  const feb = trackingRange('2026-01-01', 'month', -2, today);
  const febComparison = trackingSummary(checks, feb, today).comparison;
  assert.equal(febComparison.days, 28);
  assert.deepEqual(febComparison.previous, {start: '2026-01-01', end: '2026-01-28'});
});

test('comparisons require field-specific full coverage and never use pre-anchor reference days', () => {
  const today = '2026-09-24';
  const range = trackingRange('2026-09-01', 'week', 0, today);
  const checks = entries('2026-09-14', '2026-09-23');
  checks[0].alcohol_cost_eur = null;
  let comparison = trackingSummary(checks, range, today).comparison;
  assert.equal(comparison.units.delta, 0);
  assert.equal(comparison.cost, null);
  assert.equal(comparison.reason, 'incomplete');
  comparison = trackingSummary(checks.slice(1), range, today).comparison;
  assert.equal(comparison.units, null);
  const shortHistory = trackingRange('2026-09-15', 'week', 0, today);
  assert.equal(trackingSummary(checks, shortHistory, today).comparison.reason, 'before-tracking');
});

test('today alone supplies no closed-day comparison; a zero baseline has a finite absolute difference', () => {
  let today = '2026-09-21';
  let range = trackingRange('2026-09-01', 'week', 0, today);
  assert.equal(trackingSummary([], range, today).comparison.reason, 'no-closed-days');
  today = '2026-09-24';
  range = trackingRange('2026-09-01', 'week', 0, today);
  const checks = [...entries('2026-09-14', '2026-09-16', 0, 0), ...entries('2026-09-21', '2026-09-23', 2, 3)];
  const comparison = trackingSummary(checks, range, today).comparison;
  assert.deepEqual(comparison.units, {current: 6, previous: 0, delta: 6, percent: null});
  assert.deepEqual(comparison.cost, {current: 9, previous: 0, delta: 9, percent: null});
});

test('daily points distinguish explicit zero, unknown quantity, unknown cost, future, and a gap', () => {
  const today = '2026-09-24';
  const range = trackingRange('2026-09-01', 'week', 0, today);
  const checks = [
    {checkin_date: '2026-09-21', sober_today: true, alcohol_cost_eur: null},
    {checkin_date: '2026-09-22', sober_today: false, alcohol_units: null, alcohol_cost_eur: 0},
    {checkin_date: today, sober_today: false, alcohol_units: 1.25, alcohol_cost_eur: 0.1},
    {checkin_date: '2026-09-25', sober_today: true, alcohol_cost_eur: 0},
  ];
  const points = trackingPoints(checks, range, today);
  assert.equal(points.length, 7);
  assert.equal(points[0].units, 0);
  assert.equal(points[0].unitsComplete, true);
  assert.equal(points[0].cost, null);
  assert.equal(points[1].units, null);
  assert.equal(points[1].cost, 0);
  assert.equal(points[1].costComplete, true);
  assert.equal(points[2].units, null);
  assert.equal(points[2].unitsCoverage, 0);
  assert.equal(points[2].expected, 1);
  assert.equal(points[3].units, 1.25);
  assert.equal(points[3].provisional, true);
  assert.equal(points[3].unitsPartial, true);
  assert.equal(points[4].future, true);
  assert.equal(points[4].units, null);
  assert.equal(points[4].cost, null);
});

test('annual buckets expose known totals, per-metric coverage, partial months, and untouched future', () => {
  const today = '2026-04-03';
  const range = trackingRange('2026-01-31', 'year', 0, today);
  const checks = entries('2026-01-31', today, 1, 0.1);
  checks.find(row => row.checkin_date === '2026-03-10').alcohol_cost_eur = null;
  const points = trackingPoints(checks, range, today);
  assert.equal(points.length, 12);
  assert.equal(points[0].units, 28);
  assert.equal(points[0].cost, 2.8);
  assert.equal(points[0].unitsComplete, true);
  assert.equal(points[0].costComplete, true);
  assert.equal(points[1].units, 31);
  assert.equal(points[1].unitsComplete, true);
  assert.equal(points[1].cost, 3);
  assert.equal(points[1].costComplete, false);
  assert.equal(points[1].costPartial, true);
  assert.equal(points[1].costCoverage, 30);
  assert.match(points[1].label, /partiel/);
  assert.equal(points[2].expected, 4);
  assert.equal(points[2].units, 4);
  assert.equal(points[2].unitsCoverage, 4);
  assert.equal(points[2].provisional, true);
  assert.equal(points[2].unitsComplete, false);
  assert.equal(points[2].unitsPartial, true);
  assert.match(points[2].label, /partiel/);
  assert.equal(points[3].future, true);
  assert.equal(points[3].expected, 0);
  assert.equal(points[3].units, null);
  assert.equal(points[3].cost, null);
  assert.equal(points[3].partial, false);
});

test('a wholly unknown annual bucket remains null and duplicate day edits do not double count', () => {
  const today = '2026-03-05';
  const range = trackingRange('2026-01-01', 'year', 0, today);
  const checks = [
    {checkin_date: '2026-02-01', sober_today: false, alcohol_units: 5, alcohol_cost_eur: 20},
    {checkin_date: '2026-02-01', sober_today: true, alcohol_cost_eur: 0},
  ];
  const points = trackingPoints(checks, range, today);
  assert.equal(points[0].units, null);
  assert.equal(points[0].cost, null);
  assert.equal(points[1].units, 0);
  assert.equal(points[1].cost, 0);
  assert.equal(points[1].unitsCoverage, 1);
  assert.equal(points[1].unitsPartial, true);
  const feb = trackingRange('2026-01-01', 'month', -1, today);
  assert.equal(trackingSummary(checks, feb, today).summary.quantityDays, 1);
});

test('closed anniversary years compare equal elapsed days and cannot borrow a leap day', () => {
  const today = '2025-09-28';
  const range = trackingRange('2022-09-27', 'year', -1, today);
  const comparison = trackingSummary(entries('2022-09-27', '2025-09-26'), range, today).comparison;
  assert.equal(comparison.days, 365);
  assert.deepEqual(comparison.previous, {start: '2023-09-27', end: '2024-09-25'});
  assert.equal(comparison.units.delta, 0);
  const leapRange = trackingRange('2022-09-27', 'year', -2, today);
  assert.equal(trackingSummary(entries('2022-09-27', '2025-09-26'), leapRange, today).comparison.reason, 'different-length');
});

test('calendar periods do not drift across daylight-saving transitions', () => {
  const range = trackingRange('2026-03-01', 'week', 0, '2026-03-29');
  assert.equal(range.start, '2026-03-23');
  assert.equal(range.end, '2026-03-29');
  assert.equal(range.days, 7);
  const points = trackingPoints(entries(range.start, range.end), range, '2026-03-30');
  assert.deepEqual(points.map(point => point.date), entries(range.start, range.end).map(row => row.checkin_date));
  assert.equal(points.every(point => point.unitsComplete), true);
});
