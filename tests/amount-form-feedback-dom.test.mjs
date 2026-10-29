/** Field feedback in the real daily-entry and drink-calculator controllers. No network. */
import assert from 'node:assert/strict';
import {createDailyEntry} from '../daily-entry.mjs';
import {installConsumptionCalculators} from '../consumption-calculator.mjs';
import {initFormValidation} from '../form-validation.mjs';
import {environment,$,$$,txt,value,submit,settle,UID} from './ux-dom-support.mjs';

const env=await environment({online:true,mobile:true});
initFormValidation();
const today='2026-10-27';
const journey={schema_version:3,timezone:'Europe/Paris',baseline:{started_on:'2026-10-01',units_week:14,cost_week:35},events:[{id:'33333333-3333-4333-8333-333333333333',started_on:'2026-10-25',state:'abstinent',units_week:0,cost_week:0,note:''}],occasions:[],ranges:[],goal:{mode:'abstain',weekly_limit:null,daily_limit:null,target_on:null,why:'',triggers:[],support_first:false,planned_action:''}};
const S={user:{id:UID},demo:true,page:'home',checks:[]};
const context=()=>({user:S.user,demo:S.demo});
const sameSession=c=>c.user===S.user&&c.demo===S.demo;
const daily=createDailyEntry({S,progression:{ready:()=>true,document:()=>structuredClone(journey),today:()=>today},sessionContext:context,sameSession,privateWrite:()=>{},message:error=>error.message,notify:()=>{},render:()=>{},modal:(_title,body)=>{$('#modalContent').innerHTML=body;$('#modal').showModal();},closeModal:()=>$('#modal').close(),accountRequest:()=>{throw Error('Unexpected real write');}});
const activeForm=()=>$('#dailyEntryForm');
const fieldMessage=input=>(input.getAttribute('aria-describedby')||'').split(/\s+/).map(id=>document.getElementById(id)).find(node=>node?.hasAttribute('data-form-field-error'))?.textContent||'';
const noFieldErrors=root=>assert.equal($$('[aria-invalid="true"]',root).length,0);
let calculator,host,passed=0;
async function check(name,run){await run();passed++;console.log('PASS '+name);}
async function openDay(){S.checks=[];daily.reset();$('#modal').close();daily.open(today);await settle();return activeForm();}
async function changeCalc(key,val){const input=$(`[data-sc-field="${key}"]`,$('#consumptionCalculator'));assert.ok(input,key);input.value=val;input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));await settle();return $(`[data-sc-field="${key}"]`,$('#consumptionCalculator'));}
async function openCalculator(){host.querySelector('.sc-launch').click();await settle();return $('#consumptionCalculator');}
function closeCalculator(){$('#consumptionCalculator [data-sc-close]')?.click();}

