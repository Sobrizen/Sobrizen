/* Public games entrypoint. Existing six games remain in games-classic.mjs. */
import {gamesView as classicView,initGames as initClassic} from './games-classic.mjs';
import {initTouchControls} from './games-touch.mjs';
import {initBrainGames,brainCards} from './games-brain.mjs';
let installed=false;
function styles(){
  if(document.getElementById('szTouchStyle'))return;
  // classicView/initClassic install the base style before this override.
  const link=document.createElement('link');link.id='szTouchStyle';link.rel='stylesheet';
  link.href=new URL('./games-touch.css',import.meta.url).href;document.head.append(link);
}
export function gamesView(options={}) {
  let html=classicView(options);styles();
  const end='</div><p class="sz-library-note">';
  html=html.replace(end,brainCards(Boolean(options.premium))+end);
  return html;
}
export function initGames(){
  if(installed)return;installed=true;
  initClassic();styles();initTouchControls();initBrainGames();
}
