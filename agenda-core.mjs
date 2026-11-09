import {instantMilliseconds, localDateTime, zonedDateTimeToInstant} from './time-core.mjs';

export const AGENDA_KINDS = Object.freeze({appointment: 'Rendez-vous', task: 'Tâche', goal: 'Objectif'});
export const AGENDA_CATEGORIES = Object.freeze({personal: 'Perso', work: 'Pro', wellbeing: 'Bien-être'});
export const AGENDA_FIELDS = Object.freeze(['kind', 'category', 'title', 'notes', 'item_date', 'all_day', 'time_zone', 'starts_at', 'ends_at', 'status', 'goal_target', 'goal_current', 'goal_unit']);
export const AGENDA_COLUMNS = ['id', 'user_id', ...AGENDA_FIELDS, 'version', 'created_at', 'updated_at'].join(',');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const DAY = 86400000;
const error = (field, message, code = 'AGENDA_INVALID') => Object.assign(new Error(message), {field, code});

/** Civil dates use UTC arithmetic only; travelling never moves a date-only deadline. */
export function agendaDate(value, field = 'item_date') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || value < '1900-01-01' || value > '2199-12-31') {
    throw error(field, 'Choisis une date valide entre 1900 et 2199.');
  }
  const date = new Date(value + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw error(field, 'Cette date n’existe pas.');
  return value;
}

export function agendaMoveDay(value, days) {
  agendaDate(value);
  if (!Number.isSafeInteger(days)) throw error('item_date', 'Le déplacement de date est invalide.');
  return agendaDate(new Date(Date.parse(value + 'T12:00:00Z') + days * DAY).toISOString().slice(0, 10));
}

export function agendaZone(value) {
  try { localDateTime(0, value); } catch { throw error('time_zone', 'Choisis un fuseau reconnu, par exemple Europe/Paris.'); }
  return value;
}

export function agendaToday(timeZone, now = new Date()) { return localDateTime(now, agendaZone(timeZone)).date; }

export function agendaPeriod(date, view = 'day') {
  agendaDate(date);
  if (view === 'day') return {start: date, end: date};
  if (view === 'week') {
    const weekday = (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7;
    const monday = Date.parse(date + 'T12:00:00Z') - weekday * DAY;
    const start = new Date(monday).toISOString().slice(0, 10), end = new Date(monday + 6 * DAY).toISOString().slice(0, 10);
    return {start: start < '1900-01-01' ? '1900-01-01' : start, end: end > '2199-12-31' ? '2199-12-31' : end};
  }
  if (view !== 'month') throw error('view', 'Cette vue est inconnue.');
  const start = date.slice(0, 7) + '-01';
  const end = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0, 12)).toISOString().slice(0, 10);
  return {start, end};
}

export function agendaMovePeriod(date, view, direction) {
  if (direction !== 1 && direction !== -1) throw error('view', 'Le sens de navigation est invalide.');
  if (view !== 'month') return agendaMoveDay(date, direction * (view === 'week' ? 7 : 1));
  const d = new Date(agendaDate(date) + 'T12:00:00Z');
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + direction);
  return agendaDate(d.toISOString().slice(0, 10));
}

function textValue(value, field, max, required = false) {
  if (typeof value !== 'string') throw error(field, 'Ce champ doit être du texte.');
  const text = value.trim();
  if ((required && !text) || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) {
    throw error(field, required && !text ? 'Donne un titre à cet élément.' : `Ce champ est limité à ${max} caractères, sans caractère de contrôle.`);
  }
  return text;
}

function integer(value, field, min, max) {
  if (typeof value === 'string' && !/^\d+$/u.test(value.trim())) throw error(field, `Saisis un nombre entier entre ${min} et ${max}.`);
  const number = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isSafeInteger(number) || number < min || number > max) throw error(field, `Saisis un nombre entier entre ${min} et ${max}.`);
  return number;
}

