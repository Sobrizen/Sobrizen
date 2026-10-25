/** Explicit civil times and real elapsed durations; no midnight fallback. */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const formatters = new Map();

function timeError(code, message, extra = {}) {
  return Object.assign(new Error(message), {code, ...extra});
}

function civilDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || value < '1900-01-01') {
    throw timeError('TIME_DATE_INVALID', 'La date doit être valide et postérieure au 31 décembre 1899.');
  }
  const [year, month, day] = value.split('-').map(Number);
  const instant = new Date(Date.UTC(year, month - 1, day));
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== value) {
    throw timeError('TIME_DATE_INVALID', 'La date est invalide.');
  }
  return {year, month, day};
}

function civilTime(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value)) {
    throw timeError('TIME_CLOCK_INVALID', 'Renseigne une heure de 00:00 à 23:59, ou laisse-la inconnue.');
  }
  const [hour, minute] = value.split(':').map(Number);
  return {hour, minute};
}

function formatter(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone || timeZone.length > 100 || !/^[A-Za-z_][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/u.test(timeZone)) {
    throw timeError('TIME_ZONE_INVALID', 'Le fuseau horaire est invalide.');
  }
  if (formatters.has(timeZone)) return formatters.get(timeZone);
  try {
    const result = new Intl.DateTimeFormat('en-GB-u-ca-iso8601-nu-latn', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    result.format(0);
    if (formatters.size >= 30) formatters.clear();
    formatters.set(timeZone, result);
    return result;
  } catch {
    throw timeError('TIME_ZONE_INVALID', 'Le fuseau horaire est invalide.');
  }
}

/** Require an explicit UTC offset in strings, so the device timezone cannot shift an instant. */
export function instantMilliseconds(value) {
  let millis;
  if (value instanceof Date) millis = value.getTime();
  else if (typeof value === 'number') millis = value;
  else if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3]):[0-5]\d)(?::([0-5]\d)(?:\.\d{1,9})?)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u.exec(value);
    if (!match) throw timeError('TIME_INSTANT_INVALID', 'L’instant doit préciser son fuseau horaire.');
    civilDate(match[1]); civilTime(match[2]);
    millis = Date.parse(value);
  } else throw timeError('TIME_INSTANT_INVALID', 'L’instant est invalide.');
  if (!Number.isFinite(millis) || !Number.isFinite(new Date(millis).getTime())) {
    throw timeError('TIME_INSTANT_INVALID', 'L’instant est invalide.');
  }
  return millis;
}

function partsAt(millis, timeZone) {
  const values = Object.fromEntries(formatter(timeZone).formatToParts(new Date(millis)).map(part => [part.type, part.value]));
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
  };
}

function wallMillis(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour || 0, parts.minute || 0, parts.second || 0);
}

/** Empty for a skipped clock time, two entries for a repeated clock time. */
export function zonedDateTimeCandidates(date, time, timeZone) {
  const wanted = {...civilDate(date), ...civilTime(time), second: 0};
  formatter(timeZone);
  const guess = wallMillis(wanted), offsets = new Set();
  // The window covers both sides of clock changes, including historical whole-day
  // zone jumps. Compare every candidate back to its civil time instead of allowing
  // Date() to silently normalize a nonexistent hour.
  for (let delta = -2 * DAY; delta <= 2 * DAY; delta += 6 * HOUR) {
    const sample = guess + delta;
    offsets.add(wallMillis(partsAt(sample, timeZone)) - sample);
  }
  return [...offsets].map(offset => guess - offset)
    .filter(millis => {
      const actual = partsAt(millis, timeZone);
      return Object.keys(wanted).every(key => actual[key] === wanted[key]);
    })
    .sort((a, b) => a - b)
    .map(millis => new Date(millis).toISOString());
}

/** Resolve a user's declared wall time without silently choosing a DST occurrence. */
export function zonedDateTimeToInstant(date, time, timeZone, disambiguation = 'reject') {
  if (!['reject', 'earlier', 'later'].includes(disambiguation)) {
    throw timeError('TIME_CHOICE_INVALID', 'Choisis la première ou la seconde occurrence de cette heure.');
  }
  const candidates = zonedDateTimeCandidates(date, time, timeZone);
  if (!candidates.length) {
    throw timeError('TIME_NONEXISTENT', 'Cette heure n’existe pas dans ce fuseau à cette date, à cause d’un changement d’heure. Choisis une autre heure.');
  }
  if (candidates.length > 1 && disambiguation === 'reject') {
    throw timeError('TIME_AMBIGUOUS', 'Cette heure existe deux fois à cette date. Précise la première ou la seconde occurrence.', {candidates});
  }
  return disambiguation === 'later' ? candidates.at(-1) : candidates[0];
}

/** Show a persisted instant in any zone without changing the underlying duration. */
export function localDateTime(instant, timeZone) {
  const millis = instantMilliseconds(instant);
  const parts = partsAt(millis, timeZone);
  const pad = value => String(value).padStart(2, '0');
  return {
    date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    time: `${pad(parts.hour)}:${pad(parts.minute)}`,
    timeZone,
    offsetMinutes: (wallMillis(parts) - Math.floor(millis / 1000) * 1000) / MINUTE,
  };
}

export function formatElapsedDuration(elapsedMinutes) {
  if (!Number.isSafeInteger(elapsedMinutes) || elapsedMinutes < 0) {
    throw timeError('TIME_DURATION_INVALID', 'La durée doit être un nombre positif de minutes.');
  }
  if (elapsedMinutes === 0) return 'Moins d’une minute';
  if (elapsedMinutes < 60) return `${elapsedMinutes} min`;
  const totalHours = Math.floor(elapsedMinutes / 60), minutes = elapsedMinutes % 60;
  if (totalHours < 24) return `${totalHours} h${minutes ? ` ${minutes} min` : ''}`;
  const days = Math.floor(totalHours / 24), hours = totalHours % 24;
  if (days < 7) return `${days} jour${days === 1 ? '' : 's'}${hours ? ` ${hours} h` : ''}`;
  const weeks = Math.floor(days / 7), remainingDays = days % 7;
  return `${weeks} semaine${weeks === 1 ? '' : 's'}${remainingDays ? ` ${remainingDays} jour${remainingDays === 1 ? '' : 's'}` : ''}`;
}

/** Completed elapsed units, independent of civil midnight and DST boundaries. */
export function elapsedSince(instant, now = new Date()) {
  const start = instantMilliseconds(instant), current = instantMilliseconds(now);
  if (start > current) throw timeError('TIME_FUTURE', 'L’heure d’arrêt ne peut pas être dans le futur.');
  const elapsedMinutes = Math.floor((current - start) / MINUTE);
  return {
    elapsedMinutes,
    elapsedHours: Math.floor(elapsedMinutes / 60),
    elapsedDays: Math.floor(elapsedMinutes / 1440),
    hours: Math.floor(elapsedMinutes / 60) % 24,
    minutes: elapsedMinutes % 60,
    label: formatElapsedDuration(elapsedMinutes),
  };
}
