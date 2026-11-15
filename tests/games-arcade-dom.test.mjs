import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {environment,click,key,$,txt,settle} from './ux-dom-support.mjs';
import {createGameRecords} from '../game-records.mjs';
import {GAME_IDS,FREE_GAMES} from '../game-records-core.mjs';

// Arrange late-level and almost-completed games without changing production exports
// or forcing users/tests to play hundreds of random moves to reach the boundary.
const arcadeURL=new URL('../games-arcade.mjs',import.meta.url).href;
registerHooks({load(url,context,next){const result=next(url,context);if(url!==arcadeURL)return result;return {...result,source:Buffer.from(result.source).toString()+'\nexport const qaArcadeState=()=>active; export const qaRenderSolitaire=solRender;'};}});

test('arcade controls: one scheduler, keyboard play, real records and session isolation',async t=>{
 const env=await environment({online:true});
 let premium=true,revision=1;
 const S={demo:true,user:{id:'demo'}},sessionContext=()=>({revision,demo:S.demo}),sameSession=context=>context?.revision===revision;
 const records=createGameRecords({S,sessionContext,sameSession,getClient:async()=>{throw Error('No real service in demo');}});
 const games=await import('../games.mjs'),arcade=await import('../games-arcade.mjs');
 games.initGames({isPremium:()=>premium,records,sessionContext,sameSession});await records.load();
 const render=()=>{$('#content').innerHTML=games.gamesView({premium});};
 const pile=(zone,i=0)=>$(`.arc-pile[data-zone="${zone}"][data-i="${i}"]`);
 const close=async()=>{if($('#arcadePlay'))await click('#arcadePlay [data-act="close"]');assert.equal(env.rafs.size,0);};
 const launch=async id=>{render();await click('[data-arcade="'+id+'"]');assert.ok($('#arcadePlay'));return arcade.qaArcadeState();};
 const fixture=(a,table,found=Array.from({length:4},()=>[]))=>{a.table=Array.from({length:7},(_,i)=>table[i]||[]);a.found=found;a.stock=[];a.waste=[];a.moves=0;a.recordMoves=0;a.undo=[];a.selected=null;arcade.qaRenderSolitaire(a);};
 try{
  await t.test('catalog and records use the same sixteen games while no arcade style is added before launch',async()=>{render();assert.equal($('#arcadeStyles'),null);assert.equal(document.querySelectorAll('#gameZone .ga-card').length,GAME_IDS.length);assert.equal(document.querySelectorAll('#gameZone [data-game-record]').length,GAME_IDS.length);premium=false;S.demo=false;render();assert.equal(document.querySelectorAll('[data-game-upgrade]').length,GAME_IDS.length-FREE_GAMES.length);premium=true;S.demo=true;});
  await t.test('maze keeps one animation loop through consecutive levels, pauses and restarts',async()=>{
   const a=await launch('maze');assert.equal(env.rafs.size,1);
   const context=$('.arc-maze').getContext('2d'),clear=context.clearRect;let redraws=0;context.clearRect=(...args)=>{redraws++;clear(...args);};
   await env.frames(2,16);assert.equal(redraws,0,'No board redraw is needed between actual game steps');
   for(let level=2;level<=4;level++){a.player={x:1,y:1,d:'right'};a.next='right';a.remaining=1;a.stepTime=1000;a.tiles[1][2]='.';$('.arc-maze').focus();await env.frames(1,32);assert.equal(a.level,level);assert.equal(env.rafs.size,1);assert.equal(document.activeElement,$('.arc-maze'));}
   await click('[data-act="pause"]');assert.equal(env.rafs.size,0);const tick=a.tick;await env.frames(20,1000);assert.equal(a.tick,tick);
   await click('[data-act="resume"]');assert.equal(env.rafs.size,1);await click('[data-act="pause"]');await click('.arc-overlay [data-act="restart"]');assert.equal(a.level,1);assert.equal(env.rafs.size,1);context.clearRect=clear;await close();
  });
  await t.test('maze records the played score on exit, not a fabricated completion',async()=>{const a=await launch('maze');a.score=120;a.level=2;await close();await settle();assert.equal(records.record('maze').best_score>=120,true);assert.match(records.describe('maze'),/niveau .*atteint/);});
  await t.test('solitaire piles and cards are keyboard reachable, selections survive renders and legal moves announce destinations',async()=>{
   const a=await launch('solitaire');assert.equal(document.querySelectorAll('.arc-pile[tabindex="0"]').length,13);
   fixture(a,[[{s:1,r:7,up:true},{s:0,r:6,up:true}],[{s:0,r:8,up:true}]]);
   pile('tableau').focus();await key(pile('tableau'),'ArrowUp');assert.match(document.activeElement.getAttribute('aria-label'),/7 cœur/);
   await key(document.activeElement,'Enter');assert.equal(document.activeElement.getAttribute('aria-pressed'),'true');assert.match(txt('.arc-notice'),/sélectionné/);
   await key(document.activeElement,'ArrowRight');assert.equal(document.activeElement,pile('tableau',1));await key(document.activeElement,'Enter');
   assert.equal(a.table[0].length,0);assert.equal(a.table[1].length,3);assert.equal(document.activeElement,pile('tableau',1));assert.match(txt('.arc-notice'),/déplacé vers colonne 2/);
   await key(document.activeElement,'z');assert.equal(a.recordMoves,1);await key(document.activeElement,'Escape');assert.equal(a.state,'paused');await click('[data-act="resume"]');await click('[data-act="undo"]');assert.equal(a.table[0].length,2);assert.equal(a.recordMoves,2);assert.equal(records.record('solitaire'),null);await close();
  });
  await t.test('keyboard pioche preserves focus; an unfinished close never saves a solitaire victory',async()=>{const a=await launch('solitaire');pile('stock').focus();await key(pile('stock'),' ');assert.equal(a.waste.length,1);assert.equal(document.activeElement,pile('stock'));assert.match(txt('.arc-notice'),/Carte piochée/);await close();assert.equal(records.record('solitaire'),null);});
  await t.test('a complete keyboard victory records performed actions once and cannot be resumed as an unfinished game',async()=>{
   const a=await launch('solitaire'),found=Array.from({length:4},(_,s)=>Array.from({length:s===0?12:13},(_,i)=>({s,r:i+1,up:true})));
   fixture(a,[[{s:0,r:13,up:true}]],found);a.recordMoves=99;pile('tableau').focus();await key(pile('tableau'),'f');await settle();
   assert.equal(a.state,'won');assert.equal(records.record('solitaire').best_score,999900);assert.match(records.describe('solitaire'),/100 actions.*aides autorisées/);assert.equal($('.arc-overlay [data-act="resume"]'),null);assert.ok(document.activeElement.closest('.arc-overlay'));await close();assert.equal(records.record('solitaire').best_score,999900);
  });
  await t.test('revoking access or changing session closes games and forged attributes never unlock them',async()=>{
   await launch('maze');premium=false;document.dispatchEvent(new CustomEvent('sobrizen-access-change'));assert.equal($('#arcadePlay'),null);assert.equal(env.rafs.size,0);
   document.documentElement.dataset.premium='true';const forged=document.createElement('button');forged.dataset.arcade='solitaire';document.body.append(forged);await click(forged);assert.equal($('#arcadePlay'),null);forged.remove();premium=true;
   await launch('solitaire');revision++;records.reset();document.dispatchEvent(new CustomEvent('sobrizen-access-change'));assert.equal($('#arcadePlay'),null);assert.equal(records.record('solitaire'),null);assert.equal(localStorage.length,0);assert.equal(sessionStorage.length,0);
  });
  assert.deepEqual(env.errors,[]);
 }finally{await close();records.destroy();env.close();}
});
