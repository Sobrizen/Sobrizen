/** Real controllers with a local DOM, public dictionary fixture and no real network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {environment,click,key,$,txt,settle} from './ux-dom-support.mjs';
import {GAME_IDS} from '../game-records-core.mjs';
const inspect=new Map(['games-mobile.mjs','games-puzzles.mjs','games-arcade.mjs'].map(name=>[new URL('../'+name,import.meta.url).href,name]));
registerHooks({load(url,context,next){const result=next(url,context);if(!inspect.has(url))return result;return {...result,source:Buffer.from(result.source).toString()+'\nexport const qaGameState=()=>active;'};}});

test('all sixteen games: pause, focus, input, motion preferences and session cleanup',async t=>{
 const env=await environment({online:true});globalThis.devicePixelRatio=1;globalThis.innerHeight=window.innerHeight;
 let hidden=false,revision=1;Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
 const queries=new Map();globalThis.matchMedia=env.w.matchMedia=query=>{if(!queries.has(query)){const target=new env.w.EventTarget();target.matches=false;target.media=query;queries.set(query,target);}return queries.get(query);};
 const resize=[];globalThis.ResizeObserver=env.w.ResizeObserver=class{constructor(fn){this.fn=fn;this.disconnected=false;resize.push(this);}observe(){}disconnect(){this.disconnected=true;}};
 const recordedListeners=[],add=env.w.EventTarget.prototype.addEventListener;
 env.w.EventTarget.prototype.addEventListener=function(type,callback,options){if(options?.signal&&(this===window||this===document))recordedListeners.push({type,signal:options.signal});return add.call(this,type,callback,options);};
 const animations=[];env.w.Element.prototype.animate=function(){const animation={cancelled:false,cancel(){this.cancelled=true;}};animations.push(animation);return animation;};
 const manifest=await readFile(new URL('../semantizen-vocabulary.json',import.meta.url)),vectors=await readFile(new URL('../semantizen-vectors.bin',import.meta.url));
 globalThis.fetch=async url=>{const path=new URL(url).pathname;assert.match(path,/semantizen-(vocabulary\.json|vectors\.bin)$/);return new Response(path.endsWith('.json')?manifest:vectors);};
 const games=await import('../games.mjs'),mobile=await import('../games-mobile.mjs'),puzzles=await import('../games-puzzles.mjs'),arcade=await import('../games-arcade.mjs');
 games.initGames({isPremium:()=>true,sessionContext:()=>({revision,demo:true}),sameSession:c=>c?.revision===revision});
 $('#content').innerHTML=games.gamesView({premium:true});
 const config=id=>['mosaic','gems','sort','bubbles','links'].includes(id)?{card:`[data-brain-game="${id}"]`,root:'#pzPlay',cover:'.pz-cover',resume:'[data-pz=resume]',close:'[data-pz=close]',inert:'.pz-stage',state:()=>puzzles.qaGameState()}:['maze','solitaire'].includes(id)?{card:`[data-arcade="${id}"]`,root:'#arcadePlay',cover:'.arc-overlay',resume:'[data-act=resume]',close:'[data-act=close]',inert:id==='maze'?'.arc-maze-zone':'.arc-sol',state:()=>arcade.qaGameState()}:{card:`[data-game="${id}"]`,root:'#gaPlay',cover:'.ga-cover',resume:'[data-ga=resume]',close:'[data-ga=close]',inert:'.ga-main',state:()=>mobile.qaGameState()};
 const visibility=value=>{hidden=value;document.dispatchEvent(new Event('visibilitychange'));};
 async function open(id){const c=config(id);await click(c.card);assert.ok($(c.root),id);return c;}
 async function close(c){await click(c.close);assert.equal($(c.root),null);assert.equal(env.rafs.size,0);}
 const motion=value=>{const q=queries.get('(prefers-reduced-motion:reduce)'),event=new Event('change');q.matches=value;Object.defineProperty(event,'matches',{value});q.dispatchEvent(event);};
 try{
  await t.test('every catalog card describes its pace and controls without replacing records',()=>{
   assert.equal(document.querySelectorAll('.ga-card-format').length,GAME_IDS.length);
   assert.equal(document.querySelectorAll('[data-game-record]').length,GAME_IDS.length);
   for(const card of document.querySelectorAll('.ga-card'))assert.ok(document.getElementById(card.getAttribute('aria-describedby'))?.textContent);
   assert.match(txt('.ga-session-tip'),/pause.*onglet/);
  });
  for(const id of GAME_IDS.filter(id=>id!=='semantizen'))await t.test(id+': backgrounding pauses once, never resumes itself and releases resources',async()=>{
   const beforeResize=resize.length,beforeListeners=recordedListeners.length,c=await open(id),a=c.state();
   await env.frames(2,16);visibility(true);assert.equal(a.state,'paused');assert.equal($(c.cover).hidden,false);assert.equal($(c.inert).inert,true);assert.equal(env.rafs.size,0);assert.ok(document.activeElement.closest(c.cover));
   const time=a.time??a.clock??a.tick;await env.frames(4,5000);assert.equal(a.time??a.clock??a.tick,time);
   await click(c.resume);assert.equal(a.state,'paused','Hidden tabs cannot restart a game');assert.equal(env.rafs.size,0);
   visibility(false);assert.equal(a.state,'paused');await click(c.resume);assert.notEqual(a.state,'paused');assert.equal($(c.inert).inert,false);
   await close(c);assert.ok(resize.slice(beforeResize).every(observer=>observer.disconnected));assert.ok(recordedListeners.slice(beforeListeners).every(listener=>listener.signal.aborted));
  });
  await t.test('paused 5 things and 2048 remain idle and restore the keyboard target',async()=>{
   for(const id of ['ground','merge']){const c=await open(id);await env.frames(3,16);assert.equal(env.rafs.size,0);await key($('.ga-stage'),'p');assert.equal($('.ga-main').inert,true);await key(document.activeElement,'p');assert.equal($('.ga-main').inert,false);assert.equal(document.activeElement,$('.ga-stage'));await env.frames(3,16);assert.equal(env.rafs.size,0);await close(c);}
  });
  await t.test('sequence announces which pad to reproduce, not only an ordinal',async()=>{const c=await open('sequence');await env.frames(35,16);assert.match(txt('.ga-status'),/^Touche [1-4] · étape 1 sur 1\./);await close(c);});
  await t.test('2048 cancels visual animations on pause, reduced motion and close',async()=>{
   const c=await open('merge'),a=mobile.qaGameState();
   async function move(){a.board=[2,2,...Array(14).fill(0)];a.mergeUntil=0;await click('[data-ga=left]');await env.frames(2,16);assert.ok(document.querySelectorAll('.ga-moving-tile').length);}
   await move();await click('[data-ga=pause]');assert.ok(animations.length);assert.ok(animations.every(animation=>animation.cancelled));assert.equal(document.querySelectorAll('.ga-moving-tile').length,0);
   await click('[data-ga=resume]');await move();motion(true);assert.equal(a.reduced,true);assert.ok(animations.every(animation=>animation.cancelled));assert.equal(document.querySelectorAll('.ga-moving-tile').length,0);
   motion(false);await move();await click('[data-ga=pause]');await click('[data-ga=resume]');await move();await close(c);assert.ok(animations.every(animation=>animation.cancelled));
  });
  await t.test('sort keyboard follows its actual three-column layout and puzzles respect motion changes',async()=>{const c=await open('sort'),a=puzzles.qaGameState();assert.ok(a.game.tubes.length<=6);await key($('canvas',$('#pzPlay')),'ArrowDown');assert.equal(a.cursor,3);assert.match(txt('.pz-message'),/Tube 4/);motion(true);assert.equal(a.reduced,true);motion(false);await close(c);});
  await t.test('mosaic keyboard selection reaches the board and rotating preserves command focus',async()=>{const c=await open('mosaic');await click('[data-piece="0"]');assert.equal(document.activeElement,$('#pzPlay canvas'));$('[data-pz=rotate]').focus();await click('[data-pz=rotate]');assert.equal(document.activeElement,$('[data-pz=rotate]'));await close(c);});
  await t.test('maze releases each replaced level and rejects a stale swipe after pause',async()=>{
   const c=await open('maze'),a=arcade.qaGameState(),old=a.levelController;
   const pointer=(type,x,y,id=1)=>{const event=new env.w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperty(event,'pointerId',{value:id});$('.arc-maze').dispatchEvent(event);};
   pointer('pointerdown',10,10);assert.ok(a.swipe);await key($('.arc-maze'),'p');assert.equal(a.state,'paused');assert.equal(a.swipe,null);await key(document.activeElement,'p');assert.equal(a.state,'playing');const direction=a.next;pointer('pointerup',100,10);assert.equal(a.next,direction,'Old finger movement cannot become a turn after resuming');
   pointer('pointerdown',10,10);pointer('pointercancel',100,10);assert.equal(a.swipe,null);pointer('pointerup',100,10);assert.equal(a.next,direction);
   a.player={x:1,y:1,d:'right'};a.next='right';a.remaining=1;a.stepTime=1000;a.tiles[1][2]='.';await env.frames(1,32);assert.equal(a.level,2);assert.equal(old.signal.aborted,true);const current=a.levelController;await close(c);assert.equal(current.signal.aborted,true);
  });
  await t.test('controllers cannot stack game dialogs even from queued synthetic clicks',async()=>{const c=await open('ground');await click('[data-brain-game=gems]');await click('[data-arcade=maze]');await click('[data-semantic-game]');assert.equal(document.querySelectorAll('#gaPlay,#pzPlay,#arcadePlay,#smPlay').length,1);await close(c);});
  await t.test('untimed semantic game adds no RAF loop, preserves guesses in a background tab and closes on pagehide',async()=>{
   await click('[data-semantic-game]');for(let i=0;i<40&&$('#smGuessForm')?.hidden;i++)await settle(15);assert.equal($('#smGuessForm').hidden,false);$('#smWord').value='maison';$('#smGuessForm').requestSubmit();await settle();assert.equal(txt('[data-sm-attempts]'),'1');visibility(true);await env.frames(10,1000);visibility(false);assert.equal(txt('[data-sm-attempts]'),'1');assert.equal(env.rafs.size,0);window.dispatchEvent(new Event('pagehide'));assert.equal($('#smPlay'),null);
  });
  await t.test('session changes cancel an active scheduler and restore document scrolling',async()=>{const previous=document.body.style.overflow;await open('maze');revision++;document.dispatchEvent(new CustomEvent('sobrizen-access-change'));assert.equal($('#arcadePlay'),null);assert.equal(env.rafs.size,0);assert.equal(document.body.style.overflow,previous);});
  assert.deepEqual(env.errors,[]);
 }finally{visibility(false);for(const selector of ['[data-ga=close]','[data-pz=close]','[data-act=close]','[data-sm=close]'])$(selector)?.click();env.w.EventTarget.prototype.addEventListener=add;env.close();}
});
