/**
 * Real app + daily/health/journal controllers, with test-only DOM, clock and service.
 * Run directly: node tests/daily-dom.test.mjs [--group=home|calendar|editing|occasion|records|privacy|modes]
 * No subprocess runner: each scenario resets the app through real auth handlers.
 * These checks verify interactions/data/focus, not browser layout or network RLS.
 */
import assert from 'node:assert/strict';
import {timelineStopBasis} from '../timeline-core.mjs';
import {environment,boot,mockService,UID,UID2,$,$$,txt,click,value,submit,closeModal,route,settle,setNow,now} from './ux-dom-support.mjs';

const groups=['home','calendar','editing','occasion','records','privacy','modes'];
const selected=process.argv.find(arg=>arg.startsWith('--group='))?.slice(8);
assert.ok(!selected||groups.includes(selected),`Unknown daily DOM group: ${selected}`);
const instant='2026-10-27T12:30:00Z',today='2026-10-27',stamp='2026-10-27T10:00:00.000Z';
const id=n=>`dddddddd-dddd-4ddd-8ddd-${n.toString(16).padStart(12,'0')}`;
const clone=value=>structuredClone(value);
const writes=mock=>mock.calls.filter(call=>call.rpc||['insert','upsert','update','delete'].includes(call.op));
const dailyWrites=mock=>writes(mock).filter(call=>call.table==='daily_checkins');
const day=(date,root='.dy-week')=>$(`${root} .dy-day-button[data-date="${date}"]`);
const form=()=>$('#dailyEntryForm');
const row=(mock,date=today)=>mock.tables.daily_checkins.find(check=>check.user_id===UID&&check.checkin_date===date);

const env=await environment({online:true});
const mock=await mockService();
const base=clone(mock.tables),results=[];
let currentGroup='';
function documentOf(){return mock.tables.journey_timelines.find(item=>item.user_id===UID).document;}
function confirmClock(){
  const doc=documentOf();
  for(const event of doc.events)if(event.stopped_at)event.stop_basis=timelineStopBasis(doc,mock.tables.daily_checkins,event.started_on);
}
function savedCheck(overrides={}){
  return {id:id(10),user_id:UID,checkin_date:'2026-10-26',sober_today:false,
    alcohol_units:3,alcohol_cost_eur:11.5,quantity_method:'calculator',
    drink_details:[{volume:250,strength:5}],mood:2,energy:4,sleep_hours:6.5,
    trigger_tags:['Stress'],note:'NOTE PRIVÉE À CONSERVER',craving:null,updated_at:stamp,...overrides};
}
function fixture(name){
  const doc=documentOf();doc.baseline.started_on='2026-10-01';
  if(name==='calendar'){
    doc.ranges=[{id:id(1),started_on:'2026-10-23',ended_on:'2026-10-24',state:'drinking',units_week:14,cost_week:35,note:''}];
    doc.occasions=[{id:id(2),date:'2026-10-24',units:2,cost:8}];
  }
  if(name==='editing')mock.tables.daily_checkins=[savedCheck()];
  if(name==='occasion'){
    doc.events[0].started_on=today;doc.events[0].stopped_at='2026-10-27T12:10:00.000Z';
    doc.occasions=[{id:id(3),date:today,units:2,cost:12}];
  }
  if(name==='ritual'||name==='timezone'){
    mock.tables.daily_checkins=[];mock.tables.health_checkins=[];
    doc.goal.planned_action='Une intention persistante ne coche pas la journée.';
    const date=name==='timezone'?'2026-10-26':today;
    mock.tables.journal_entries=[
      {id:id(4),user_id:UID,entry_date:date,kind:'reflection',title:'Réflexion',body:'Un texte réel, mais pas un plan.',created_at:stamp},
      {id:id(5),user_id:UID,entry_date:name==='timezone'?'2026-10-25':'2026-10-26',kind:'plan',title:'Plan précédent',body:'Marcher après le travail.',created_at:stamp},
    ];
    if(name==='timezone'){
      setNow('2026-10-27T00:30:00Z');doc.timezone='America/Los_Angeles';
      doc.events[0].started_on='2026-10-24';doc.events[0].stopped_at='2026-10-24T12:30:00.000Z';
    }
  }
  if(name==='without-consent'){
    const settings=mock.tables.user_settings.find(item=>item.user_id===UID);
    settings.health_data_consent_at=null;settings.health_data_consent_version=null;
  }
  if(name==='reduce')Object.assign(doc.goal,{mode:'reduce',weekly_limit:10,daily_limit:2});
  if(name==='premium')mock.tables.billing_subscriptions=[{user_id:UID,status:'active',paid_until:'2027-01-01T00:00:00Z',cancel_at_period_end:false}];
  confirmClock();
}
async function reset(name='base',configure=()=>{}){
  await mock.signOut();
  for(const key of Object.keys(base))mock.tables[key]=clone(base[key]);
  mock.faults.health=null;mock.faults.timeline=null;env.answer(true);setNow(instant);
  fixture(name);configure();confirmClock();mock.calls.length=0;
  await mock.signIn({id:UID});await closeModal();await route('home');
}
async function check(group,name,run){
  if(selected&&group!==selected)return;
  currentGroup=group;
  const errorCount=env.errors.length;
  try{
    await run();
    assert.deepEqual(env.errors.slice(errorCount),[],'No uncaught DOM/runtime error is allowed');
    results.push({group,name,pass:true});console.log(`PASS [${group}] ${name}`);
  }catch(error){
    results.push({group,name,pass:false});console.error(`FAIL [${group}] ${name}\n${error.stack}`);
    await closeModal().catch(()=>{});
  }
}
async function openToday(){await click('.dy-entry-link');assert.ok(form());return form();}
async function openDate(date){await route('progress');await click(day(date,'#dy-calendar'));assert.ok(form());return form();}

