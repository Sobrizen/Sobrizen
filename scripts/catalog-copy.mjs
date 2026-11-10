/** Keep legacy offer copy consistent with the canonical game registry at build time. */
import {GAME_IDS,FREE_GAMES} from '../game-records-core.mjs';
export function catalogCopy(source){
 return source.replaceAll('13 jeux',`${GAME_IDS.length} jeux`).replaceAll('dix jeux supplémentaires',`${GAME_IDS.length-FREE_GAMES.length} jeux supplémentaires`);
}
