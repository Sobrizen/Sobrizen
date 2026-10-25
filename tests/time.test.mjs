import test from 'node:test';
import assert from 'node:assert/strict';
import {instantMilliseconds, zonedDateTimeCandidates, zonedDateTimeToInstant, localDateTime, elapsedSince, formatElapsedDuration} from '../time-core.mjs';

test('a declared start twenty minutes ago uses real time instead of awarding a whole date', () => {
  const start = zonedDateTimeToInstant('2026-10-24', '14:10', 'Europe/Paris');
  assert.equal(start, '2026-10-24T12:10:00.000Z');
  assert.deepEqual(elapsedSince(start, '2026-10-24T12:30:59.999Z'), {
    elapsedMinutes: 20, elapsedHours: 0, elapsedDays: 0, hours: 0, minutes: 20, label: '20 min',
  });
  assert.equal(elapsedSince(start, '2026-10-26T12:10:00Z').label, '2 jours');
  assert.equal(elapsedSince(start, '2026-10-31T12:10:00Z').label, '1 semaine');
});

test('spring clock changes use elapsed hours and nonexistent civil times are rejected', () => {
  assert.deepEqual(zonedDateTimeCandidates('2026-03-29', '02:30', 'Europe/Paris'), []);
  assert.throws(() => zonedDateTimeToInstant('2026-03-29', '02:30', 'Europe/Paris'), {code: 'TIME_NONEXISTENT'});
  const start = zonedDateTimeToInstant('2026-03-29', '01:30', 'Europe/Paris');
  const end = zonedDateTimeToInstant('2026-03-29', '03:30', 'Europe/Paris');
  assert.equal(elapsedSince(start, end).elapsedMinutes, 60);
  assert.equal(elapsedSince('2026-03-28T11:00:00Z', '2026-03-29T10:00:00Z').elapsedDays, 0);
});

test('autumn repeated hours require an explicit occurrence instead of a silent guess', () => {
  const candidates = zonedDateTimeCandidates('2026-10-25', '02:30', 'Europe/Paris');
  assert.deepEqual(candidates, ['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z']);
  assert.throws(() => zonedDateTimeToInstant('2026-10-25', '02:30', 'Europe/Paris'), error => error.code === 'TIME_AMBIGUOUS' && error.candidates.length === 2);
  assert.equal(zonedDateTimeToInstant('2026-10-25', '02:30', 'Europe/Paris', 'earlier'), candidates[0]);
  assert.equal(zonedDateTimeToInstant('2026-10-25', '02:30', 'Europe/Paris', 'later'), candidates[1]);
  assert.equal(elapsedSince(candidates[0], candidates[1]).elapsedMinutes, 60);
});

test('half-hour DST transitions and historical skipped dates are not normalized silently', () => {
  assert.deepEqual(zonedDateTimeCandidates('2026-10-04', '02:15', 'Australia/Lord_Howe'), []);
  assert.equal(zonedDateTimeCandidates('2026-04-05', '01:45', 'Australia/Lord_Howe').length, 2);
  assert.deepEqual(zonedDateTimeCandidates('2011-12-30', '12:00', 'Pacific/Apia'), []);
});

test('quarter-hour zones round-trip accurately, including civil dates across UTC midnight', () => {
  const instant = zonedDateTimeToInstant('2026-10-25', '00:20', 'Asia/Kathmandu');
  assert.equal(instant, '2026-10-24T18:35:00.000Z');
  assert.deepEqual(localDateTime(instant, 'Asia/Kathmandu'), {date: '2026-10-25', time: '00:20', timeZone: 'Asia/Kathmandu', offsetMinutes: 345});
});

test('a persisted instant keeps the same elapsed duration when the user travels', () => {
  const instant = zonedDateTimeToInstant('2026-10-24', '14:10', 'Europe/Paris');
  assert.equal(localDateTime(instant, 'America/New_York').time, '08:10');
  assert.equal(localDateTime(instant, 'Asia/Tokyo').time, '21:10');
  assert.equal(elapsedSince(instant, '2026-10-24T12:30:00Z').elapsedMinutes, 20);
  assert.equal(zonedDateTimeToInstant('2026-10-24', '08:10', 'America/New_York'), instant);
});

test('empty hours are unknown inputs, never an invented midnight; invalid civil values are rejected', () => {
  for (const time of ['', null, undefined, '24:00', '12:60', '9:30', '00:00:00']) {
    assert.throws(() => zonedDateTimeToInstant('2026-10-25', time, 'UTC'), {code: 'TIME_CLOCK_INVALID'});
  }
  for (const date of ['2026-02-29', '2024-02-30', '1899-12-31', '2026-1-25', '', null]) {
    assert.throws(() => zonedDateTimeToInstant(date, '12:00', 'UTC'), {code: 'TIME_DATE_INVALID'});
  }
  assert.equal(zonedDateTimeToInstant('2024-02-29', '00:00', 'UTC'), '2024-02-29T00:00:00.000Z');
  assert.equal(zonedDateTimeToInstant('2026-10-25', '12:00', 'GMT0'), '2026-10-25T12:00:00.000Z');
  for (const zone of ['', null, 'Bad/Timezone', '+03:00']) {
    assert.throws(() => zonedDateTimeToInstant('2026-10-25', '12:00', zone), {code: 'TIME_ZONE_INVALID'});
  }
  assert.throws(() => zonedDateTimeToInstant('2026-10-25', '12:00', 'UTC', 'guess'), {code: 'TIME_CHOICE_INVALID'});
});

test('invalid, zone-less and future instants cannot produce an elapsed duration', () => {
  for (const value of ['', '2026-10-25T12:00', '2026-02-30T12:00:00Z', '2026-10-25T24:00:00Z', '2026-10-25', null, false, Infinity, new Date(NaN)]) {
    assert.throws(() => instantMilliseconds(value));
  }
  assert.throws(() => elapsedSince('2026-10-25T12:00:00Z', '2026-10-25T11:59:59Z'), {code: 'TIME_FUTURE'});
  assert.equal(instantMilliseconds('2026-10-25T12:00:00+01:00'), instantMilliseconds('2026-10-25T11:00:00Z'));
});

test('display changes units only after the real duration reaches each threshold', () => {
  const cases = [[0, 'Moins d’une minute'], [20, '20 min'], [59, '59 min'], [60, '1 h'], [61, '1 h 1 min'], [1439, '23 h 59 min'], [1440, '1 jour'], [2940, '2 jours 1 h'], [10079, '6 jours 23 h'], [10080, '1 semaine'], [11520, '1 semaine 1 jour'], [20160, '2 semaines']];
  for (const [minutes, label] of cases) assert.equal(formatElapsedDuration(minutes), label);
  for (const value of [-1, 1.5, NaN, Infinity, '20']) assert.throws(() => formatElapsedDuration(value));
});

test('civil time conversion is independent of the execution host timezone', () => {
  const before = process.env.TZ;
  try {
    for (const zone of ['UTC', 'America/Los_Angeles', 'Pacific/Apia', 'Asia/Tokyo']) {
      process.env.TZ = zone;
      assert.equal(zonedDateTimeToInstant('2026-10-24', '14:10', 'Europe/Paris'), '2026-10-24T12:10:00.000Z');
      assert.equal(zonedDateTimeToInstant('2011-12-30', '12:00', 'Europe/Paris'), '2011-12-30T11:00:00.000Z');
    }
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});
