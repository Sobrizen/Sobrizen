import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {environment,click,$,txt,settle,submit,setNow} from './ux-dom-support.mjs';
import {createGameRecords} from '../game-records.mjs';
import {createLexicon,dailyTarget,parisDay,randomTarget} from '../semantizen-core.mjs';
const manifest=JSON.parse(fs.readFileSync(new URL('../semantizen-vocabulary.json',import.meta.url))),bytes=fs.readFileSync(new URL('../semantizen-vectors.bin',import.meta.url));
const lexicon=createLexicon(manifest,new Int8Array(bytes));
async function waitReady(){for(let i=0;i<40&&$('#smGuessForm')?.hidden;i++)await settle(15);assert.equal($('#smGuessForm')?.hidden,false,txt('#smStatus'));}
test('real semantic controller: loading, guesses, hints, records, isolation and access',async t=>{
 const env=await environment({online:true,mobile:true});globalThis.innerHeight=window.innerHeight;setNow('2026-11-10T12:00:00Z');
 let revision=1,premium=false,fail=true,hold=null;const calls=[],S={demo:true,user:{id:'demo'}};
 const sessionContext=()=>({revision,demo:S.demo}),sameSession=c=>c?.revision===revision;
 const records=createGameRecords({S,sessionContext,sameSession,getClient:async()=>{throw Error('No private data call in demo');}});
 globalThis.fetch=async url=>{const path=new URL(url).pathname;assert.match(path,/semantizen-(vocabulary\.json|vectors\.bin)$/);calls.push(path);if(fail){fail=false;throw Error('Connexion interrompue. Réessaie.');}if(hold){const gate=hold;hold=null;await gate;}return path.endsWith('.json')?new Response(JSON.stringify(manifest)):new Response(bytes);};
 const games=await import('../games.mjs');games.initGames({isPremium:()=>premium,records,sessionContext,sameSession});await records.load();
 const render=()=>document.querySelector('#content').innerHTML=games.gamesView({premium});render();
 const guess=async word=>{$('#smWord').value=word;await submit($('#smGuessForm'));};
 const open=async()=>{await click('[data-semantic-game]');await waitReady();};
 const close=async()=>{await click('[data-sm=close]');assert.equal($('#smPlay'),null);};
 const originalRandom=Math.random;Math.random=()=>0;
 try{
 await t.test('fourteen cards and explicit loading retry',async()=>{assert.equal(document.querySelectorAll('#gameZone [data-game-record]').length,14);await click('[data-semantic-game]');await settle();assert.equal($('[data-sm=retry]').hidden,false);assert.match(txt('#smStatus'),/Connexion/);});
 await t.test('closing during a pending public download cannot reopen a stale dialog',async()=>{let release;hold=new Promise(r=>release=r);await click('[data-sm=retry]');await close();release();await settle(100);assert.equal($('#smPlay'),null);await open();assert.equal($('[data-sm=free]').disabled,true);});
 await t.test('invalid words and duplicates leave attempt count unchanged',async()=>{await guess('<img src=x onerror=alert(1)>');assert.equal(txt('[data-sm-attempts]'),'0');assert.equal($('#smWord').getAttribute('aria-invalid'),'true');await guess('zzzzqvxyz');assert.equal(txt('[data-sm-attempts]'),'0');await guess('maison');await guess('MAISON');assert.equal(txt('[data-sm-attempts]'),'1');assert.match(txt('#smStatus'),/déjà proposé/);assert.equal($('#smPlay img'),null);});
 await t.test('closing and reopening preserves current private round in memory',async()=>{await close();await open();assert.equal(txt('[data-sm-attempts]'),'1');assert.equal(document.querySelectorAll('[data-sm-list] tr').length,1);});
 await t.test('unassisted victory updates personal record, copies no answer, does not count twice',async()=>{const answer=lexicon.words[dailyTarget(lexicon,parisDay())];await guess(answer);assert.match(txt('[data-sm-result]'),/Bien joué/);assert.equal(records.record('semantizen').best_score,999998);let copied='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async v=>{copied=v;}}});await click('[data-sm=share]');assert.doesNotMatch(copied,new RegExp(answer));assert.match(copied,/2 essais/);await close();await open();assert.equal(records.record('semantizen').best_score,999998);});
 await t.test('Premium free play, hints and reveal confirmation never fabricate a record',async()=>{premium=true;await click('[data-sm=daily]');await waitReady();await click('[data-sm=free]');await waitReady();for(let i=0;i<3;i++)await click('[data-sm=hint]');assert.equal($('[data-sm=hint]').disabled,true);await click('[data-sm=reveal]');assert.equal($('[data-sm-confirm]').hidden,false);await click('[data-sm=cancel]');assert.equal($('[data-sm-result]').hidden,true);await click('[data-sm=reveal]');await click('[data-sm=confirm]');assert.match(txt('[data-sm-result]'),/Solution dévoilée/);assert.equal(records.record('semantizen').best_score,999998);});
 await t.test('logout clears private guesses and record; forged attributes cannot bypass real access',async()=>{revision++;S.demo=false;S.user={id:'another'};premium=false;records.reset();document.dispatchEvent(new CustomEvent('sobrizen-access-change'));assert.equal($('#smPlay'),null);render();assert.ok($('[data-game-upgrade=semantizen]'));const b=document.createElement('button');b.dataset.semanticGame='';document.body.append(b);document.documentElement.dataset.premium='true';await click(b);assert.equal($('#smPlay'),null);assert.equal(env.navigations.length,1);b.remove();S.demo=true;revision++;records.reset();render();await open();assert.equal(txt('[data-sm-attempts]'),'0');assert.equal(records.record('semantizen'),null);});
 await t.test('all inference remains local and no browser storage contains guesses',async()=>{assert.equal(calls.length,3);assert.equal(localStorage.length,0);assert.equal(sessionStorage.length,0);assert.deepEqual(env.errors,[]);await close();});
 }finally{records.destroy();Math.random=originalRandom;env.close();}
});
