import test from 'node:test';import assert from 'node:assert/strict';
import {catalogCopy} from '../scripts/catalog-copy.mjs';
import {GAME_IDS,FREE_GAMES} from '../game-records-core.mjs';
test('published offer counts follow the registry without modifying prices or free games',()=>{
 const source='13 jeux avec tes records. dix jeux supplémentaires. Trois jeux gratuits. 2,99 €/mois. 29,99 €/an.';
 assert.equal(catalogCopy(source),`${GAME_IDS.length} jeux avec tes records. ${GAME_IDS.length-FREE_GAMES.length} jeux supplémentaires. Trois jeux gratuits. 2,99 €/mois. 29,99 €/an.`);
});
test('catalog transformation is idempotent and leaves unrelated wording untouched',()=>{assert.equal(catalogCopy(catalogCopy('13 jeux')),catalogCopy('13 jeux'));assert.equal(catalogCopy('Exercice 13, 3 jeux gratuits'), 'Exercice 13, 3 jeux gratuits');});
