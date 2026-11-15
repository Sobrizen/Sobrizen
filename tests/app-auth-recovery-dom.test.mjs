import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {integrateApp} from '../scripts/integrate-community.mjs';
import {environment,boot,mockService,UID,UID2,$,txt,click,route,value,submit,closeModal,settle} from './ux-dom-support.mjs';

test('password recovery follows its authenticated account and ignores superseded events',async t=>{
 const env=await environment({online:true}),mock=await mockService();
 let insideAuthCallback=false;
 const subscribe=mock.client.auth.onAuthStateChange,from=mock.client.from;
 mock.client.auth.onAuthStateChange=callback=>subscribe((event,session)=>{insideAuthCallback=true;try{return callback(event,session);}finally{insideAuthCallback=false;}});
 mock.client.from=(...args)=>{assert.equal(insideAuthCallback,false,'SDK database work must run after the auth callback releases its lock');return from(...args);};
 const secondSettings=mock.tables.user_settings.find(row=>row.user_id===UID2);
 Object.assign(secondSettings,{health_data_consent_at:'2026-10-27T10:00:00Z',health_data_consent_version:'2026-10-02-v1'});
 // The signup trigger creates a journey even before the optional timeline setup.
 mock.tables.sobriety_journeys.push({...structuredClone(mock.tables.sobriety_journeys[0]),user_id:UID2,why_text:'PARCOURS PRIVÉ B'});
 const updates=[];
 mock.client.auth.updateUser=async payload=>{const {data}=await mock.client.auth.getSession();updates.push({user:data.session?.user.id,...payload});return {data:{user:data.session?.user},error:null};};
 const appURL=new URL('../app.mjs',import.meta.url).href;
 const hook=registerHooks({load(url,context,next){const result=next(url,context);return url===appURL?{...result,source:integrateApp(readFileSync(new URL(url),'utf8'))+'\nexport {S};\n'}:result;}});
 let app;
 async function signInA(){await mock.signOut();await mock.signIn({id:UID});await closeModal();assert.equal(app.S.user.id,UID);}
 try{
  await boot({mock});app=await import(appURL);await closeModal();
  await t.test('a different recovery account clears A immediately and loads B before allowing a password update',async()=>{
   await route('profile');assert.equal($('#profileForm').elements.display_name.value,'Compte QA');
   const previousRevision=app.S.settings.health_data_consent_at;
   const recovering=mock.signIn({id:UID2},{event:'PASSWORD_RECOVERY'});
   assert.equal(app.S.user.id,UID2);assert.deepEqual(app.S.settings,{});assert.deepEqual(app.S.journal,[]);
   assert.equal($('#profileForm'),null);assert.equal($('#passwordForm'),null);assert.ok(previousRevision);
   await recovering;await settle(40);
   assert.equal(app.S.user.id,UID2);assert.equal(app.S.profile.display_name,'Autre compte QA');
   assert.equal(app.S.settings.user_id,UID2);assert.equal(app.S.journey.user_id,UID2);
   assert.ok($('#passwordForm'),txt('#notice'));assert.doesNotMatch(txt('#content'),/Note privée QA|Motivation fictive QA/);
   await value($('#passwordForm'),'password','RecoverySecret123');await value($('#passwordForm'),'confirm','RecoverySecret123');await submit($('#passwordForm'));
   assert.deepEqual(updates,[{user:UID2,password:'RecoverySecret123'}]);assert.equal(app.S.recovery,false);assert.equal($('#modal').open,false);
  });
  await t.test('a signout in the same turn cancels the queued recovery before it can load or open a modal',async()=>{
   await signInA();const start=mock.calls.length;
   const recovering=mock.signIn({id:UID2},{event:'PASSWORD_RECOVERY'});
   await mock.signOut();await recovering;await settle(30);
   assert.equal(app.S.user,null);assert.equal(app.S.recovery,false);assert.equal($('#passwordForm'),null);assert.equal($('#modal').open,false);
   assert.equal(mock.calls.slice(start).some(call=>call.table==='profiles'&&call.filters?.some(([key,id])=>key==='id'&&id===UID2)),false);
  });
  await t.test('a newer account signin cancels the queued recovery without resetting the new account password',async()=>{
   await signInA();const updatesBefore=updates.length;
   const recovering=mock.signIn({id:UID2},{event:'PASSWORD_RECOVERY'}),signingIn=mock.signIn({id:UID});
   await Promise.all([recovering,signingIn]);await settle(40);
   assert.equal(app.S.user.id,UID);assert.equal(app.S.profile.display_name,'Compte QA');
   assert.equal(app.S.recovery,false);assert.equal($('#passwordForm'),null);assert.equal($('#modal').open,false);assert.equal(updates.length,updatesBefore);
  });
  await t.test('a deferred recovery load cannot restore B after signout and account A signin',async()=>{
   const gate=mock.defer(call=>call.table==='profiles'&&call.filters?.some(([key,id])=>key==='id'&&id===UID2));
   await mock.signIn({id:UID2},{event:'PASSWORD_RECOVERY'});assert.equal(gate.used,true);
   await signInA();gate.release();await settle(40);
   assert.equal(app.S.user.id,UID);assert.equal(app.S.profile.display_name,'Compte QA');assert.equal(app.S.recovery,false);assert.equal($('#passwordForm'),null);assert.equal($('#modal').open,false);
  });
  await t.test('same-account recovery keeps the private account and opens a bound password form',async()=>{
   await mock.signIn({id:UID},{event:'PASSWORD_RECOVERY'});assert.ok($('#passwordForm'));assert.equal(app.S.user.id,UID);assert.equal(app.S.profile.display_name,'Compte QA');
   await value($('#passwordForm'),'password','SameAccountSecret123');await value($('#passwordForm'),'confirm','SameAccountSecret123');await submit($('#passwordForm'));
   assert.deepEqual(updates.at(-1),{user:UID,password:'SameAccountSecret123'});assert.equal(app.S.recovery,false);assert.equal($('#modal').open,false);
  });
  await t.test('a duplicate signin notification for B does not cancel its pending recovery',async()=>{
   const recovering=mock.signIn({id:UID2},{event:'PASSWORD_RECOVERY'}),signedIn=mock.signIn({id:UID2});
   await Promise.all([recovering,signedIn]);await settle(30);
   assert.equal(app.S.user.id,UID2);assert.equal(app.S.profile.id,UID2);assert.ok($('#passwordForm'));
   await closeModal();
  });
  await t.test('a pending old-account profile save cannot repopulate a recovered B account',async()=>{
   await signInA();await route('profile');await value($('#profileForm'),'display_name','ANCIEN PROFIL EN ATTENTE');
   const gate=mock.defer(call=>call.table==='profiles'&&call.op==='update');await submit($('#profileForm'));assert.equal(gate.used,true);
   await mock.signIn({id:UID2},{event:'PASSWORD_RECOVERY'});gate.release();await settle(40);
   assert.equal(app.S.user.id,UID2);assert.equal(app.S.profile.display_name,'Autre compte QA');assert.ok($('#passwordForm'));
   assert.doesNotMatch(txt('#content'),/ANCIEN PROFIL EN ATTENTE/);await closeModal();
  });
  await t.test('recovery replaces a running demonstration with the real consenting account',async()=>{
   await mock.signOut();await click('[data-action="demo"]');assert.equal(app.S.demo,true);
   await mock.signIn({id:UID2},{event:'PASSWORD_RECOVERY'});await settle(30);
   assert.equal(app.S.demo,false);assert.equal(app.S.user.id,UID2);assert.equal(app.S.profile.display_name,'Autre compte QA');
   assert.equal($('#demoBanner').hidden,true);assert.ok($('#passwordForm'));assert.doesNotMatch(txt('#content'),/Alex|Donnée fictive de démonstration/);
  });
  await t.test('same-account recovery preserves a dirty journal draft and opens after its confirmed save',async()=>{
   await signInA();await route('journal');await click('[data-action="journal-new"]');
   const form=$('#journalForm');await value(form,'title','RÉFLEXION À CONSERVER');await value(form,'body','Un brouillon privé avant de changer mon mot de passe.');
   await mock.signIn({id:UID},{event:'PASSWORD_RECOVERY'});await settle(30);
   assert.equal($('#journalForm'),form);assert.equal(form.elements.body.value,'Un brouillon privé avant de changer mon mot de passe.');
   assert.equal($('#passwordForm'),null);assert.equal(app.S.recovery,true);assert.match(txt('#notice'),/Enregistre ou ferme ta note/);
   await submit(form);await settle(40);
   assert.ok(mock.tables.journal_entries.some(row=>row.title==='RÉFLEXION À CONSERVER'&&row.user_id===UID));
   assert.ok($('#passwordForm'),txt('#notice'));assert.deepEqual(env.errors,[]);
  });
  await t.test('closing the previous dirty note after signout never reopens its deferred recovery',async()=>{
   await closeModal();await route('journal');await click('[data-action="journal-new"]');await value($('#journalForm'),'body','Autre brouillon privé non enregistré');
   await mock.signIn({id:UID},{event:'PASSWORD_RECOVERY'});assert.equal($('#passwordForm'),null);assert.ok($('#journalForm'));
   await mock.signOut();await mock.signIn({id:UID2});await settle(40);
   assert.equal(app.S.user.id,UID2);assert.equal(app.S.recovery,false);assert.equal($('#passwordForm'),null);assert.equal($('#modal').open,false);
  });
  await t.test('no uncaught errors or real network requests occurred',()=>assert.deepEqual(env.errors,[]));
 }finally{hook.deregister();env.close();}
});
