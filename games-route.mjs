// Keep game engines and their input handlers off the welcome and daily routes.
let options, games, loading, failed = false;

export function initGames(config) {
  options = config;
}

function loadGames() {
  if (loading) return;
  loading = import('./games.mjs').then(module => {
    module.initGames(options);
    games = module;
  }).catch(() => { failed = true; }).finally(() => {
    loading = null;
    options?.onCatalogReady();
  });
}

export function gamesView(access) {
  if (games) return games.gamesView(access);
  if (!failed) loadGames();
  return '<section class="greeting"><h1>Ma pause ludique</h1>' + (failed
    ? '<p>Les jeux n’ont pas pu se charger.</p><button class="secondary" type="button" data-action="retry-games">Réessayer</button>'
    : '<p role="status">Ouverture des jeux…</p>') + '</section>';
}

export function retryGames() {
  failed = false;
  options?.onCatalogReady();
}
