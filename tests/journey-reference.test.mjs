import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {parseDay} from '../core.mjs';
import {resolveAnchor} from '../progress-core.mjs';
import {referenceStartDay, validateJourneyReference, journeyReferenceSummary} from '../journey-reference.mjs';

const today = '2026-09-24';
const journey = date => ({started_at: parseDay(date).toISOString()});
const settings = {baseline_units_week: 14, baseline_cost_week: 70, subscription_started_on: '2026-09-01'};
const checks = [
  {checkin_date: '2026-09-20', sober_today: false, alcohol_units: 20, alcohol_cost_eur: 40},
  {checkin_date: '2026-09-21', sober_today: false, alcohol_units: 2, alcohol_cost_eur: 4},
  {checkin_date: '2026-09-22', sober_today: true, alcohol_units: 0, alcohol_cost_eur: 0},
  {checkin_date: '2026-09-23', sober_today: false, alcohol_units: 4, alcohol_cost_eur: 8},
  {checkin_date: today, sober_today: false, alcohol_units: 8, alcohol_cost_eur: 12},
];

test('legacy timestamps round trip to local dates; missing and malformed dates stay unknown', () => {
  for (const date of ['2024-02-29', '2026-03-29', '2026-10-25']) {
    assert.equal(referenceStartDay(journey(date)), date);
  }
  assert.equal(referenceStartDay({started_at: '2024-02-29'}), '2024-02-29');
  for (const value of [undefined, null, '', ' ', 'invalid', '2026-02-30T12:00:00Z', '2026-13-01', 0, false]) {
    assert.equal(referenceStartDay({started_at: value}), null);
  }
  assert.equal(referenceStartDay(null), null);
});

test('required estimates accept decimal commas, rounding, real zeros and supported bounds', () => {
  assert.deepEqual(validateJourneyReference({started_on: ' 2024-02-29 ', baseline_units_week: '14,125', baseline_cost_week: '70.126'}, today), {
    started_on: '2024-02-29', baseline_units_week: 14.13, baseline_cost_week: 70.13,
  });
  assert.deepEqual(validateJourneyReference({started_on: today, baseline_units_week: 0, baseline_cost_week: '0'}, today), {
    started_on: today, baseline_units_week: 0, baseline_cost_week: 0,
  });
  assert.equal(validateJourneyReference({started_on: '1900-01-01', baseline_units_week: 7000, baseline_cost_week: 7000000}, today).baseline_cost_week, 7000000);
});

test('empty, negative, nonfinite and excessive estimates and invalid or future dates fail', () => {
  const valid = {started_on: today, baseline_units_week: 14, baseline_cost_week: 70};
  for (const started_on of ['', '2026-02-30', '2026-09-25', '1899-12-31', null]) {
    assert.throws(() => validateJourneyReference({...valid, started_on}, today));
  }
  for (const value of ['', ' ', null, undefined, -1, Infinity, NaN, 'abc', false, []]) {
    assert.throws(() => validateJourneyReference({...valid, baseline_units_week: value}, today));
    assert.throws(() => validateJourneyReference({...valid, baseline_cost_week: value}, today));
  }
  assert.throws(() => validateJourneyReference({...valid, baseline_units_week: 7000.01}, today));
  assert.throws(() => validateJourneyReference({...valid, baseline_cost_week: 7000000.01}, today));
});

test('moving the reference date changes its duration and window without changing history or anchors', () => {
  const frozenChecks = Object.freeze(checks.map(row => Object.freeze({...row})));
  const frozenSettings = Object.freeze({...settings});
  const before = JSON.stringify({checks: frozenChecks, settings: frozenSettings});
  const anchor = resolveAnchor(frozenSettings, null, {}, {}, today);
  const early = journeyReferenceSummary(frozenChecks, journey('2026-09-21'), frozenSettings, today);
  const later = journeyReferenceSummary(frozenChecks, journey('2026-09-23'), frozenSettings, today);
  assert.equal(early.days, 3);
  assert.equal(early.summary.expected, 4);
  assert.equal(early.summary.units, 14);
  assert.equal(early.summary.cost, 24);
  assert.equal(early.summary.saved, 16);
  assert.equal(early.comparisonPercent, 0);
  assert.equal(later.days, 1);
  assert.equal(later.summary.units, 12);
  assert.equal(later.summary.cost, 20);
  assert.equal(later.summary.saved, 0);
  assert.equal(later.comparisonPercent, 100);
  assert.equal(JSON.stringify({checks: frozenChecks, settings: frozenSettings}), before);
  assert.deepEqual(resolveAnchor(frozenSettings, null, {}, {}, today), anchor);
});

