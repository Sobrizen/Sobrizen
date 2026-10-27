import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDailyEntryDate, dailyEntryModel, dailyEntryChange, dailyEntryCas, confirmedDailyEntry,
} from '../daily-entry.mjs';

const today = '2026-10-27';
const date = '2026-10-26';
const userId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const id = '00000000-0000-4000-8000-000000000003';
const document = () => ({
  schema_version: 3, timezone: 'Europe/Paris',
  baseline: {started_on: '2026-10-01', units_week: 14, cost_week: 70},
  events: [{id, started_on: '2026-10-05', state: 'abstinent', units_week: 0, cost_week: 0, note: ''}],
  occasions: [], ranges: [],
  goal: {mode: 'abstain', weekly_limit: null, daily_limit: null, target_on: null, why: '', triggers: [], support_first: false, planned_action: ''},
});
const check = overrides => ({
  id, user_id: userId, checkin_date: date, sober_today: false, craving: 5,
  alcohol_units: 2, alcohol_cost_eur: 10, quantity_method: 'calculator',
  drink_details: [{volume: 250, strength: 5}], mood: 3, note: 'Ma note reste privée.',
  energy: 4, sleep_hours: 7, trigger_tags: ['Stress'], ...overrides,
});
const model = ({existing = null, journey = document(), selected = date} = {}) =>
  dailyEntryModel({document: journey, checks: existing ? [existing] : [], date: selected, today});
const input = (state, overrides = {}) => ({
  checkin_date: state.date, sober_today: state.existing ? String(state.existing.sober_today) : '',
  alcohol_units: state.existing?.alcohol_units ?? '', alcohol_cost_eur: state.existing?.alcohol_cost_eur ?? '',
  craving: state.existing?.craving ?? '', ...overrides,
});
const change = (state, overrides = {}) => dailyEntryChange(state, input(state, overrides));

test('date validation rejects future, impossible and pre-baseline daily entries', () => {
  assert.equal(validateDailyEntryDate(date, today, '2026-10-01'), date);
  for (const value of ['2026-10-28', '2026-02-30', '1899-12-31', '2026-09-30', '', null, true]) {
    assert.throws(() => validateDailyEntryDate(value, today, '2026-10-01'));
  }
  assert.throws(() => validateDailyEntryDate('2026-09-30', today, '2026-10-01'), /point de départ/);
});

test('a declared abstinence period does not pre-answer a new daily entry or convert craving into abstinence', () => {
  const state = model();
  assert.equal(state.effective.sober_today, true);
  assert.equal(state.effective.status_source, 'period');
  assert.equal(state.existing, null); assert.equal(state.locked, false);
  assert.throws(() => change(state, {craving: '0'}), /Choisis.*Sans alcool.*Avec alcool/);
  assert.throws(() => change(state, {sober_today: 'unknown'}));
});

test('the current day remains provisional and a period alone does not fill it', () => {
  const state = model({selected: today});
  assert.equal(state.provisional, true); assert.equal(state.effective.sober_today, null);
  const result = change(state, {sober_today: 'true'});
  assert.equal(result.patch.checkin_date, today); assert.equal(result.patch.sober_today, true);
});

test('timeline occasions override conflicting legacy status and lock consumption fields', () => {
  const journey = document();
  journey.occasions.push({id: otherId, date, units: 3, cost: 12});
  const old = check({sober_today: true, alcohol_units: 0});
  const state = model({journey, existing: old});
  assert.equal(state.locked, true); assert.equal(state.effective.sober_today, false);
  assert.deepEqual(state.occasion, {id: otherId, units: 3, cost: 12});
  const result = change(state, {sober_today: 'true', alcohol_units: 0, alcohol_cost_eur: 0, craving: '2'});
  assert.deepEqual(result.patch, {craving: 2}); assert.deepEqual(result.expected, {craving: 5});
  assert.equal(old.sober_today, true); assert.equal(journey.occasions[0].units, 3);
});

test('models are isolated snapshots and reject duplicate or malformed legacy identities', () => {
  const old = check(), state = model({existing: old});
  state.existing.drink_details[0].volume = 100;
  assert.equal(old.drink_details[0].volume, 250);
  assert.throws(() => dailyEntryModel({document: document(), checks: [old, old], date, today}), /actualise/);
  assert.throws(() => model({existing: check({id: null})}));
  assert.throws(() => model({existing: check({sober_today: null})}));
});

