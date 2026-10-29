/** Actual app forms and deployment bridge; only the DOM and external service are mocked. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {integrateApp} from '../scripts/integrate-community.mjs';
import {environment,boot,mockService,UID,$,$$,txt,click,value,closeModal,route,settle} from './ux-dom-support.mjs';

const env=await environment({online:true});
const mock=await mockService();
const appURL=new URL('../app.mjs',import.meta.url).href;
const hook=registerHooks({load(url,context,next){
  const loaded=next(url,context);
  return url===appURL?{...loaded,source:integrateApp(readFileSync(new URL(url),'utf8'))}:loaded;
}});
const writes=()=>mock.calls.filter(call=>call.rpc||['insert','upsert','update','delete'].includes(call.op));
const currentStep=form=>form.querySelector('[data-tl-step]:not([hidden])')?.dataset.tlStep;
function explanation(input,pattern){
  assert.equal(input.getAttribute('aria-invalid'),'true',`${input.name} must identify its invalid state`);
  const ids=(input.getAttribute('aria-errormessage')||'').split(/\s+/).filter(Boolean);
  const node=ids.map(id=>document.getElementById(id)).find(item=>item?.hasAttribute('data-form-field-error'));
  assert.ok(node,`${input.name} needs its own visible explanation`);
  assert.equal(node.closest('[hidden]'),null,`${input.name} explanation must be in the current step`);
  assert.ok((input.getAttribute('aria-describedby')||'').split(/\s+/).includes(node.id));
  assert.match(node.textContent,pattern);
  return node;
}
function corrected(input){
  assert.notEqual(input.getAttribute('aria-invalid'),'true',`${input.name} should stop indicating an error after correction`);
  assert.equal(input.getAttribute('aria-errormessage'),null);
  assert.equal(input.validity.valid,true);
}
// Click the real submit button: dispatching a synthetic SubmitEvent would bypass
// the browser's native required/min/max validation before the app handler runs.
const nativeSubmit=form=>click(form.querySelector('button[type="submit"]'));
let passed=0,timelineForm,timelineWrites;
async function check(name,run){await run();assert.deepEqual(env.errors,[]);passed++;console.log('PASS '+name);}

try{
  await boot({mock});
  assert.equal($('#loadError').hidden,true,txt('#loadError'));

  await check('timeline explains the missing date in the current step without validating hidden quantities',async()=>{
    await route('progress');await click('#content [data-tl-action="occasion"]');
    timelineForm=$('#tlOccasionForm');assert.ok(timelineForm);assert.equal(timelineForm.noValidate,true);
    timelineWrites=writes().length;
    assert.equal(currentStep(timelineForm),'0');
    assert.equal($$('[data-form-field-error]',timelineForm).length,0);
    await value(timelineForm,'date','');
    assert.equal($$('[data-form-field-error]',timelineForm).length,0,'Editing alone must not show premature errors');
    await nativeSubmit(timelineForm);
    assert.equal(currentStep(timelineForm),'0');
    explanation(timelineForm.elements.date,/Choisis une date/);
    assert.equal(document.activeElement,timelineForm.elements.date);
    assert.equal($$('[data-tl-step="1"] [data-form-field-error]',timelineForm).length,0);
    assert.notEqual(timelineForm.elements.units.getAttribute('aria-invalid'),'true');
    assert.equal(writes().length,timelineWrites);
  });

  await check('correcting step one opens step two without flagging its untouched required fields',async()=>{
    await value(timelineForm,'date','2026-10-27');corrected(timelineForm.elements.date);
    assert.equal($$('[data-tl-step="1"] [data-form-field-error]',timelineForm).length,0);
    await nativeSubmit(timelineForm);
    assert.equal(currentStep(timelineForm),'1');
    assert.equal(timelineForm.elements.units.value,'');assert.equal(timelineForm.elements.cost.value,'');
    assert.equal($$('[data-form-field-error]',timelineForm).length,0);
    assert.equal(writes().length,timelineWrites);
  });

  await check('quantity explains its bound, correction reaches review, and only final confirmation writes',async()=>{
    await value(timelineForm,'units','-1');await value(timelineForm,'cost','0');
    await nativeSubmit(timelineForm);
    assert.equal(currentStep(timelineForm),'1');
    explanation(timelineForm.elements.units,/entre 0,01 et 1000/);
    assert.equal(document.activeElement,timelineForm.elements.units);
    assert.equal(writes().length,timelineWrites);
    await value(timelineForm,'units','2');corrected(timelineForm.elements.units);
    await nativeSubmit(timelineForm);
    assert.equal(currentStep(timelineForm),'2');
    assert.match(txt('[data-tl-review-receipt]',timelineForm),/2 verres/);
    assert.equal(writes().length,timelineWrites,'Reviewing a valid draft must not save it');
    assert.equal(mock.tables.journey_timelines[0].document.occasions.length,0);
    await nativeSubmit(timelineForm);
    const saves=writes().slice(timelineWrites).filter(call=>call.rpc==='save_journey_timeline');
    assert.equal(saves.length,1);
    const saved=mock.tables.journey_timelines.find(row=>row.user_id===UID).document.occasions;
    assert.equal(saved.length,1);assert.equal(saved[0].date,'2026-10-27');assert.equal(saved[0].units,2);assert.equal(saved[0].cost,0);
    assert.equal($('#modal').open,false);
  });

  await check('journal native required title and body each receive an explanation and clear independently',async()=>{
    await route('journal');await closeModal();await click('#content [data-action="journal-new"]');
    const form=$('#journalForm'),before=writes().length;assert.ok(form);assert.equal(form.noValidate,false);
    assert.equal($$('[data-form-field-error]',form).length,0);
    await nativeSubmit(form);
    explanation(form.elements.title,/Remplis ce champ/);explanation(form.elements.body,/Remplis ce champ/);
    assert.equal($('#modal').open,true);assert.equal(writes().length,before);
    await value(form,'title','Une note de test');corrected(form.elements.title);
    explanation(form.elements.body,/Remplis ce champ/);
    await value(form,'body','Je garde ces mots pour moi.');corrected(form.elements.body);
    assert.equal($$('[data-form-field-error]',form).length,0);
    assert.equal(writes().length,before,'Correcting a note is not an instruction to save it');
    await closeModal();
  });

  await check('community native consent checkbox explains the missing confirmation before any publication',async()=>{
    await route('community');await click('#content [data-action="post-new"]');
    const form=$('#communityPostForm'),before=writes().length;assert.ok(form);assert.equal(form.noValidate,false);
    await value(form,'body','Un petit pas pour aujourd’hui.');
    assert.equal(form.elements.share_consent.checked,false);
    assert.equal($$('[data-form-field-error]',form).length,0);
    await nativeSubmit(form);
    explanation(form.elements.share_consent,/Confirme le partage avant de publier/);
    assert.equal(document.activeElement,form.elements.share_consent);
    assert.equal(writes().length,before);
    await value(form,'share_consent',true);corrected(form.elements.share_consent);
    assert.equal(writes().length,before,'Checking consent alone must not publish');
    await closeModal();
  });

  await check('health native future date gives the actual latest allowed date and clears after correction',async()=>{
    await route('health');await click('#content [data-health-action="checkin"]');
    const form=$('#healthCheckinForm'),date=form.elements.checkin_date,before=writes().length;
    assert.equal(date.max,'2026-10-27');assert.equal($$('[data-form-field-error]',form).length,0);
    // Input followed by submission exercises native range validation; change is
    // intentionally separate because this real form uses it to load another day.
    date.value='2026-10-28';date.dispatchEvent(new Event('input',{bubbles:true}));await settle();
    await nativeSubmit(form);
    explanation(date,/au plus tard le 27\/10\/2026/);
    assert.equal(document.activeElement,date);assert.equal(writes().length,before);
    date.value='2026-10-27';date.dispatchEvent(new Event('input',{bubbles:true}));await settle();corrected(date);
    assert.equal(writes().length,before);await closeModal();
  });
  console.log(`${passed}/${passed} guided form feedback checks passed`);
}finally{hook.deregister();env.close();}