test('changed baselines recalculate savings and comparison while recorded totals remain identical', () => {
  const initial = journeyReferenceSummary(checks, journey('2026-09-21'), settings, today);
  const changed = journeyReferenceSummary(checks, journey('2026-09-21'), {...settings, baseline_units_week: 28, baseline_cost_week: 140}, today);
  assert.deepEqual({...initial.summary, saved: null}, {...changed.summary, saved: null});
  assert.equal(changed.summary.saved, 56);
  assert.equal(changed.comparisonPercent, -50);
  assert.equal(changed.closedKnownDays, 3);
  assert.equal(changed.closedExpectedDays, 3);
  const zero = journeyReferenceSummary(checks, journey('2026-09-21'), {baseline_units_week: 0, baseline_cost_week: 0}, today);
  assert.equal(zero.baselineUnits, 0);
  assert.equal(zero.baselineCost, 0);
  assert.equal(zero.summary.saved, -24);
  assert.equal(zero.comparisonPercent, null);
});

test('unknown values and missing days never become zeros or imply complete comparisons', () => {
  const partial = [
    {checkin_date: '2026-09-21', sober_today: true, alcohol_cost_eur: null},
    {checkin_date: '2026-09-22', sober_today: false, alcohol_units: null, alcohol_cost_eur: 0},
    {checkin_date: today, sober_today: false, alcohol_units: 10, alcohol_cost_eur: 99},
    {checkin_date: '2026-09-25', sober_today: false, alcohol_units: 80, alcohol_cost_eur: 999},
  ];
  const result = journeyReferenceSummary(partial, journey('2026-09-21'), settings, today);
  assert.equal(result.summary.units, 10);
  assert.equal(result.summary.quantityDays, 2);
  assert.equal(result.summary.cost, 99);
  assert.equal(result.summary.costDays, 2);
  assert.equal(result.summary.saved, -79);
  assert.equal(result.closedKnownDays, 1);
  assert.equal(result.closedExpectedDays, 3);
  assert.equal(result.comparisonPercent, null);
  const unknown = journeyReferenceSummary(partial, journey('2026-09-21'), {baseline_units_week: '', baseline_cost_week: null}, today);
  assert.equal(unknown.baselineUnits, null);
  assert.equal(unknown.baselineCost, null);
  assert.equal(unknown.summary.saved, null);
  assert.equal(unknown.comparisonPercent, null);
});

test('today has zero elapsed days but visible records; absent or unusable start gives no summary', () => {
  const result = journeyReferenceSummary(checks, journey(today), settings, today);
  assert.equal(result.days, 0);
  assert.equal(result.summary.expected, 1);
  assert.equal(result.summary.units, 8);
  assert.equal(result.summary.saved, -2);
  assert.equal(result.closedKnownDays, 0);
  assert.equal(result.closedExpectedDays, 0);
  assert.equal(result.comparisonPercent, null);
  for (const value of [null, {}, {started_at: 'invalid'}, journey('2026-09-25'), journey('1899-12-31')]) {
    const invalid = journeyReferenceSummary(checks, value, settings, today);
    assert.equal(invalid.start, null);
    assert.equal(invalid.days, null);
    assert.equal(invalid.summary, null);
    assert.equal(invalid.comparisonPercent, null);
  }
});

test('elapsed duration and coverage use civil days through leap day and both Paris clock changes', () => {
  const coreUrl = new URL('../core.mjs', import.meta.url).href;
  const moduleUrl = new URL('../journey-reference.mjs', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import {parseDay} from ${JSON.stringify(coreUrl)};
    import {journeyReferenceSummary} from ${JSON.stringify(moduleUrl)};
    for (const [start, today] of [['2024-02-28','2024-03-01'],['2026-03-28','2026-03-30'],['2026-10-24','2026-10-26']]) {
      const result = journeyReferenceSummary([], {started_at: parseDay(start).toISOString()}, {}, today);
      assert.equal(result.start, start);
      assert.equal(result.days, 2);
      assert.equal(result.summary.expected, 3);
      assert.equal(result.closedExpectedDays, 2);
      assert.equal(result.summary.saved, null);
      assert.equal(result.comparisonPercent, null);
    }
  `;
  execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: {...process.env, TZ: 'Europe/Paris'}, timeout: 5000, stdio: 'pipe',
  });
});
