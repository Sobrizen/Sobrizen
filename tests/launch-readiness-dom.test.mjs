/** Actual app controllers; synthetic accounts and a deterministic backend only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {environment,boot,mockService,UID,$,$$,click,value,submit,route,settle} from './ux-dom-support.mjs';

const env=await environment({online:true,mobile:true});
const mock=await mockService();
await boot({mock});

test('one mobile navigation and one password toggle are rendered, with access to safety tools',async()=>{
  assert.equal($$('#quickNav').length,1);
  assert.equal($$('#authForm [data-action="password-visibility"]').length,1);
  assert.equal($$('#authForm .ux-password-toggle').length,0);
  assert.ok($('#quickNav [data-ux-value="help"]'));
  await click('[data-action="password-visibility"]');
  assert.equal($('#authForm').elements.password.type,'text');
  await click('#signupTab');
  assert.equal($('#authForm').elements.password.type,'password');
  assert.equal($('#signupTab').getAttribute('aria-pressed'),'true');
});

test('program conflict preserves draft, reloads a server version and saves an explicit replacement',async()=>{
  await route('journey');
  await click('[data-action="step"][data-step="1"]');
  let form=$('#programForm');
  assert.equal(form.elements.expected_revision.value,'0');
  await value(form,'reflection','Mon premier texte');
  await submit(form);
  assert.equal(mock.tables.program_progress[0].reflection,'Mon premier texte');
  form=$('#programForm');
  assert.equal(form.elements.expected_revision.value,'1');
  await value(form,'reflection','Mon brouillon conservé');
  Object.assign(mock.tables.program_progress[0],{reflection:'Texte plus récent sur un autre appareil',revision:2});
  await submit(form);
  assert.equal(form.elements.reflection.value,'Mon brouillon conservé');
  assert.equal(mock.tables.program_progress[0].revision,2);
  await click('[data-action="program-reload"]');
  assert.equal(form.elements.reflection.value,'Mon brouillon conservé');
  assert.equal(form.elements.expected_revision.value,'2');
  assert.match(form.querySelector('[data-program-latest]').textContent,/Texte plus récent/);
  await submit(form);
  assert.equal(mock.tables.program_progress[0].revision,3);
  assert.equal(mock.tables.program_progress[0].reflection,'Mon brouillon conservé');
  assert.equal($('#programForm').elements.expected_revision.value,'3');
});

test('personal reasons can be created, edited and removed within the owner scope',async()=>{
  await route('profile');
  await click('[data-action="reason-new"]');
  await value($('#reasonForm'),'title','Retrouver du temps');
  await value($('#reasonForm'),'detail','Pour les choses importantes');
  await submit($('#reasonForm'));
  assert.equal(mock.tables.reasons.length,1);
  assert.equal(mock.tables.reasons[0].user_id,UID);
  await click('[data-action="reason-edit"]');
  await value($('#reasonForm'),'title','Prendre soin de moi');
  await submit($('#reasonForm'));
  assert.equal(mock.tables.reasons[0].title,'Prendre soin de moi');
  env.answer(true);
  await click('[data-action="reason-delete"]');
  assert.equal(mock.tables.reasons.length,0);
  for(const call of mock.calls.filter(call=>call.table==='reasons'&&['update','delete'].includes(call.op))){
    assert.ok(call.filters.some(([key,val])=>key==='user_id'&&val===UID));
    assert.ok(call.filters.some(([key])=>key==='title'),'A stale edit must not overwrite another version');
  }
  await settle();
});

test('a conflicting reason edit retains the draft and the other device version',async()=>{
  await click('[data-action="reason-new"]');
  await value($('#reasonForm'),'title','Un cap');
  await submit($('#reasonForm'));
  await click('[data-action="reason-edit"]');
  const form=$('#reasonForm');
  await value(form,'title','Mon brouillon');
  mock.tables.reasons[0].title='Modification distante';
  await submit(form);
  assert.equal(form.elements.title.value,'Mon brouillon');
  assert.equal(mock.tables.reasons[0].title,'Modification distante');
  assert.ok(form.querySelector('[role="alert"]'));
});
