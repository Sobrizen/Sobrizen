/** A quick, explicit daily declaration. Unanswered fields never become scores. */
import {esc, parseDay, dateLabel} from './core.mjs';
import {timelineRows} from './timeline-core.mjs';
import {showFieldError, clearFieldError} from './form-validation.mjs';

const FIRST_DAY = '1900-01-01';
const QUANTITY_FIELDS = ['sober_today', 'alcohol_units', 'quantity_method', 'drink_details'];
const CONFLICT_TEXT = 'Ce point a changé depuis son ouverture. Tes réponses restent ici. Ferme ce formulaire, puis actualise ton suivi avant de le rouvrir.';
const clone = value => value == null ? value : structuredClone(value);
const nullable = value => value === undefined ? null : value;
const equal = (left, right) => JSON.stringify(nullable(left)) === JSON.stringify(nullable(right));
function conflict() {return Object.assign(Error(CONFLICT_TEXT), {code: 'DAILY_CONFLICT'});}

export function validateDailyEntryDate(date, today, baseline = FIRST_DAY) {
  if (typeof date !== 'string' || typeof today !== 'string' || typeof baseline !== 'string') throw Error('Choisis une date valide.');
  parseDay(date); parseDay(today); parseDay(baseline);
  if (date < FIRST_DAY || date > today) throw Error('Choisis une date passée ou aujourd’hui.');
  if (date < baseline) throw Error('Cette date précède le point de départ de ton suivi. Modifie d’abord ce point de départ dans Mon suivi, puis Mon objectif et Mes repères de départ.');
  return date;
}

/** The effective timeline is authoritative; an inherited period is not a daily answer. */
export function dailyEntryModel({document: journey, checks = [], date, today}) {
  if (!journey?.baseline) throw Error('Actualise ton parcours avant d’enregistrer ton point du jour.');
  validateDailyEntryDate(date, today, journey.baseline.started_on);
  const matches = checks.filter(row => row?.checkin_date === date);
  if (matches.length > 1) throw conflict();
  const existing = matches[0] || null;
  if (existing && (typeof existing.sober_today !== 'boolean' || !existing.id)) throw conflict();
  const effective = timelineRows(journey, checks, date, date, today).find(row => row.checkin_date === date);
  if (!effective) throw Error('Cette journée n’est pas disponible dans ton parcours.');
  const locked = effective.status_source === 'occasion' && !!effective.occasion_id;
  return {
    date, today, baseline: journey.baseline.started_on, provisional: date === today,
    existing: clone(existing), effective: clone(effective), locked,
    // An occasion remains the only editable source of its consumption amounts.
    occasion: locked ? {id: effective.occasion_id, units: effective.alcohol_units, cost: effective.alcohol_cost_eur} : null,
  };
}

function optionalNumber(value, label, maximum, {integer = false, positive = false} = {}) {
  if (value === undefined || value === null || typeof value === 'string' && value.trim() === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') throw Error(`${label} : renseigne un nombre valide.`);
  const text = String(value).trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/u.test(text)) throw Error(`${label} : renseigne un nombre valide.`);
  const number = Number(text);
  if (!Number.isFinite(number) || number > maximum || integer && !Number.isInteger(number) || positive && number <= 0) {
    throw Error(integer ? `${label} : choisis un entier de 0 à ${maximum}.` : `${label} : renseigne un nombre ${positive ? 'supérieur à 0 et ' : ''}inférieur ou égal à ${maximum}.`);
  }
  // Quantities and prices use the same two-decimal precision as the timeline.
  const rounded = integer ? number : Math.round((number + Number.EPSILON) * 100) / 100;
  if (positive && rounded <= 0) throw Error(`${label} : renseigne au moins 0,01 ou laisse le champ vide.`);
  return rounded;
}

