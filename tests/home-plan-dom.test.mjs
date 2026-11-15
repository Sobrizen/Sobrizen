import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {integrateApp} from '../scripts/integrate-community.mjs';
import {environment,boot,mockService,UID,$,txt,route,click,value,settle} from './ux-dom-support.mjs';

const env=await environment({online:true}),mock=await mockService();
const appURL=new URL('../app.mjs',import.meta.url).href;
const hook=registerHooks({load(url,context,next){const result=next(url,context);return url===appURL?{...result,source:integrateApp(readFileSync(new URL(url),'utf8'))+'\nexport {S,render,syncAccess};'}:result;}});
await boot({mock});const app=await import(appURL);await settle();

test('a free account discovers plans from home without blocking daily tools',async()=>{
  // The fixture deliberately has no live billing endpoint; resolve this state explicitly.
  app.S.billing={ready:true,premium:false};
  await route('home');
  assert.ok($('[data-home-plan]'));
  assert.equal($('[data-home-plan] .primary').getAttribute('href'),'/abonnement');
  assert.match(txt('[data-home-plan]'),/gratuitement/);
  assert.ok($('.dy-today-action[data-daily-action="day"]'));
  assert.equal(document.querySelectorAll('.sz-tool').length,4);
  await click('.sz-tool[data-page="games"]');assert.equal(app.S.page,'games');
  await route('home');
});

test('access refresh updates the invitation and leaves an open private draft intact',async()=>{
  await click('.dy-today-action[data-action="journal-new"]');
  await value($('#journalForm'),'body','Une pensée fictive à conserver pendant la vérification du plan.');
  app.S.billing={ready:true,premium:true};app.syncAccess();
  assert.equal($('[data-home-plan]'),null);
  assert.equal($('#modal').open,true);
  assert.match($('#journalForm').elements.body.value,/à conserver/);
  app.S.billing={ready:true,premium:false};app.syncAccess();
  assert.ok($('[data-home-plan]'));
  assert.match($('#journalForm').elements.body.value,/à conserver/);
  $('#journalForm').elements.body.value='';
  await click('#modal [data-action="close"]');
});

test('a new account can choose a plan before setting up its tracking journey',async()=>{
  await mock.signOut();mock.tables.journey_timelines=[];
  await mock.signIn({id:UID});await route('home');
  app.S.billing={ready:true,premium:false};app.render();
  assert.ok($('[data-home-plan-slot]'));
  assert.equal($('[data-home-plan] .primary').getAttribute('href'),'/abonnement');
});

test('unconfirmed access has a neutral verification action, including without sensitive consent',()=>{
  app.S.billing={ready:false,premium:false};app.syncAccess();
  assert.ok($('.sz-home-plan--pending'));
  assert.equal($('[data-home-plan] .primary'),null);
  app.S.settings.health_data_consent_at=null;app.render();
  assert.ok($('.sz-home-plan--pending'));
  assert.match(txt('#content'),/sous ton contrôle/);
  assert.deepEqual(env.errors,[]);
});

test.after(()=>{hook.deregister();env.close();});
