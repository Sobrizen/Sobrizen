/* Preserve the established eight games; add five original Premium puzzles. */
import {gamesView as mobileView,initGames as initMobile} from './games-mobile.mjs';
import {puzzleCards,initPuzzleGames} from './games-puzzles.mjs';
import {configureGameRuntime,retryGameRecords} from './games-runtime.mjs';
let recordsListener=false;
export function gamesView(options={}){
  const html=mobileView(options),marker='</div><p class="ga-note">';
  return html.replace(marker,puzzleCards(Boolean(options.premium))+marker);
}
export function initGames(options={}){
  configureGameRuntime(options);initMobile();initPuzzleGames();
  if(!recordsListener){recordsListener=true;document.addEventListener('click',event=>{if(event.target.closest('[data-game-record-retry]'))retryGameRecords();});}
}