/** Canonical payload, independent from the UI and the browser's own timezone. */
export function validateAgendaPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw error(null, 'L’élément est invalide.');
  if (!Object.hasOwn(AGENDA_KINDS, input.kind)) throw error('kind', 'Choisis rendez-vous, tâche ou objectif.');
  if (!Object.hasOwn(AGENDA_CATEGORIES, input.category)) throw error('category', 'Choisis une catégorie.');
  if (!['open', 'done'].includes(input.status)) throw error('status', 'Choisis un statut valide.');
  if (typeof input.all_day !== 'boolean') throw error('all_day', 'Précise si le rendez-vous dure toute la journée.');
  const result = {
    kind: input.kind, category: input.category,
    title: textValue(input.title, 'title', 120, true), notes: textValue(input.notes ?? '', 'notes', 2000),
    item_date: agendaDate(input.item_date), all_day: input.all_day, time_zone: agendaZone(input.time_zone),
    starts_at: null, ends_at: null, status: input.status, goal_target: null, goal_current: null, goal_unit: '',
  };
  if (input.kind !== 'appointment' && !input.all_day) throw error('all_day', 'Une tâche ou un objectif porte une échéance à la journée.');
  if (input.kind === 'appointment' && !input.all_day) {
    let start, end;
    try { start = instantMilliseconds(input.starts_at); } catch { throw error('start_time', 'Précise une heure de début et son fuseau.'); }
    try { end = instantMilliseconds(input.ends_at); } catch { throw error('end_time', 'Précise une heure de fin et son fuseau.'); }
    const localStart = localDateTime(start, result.time_zone), localEnd = localDateTime(end, result.time_zone);
    if ((start + localStart.offsetMinutes * 60000) % 60000 || (end + localEnd.offsetMinutes * 60000) % 60000) throw error('start_time', 'Les heures doivent être précises à la minute dans le fuseau choisi.');
    if (end <= start || end - start > 7 * DAY) throw error('end_time', 'La fin doit suivre le début, avec une durée maximale de 7 jours.');
    if (localStart.date !== result.item_date) throw error('item_date', 'La date et l’heure de début ne correspondent pas au fuseau choisi.');
    agendaDate(localEnd.date, 'end_date');
    result.starts_at = new Date(start).toISOString(); result.ends_at = new Date(end).toISOString();
  } else if (input.starts_at != null || input.ends_at != null) {
    throw error('all_day', 'Une échéance à la journée ne doit pas contenir d’heure cachée.');
  }
  if (input.kind === 'goal') {
    result.goal_target = integer(input.goal_target, 'goal_target', 1, 100000);
    result.goal_current = integer(input.goal_current, 'goal_current', 0, result.goal_target);
    result.goal_unit = textValue(input.goal_unit ?? '', 'goal_unit', 32);
    result.status = result.goal_current === result.goal_target ? 'done' : 'open';
  } else if (input.goal_target != null || input.goal_current != null || (input.goal_unit ?? '') !== '') {
    throw error('kind', 'La progression est réservée aux objectifs.');
  }
  return result;
}

/** Resolve DST explicitly. A repeated hour is never silently chosen. */
export function agendaPayloadFromFields(fields) {
  const kind = fields.kind, allDay = kind !== 'appointment' || fields.all_day === true || fields.all_day === 'on';
  let starts = null, ends = null;
  if (!allDay) {
    for (const [dateField, timeField, choiceField, which] of [['item_date', 'start_time', 'start_occurrence', 'start'], ['end_date', 'end_time', 'end_occurrence', 'end']]) {
      agendaDate(fields[dateField], dateField); agendaZone(fields.time_zone);
      try {
        const stamp = zonedDateTimeToInstant(fields[dateField], fields[timeField], fields.time_zone, fields[choiceField] || 'reject');
        if (which === 'start') starts = stamp; else ends = stamp;
      } catch (cause) {
        throw error(cause.code === 'TIME_AMBIGUOUS' ? choiceField : timeField, cause.message, cause.code);
      }
    }
  }
  return validateAgendaPayload({
    kind, category: fields.category, title: fields.title, notes: fields.notes ?? '',
    item_date: fields.item_date, all_day: allDay, time_zone: fields.time_zone,
    starts_at: starts, ends_at: ends, status: fields.status || 'open',
    goal_target: kind === 'goal' ? fields.goal_target : null,
    goal_current: kind === 'goal' ? fields.goal_current : null,
    goal_unit: kind === 'goal' ? fields.goal_unit || '' : '',
  });
}

