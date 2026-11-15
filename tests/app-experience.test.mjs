import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createExperience} from '../app-experience.mjs';

function setup(){
 const dom=new JSDOM('<main id="content"></main><div id="modalContent"></div><form id="authForm"></form><form id="note"></form>',{pretendToBeVisual:true});
 const {window:w}=dom,doc=w.document,animations=[],listeners=new Set();
 let hidden=false;
 Object.defineProperty(doc,'hidden',{get:()=>hidden});
 const motion={matches:false,addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn)};
 w.matchMedia=()=>motion;
 w.Element.prototype.animate=function(frames,options){const a={node:this,frames,options,cancelled:false,cancel(){this.cancelled=true;},finished:Promise.resolve()};animations.push(a);return a;};
 const experience=createExperience(w,doc);
 return{doc,experience,animations,motion,listeners,hide(value){hidden=value;doc.dispatchEvent(new w.Event('visibilitychange'));},reduce(value){motion.matches=value;for(const fn of listeners)fn();},close(){experience.destroy();dom.window.close();}};
}

test('route transitions run once per page, cancel their predecessor and never add idle loops',()=>{
 const h=setup();try{
  h.experience.rendered('home');h.experience.rendered('home');
  assert.equal(h.animations.length,1);assert.equal(h.animations[0].options.duration,160);
  assert.equal(h.animations[0].options.fill,undefined);
  h.experience.rendered('journal');assert.equal(h.animations.length,2);assert.equal(h.animations[0].cancelled,true);
  h.experience.reset();assert.equal(h.animations[1].cancelled,true);
  h.experience.rendered('journal');assert.equal(h.animations.length,3);
 }finally{h.close();}
});

test('reduced motion and a hidden tab cancel active feedback and suppress new transitions',()=>{
 const h=setup();try{
  h.experience.rendered('home');h.experience.dialogOpened();
  h.reduce(true);assert.ok(h.animations.every(a=>a.cancelled));
  h.experience.rendered('progress');h.experience.dialogOpened();assert.equal(h.animations.length,2);
  h.reduce(false);h.experience.rendered('journal');h.experience.dialogOpened();assert.equal(h.animations.length,4);
  h.hide(true);assert.ok(h.animations.every(a=>a.cancelled));
  h.experience.rendered('games');h.experience.dialogOpened();assert.equal(h.animations.length,4);
  h.experience.destroy();assert.equal(h.listeners.size,0);
 }finally{h.close();}
});

test('pending feedback is accessible, unique and never claims an unconfirmed save',()=>{
 const h=setup();try{
  const form=h.doc.getElementById('note');
  h.experience.pending(form,true);h.experience.pending(form,true);
  assert.equal(form.getAttribute('aria-busy'),'true');assert.equal(form.querySelectorAll('[role="status"]').length,1);
  assert.equal(form.querySelector('[role="status"]').textContent,'Enregistrement en cours…');
  h.experience.pending(form,false);assert.equal(form.hasAttribute('aria-busy'),false);assert.equal(form.querySelector('[role="status"]').hidden,true);
  const auth=h.doc.getElementById('authForm');h.experience.pending(auth,true);assert.equal(auth.querySelector('[role="status"]').textContent,'Connexion en cours…');
  form.remove();h.experience.pending(form,true);assert.equal(form.hasAttribute('aria-busy'),false);
 }finally{h.close();}
});