/** Build the smallest patch and its compare-and-set values without touching a journal note. */
export function dailyEntryChange(model, input) {
  validateDailyEntryDate(input.checkin_date, model.today, model.baseline);
  if (input.checkin_date !== model.date) throw Error('La date a changé. Sélectionne à nouveau la journée avant d’enregistrer.');
  const old = model.existing;
  const craving = optionalNumber(input.craving, 'Envie', 10, {integer: true});
  if (model.locked) {
    if (!old) {
      if (craving === null) throw Error('Note ton envie, ou choisis « Modifier la consommation » pour corriger cette journée.');
      return {kind: 'insert', patch: {checkin_date: model.date, sober_today: false, alcohol_units: null, alcohol_cost_eur: null, quantity_method: null, drink_details: null, craving}, expected: {}};
    }
    const patch = equal(old.craving, craving) ? {} : {craving};
    return {kind: Object.keys(patch).length ? 'update' : 'unchanged', patch, expected: Object.keys(patch).length ? {craving: nullable(old.craving)} : {}};
  }
  const sober = input.sober_today === true || input.sober_today === 'true' ? true
    : input.sober_today === false || input.sober_today === 'false' ? false : null;
  if (sober === null) throw Error('Choisis « Sans alcool » ou « Avec alcool » pour cette journée.');
  const units = sober ? 0 : optionalNumber(input.alcohol_units, 'Quantité', 1000, {positive: true});
  // Purchases are independent of consumption: a sober day can still have a cost.
  const cost = optionalNumber(input.alcohol_cost_eur, 'Dépense', 1000000);
  if (!old) {
    return {kind: 'insert', patch: {
      checkin_date: model.date, sober_today: sober, alcohol_units: units, alcohol_cost_eur: cost,
      quantity_method: sober || units !== null ? 'standard' : null, drink_details: null, craving,
    }, expected: {}};
  }
  const patch = {};
  const set = (field, value) => {if (!equal(old[field], value)) patch[field] = value;};
  set('craving', craving);
  set('alcohol_cost_eur', cost);
  if (sober !== old.sober_today) {
    set('sober_today', sober); set('alcohol_units', units);
    set('quantity_method', sober || units !== null ? 'standard' : null); set('drink_details', null);
  } else if (!sober) {
    if (!equal(old.alcohol_units, units)) {
      set('alcohol_units', units); set('quantity_method', units === null ? null : 'standard'); set('drink_details', null);
    }
  }
  const expected = Object.fromEntries(Object.keys(patch).map(field => [field, clone(nullable(old[field]))]));
  // A concurrent status change would otherwise invoke the server's quantity normalizer.
  if (QUANTITY_FIELDS.some(field => Object.hasOwn(patch, field))) expected.sober_today = old.sober_today;
  // Guard dependencies even when their desired value already matches the old value.
  // Otherwise a concurrent edit could keep a stale calculator or change its inputs.
  if (sober !== old.sober_today) {
    for (const field of QUANTITY_FIELDS) expected[field] = clone(nullable(old[field]));
  } else if (Object.hasOwn(patch, 'alcohol_units')) {
    for (const field of ['quantity_method', 'drink_details']) expected[field] = clone(nullable(old[field]));
  }
  return {kind: Object.keys(patch).length ? 'update' : 'unchanged', patch, expected};
}

/** Null filters must use IS NULL; JSON details must be serialized for PostgREST. */
export function dailyEntryCas(query, expected) {
  for (const [field, value] of Object.entries(expected)) {
    query = value === null ? query.is(field, null) : query.eq(field, typeof value === 'object' ? JSON.stringify(value) : value);
  }
  return query;
}

export function confirmedDailyEntry(result, {userId, date, id = null, patch = {}}) {
  const row = Array.isArray(result) && result.length === 1 ? result[0] : result;
  if (!row || Array.isArray(row) || typeof row.id !== 'string' || !row.id || row.user_id !== userId || row.checkin_date !== date || id && row.id !== id) throw conflict();
  for (const [field, value] of Object.entries(patch)) {
    const actual = typeof value === 'number' && typeof row[field] === 'string' && row[field].trim() !== '' ? Number(row[field]) : row[field];
    if (!equal(actual, value)) throw Error('La réponse ne confirme pas toutes tes modifications. Actualise ton suivi avant de réessayer.');
  }
  return row;
}

