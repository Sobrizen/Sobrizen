// Each exercise advances on request. Closing it discards the session.
const activities = {
  breath: {
    title: 'Respirer sans forcer',
    steps: [
      ['Trouve un appui confortable', 'Pose les pieds au sol ou appuie ton dos contre le dossier. Laisse ta respiration venir naturellement.'],
      ['Prends quelques respirations', 'Inspire doucement, puis laisse l’air ressortir sans retenir ton souffle. Recommence si c’est confortable.'],
      ['Retrouve ton rythme habituel', 'Relâche les épaules si tu en as envie. Prends un instant pour remarquer comment tu te sens.'],
    ],
    caution: 'Si tu as des vertiges ou que l’exercice te gêne, arrête et reprends ta respiration habituelle.',
    alternative: 'ground',
    invitation: 'Essayer l’ancrage',
  },
  ground: {
    title: 'Revenir au présent',
    steps: [
      ['Repère cinq choses autour de toi', 'Une couleur, une forme, un objet… Tu peux simplement les nommer dans ta tête.'],
      ['Remarque quatre textures', 'Le sol sous tes pieds, un tissu, un accoudoir… Choisis des surfaces à portée de main.'],
      ['Écoute trois sons', 'Prends ton temps. Un seul son suffit aussi.'],
      ['Remarque deux sensations', 'La température de l’air ou le poids de tes vêtements, par exemple.'],
      ['Choisis une chose dont tu as besoin', 'Quelques minutes au calme, un peu d’eau ou la voix de quelqu’un que tu connais.'],
    ],
    caution: 'Adapte les étapes à tes sens. Tu peux passer une étape avec « Continuer ».',
    alternative: 'hands',
    invitation: 'Essayer une pause avec un objet',
  },
  hands: {
    title: 'Occuper mes mains',
    steps: [
      ['Choisis un petit objet familier', 'Un crayon, un morceau de tissu ou une tasse vide conviennent. Tu peux aussi imaginer l’objet.'],
      ['Explore un détail', 'Suis son contour du bout du doigt ou du regard. Choisis trois mots pour décrire sa forme ou sa texture.'],
      ['Prépare ton prochain geste', 'Repose l’objet. Que veux-tu faire juste après cette pause ? Choisis un geste simple à ta portée.'],
    ],
    alternative: 'breath',
    invitation: 'Essayer la respiration douce',
  },
};

const feelings = [
  ['lighter', 'Moins forte'],
  ['same', 'À peu près pareille'],
  ['stronger', 'Plus forte'],
];

function stageContent(activity, index) {
  if (index === activity.steps.length) {
    return `<div class="support-panel">
      <h3 tabindex="-1">Comment est ton envie maintenant ?</h3>
      <p>Ce repère est pour toi. Ta réponse reste dans cet écran.</p>
      <div class="support-feelings">${feelings.map(([key, label]) =>
        `<button type="button" class="secondary" data-action="activity-step" data-feeling="${key}">${label}</button>`).join('')}</div>
    </div><button type="button" class="text" data-action="close">Terminer sans répondre</button>`;
  }
  const [title, description] = activity.steps[index];
  const total = activity.steps.length;
  return `<div class="support-panel">
    <p class="support-position" id="support-position">Étape ${index + 1} sur ${total}</p>
    <progress class="support-progress" value="${index + 1}" max="${total}" aria-labelledby="support-position"></progress>
    <h3 tabindex="-1" aria-describedby="support-position">${title}</h3><p>${description}</p>
    ${activity.caution && index === 0 ? `<p class="small">${activity.caution}</p>` : ''}
    </div><div class="support-controls">
    <button type="button" class="primary" data-action="activity-step" data-direction="next">${index === total - 1 ? 'Terminer l’exercice' : 'Continuer'}</button>
    ${index > 0 ? '<button type="button" class="text" data-action="activity-step" data-direction="back">Étape précédente</button>' : ''}
    </div>`;
}

function resultContent(activity, feeling) {
  const text = {
    lighter: ['Qu’est-ce qui t’a aidé ?', 'Tu peux garder en tête un geste de cette pause pour la prochaine fois.'],
    same: ['De quoi as-tu envie pour la suite ?', 'Tu peux essayer un autre exercice, changer de lieu si c’est possible, ou en parler à quelqu’un.'],
    stronger: ['Tu peux en parler à quelqu’un', 'Choisis une personne de confiance ou appelle Alcool Info Service pour échanger avec un écoutant.'],
  }[feeling];
  return `<div class="support-panel"><h3 tabindex="-1">${text[0]}</h3><p>${text[1]}</p>
    ${feeling === 'stronger' ? '<a class="support-call" href="tel:0980980930">Appeler Alcool Info Service au 0 980 980 930</a>' : ''}
    </div><div class="support-controls">
    <button type="button" class="primary" data-action="${activity.alternative}">${activity.invitation}</button>
    <button type="button" class="secondary" data-action="close">Terminer ma pause</button></div>`;
}

function focusTitle(root) {
  root.querySelector('h3').focus({preventScroll: true});
  root.scrollIntoView?.({block: 'nearest'});
}

export function openExercise(name, modal) {
  const activity = activities[name];
  if (!activity) return;
  modal(activity.title, `<section class="support-exercise" data-exercise="${name}" data-stage="0">
    ${stageContent(activity, 0)}</section>
    <button type="button" class="text support-return" data-action="help">Choisir un autre outil ou retrouver les contacts</button>`);
  focusTitle(document.querySelector('#modal .support-exercise'));
}

export function moveExercise(button) {
  const root = button.closest('[data-exercise]');
  if (!root) return;
  const activity = activities[root.dataset.exercise];
  const index = Number(root.dataset.stage);
  if (!activity || !Number.isInteger(index) || index < 0 || index > activity.steps.length) return;
  if (index === activity.steps.length) {
    const feeling = button.dataset.feeling;
    if (!feelings.some(([key]) => key === feeling)) return;
    root.dataset.stage = 'done';
    root.innerHTML = resultContent(activity, feeling);
  } else {
    const next = button.dataset.direction === 'next' ? index + 1 : index - 1;
    if (next < 0) return;
    root.dataset.stage = String(next);
    root.innerHTML = stageContent(activity, next);
  }
  focusTitle(root);
}
