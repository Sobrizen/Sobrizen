import {esc} from './core.mjs';
import {localDateTime, zonedDateTimeCandidates} from './time-core.mjs';
import {showFieldError, clearFieldError, showFormError, clearFormError} from './form-validation.mjs';
import {
  AGENDA_KINDS, AGENDA_CATEGORIES, createAgendaStore, agendaToday, agendaDate, agendaZone,
  agendaPeriod, agendaMoveDay, agendaMovePeriod, agendaItemsInPeriod, agendaItemDates,
  agendaPayloadFromFields, agendaErrorMessage, exportAgendaIcs,
} from './agenda-core.mjs';

const svg = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const icons = {
  calendar: svg('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  arrow: svg('<path d="m9 5 7 7-7 7"/>'),
  goal: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m10 12 2 2 5-6"/>'),
  check: svg('<path d="m5 12 4 4L19 6"/>'),
};
const dateLabel = (date, options = {}) => new Intl.DateTimeFormat('fr-FR', {timeZone: 'UTC', day: 'numeric', month: 'long', ...options}).format(new Date(date + 'T12:00:00Z'));
const countLabel = count => `${count} élément${count > 1 ? 's' : ''}`;
const number = value => new Intl.NumberFormat('fr-FR').format(value);
function defaultZone() { try { return agendaZone(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { return 'Europe/Paris'; } }
function zones(current) {
  let values = [];
  try { values = Intl.supportedValuesOf('timeZone'); } catch { values = ['Europe/Paris', 'Europe/Brussels', 'Europe/Zurich', 'America/Montreal', 'America/New_York', 'Indian/Reunion', 'Africa/Dakar', 'Asia/Tokyo', 'Pacific/Noumea']; }
  return [...new Set([current, 'UTC', ...values])].sort();
}
const options = (entries, value) => entries.map(([key, label]) => `<option value="${esc(key)}"${key === value ? ' selected' : ''}>${esc(label)}</option>`).join('');

/** The host owns routing and its shared dialog. This module owns only agenda state. */
export function createAgenda(api) {
  const {S} = api, doc = api.document || document, forms = new WeakMap();
  const now = () => api.now?.() || new Date();
  const A = {zone: defaultZone(), date: '', view: 'week', category: 'all', kind: 'all', status: 'all', queued: false, destroyed: false, feedback: '', revision: 0};
  A.date = agendaToday(A.zone, now());
  const canWrite = () => !!S.demo || !!api.isPremium();
  const store = createAgendaStore({...api, onChange: () => repaint()});
  const sessionCurrent = state => !A.destroyed && state.revision === A.revision && api.sameSession(state.context);
  const button = (action, label, extra = '', css = 'secondary') => `<button type="button" class="${css}" data-ag-action="${action}" ${extra}>${label}</button>`;
  function repaint(focusId = null) {
    if (A.destroyed || S.page !== 'agenda') return;
    const focus = focusId || (doc.activeElement?.closest('.ag-page') ? doc.activeElement.id : null);
    api.render();
    if (focus) doc.getElementById(focus)?.focus({preventScroll: true});
  }
  function reset() {
    store.reset(); A.revision++; A.date = agendaToday(A.zone, now()); A.view = 'week'; A.category = A.kind = A.status = 'all'; A.feedback = ''; A.queued = false;
    const dialog = doc.querySelector('#modalContent .ag-dialog');
    if (dialog) { api.closeModal(); dialog.remove(); }
  }
  function seedDemo() { store.seedDemo(A.zone); }
  function filtered(rows, period) { return agendaItemsInPeriod(rows, period, A.zone, A); }
  function itemWhen(item) {
    if (!item.starts_at) return item.kind === 'appointment' ? 'Toute la journée' : item.kind === 'goal' ? 'Échéance' : 'À faire';
    const start = localDateTime(item.starts_at, A.zone), end = localDateTime(item.ends_at, A.zone);
    return `${start.time} → ${end.date !== start.date ? dateLabel(end.date, {month: 'short'}) + ' · ' : ''}${end.time}`;
  }
  function itemCard(item, compact = false, scope = 'goal') {
    const completed = item.status === 'done', today = agendaToday(A.zone, now());
    const overdue = !completed && item.kind !== 'appointment' && item.item_date < today;
    const goal = item.kind === 'goal', progress = goal ? Math.floor(item.goal_current / item.goal_target * 100) : 0;
    return `<article class="ag-item${completed ? ' is-done' : ''}${compact ? ' ag-compact' : ''}" data-ag-item="${esc(item.id)}">
      <div class="ag-item-marker ag-category-${item.category}" aria-hidden="true">${completed ? icons.check : goal ? icons.goal : icons.calendar}</div>
      <div class="ag-item-copy"><div class="ag-meta"><span class="ag-category ag-category-${item.category}">${AGENDA_CATEGORIES[item.category]}</span><span>${AGENDA_KINDS[item.kind]}</span>${completed ? '<span class="ag-done">Terminé</span>' : overdue ? '<span class="ag-overdue">À replanifier</span>' : ''}</div>
        <h3>${esc(item.title)}</h3><p class="ag-when">${compact ? `${dateLabel(item.item_date)} · ` : ''}${esc(itemWhen(item))}${item.starts_at && item.time_zone !== A.zone ? ` <span>· créé en ${esc(item.time_zone)}</span>` : ''}</p>
        ${goal ? `<div class="ag-goal-progress"><progress value="${item.goal_current}" max="${item.goal_target}" aria-label="Progression de ${esc(item.title)}">${progress}%</progress><span>${number(item.goal_current)} / ${number(item.goal_target)} ${esc(item.goal_unit)} · ${progress}%</span></div>` : ''}
        ${item.notes && !compact ? `<details class="ag-note"><summary>Ma note privée</summary><p>${esc(item.notes)}</p></details>` : ''}
      </div><div class="ag-item-actions">${button('edit', goal ? 'Progression' : 'Ouvrir', `id="ag-edit-${scope}-${item.id}" data-id="${item.id}" aria-label="${goal ? 'Modifier la progression de' : 'Ouvrir'} ${esc(item.title)}"`, 'ag-small')}
        ${!goal && canWrite() ? button('toggle', completed ? 'Rouvrir' : 'Terminer', `data-id="${item.id}" aria-label="${completed ? 'Rouvrir' : 'Terminer'} ${esc(item.title)}"`, 'ag-small ag-text') : ''}</div>
    </article>`;
  }
  function monthGrid(rows) {
    const {start, end} = agendaPeriod(A.date, 'month'), offset = (new Date(start + 'T12:00:00Z').getUTCDay() + 6) % 7;
    const days = Number(end.slice(8)), cells = Array.from({length: Math.ceil((offset + days) / 7) * 7}, (_, i) => {
      const n = i - offset + 1;
      if (n < 1 || n > days) return '<td class="ag-day-empty"></td>';
      const day = start.slice(0, 8) + String(n).padStart(2, '0'), count = filtered(rows, {start: day, end: day}).length;
      const isToday = day === agendaToday(A.zone, now());
      return `<td><button type="button" id="ag-day-${day}" data-ag-action="day" data-date="${day}" class="ag-day${isToday ? ' is-today' : ''}" aria-pressed="${day === A.date}" aria-label="${esc(dateLabel(day, {weekday: 'long'}))}, ${countLabel(count)}${isToday ? ', aujourd’hui' : ''}"><span>${n}</span><small>${count ? count : '—'}</small></button></td>`;
    });
    return `<table class="ag-month"><caption class="sr-only">${dateLabel(start, {day: undefined, month: 'long', year: 'numeric'})} · Sélectionne une date pour afficher ses éléments</caption><thead><tr>${['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'].map(day => `<th scope="col">${day}</th>`).join('')}</tr></thead><tbody>${Array.from({length: cells.length / 7}, (_, i) => `<tr>${cells.slice(i * 7, i * 7 + 7).join('')}</tr>`).join('')}</tbody></table>`;
  }
  function agendaList(rows) {
    const period = agendaPeriod(A.date, A.view === 'month' ? 'day' : A.view), list = filtered(rows, period);
    if (!list.length) return `<div class="ag-empty">${icons.calendar}<h3>De la place pour ce qui compte.</h3><p>${A.category !== 'all' || A.kind !== 'all' || A.status !== 'all' ? 'Aucun élément ne correspond à ces filtres sur cette période.' : 'Un rendez-vous, une petite tâche ou un objectif : organise ton temps à ton rythme.'}</p>${button('new', 'Ajouter un élément', `data-date="${A.date}"`, 'primary')}</div>`;
    const sections = [];
    for (let date = period.start;; date = agendaMoveDay(date, 1)) {
      const items = list.filter(item => { const range = agendaItemDates(item, A.zone); return range.start <= date && range.end >= date; });
      if (items.length) sections.push(`<section class="ag-day-list" aria-label="${esc(dateLabel(date, {weekday: 'long'}))}"><div class="ag-day-heading"><h2>${dateLabel(date, {weekday: 'long'})}</h2><span>${countLabel(items.length)}</span></div>${items.map(item => itemCard(item, false, date)).join('')}</section>`);
      if (date === period.end) break;
    }
    return sections.join('');
  }
  function view() {
    const state = store.snapshot();
    if (S.user && !S.demo && !state.ready && !state.loading && !state.error && !A.queued) {
      A.queued = true; const context = api.sessionContext();
      queueMicrotask(() => { A.queued = false; if (!A.destroyed && api.sameSession(context)) void store.load(); });
    }
    const today = agendaToday(A.zone, now()), period = agendaPeriod(A.date, A.view), rows = state.rows;
    const goals = rows.filter(item => item.kind === 'goal' && item.status === 'open' && (A.category === 'all' || item.category === A.category)).sort((a, b) => a.item_date.localeCompare(b.item_date));
    const overdue = rows.filter(item => item.kind !== 'appointment' && item.status === 'open' && item.item_date < today && (A.category === 'all' || item.category === A.category));
    const title = A.view === 'month' ? dateLabel(A.date, {day: undefined, month: 'long', year: 'numeric'}) : A.view === 'week' ? `${dateLabel(period.start, {month: 'short'})} — ${dateLabel(period.end, {month: 'short', year: 'numeric'})}` : dateLabel(A.date, {weekday: 'long', year: 'numeric'});
    let prev = false, next = false;
    try { agendaMovePeriod(A.date, A.view, -1); prev = true; } catch {}
    try { agendaMovePeriod(A.date, A.view, 1); next = true; } catch {}
    return `<div class="ag-page">
      <div class="ag-heading"><div><span class="eyebrow">MON TEMPS · MES PRIORITÉS</span><h1>Agenda & objectifs</h1><p>Fais une place à tes projets, à tes proches et à toi.</p></div>${button('new', icons.plus + ' Ajouter', 'id="ag-new"', 'primary')}</div>
      ${S.demo ? '<p class="ag-banner">Démonstration · Ces exemples sont fictifs. Tes changements restent en mémoire pendant cette session.</p>' : !canWrite() ? '<section class="ag-banner" aria-label="Accès Premium"><strong>Un espace pour t’organiser, avec Premium.</strong><p>Crée tes rendez-vous, tâches et objectifs personnels ou professionnels. Tes éléments déjà enregistrés restent consultables, exportables et supprimables.</p><a href="/abonnement.html">Découvrir Premium →</a></section>' : ''}
      <section class="ag-intro"><div><span class="ag-intro-icon">${icons.goal}</span><div><h2>Un pas à la fois.</h2><p>Organiser la semaine, avancer sur un projet ou préserver une pause : tout a sa place ici.</p></div></div><div class="ag-summary"><span><strong>${filtered(rows, {start: today, end: today}).length}</strong>Aujourd’hui</span><span><strong>${goals.length}</strong>Objectif${goals.length > 1 ? 's' : ''} en cours</span></div></section>
      ${state.error ? `<div class="ag-error" role="alert"><p>${esc(state.error)}</p>${state.ready ? '<p>Les derniers éléments chargés sont affichés. Ils peuvent avoir changé sur un autre appareil.</p>' : ''}${button('reload', 'Réessayer', 'id="ag-reload"')}</div>` : ''}
      <p class="ag-feedback" role="status" aria-live="polite">${esc(A.feedback)}</p>
      <div class="ag-layout"><section class="ag-planner" aria-label="Mon agenda" aria-busy="${state.loading}">
        <div class="ag-toolbar"><div class="ag-views" role="group" aria-label="Période affichée">${[['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois']].map(([view, label]) => button('view', label, `id="ag-view-${view}" data-view="${view}" aria-pressed="${A.view === view}"`, 'ag-view')).join('')}</div>${button('today', 'Aujourd’hui', 'id="ag-today"', 'ag-small')}</div>
        <div class="ag-period"><button type="button" class="ag-period-prev" id="ag-prev" data-ag-action="previous" aria-label="Période précédente"${prev ? '' : ' disabled'}>${icons.arrow}</button><h2>${title}</h2><button type="button" id="ag-next" data-ag-action="next" aria-label="Période suivante"${next ? '' : ' disabled'}>${icons.arrow}</button></div>
        <div class="ag-filters"><label>Catégorie<select id="ag-category" data-ag-filter="category">${options([['all', 'Tout'], ...Object.entries(AGENDA_CATEGORIES)], A.category)}</select></label><label>Type<select id="ag-kind" data-ag-filter="kind">${options([['all', 'Tout'], ...Object.entries(AGENDA_KINDS)], A.kind)}</select></label><label>Statut<select id="ag-status" data-ag-filter="status">${options([['all', 'Tout'], ['open', 'En cours'], ['done', 'Terminé']], A.status)}</select></label></div>
        <details class="ag-zone"><summary>Heures affichées en ${esc(A.zone)}</summary><label>Fuseau d’affichage<select id="ag-zone" data-ag-filter="zone">${options(zones(A.zone).map(zone => [zone, zone]), A.zone)}</select></label><p>Les rendez-vous changent d’heure d’affichage selon ce fuseau. Les échéances à la journée gardent leur date.</p></details>
        ${state.loading && !state.ready ? '<div class="ag-empty" role="status">Chargement de ton agenda…</div>' : state.ready ? `${A.view === 'month' ? monthGrid(rows) : ''}${agendaList(rows)}` : state.error ? '<p class="ag-load-note">Aucune donnée n’est présentée comme chargée tant que la connexion n’a pas abouti.</p>' : '<p class="ag-load-note">Ouvre ton espace pour retrouver ton agenda.</p>'}
      </section><div class="ag-sidebar" role="complementary" aria-label="Mes objectifs et outils">
        <section class="ag-side-card"><div class="ag-side-title">${icons.goal}<h2>Mes objectifs</h2></div><p>De petits jalons, à ton rythme.</p>${goals.slice(0, 4).map(item => itemCard(item, true)).join('') || '<p class="ag-side-empty">Un livre, un projet, une habitude : choisis ce que tu veux faire avancer.</p>'}${goals.length > 4 ? button('goals', `Voir mes ${goals.length} objectifs`, '', 'ag-text') : ''}${button('new-goal', '+ Un objectif', '', 'ag-text')}</section>
        ${overdue.length ? `<section class="ag-side-card ag-review"><h2>À replanifier</h2><p>${countLabel(overdue.length)} ont une échéance passée. Tu peux ajuster leur date ou les terminer, sans pression.</p>${overdue.slice(0, 3).map(item => `<button type="button" class="ag-review-item" data-ag-action="edit" data-id="${item.id}"><span>${esc(item.title)}</span><small>${dateLabel(item.item_date)}</small></button>`).join('')}${overdue.length > 3 ? button('overdue', `Voir les ${overdue.length} éléments`, '', 'ag-text') : ''}</section>` : ''}
        <section class="ag-side-card ag-export"><h2>Ton agenda t’appartient.</h2><p>Les rappels ici sont visuels, quand tu ouvres l’application.</p>${button('export-ics', 'Exporter vers mon calendrier', state.ready && rows.length ? '' : 'disabled', 'ag-text')}${button('export-json', 'Télécharger mes données', state.ready ? '' : 'disabled', 'ag-text')}${button('reload', state.loading ? 'Actualisation…' : 'Actualiser', state.loading ? 'disabled' : '', 'ag-text')}<small>L’import .ics est une copie ponctuelle. L’affichage des tâches et objectifs dépend de ton application calendrier.</small></section>
      </div></div><p class="ag-privacy">Espace privé pour ton organisation personnelle et professionnelle. Évite les informations médicales ou confidentielles sur d’autres personnes.</p>
    </div>`;
  }
  function field(name, label, value, type = 'text', attrs = '') {
    return `<label>${label}<input id="ag-field-${name}" name="${name}" type="${type}" value="${esc(value ?? '')}" ${attrs}></label>`;
  }
  function select(name, label, entries, value) { return `<label>${label}<select id="ag-field-${name}" name="${name}">${options(entries, value)}</select></label>`; }
  function occurrence(which, value = 'reject') { return select(`${which}_occurrence`, 'Si cette heure existe deux fois', [['reject', 'Me demander de préciser'], ['earlier', 'Première occurrence'], ['later', 'Seconde occurrence']], value); }
  function occurrenceFor(instant, zone) {
    if (!instant) return 'reject';
    const local = localDateTime(instant, zone), candidates = zonedDateTimeCandidates(local.date, local.time, zone);
    return candidates.length > 1 ? (Date.parse(candidates[0]) === Date.parse(instant) ? 'earlier' : 'later') : 'reject';
  }
  function openEditor(id = null, kind = 'appointment', date = A.date) {
    const row = id ? store.snapshot().rows.find(item => item.id === id) : null;
    if (id && !row) throw new Error('Cet élément n’est plus disponible. Actualise l’agenda.');
    if (!row && !canWrite()) { api.modal('Ton agenda, avec Premium', '<div class="ag-dialog"><p>Rassemble tes rendez-vous, tes tâches et tes objectifs personnels ou professionnels dans un espace privé.</p><a class="primary ag-link-button" href="/abonnement.html">Découvrir Premium</a></div>'); return; }
    const writable = canWrite(), selected = row?.kind || kind, zone = row?.time_zone || A.zone;
    const start = row?.starts_at ? localDateTime(row.starts_at, zone) : {date, time: '09:00'};
    const end = row?.ends_at ? localDateTime(row.ends_at, zone) : {date: row?.item_date || date, time: '10:00'};
    const trigger = doc.activeElement?.id || 'ag-new';
    api.modal(row ? 'Mon ' + AGENDA_KINDS[selected].toLowerCase() : 'Faire une place dans mon agenda', `<form id="agendaItemForm" class="ag-dialog" novalidate>
      ${!writable ? '<p class="ag-banner">Lecture seule : un accès Premium actif permet de modifier cet élément. Tu peux toujours le supprimer ou exporter ton agenda.</p>' : ''}
      <fieldset class="ag-editor-fields"${writable ? '' : ' disabled'}><legend class="sr-only">Détails de l’élément</legend><div class="ag-form-grid">${select('kind', 'Je prépare', Object.entries(AGENDA_KINDS), selected)}${select('category', 'Catégorie', Object.entries(AGENDA_CATEGORIES), row?.category || 'personal')}</div>
      ${field('title', 'Titre', row?.title || '', 'text', 'required maxlength="120" autocomplete="off" placeholder="Par exemple : une promenade, un appel, mon projet…"')}
      <div class="ag-form-grid">${field('item_date', 'Date / échéance', row?.item_date || date, 'date', 'required min="1900-01-01" max="2199-12-31"')}${select('status', 'Statut', [['open', 'En cours'], ['done', 'Terminé']], row?.status || 'open')}</div>
      <fieldset data-ag-section="appointment" class="ag-time-fields"><legend>Horaires du rendez-vous</legend><label class="ag-checkbox"><input type="checkbox" name="all_day"${row?.all_day ? ' checked' : ''}> Toute la journée</label>
        <fieldset data-ag-section="times"><legend class="sr-only">Heures précises</legend><div class="ag-form-grid">${field('start_time', 'Début', start.time, 'time', 'required step="60"')}${occurrence('start', occurrenceFor(row?.starts_at, zone))}</div><div class="ag-form-grid">${field('end_date', 'Date de fin', end.date, 'date', 'required min="1900-01-01" max="2199-12-31"')}${field('end_time', 'Fin', end.time, 'time', 'required step="60"')}</div>${occurrence('end', occurrenceFor(row?.ends_at, zone))}<p class="ag-form-hint">Lors d’un passage à l’heure d’hiver, une heure peut se répéter. La première ou la seconde occurrence sera demandée si nécessaire.</p></fieldset>
      </fieldset>
      <label>Fuseau horaire<input id="ag-field-time_zone" name="time_zone" list="ag-form-zones" value="${esc(zone)}" required maxlength="100" autocomplete="off"></label><datalist id="ag-form-zones">${zones(zone).map(value => `<option value="${esc(value)}"></option>`).join('')}</datalist>
      <fieldset data-ag-section="goal" class="ag-goal-fields"><legend>Ma progression</legend><div class="ag-form-grid">${field('goal_target', 'Cible', row?.goal_target || 5, 'number', 'required min="1" max="100000" step="1"')}${field('goal_current', 'Déjà réalisé', row?.goal_current ?? 0, 'number', 'required min="0" max="100000" step="1"')}</div>${field('goal_unit', 'Unité (facultative)', row?.goal_unit || '', 'text', 'maxlength="32" placeholder="chapitres, étapes, séances…"')}<p class="ag-form-hint">L’objectif est terminé lorsque la progression atteint la cible. Tu peux ajuster la cible et l’échéance à ton rythme.</p></fieldset>
      <label>Note privée (facultative)<textarea id="ag-field-notes" name="notes" maxlength="2000" rows="3">${esc(row?.notes || '')}</textarea></label></fieldset>
      <div class="ag-dialog-actions">${writable ? '<button type="submit" class="primary">Enregistrer</button>' : ''}${button('cancel', writable ? 'Annuler' : 'Fermer')}${row ? button('delete', 'Supprimer', '', 'ag-delete') : ''}</div>
      <p class="ag-form-hint">${S.demo ? 'Exemple fictif : aucun enregistrement en ligne.' : 'Visible uniquement dans ton compte. Aucun email ni rappel automatique ne sera envoyé.'}</p>
    </form>`);
    const form = doc.getElementById('agendaItemForm');
    forms.set(form, {context: api.sessionContext(), revision: A.revision, id: row?.id || crypto.randomUUID(), version: row?.version ?? null, row, pending: false, trigger, writable});
    form.elements.namedItem('item_date').dataset.previousDate = row?.item_date || date;
    syncFields(form); form.querySelector('[name="title"]')?.focus();
  }
  function syncFields(form) {
    const kind = form.elements.namedItem('kind').value, whole = form.elements.namedItem('all_day').checked;
    for (const [section, visible] of [['appointment', kind === 'appointment'], ['times', kind === 'appointment' && !whole], ['goal', kind === 'goal']]) {
      const node = form.querySelector(`[data-ag-section="${section}"]`); node.hidden = !visible; node.disabled = !visible;
      if (!visible) for (const input of node.querySelectorAll('input,select')) clearFieldError(input);
    }
    const status = form.elements.namedItem('status'); status.disabled = kind === 'goal'; status.closest('label').hidden = kind === 'goal';
  }
  function pendingForm(form, state, waiting) {
    state.pending = waiting; form.setAttribute('aria-busy', String(waiting));
    // Freeze the submitted draft so later edits cannot be mistaken for the saved value.
    form.querySelector('.ag-editor-fields').disabled = waiting || !canWrite();
    for (const button of form.querySelectorAll('button')) button.disabled = waiting;
  }
  function formFailure(form, cause) {
    const field = cause.field && form.elements.namedItem(cause.field);
    if (field?.tagName && !field.disabled) { clearFormError(form); showFieldError(field, agendaErrorMessage(cause)); }
    else showFormError(form, agendaErrorMessage(cause));
  }
  async function onSubmit(event) {
    const form = event.target;
    if (form.id !== 'agendaItemForm' && form.id !== 'agendaDeleteForm') return;
    event.preventDefault(); event.stopImmediatePropagation();
    const state = forms.get(form);
    if (!state || state.pending || !sessionCurrent(state) || !form.isConnected) return;
    clearFormError(form); for (const input of form.querySelectorAll('input,select,textarea')) clearFieldError(input);
    try {
      if (form.id === 'agendaDeleteForm') {
        state.pending = true; form.setAttribute('aria-busy', 'true'); form.querySelectorAll('button').forEach(button => { button.disabled = true; });
        await store.remove(state.id, state.version);
      } else {
        if (!canWrite() || !state.writable) throw Object.assign(new Error('Ton accès a changé. Rouvre cet élément après avoir actualisé ton espace.'), {code: '42501'});
        const fields = Object.fromEntries(new form.ownerDocument.defaultView.FormData(form));
        const payload = agendaPayloadFromFields(fields);
        pendingForm(form, state, true);
        await store.save(payload, {id: state.id, expectedVersion: state.version});
      }
      if (!sessionCurrent(state)) return;
      A.feedback = form.id === 'agendaDeleteForm' ? 'Élément supprimé.' : S.demo ? 'Exemple mis à jour dans cette démonstration.' : 'Ton agenda est enregistré.';
      if (form.isConnected) api.closeModal();
      repaint(state.trigger); api.notify(A.feedback);
    } catch (cause) {
      if (sessionCurrent(state) && form.isConnected) {
        if (form.id === 'agendaItemForm') pendingForm(form, state, false);
        else { state.pending = false; form.setAttribute('aria-busy', 'false'); form.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
        formFailure(form, cause);
      }
    }
  }
  function askDelete(form) {
    const state = forms.get(form);
    if (!state || state.pending || !state.row || !sessionCurrent(state)) return;
    api.modal('Supprimer cet élément ?', `<form id="agendaDeleteForm" class="ag-dialog"><p>« ${esc(state.row.title)} » sera retiré de ton agenda. Cette suppression est définitive.</p><div class="ag-dialog-actions"><button type="submit" class="primary">Supprimer cet élément</button>${button('cancel', 'Annuler')}</div></form>`);
    forms.set(doc.getElementById('agendaDeleteForm'), {...state, pending: false});
  }
  async function toggleItem(id, focusId) {
    const row = store.snapshot().rows.find(item => item.id === id), context = api.sessionContext();
    if (!row || row.kind === 'goal') return;
    try {
      await store.save({...row, status: row.status === 'done' ? 'open' : 'done'}, {id, expectedVersion: row.version});
      if (api.sameSession(context)) { A.feedback = row.status === 'done' ? 'Élément rouvert.' : 'Un pas de plus : élément terminé.'; repaint(focusId); api.notify(A.feedback); }
    } catch (cause) { if (api.sameSession(context)) { A.feedback = agendaErrorMessage(cause); repaint(focusId); } }
  }
  function download(type) {
    const state = store.snapshot(); if (!state.ready) throw new Error('Attends le chargement de ton agenda avant de l’exporter.');
    const date = agendaToday(A.zone, now());
    if (type === 'ics') api.download(`sobrizen-agenda-${date}.ics`, exportAgendaIcs(state.rows, now()), 'text/calendar;charset=utf-8');
    else api.download(`sobrizen-agenda-${date}.json`, JSON.stringify({version: 1, exported_at: now().toISOString(), demo: !!S.demo, agenda_items: state.rows}, null, 2), 'application/json');
    A.feedback = type === 'ics' ? 'Fichier téléchargé. Importe-le dans ton calendrier puis vérifie les horaires et la prise en charge des tâches.' : 'Ton agenda a été téléchargé. Conserve ce fichier personnel en lieu sûr.'; repaint();
  }
  function onClick(event) {
    const target = event.target.closest?.('[data-ag-action]');
    if (!target || target.disabled) return;
    const action = target.dataset.agAction;
    event.preventDefault(); event.stopImmediatePropagation();
    try {
      if (action === 'new' || action === 'new-goal') openEditor(null, action === 'new-goal' ? 'goal' : 'appointment', target.dataset.date || A.date);
      else if (action === 'edit') openEditor(target.dataset.id);
      else if (action === 'delete') askDelete(target.closest('form'));
      else if (action === 'cancel') { const state = forms.get(target.closest('form')); if (state?.pending) return; api.closeModal(); if (state) doc.getElementById(state.trigger)?.focus({preventScroll: true}); }
      else if (action === 'toggle') void toggleItem(target.dataset.id, target.closest('.ag-item')?.querySelector('[data-ag-action="edit"]')?.id);
      else if (action === 'reload') void store.load();
      else if (action === 'export-ics') download('ics');
      else if (action === 'export-json') download('json');
      else if (action === 'view') { if (!['day', 'week', 'month'].includes(target.dataset.view)) return; A.view = target.dataset.view; repaint(target.id); }
      else if (action === 'today') { A.date = agendaToday(A.zone, now()); repaint(target.id); }
      else if (action === 'day') { A.date = agendaDate(target.dataset.date); repaint(target.id); }
      else if (action === 'previous' || action === 'next') { A.date = agendaMovePeriod(A.date, A.view, action === 'previous' ? -1 : 1); repaint(target.id); }
      else if (action === 'overdue') {
        const today = agendaToday(A.zone, now()), items = store.snapshot().rows.filter(item => item.kind !== 'appointment' && item.status === 'open' && item.item_date < today && (A.category === 'all' || item.category === A.category));
        api.modal('Replanifier à mon rythme', `<div class="ag-dialog"><p>Ces échéances sont passées. Ouvre un élément pour ajuster sa date, sa progression ou son statut.</p>${items.map(item => itemCard(item, true, 'overdue')).join('')}</div>`);
      }
      else if (action === 'goals') {
        const items = store.snapshot().rows.filter(item => item.kind === 'goal' && item.status === 'open' && (A.category === 'all' || item.category === A.category)).sort((a, b) => a.item_date.localeCompare(b.item_date));
        api.modal('Mes objectifs en cours', `<div class="ag-dialog">${items.map(item => itemCard(item, true, 'all-goals')).join('')}</div>`);
      }
    } catch (cause) { A.feedback = agendaErrorMessage(cause); repaint(); api.notify(A.feedback); }
  }
  function onChange(event) {
    const target = event.target;
    if (target.form?.id === 'agendaItemForm' && ['kind', 'all_day'].includes(target.name)) syncFields(target.form);
    if (target.form?.id === 'agendaItemForm' && target.name === 'item_date') {
      const end = target.form.elements.namedItem('end_date'); if (end.value === target.dataset.previousDate || end.value < target.value) end.value = target.value;
      target.dataset.previousDate = target.value;
    }
    const key = target.dataset.agFilter;
    if (!key) return;
    if (key === 'zone') { A.zone = agendaZone(target.value); }
    else if (['category', 'kind', 'status'].includes(key)) A[key] = target.value;
    repaint(target.id);
  }
  function accessChanged() {
    const form = doc.getElementById('agendaItemForm'), state = form && forms.get(form);
    if (state && !state.pending && sessionCurrent(state)) {
      form.querySelector('.ag-editor-fields').disabled = !canWrite() || !state.writable;
      const save = form.querySelector('button[type="submit"]'); if (save) save.disabled = !canWrite();
      if (!canWrite()) showFormError(form, 'Ton accès Premium a changé. Ta saisie est conservée ; actualise ton espace avant de réessayer.', {focus: false});
    }
    repaint();
  }
  doc.addEventListener('click', onClick, true); doc.addEventListener('submit', onSubmit, true); doc.addEventListener('change', onChange);
  doc.addEventListener('sobrizen-access-change', accessChanged);
  return {view, load: () => store.load(), reset, seedDemo,
    destroy() { A.destroyed = true; store.reset(); doc.removeEventListener('click', onClick, true); doc.removeEventListener('submit', onSubmit, true); doc.removeEventListener('change', onChange); doc.removeEventListener('sobrizen-access-change', accessChanged); },
  };
}
