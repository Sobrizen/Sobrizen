import {dayKey, parseDay, moveDay, dayDiff, dateLabel, esc} from './core.mjs';
import {addMonths} from './progress-core.mjs';
import {timelineRows, timelineSummary} from './timeline-core.mjs';

const numberFormat = new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 2});
const moneyFormat = new Intl.NumberFormat('fr-FR', {style: 'currency', currency: 'EUR', maximumFractionDigits: 2});
const scales = {week: 'Semaine', month: 'Mois', year: 'Année'};
const estimatedSources = new Set(['baseline', 'period']);
const actualSources = new Set(['legacy', 'occasion']);
const sourceNames = {baseline: 'Repère estimé', period: 'Période estimée', legacy: 'Journée notée', occasion: 'Consommation notée', mixed: 'Sources mixtes', unknown: 'Inconnu'};
const num = value => value === null || value === undefined ? '—' : numberFormat.format(value);
const euros = value => value === null || value === undefined ? '—' : moneyFormat.format(value);
const short = date => parseDay(date).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'});
const minDay = (a, b) => a < b ? a : b;
const maxDay = (a, b) => a > b ? a : b;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const validDay = value => {try {parseDay(value); return true;} catch {return false;}};
let chartCount = 0;

function windowRange(scale, offset, today) {
  const endExclusive = scale === 'year' ? addMonths(today, offset * 12) : moveDay(today, offset * (scale === 'week' ? 7 : 30));
  const start = scale === 'year' ? addMonths(today, (offset - 1) * 12) : moveDay(endExclusive, -(scale === 'week' ? 7 : 30));
  const end = offset === 0 ? today : moveDay(endExclusive, -1);
  return {scale, offset, start, end, days: dayDiff(end, start) + 1};
}

function firstKnownDay(doc, checks, today) {
  return [doc.baseline.started_on, ...(doc.events || []).map(event => event.started_on), ...(doc.occasions || []).map(occasion => occasion.date), ...checks.map(check => check.checkin_date)]
    .filter(date => validDay(date) && date <= today).sort()[0] || today;
}

function dateRange(start, end, years = false) {
  if (start === end) return dateLabel(start);
  const firstYear = parseDay(start).getFullYear(), lastYear = parseDay(end).getFullYear();
  return `${short(start)}${years || firstYear !== lastYear ? ' ' + firstYear : ''} – ${short(end)}${years || firstYear !== lastYear ? ' ' + lastYear : ''}`;
}

function amount(value, metric, perDay = false) {
  if (value === null || value === undefined) return 'Non renseigné';
  return `${metric === 'units' ? num(value) + ' verres standard' : euros(value)}${perDay ? ' / jour' : ''}`;
}

function provenance(estimated, actual) {
  if (estimated && actual) return 'Estimation + données notées';
  if (estimated) return 'Estimation';
  if (actual) return 'Données notées';
  return 'Données non renseignées';
}

/** All aggregate points use daily rates. No month-length effect or imputed gaps. */
function plotPoints(rows, range, events, today) {
  const byDay = new Map(rows.map(row => [row.checkin_date, row]));
  const boundaries = new Set([range.start, moveDay(range.end, 1)]);
  const step = range.scale === 'year' ? 7 : 1;
  for (let i = step; i < range.days; i += step) boundaries.add(moveDay(range.start, i));
  if (today >= range.start && today <= range.end) boundaries.add(today);
  // A stop/restart keeps its exact boundary instead of being blended into a week.
  for (const event of events) if (event.started_on > range.start && event.started_on <= range.end) boundaries.add(event.started_on);
  const ordered = [...boundaries].sort();
  return ordered.slice(0, -1).map((start, index) => {
    const end = moveDay(ordered[index + 1], -1), days = dayDiff(end, start) + 1;
    const point = {start, end, date: moveDay(start, Math.floor((days - 1) / 2)), days, provisional: end === today};
    for (const metric of ['units', 'cost']) {
      const field = metric === 'units' ? 'alcohol_units' : 'alcohol_cost_eur';
      let sum = 0, known = 0, estimated = 0, actual = 0;
      for (let i = 0; i < days; i++) {
        const row = byDay.get(moveDay(start, i)), value = row?.[field];
        if (value === null || value === undefined || !Number.isFinite(value)) continue;
        sum += value;
        known++;
        if (estimatedSources.has(row[metric + '_source'])) estimated++;
        if (actualSources.has(row[metric + '_source'])) actual++;
      }
      point[metric] = known ? sum / known : null;
      point[metric + 'Total'] = known ? sum : null;
      point[metric + 'Known'] = known;
      point[metric + 'Estimated'] = estimated;
      point[metric + 'Actual'] = actual;
      point[metric + 'Complete'] = known === days && !point.provisional;
    }
    return point;
  });
}