try{
  await check('daily entry starts without errors and explains a missing answer on its radio group',async()=>{
    const form=await openDay();noFieldErrors(form);await submit(form);
    const first=form.querySelector('[name="sober_today"]');
    assert.equal(first.getAttribute('aria-invalid'),'true');assert.match(fieldMessage(first),/Sans alcool.*Avec alcool/);
    assert.equal(S.checks.length,0);assert.equal($('#modal').open,true);
    await value(form,'sober_today','false');
    for(const radio of form.querySelectorAll('[name="sober_today"]'))assert.notEqual(radio.getAttribute('aria-invalid'),'true');
    assert.equal($('#dailyEntryError').hidden,true);
  });

  await check('daily quantity errors stay next to the field and correction can be saved',async()=>{
    const form=await openDay();await value(form,'sober_today','false');await value(form,'alcohol_units','-2');await submit(form);
    const input=form.elements.alcohol_units;
    assert.match(fieldMessage(input),/Quantité.*nombre/);assert.equal(input.getAttribute('aria-invalid'),'true');assert.equal(S.checks.length,0);
    await value(form,'alcohol_units','2.5');assert.notEqual(input.getAttribute('aria-invalid'),'true');assert.equal($('#dailyEntryError').hidden,true);
    await submit(form);assert.equal($('#modal').open,false);assert.equal(S.checks[0].alcohol_units,2.5);
  });

  await check('daily cost and date errors identify their own fields without clearing the draft',async()=>{
    let form=await openDay();await value(form,'sober_today','true');await value(form,'alcohol_cost_eur','-1');await submit(form);
    assert.match(fieldMessage(form.elements.alcohol_cost_eur),/Dépense.*nombre/);assert.equal(form.elements.sober_today.value,'true');
    await value(form,'alcohol_cost_eur','0');assert.equal($('#dailyEntryError').hidden,true);
    await value(form,'checkin_date','2026-10-28');assert.match(fieldMessage(form.elements.checkin_date),/date passée ou aujourd/);assert.equal(S.checks.length,0);
    await value(form,'checkin_date',today);form=activeForm();noFieldErrors(form);
  });

  await check('an incomplete native number cannot silently become an unknown amount',async()=>{
    const form=await openDay();await value(form,'sober_today','false');const input=form.elements.alcohol_units;
    // Browsers expose value="" while an unfinished number such as 1e is badInput.
    Object.defineProperty(input,'validity',{configurable:true,value:{badInput:true}});
    try{await submit(form);assert.equal(S.checks.length,0);assert.match(fieldMessage(input),/nombre valide/);}
    finally{delete input.validity;}
    await value(form,'alcohol_units','');await submit(form);assert.equal($('#modal').open,false);assert.equal(S.checks[0].alcohol_units,null);
  });

  await check('a changed daily record remains a form conflict, not a fabricated field error',async()=>{
    const form=await openDay();await value(form,'sober_today','false');
    S.checks.push({id:'44444444-4444-4444-8444-444444444444',user_id:UID,checkin_date:today,sober_today:true,alcohol_units:0,craving:2});
    await submit(form);assert.match(txt('#dailyEntryError'),/changé/);noFieldErrors(form);assert.equal(S.checks[0].sober_today,true);
  });

  $('#modal').close();$('#modalContent').replaceChildren();
  host=document.createElement('form');host.innerHTML='<label>Quantité<input name="units" type="number" min="0.01" max="1000" step="0.01" value=""></label>';document.body.append(host);
  calculator=installConsumptionCalculators(host);

  await check('the calculator waits for interaction before marking an incomplete drink',async()=>{
    const dialog=await openCalculator();noFieldErrors(dialog);assert.match(txt('[data-sc-total-detail]',dialog),/Choisis une boisson/);
    await changeCalc('type','other');noFieldErrors(dialog);assert.equal($('[data-sc-apply]',dialog).disabled,true);
    const volume=await changeCalc('volume','abc');assert.equal(volume.getAttribute('aria-invalid'),'true');assert.match(fieldMessage(volume),/Volume.*nombre/);
    await changeCalc('volume','25');assert.notEqual(volume.getAttribute('aria-invalid'),'true');
    const strength=$('[data-sc-field="strength"]',dialog);strength.dispatchEvent(new Event('focusout',{bubbles:true}));await settle();
    assert.match(fieldMessage(strength),/Degré.*nombre/);
    await changeCalc('strength','5');noFieldErrors(dialog);assert.equal($('[data-sc-apply]',dialog).disabled,false);
    await submit(dialog.querySelector('form'));assert.equal(dialog.open,false);assert.equal(host.elements.units.value,'1');
  });

  await check('calculator percentage and whole-person rules are explained with familiar units',async()=>{
    const dialog=await openCalculator();
    const portion=await changeCalc('portionPercent','0');assert.match(fieldMessage(portion),/0,01.*100 %/);assert.equal($('[data-sc-apply]',dialog).disabled,true);
    await changeCalc('portionPercent','50');assert.notEqual(portion.getAttribute('aria-invalid'),'true');
    const people=await changeCalc('people','1.5');assert.match(fieldMessage(people),/nombre entier/);
    await changeCalc('people','2');noFieldErrors(dialog);assert.equal($('[data-sc-apply]',dialog).disabled,false);
    await submit(dialog.querySelector('form'));assert.equal(host.elements.units.value,'0.25');
  });

  await check('changing a drink preset removes obsolete field errors and keeps the calculator usable',async()=>{
    const dialog=await openCalculator();await changeCalc('strength','101');assert.match(fieldMessage($('[data-sc-field="strength"]',dialog)),/Degré.*100/);
    await changeCalc('type','beer');noFieldErrors(dialog);assert.equal($('[data-sc-apply]',dialog).disabled,false);closeCalculator();
  });

  assert.deepEqual(env.errors,[]);
}finally{calculator?.disconnect();host?.remove();daily.reset();env.close();}
console.log(`${passed}/8 amount form feedback checks passed; no real network or account write`);
