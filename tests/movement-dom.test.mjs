/**
 * Run the real movement and ergonomics event handlers in a DOM:
 * SOBRIZEN_JSDOM_PATH=/path/to/node_modules/jsdom node --test tests/movement-dom.test.mjs
 * jsdom is a development-only dependency; the app itself remains dependency-free.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
let JSDOM,VirtualConsole;
try{({JSDOM,VirtualConsole}=require(process.env.SOBRIZEN_JSDOM_PATH||'jsdom'));}
catch(error){if(process.env.SOBRIZEN_JSDOM_PATH)throw error;}
const options={skip:!JSDOM&&'Provide jsdom through SOBRIZEN_JSDOM_PATH for DOM regressions.'};
const source=await readFile(new URL('../movement.mjs',import.meta.url),'utf8');
const ergonomics=await readFile(new URL('../ergonomics.mjs',import.meta.url),'utf8');
const ergonomicsCore=await readFile(new URL('../ergonomics-core.mjs',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const plainModule=value=>value.replace(/^import .*?;\s*$/gm,'').replace(/^export /gm,'');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

async function app({premium=true,reduced=false}={}){
 const errors=[],navigations=[],virtualConsole=new VirtualConsole();
 virtualConsole.on('jsdomError',error=>{
  if(/navigation|Not implemented: navigation/i.test(error.message))navigations.push(error);
  else errors.push(error);
 });
 const dom=new JSDOM(html,{url:'https://sobrizen.test/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
 const w=dom.window,d=w.document,frames=new Map(),queries=new Map();
 let time=0,frameId=0,hidden=false;
 w.scrollTo=()=>{};w.confirm=()=>true;w.structuredClone=structuredClone;
 w.matchMedia=query=>{if(!queries.has(query))queries.set(query,{matches:query.includes('prefers-reduced-motion')&&reduced,media:query,listeners:new Set(),addEventListener(_type,fn){this.listeners.add(fn);},removeEventListener(_type,fn){this.listeners.delete(fn);}});return queries.get(query);};
 Object.defineProperty(w.performance,'now',{value:()=>time,configurable:true});
 Object.defineProperty(d,'hidden',{get:()=>hidden,configurable:true});
 w.requestAnimationFrame=fn=>{const id=++frameId;frames.set(id,fn);return id;};
 w.cancelAnimationFrame=id=>frames.delete(id);
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
 w.HTMLDialogElement.prototype.close=function(){if(!this.open)return;this.removeAttribute('open');w.queueMicrotask(()=>this.dispatchEvent(new w.Event('close')));};
 d.querySelector('#workspace').hidden=false;d.querySelector('#welcome').hidden=true;
 d.documentElement.dataset.premium=String(premium);d.documentElement.dataset.billingReady='true';
 d.body.dataset.page='home';d.querySelector('#content').innerHTML='<div class="greeting"><h1>Accueil</h1></div>';
 // Navigation performs the same document replacement as the application shell.
 // All movement and ergonomics listeners below are the actual production code.
 d.addEventListener('click',event=>{const b=event.target.closest('button');if(!b||b.disabled)return;if(b.dataset.page){d.body.dataset.page=b.dataset.page;d.querySelector('#content').innerHTML=`<div class="greeting"><h1>${b.dataset.page}</h1></div>`;}if(b.dataset.action==='logout')d.querySelector('#workspace').hidden=true;});
 w.eval(`{${plainModule(source)}\n}\n//# sourceURL=movement.mjs`);
 w.eval(`{${plainModule(ergonomicsCore)}\n${plainModule(ergonomics)}\n}\n//# sourceURL=ergonomics.mjs`);
 await flush();
 const get=selector=>d.querySelector(selector);
 async function click(selector,{child=false}={}){const b=get(selector);assert.ok(b,`Missing ${selector}`);b.focus();if(child&&b.firstElementChild)b.firstElementChild.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));else b.click();await flush();return b;}
 async function key(selector,key){const target=get(selector);target.focus();const event=new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});target.dispatchEvent(event);await flush();return event;}
 async function advance(seconds){time+=seconds*1000;const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(time);await flush();}
 async function visibility(value){hidden=value;d.dispatchEvent(new w.Event('visibilitychange'));await flush();}
 async function access(value){d.documentElement.dataset.premium=String(value);d.dispatchEvent(new w.CustomEvent('sobrizen-access-change',{detail:{premium:value,ready:true}}));await flush();}
 async function cancel(){const dialog=get('#movement-player'),event=new w.Event('cancel',{cancelable:true});dialog.dispatchEvent(event);if(!event.defaultPrevented)dialog.close();await flush();}
 function close(){dom.window.close();assert.deepEqual(errors,[],errors.map(error=>error.stack||error.message).join('\n'));}
 return {w,d,get,click,key,advance,visibility,access,cancel,close,frames,queries,navigations};
}

test('difficulty clicks work with body[data-page] and the actual ergonomics layer',options,async()=>{
 const a=await app();try{
  await a.click('#nav [data-move="open"]');
  for(const [level,first] of [['moyen','Assis-debout sur une chaise'],['intense','Squats sans chaise'],['doux','Marche sur place']]){
   await a.click(`#mv-tab-${level}`,{child:true});
   assert.equal(a.get('#mv-panel').getAttribute('aria-labelledby'),`mv-tab-${level}`);
   assert.equal(a.get('.mv-card h3').textContent,first);
   assert.equal(a.d.querySelectorAll('.mv-card').length,4);
   assert.equal(a.get(`#mv-tab-${level}`).getAttribute('aria-selected'),'true');
   assert.equal(a.d.activeElement.id,`mv-tab-${level}`);
   assert.equal(a.d.body.dataset.page,'movement');
  }
 }finally{a.close();}
});

test('difficulty keyboard navigation keeps one selected tab and supports Home/End',options,async()=>{
 const a=await app();try{
  await a.click('#nav [data-move="open"]');
  for(const [start,key,next] of [['doux','ArrowRight','moyen'],['moyen','ArrowRight','intense'],['intense','ArrowRight','doux'],['doux','End','intense'],['intense','Home','doux'],['doux','ArrowLeft','intense']]){
   assert.equal((await a.key(`#mv-tab-${start}`,key)).defaultPrevented,true);
   assert.equal(a.d.activeElement.id,`mv-tab-${next}`);
   assert.equal(a.d.querySelectorAll('.mv-tabs [aria-selected="true"]').length,1);
   assert.equal(a.get('#mv-panel').getAttribute('aria-labelledby'),`mv-tab-${next}`);
  }
 }finally{a.close();}
});

test('free access stays on Doux, locked difficulties stay locked, and upgrades work',options,async()=>{
 const a=await app({premium:false});try{
  await a.click('#nav [data-move="open"]');
  assert.equal(a.d.querySelectorAll('.mv-card').length,4);
  await a.key('#mv-tab-doux','ArrowRight');
  assert.equal(a.d.activeElement.id,'mv-tab-moyen');
  assert.equal(a.get('#mv-panel').getAttribute('aria-labelledby'),'mv-tab-doux');
  await a.click('#mv-tab-moyen');
  assert.equal(a.get('#mv-panel').getAttribute('aria-labelledby'),'mv-tab-doux');
  assert.equal(a.get('#movement-player[open]'),null);
  assert.equal(a.navigations.length,1,'Locked choice requests the subscription page');
  await a.access(true);await a.click('#mv-tab-moyen');
  assert.equal(a.get('.mv-card h3').textContent,'Assis-debout sur une chaise');
  await a.click('[data-move="session"]');
  assert.equal(a.get('#movement-player').open,true);
  await a.access(false);
  assert.equal(a.get('#movement-player').open,false);
  assert.equal(a.get('#mv-panel').getAttribute('aria-labelledby'),'mv-tab-doux');
  assert.equal(a.frames.size,0);
 }finally{a.close();}
});

test('a timer starts, pauses, resumes, finishes and resets without leaving the movement page',options,async()=>{
 const a=await app({premium:false});try{
  await a.click('#nav [data-move="open"]');await a.click('[data-id="march"]');
  assert.equal(a.get('#mv-clock').textContent,'01:00');
  await a.click('#mv-play');await a.advance(2);
  assert.equal(a.get('#movement-player').open,true);
  assert.equal(a.get('#mv-clock').textContent,'00:58');
  await a.click('#mv-play');await a.advance(5);
  assert.equal(a.get('#mv-clock').textContent,'00:58');
  assert.equal(a.get('#mv-play').textContent,'Reprendre');
  await a.click('#mv-play');await a.advance(58);
  assert.equal(a.get('#mv-clock').textContent,'00:00');
  assert.equal(a.get('#mv-play').disabled,true);
  await a.click('[data-move="reset"]');
  assert.equal(a.get('#mv-clock').textContent,'01:00');
  assert.equal(a.get('#mv-play').disabled,false);
  assert.equal(a.get('#mv-play').textContent,'Démarrer le minuteur');
 }finally{a.close();}
});

test('guided previous/next keep manual starts and restore focus to the session button',options,async()=>{
 const a=await app();try{
  await a.click('#nav [data-move="open"]');const origin=await a.click('[data-move="session"]');
  assert.equal(a.get('[data-move="previous"]').disabled,true);
  await a.click('#mv-play');await a.advance(1);await a.click('[data-move="next"]');
  assert.equal(a.get('#mv-player-title').textContent,'Cercles des épaules');
  assert.equal(a.get('#mv-play').textContent,'Démarrer le minuteur');
  await a.click('[data-move="previous"]');
  assert.equal(a.get('#mv-player-title').textContent,'Marche sur place');
  for(let i=0;i<3;i++)await a.click('[data-move="next"]');
  assert.equal(a.get('[data-move="next"]').textContent,'Terminer la séance');
  await a.click('[data-move="next"]');
  assert.equal(a.get('#movement-player').open,false);
  assert.equal(a.frames.size,0);
  assert.equal(a.d.activeElement,origin);
 }finally{a.close();}
});

test('close, Escape and leaving the page cancel the timer and allow another session',options,async()=>{
 const a=await app();try{
  await a.click('#nav [data-move="open"]');let origin=await a.click('[data-id="march"]');
  await a.click('#mv-play');await a.cancel();
  assert.equal(a.get('#movement-player').open,false);assert.equal(a.frames.size,0);assert.equal(a.d.activeElement,origin);
  await a.click('[data-id="march"]');await a.click('#mv-play');
  await a.click('#movement-player [data-move="close"]');
  assert.equal(a.get('#movement-player').open,false);assert.equal(a.frames.size,0);
  await a.click('[data-move="session"]');await a.click('#mv-play');
  await a.click('#nav [data-page="home"]',{child:true});
  assert.equal(a.get('#movement-player').open,false);assert.equal(a.frames.size,0);
  assert.equal(a.get('#movement-root'),null);assert.equal(a.d.body.dataset.page,'home');
  await a.click('#nav [data-move="open"]');
  assert.ok(a.get('#movement-root'));await a.click('[data-id="march"]');
  assert.equal(a.get('#mv-clock').textContent,'01:00');
 }finally{a.close();}
});

test('a hidden page pauses the timer and reduced motion stays respected',options,async()=>{
 const a=await app({reduced:true});try{
  await a.click('#nav [data-move="open"]');await a.click('[data-id="march"]');
  const pose=a.get('[data-mv-person]').innerHTML;
  assert.equal(a.get('[data-move="motion"]').getAttribute('aria-pressed'),'false');
  await a.advance(1);assert.equal(a.get('[data-mv-person]').innerHTML,pose);
  await a.click('#mv-play');await a.advance(2);await a.visibility(true);await a.advance(60);await a.visibility(false);
  assert.equal(a.get('#mv-clock').textContent,'00:58');assert.equal(a.get('#mv-play').textContent,'Reprendre');
  await a.click('#mv-play');await a.advance(1);assert.equal(a.get('#mv-clock').textContent,'00:57');
  await a.click('[data-move="motion"]');await a.advance(.5);
  assert.notEqual(a.get('[data-mv-person]').innerHTML,pose);
 }finally{a.close();}
});

test('a queued close event cannot clear a newly reopened player',options,async()=>{
 const a=await app();try{
  await a.click('#nav [data-move="open"]');await a.click('[data-id="march"]');
  a.get('#movement-player [data-move="close"]').click();
  const card=a.get('[data-id="shoulders"]');card.focus();card.click();
  await flush();
  assert.equal(a.get('#movement-player').open,true);
  assert.equal(a.get('#mv-player-title').textContent,'Cercles des épaules');
  assert.equal(a.frames.size,1);
  await a.click('#mv-play');await a.advance(2);
  assert.equal(a.get('#mv-clock').textContent,'00:38');
  await a.click('#movement-player [data-move="close"]');
  assert.equal(a.d.activeElement,card);assert.equal(a.frames.size,0);
 }finally{a.close();}
});

test('focus loss pauses, access revocation closes stale Premium controls, and logout cleans up',options,async()=>{
 const a=await app();try{
  await a.click('#nav [data-move="open"]');await a.click('#mv-tab-moyen');await a.click('[data-move="session"]');
  await a.click('[data-move="motion"]');await a.click('[data-move="next"]');
  assert.equal(a.get('[data-move="motion"]').getAttribute('aria-pressed'),'false','A frozen demonstration stays frozen on the next exercise');
  await a.click('#mv-play');await a.advance(2);a.w.dispatchEvent(new a.w.Event('blur'));await a.advance(8);
  assert.equal(a.get('#mv-clock').textContent,'00:43');assert.equal(a.get('#mv-play').textContent,'Reprendre');
  // Cover the gap before the access-change broadcast reaches the UI.
  a.d.documentElement.dataset.premium='false';await a.click('#mv-play');
  assert.equal(a.get('#movement-player').open,false);assert.equal(a.frames.size,0);
  assert.equal(a.get('#mv-panel').getAttribute('aria-labelledby'),'mv-tab-doux');
  await a.click('[data-move="session"]');await a.click('#mv-play');
  await a.click('[data-action="logout"]');
  assert.equal(a.get('#workspace').hidden,true);assert.equal(a.get('#movement-player').open,false);assert.equal(a.frames.size,0);
 }finally{a.close();}
});

test('unchanged access preserves the DOM, details and focus while revocation still closes Premium',options,async()=>{
 const a=await app();try{
  await a.click('#nav [data-move="open"]');await a.click('#mv-tab-moyen');
  const premiumRoot=a.get('#movement-root'),details=a.get('.mv-safety'),summary=details.querySelector('summary');
  details.open=true;summary.focus();await a.access(true);
  assert.equal(a.get('#movement-root'),premiumRoot);assert.equal(details.open,true);assert.equal(a.d.activeElement,summary);
  await a.click('[data-move="session"]');await a.click('#mv-play');await a.advance(2);
  const clock=a.get('#mv-clock');await a.access(true);
  assert.equal(a.get('#movement-root'),premiumRoot);assert.equal(a.get('#mv-clock'),clock);assert.equal(a.get('#movement-player').open,true);
  await a.advance(1);assert.equal(clock.textContent,'00:42');
  await a.access(false);
  assert.equal(a.get('#movement-player').open,false);assert.equal(a.frames.size,0);
  assert.equal(a.get('#mv-panel').getAttribute('aria-labelledby'),'mv-tab-doux');
  const freeRoot=a.get('#movement-root'),freeDetails=a.get('.mv-safety'),freeSummary=freeDetails.querySelector('summary');
  freeDetails.open=true;freeSummary.focus();await a.access(false);
  assert.equal(a.get('#movement-root'),freeRoot);assert.equal(freeDetails.open,true);assert.equal(a.d.activeElement,freeSummary);
 }finally{a.close();}
});