export function agendaRecord(row, uid) {
  if (!row || row.user_id !== uid || !UUID.test(row.id) || !Number.isSafeInteger(row.version) || row.version < 1) {
    throw error(null, 'La réponse ne correspond pas à ton agenda. Actualise ton espace.', 'AGENDA_RESPONSE_INVALID');
  }
  const payload = validateAgendaPayload(row);
  if (payload.status !== row.status) throw error(null, 'La progression reçue est incohérente.', 'AGENDA_RESPONSE_INVALID');
  return {...payload, id: row.id, user_id: uid, version: row.version,
    created_at: new Date(instantMilliseconds(row.created_at)).toISOString(), updated_at: new Date(instantMilliseconds(row.updated_at)).toISOString()};
}

export function agendaItemDates(item, timeZone) {
  if (!item.starts_at) return {start: item.item_date, end: item.item_date};
  return {start: localDateTime(item.starts_at, timeZone).date, end: localDateTime(instantMilliseconds(item.ends_at) - 1, timeZone).date};
}

export function agendaItemsInPeriod(items, {start, end}, timeZone, {category = 'all', kind = 'all', status = 'all'} = {}) {
  return items.filter(item => {
    const dates = agendaItemDates(item, timeZone);
    return dates.start <= end && dates.end >= start && (category === 'all' || item.category === category) &&
      (kind === 'all' || item.kind === kind) && (status === 'all' || item.status === status);
  }).sort((a, b) => {
    const dateOrder = agendaItemDates(a, timeZone).start.localeCompare(agendaItemDates(b, timeZone).start);
    return dateOrder || (a.starts_at || '').localeCompare(b.starts_at || '') || a.title.localeCompare(b.title, 'fr') || a.id.localeCompare(b.id);
  });
}

export function agendaErrorMessage(cause) {
  if (cause?.code === 'PT409') return 'Cet élément a changé dans une autre fenêtre, ou a été supprimé. Ta saisie est conservée. Ferme ce formulaire et actualise l’agenda avant de le rouvrir.';
  if (['42P01', 'PGRST202', 'PGRST205'].includes(cause?.code)) return 'L’agenda n’est pas encore activé sur ce serveur. Tes autres rubriques restent disponibles.';
  if (cause?.code === '42501') return 'Cet enregistrement demande un accès Premium actif. Actualise ton espace pour vérifier ton accès.';
  if (/fetch|network|timeout|abort/iu.test(String(cause?.message))) return 'Connexion interrompue. Ta saisie est conservée ; vérifie l’agenda avant de réessayer.';
  return String(cause?.message || 'L’opération n’a pas abouti. Réessaie.').slice(0, 400);
}