function transitionEvents(doc, range, today) {
  let previousState = 'drinking';
  return [...(doc.events || [])].sort((a, b) => a.started_on.localeCompare(b.started_on)).map(event => {
    const title = event.state === 'abstinent' ? 'Arrêt déclaré' : previousState === 'abstinent' ? 'Reprise déclarée' : 'Consommation ajustée';
    previousState = event.state;
    return {...event, title};
  }).filter(event => event.started_on >= range.start && (event.started_on <= range.end || range.offset === 0 && event.started_on === today));
}

function stopBands(doc, range) {
  const events = [...(doc.events || [])].sort((a, b) => a.started_on.localeCompare(b.started_on));
  return events.flatMap((event, index) => {
    if (event.state !== 'abstinent') return [];
    const start = maxDay(range.start, event.started_on);
    const end = minDay(range.end, events[index + 1] ? moveDay(events[index + 1].started_on, -1) : range.end);
    return start <= end ? [{start, end}] : [];
  });
}

function colour(value, maximum) {
  const fraction = clamp(value / Math.max(maximum, 0.001), 0, 1);
  const low = [85, 185, 144], high = [25, 86, 74];
  return `rgb(${low.map((component, index) => Math.round(component + (high[index] - component) * fraction)).join(',')})`;
}

/** Rendering and exploration only. Personal history is never changed here. */
export function createTimelineChart(api) {
  const id = 'tl-chart-' + ++chartCount;
  const state = {scale: 'year', offset: 0, metric: 'units', point: null, eventsOpen: false, error: ''};
  const reset = () => Object.assign(state, {scale: 'year', offset: 0, metric: 'units', point: null, eventsOpen: false, error: ''});
  const action = (name, label, attrs = '', className = '') => `<button type="button" class="${className}" data-tl-chart-action="${name}" ${attrs}>${label}</button>`;

  function data() {
    const incoming = api.data(), doc = incoming.document, checks = incoming.checks || [], today = incoming.today || dayKey();
    if (!doc?.baseline) return null;
    const first = firstKnownDay(doc, checks, today);
    state.offset = Math.min(0, state.offset);
    let range = windowRange(state.scale, state.offset, today);
    while (state.offset < 0 && range.end < first) range = windowRange(state.scale, ++state.offset, today);
    const rows = timelineRows(doc, checks, range.start, range.end, today);
    return {
      doc, checks, today, range, rows,
      summary: timelineSummary(doc, checks, range.start, range.end, today),
      points: plotPoints(rows, range, doc.events || [], today),
      events: transitionEvents(doc, range, today),
      bands: stopBands(doc, range),
      canPrev: windowRange(state.scale, state.offset - 1, today).end >= first,
      canNext: state.offset < 0,
    };
  }

  function selectedIndex(points) {
    if (state.point !== null && points[state.point]?.[state.metric] !== null && points[state.point]?.[state.metric] !== undefined) return state.point;
    return points.findLastIndex(point => point[state.metric] !== null);
  }

  function pointDescription(point, metric) {
    const known = point[metric + 'Known'];
    return `${amount(point[metric], metric, state.scale === 'year' && !point.provisional)} · ${provenance(point[metric + 'Estimated'], point[metric + 'Actual'])}${point.provisional ? ' · aujourd’hui, en cours' : ''}${known < point.days ? ` · ${known}/${point.days} jours connus` : ''}`;
  }

  function metricCard(metric, title, summary) {
    const units = metric === 'units', known = units ? summary.quantityDays : summary.costDays;
    const estimated = units ? summary.estimatedUnitsDays : summary.estimatedCostDays;
    const hasToday = summary.todayActual?.[metric] !== null && summary.todayActual?.[metric] !== undefined;
    const actual = (units ? summary.actualUnitsDays : summary.actualCostDays) + (hasToday ? 1 : 0);
    const value = known || hasToday ? summary[metric] : null;
    return action('metric', `<span class="tl-chart-stat-label">${title}<span aria-hidden="true">${units ? '◒' : '€'}</span></span><strong>${units ? num(value) : euros(value)}</strong><span>${units ? 'verres standard au total' : 'de dépenses au total'}</span><small>${provenance(estimated, actual)}${known < summary.days ? ` · ${known}/${summary.days} j clos connus` : ''}${hasToday ? ' · + aujourd’hui' : ''}</small>`, `data-metric="${metric}" aria-pressed="${state.metric === metric}"`, 'tl-chart-stat' + (state.metric === metric ? ' is-selected' : ''));
  }

  function graph(d) {
    const metric = state.metric, points = d.points, selected = selectedIndex(points);
    const current = points[selected];
    const measured = globalThis.document.getElementById(id + '-canvas')?.getBoundingClientRect().width || (globalThis.document.querySelector('#content')?.getBoundingClientRect().width || window.innerWidth) - 64;
    const width = Math.max(250, Math.min(960, measured)), compact = width < 600;
    const height = compact ? 252 : 302, left = 45, right = 18, top = 36, bottom = 42;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const values = points.map(point => point[metric]).filter(value => value !== null);
    const reference = Number(d.doc.baseline[metric === 'units' ? 'units_week' : 'cost_week']) / 7;
    const colourMax = Math.max(0.001, Number.isFinite(reference) ? reference : 0, ...values);
    const peak = Math.max(1, ...values), step = peak <= 4 ? 1 : Math.pow(10, Math.floor(Math.log10(peak))) / 2;
    const maximum = Math.ceil(peak / step) * step;
    const x = date => left + clamp(dayDiff(date, d.range.start) / d.range.days, 0, 1) * plotWidth;
    const pointX = point => x(point.date) + plotWidth / d.range.days / 2;
    const y = value => top + (1 - value / maximum) * plotHeight;
    const definitions = [], lines = [];

    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      if (!a[metric + 'Complete'] || !b[metric + 'Complete'] || a[metric] === null || b[metric] === null) continue;
      const estimate = a[metric + 'Estimated'] > 0 || b[metric + 'Estimated'] > 0;
      const from = {x: pointX(a), y: y(a[metric]), colour: colour(a[metric], colourMax)};
      const to = {x: pointX(b), y: y(b[metric]), colour: colour(b[metric], colourMax)};
      const exactChange = estimate && d.events.some(event => event.started_on === b.start);
      const segments = exactChange ? [
        [from, {...from, x: x(b.start)}],
        [{...from, x: x(b.start)}, {...to, x: x(b.start)}],
        [{...to, x: x(b.start)}, to],
      ] : [[from, to]];
      for (const [part, [start, end]] of segments.entries()) {
        if (start.x === end.x && start.y === end.y) continue;
        const gradient = `${id}-segment-${i}-${part}`;
        definitions.push(`<linearGradient id="${gradient}" gradientUnits="userSpaceOnUse" x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}"><stop stop-color="${start.colour}"/><stop offset="1" stop-color="${end.colour}"/></linearGradient>`);
        const path = `M${start.x},${start.y} L${end.x},${end.y}`;
        lines.push(`<path d="${path}" class="tl-chart-line-outline${estimate ? ' is-estimate' : ''}"/><path d="${path}" class="tl-chart-line${estimate ? ' is-estimate' : ''}" stroke="url(#${gradient})"/>`);
      }
    }

    const bands = d.bands.map(band => `<rect x="${x(band.start)}" y="${top}" width="${x(moveDay(band.end, 1)) - x(band.start)}" height="${plotHeight}" class="tl-chart-stop-band"><title>Arrêt déclaré : ${esc(dateRange(band.start, band.end))}</title></rect>`).join('');
    const grid = Array.from({length: 5}, (_, i) => {
      const value = maximum * i / 4;
      return `<line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}" class="tl-chart-gridline"/><text x="${left - 8}" y="${y(value) + 4}" text-anchor="end">${value >= 1000 ? num(value / 1000) + 'k' : num(value)}</text>`;
    }).join('');
    const tickCount = d.range.scale === 'week' ? 7 : compact ? 5 : 8;
    const ticks = Array.from({length: tickCount}, (_, i) => {
      const date = moveDay(d.range.start, Math.round(i / (tickCount - 1) * (d.range.days - 1)));
      const label = d.range.scale === 'week' ? parseDay(date).toLocaleDateString('fr-FR', {weekday: 'short'}).replace('.', '') : short(date);
      return `<text x="${x(date) + plotWidth / d.range.days / 2}" y="${height - 16}" text-anchor="${i === 0 ? 'start' : i === tickCount - 1 ? 'end' : 'middle'}">${esc(label)}</text>`;
    }).join('');
    const markers = d.events.map(event => `<g class="tl-chart-transition"><line x1="${x(event.started_on)}" x2="${x(event.started_on)}" y1="${top - 8}" y2="${top + plotHeight}"/><path d="M${x(event.started_on) - 4},${top - 10} L${x(event.started_on) + 4},${top - 10} L${x(event.started_on)},${top - 5} Z"/><title>${esc(event.title)} · ${dateLabel(event.started_on)}</title></g>`).join('');
    const dots = points.map((point, index) => {
      if (point[metric] === null) return '';
      const estimated = point[metric + 'Estimated'] > 0, complete = point[metric + 'Complete'];
      const label = `${dateRange(point.start, point.end)} : ${pointDescription(point, metric)}`;
      return `<g role="button" tabindex="${index === selected ? '0' : '-1'}" class="tl-chart-point" data-tl-chart-action="point" data-index="${index}" aria-label="${esc(label)}" aria-pressed="${selected === index}"><circle cx="${pointX(point)}" cy="${y(point[metric])}" r="${d.range.scale === 'year' ? 10 : 15}" class="tl-chart-hit"/><circle cx="${pointX(point)}" cy="${y(point[metric])}" r="${index === selected ? 6 : d.range.scale === 'year' ? 3 : 4}" fill="${estimated || !complete ? 'var(--card)' : colour(point[metric], colourMax)}" stroke="${colour(point[metric], colourMax)}" class="tl-chart-dot${complete ? '' : ' is-incomplete'}"/><title>${esc(label)}</title></g>`;
    }).join('');
    const knownIndices = points.map((point, index) => point[metric] !== null ? index : -1).filter(index => index !== -1);
    const empty = !values.length ? `<div class="tl-chart-empty"><strong>Ton histoire peut commencer avant aujourd’hui.</strong><p>Ajoute une période passée pour voir son évolution.</p>${action('change', 'Ajouter un changement passé', '', 'secondary')}</div>` : '';
    return `<div class="tl-chart-caption"><span>${metric === 'units' ? 'Verres standard / jour' : 'Dépenses en € / jour'}</span><small>${d.range.scale === 'year' ? 'Moyennes sur 7 jours ou moins' : 'Valeurs quotidiennes'}</small></div><div class="tl-chart-canvas" id="${id}-canvas"><svg viewBox="0 0 ${width} ${height}" role="group" aria-labelledby="${id}-title ${id}-description"><title id="${id}-title">${metric === 'units' ? 'Consommation' : 'Dépenses'} : ${esc(dateRange(d.range.start, d.range.end, true))}</title><desc id="${id}-description">Plus la valeur baisse, plus le vert s’éclaircit. Pointillés : estimations. Les blancs restent inconnus. Bandes vert clair : périodes d’arrêt déclarées. Sélectionne un point, puis utilise les flèches gauche et droite pour parcourir la courbe.</desc><defs>${definitions.join('')}</defs>${bands}${grid}${markers}${lines.join('')}${dots}${ticks}</svg>${empty}</div><div class="tl-chart-legend"><span><i class="tl-chart-sample is-estimate" aria-hidden="true"></i>Estimations</span><span><i class="tl-chart-sample" aria-hidden="true"></i>${metric === 'units' ? 'Consommations notées' : 'Dépenses notées'}</span>${d.bands.length ? '<span><i class="tl-chart-band-sample" aria-hidden="true"></i>Arrêt déclaré</span>' : ''}</div><div class="tl-chart-readout" aria-live="polite">${current ? `<div><strong>${dateRange(current.start, current.end)}</strong><span>${amount(current[metric], metric, d.range.scale === 'year' && !current.provisional)}</span><small>${provenance(current[metric + 'Estimated'], current[metric + 'Actual'])}${current.provisional ? ' · aujourd’hui, en cours' : ''}${current[metric + 'Known'] < current.days ? ` · ${current[metric + 'Known']}/${current.days} jours connus` : ''}</small></div><div class="tl-chart-point-nav">${action('point-previous', '‹', `aria-label="Point précédent" ${selected <= knownIndices[0] ? 'disabled' : ''}`)}${action('point-next', '›', `aria-label="Point suivant" ${selected >= knownIndices.at(-1) ? 'disabled' : ''}`)}</div>` : '<span>Une période inconnue ne vaut jamais zéro.</span>'}</div><div class="tl-chart-colour-key"><span>Plus faible</span><i aria-hidden="true"></i><span>Plus élevé</span></div>`;
  }

  function eventList(d) {
    const previous = [...(d.doc.events || [])].filter(event => event.started_on < d.range.start).sort((a, b) => a.started_on.localeCompare(b.started_on)).at(-1);
    let events = d.events;
    if (!events.length && previous) events = [{...previous, title: previous.state === 'abstinent' ? 'Arrêt toujours déclaré' : 'Repère de consommation en cours'}];
    if (!events.length) return '';
    const visible = state.eventsOpen ? events : events.slice(-4);
    return `<div class="tl-chart-events"><div class="tl-chart-events-heading"><h3>Les changements de cette période</h3>${events.length > 4 ? action('events', state.eventsOpen ? 'Réduire' : `Voir les ${events.length}`, `aria-expanded="${state.eventsOpen}"`, 'text') : ''}</div><ol>${visible.map(event => `<li class="${event.state === 'abstinent' ? 'is-stop' : ''}">${action('change', `<time datetime="${event.started_on}">${dateLabel(event.started_on)}</time><span>${esc(event.title)}</span>`, `data-date="${event.started_on}"`)}</li>`).join('')}</ol></div>`;
  }

  function view() {
    const d = data();
    if (!d) return '';
    const periodLabel = state.scale === 'year' ? '12 mois glissants' : state.scale === 'week' ? '7 jours' : '30 jours';
    const saved = d.summary.saved;
    return `<section class="card tl-chart" id="${id}" data-tl-chart-instance="${id}"><div class="tl-chart-top"><div><span class="eyebrow">MON ÉVOLUTION</span><h2>Voir le chemin parcouru</h2></div>${action('change', '+ Ajouter un changement passé', '', 'secondary tl-chart-add')}</div><div class="tl-chart-periods" role="group" aria-label="Période de la courbe">${Object.entries(scales).map(([scale, label]) => action('scale', label, `data-scale="${scale}" aria-pressed="${state.scale === scale}"`, state.scale === scale ? 'is-selected' : '')).join('')}</div><div class="tl-chart-period-heading">${action('previous', '‹', `aria-label="Période précédente" ${d.canPrev ? '' : 'disabled'}`, 'tl-chart-arrow')}<div aria-live="polite"><strong>${dateRange(d.range.start, d.range.end, true)}</strong><span>${periodLabel}${state.offset === 0 ? ' + aujourd’hui' : ''}</span></div>${action('next', '›', `aria-label="Période suivante" ${d.canNext ? '' : 'disabled'}`, 'tl-chart-arrow')}</div>${state.offset !== 0 ? `<div class="tl-chart-current">${action('current', 'Revenir à la période actuelle', '', 'text')}</div>` : ''}<div class="tl-chart-stats">${metricCard('units', 'Consommation', d.summary)}${metricCard('cost', 'Dépenses', d.summary)}</div>${graph(d)}${saved !== null && saved !== undefined ? `<div class="tl-chart-savings"><span>${saved < 0 ? 'Dépense en plus estimée' : 'Économies estimées'}</span><strong>${euros(Math.abs(saved))}</strong><small>Budget de départ · ${d.summary.referenceCostDays??d.summary.costDays} jours clos${d.summary.todayActual?.cost !== null && d.summary.todayActual?.cost !== undefined ? ' + dépenses d’aujourd’hui' : ''}</small></div>` : ''}${eventList(d)}${state.error ? `<p class="tl-chart-error" role="alert">${esc(state.error)}</p>` : ''}<details class="tl-chart-help"><summary>Comprendre la courbe</summary><p>Les estimations suivent tes habitudes déclarées entre deux changements. Les consommations et dépenses notées remplacent l’estimation de leur journée.</p><p>La vue annuelle montre une moyenne par jour, sur des tranches de 7 jours ou moins. Les totaux sont indiqués au-dessus. Un blanc reste inconnu ; une moyenne incomplète reste un point isolé.</p><p>Les bandes vert clair représentent les périodes d’arrêt déclarées. Une consommation notée reste visible, sans effacer ton parcours. Plus la valeur est faible, plus le vert est clair.</p>${saved !== null && saved !== undefined ? '<p>L’écart au budget est une estimation calculée à partir de ton budget de départ, uniquement sur les journées dont les dépenses sont connues.</p>' : ''}<p>Aujourd’hui, seules les consommations et dépenses notées s’ajoutent. La journée reste en cours : son point est isolé et aucune estimation n’est inventée.</p>${action('export', 'Exporter cette période en CSV', '', 'secondary')}</details></section>`;
  }

  function refresh(name, selector = '') {
    api.render();
    globalThis.document.querySelector(`#${id} [data-tl-chart-action="${name}"]${selector}`)?.focus({preventScroll: true});
  }

  function movePoint(direction, edge = false) {
    const d = data();
    if (!d) return;
    const known = d.points.map((point, index) => point[state.metric] !== null ? index : -1).filter(index => index >= 0);
    if (!known.length) return;
    const current = selectedIndex(d.points), position = known.indexOf(current);
    state.point = edge ? direction < 0 ? known[0] : known.at(-1) : known[clamp(position + direction, 0, known.length - 1)];
    refresh('point', `[data-index="${state.point}"]`);
  }

  const actions = {
    scale: button => {if (!scales[button.dataset.scale]) return; state.scale = button.dataset.scale; state.offset = 0; state.point = null; refresh('scale', `[data-scale="${state.scale}"]`);},
    metric: button => {if (!['units', 'cost'].includes(button.dataset.metric)) return; state.metric = button.dataset.metric; state.point = null; refresh('metric', `[data-metric="${state.metric}"]`);},
    previous: () => {if (!data()?.canPrev) return; state.offset--; state.point = null; refresh('previous');},
    next: () => {if (!data()?.canNext) return; state.offset++; state.point = null; refresh('next');},
    current: () => {state.offset = 0; state.point = null; refresh('scale', `[data-scale="${state.scale}"]`);},
    point: button => {state.point = Number(button.dataset.index); refresh('point', `[data-index="${state.point}"]`);},
    'point-previous': () => movePoint(-1),
    'point-next': () => movePoint(1),
    events: () => {state.eventsOpen = !state.eventsOpen; refresh('events');},
    change: button => api.openChange(button.dataset.date || undefined),
    export: () => {
      const d = data();
      if (!d) return;
      const csvNumber = value => value === null || value === undefined ? '' : String(value).replace('.', ',');
      const rows = ['Date;Verres standard;Provenance quantite;Depenses EUR;Provenance depenses;Statut;Provenance statut'];
      for (const row of d.rows) rows.push([
        row.checkin_date, csvNumber(row.alcohol_units), sourceNames[row.units_source] || 'Inconnu',
        csvNumber(row.alcohol_cost_eur), sourceNames[row.cost_source] || 'Inconnu',
        row.sober_today === true ? 'Sans alcool declare' : row.sober_today === false ? 'Consommation declaree' : 'Statut inconnu',
        sourceNames[row.status_source] || 'Inconnu',
      ].join(';'));
      api.download(`sobrizen-historique-${state.scale}-${d.range.start}-${d.range.end}.csv`, '\ufeff' + rows.join('\r\n'), 'text/csv;charset=utf-8');
    },
  };

  function run(name, button) {
    try {state.error = ''; actions[name]?.(button);} catch (error) {state.error = error?.message || 'Cette action n’a pas pu être terminée.'; api.render();}
  }

  globalThis.document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-tl-chart-action]');
    if (!button || button.disabled || button.closest('[data-tl-chart-instance]')?.dataset.tlChartInstance !== id || !actions[button.dataset.tlChartAction]) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    run(button.dataset.tlChartAction, button);
  }, true);
  globalThis.document.addEventListener('keydown', event => {
    const point = event.target.closest?.('.tl-chart-point');
    if (!point || point.closest('[data-tl-chart-instance]')?.dataset.tlChartInstance !== id) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Enter' || event.key === ' ') run('point', point);
    else movePoint(event.key === 'ArrowLeft' || event.key === 'Home' ? -1 : 1, event.key === 'Home' || event.key === 'End');
  });
  return {view, reset};
}
