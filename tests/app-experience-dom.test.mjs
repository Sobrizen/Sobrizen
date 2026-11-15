/** Exercise the real routed app, including the community deployment bridge. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {integrateApp} from '../scripts/integrate-community.mjs';
import {environment,boot,$,txt,click,value,submit,settle,setNow,now} from './ux-dom-support.mjs';

const env=await environment(),appURL=new URL('../app.mjs',import.meta.url).href;
const hook=registerHooks({load(url,context,next){const loaded=next(url,context);return url===appURL?{...loaded,source:integrateApp(readFileSync(new URL(url),'utf8'))+'\nexport {S,render,modal,closeModal};\n'}:loaded;}});
let scrolls=0;window.scrollTo=()=>scrolls++;
await boot();const app=await import(appURL);await click('[data-action="demo"]');
const urgeIntervals=()=>[...env.intervals.values()].filter(item=>item.delay===1000);

test('entering the workspace resets scroll and focus once; refresh preserves the current reading position',()=>{
 assert.equal(scrolls,1);assert.equal(document.activeElement.id,'content');
 app.render();assert.equal(scrolls,1);
});

test('pause clock uses wall time, preserves remaining time on pause, and stops when closed or hidden',async()=>{
 await click('header [data-action="help"]');await click('[data-action="urge"]');
 assert.equal(urgeIntervals().length,0);await submit($('#urgeStartForm'));
 assert.equal(txt('#timer'),'10:00');assert.equal(urgeIntervals().length,1);
 setNow(now()+60000);await env.tick();assert.equal(txt('#timer'),'09:00');
 await click('[data-action="urge-toggle"]');assert.equal(urgeIntervals().length,0);
 setNow(now()+120000);await env.tick();assert.equal(txt('#timer'),'09:00');
 await click('[data-action="urge-toggle"]');assert.equal(urgeIntervals().length,1);
 setNow(now()+30000);await env.tick();assert.equal(txt('#timer'),'08:30');
 app.closeModal();assert.equal(urgeIntervals().length,0);
 setNow(now()+30000);await click('header [data-action="help"]');await click('[data-action="urge"]');assert.equal(txt('#timer'),'08:00');
 let hidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
 document.dispatchEvent(new Event('visibilitychange'));assert.equal(urgeIntervals().length,0);
 setNow(now()+30000);hidden=false;document.dispatchEvent(new Event('visibilitychange'));
 assert.equal(txt('#timer'),'07:30');assert.equal(urgeIntervals().length,1);
 document.dispatchEvent(new Event('visibilitychange'));assert.equal(urgeIntervals().length,1);
 setNow(now()+450000);await env.tick();assert.equal(txt('#timer'),'00:00');assert.equal(urgeIntervals().length,0);
 assert.equal($('.exp-urge-track').getAttribute('aria-valuenow'),'600');assert.equal($('[data-action="urge-toggle"]').disabled,true);
 app.closeModal();
});

test('journal close, replacement and route actions protect one draft without duplicate native prompts',async()=>{
 app.S.page='journal';app.render();await settle();await click('[data-action="journal-new"]');
 await value($('#journalForm'),'body','Un brouillon qui doit rester présent.');
 const confirms=env.confirms.length;
 await click('#modal [data-action="close"]');assert.equal($('#modal').open,true);assert.equal($('[data-jn-close-confirm]').hidden,false);
 assert.equal(env.confirms.length,confirms);assert.equal($('#journalForm').elements.body.value,'Un brouillon qui doit rester présent.');
 await click('[data-jn-continue]');assert.equal(document.activeElement.name,'body');
 assert.throws(()=>app.modal('Autre dialogue','Ne doit pas remplacer mes mots.'),/note|brouillon|enregistr/i);
 await click('#nav [data-page="games"]');assert.equal(app.S.page,'journal');assert.ok($('#journalForm'));
 await click('[data-jn-discard]');assert.equal($('#modal').open,false);
 await click('#nav [data-page="games"]');assert.equal(app.S.page,'games');
});

test('session cleanup forcibly clears a private draft and active clock',async()=>{
 app.S.page='journal';app.render();await settle();await click('[data-action="journal-new"]');
 await value($('#journalForm'),'body','Texte privé à effacer au départ du compte.');
 assert.equal(app.closeModal({force:true}),true);assert.equal($('#modal').open,false);
 await click('[data-action="logout"]');assert.equal($('#workspace').hidden,true);assert.doesNotMatch(txt('#modalContent'),/Texte privé à effacer/);
 assert.equal(urgeIntervals().length,0);
 assert.deepEqual(env.errors,[]);
});

test.after(()=>{hook.deregister();env.close();});