export function createDailyEntry(api) {
  const {S, progression} = api;
  const forms = new WeakMap();
  let generation = 0;
  const current = context => !!context && context.generation === generation && api.sameSession(context.session);
  function ready(context) {
    if (context && !current(context)) throw Error('Ton espace a changé. Rouvre ce formulaire avant de réessayer.');
    api.privateWrite();
    if (!progression.ready()) throw Error('Actualise ton parcours avant d’enregistrer ton point du jour.');
    if (context && (S.user?.id !== context.userId || S.demo !== context.demo)) throw Error('Ton espace a changé. Rouvre ce formulaire avant de réessayer.');
  }
  function modelFor(date) {
    const model = dailyEntryModel({document: progression.document(), checks: S.checks, date, today: progression.today()});
    if (model.existing && !S.demo && model.existing.user_id !== S.user.id) throw conflict();
    return model;
  }
  function showError(form, error) {
    const context = forms.get(form);
    if (!current(context) || !document.contains(form)) return;
    const box = form.querySelector('#dailyEntryError');
    const raw = String(error?.message || ''), conflicting = ['23505', 'PGRST116', 'DAILY_CONFLICT'].includes(error?.code);
    const field = conflicting ? '' : (['checkin_date', 'sober_today', 'craving', 'alcohol_units', 'alcohol_cost_eur'].includes(error?.field) ? error.field : '') || (/^(Choisis une date|La date|Cette date|Date invalide)/.test(raw) ? 'checkin_date'
      : /^Choisis « Sans alcool »/.test(raw) ? 'sober_today'
      : /^(Envie\s*:|Note ton envie)/.test(raw) ? 'craving'
      : /^Quantité\s*:/.test(raw) ? 'alcohol_units'
      : /^Dépense\s*:/.test(raw) ? 'alcohol_cost_eur' : '');
    // Known local validation stays useful even when a generic API formatter
    // would otherwise replace every error with an offline notice.
    const text = box.textContent = conflicting ? CONFLICT_TEXT : field ? raw : api.message(error);
    const input = field && form.querySelector(`[name="${field}"]`);
    box.dataset.field = field;
    box.hidden = false;
    if (input && !input.disabled) {
      const brief = text.startsWith('Cette date précède') ? `Choisis une date à partir du ${dateLabel(context.model.baseline)}.`
        : text === 'Date invalide.' ? 'Choisis une date valide.' : text;
      showFieldError(input, brief);
    } else box.scrollIntoView?.({block: 'nearest'});
  }
  function clearCorrectedField(event) {
    const input = event.target, form = input.form;
    if (form?.id !== 'dailyEntryForm' || !input.name) return;
    const context = forms.get(form);
    if (!current(context) || context.pending) return;
    // Shared feedback revalidates this field (including radio groups) after
    // the edit. Keep its native errors until the new value is valid.
    const box = form.querySelector('#dailyEntryError');
    if (box.dataset.field === input.name) {box.hidden = true; box.textContent = ''; delete box.dataset.field;}
  }
  const initial = model => ({
    checkin_date: model.date,
    sober_today: model.locked ? 'false' : typeof model.existing?.sober_today === 'boolean' ? String(model.existing.sober_today) : '',
    alcohol_units: model.existing?.alcohol_units ?? '', alcohol_cost_eur: model.existing?.alcohol_cost_eur ?? '',
    craving: model.existing?.craving ?? '',
  });
  function open(date = progression.today(), drafts = new Map()) {
    ready();
    const model = modelFor(date), draft = drafts.get(date), values = draft?.values || initial(model);
    const staleDraft = !!draft && (!equal(draft.model.existing, model.existing) || !equal(draft.model.occasion, model.occasion));
    const context = {generation, session: api.sessionContext(), userId: S.user.id, demo: S.demo, page: S.page, model, drafts, staleDraft, pending: false};
    const status = model.locked ? 'false' : values.sober_today;
    const amount = value => esc(value ?? '');
    api.modal('Renseigner une journée', `<form id="dailyEntryForm" data-health-form novalidate>
      <p class="muted">Une réponse simple pour voir où tu en es. ${model.provisional ? 'Aujourd’hui reste une journée en cours : tu renseignes ce qui s’est passé jusqu’à présent.' : 'Tu peux compléter ou corriger une journée passée.'}</p>
      <label>Date du point<input type="date" name="checkin_date" min="${esc(model.baseline)}" max="${esc(model.today)}" value="${esc(model.date)}" required></label>
      <fieldset class="daily-entry-status"${model.locked ? ' disabled' : ''}><legend>${model.provisional ? 'Jusqu’à présent, aujourd’hui' : 'Pour cette journée'}</legend>
        <label><input type="radio" name="sober_today" value="true"${status === 'true' ? ' checked' : ''} required> Sans alcool</label>
        <label><input type="radio" name="sober_today" value="false"${status === 'false' ? ' checked' : ''} required> Avec alcool</label>
      </fieldset>
      ${model.locked ? `<div class="safety"><p>Une consommation est déjà enregistrée le ${esc(dateLabel(model.date))} : ${Number.isFinite(model.occasion.units) ? `${esc(model.occasion.units)} verre${model.occasion.units === 1 ? '' : 's'} standard` : 'quantité non renseignée'}, ${Number.isFinite(model.occasion.cost) ? `${esc(model.occasion.cost)} €` : 'dépense non renseignée'}. Tu peux noter ton envie ici.</p><button type="button" class="secondary" data-daily-entry="edit-occasion">Modifier la consommation</button></div>` : `<div data-daily-amounts${status === 'false' ? '' : ' hidden'}>
        <label>Verres standard (facultatif)<input type="number" name="alcohol_units" inputmode="decimal" min="0.01" max="1000" step="0.01" value="${amount(values.alcohol_units)}" aria-describedby="dailyQuantityHelp"${status === 'false' ? '' : ' disabled'}></label>
        <p class="small" id="dailyQuantityHelp">Un verre standard correspond à 10 g d’alcool. Ce nombre peut différer du nombre de verres servis. <a href="https://www.alcool-info-service.fr/sites/default/files/2024-12/Alcool_Infographie_reperes.pdf" target="_blank" rel="noopener noreferrer">Comprendre le verre standard (Alcool info service, PDF)</a>.</p>
      </div><label>Achats d’alcool (€, facultatif)<input type="number" name="alcohol_cost_eur" inputmode="decimal" min="0" max="1000000" step="0.01" value="${amount(values.alcohol_cost_eur)}" aria-describedby="dailyCostHelp"></label><p class="small" id="dailyCostHelp">Un achat reste possible même sans boire. Laisse vide si tu ne sais pas.</p>`}
      <label>Mon envie d’alcool (facultatif)<select name="craving"><option value=""${values.craving === '' || values.craving == null ? ' selected' : ''}>Non renseignée</option>${Array.from({length: 11}, (_, value) => `<option value="${value}"${String(values.craving) === String(value) ? ' selected' : ''}>${value}${value === 0 ? ' — aucune envie' : value === 10 ? ' — envie très forte' : ''}</option>`).join('')}</select></label>
      <p class="error-box" id="dailyEntryError" role="alert" hidden></p>
      <button type="submit" class="primary full" data-daily-entry="save">Enregistrer</button>
    </form>`);
    const form = document.querySelector('#dailyEntryForm');
    if (!form) throw Error('Le formulaire n’a pas pu être ouvert.');
    forms.set(form, context);
    if (staleDraft) showError(form, conflict());
  }
  function assertSource(context, change) {
    ready(context);
    const latest = modelFor(context.model.date);
    if (!equal(latest.occasion, context.model.occasion)) throw conflict();
    const old = context.model.existing, row = latest.existing;
    if (old ? row?.id !== old.id : row !== null) throw conflict();
    if (row && Object.entries(change.expected).some(([field, value]) => !equal(row[field], value))) throw conflict();
    return latest;
  }
  async function save(form) {
    const context = forms.get(form);
    ready(context);
    if (!context || context.pending) return;
    if (context.staleDraft) throw conflict();
    // A number input can expose an empty value while the user is still typing
    // an invalid number. Keep that distinct from an intentionally empty amount.
    for (const field of ['alcohol_units', 'alcohol_cost_eur']) {
      const control = form.elements.namedItem(field);
      if (control && !control.disabled && control.validity.badInput) throw Object.assign(Error('Indique un nombre valide, ou laisse ce champ vide.'), {field});
    }
    const input = Object.fromEntries(new FormData(form));
    const change = dailyEntryChange({...context.model, today: progression.today()}, input);
    assertSource(context, change);
    if (change.kind === 'unchanged') {if (document.contains(form)) api.closeModal(); api.notify('Ce point est déjà enregistré.'); return;}
    context.pending = true;
    const controls = [...form.querySelectorAll('input,select,button')].map(control => [control, control.disabled]);
    for (const [control] of controls) control.disabled = true;
    form.setAttribute('aria-busy', 'true');
    const old = context.model.existing;
    try {
      let result;
      if (context.demo) {
        result = {...clone(old || {}), ...change.patch, user_id: context.userId, id: old?.id || crypto.randomUUID()};
      } else {
        result = await api.accountRequest((db, uid) => {
          if (uid !== context.userId) throw Error('Ton espace a changé. Rouvre ce formulaire avant de réessayer.');
          assertSource(context, change);
          let query = db.from('daily_checkins');
          if (change.kind === 'insert') query = query.insert({...change.patch, user_id: uid});
          else query = dailyEntryCas(query.update(change.patch).eq('user_id', uid).eq('id', old.id).eq('checkin_date', context.model.date), change.expected);
          return query.select('*').single();
        }, {sensitive: true});
      }
      ready(context);
      // The date and canonical occasion can change while the request is pending.
      const latest = modelFor(context.model.date);
      if (!equal(latest.occasion, context.model.occasion)) throw conflict();
      const saved = confirmedDailyEntry(result, {userId: context.userId, date: context.model.date, id: old?.id, patch: change.patch});
      if (!equal(latest.existing, old)) {
        // A different local save may have finished after this request's server snapshot.
        // Reload instead of overwriting its newer fields with an older full-row response.
        await api.refresh();
        ready(context); modelFor(context.model.date);
      } else {
        S.checks = [...S.checks.filter(row => row.checkin_date !== saved.checkin_date), saved];
      }
      if (document.contains(form) && form.closest('dialog')?.open && S.page === context.page) {
        api.closeModal(); api.render();
        const dayButton=[...document.querySelectorAll('#content [data-daily-action="day"]')].find(button=>button.dataset.date===context.model.date&&!button.disabled);
        (dayButton||document.getElementById('dy-calendar-title'))?.focus({preventScroll:true});
      }
      api.notify(context.demo ? 'Journée mise à jour dans la démo, sans sauvegarde en ligne.' : 'Journée enregistrée. Ton suivi est à jour.');
    } finally {
      context.pending = false;
      form.removeAttribute('aria-busy');
      for (const [control, wasDisabled] of controls) control.disabled = wasDisabled;
    }
  }
  document.addEventListener('submit', async event => {
    if (event.target.id !== 'dailyEntryForm') return;
    event.preventDefault(); event.stopImmediatePropagation();
    const form = event.target, context = forms.get(form);
    if (!context || context.pending) return;
    form.querySelector('#dailyEntryError').hidden = true;
    try {await save(form);} catch (error) {showError(form, error);}
  }, true);
  document.addEventListener('input', clearCorrectedField, true);
  document.addEventListener('change', clearCorrectedField, true);
  document.addEventListener('change', event => {
    const form = event.target.form;
    if (form?.id !== 'dailyEntryForm') return;
    const context = forms.get(form);
    if (!context || context.pending) return;
    try {
      ready(context);
      if (event.target.name === 'checkin_date') {
        const date = event.target.value;
        validateDailyEntryDate(date, progression.today(), progression.document()?.baseline?.started_on);
        const draft = Object.fromEntries(new FormData(form));
        draft.checkin_date = context.model.date;
        context.drafts.set(context.model.date, {values: draft, model: context.model});
        open(date, context.drafts);
      } else if (event.target.name === 'sober_today' && !context.model.locked) {
        const drinking = event.target.value === 'false', amounts = form.querySelector('[data-daily-amounts]');
        amounts.hidden = !drinking;
        for (const input of amounts.querySelectorAll('input')) {
          input.disabled = !drinking;
          if (!drinking) clearFieldError(input);
          if (drinking && context.model.existing?.sober_today === true && input.value === '0') input.value = '';
        }
        if (!drinking && form.querySelector('#dailyEntryError').dataset.field === 'alcohol_units') {
          const box = form.querySelector('#dailyEntryError'); box.hidden = true; box.textContent = ''; delete box.dataset.field;
        }
      }
    } catch (error) {showError(form, error);}
  }, true);
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-daily-entry="edit-occasion"]');
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const form = button.closest('form'), context = forms.get(form);
    if (!context || context.pending || button.disabled) return;
    try {
      ready(context);
      const craving = form.elements.namedItem('craving').value;
      if (String(context.model.existing?.craving ?? '') !== craving && !confirm('Ton envie n’est pas encore enregistrée. Ouvrir la consommation sans l’enregistrer ?')) return;
      api.closeModal(); progression.openOccasion(context.model.date);
    } catch (error) {showError(form, error);}
  }, true);
  return {open, reset() {generation++;}};
}
