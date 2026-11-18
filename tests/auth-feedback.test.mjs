import test from 'node:test';
import assert from 'node:assert/strict';
import {emailFeedback,authErrorMessage,authLinkState,cleanAuthErrorURL,createAuthFeedback} from '../auth-feedback.mjs';
import {environment,$,txt,click,settle,UID,UID2} from './ux-dom-support.mjs';

test('every requested email explains inbox, spam and next steps without promising delivery or revealing account existence',()=>{
 for(const kind of ['signup','confirmation','recovery','email-change','security-code']){
  const copy=emailFeedback(kind,' personne@example.test ');assert.equal(copy.address,'personne@example.test');assert.match(copy.steps.join(' '),/spams/);assert.ok(copy.title&&copy.message);
 }
 assert.match(emailFeedback('recovery').message,/Si un compte correspond/);
 assert.match(emailFeedback('signup').message,/Si cette adresse peut être utilisée/);
 assert.match(emailFeedback('email-change').steps.join(' '),/ancienne|deux/);
 assert.equal(emailFeedback('email-change').resend,false);
 for(const code of ['email_not_confirmed','otp_expired','reauthentication_needed','over_email_send_rate_limit','email_send_failed'])assert.ok(authErrorMessage({code}));
 assert.equal(authErrorMessage({code:'unrelated_database_error'}),null);
});
test('auth-link parsing handles query and fragment errors and never carries a token into a cleaned URL',()=>{
 assert.deepEqual(authLinkState('https://www.sobrizen.com/?type=signup#error=access_denied&error_code=otp_expired'),{type:'signup',error:'otp_expired',failed:true});
 assert.deepEqual(authLinkState('https://www.sobrizen.com/#type=email_change&access_token=not-a-real-token'),{type:'email_change',error:'',failed:false});
 assert.equal(cleanAuthErrorURL('https://www.sobrizen.com/?subscribe=annual&error=bad&error_description=untrusted#access_token=fiction'),'/?subscribe=annual');
});
test('persistent notices preserve frozen addresses, enforce resend delay, explain failures and clear on account changes',async t=>{
 const env=await environment({online:true});let clock=1000,revision=0,user={id:UID},fail=false,gate=null;
 const calls=[],notices=[],edited=[],signins=[];
 const context=()=>({user,revision}),same=c=>c.user===user&&c.revision===revision;
 let feedback;
 feedback=createAuthFeedback({modal:(title,body)=>{$('#modalContent').innerHTML='<div class="modal-top"><h2>'+title+'</h2><button type="button" data-action="close">Fermer</button></div>'+body;$('#modal').showModal();},closeModal:()=>$('#modal').close(),notify:text=>notices.push(text),context,isCurrent:same,now:()=>clock,onEdit:(...args)=>edited.push(args),onSignin:email=>signins.push(email),onRequest:async(kind,email,c)=>{calls.push({kind,email});if(gate)await gate;if(fail)throw {code:'over_email_send_rate_limit'};if(same(c))feedback.show(kind,{email});}});
 try{
  await t.test('signup confirmation stays open, escapes the address and does not resend before the delay',async()=>{
   feedback.show('signup',{email:'<img src=x onerror=alert(1)>@example.test'});
   assert.equal($('#modal').open,true);assert.equal($('#modalContent img'),null);assert.match(txt('#modalContent'),/courriers indésirables/);
   assert.equal($('[data-auth-feedback="resend"]').disabled,true);assert.equal(feedback.canRequest('confirmation','<img src=x onerror=alert(1)>@example.test'),false);
   clock+=60001;await env.tick();await click('[data-auth-feedback="resend"]');assert.deepEqual(calls.at(-1),{kind:'confirmation',email:'<img src=x onerror=alert(1)>@example.test'});
   assert.equal($('[data-auth-feedback="resend"]').disabled,true);
  });
  await t.test('resend errors remain visible, preserve the address and apply a new delay',async()=>{
   fail=true;clock+=60001;await env.tick();await click('[data-auth-feedback="resend"]');assert.match(txt('[data-auth-feedback-status]'),/Attends|minute/);assert.match(txt('#modalContent'),/example.test/);assert.equal($('[data-auth-feedback="resend"]').disabled,true);fail=false;
  });
  await t.test('correct-address and sign-in controls return the exact requested email',async()=>{
   feedback.show('recovery',{email:'saved@example.test'});await click('[data-auth-feedback="edit"]');assert.deepEqual(edited.at(-1),['recovery','saved@example.test']);assert.equal($('#modal').open,false);
   feedback.show('signup',{email:'saved@example.test'});await click('[data-auth-feedback="signin"]');assert.equal(signins.at(-1),'saved@example.test');
  });
  await t.test('changing accounts cancels pending UI updates and a password success does not invent an email confirmation',async()=>{
   let release;gate=new Promise(resolve=>{release=resolve;});feedback.show('recovery',{email:'first@example.test',requested:false});clock+=60001;await env.tick();const clicking=click('[data-auth-feedback="resend"]');await settle();user={id:UID2};revision++;feedback.reset();$('#modal').close();$('#modalContent').replaceChildren();release();await clicking;gate=null;assert.equal($('#modalContent').children.length,0);
   feedback.success('password-updated');assert.match(txt('[data-auth-feedback-banner]'),/Aucune autre confirmation/);assert.equal($('#modal').open,false);assert.match(notices.at(-1),/modifié/);feedback.reset();assert.equal($('[data-auth-feedback-banner]'),null);
   feedback.success('email-pending');assert.match(txt('[data-auth-feedback-banner]'),/n’est pas encore terminé/);assert.doesNotMatch(txt('[data-auth-feedback-banner]'),/Adresse email modifiée/);feedback.reset();
  });
 }finally{feedback.reset();env.close();}
});