test('a new drinking declaration permits unknown quantities and craving without invented scores', () => {
  const result = change(model(), {sober_today: 'false'});
  assert.equal(result.kind, 'insert');
  assert.deepEqual(result.patch, {checkin_date: date, sober_today: false, alcohol_units: null, alcohol_cost_eur: null, quantity_method: null, drink_details: null, craving: null});
  for (const field of ['mood', 'energy', 'sleep_hours', 'note', 'trigger_tags']) assert.equal(Object.hasOwn(result.patch, field), false);
});

test('a new explicit sober day stores zero units while unknown purchases and craving stay null', () => {
  const result = change(model(), {sober_today: true});
  assert.deepEqual(result.patch, {checkin_date: date, sober_today: true, alcohol_units: 0, alcohol_cost_eur: null, quantity_method: 'standard', drink_details: null, craving: null});
});

test('a sober day can record purchases, including a separately declared zero cost', () => {
  assert.equal(change(model(), {sober_today: true, alcohol_cost_eur: 18}).patch.alcohol_cost_eur, 18);
  assert.equal(change(model(), {sober_today: true, alcohol_cost_eur: 0}).patch.alcohol_cost_eur, 0);
  assert.throws(() => change(model(), {sober_today: true, alcohol_cost_eur: -1}));
});

test('zero craving is valid; missing values and invalid coercions never become zero', () => {
  const state = model();
  for (const craving of [0, '0', '0.0']) assert.equal(change(state, {sober_today: 'true', craving}).patch.craving, 0);
  for (const craving of [undefined, null, '', ' ']) assert.equal(change(state, {sober_today: 'true', craving}).patch.craving, null);
  for (const craving of [false, true, [], {}, -1, 11, 1.5, '2.5', '0x0', Infinity, NaN, '1e1']) {
    assert.throws(() => change(state, {sober_today: 'true', craving}));
  }
});

test('optional quantities accept decimals and a real zero cost, with strict positive quantities and upper bounds', () => {
  const state = model();
  const result = change(state, {sober_today: 'false', alcohol_units: '2,25', alcohol_cost_eur: '0', craving: 3});
  assert.equal(result.patch.alcohol_units, 2.25); assert.equal(result.patch.alcohol_cost_eur, 0); assert.equal(result.patch.quantity_method, 'standard');
  for (const alcohol_units of [0, '0', -1, false, [], {}, Infinity, '0x10', '0.001', 1000.01]) {
    assert.throws(() => change(state, {sober_today: 'false', alcohol_units}));
  }
  for (const alcohol_cost_eur of [-1, false, [], {}, Infinity, 1000000.01]) {
    assert.throws(() => change(state, {sober_today: 'false', alcohol_cost_eur}));
  }
});

test('saving an edited craving does not rewrite any consumption, mood, sleep or journal field', () => {
  const old = check(), before = structuredClone(old), state = model({existing: old});
  const result = change(state, {craving: '0'});
  assert.deepEqual(result, {kind: 'update', patch: {craving: 0}, expected: {craving: 5}});
  assert.deepEqual(old, before);
});

test('a craving can be explicitly cleared and null remains distinguishable in CAS', () => {
  assert.deepEqual(change(model({existing: check()}), {craving: ''}), {kind: 'update', patch: {craving: null}, expected: {craving: 5}});
  assert.deepEqual(change(model({existing: check({craving: null})}), {craving: '2'}), {kind: 'update', patch: {craving: 2}, expected: {craving: null}});
});

test('switching to sober preserves purchases while clearing quantity and calculator details', () => {
  const state = model({existing: check()}), result = change(state, {sober_today: 'true'});
  assert.deepEqual(result.patch, {sober_today: true, alcohol_units: 0, quantity_method: 'standard', drink_details: null});
  assert.deepEqual(result.expected, {sober_today: false, alcohol_units: 2, quantity_method: 'calculator', drink_details: [{volume: 250, strength: 5}]});
});

test('switching from sober to drinking can leave amounts unknown instead of claiming zero alcohol', () => {
  const state = model({existing: check({sober_today: true, alcohol_units: 0, alcohol_cost_eur: 0, quantity_method: 'standard', drink_details: null})});
  const result = change(state, {sober_today: 'false', alcohol_units: '', alcohol_cost_eur: ''});
  assert.deepEqual(result.patch, {sober_today: false, alcohol_units: null, alcohol_cost_eur: null, quantity_method: null});
  assert.equal(result.expected.sober_today, true); assert.equal(result.expected.alcohol_units, 0);
});

