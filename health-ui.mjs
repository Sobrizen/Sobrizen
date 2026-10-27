import {dayKey, moveDay, dayDiff, parseDay, dateLabel, esc} from './core.mjs';
import {HEALTH_METRICS, validateHealthEntry, mergeHealthObservations, healthTrends, stageProgress} from './health-core.mjs';
import {HEALTH_STAGES, HEALTH_SOURCES, HEALTH_REVIEWED_ON, HEALTH_SAFETY, HEALTH_ADDICTION} from './health-evidence.mjs';
import {encouragementSummary} from './health-encouragement.mjs';
import {localDateTime} from './time-core.mjs';

const number = value => new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 1}).format(value);
const sourceMap = new Map(HEALTH_SOURCES.map(source => [source.id, source]));
const icons = {
  physical: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/><path d="M3 12h5l2-4 3 8 2-4h6"/></svg>',
  mental: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 4a3 3 0 0 0-5 2.2 4 4 0 0 0-1 7.3A4 4 0 0 0 7 20a3 3 0 0 0 5-2V6a3 3 0 0 0-3-2Zm6 0a3 3 0 0 1 5 2.2 4 4 0 0 1 1 7.3 4 4 0 0 1-4 6.5 3 3 0 0 1-5-2V6a3 3 0 0 1 3-2Z"/><path d="M6 9c2 0 3 1 3 3M18 9c-2 0-3 1-3 3M7 16h2m6 0h2"/></svg>',
};

