/* Sixteen activities share the same account-scoped records and access runtime. */
import {gamesView as mobileView,initGames as initMobile} from './games-mobile.mjs';
import {puzzleCards,initPuzzleGames} from './games-puzzles.mjs';
import {configureGameRuntime,retryGameRecords} from './games-runtime.mjs';
import {arcadeCards,initArcade} from './games-arcade.mjs';
import {semanticCard,initSemanticGame} from './semantizen.mjs';
const FORMATS={snake:'Réflexes · Pause à tout moment',blocks:'Construction · Pause à tout moment',merge:'Sans chrono · Annulation',sequence:'Mémoire · Touches 1 à 4',memory:'Sans chrono · Quatre niveaux',reaction:'15 essais · Clavier ou tactile',taps:'20 secondes · Clavier ou tactile',ground:'Sans chrono · Étapes libres',mosaic:'Sans chrono · Placement',gems:'Sans chrono · Combinaisons',sort:'Sans chrono · Annulation',bubbles:'Sans chrono · Visée au clavier',links:'Sans chrono · Numéros et couleurs',maze:'Réflexes · Clavier ou tactile',solitaire:'Sans chrono · Indices et annulation',semantizen:'Sans chrono · Mots français'};
function describeCards(html){return html.replace(/<button\b([^>]*class="[^"]*\bga-card\b[^>]*?)>([\s\S]*?)<\/button>/g,(whole,attributes,body)=>{const id=/data-(?:game|brain-game|arcade|game-upgrade)="([^"]+)"/.exec(attributes)?.[1]||(attributes.includes('data-semantic-game')?'semantizen':null);if(!FORMATS[id])return whole;return `<button${attributes} aria-describedby="gameGuide-${id}">${body.replace('<strong>',`<span id="gameGuide-${id}" class="ga-card-format">${FORMATS[id]}</span><strong>`)}</button>`;});}
let recordsListener=false;
export function gamesView(options={}){
  const html=mobileView(options),marker='</div><p class="ga-note">';
  return describeCards(html.replace(marker,puzzleCards(Boolean(options.premium))+arcadeCards(Boolean(options.premium))+semanticCard()+marker)).replace('<div class="ga-catalog sz-library-grid">','<p class="ga-session-tip">Une pause à ton rythme. Les parties se mettent en pause quand tu changes d’onglet ; tu choisis quand reprendre. SémantiZen reste disponible sans chronomètre.</p><div class="ga-catalog sz-library-grid">');
}
export function initGames(options={}){
  configureGameRuntime(options);initMobile();initPuzzleGames();initArcade();initSemanticGame();
  if(!recordsListener){recordsListener=true;document.addEventListener('click',event=>{if(event.target.closest('[data-game-record-retry]'))retryGameRecords();});}
}
