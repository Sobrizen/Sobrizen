import {dayKey, moveDay, dayDiff, parseDay, dateLabel, esc} from './core.mjs';
import {HEALTH_METRICS, validateHealthEntry, mergeHealthObservations, healthTrends, stageProgress} from './health-core.mjs';
import {HEALTH_STAGES, HEALTH_SOURCES, HEALTH_REVIEWED_ON, HEALTH_SAFETY} from './health-evidence.mjs';
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
  const H = {rows: [], ready: false, error: '', uid: null, generation: 0, stage: null, metric: 'mood', window: 30, historyLimit: 10, clockStage: null, clockDay: null, clockPrecision: null};
  const forms = new WeakMap();
  const today = () => progression.today();
  const consent = () => api.healthConsentActive();
  const snapshot = () => consent() ? progression.snapshot() : null;
  const observations = () => consent() ? mergeHealthObservations(H.rows, S.checks, today()) : [];
  const contextIsCurrent = context => context.user === S.user && context.demo === S.demo && context.generation === H.generation && consent();

  function reset() {
    H.generation++;
    Object.assign(H, {rows: [], ready: false, error: '', uid: null, stage: null, metric: 'mood', window: 30, historyLimit: 10});
  }

  async function load() {
    const user = S.user, uid = user?.id, generation = ++H.generation;
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

  function journeyHero(progress) {
    const face = clockFace(progress), next = nextMilestone(progress);
    const origin = !progress.active ? '' : progress.precision === 'minute' ? instantLabel(progress.startedAt, progress.timeZone) : dateLabel(progress.startDate);
    return `<section class="hz-hero hz-hero-clock"><div><span class="hz-kicker">TON ARRÊT, PAS À PAS</span><h2>${progress.active ? 'Mon arrêt, aujourd’hui' : 'Mes repères d’arrêt'}</h2><p>${progress.active ? `Depuis le ${esc(origin)}, selon ce que tu as déclaré.` : 'Indique ton dernier arrêt pour retrouver les repères qui correspondent à ton parcours.'}</p><div class="row"><button class="light" type="button" data-health-action="stop-time" ${!consent() ? 'disabled' : ''}>${progress.precision === 'minute' ? 'Modifier mon arrêt' : progress.active ? 'Préciser mon heure' : 'Renseigner mon arrêt'}</button><button class="hz-hero-link" type="button" data-health-action="checkin" ${!consent() || !H.ready ? 'disabled' : ''}>Noter mon ressenti ＋</button></div></div><div class="hz-counter hz-live-counter ${progress.active ? '' : 'is-idle'}" aria-label="Durée depuis ton dernier verre déclaré"><strong data-health-clock-value>${esc(face.value)}</strong><span data-health-clock-unit>${esc(face.unit)}</span><small data-health-clock-detail>${esc(face.detail)}</small></div><div class="hz-hero-bottom"><span>${next ? `Prochain repère : ${esc(next.label || next.rangeLabel)}${next.targetAt ? ` · <span data-health-countdown>${esc(remainingLabel(next))}</span>` : next.targetDate ? ` · vers le ${dateLabel(next.targetDate)}` : ''}` : progress.active ? 'Continue à observer ce qui change pour toi.' : 'Tu peux aussi consulter toutes les étapes librement.'}</span><span>Ton rythme reste personnel</span></div></section>${progress.active && progress.precision !== 'minute' ? `<div class="hz-time-hint"><span aria-hidden="true">◷</span><p>Tu connais l’heure de ton dernier verre ? Ajoute-la pour un suivi en heures et en minutes. Sinon, garde simplement la date.</p><button class="text" type="button" data-health-action="stop-time" ${!consent() ? 'disabled' : ''}>Ajouter l’heure</button></div>` : ''}`;
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
    const stateLabels = {past: 'Repère passé', current: progress.precision === 'minute' ? 'En ce moment pour toi' : 'Repère approximatif', future: 'Si l’arrêt continue', information: 'Pour comprendre'};
    const targetLabel = stage.targetAt ? instantLabel(stage.targetAt, progress.timeZone) : stage.targetDate ? dateLabel(stage.targetDate) : '';
    const stateDate = targetLabel ? (stage.state === 'future' ? ' · à partir du ' : ' · depuis le ') + targetLabel : '';
    const nextPreview = next ? `<div class="hz-next"><div><span class="eyebrow">LA PROCHAINE ÉTAPE</span><h3>${esc(next.label || next.rangeLabel)}${next.targetAt ? ` <small data-health-countdown>${esc(remainingLabel(next))}</small>` : ''}</h3><p>${esc(next.title)}${next.targetAt ? ` · ${esc(instantLabel(next.targetAt, progress.timeZone))}` : next.targetDate ? ` · vers le ${dateLabel(next.targetDate)}` : ''}</p></div><button type="button" class="secondary" data-health-action="stage" data-index="${progress.stages.indexOf(next)}">Découvrir →</button></div>` : '';
    return `<section class="hz-section hz-milestones" aria-labelledby="hz-timeline-title"><div class="hz-section-heading"><div><span class="eyebrow">CORPS & ESPRIT</span><h2 id="hz-timeline-title">Ton évolution, étape par étape</h2></div>${H.stage !== null && progress.stageIndex >= 0 && H.stage !== progress.stageIndex ? '<button type="button" class="secondary" data-health-action="current-stage">Revenir à mon étape</button>' : '<button type="button" class="text" data-health-action="sources">Les sources</button>'}</div><p class="hz-caption">Le temps situe les repères scientifiques. Les effets varient selon chacun.</p><div class="hz-stages" role="group" aria-label="Choisir une période d’arrêt">${progress.stages.map((item, i) => `<button type="button" class="hz-stage ${i === selected ? 'selected' : ''} ${item.state === 'current' ? 'is-current' : ''}" data-health-action="stage" data-index="${i}" aria-pressed="${i === selected}" ${item.state === 'current' ? 'aria-current="step"' : ''}><span class="hz-stage-dot" aria-hidden="true">${item.state === 'current' ? '●' : i + 1}</span><strong>${esc(item.label || item.rangeLabel)}</strong><small>${item.state === 'current' ? 'Tu es ici' : item.state === 'past' ? 'Parcouru' : item.state === 'future' ? 'À venir' : 'À découvrir'}</small></button>`).join('')}</div><div class="hz-stage-content"><div class="hz-stage-title"><span class="tag">${stateLabels[stage.state]}${esc(stateDate)}</span><h3>${esc(stage.title)}</h3><p class="hz-stage-range">${esc(stage.rangeLabel)}</p></div><div class="hz-evidence-grid">${evidenceCard('physical', stage.physical)}${evidenceCard('mental', stage.mental)}</div><div class="hz-personal-prompt"><div><strong>Et pour toi, qu’est-ce qui change ?</strong><p>${esc(stage.checkInPrompt)}</p><p class="hz-caption">${esc(personalDetail(progress, stage))}</p></div><button type="button" class="secondary" data-health-action="checkin" ${!consent() || !H.ready ? 'disabled' : ''}>Faire le point</button></div><div class="hz-outlook"><span class="eyebrow">${progress.active ? 'POUR LA SUITE' : 'À SAVOIR'}</span><p>${esc(stage.outlook)}</p>${refs(stage.sourceIds)}</div>${nextPreview}</div></section>`;
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
    return `<div class="hz-chart"><div class="hz-section-heading"><h3>${esc(metric.label)} · tes observations</h3><div class="hz-range" role="group" aria-label="Période du graphique">${[30, 90, 365].map(days => `<button type="button" data-health-action="window" data-window="${days}" class="${H.window === days ? 'selected' : ''}" aria-pressed="${H.window === days}">${days === 365 ? '12 mois' : days + ' jours'}</button>`).join('')}</div></div><p class="hz-caption">1 : ${esc(metric.low)} · 5 : ${esc(metric.high)}${metric.positive === false ? ' · Une baisse correspond à moins d’anxiété.' : ''}</p>${points.length ? `<svg class="hz-chart-svg" viewBox="0 0 640 248" role="img" aria-labelledby="hz-chart-title hz-chart-description"><title id="hz-chart-title">${esc(metric.label)} déclaré, du ${dateLabel(start)} au ${dateLabel(today())}</title><desc id="hz-chart-description">${points.length} points réels de ressenti sur une échelle de 1 à 5. Aucun point n’est ajouté aux dates non renseignées. Les valeurs sont aussi disponibles dans l’historique.</desc>${[1, 2, 3, 4, 5].map(value => `<line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}" class="hz-grid-line"/><text x="20" y="${y(value) + 4}" text-anchor="middle">${value}</text>`).join('')}${points.map(point => `<circle cx="${x(point.checkin_date).toFixed(2)}" cy="${y(point[metric.key])}" r="5" class="hz-chart-point" tabindex="0" aria-label="${dateLabel(point.checkin_date)} : ${point[metric.key]} sur 5"><title>${dateLabel(point.checkin_date)} : ${point[metric.key]}/5</title></circle>`).join('')}<text x="${left}" y="238">${shortDate(start)}</text><text x="${width - right}" y="238" text-anchor="end">${shortDate(today())}</text></svg>` : `<div class="hz-empty-chart"><span aria-hidden="true">◌</span><p>Aucune observation de ${esc(metric.label.toLocaleLowerCase())} sur cette période.</p><button type="button" class="secondary" data-health-action="checkin">Ajouter mon premier ressenti</button></div>`}<p class="hz-caption">Chaque point vient d’un ressenti saisi. Les dates non renseignées restent vides. Ce questionnaire personnel n’est pas un test médical validé.</p></div>`;
  }

  function history(rows) {
    const all = [...rows].reverse();
    return `<details class="hz-history"><summary>Mon historique de ressentis · ${all.length}</summary><p class="hz-caption">Les anciens bilans d’humeur et d’énergie sont conservés. Une reprise ou une correction de date ne les efface pas.</p>${all.slice(0, H.historyLimit).map(row => {
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
    return `<section class="hz-safety hz-section" aria-labelledby="hz-safety-title"><h2 id="hz-safety-title">Te faire accompagner, à tout moment</h2><p>${esc(HEALTH_SAFETY.withdrawal)}</p><details ${progress.active && progress.days < 7 ? 'open' : ''}><summary>Signes qui nécessitent une aide urgente</summary><p>${esc(HEALTH_SAFETY.urgent)}</p><p>${esc(HEALTH_SAFETY.mental)}</p><div class="row"><a class="secondary hz-call" href="tel:15">15 · Urgences France</a><a class="secondary hz-call" href="tel:3114">3114 · Prévention du suicide France</a></div><p class="hz-caption">Hors de France, utilise le numéro d’urgence et les ressources de ton pays.</p></details>${refs(HEALTH_SAFETY.sourceIds)}</section>`;
  }

  function view() {
    const progress = stageProgress(snapshot(), HEALTH_STAGES, today(), new Date());
    const anchor = `${S.user?.id || ''}|${progress.precision}|${progress.startedAt || progress.startDate || ''}`;
    if (H.anchor !== anchor) { H.stage = null; H.anchor = anchor; }
    H.clockStage = progress.stageIndex; H.clockDay = today(); H.clockPrecision = progress.precision;
    const existing = snapshot();
    return `<div class="hz-page"><div class="greeting"><span class="eyebrow">SANTÉ & BIENFAITS</span><h1>Corps & esprit</h1><p class="muted">Les repères scientifiques et tes ressentis, au même endroit.</p></div>${journeyHero(progress)}<p class="hz-clarity">Ta durée d’arrêt situe ces repères ; elle ne mesure ni ton alcoolémie ni ton état de santé. <a href="#hz-safety-title">Quand demander de l’aide ?</a></p>${progress.active && progress.days < 7 ? `<div class="hz-early-help" role="note"><strong>Un arrêt accompagné si nécessaire.</strong><p>Consommation quotidienne importante ou signes de manque : demande un avis médical. Confusion, convulsions, difficulté à respirer ou à rester éveillé : urgences (15 / 112 en France).</p><a href="#hz-safety-title">Voir les repères de sécurité</a></div>` : ''}${!progress.active && consent() ? `<section class="hz-context"><strong>${existing ? 'Ton suivi reste utile pendant une réduction ou une reprise.' : 'Renseigne ton parcours pour personnaliser les dates.'}</strong><p>${existing ? 'Les repères d’abstinence restent informatifs tant qu’aucun arrêt en cours n’est déclaré. Tes observations et ton historique sont conservés.' : 'Les informations ci-dessous sont générales pour le moment.'}</p><button type="button" class="text" data-page="progress">Ouvrir mon suivi →</button></section>` : ''}${stageView(progress)}${feelingsView()}${safetyView(progress)}<footer class="hz-evidence-footer"><strong>Des sources accessibles, des limites explicites.</strong><p>Études scientifiques, médecins et organismes de santé. Les repères ne constituent ni un diagnostic, ni une promesse de résultat. L’état du foie, la tension ou la santé mentale ne se calculent pas à partir du nombre de jours.</p><div class="row"><button type="button" class="text" data-health-action="sources">Consulter les ${HEALTH_SOURCES.length} sources</button><span>Sources vérifiées le ${dateLabel(HEALTH_REVIEWED_ON)}</span></div></footer></div>`;
  }

  function openSources(ids) {
    const list = ids?.length ? HEALTH_SOURCES.filter(source => ids.includes(source.id)) : HEALTH_SOURCES;
    api.modal('Sources scientifiques & limites', `<p>Les résultats de groupes de recherche ne prédisent pas ta récupération individuelle. Ces textes ont été synthétisés à partir des sources ci-dessous ; Sobrizen n’a pas fait l’objet d’une validation clinique.</p><div class="hz-sources">${list.map(source => `<article><span class="eyebrow">${esc(source.type)} · ${esc(source.year)}</span><h3>${esc(source.title)}</h3><p>${esc(source.authors)}</p><p><strong>Population ou cadre :</strong> ${esc(source.population)}</p><p><strong>Limites :</strong> ${esc(source.limits)}</p><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">Lire la source originale ↗</a></article>`).join('')}</div><p class="hz-caption">Dernière vérification documentaire : ${dateLabel(HEALTH_REVIEWED_ON)}. Les nouvelles publications ne sont pas intégrées automatiquement.</p>`);
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
    api.render();
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
    H.rows = H.rows.filter(item => item.id !== id); api.render(); api.notify('Ressenti supprimé. Les anciens bilans éventuels restent conservés.');
  }

  function tickClock() {
    if (S.page !== 'health' || document.body.dataset.page !== 'health' || !document.querySelector('#content .hz-page') || !S.user || document.hidden || document.querySelector('dialog[open]')) return;
    const progress = stageProgress(snapshot(), HEALTH_STAGES, today(), new Date());
    if (H.clockStage !== progress.stageIndex || H.clockDay !== today() || H.clockPrecision !== progress.precision) { api.render(); return; }
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
      else if (action === 'current-stage') { H.stage = null; api.render(); document.querySelector('.hz-stage.selected')?.focus({preventScroll: true}); }
      else if (action === 'stage') {
        const index = Number(button.dataset.index);
        if (Number.isInteger(index) && HEALTH_STAGES[index]) {H.stage = index; api.render(); document.querySelector(`[data-health-action="stage"][data-index="${index}"]`)?.focus({preventScroll: true});}
      } else if (action === 'metric') {
        if (HEALTH_METRICS.some(item => item.key === button.dataset.metric)) {H.metric = button.dataset.metric; api.render(); document.querySelector(`[data-health-action="metric"][data-metric="${H.metric}"]`)?.focus({preventScroll: true});}
      } else if (action === 'window') {
        if ([30, 90, 365].includes(Number(button.dataset.window))) {H.window = Number(button.dataset.window); api.render(); document.querySelector(`[data-health-action="window"][data-window="${H.window}"]`)?.focus({preventScroll: true});}
      } else if (action === 'clear-rating') {
        if (HEALTH_METRICS.some(item => item.key === button.dataset.metric)) document.querySelectorAll(`#healthCheckinForm input[name="${button.dataset.metric}"]`).forEach(input => {input.checked = false;});
      } else if (action === 'reload') {button.disabled = true; await load(); api.render();}
      else if (action === 'delete') {button.disabled = true; await remove(button.dataset.id);}
      else if (action === 'more-history') {H.historyLimit += 20; api.render(); const details = document.querySelector('.hz-history'); if (details) details.open = true;}
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

  return {view, load, reset, seedDemo, exportRows: () => H.rows.map(row => ({...row}))};
}