test('editing calculator quantity clears obsolete details and CAS also guards the status used by the server trigger', () => {
  const result = change(model({existing: check()}), {alcohol_units: '3'});
  assert.deepEqual(result.patch, {alcohol_units: 3, quantity_method: 'standard', drink_details: null});
  assert.equal(result.expected.sober_today, false); assert.equal(result.expected.alcohol_units, 2);
  assert.equal(Object.hasOwn(result.patch, 'alcohol_cost_eur'), false);
});

test('editing only cost preserves the calculator and its details', () => {
  const result = change(model({existing: check()}), {alcohol_cost_eur: '12'});
  assert.deepEqual(result.patch, {alcohol_cost_eur: 12});
  assert.deepEqual(result.expected, {alcohol_cost_eur: 10});
});

test('status and quantity changes guard their unchanged dependencies against concurrent edits', () => {
  const sober = change(model({existing: check({alcohol_cost_eur: 0, quantity_method: 'standard', drink_details: null})}), {sober_today: 'true'});
  assert.equal(Object.hasOwn(sober.patch, 'alcohol_cost_eur'), false);
  assert.equal(Object.hasOwn(sober.expected, 'alcohol_cost_eur'), false);
  assert.equal(sober.expected.quantity_method, 'standard'); assert.equal(sober.expected.drink_details, null);
  const quantity = change(model({existing: check({quantity_method: 'standard', drink_details: null})}), {alcohol_units: 4});
  assert.deepEqual(quantity.patch, {alcohol_units: 4});
  assert.deepEqual(quantity.expected, {alcohol_units: 2, sober_today: false, quantity_method: 'standard', drink_details: null});
});

test('a sparse sober legacy row is not normalized by the client when only craving changes', () => {
  const result = change(model({existing: check({sober_today: true, alcohol_units: undefined, quantity_method: undefined, drink_details: undefined})}), {craving: 4});
  assert.deepEqual(result.patch, {craving: 4});
});

test('a craving alongside a canonical occasion inserts only its known drinking status and optional craving', () => {
  const journey = document(); journey.occasions.push({id: otherId, date, units: 3, cost: 12});
  const state = model({journey});
  assert.throws(() => change(state), /Note ton envie/);
  const result = change(state, {sober_today: 'true', alcohol_units: 0, craving: 0});
  assert.deepEqual(result.patch, {checkin_date: date, sober_today: false, alcohol_units: null, alcohol_cost_eur: null, quantity_method: null, drink_details: null, craving: 0});
});

test('an unchanged daily entry returns no write, including equivalent decimal formatting', () => {
  const result = change(model({existing: check()}), {alcohol_units: '2,00', alcohol_cost_eur: '10.00', craving: '5'});
  assert.deepEqual(result, {kind: 'unchanged', patch: {}, expected: {}});
});

test('a changed input date must be opened before writing and cannot slip through a delayed-day validation', () => {
  assert.throws(() => change(model(), {checkin_date: today}), /date a changé/);
  assert.throws(() => dailyEntryChange({...model(), today: '2026-10-25'}, input(model(), {sober_today: true})), /date passée/);
});

test('CAS uses IS for NULL and preserves boolean, numeric and JSON equality without upsert', () => {
  const calls = [], query = {is(...args) {calls.push(['is', ...args]); return this;}, eq(...args) {calls.push(['eq', ...args]); return this;}};
  const result = dailyEntryCas(query, {craving: null, sober_today: false, alcohol_units: 2, drink_details: [{volume: 250}]});
  assert.equal(result, query);
  assert.deepEqual(calls, [['is', 'craving', null], ['eq', 'sober_today', false], ['eq', 'alcohol_units', 2], ['eq', 'drink_details', '[{"volume":250}]']]);
});

test('confirmation accepts only one row with the requested owner, identity, day and changed fields', () => {
  const row = check({craving: 0}), expected = {userId, date, id, patch: {craving: 0}};
  assert.equal(confirmedDailyEntry(row, expected), row); assert.equal(confirmedDailyEntry([row], expected), row);
  assert.equal(confirmedDailyEntry({...row, alcohol_units: '2.25'}, {...expected, patch: {alcohol_units: 2.25}}).alcohol_units, '2.25');
  for (const response of [null, [], [row, row], {...row, id: ''}, {...row, id: otherId}, {...row, user_id: otherId}, {...row, checkin_date: today}]) {
    assert.throws(() => confirmedDailyEntry(response, expected));
  }
  assert.throws(() => confirmedDailyEntry({...row, craving: 5}, expected), /ne confirme pas/);
  assert.throws(() => confirmedDailyEntry({...row, craving: null}, expected), /ne confirme pas/);
});