/** Public research stays separate from private, self-reported observations. */
export function createHealth(api) {
  const {S, progression} = api;
  const H = {rows: [], ready: false, error: '', uid: null, generation: 0, stage: null, metric: 'mood', window: 30, historyLimit: 10, clockStage: null, clockDay: null, clockPrecision: null, celebrated: new Set(), savedFeedback: false};
  const forms = new WeakMap();
  const today = () => progression.today();
  const consent = () => api.healthConsentActive();
  const snapshot = () => consent() ? progression.snapshot() : null;
  const observations = () => consent() ? mergeHealthObservations(H.rows, S.checks, today()) : [];
  const contextIsCurrent = context => context.user === S.user && context.demo === S.demo && context.generation === H.generation && consent();

  function reset() {
    H.generation++;
    Object.assign(H, {rows: [], ready: false, error: '', uid: null, stage: null, metric: 'mood', window: 30, historyLimit: 10, celebrated: new Set(), savedFeedback: false});
  }

  async function load() {
    const user = S.user, uid = user?.id, generation = ++H.generation;
    if (H.uid !== uid) H.celebrated.clear();
    H.rows = []; H.ready = false; H.error = ''; H.uid = uid;
    if (!uid || S.demo || !consent()) return;
    try {
      const rows = await api.ownRows('health_checkins', 'checkin_date');
      if (user !== S.user || S.demo || generation !== H.generation || !consent()) return;
      H.rows = rows; H.ready = true;
    } catch (error) {
      if (user === S.user && generation === H.generation) H.error = api.message(error);
    }
  }

  function seedDemo() {
    reset(); H.uid = 'demo'; H.ready = true;
    const stamp = new Date().toISOString();
    H.rows = [27, 21, 13, 10, 7, 5, 2, 0].map((back, i) => ({
      id: 'demo-health-' + i, user_id: 'demo', checkin_date: moveDay(today(), -back),
      mood: [2, 3, 2, 3, 3, 4, 3, 4][i], energy: [2, 2, 3, 2, 3, 4, 3, 4][i],
      sleep_quality: [2, 3, 2, 3, 3, 3, 4, 3][i], anxiety: [4, 3, 4, 3, 3, 2, 3, 2][i],
      concentration: [2, 2, 3, 3, 2, 3, 4, 3][i], physical_comfort: [2, 3, 3, 3, 4, 3, 4, 4][i],
      note: 'Exemple fictif de ressenti, sans valeur médicale.', created_at: stamp, updated_at: stamp,
    }));
  }

  function refs(ids = []) {
    const known = [...new Set(ids)].filter(id => sourceMap.has(id));
    return known.length ? `<button type="button" class="text hz-source-link" data-health-action="sources" data-sources="${esc(known.join(','))}">Sources et limites · ${known.length}</button>` : '';
  }

  function evidenceCard(kind, items) {
    return `<article class="card hz-evidence hz-${kind}"><div class="hz-card-heading"><span class="hz-icon">${icons[kind]}</span><h3>${kind === 'physical' ? 'Côté corps' : 'Côté esprit'}</h3></div>${items.map(item => `<div class="hz-finding"><h4>${esc(item.title)}</h4><p>${esc(item.text)}</p>${refs(item.sourceIds)}</div>`).join('')}</article>`;
  }

  function instantLabel(value, zone) {
    try {
      const local = localDateTime(value, zone || 'UTC');
      return `${dateLabel(local.date)} à ${local.time.replace(':', ' h ')}`;
    } catch { return ''; }
  }

  function clockFace(progress) {
    if (!progress.active) return {value: 'À ton rythme', unit: 'Chaque nouveau départ compte', detail: ''};
    if (progress.precision !== 'minute') return {value: number(progress.days), unit: `jour${progress.days === 1 ? '' : 's'} · heure inconnue`, detail: 'Repères à la journée'};
    if (progress.elapsedDays > 0) return {value: number(progress.elapsedDays), unit: `jour${progress.elapsedDays === 1 ? '' : 's'} depuis ton dernier verre`, detail: `+ ${progress.hours} h ${progress.minutes} min`};
    if (progress.hours > 0) return {value: number(progress.hours), unit: `heure${progress.hours === 1 ? '' : 's'} depuis ton dernier verre`, detail: `+ ${progress.minutes} min`};
    return {value: progress.elapsedMinutes ? number(progress.elapsedMinutes) : '< 1', unit: `minute${progress.elapsedMinutes > 1 ? 's' : ''} depuis ton dernier verre`, detail: 'Ton arrêt commence ici'};
  }

  function nextMilestone(progress) {
    return progress.stages.find((stage, index) => index > progress.stageIndex && stage.state === 'future' && (progress.precision === 'minute' || stage.fromMinutes >= 1440));
  }

  function remainingLabel(stage) {
    if (!stage?.targetAt) return '';
    const minutes = Math.max(0, Math.ceil((Date.parse(stage.targetAt) - Date.now()) / 60000));
    if (minutes < 60) return minutes ? `dans ${minutes} min` : 'ce repère commence';
    const days = Math.floor(minutes / 1440), hours = Math.floor(minutes / 60) % 24, rest = minutes % 60;
    if (days) return `dans ${days} j${hours ? ` ${hours} h` : ''}`;
    return `dans ${hours} h${rest ? ` ${rest} min` : ''}`;
  }

  // Research windows use rounded months; celebrations name the elapsed duration exactly.
  function milestoneDuration(stage) {
    const minutes = stage?.fromMinutes || 0;
    if (minutes >= 1440 && minutes % 1440 === 0) {
      const days = minutes / 1440;
      return days % 7 === 0 && days <= 56 ? `${days / 7} semaine${days === 7 ? '' : 's'}` : `${days} jour${days === 1 ? '' : 's'}`;
    }
    if (minutes >= 60) return `${minutes / 60} heure${minutes === 60 ? '' : 's'}`;
    return minutes ? `${minutes} minutes` : 'Ton départ';
  }

  const stepCheck = '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="m8 16 5 5 11-11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/></svg>';

  function journeyHero(progress, encouragement, animate) {
    const face = clockFace(progress), next = nextMilestone(progress), milestone = encouragement.currentMilestone;
    const origin = !progress.active ? '' : progress.precision === 'minute' ? instantLabel(progress.startedAt, progress.timeZone) : dateLabel(progress.startDate);
    const title = !progress.active ? 'Ton chemin garde sa valeur.' : milestone?.fromMinutes > 0 ? 'Tu avances. Ce cap est à toi.' : 'Tu as fait le premier pas.';
    const cap = milestone?.fromMinutes > 0 ? `${milestone.approx ? 'Repère' : 'Cap franchi'} · ${milestoneDuration(milestone)}` : progress.active ? 'Ton arrêt est commencé' : 'Un prochain pas, à ton rythme';
    return `<section class="hz-hero hz-hero-clock hz-encouraging ${animate ? 'hz-celebrate' : ''}" data-health-celebration data-health-milestone="${esc(milestone?.id || '')}" data-health-new-milestone="${animate}"><div class="hz-hero-copy"><span class="hz-kicker">DU TEMPS POUR TOI</span><h2>${title}</h2><p class="hz-hero-encouragement">${progress.active ? 'Le chemin parcouru compte. Repère ce qui te fait du bien et construis la suite, un pas après l’autre.' : 'Les efforts, les découvertes et les notes de ton parcours restent là. Tu gardes une place pour la suite.'}</p><p class="hz-hero-origin">${progress.active ? `Arrêt déclaré depuis le ${esc(origin)}.` : 'Renseigne ton arrêt pour situer tes prochains repères.'}</p><div class="row"><button class="light" type="button" data-health-action="checkin" ${!consent() || !H.ready ? 'disabled' : ''}>Noter mon ressenti ＋</button><button class="hz-hero-link" type="button" data-health-action="stop-time" ${!consent() ? 'disabled' : ''}>${progress.precision === 'minute' ? 'Modifier mon arrêt' : progress.active ? 'Préciser mon heure' : 'Renseigner mon arrêt'}</button></div></div><div class="hz-counter hz-live-counter ${progress.active ? '' : 'is-idle'}" aria-label="Durée depuis ton dernier verre déclaré"><span class="hz-step-seal" aria-hidden="true">${stepCheck}</span><strong data-health-clock-value>${esc(face.value)}</strong><span data-health-clock-unit>${esc(face.unit)}</span><small data-health-clock-detail>${esc(face.detail)}</small></div><div class="hz-journey-track" aria-label="Ton parcours déclaré"><div class="hz-journey-node ${progress.active ? 'is-done' : ''}"><span class="hz-journey-dot" aria-hidden="true">${progress.active ? stepCheck : '1'}</span><strong>Ton départ</strong><small>${progress.active ? dateLabel(progress.startDate) : 'Quand tu es prêt'}</small></div><div class="hz-journey-node ${progress.active ? 'is-current' : ''}"><span class="hz-journey-dot" aria-hidden="true">${progress.active ? stepCheck : '2'}</span><strong>${esc(cap)}</strong><small>${progress.active ? 'Un pas que tu as fait' : 'Ton histoire reste conservée'}</small></div><div class="hz-journey-node"><span class="hz-journey-dot" aria-hidden="true">↗</span><strong>${next ? `Prochain repère · ${esc(milestoneDuration(next))}` : 'La suite t’appartient'}</strong><small>${next?.targetAt ? `<span data-health-countdown>${esc(remainingLabel(next))}</span>` : next?.targetDate ? `Vers le ${dateLabel(next.targetDate)}` : 'Un jour après l’autre'}</small></div></div><div class="hz-hero-bottom"><span>${Number.isInteger(progress.totalSoberDays) && progress.totalSoberDays > 0 ? `${number(progress.totalSoberDays)} jours sans alcool dans ton historique · chaque période garde sa place` : 'Ton parcours est personnel. Le soutien reste disponible à chaque étape.'}</span>${progress.active ? '<button type="button" class="text hz-celebrate-button" data-health-action="celebrate">Célébrer ce pas <span aria-hidden="true">↗</span></button>' : '<button type="button" class="text" data-page="progress">Retrouver mon parcours →</button>'}</div></section>${progress.active && progress.precision !== 'minute' ? `<div class="hz-time-hint"><span aria-hidden="true">◷</span><p>Tu connais l’heure de ton dernier verre ? Ajoute-la pour suivre les heures et les minutes. La date seule reste un repère utile.</p><button class="text" type="button" data-health-action="stop-time" ${!consent() ? 'disabled' : ''}>Ajouter l’heure</button></div>` : ''}`;
  }

  const gainTitles = {mood: 'Une humeur plus favorable', anxiety: 'Moins d’anxiété dans tes notes', concentration: 'Une concentration en hausse', energy: 'Plus d’énergie dans tes notes', sleep_quality: 'Un sommeil mieux noté', physical_comfort: 'Plus de confort au quotidien', craving: 'Des envies moins fortes'};
  const numberPrecise = value => new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 2}).format(value);

  function gainsView(encouragement, savedFeedback) {
    if (!consent() || !H.ready) return '';
    const gains = encouragement.better.slice(0, 3), hasNotes = encouragement.observationCount > 0 || !!encouragement.cravingTrend;
    const title = gains.length ? 'Les progrès que tu notes' : hasNotes ? 'Tes repères, jour après jour' : 'Ton premier repère commence ici';
    const cards = gains.map(metric => {
      const body = `<span class="hz-win-symbol" aria-hidden="true">${stepCheck}</span><strong>${esc(gainTitles[metric.key])}</strong><span class="hz-win-values"><span>${numberPrecise(metric.before)}</span><span aria-hidden="true">→</span><b>${numberPrecise(metric.after)}<small>/${metric.scale}</small></b></span><small>${metric.beforeCount} notes puis ${metric.afterCount} notes · deux périodes de 7 jours</small><span class="hz-win-action">${metric.key === 'craving' ? 'Retrouver mes repères d’envie' : 'Voir mes observations'} <span aria-hidden="true">↗</span></span>`;
      return metric.key === 'craving' ? `<a class="hz-win" href="#hz-addiction" data-health-gain="craving">${body}</a>` : `<button type="button" class="hz-win" data-health-action="gain" data-metric="${metric.key}" data-health-gain="${metric.key}">${body}</button>`;
    }).join('');
    const difficult = encouragement.worse.length ? `<div class="hz-balance" data-health-difficult><strong>Un point à accompagner</strong><p>Tes notes montrent aussi plus de difficulté pour : ${encouragement.worse.map(metric => esc(metric.label.toLocaleLowerCase('fr-FR'))).join(', ')}. Chercher du soutien fait partie du chemin.</p><button type="button" class="text" data-action="help">Trouver du soutien →</button></div>` : '';
    const empty = !gains.length ? `<div class="hz-wins-empty"><span class="hz-wins-note" aria-hidden="true">${icons.mental}</span><div><strong>${hasNotes ? 'Chaque note t’aide à mieux te connaître.' : 'Un premier ressenti, et ton suivi prend forme.'}</strong><p>${hasNotes ? 'Tu gardes une trace de ce qui se maintient, de ce qui change et de ce dont tu as besoin.' : 'Sommeil, humeur, énergie : note ce que tu ressens. Les prochains points feront apparaître tes changements.'}</p></div><button type="button" class="secondary" data-health-action="checkin">${hasNotes ? 'Faire le point' : 'Noter mon premier ressenti'}</button></div>` : `<div class="hz-win-grid">${cards}</div>`;
    return `<section id="hz-wins" class="hz-wins hz-section ${savedFeedback ? 'hz-note-saved' : ''}" aria-labelledby="hz-wins-title" data-health-supportive-state="${encouragement.supportiveState}"><div class="hz-section-heading"><div><span class="eyebrow">DANS TES PROPRES RESSENTIS</span><h2 id="hz-wins-title">${title}</h2></div><a class="text hz-all-feelings" href="#hz-feelings-title">Tous mes ressentis →</a></div>${savedFeedback ? '<p class="hz-save-feedback">Ton ressenti est enregistré. Tu viens de prendre un moment pour toi.</p>' : ''}<p class="hz-wins-message">${esc(encouragement.message)}</p>${empty}${difficult}${hasNotes ? `<details class="hz-gains-explanation" id="hz-gains-explanation"><summary>Sur quoi reposent ces changements ?</summary><p>Tes moyennes des 7 derniers jours sont comparées aux 7 jours précédents, avec au moins 2 notes dans chaque période. Les jours sans note restent vides. Ces changements décrivent ton ressenti ; ils ne permettent pas d’en déterminer la cause.</p><p>${encouragement.observationCount ? `${encouragement.observationCount} ressentis dans ton historique${encouragement.latestDate ? ` · dernier point le ${dateLabel(encouragement.latestDate)}` : ''}.` : 'Les notes d’envie proviennent de tes anciens bilans personnels.'}</p></details>` : ''}</section>`;
  }

  function addictionView(encouragement) {
    const craving = consent() && H.ready ? encouragement.cravingTrend : null;
    const observed = craving ? `<div class="hz-craving-observed"><span class="eyebrow">DANS TES BILANS D’ENVIE</span><strong>${craving.after === null ? 'Pas de note récente' : `${numberPrecise(craving.after)} / 10 · intensité moyenne récente`}</strong><p>${craving.direction === 'better' ? `Tes envies sont moins fortes dans tes notes : ${numberPrecise(craving.before)} → ${numberPrecise(craving.after)} / 10.` : craving.direction === 'worse' ? `Tes notes montrent des envies plus fortes : ${numberPrecise(craving.before)} → ${numberPrecise(craving.after)} / 10. Appuie-toi sur les outils et le soutien disponibles.` : craving.direction === 'stable' ? 'L’intensité moyenne est stable entre les deux périodes. Tes réponses restent des repères utiles.' : 'La comparaison apparaîtra avec au moins deux notes dans chacune des deux périodes.'}</p><small>${craving.afterCount} notes sur les 7 derniers jours · ${craving.beforeCount} sur les 7 précédents. Une baisse correspond à des envies moins fortes.</small></div>` : '';
    return `<section class="hz-addiction hz-section" id="hz-addiction" aria-labelledby="hz-addiction-title"><div class="hz-addiction-intro"><span class="eyebrow">ENVIES D’ALCOOL & CONFIANCE</span><h2 id="hz-addiction-title">${esc(HEALTH_ADDICTION.title)}</h2><p>${esc(HEALTH_ADDICTION.text)}</p>${refs(HEALTH_ADDICTION.sourceIds)}<div class="row"><button type="button" class="primary" data-action="urge">Traverser une envie</button><button type="button" class="text" data-action="help">Trouver du soutien →</button></div></div><div class="hz-addiction-practice"><span class="hz-practice-label">UN PROCHAIN PAS CONCRET</span><ol>${HEALTH_ADDICTION.steps.map((step, index) => `<li><span aria-hidden="true">${index + 1}</span><div><strong>${esc(step.title)}</strong><p>${esc(step.text)}</p></div></li>`).join('')}</ol><details id="hz-addiction-support"><summary>${esc(HEALTH_ADDICTION.support.title)}</summary><p>${esc(HEALTH_ADDICTION.support.text)}</p>${refs(HEALTH_ADDICTION.support.sourceIds)}<strong>${esc(HEALTH_ADDICTION.setback.title)}</strong><p>${esc(HEALTH_ADDICTION.setback.text)}</p>${refs(HEALTH_ADDICTION.setback.sourceIds)}</details></div>${observed}</section>`;
  }

  function personalDetail(progress, stage) {
    const rows = observations(), last = rows.at(-1);
    if (!progress.active) return 'Tes observations restent conservées, quel que soit ton parcours.';
    if (stage.state === 'future') return 'Tu retrouveras ici tes repères si ton arrêt se poursuit. Tu peux déjà consulter cette étape.';
    if (!last) return 'Ton premier ressenti te servira de point de comparaison. Quelques réponses suffisent.';
    const scores = HEALTH_METRICS.filter(metric => Number.isFinite(last[metric.key])).slice(0, 3).map(metric => `${metric.label.toLocaleLowerCase('fr-FR')} ${last[metric.key]}/5`);
    return `Ton dernier ressenti, le ${dateLabel(last.checkin_date)} : ${scores.join(' · ')}. Tes réponses décrivent ce que tu observes, à la journée.`;
  }

  function stageView(progress) {
    const selected = H.stage === null ? Math.max(0, progress.stageIndex) : Math.min(H.stage, progress.stages.length - 1);
    const stage = progress.stages[selected] || progress.stages[0], next = nextMilestone(progress);
    const stateLabels = {past: 'Repère passé', current: progress.precision === 'minute' ? 'Ton repère actuel' : 'Ton repère actuel · date approximative', future: 'Pour la suite de ton arrêt', information: 'Pour comprendre'};
    const targetLabel = stage.targetAt ? instantLabel(stage.targetAt, progress.timeZone) : stage.targetDate ? dateLabel(stage.targetDate) : '';
    const stateDate = targetLabel ? (stage.state === 'future' ? ' · à partir du ' : ' · depuis le ') + targetLabel : '';
    const nextFinding = next?.mental?.[0];
    const nextPreview = next ? `<div class="hz-next"><div><span class="eyebrow">LE PROCHAIN REPÈRE DE TON ARRÊT</span><h3>${esc(next.label || next.rangeLabel)}${next.targetAt ? ` <small data-health-countdown>${esc(remainingLabel(next))}</small>` : ''}</h3><strong>${esc(nextFinding?.title || next.title)}</strong><p>${esc(nextFinding?.text || next.outlook)}</p>${refs(nextFinding?.sourceIds || next.sourceIds)}</div><button type="button" class="secondary" data-health-action="stage" data-index="${progress.stages.indexOf(next)}">Explorer la suite →</button></div>` : '';
    return `<section class="hz-section hz-milestones" aria-labelledby="hz-timeline-title"><div class="hz-section-heading"><div><span class="eyebrow">CORPS & ESPRIT</span><h2 id="hz-timeline-title">Ce que l’arrêt change, étape par étape</h2></div>${H.stage !== null && progress.stageIndex >= 0 && H.stage !== progress.stageIndex ? '<button type="button" class="secondary" data-health-action="current-stage">Revenir à mon étape</button>' : '<button type="button" class="text" data-health-action="sources">Les sources</button>'}</div><p class="hz-caption">Des bénéfices étudiés, des repères pour ton parcours. Le rythme des changements reste personnel.</p><div class="hz-stages" role="group" aria-label="Choisir une période d’arrêt">${progress.stages.map((item, i) => `<button type="button" class="hz-stage ${i === selected ? 'selected' : ''} ${item.state === 'current' ? 'is-current' : ''}" data-health-action="stage" data-index="${i}" aria-pressed="${i === selected}" ${item.state === 'current' ? 'aria-current="step"' : ''}><span class="hz-stage-dot" aria-hidden="true">${item.state === 'current' ? '●' : i + 1}</span><strong>${esc(item.label || item.rangeLabel)}</strong><small>${item.state === 'current' ? 'Tu es ici' : item.state === 'past' ? 'Parcouru' : item.state === 'future' ? 'À venir' : 'À découvrir'}</small></button>`).join('')}</div><div class="hz-stage-content"><div class="hz-stage-title"><span class="tag">${stateLabels[stage.state]}${esc(stateDate)}</span><h3>${esc(stage.title)}</h3><p class="hz-stage-range">${esc(stage.rangeLabel)}</p></div><div class="hz-evidence-grid">${evidenceCard('mental', stage.mental)}${evidenceCard('physical', stage.physical)}</div><div class="hz-personal-prompt"><div><strong>Et pour toi, qu’est-ce qui change ?</strong><p>${esc(stage.checkInPrompt)}</p><p class="hz-caption">${esc(personalDetail(progress, stage))}</p></div><button type="button" class="secondary" data-health-action="checkin" ${!consent() || !H.ready ? 'disabled' : ''}>Faire le point</button></div><div class="hz-outlook"><span class="eyebrow">${progress.active ? 'POUR LA SUITE' : 'À SAVOIR'}</span><p>${esc(stage.outlook)}</p>${refs(stage.sourceIds)}</div>${nextPreview}</div></section>`;
  }

  function trendCards(rows) {
    return `<div class="hz-metrics">${healthTrends(rows, today()).map(metric => {
      const label = {better: 'Ressenti plus favorable', worse: 'Ressenti moins favorable', stable: 'Ressenti stable', unknown: 'Comparaison à venir'}[metric.direction];
      return `<button type="button" class="hz-metric ${H.metric === metric.key ? 'selected' : ''}" data-health-action="metric" data-metric="${metric.key}" aria-pressed="${H.metric === metric.key}"><span>${esc(metric.label)}</span><strong>${metric.current === null ? '—' : number(metric.current)}<small>/5</small></strong><span class="hz-trend hz-trend-${metric.direction}">${label}${metric.delta !== null ? ` · ${metric.delta > 0 ? '+' : ''}${new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 2}).format(metric.delta)}` : ''}</span><small>${metric.currentCount} observation${metric.currentCount === 1 ? '' : 's'} sur 7 jours</small></button>`;
    }).join('')}</div>`;
  }

  function chart(rows) {
    const metric = HEALTH_METRICS.find(item => item.key === H.metric) || HEALTH_METRICS[0];
    const start = moveDay(today(), 1 - H.window);
    const points = rows.filter(row => row.checkin_date >= start && row.checkin_date <= today() && Number.isFinite(row[metric.key]));
    const width = 640, left = 37, right = 18, top = 22, height = 184;
    const x = date => left + dayDiff(date, start) / (H.window - 1) * (width - left - right);
    const y = value => top + (5 - value) / 4 * height;
    const shortDate = date => new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'short'}).format(new Date(date + 'T12:00:00'));
    return `<div class="hz-chart"><div class="hz-section-heading"><h3 id="hz-chart-heading" tabindex="-1">${esc(metric.label)} · tes observations</h3><div class="hz-range" role="group" aria-label="Période du graphique">${[30, 90, 365].map(days => `<button type="button" data-health-action="window" data-window="${days}" class="${H.window === days ? 'selected' : ''}" aria-pressed="${H.window === days}">${days === 365 ? '12 mois' : days + ' jours'}</button>`).join('')}</div></div><p class="hz-caption">1 : ${esc(metric.low)} · 5 : ${esc(metric.high)}${metric.positive === false ? ' · Une baisse correspond à moins d’anxiété.' : ''}</p>${points.length ? `<svg class="hz-chart-svg" viewBox="0 0 640 248" role="img" aria-labelledby="hz-chart-title hz-chart-description"><title id="hz-chart-title">${esc(metric.label)} déclaré, du ${dateLabel(start)} au ${dateLabel(today())}</title><desc id="hz-chart-description">${points.length} points réels de ressenti sur une échelle de 1 à 5. Aucun point n’est ajouté aux dates non renseignées. Les valeurs sont aussi disponibles dans l’historique.</desc>${[1, 2, 3, 4, 5].map(value => `<line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}" class="hz-grid-line"/><text x="20" y="${y(value) + 4}" text-anchor="middle">${value}</text>`).join('')}${points.map(point => `<circle cx="${x(point.checkin_date).toFixed(2)}" cy="${y(point[metric.key])}" r="5" class="hz-chart-point" tabindex="0" aria-label="${dateLabel(point.checkin_date)} : ${point[metric.key]} sur 5"><title>${dateLabel(point.checkin_date)} : ${point[metric.key]}/5</title></circle>`).join('')}<text x="${left}" y="238">${shortDate(start)}</text><text x="${width - right}" y="238" text-anchor="end">${shortDate(today())}</text></svg>` : `<div class="hz-empty-chart"><span aria-hidden="true">◌</span><p>Aucune observation de ${esc(metric.label.toLocaleLowerCase())} sur cette période.</p><button type="button" class="secondary" data-health-action="checkin">Ajouter mon premier ressenti</button></div>`}<p class="hz-caption">Chaque point vient d’un ressenti saisi. Les dates non renseignées restent vides. Ce questionnaire personnel n’est pas un test médical validé.</p></div>`;
  }

  function history(rows) {
    const all = [...rows].reverse();
    return `<details id="hz-feelings-history" class="hz-history"><summary>Mon historique de ressentis · ${all.length}</summary><p class="hz-caption">Les anciens bilans d’humeur et d’énergie sont conservés. Une reprise ou une correction de date ne les efface pas.</p>${all.slice(0, H.historyLimit).map(row => {
      const saved = H.rows.find(item => item.checkin_date === row.checkin_date);
      return `<article class="hz-history-row"><div><strong>${dateLabel(row.checkin_date)}</strong><p>${HEALTH_METRICS.filter(metric => Number.isFinite(row[metric.key])).map(metric => `${esc(metric.label)} ${row[metric.key]}/5`).join(' · ')}</p>${saved?.note ? `<p class="hz-history-note">${esc(saved.note)}</p>` : ''}${!saved ? '<small>Ancien bilan personnel</small>' : ''}</div><div class="row"><button type="button" class="text" data-health-action="checkin" data-date="${row.checkin_date}">${saved ? 'Modifier' : 'Compléter'}</button>${saved ? `<button type="button" class="text hz-delete" data-health-action="delete" data-id="${esc(saved.id)}">Supprimer</button>` : ''}</div></article>`;
    }).join('')}${all.length > H.historyLimit ? '<button type="button" class="secondary" data-health-action="more-history">Voir plus de ressentis</button>' : ''}</details>`;
  }

  function feelingsView() {
    if (!consent()) return `<section class="card hz-section"><h2>Ton ressenti, sous ton contrôle</h2><p>Active le suivi sensible si tu souhaites retrouver tes repères personnalisés et enregistrer tes observations privées.</p><button type="button" class="primary" data-action="health-consent">Lire et choisir</button><p class="hz-caption">Les informations scientifiques restent consultables sans activer ce suivi.</p></section>`;
    if (!H.ready) return `<section class="card hz-section" role="status"><h2>Tes ressentis ne sont pas encore chargés</h2><p>${esc(H.error || 'Actualise pour retrouver ton suivi privé.')}</p><button type="button" class="secondary" data-health-action="reload">Réessayer</button><p class="hz-caption">Les informations scientifiques restent disponibles.</p></section>`;
    const rows = observations();
    return `<section class="card hz-section" aria-labelledby="hz-feelings-title"><div class="hz-section-heading"><div><span class="eyebrow">CE QUE TU OBSERVES RÉELLEMENT</span><h2 id="hz-feelings-title">Mes ressentis</h2></div><button type="button" class="primary" data-health-action="checkin">Noter mon ressenti</button></div><p>Quelques réponses quand tu le souhaites. Aucun bilan quotidien obligatoire.</p>${trendCards(rows)}<p class="hz-caption">Moyennes des 7 derniers jours, comparées aux 7 précédents lorsqu’il existe au moins 2 observations dans chaque période. Un changement n’indique pas sa cause.</p>${chart(rows)}${history(rows)}</section>`;
  }

  function safetyView(progress) {
    return `<section class="hz-safety hz-section" aria-labelledby="hz-safety-title"><h2 id="hz-safety-title">Te faire accompagner, à tout moment</h2><p>${esc(HEALTH_SAFETY.withdrawal)}</p><details id="hz-safety-details" ${progress.active && progress.days < 7 ? 'open' : ''}><summary>Signes qui nécessitent une aide urgente</summary><p>${esc(HEALTH_SAFETY.urgent)}</p><p>${esc(HEALTH_SAFETY.mental)}</p><div class="row"><a class="secondary hz-call" href="tel:15">15 · Urgences France</a><a class="secondary hz-call" href="tel:3114">3114 · Prévention du suicide France</a></div><p class="hz-caption">Hors de France, utilise le numéro d’urgence et les ressources de ton pays.</p></details>${refs(HEALTH_SAFETY.sourceIds)}</section>`;
  }

  function view() {
    const progress = stageProgress(snapshot(), HEALTH_STAGES, today(), new Date());
    const anchor = `${S.user?.id || ''}|${progress.precision}|${progress.startedAt || progress.startDate || ''}`;
    if (H.anchor !== anchor) { H.stage = null; H.anchor = anchor; }
    H.clockStage = progress.stageIndex; H.clockDay = today(); H.clockPrecision = progress.precision;
    const existing = snapshot();
    const encouragement = encouragementSummary({progress, observations: consent() && H.ready ? observations() : [], legacyChecks: consent() && H.ready ? S.checks : [], today: today()});
    const key = consent() && progress.active && encouragement.milestoneKey ? `${S.user?.id}|${encouragement.milestoneKey}` : null;
    const animate = !!key && !H.celebrated.has(key);
    if (key) H.celebrated.add(key);
    const savedFeedback = H.savedFeedback; H.savedFeedback = false;
    return `<div class="hz-page"><div class="greeting"><span class="eyebrow">SANTÉ & BIENFAITS</span><h1>Corps & esprit</h1><p class="muted">Tes progrès, tes repères, et de bonnes raisons de continuer.</p></div>${journeyHero(progress, encouragement, animate)}<p class="hz-clarity">Ta durée d’arrêt situe ces repères ; elle ne mesure ni ton alcoolémie ni ton état de santé. <a href="#hz-safety-title">Quand demander de l’aide ?</a></p>${progress.active && progress.days < 7 ? `<div class="hz-early-help" role="note"><strong>Un arrêt accompagné si nécessaire.</strong><p>Consommation quotidienne importante ou signes de manque : demande un avis médical. Confusion, convulsions, difficulté à respirer ou à rester éveillé : urgences (15 / 112 en France).</p><a href="#hz-safety-title">Voir les repères de sécurité</a></div>` : ''}${!progress.active && consent() ? `<section class="hz-context"><strong>${existing ? 'Ton suivi reste utile pendant une réduction ou une reprise.' : 'Renseigne ton parcours pour personnaliser les dates.'}</strong><p>${existing ? 'Les repères d’abstinence restent informatifs tant qu’aucun arrêt en cours n’est déclaré. Tes observations et ton historique sont conservés.' : 'Les informations ci-dessous sont générales pour le moment.'}</p><button type="button" class="text" data-page="progress">Ouvrir mon suivi →</button></section>` : ''}${gainsView(encouragement, savedFeedback)}${addictionView(encouragement)}${stageView(progress)}${feelingsView()}${safetyView(progress)}<footer class="hz-evidence-footer"><strong>Des connaissances solides, à portée de main.</strong><p>Des études scientifiques et des organismes de santé pour comprendre les changements observés après l’arrêt. Chaque source précise les personnes étudiées et la portée des résultats. Tes observations personnelles complètent ces repères ; un professionnel évalue ta santé.</p><div class="row"><button type="button" class="text" data-health-action="sources">Consulter les ${HEALTH_SOURCES.length} sources</button><span>Vérification documentaire indiquée dans chaque source</span></div></footer></div>`;
  }

  function openSources(ids) {
    const list = ids?.length ? HEALTH_SOURCES.filter(source => ids.includes(source.id)) : HEALTH_SOURCES;
    api.modal('Sources scientifiques & limites', `<p>Les résultats de groupes de recherche ne prédisent pas ta récupération individuelle. Ces textes ont été synthétisés à partir des sources ci-dessous ; Sobrizen n’a pas fait l’objet d’une validation clinique.</p><div class="hz-sources">${list.map(source => `<article><span class="eyebrow">${esc(source.type)} · ${esc(source.year)}</span><h3>${esc(source.title)}</h3><p>${esc(source.authors)}</p><p><strong>Population ou cadre :</strong> ${esc(source.population)}</p><p><strong>Limites :</strong> ${esc(source.limits)}</p><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">Lire la source originale ↗</a><small class="hz-source-reviewed">Vérifiée le ${dateLabel(source.reviewedOn || HEALTH_REVIEWED_ON)}</small></article>`).join('')}</div><p class="hz-caption">La date de vérification figure sous chaque référence. Les nouvelles publications ne sont pas intégrées automatiquement.</p>`);
  }

  function openCheckin(date = today(), drafts = new Map()) {
    parseDay(date);
    if (date < '1900-01-01' || date > today()) throw Error('Choisis une date passée ou aujourd’hui.');
    api.privateWrite();
    if (!H.ready || H.uid !== S.user?.id) throw Error('Recharge tes ressentis avant de les modifier.');
    const saved = H.rows.find(row => row.checkin_date === date);
    const observed = drafts.get(date) || observations().find(row => row.checkin_date === date) || {};
    const existingLegacy = S.checks.some(row => row.checkin_date === date && (row.mood != null || row.energy != null));
    api.modal(saved ? 'Modifier mon ressenti' : 'Comment te sens-tu ?', `<p>Un point rapide, quand tu en as envie. Renseigne au moins un ressenti ; tu peux laisser les autres vides.</p><form id="healthCheckinForm"><label>Date de mon ressenti<input name="checkin_date" type="date" value="${esc(date)}" min="1900-01-01" max="${today()}" required></label><p class="hz-caption">Changer la date affiche les ressentis de cette journée. Tes réponses en cours restent disponibles tant que ce formulaire est ouvert.</p><div class="hz-rating-grid">${HEALTH_METRICS.map(metric => `<fieldset class="hz-rating"><legend>${esc(metric.label)}</legend><div class="hz-rating-options">${[1, 2, 3, 4, 5].map(value => `<label><input type="radio" name="${metric.key}" value="${value}" ${Number(observed[metric.key]) === value ? 'checked' : ''}><span>${value}</span><span class="sr-only">${value === 1 ? esc(metric.low) : value === 5 ? esc(metric.high) : 'sur 5'}</span></label>`).join('')}</div><div class="hz-rating-ends"><span>1 · ${esc(metric.low)}</span><span>5 · ${esc(metric.high)}</span></div><button type="button" class="text hz-clear" data-health-action="clear-rating" data-metric="${metric.key}">Ne pas renseigner</button></fieldset>`).join('')}</div><details class="hz-note"><summary>Ajouter une note (facultatif)</summary><label>Ce que j’ai remarqué<textarea name="note" maxlength="1000" rows="3" placeholder="Un changement, une difficulté, une question pour mon médecin…">${esc(drafts.has(date) ? observed.note || '' : saved?.note || '')}</textarea></label></details>${existingLegacy ? '<p class="hz-caption">Un ancien bilan existe à cette date : si tu laisses l’humeur ou l’énergie vide, sa valeur reste utilisée.</p>' : ''}<p class="hz-caption">Ressentis privés, associés à ton compte comme tes autres données de suivi. Ils ne modifient pas tes déclarations de consommation et ne sont jamais publiés dans la communauté.</p><p id="healthFormError" class="error-box" role="alert" hidden></p><button type="submit" class="primary full">${S.demo ? 'Voir le résultat dans la démo' : 'Enregistrer mon ressenti'}</button></form>`);
    const form = document.getElementById('healthCheckinForm');
    forms.set(form, {user: S.user, demo: S.demo, generation: H.generation, originalDate: date, expected: saved?.updated_at || null, existingId: saved?.id || null, drafts});
  }

  async function save(form) {
    api.privateWrite();
    const context = forms.get(form);
    if (!context || !contextIsCurrent(context)) throw Error('Ton espace a changé. Rouvre ce formulaire.');
    const data = new FormData(form), record = validateHealthEntry(Object.fromEntries(data), today());
    // Changing the date must never silently overwrite a different observation.
    if (record.checkin_date !== context.originalDate && H.rows.some(row => row.checkin_date === record.checkin_date)) throw Error('Un ressenti existe déjà à cette date. Ouvre-le depuis ton historique pour le modifier.');
    if (context.existingId && record.checkin_date !== context.originalDate) throw Error('Pour une autre date, ajoute un nouveau ressenti.');
    let row;
    if (S.demo) {
      const now = new Date().toISOString();
      row = {...record, id: context.existingId || crypto.randomUUID(), user_id: S.user.id, created_at: now, updated_at: now};
    } else {
      const db = await api.getClient();
      if (!contextIsCurrent(context)) return;
      api.privateWrite();
      const response = api.checkResult(await db.rpc('save_health_checkin', {p_record: record, p_expected_updated_at: context.expected}));
      // PostgREST may represent a composite return as a one-row array.
      row = Array.isArray(response) && response.length === 1 ? response[0] : response;
    }
    if (!contextIsCurrent(context)) return;
    if (!row?.id || row.user_id !== S.user.id || row.checkin_date !== record.checkin_date || !row.updated_at) throw Error('La sauvegarde n’a pas pu être confirmée. Recharge avant de réessayer.');
    H.rows = [...H.rows.filter(item => item.checkin_date !== row.checkin_date), row];
    if (document.contains(form)) api.closeModal();
    H.savedFeedback = true;
    renderKeepingContext();
    api.notify(S.demo ? 'Ressenti fictif mis à jour. Rien n’est sauvegardé.' : 'Ton ressenti est enregistré. Ton historique reste conservé.');
  }

  async function remove(id) {
    api.privateWrite();
    const row = H.rows.find(item => item.id === id);
    if (!row || !H.ready) throw Error('Ce ressenti n’est plus disponible. Recharge ton suivi.');
    if (!confirm(`Supprimer le ressenti du ${dateLabel(row.checkin_date)} ? Tes déclarations de consommation restent conservées.`)) return;
    const context = {user: S.user, demo: S.demo, generation: H.generation};
    if (!S.demo) {
      const db = await api.getClient();
      if (!contextIsCurrent(context)) return;
      api.privateWrite();
      const deleted = api.checkResult(await db.from('health_checkins').delete().eq('user_id', S.user.id).eq('id', row.id).eq('updated_at', row.updated_at).select('id'));
      if (!deleted?.some(item => item.id === row.id)) throw Error('Ce ressenti a changé sur un autre appareil. Recharge avant de le supprimer.');
    }
    if (!contextIsCurrent(context)) return;
    H.rows = H.rows.filter(item => item.id !== id); renderKeepingContext(); api.notify('Ressenti supprimé. Les anciens bilans éventuels restent conservés.');
  }

  // A new day or milestone must not close the user's reading or steal focus.
  function renderKeepingContext() {
    const page = document.querySelector('#content .hz-page');
    const focused = page?.contains(document.activeElement) ? document.activeElement : null;
    const attributes = ['id', 'data-health-action', 'data-index', 'data-metric', 'data-window', 'data-date', 'data-id', 'data-sources', 'data-action', 'href', 'aria-label'];
    const identity = focused ? attributes.filter(name => focused.hasAttribute(name)).map(name => [name, focused.getAttribute(name)]) : [];
    const scopeSelectors = ['.hz-hero', '.hz-wins', '.hz-addiction', '.hz-milestones', '.hz-chart', '.hz-history', '.hz-safety', '.hz-metrics'];
    const scope = focused ? scopeSelectors.find(selector => focused.closest(selector)) : null;
    const disclosures = page ? [...page.querySelectorAll('details[id]')].map(node => [node.id, node.open]) : [];
    api.render();
    for (const [id, open] of disclosures) {
      const node = document.getElementById(id);
      if (node?.tagName === 'DETAILS') node.open = open;
    }
    if (focused) {
      const parent = scope ? document.querySelector(scope) : document.querySelector('#content .hz-page');
      const match = [...(parent?.querySelectorAll(focused.tagName.toLowerCase()) || [])].find(node => identity.length ? identity.every(([name, value]) => node.getAttribute(name) === value) : node.textContent === focused.textContent);
      match?.focus({preventScroll: true});
    }
  }

  function tickClock() {
    if (S.page !== 'health' || document.body.dataset.page !== 'health' || !document.querySelector('#content .hz-page') || !S.user || document.hidden || document.querySelector('dialog[open]')) return;
    const progress = stageProgress(snapshot(), HEALTH_STAGES, today(), new Date());
    if (H.clockStage !== progress.stageIndex || H.clockDay !== today() || H.clockPrecision !== progress.precision) { renderKeepingContext(); return; }
    const face = clockFace(progress);
    for (const [part, value] of Object.entries(face)) {
      const el = document.querySelector(`[data-health-clock-${part}]`);
      if (el && el.textContent !== value) el.textContent = value;
    }
    const countdown = remainingLabel(nextMilestone(progress));
    for (const el of document.querySelectorAll('[data-health-countdown]')) if (el.textContent !== countdown) el.textContent = countdown;
  }
  window.setInterval(tickClock, 15000);
  document.addEventListener('visibilitychange', tickClock);

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-health-action]');
    if (!button || button.disabled) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const action = button.dataset.healthAction;
    try {
      if (action === 'sources') openSources(button.dataset.sources?.split(','));
      else if (action === 'checkin') openCheckin(button.dataset.date || today());
      else if (action === 'stop-time') { if (consent()) progression.openStopTime(); }
      else if (action === 'celebrate') {
        const progress = stageProgress(snapshot(), HEALTH_STAGES, today(), new Date());
        const hero = document.querySelector('#content .hz-hero');
        if (S.page === 'health' && consent() && progress.active && hero) {
          hero.classList.remove('hz-celebrate');
          void hero.offsetWidth;
          hero.classList.add('hz-celebrate');
          api.notify('Ce pas est à toi. Tu avances, un jour après l’autre.');
        }
      } else if (action === 'gain') {
        if (consent() && H.ready && HEALTH_METRICS.some(item => item.key === button.dataset.metric)) {
          H.metric = button.dataset.metric;
          renderKeepingContext();
          const heading = document.getElementById('hz-chart-heading');
          heading?.focus({preventScroll: true});
          heading?.scrollIntoView({block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
        }
      } else if (action === 'current-stage') { H.stage = null; renderKeepingContext(); document.querySelector('.hz-stage.selected')?.focus({preventScroll: true}); }
      else if (action === 'stage') {
        const index = Number(button.dataset.index);
        if (Number.isInteger(index) && HEALTH_STAGES[index]) {H.stage = index; renderKeepingContext(); document.querySelector(`[data-health-action="stage"][data-index="${index}"]`)?.focus({preventScroll: true});}
      } else if (action === 'metric') {
        if (HEALTH_METRICS.some(item => item.key === button.dataset.metric)) {H.metric = button.dataset.metric; renderKeepingContext(); document.querySelector(`[data-health-action="metric"][data-metric="${H.metric}"]`)?.focus({preventScroll: true});}
      } else if (action === 'window') {
        if ([30, 90, 365].includes(Number(button.dataset.window))) {H.window = Number(button.dataset.window); renderKeepingContext(); document.querySelector(`[data-health-action="window"][data-window="${H.window}"]`)?.focus({preventScroll: true});}
      } else if (action === 'clear-rating') {
        if (HEALTH_METRICS.some(item => item.key === button.dataset.metric)) document.querySelectorAll(`#healthCheckinForm input[name="${button.dataset.metric}"]`).forEach(input => {input.checked = false;});
      } else if (action === 'reload') {button.disabled = true; await load(); api.render();}
      else if (action === 'delete') {button.disabled = true; await remove(button.dataset.id);}
      else if (action === 'more-history') {H.historyLimit += 20; renderKeepingContext(); const details = document.querySelector('.hz-history'); if (details) details.open = true;}
    } catch (error) {api.notify(api.message(error));}
    finally {button.disabled = false;}
  }, true);

  document.addEventListener('change', event => {
    if (event.target.name !== 'checkin_date' || event.target.form?.id !== 'healthCheckinForm') return;
    const form = event.target.form, context = forms.get(form);
    if (!context || !contextIsCurrent(context)) return;
    const date = event.target.value;
    try {
      parseDay(date);
      if (date > today() || date < '1900-01-01') throw Error('Choisis une date passée ou aujourd’hui.');
      const draft = Object.fromEntries(new FormData(form));
      draft.checkin_date = context.originalDate;
      context.drafts.set(context.originalDate, draft);
      openCheckin(date, context.drafts);
    } catch (error) {
      const errorBox = form.querySelector('#healthFormError');
      errorBox.textContent = api.message(error); errorBox.hidden = false;
    }
  }, true);

  document.addEventListener('submit', async event => {
    if (event.target.id !== 'healthCheckinForm') return;
    event.preventDefault(); event.stopImmediatePropagation();
    const form = event.target, button = event.submitter || form.querySelector('[type="submit"]');
    if (button?.disabled) return;
    if (button) button.disabled = true;
    const errorBox = form.querySelector('#healthFormError');
    errorBox.hidden = true;
    try {await save(form);} catch (error) {
      const text = error?.code === 'PT409' ? 'Ce ressenti a changé sur un autre appareil. Tes réponses restent ici. Ferme ce formulaire puis recharge tes ressentis pour consulter la version enregistrée.' : api.message(error);
      errorBox.textContent = text; errorBox.hidden = false; errorBox.scrollIntoView({block: 'nearest'});
    } finally {if (button) button.disabled = false;}
  }, true);

  return {view, load, reset, seedDemo, ready: () => H.ready && H.uid === S.user?.id, exportRows: () => H.rows.map(row => ({...row}))};
}