try{
  await boot({mock});

  await check('home','home leads to benefits and its discreet day link opens an unanswered declaration',async()=>{
    await reset();const before=writes(mock).length;
    assert.equal($('.dy-main-action').dataset.page,'health');assert.match(txt('.dy-main-action'),/Voir mes bienfaits/);
    assert.equal($('.dy-today'),null);assert.equal($('.dy-ritual'),null);assert.equal($('.dy-next-action'),null);
    assert.equal(txt('[data-daily-clock-value]'),'2');
    const target=await openToday();
    assert.equal(target.elements.checkin_date.value,today);
    assert.equal($$('input[name="sober_today"]:checked',target).length,0);
    assert.equal(target.elements.craving.value,'');
    assert.match(target.textContent,/journée en cours/);
    await value(target,'craving','0');await submit(target);
    assert.equal($('#modal').open,true);assert.equal(form(),target);
    assert.match(txt('#dailyEntryError'),/Choisis.*Sans alcool.*Avec alcool/);
    assert.equal(writes(mock).length,before);assert.equal(row(mock),undefined);
  });

  await check('home','an explicit drinking day keeps unknown amounts and health scores unknown',async()=>{
    await reset();const original=clone(row(mock,'2026-10-26'));
    const target=await openToday();await value(target,'sober_today','false');await submit(target);
    assert.equal($('#modal').open,false,txt('#dailyEntryError'));
    const saved=row(mock);assert.equal(saved.sober_today,false);
    for(const key of ['alcohol_units','alcohol_cost_eur','craving'])assert.equal(saved[key],null);
    for(const key of ['mood','energy','sleep_hours','note'])assert.equal(Object.hasOwn(saved,key),false);
    assert.deepEqual(row(mock,'2026-10-26'),original);
    assert.equal(day(today).dataset.provenance,'declared');assert.equal(day(today).dataset.state,'drinking');
    assert.match(day(today).getAttribute('aria-label'),/journée en cours/);
    assert.equal($('[data-daily-clock-value]'),null,'A new consumption invalidates an earlier stop clock');
    assert.equal(dailyWrites(mock).length,1);
  });

  await check('home','a sober answer records zero alcohol but leaves unreported purchases and craving empty',async()=>{
    await reset();const target=await openToday();await value(target,'sober_today','true');
    assert.equal(target.elements.alcohol_cost_eur.disabled,false);
    assert.equal(target.elements.alcohol_cost_eur.value,'');
    await submit(target);assert.equal($('#modal').open,false,txt('#dailyEntryError'));
    const saved=row(mock);assert.equal(saved.sober_today,true);assert.equal(saved.alcohol_units,0);
    assert.equal(saved.alcohol_cost_eur,null);assert.equal(saved.craving,null);
    assert.equal(day(today).dataset.state,'abstinent');assert.equal(day(today).dataset.provenance,'declared');
    assert.equal(document.activeElement.dataset.date,today,'Saving restores focus to the recorded date');
    assert.equal($$('.dy-week-days [data-provenance="declared"]').length,2);
    assert.equal(txt('[data-daily-clock-value]'),'2','Recording today must not add a completed day to the clock');
    assert.match(txt('[data-daily-clock-detail]'),/depuis ton dernier verre déclaré/,'A sober declaration must preserve the precise stop clock');
  });

  await check('home','changing the selected date preserves drafts; a future date is rejected without a write',async()=>{
    await reset();let target=await openToday();
    await value(target,'sober_today','false');await value(target,'alcohol_units','2.5');
    await value(target,'alcohol_cost_eur','9');await value(target,'craving','2');
    await value(target,'checkin_date','2026-10-26');target=form();
    assert.equal(target.elements.sober_today.value,'true');
    await value(target,'checkin_date',today);target=form();
    assert.equal(target.elements.sober_today.value,'false');assert.equal(target.elements.alcohol_units.value,'2.5');
    assert.equal(target.elements.alcohol_cost_eur.value,'9');assert.equal(target.elements.craving.value,'2');
    const count=dailyWrites(mock).length;
    await value(target,'checkin_date','2026-10-28');await submit(target);
    assert.equal(form(),target);assert.match(txt('#dailyEntryError'),/date passée ou aujourd/);
    assert.equal(dailyWrites(mock).length,count);assert.equal(target.elements.alcohol_units.value,'2.5');
  });

  await check('home','the real clock and next cap advance in place without losing focus or replaying a page',async()=>{
    await reset('base',()=>{
      const stop=documentOf().events[0];stop.started_on='2026-10-24';stop.stopped_at='2026-10-24T12:31:00.000Z';
    });
    assert.match(txt('[data-daily-earned]'),/1 jour/);assert.match(txt('[data-daily-cap-title]'),/3 jours/);
    const page=$('.dy-page'),focus=$('.dy-entry-link');focus.focus();$('.dy-safety').open=true;
    const count=writes(mock).length;setNow(now()+60000);await env.tick();
    assert.equal($('.dy-page'),page);assert.equal(document.activeElement,focus);assert.equal($('.dy-safety').open,true);
    assert.equal(txt('[data-daily-clock-value]'),'3');assert.match(txt('[data-daily-earned]'),/3 jours/);
    assert.match(txt('[data-daily-cap-title]'),/7 jours/);assert.equal(writes(mock).length,count);
    assert.equal($('.dy-cap-track').getAttribute('aria-valuenow'),'42','Three completed days remain visible toward seven instead of resetting to zero');
  });

  await check('calendar','seven dated cells distinguish declared, estimated and unknown days',async()=>{
    await reset('calendar');
    assert.equal($$('.dy-week-days .dy-day-button').length,7);
    const expected={
      '2026-10-21':['unknown','unknown'],'2026-10-22':['unknown','unknown'],
      '2026-10-23':['drinking','estimated'],'2026-10-24':['drinking','declared'],
      '2026-10-25':['abstinent','estimated'],'2026-10-26':['abstinent','declared'],
      '2026-10-27':['unknown','unknown'],
    };
    for(const [date,[state,provenance]]of Object.entries(expected)){
      const button=day(date);assert.ok(button);assert.equal(button.dataset.state,state);assert.equal(button.dataset.provenance,provenance);
      assert.match(button.getAttribute('aria-label'),new RegExp(String(Number(date.slice(-2)))+' octobre'));
    }
    assert.equal($$('.dy-week-days [data-provenance="declared"]').length,2);
    assert.equal(day(today).getAttribute('aria-current'),'date');
  });

  await check('calendar','calendar navigation preserves keyboard focus and future dates stay disabled',async()=>{
    await reset('calendar');await route('progress');const count=writes(mock).length;
    assert.ok($('#dy-calendar'));assert.match(txt('.dy-calendar-controls h3'),/octobre 2026/);
    for(const date of ['2026-10-28','2026-10-29','2026-10-30','2026-10-31']){
      assert.equal(day(date,'#dy-calendar').disabled,true);assert.equal(day(date,'#dy-calendar').dataset.provenance,'future');
    }
    assert.equal($('[data-daily-action="month-next"]').disabled,true);
    await click('[data-daily-action="month-prev"]');
    assert.match(txt('.dy-calendar-controls h3'),/septembre 2026/);
    assert.equal(document.activeElement,$('[data-daily-action="month-prev"]'));
    await click('[data-daily-action="month-next"]');
    assert.match(txt('.dy-calendar-controls h3'),/octobre 2026/);
    assert.equal(document.activeElement,$('#dy-calendar-title'));
    await click('[data-daily-action="month-prev"]');await click('[data-daily-action="month-today"]');
    assert.equal(document.activeElement,$('#dy-calendar-title'));assert.equal(writes(mock).length,count);
  });

  await check('calendar','opening an estimated alcohol-free period still requires an explicit daily answer',async()=>{
    await reset('calendar');const target=await openDate('2026-10-25');
    assert.equal($$('input[name="sober_today"]:checked',target).length,0);
    const count=dailyWrites(mock).length;await submit(target);
    assert.match(txt('#dailyEntryError'),/Choisis/);assert.equal(dailyWrites(mock).length,count);
    assert.equal(target.elements.checkin_date.value,'2026-10-25');
  });

  await check('calendar','dates before the baseline cannot be opened or counted as missing entries',async()=>{
    await reset();await route('progress');await click('[data-daily-action="month-prev"]');
    const cells=$$('#dy-calendar .dy-day-button');assert.equal(cells.length,30);
    assert.ok(cells.every(cell=>cell.disabled));
    assert.ok(cells.every(cell=>/Avant le début de ton suivi/.test(cell.getAttribute('aria-label'))));
    assert.match(txt('.dy-calendar-summary'),/0 à renseigner/);
    assert.ok($('#dy-calendar [data-tl-action="settings"]'));
    const count=dailyWrites(mock).length;cells[0].click();await settle();assert.equal(form(),null);
    assert.equal(dailyWrites(mock).length,count);
  });

  await check('editing','editing only craving uses null CAS and preserves quantity, purchases and private notes',async()=>{
    await reset('editing');const old=clone(row(mock,'2026-10-26'));
    const target=await openDate('2026-10-26');await value(target,'craving','0');await submit(target);
    assert.equal($('#modal').open,false,txt('#dailyEntryError'));
    assert.deepEqual(row(mock,'2026-10-26'),{...old,craving:0});
    const update=dailyWrites(mock).at(-1);assert.equal(update.op,'update');assert.deepEqual(update.payload,{craving:0});
    assert.ok(update.filters.some(([key,val])=>key==='craving'&&val?.is===null));
  });

  await check('editing','changing a calculator quantity clears stale details and compares their JSON value',async()=>{
    await reset('editing');const old=clone(row(mock,'2026-10-26'));
    const target=await openDate('2026-10-26');await value(target,'alcohol_units','4.5');await submit(target);
    assert.equal($('#modal').open,false,txt('#dailyEntryError'));
    const saved=row(mock,'2026-10-26');assert.equal(saved.alcohol_units,4.5);assert.equal(saved.quantity_method,'standard');
    assert.equal(saved.drink_details,null);assert.equal(saved.alcohol_cost_eur,old.alcohol_cost_eur);
    for(const key of ['mood','energy','sleep_hours','note','trigger_tags','craving'])assert.deepEqual(saved[key],old[key]);
    const update=dailyWrites(mock).at(-1);
    assert.ok(update.filters.some(([key,val])=>key==='drink_details'&&val===JSON.stringify(old.drink_details)));
  });

  await check('editing','correcting status to sober preserves purchases while clearing alcohol and saving zero craving',async()=>{
    await reset('editing');const old=clone(row(mock,'2026-10-26'));
    const target=await openDate('2026-10-26');await value(target,'sober_today','true');await value(target,'craving','0');
    assert.equal(target.elements.alcohol_cost_eur.disabled,false);assert.equal(target.elements.alcohol_cost_eur.value,'11.5');
    await submit(target);assert.equal($('#modal').open,false,txt('#dailyEntryError'));
    const saved=row(mock,'2026-10-26');assert.equal(saved.sober_today,true);assert.equal(saved.alcohol_units,0);
    assert.equal(saved.alcohol_cost_eur,11.5);assert.equal(saved.craving,0);assert.equal(saved.drink_details,null);
    for(const key of ['mood','energy','sleep_hours','note','trigger_tags'])assert.deepEqual(saved[key],old[key]);
    assert.equal(Object.hasOwn(dailyWrites(mock).at(-1).payload,'alcohol_cost_eur'),false);
  });

  await check('editing','a concurrent remote edit is refused, retaining the draft and the newer server values',async()=>{
    await reset('editing');const target=await openDate('2026-10-26');
    await value(target,'craving','2');row(mock,'2026-10-26').craving=8;
    await submit(target);assert.equal(form(),target);assert.equal($('#modal').open,true);
    assert.match(txt('#dailyEntryError'),/changé depuis son ouverture/);
    assert.equal(target.elements.craving.value,'2');assert.equal(target.elements.craving.disabled,false);
    assert.equal(row(mock,'2026-10-26').craving,8);assert.equal(row(mock,'2026-10-26').alcohol_units,3);
  });

  await check('editing','a concurrent insert cannot overwrite a day that was absent when the form opened',async()=>{
    await reset();const target=await openToday();await value(target,'sober_today','true');
    const concurrent=savedCheck({id:id(90),checkin_date:today,alcohol_units:4,alcohol_cost_eur:20});
    mock.tables.daily_checkins.push(concurrent);await submit(target);
    assert.equal(form(),target);assert.equal($('#modal').open,true);assert.match(txt('#dailyEntryError'),/changé/);
    assert.equal(mock.tables.daily_checkins.filter(item=>item.checkin_date===today).length,1);
    assert.deepEqual(row(mock),concurrent);assert.equal(target.elements.sober_today.value,'true');
  });

  await check('occasion','canonical consumption locks status and amounts; only craving creates a minimal daily record',async()=>{
    await reset('occasion');const original=clone(documentOf().occasions);const target=await openToday();
    assert.equal(txt('[data-daily-clock-value]'),'20');
    assert.equal($('.daily-entry-status',target).disabled,true);assert.equal(target.elements.sober_today.value,'false');
    assert.equal(target.elements.namedItem('alcohol_units'),null);assert.equal(target.elements.namedItem('alcohol_cost_eur'),null);
    assert.match(target.textContent,/2 verres standard/);assert.match(target.textContent,/12 €/);
    await value(target,'craving','0');await submit(target);assert.equal($('#modal').open,false,txt('#dailyEntryError'));
    assert.deepEqual(documentOf().occasions,original);const saved=row(mock);
    assert.equal(saved.sober_today,false);assert.equal(saved.alcohol_units,null);assert.equal(saved.alcohol_cost_eur,null);
    assert.equal(saved.craving,0);assert.equal(day(today).dataset.state,'drinking');
    assert.equal(txt('[data-daily-clock-value]'),'20','An urge note must not invalidate an already declared same-day stop');
    assert.match(txt('[data-daily-clock-unit]'),/minutes sans alcool/);
    assert.equal(mock.calls.filter(call=>call.rpc==='save_journey_timeline').length,0);
  });

  await check('occasion','a conflicting legacy row cannot override the canonical occasion when craving changes',async()=>{
    await reset('occasion',()=>mock.tables.daily_checkins.push(savedCheck({id:id(20),checkin_date:today,sober_today:true,alcohol_units:0,alcohol_cost_eur:22,craving:4})));
    const old=clone(row(mock)),original=clone(documentOf().occasions);const target=await openToday();
    assert.equal(target.elements.sober_today.value,'false');await value(target,'craving','1');await submit(target);
    assert.equal($('#modal').open,false,txt('#dailyEntryError'));assert.deepEqual(row(mock),{...old,craving:1});
    assert.deepEqual(documentOf().occasions,original);assert.equal(day(today).dataset.state,'drinking');
    assert.deepEqual(dailyWrites(mock).at(-1).payload,{craving:1});
  });

  await check('occasion','opening the canonical editor asks before losing an unsaved craving',async()=>{
    await reset('occasion');const target=await openToday();await value(target,'craving','3');
    env.answer(false);await click('[data-daily-entry="edit-occasion"]');assert.equal(form(),target);
    assert.equal(target.elements.craving.value,'3');assert.match(env.confirms.at(-1),/envie.*pas encore enregistrée/);
    env.answer(true);await click('[data-daily-entry="edit-occasion"]');
    assert.ok($('#tlOccasionForm'));assert.equal(form(),null);assert.equal(dailyWrites(mock).length,0);
  });

  await check('records','the journal remains available without placing tasks on home or saving a blank template',async()=>{
    await reset('ritual');assert.equal($('.dy-ritual'),null);assert.equal($('.dy-next-action'),null);
    const count=writes(mock).length;await route('journal');await click('[data-action="journal-new"]');
    const target=$('#journalForm');assert.ok(target);assert.equal(target.elements.entry_date.value,today);
    assert.equal(target.elements.body.value,'');await value(target,'kind','plan');await value(target,'title','Mon plan personnel');
    await submit(target);assert.equal($('#modal').open,true);assert.equal(writes(mock).length,count);
    assert.match(txt('#notice'),/Écris au moins une phrase/);
  });

  await check('records','a real dated plan is saved and edited through Journal without changing the alcohol calendar',async()=>{
    await reset('ritual');await route('journal');await click('[data-action="journal-new"]');const target=$('#journalForm');
    const body='Si l’envie arrive après le travail, je téléphone à mon proche avant de sortir.';
    await value(target,'kind','plan');await value(target,'title','Un plan concret');await value(target,'body',body);
    await submit(target);assert.equal($('#modal').open,false);
    const saved=mock.tables.journal_entries.find(item=>item.entry_date===today&&item.kind==='plan');assert.equal(saved.body,body);
    await click(`[data-action="journal-edit"][data-id="${saved.id}"]`);
    assert.equal($('#journalForm').elements.id.value,saved.id);assert.equal($('#journalForm').elements.body.value,body);
    assert.equal(mock.tables.journal_entries.filter(item=>item.entry_date===today&&item.kind==='plan').length,1);
    await closeModal();await route('home');assert.equal(day(today).dataset.provenance,'unknown');assert.equal($('.dy-ritual'),null);
  });

  await check('records','home benefits expose their sources and a saved feeling never declares alcohol status',async()=>{
    await reset('ritual');const count=writes(mock).length;
    assert.match(txt('.dy-benefit-scope'),/En continuant.*mois/,'Future benefits must not be presented as already acquired');
    assert.match(txt('.dy-benefit-context'),/observés dans les études/);
    await click('.dy-benefit-source');assert.ok($$('#modal a[href^="https://"]').length>0);
    assert.match(txt('#modalContent'),/Population|population/);assert.match(txt('#modalContent'),/Limites|limites/);
    await closeModal();assert.equal(writes(mock).length,count);await click('.dy-main-action');assert.ok($('.hz-page'));
    await click('.hz-hero [data-health-action="checkin"]');const target=$('#healthCheckinForm');assert.ok(target);
    assert.equal(target.elements.checkin_date.value,today);assert.equal($$('input[type="radio"]:checked',target).length,0);
    await value(target,'mood','4');await submit(target);assert.equal($('#modal').open,false,txt('#healthFormError'));
    await route('home');assert.equal(day(today).dataset.provenance,'unknown');
    assert.equal(row(mock),undefined);assert.equal(mock.tables.health_checkins.find(item=>item.checkin_date===today).mood,4);
    assert.equal($('.dy-ritual'),null);
  });

  await check('records','journal, health and daily entry use the journey timezone; midnight preserves an open draft',async()=>{
    await reset('timezone');const date='2026-10-26';assert.equal($('.dy-entry-link').dataset.date,date);
    await route('journal');await click('[data-action="journal-new"]');let target=$('#journalForm');
    assert.equal(target.elements.entry_date.value,date);assert.equal(target.elements.entry_date.max,date);
    await value(target,'kind','plan');await value(target,'title','Mon plan du 26');
    await value(target,'body','Si je rentre fatigué, je prépare une boisson sans alcool.');
    await value(target,'entry_date',today);const count=writes(mock).length;await submit(target);
    assert.equal($('#modal').open,true);assert.equal(writes(mock).length,count);assert.match(txt('#notice'),/date passée ou aujourd/);
    await value(target,'entry_date',date);await submit(target);assert.equal($('#modal').open,false);
    await route('health');await click('.hz-hero [data-health-action="checkin"]');
    assert.equal($('#healthCheckinForm').elements.checkin_date.value,date);await closeModal();await route('home');
    setNow('2026-10-27T06:59:00Z');await env.tick();target=await openToday();
    assert.equal(target.elements.checkin_date.value,date);await value(target,'sober_today','false');await value(target,'alcohol_cost_eur','4');
    setNow('2026-10-27T07:00:00Z');await env.tick();
    assert.equal(form(),target);assert.equal(target.elements.checkin_date.value,date);assert.equal(target.elements.alcohol_cost_eur.value,'4');
    await closeModal();await env.tick();assert.equal($('.dy-entry-link').dataset.date,today);
    assert.ok(mock.tables.journal_entries.some(item=>item.kind==='plan'&&item.entry_date===date));
  });

  await check('privacy','without consent no calendar, daily form or private records are read or disclosed',async()=>{
    await reset('without-consent');assert.equal($('.dy-page'),null);assert.equal(form(),null);
    await route('progress');assert.equal($('#dy-calendar'),null);
    assert.doesNotMatch(txt('#content'),/Bilan fictif QA|Note privée QA|NOTE PRIVÉE/);
    const privateTables=new Set(['daily_checkins','journal_entries','health_checkins','journey_timelines','sobriety_journeys']);
    assert.equal(mock.calls.filter(call=>privateTables.has(call.table)).length,0);
    const before=writes(mock).length,button=document.createElement('button');button.dataset.dailyAction='day';button.dataset.date=today;
    document.body.append(button);button.click();await settle();button.remove();
    assert.equal(form(),null);assert.match(txt('#notice'),/Active ton suivi personnel/);assert.equal(writes(mock).length,before);
  });

  await check('privacy','withdrawing consent clears daily draft and prevents the old controls from saving',async()=>{
    await reset();const oldForm=await openToday();await value(oldForm,'sober_today','false');await value(oldForm,'alcohol_cost_eur','7');
    await closeModal();await route('profile');await click('[data-action="health-consent-withdraw"]');
    await route('home');assert.equal($('.dy-page'),null);assert.equal(form(),null);
    assert.equal($('#modalContent').textContent.includes('Mon point du jour'),false);
    const before=dailyWrites(mock).length;
    oldForm.dispatchEvent(new SubmitEvent('submit',{bubbles:true,cancelable:true}));await settle();
    assert.equal(dailyWrites(mock).length,before);assert.equal(row(mock),undefined);
    assert.doesNotMatch(txt('#content'),/Bilan fictif QA|Note privée QA/);
  });

  await check('privacy','a delayed save after logout cannot populate or close the next account’s workspace',async()=>{
    await reset();const target=await openToday();await value(target,'sober_today','false');await value(target,'craving','6');
    const gate=mock.defer(call=>call.table==='daily_checkins'&&call.op==='insert');
    try{
      await submit(target);assert.equal(gate.used,true);assert.equal(target.getAttribute('aria-busy'),'true');
      await mock.signOut();await mock.signIn({id:UID2});await closeModal();
      const content=$('#content').innerHTML;gate.release();await settle(35);
      assert.equal($('#content').innerHTML,content);assert.equal(form(),null);
      assert.equal(mock.tables.daily_checkins.some(item=>item.user_id===UID2&&item.checkin_date===today),false);
      assert.doesNotMatch(txt('#content'),/NOTE PRIVÉE|Bilan fictif QA|Mon point est enregistré/);
    }finally{gate.release();}
  });

  await check('modes','a reduction goal uses recorded days instead of an abstinence clock and keeps the free calendar',async()=>{
    await reset('reduce');assert.ok($('.dy-focus-observe'));assert.equal($('[data-daily-clock-value]'),null);
    assert.equal($('[data-daily-cap-title]'),null);assert.equal($('.dy-cap-track'),null);
    assert.match(txt('.dy-focus-observe'),/jours renseignés/);assert.match(txt('.dy-focus-observe'),/RÉDUIRE/);
    assert.equal(document.documentElement.dataset.premium,'false');await route('progress');assert.ok($('#dy-calendar'));
    const target=await openDate('2026-10-25');assert.equal($$('input[name="sober_today"]:checked',target).length,0);
  });

  await check('modes','Premium retains the same daily calendar and all original menu destinations',async()=>{
    await reset('premium');assert.equal(document.documentElement.dataset.premium,'true');
    await route('progress');assert.ok($('#dy-calendar'));assert.ok($('.tl-heading [data-tl-action="occasion"]'));
    for(const page of ['home','journey','progress','health','journal','games','community','profile'])assert.ok($(`#nav [data-page="${page}"]`),`Menu ${page} must remain available`);
    assert.ok($('#nav [data-move="open"]'));
    await click('#dy-calendar [data-daily-action="day"][data-date="2026-10-26"]');assert.ok(form());
  });

}finally{
  await closeModal().catch(()=>{});env.close();
}

for(const group of selected?[selected]:groups){
  const rows=results.filter(result=>result.group===group);
  console.log(`DAILY DOM [${group}]: ${rows.filter(row=>row.pass).length}/${rows.length} passed`);
}
const passed=results.filter(result=>result.pass).length;
console.log(`DAILY DOM SCENARIOS: ${passed}/${results.length} passed`);
if(!results.length||passed!==results.length||env.errors.length){
  if(env.errors.length)console.error(`Runtime errors after ${currentGroup}:\n${env.errors.join('\n')}`);
  process.exitCode=1;
}
