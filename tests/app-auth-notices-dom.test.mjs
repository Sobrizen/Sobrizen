import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {integrateApp} from '../scripts/integrate-community.mjs';
import {environment,boot,mockService,$,txt,click,submit,value,closeModal,settle,UID} from './ux-dom-support.mjs';

test('real app gives visible signup, recovery, resend and password confirmations without stale-account notices',async t=>{
 const env=await environment({online:true}),mock=await mockService(),calls=[];let recoveryGate=null;
 mock.client.auth.signUp=async payload=>{calls.push({kind:'signup',payload});return {data:{session:null,user:{id:UID}},error:null};};
 mock.client.auth.resetPasswordForEmail=async(email,options)=>{calls.push({kind:'recovery',email,options});if(recoveryGate)await recoveryGate;return {data:{},error:null};};
 mock.client.auth.resend=async payload=>{calls.push({kind:'confirmation',payload});return {data:{},error:null};};
 mock.client.auth.updateUser=async payload=>{calls.push({kind:'password',payload});return {data:{user:{id:UID}},error:null};};
 const appURL=new URL('../app.mjs',import.meta.url).href;
 const hook=registerHooks({load(url,context,next){const result=next(url,context);return url===appURL?{...result,source:integrateApp(readFileSync(new URL(url),'utf8'))+'\nexport {S,passwordModal};\n'}:result;}});
 let app;
 try{
  await boot({mock});app=await import(appURL);await closeModal();await mock.signOut();
  await t.test('signup opens a persistent check-email notice with spam guidance and the submitted address',async()=>{
   await click('#signupTab');const form=$('#authForm');await value(form,'email','new@example.test');await value(form,'password','FictionOnlyPassword123');await value(form,'consent',true);await submit(form);
   assert.equal($('#modal').open,true);assert.match(txt('[data-auth-email-feedback]'),/new@example.test/);assert.match(txt('[data-auth-email-feedback]'),/spams/);assert.match(txt('#authInfo'),/confirmer ton inscription/);assert.equal($('[data-auth-feedback="resend"]').disabled,true);
   assert.equal(calls.filter(call=>call.kind==='signup').length,1);await closeModal();
  });
  await t.test('forgot-password and confirmation resend explain their distinct next step',async()=>{
   await value($('#authForm'),'email','recover@example.test');await click('[data-action="forgot"]');assert.match(txt('#modalContent'),/réinitialiser/);assert.match(txt('#modalContent'),/Si un compte correspond/);assert.match(txt('#modalContent'),/spams/);assert.equal(calls.at(-1).email,'recover@example.test');await closeModal();
   await value($('#authForm'),'email','confirm@example.test');await click('[data-action="resend"]');assert.match(txt('#modalContent'),/Confirmation demandée/);assert.match(txt('#modalContent'),/plus récent/);assert.match(txt('#modalContent'),/spams/);assert.equal(calls.at(-1).payload.email,'confirm@example.test');await closeModal();
  });
  await t.test('password recovery succeeds with a persistent success banner instead of asking for another email',async()=>{
   await mock.signIn({id:UID},{event:'PASSWORD_RECOVERY'});assert.ok($('#passwordForm'));await value($('#passwordForm'),'password','FictionNewPassword123');await value($('#passwordForm'),'confirm','FictionNewPassword123');await submit($('#passwordForm'));
   assert.equal($('#modal').open,false);assert.match(txt('[data-auth-feedback-banner]'),/Mot de passe modifié/);assert.match(txt('[data-auth-feedback-banner]'),/Aucune autre confirmation/);assert.equal(app.S.recovery,false);
  });
  await t.test('changing the email opens inbox and spam instructions after reauthentication in an isolated session',async()=>{
   app.S.user.email='qa@example.test';
   const main=globalThis.__sobrizenQaClient;globalThis.__sobrizenQaClient={auth:{signInWithPassword:async()=>({data:{user:{id:UID}},error:null}),signOut:async()=>({data:{},error:null})}};
   mock.client.auth.updateUser=async payload=>{calls.push({kind:'account-update',payload});return {data:{user:{...app.S.user,new_email:payload.email}},error:null};};
   try{
    await click('#avatar');await click('[data-account="email"]');const form=$('[data-account-form="email"]');await value(form,'email','next@example.test');await value(form,'confirm_email','next@example.test');await value(form,'current','FictionCurrentPassword123');await submit(form);
    assert.equal($('#modal').open,true);assert.match(txt('#modalContent'),/nouvelle adresse email/);assert.match(txt('[data-auth-email-feedback]'),/next@example.test/);assert.match(txt('[data-auth-email-feedback]'),/spams/);assert.match(txt('[data-auth-email-feedback]'),/ancienne/);assert.equal($('[data-auth-feedback="resend"]'),null);await closeModal();
   }finally{globalThis.__sobrizenQaClient=main;}
  });
  await t.test('a requested security code leaves the password draft open with persistent spam instructions',async()=>{
   mock.client.auth.reauthenticate=async()=>({data:{},error:null});await click('[data-account="password"]');const form=$('[data-account-form="password"]');await value(form,'password','NewDraftPassword123');await click('[data-account="reauthenticate"]');
   assert.equal(form.isConnected,true);assert.equal(form.elements.password.value,'NewDraftPassword123');assert.match(txt('[data-account-status]',form),/spams/);assert.equal(document.activeElement,form.elements.nonce);await closeModal();
  });
  await t.test('a delayed email request cannot reopen its notice after an account has changed',async()=>{
   await mock.signOut();let release;recoveryGate=new Promise(resolve=>{release=resolve;});await value($('#authForm'),'email','late@example.test');const clicking=click('[data-action="forgot"]');await settle();await mock.signIn({id:UID});await closeModal();release();await clicking;await settle();recoveryGate=null;assert.equal($('[data-auth-email-feedback]'),null);
  });
  assert.deepEqual(env.errors,[]);
 }finally{hook.deregister();env.close();}
});