/** Session-scoped, confirmed-only cache. Nothing is written to browser storage. */
export function createAgendaStore(api) {
  const {S} = api;
  let owner = null, epoch = 0, loadSequence = 0, rows = [], ready = false, loading = false, failure = '';
  const pending = new Set();
  const context = () => ({session: api.sessionContext(), epoch, uid: S.user?.id, demo: !!S.demo});
  const current = ctx => ctx.epoch === epoch && api.sameSession(ctx.session) && ctx.uid === S.user?.id && ctx.demo === !!S.demo;
  const changed = () => api.onChange?.();
  function reset() { epoch++; loadSequence++; owner = null; rows = []; ready = false; loading = false; failure = ''; pending.clear(); }
  function ensureOwner() {
    if (owner && !current(owner)) reset();
    if (!owner && S.user) owner = context();
  }
  function assert(ctx, write = false) {
    if (!ctx.uid || !current(ctx)) throw error(null, 'Ton espace a changé. Rouvre l’agenda avant de réessayer.', 'AGENDA_SESSION_CHANGED');
    if (write && !ctx.demo && !api.isPremium()) throw error(null, 'Un accès Premium actif est nécessaire pour créer ou modifier cet élément.', '42501');
  }
  function snapshot() { ensureOwner(); return {rows: rows.map(row => ({...row})), ready, loading, error: failure, pending: new Set(pending)}; }
  async function load() {
    ensureOwner(); const ctx = context(), sequence = ++loadSequence;
    if (!ctx.uid || ctx.demo) return false;
    loading = true; failure = ''; changed();
    try {
      const all = []; let cursor = null;
      for (;;) {
        assert(ctx);
        const batch = await api.accountRequest((db, uid) => {
          if (uid !== ctx.uid) throw error(null, 'Le compte a changé.', 'AGENDA_SESSION_CHANGED');
          let query = db.from('agenda_items').select(AGENDA_COLUMNS).eq('user_id', uid).order('id', {ascending: true}).limit(200);
          if (cursor) query = query.gt('id', cursor);
          return query;
        });
        assert(ctx);
        if (sequence !== loadSequence) return false;
        if (!Array.isArray(batch)) throw error(null, 'La liste reçue est invalide.', 'AGENDA_RESPONSE_INVALID');
        const normalized = batch.map(row => agendaRecord(row, ctx.uid));
        if (normalized.some((row, i) => row.id <= (i ? normalized[i - 1].id : cursor || ''))) throw error(null, 'La pagination de l’agenda est incohérente.', 'AGENDA_RESPONSE_INVALID');
        all.push(...normalized);
        if (batch.length < 200) break;
        cursor = normalized.at(-1).id;
      }
      rows = all; ready = true; failure = ''; return true;
    } catch (cause) {
      if (current(ctx) && sequence === loadSequence) failure = agendaErrorMessage(cause);
      return false;
    } finally { if (current(ctx) && sequence === loadSequence) { loading = false; changed(); } }
  }
  async function save(payload, {id, expectedVersion = null} = {}) {
    ensureOwner(); const ctx = context(); assert(ctx, true);
    const clean = validateAgendaPayload(payload);
    if (!UUID.test(id) || (expectedVersion !== null && (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1))) throw error(null, 'La version de cet élément est invalide.');
    if (pending.has(id)) throw error(null, 'Un enregistrement est déjà en cours.');
    pending.add(id); loadSequence++; loading = false; changed();
    try {
      let saved;
      if (ctx.demo) {
        const existing = rows.find(row => row.id === id);
        if ((existing?.version ?? null) !== expectedVersion) throw error(null, 'Cet exemple a changé.', 'PT409');
        const stamp = (api.now?.() || new Date()).toISOString();
        saved = {...clean, id, user_id: ctx.uid, version: (expectedVersion || 0) + 1, created_at: existing?.created_at || stamp, updated_at: stamp};
      } else {
        saved = await api.accountRequest((db, uid) => {
          assert(ctx, true);
          if (uid !== ctx.uid) throw error(null, 'Le compte a changé.', 'AGENDA_SESSION_CHANGED');
          return db.rpc('save_agenda_item', {p_id: id, p_expected_version: expectedVersion, p_payload: clean});
        });
      }
      assert(ctx);
      const row = agendaRecord(saved, ctx.uid);
      if (row.id !== id || row.version !== (expectedVersion || 0) + 1 || AGENDA_FIELDS.some(key => row[key] !== clean[key])) throw error(null, 'L’enregistrement reçu ne correspond pas à ta saisie. Actualise pour le vérifier.', 'AGENDA_RESPONSE_INVALID');
      // A load started during this write can still contain the previous server snapshot.
      loadSequence++; loading = false;
      rows = [...rows.filter(item => item.id !== id), row]; failure = ''; return {...row};
    } finally { if (current(ctx)) { pending.delete(id); changed(); } }
  }
  async function remove(id, expectedVersion) {
    ensureOwner(); const ctx = context(); assert(ctx);
    if (!UUID.test(id) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw error(null, 'La version de cet élément est invalide.');
    if (pending.has(id)) throw error(null, 'Une opération est déjà en cours.');
    pending.add(id); loadSequence++; loading = false; changed();
    try {
      if (ctx.demo) {
        if (rows.find(row => row.id === id)?.version !== expectedVersion) throw error(null, 'Cet exemple a changé.', 'PT409');
      } else {
        const deleted = await api.accountRequest((db, uid) => {
          assert(ctx);
          if (uid !== ctx.uid) throw error(null, 'Le compte a changé.', 'AGENDA_SESSION_CHANGED');
          return db.rpc('delete_agenda_item', {p_id: id, p_expected_version: expectedVersion});
        });
        assert(ctx);
        if (deleted !== id) throw error(null, 'La suppression n’a pas été confirmée. Actualise pour la vérifier.', 'AGENDA_RESPONSE_INVALID');
      }
      assert(ctx); loadSequence++; loading = false;
      rows = rows.filter(row => row.id !== id); failure = ''; return true;
    } finally { if (current(ctx)) { pending.delete(id); changed(); } }
  }
  function seedDemo(timeZone = 'Europe/Paris') {
    reset(); ensureOwner(); if (!S.demo || !S.user) return;
    const date = agendaToday(timeZone, api.now?.() || new Date()), stamp = (api.now?.() || new Date()).toISOString();
    const examples = [
      {kind: 'appointment', category: 'personal', title: 'Un café avec une amie', offset: 0, start: '12:30', end: '13:30'},
      {kind: 'task', category: 'work', title: 'Préparer ma priorité de la semaine', offset: 0},
      {kind: 'task', category: 'wellbeing', title: 'Garder un moment pour une promenade', offset: 1},
      {kind: 'appointment', category: 'work', title: 'Faire le point sur mon projet', offset: 2, start: '10:00', end: '10:45'},
      {kind: 'goal', category: 'personal', title: 'Lire un livre à mon rythme', offset: 6, goal_target: 10, goal_current: 3, goal_unit: 'chapitres'},
      {kind: 'goal', category: 'wellbeing', title: 'M’accorder trois pauses cette semaine', offset: 4, goal_target: 3, goal_current: 1, goal_unit: 'pauses'},
    ];
    rows = examples.map((example, i) => {
      const day = agendaMoveDay(date, example.offset);
      const payload = agendaPayloadFromFields({...example, notes: 'Exemple fictif, modifiable uniquement dans cette démonstration.', item_date: day, end_date: day,
        time_zone: timeZone, start_time: example.start, end_time: example.end, all_day: !example.start});
      return {...payload, id: `a0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, user_id: S.user.id, version: 1, created_at: stamp, updated_at: stamp};
    });
    ready = true; changed();
  }
  return {snapshot, load, save, remove, reset, seedDemo};
}

function icsText(value) { return String(value).replace(/\\/gu, '\\\\').replace(/\r\n|\r|\n/gu, '\\n').replace(/;/gu, '\\;').replace(/,/gu, '\\,'); }
function icsStamp(value) { return new Date(instantMilliseconds(value)).toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}/u, ''); }
/** RFC 5545 folding counts UTF-8 octets and never splits a code point. */
export function foldAgendaIcsLine(line) {
  const encoder = new TextEncoder(); let part = '', width = 0; const folded = [];
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (width + bytes > 75) { folded.push(part); part = ' '; width = 1; }
    part += char; width += bytes;
  }
  folded.push(part); return folded.join('\r\n');
}

/** Local download only: no subscription, external sync, or promised notifications. */
export function exportAgendaIcs(items, now = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SobriZen//Agenda personnel//FR', 'CALSCALE:GREGORIAN'];
  for (const item of items) {
    const row = agendaRecord(item, item.user_id), event = row.kind === 'appointment';
    lines.push(event ? 'BEGIN:VEVENT' : 'BEGIN:VTODO', `UID:${row.id}@agenda.sobrizen.com`, `DTSTAMP:${icsStamp(now)}`,
      `LAST-MODIFIED:${icsStamp(row.updated_at)}`, `SEQUENCE:${row.version}`, `SUMMARY:${icsText(row.title)}`, 'CLASS:PRIVATE',
      `DESCRIPTION:${icsText(row.notes)}`, `CATEGORIES:${icsText(AGENDA_CATEGORIES[row.category])}`);
    if (event) {
      if (row.starts_at) lines.push(`DTSTART:${icsStamp(row.starts_at)}`, `DTEND:${icsStamp(row.ends_at)}`);
      else {
        // The exclusive end may be 2200-01-01 for the last supported civil day.
        const next = new Date(Date.parse(row.item_date + 'T12:00:00Z') + DAY).toISOString().slice(0, 10);
        lines.push(`DTSTART;VALUE=DATE:${row.item_date.replaceAll('-', '')}`, `DTEND;VALUE=DATE:${next.replaceAll('-', '')}`);
      }
      lines.push('STATUS:CONFIRMED', 'END:VEVENT');
    } else {
      lines.push(`DUE;VALUE=DATE:${row.item_date.replaceAll('-', '')}`, `STATUS:${row.status === 'done' ? 'COMPLETED' : 'NEEDS-ACTION'}`,
        `PERCENT-COMPLETE:${row.kind === 'goal' ? Math.floor(row.goal_current / row.goal_target * 100) : row.status === 'done' ? 100 : 0}`);
      if (row.status === 'done') lines.push(`COMPLETED:${icsStamp(row.updated_at)}`);
      lines.push('END:VTODO');
    }
  }
  lines.push('END:VCALENDAR', '');
  return lines.map(foldAgendaIcsLine).join('\r\n');
}
