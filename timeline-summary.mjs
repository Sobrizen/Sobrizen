import {dayKey, moveDay, dayDiff, parseDay, esc} from './core.mjs';
import {addMonths} from './progress-core.mjs';
import {timelineSummary} from './timeline-core.mjs';

const periods = {week: '7 jours', month: '30 jours', year: '12 mois'};
const numbers = new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 2});
const currency = new Intl.NumberFormat('fr-FR', {style: 'currency', currency: 'EUR', maximumFractionDigits: 2});
const shortDate = value => parseDay(value).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', year: 'numeric'});
const count = value => Number.isFinite(value) ? numbers.format(value) : '—';
const euros = value => Number.isFinite(value) ? currency.format(value) : '—';
let nextId = 0;

const glassIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 3h12l-1.3 11a4.7 4.7 0 0 1-9.4 0L6 3Z"/><path d="M7 8h10M12 19v2M8 21h8"/></svg>';
const walletIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 7H5a2 2 0 0 1 0-4h13v4M4 7v12a2 2 0 0 0 2 2h14V7"/><path d="M20 11h-5a3 3 0 0 0 0 6h5M15 14h1"/></svg>';

function rangeFor(period, today) {
  // These are calendar dates, including today. Only actual entries for today
  // are included by timelineSummary; no unelapsed daily estimate is invented.
  const start = period === 'year' ? moveDay(addMonths(today, -12), 1) : moveDay(today, period === 'week' ? -6 : -29);
  return {start, end: today, days: dayDiff(today, start) + 1};
}

function metricInfo(summary, metric) {
  const quantity = metric === 'units';
  const knownDays = quantity ? summary.quantityDays : summary.costDays;
  const estimatedDays = quantity ? summary.estimatedUnitsDays : summary.estimatedCostDays;
  const actualDays = quantity ? summary.actualUnitsDays : summary.actualCostDays;
  const todayKnown = summary.todayActual[metric] !== null;
  const known = knownDays > 0 || todayKnown;
  const partial = knownDays < summary.days;
  const sources = estimatedDays > 0 ? actualDays > 0 || todayKnown ? 'Noté + estimé' : 'Estimé' : known ? 'Noté' : 'À renseigner';
  return {known, partial, sources, knownDays: knownDays + (todayKnown ? 1 : 0), estimatedDays, actualDays: actualDays + (todayKnown ? 1 : 0)};
}

/** A small, read-only report shared by home and the free report. */
export function createSimpleSummary(api) {
  const id = 'tl-simple-' + ++nextId;
  let period = 'week';

  function metricCard(summary, metric, info) {
    const quantity = metric === 'units';
    const value = info.known ? quantity ? count(summary.units) : euros(summary.cost) : '—';
    const label = quantity ? 'Consommation' : 'Dépenses';
    const explanation = info.known
      ? `${info.actualDays} jour${info.actualDays === 1 ? '' : 's'} avec une saisie et ${info.estimatedDays} jour${info.estimatedDays === 1 ? '' : 's'} estimé${info.estimatedDays === 1 ? '' : 's'} à partir de tes périodes. Les jours inconnus restent exclus.`
      : 'Ajoute une consommation ou une période pour retrouver ton total ici. Une journée non renseignée ne vaut pas zéro.';
    return `<details class="tl-simple-metric ${quantity ? 'tl-simple-consumption' : 'tl-simple-spending'}"><summary class="tl-simple-metric-trigger"><span class="tl-simple-metric-title"><span class="tl-simple-icon">${quantity ? glassIcon : walletIcon}</span><span>${label}</span></span><strong>${value}</strong><span class="tl-simple-unit">${quantity ? `verre${summary.units === 1 ? '' : 's'} sur la période` : 'd’alcool sur la période'}</span><span class="tl-simple-source">${info.partial && info.known ? 'Partiel · ' : ''}${info.sources}</span><span class="tl-simple-open">Comprendre ce chiffre <span aria-hidden="true">↗</span></span></summary><div class="tl-simple-explanation"><p>${explanation}</p></div></details>`;
  }

  function view({title = 'Ma consommation et mes dépenses'} = {}) {
    const incoming = api.data(), doc = incoming?.document;
    if (!doc) return '';
    const today = incoming.today || dayKey(), range = rangeFor(period, today);
    const summary = timelineSummary(doc, incoming.checks || [], range.start, range.end, today);
    const units = metricInfo(summary, 'units'), cost = metricInfo(summary, 'cost');
    const comparable = Number.isFinite(summary.saved) && (summary.referenceCostDays > 0 || (summary.todayActual.cost !== null && today >= doc.baseline.started_on));
    const extra = comparable && summary.saved < 0;
    const savings = comparable ? euros(Math.abs(summary.saved)) : '—';
    const partial = units.partial || cost.partial;
    const coverageText = partial ? 'Les jours sans information restent inconnus et ne sont pas comptés comme des jours à zéro.' : 'Les périodes renseignées complètent tes consommations notées.';
    const comparisonText = comparable ? `Comparaison avec tes anciennes habitudes (${euros(doc.baseline.cost_week)} par semaine), sur les jours renseignés à partir du ${shortDate(summary.referenceStart)}.` : 'Ajoute tes anciennes dépenses et des dates pour voir la différence.';
    return `<section class="card tl-simple-summary" data-tl-summary="${id}"><div class="tl-simple-heading"><h2>${esc(title)}</h2><div class="tl-simple-periods" role="group" aria-label="Période du bilan">${Object.entries(periods).map(([value, label]) => `<button type="button" data-tl-summary-action="period" data-tl-summary-period="${value}" data-tl-summary-owner="${id}" aria-pressed="${period === value}">${label}</button>`).join('')}</div></div><p class="tl-simple-dates">Du ${shortDate(range.start)} au ${shortDate(range.end)}</p><div class="tl-simple-grid" aria-live="polite">${metricCard(summary, 'units', units)}${metricCard(summary, 'cost', cost)}</div><div class="tl-simple-savings ${extra ? 'is-extra' : ''}"><div><span>${extra ? 'Dépenses en plus' : 'Économies estimées'}</span><small>par rapport à mes anciennes habitudes</small></div><strong>${savings}</strong></div><details class="tl-simple-details"><summary>Comment lire ces chiffres ?${partial ? '<span>Données partielles</span>' : ''}</summary><p>« Noté » correspond à tes journées saisies. « Estimé » vient des moyennes que tu as renseignées.</p><p>${coverageText}</p><p>Aujourd’hui, seules les consommations et dépenses déjà ajoutées sont incluses. La journée reste en cours.</p><p>${comparisonText}</p></details></section>`;
  }

  function handleClick(target) {
    const button = target?.closest?.('[data-tl-summary-action]');
    if (!button || button.dataset.tlSummaryOwner !== id) return false;
    const next = button.dataset.tlSummaryPeriod;
    if (button.dataset.tlSummaryAction !== 'period' || !Object.hasOwn(periods, next)) return false;
    if (period !== next) {
      period = next;
      api.render();
      document.querySelector(`[data-tl-summary-owner="${id}"][data-tl-summary-period="${period}"]`)?.focus({preventScroll: true});
    }
    return true;
  }

  return {view, handleClick, reset: () => {period = 'week';}};
}
