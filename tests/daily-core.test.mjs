import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyOverview,DAILY_CAPS} from '../daily-core.mjs';
import {timelineSnapshot,timelineStopBasis} from '../timeline-core.mjs';
import {localDateTime,zonedDateTimeToInstant} from '../time-core.mjs';
import {moveDay} from '../core.mjs';

const today='2026-10-27',now='2026-10-27T12:30:00Z';
const id=n=>`00000000-0000-4000-8000-${n.toString(16).padStart(12,'0')}`;
const event=(date,state='abstinent',n=1)=>({id:id(n),started_on:date,state,units_week:state==='abstinent'?0:14,cost_week:state==='abstinent'?0:35,note:''});
const document=(start=moveDay(today,-10),mode='abstain')=>({
  schema_version:3,timezone:'Europe/Paris',baseline:{started_on:'2020-01-01',units_week:14,cost_week:70},
  events:[event(start)],occasions:[],ranges:[],
  goal:{mode,weekly_limit:null,daily_limit:null,target_on:null,why:'Mon intention permanente',triggers:[],support_first:false,planned_action:'Préparer une activité calme'},
});
function clock(doc,instant,checks=[]){
  const row=doc.events.at(-1);row.started_on=localDateTime(instant,doc.timezone).date;row.stopped_at=instant;
  row.stop_basis=timelineStopBasis(doc,checks,row.started_on);return doc;
}
const overview=(doc=document(),extra={})=>dailyOverview({document:doc,today,now,...extra});

test('twenty real minutes give a duration, not an acquired daily cap',()=>{
  const doc=clock(document(today),'2026-10-27T12:10:00Z'),result=overview(doc);
  assert.equal(result.journey.active,true);assert.equal(result.journey.precision,'minute');
  assert.equal(result.journey.elapsedMinutes,20);assert.equal(result.journey.currentStreak,0);
  assert.equal(result.currentCap,null);assert.equal(result.nextCap.days,1);
  assert.equal(result.nextCap.remainingMinutes,1420);
  assert.equal(result.nextCap.targetAt,'2026-10-28T12:10:00.000Z');
  assert.ok(result.caps.every(cap=>!cap.reached));
  assert.deepEqual(DAILY_CAPS.map(cap=>cap.days),[1,3,7,14,30,60,90,180,365]);
});

test('exact caps follow elapsed time, with only the next cap offered',()=>{
  const startedAt=new Date(Date.parse(now)-7*86400000-60000).toISOString();
  const result=overview(clock(document(),startedAt));
  assert.equal(result.currentCap.days,7);assert.equal(result.nextCap.days,14);
  assert.equal(result.nextCap.remainingMinutes,7*1440-1);
  assert.equal(result.nextCap.approx,false);
  const last=overview(clock(document(),new Date(Date.parse(now)-365*86400000).toISOString()));
  assert.equal(last.currentCap.days,365);assert.equal(last.nextCap,null);
});

test('unknown stop hours remain approximate and day zero does not earn the one-day cap',()=>{
  const first=overview(document(today));
  assert.equal(first.journey.precision,'day');assert.equal(first.journey.days,0);
  assert.equal(first.currentCap,null);assert.equal(first.nextCap.days,1);
  assert.equal(first.nextCap.targetAt,null);assert.equal(first.nextCap.targetDate,'2026-10-28');
  assert.equal(first.nextCap.remainingMinutes,null);assert.equal(first.nextCap.approx,true);
  const later=overview(document(moveDay(today,-10)));
  assert.equal(later.currentCap.days,7);assert.equal(later.nextCap.days,14);
  assert.equal(later.nextCap.targetDate,'2026-10-31');assert.equal(later.journey.elapsedMinutes,null);
});

test('a clock confirmed after same-day drinking coexists with the declared drinking day',()=>{
  const doc=document(today);doc.occasions=[{id:id(2),date:today,units:2,cost:10}];
  clock(doc,'2026-10-27T12:10:00Z');
  const result=overview(doc),day=result.week.days.at(-1);
  assert.equal(result.journey.elapsedMinutes,20);assert.equal(result.journey.active,true);
  assert.equal(day.state,'drinking');assert.equal(day.provenance,'declared');
  assert.equal(result.ritual.consumption.completed,true);assert.equal(result.ritual.consumption.partial,true);
  assert.equal(result.journey.totalSoberDays,0);
  assert.equal(result.week.completedDeclaredAbstinentDays,0);
});

test('a newly added occasion invalidates an old caller snapshot without deleting past notes',()=>{
  const doc=clock(document(),'2026-10-20T12:30:00Z');
  const old=timelineSnapshot(doc,[],today,now);
  assert.equal(old.stopClock.valid,true);
  doc.occasions.push({id:id(2),date:today,units:2,cost:12});
  const healthRows=[{checkin_date:today,mood:3}];
  const result=overview(doc,{snapshot:old,healthRows});
  assert.equal(result.journey.active,false);assert.equal(result.currentCap,null);assert.equal(result.nextCap,null);
  assert.equal(result.snapshot.stopClock.valid,false);assert.equal(old.stopClock.valid,true);
  assert.equal(result.ritual.feelings.completed,true);assert.ok(result.journey.totalSoberDays>0);
});

test('reduction, observation and resumption do not receive an abstinence target',()=>{
  for(const mode of ['reduce','observe']){
    const result=overview(document(moveDay(today,-10),mode));
    assert.equal(result.journey.hasDeclaredStop,true);
    assert.equal(result.journey.active,false);assert.equal(result.journey.elapsedMinutes,null);
    assert.equal(result.currentCap,null);assert.equal(result.nextCap,null);
    assert.ok(result.caps.every(cap=>cap.state==='information'));
    assert.equal('completed' in result.ritual.intention,false);
    assert.equal(result.ritual.plan.completed,false);
  }
  const resumed=document();resumed.events.push(event(moveDay(today,-2),'drinking',2));
  const result=overview(resumed);
  assert.equal(result.journey.status,'no-current-stop');assert.equal(result.nextCap,null);
  assert.ok(result.journey.totalSoberDays>0);
});

test('a week distinguishes declared status from estimates, even with mixed budget provenance',()=>{
  const doc=document('2026-10-21');doc.events[0].cost_week=7;
  doc.occasions=[{id:id(2),date:'2026-10-25',units:2,cost:5}];
  const checks=[{checkin_date:'2026-10-23',sober_today:true},{checkin_date:'2026-10-24',sober_today:false,alcohol_units:null}];
  const {week,calendar}=overview(doc,{checks});
  assert.equal(week.start,'2026-10-21');assert.equal(week.end,today);assert.equal(week.totalDays,7);
  assert.equal(week.closedDays,6);assert.equal(week.declaredDays,3);assert.equal(week.estimatedDays,3);assert.equal(week.unknownDays,1);
  assert.equal(week.coverageLabel,'3/7 jours renseignés');assert.equal(week.todayDeclared,false);assert.equal(week.todayPartial,true);
  const declared=week.days.find(day=>day.date==='2026-10-23');
  assert.equal(declared.statusSource,'legacy');assert.equal(declared.costSource,'period');
  assert.equal(declared.provenance,'declared');assert.equal(declared.state,'abstinent');
  assert.equal(week.days.find(day=>day.date==='2026-10-24').units,null);
  assert.equal(week.days.at(-1).state,'unknown');
  const baseline=calendar.days.find(day=>day.date==='2026-10-10');
  assert.equal(baseline.provenance,'unknown');assert.equal(baseline.state,'unknown');
  assert.equal(baseline.unitsSource,'baseline');
});

test('a declaration today counts as recorded, while the day and its sober-day total remain unfinished',()=>{
  const checks=[{checkin_date:today,sober_today:true,mood:3,craving:0}];
  const result=overview(document(today),{checks});
  assert.equal(result.week.declaredDays,1);assert.equal(result.week.declaredClosedDays,0);
  assert.equal(result.week.declaredAbstinentDays,1);assert.equal(result.week.completedDeclaredAbstinentDays,0);
  assert.equal(result.ritual.consumption.completed,true);assert.equal(result.journey.totalSoberDays,0);
  assert.equal(result.week.days.at(-1).partial,true);
});

test('daily review actions target the explicit daily form rather than the legacy mood-required form',()=>{
  const result=overview(document(),{checks:[{checkin_date:today,sober_today:true}]});
  const action={channel:'daily-entry',method:'open',args:[today]};
  assert.deepEqual(result.actions.review,action);
  assert.deepEqual(result.week.days.at(-1).actions.review,action);
  assert.deepEqual(result.week.days.at(-1).actions.editSource,action);
});

test('calendar months are actual calendar months with inert future dates and Monday positioning',()=>{
  const current=overview(document());
  assert.equal(current.calendar.start,'2026-10-01');assert.equal(current.calendar.end,'2026-10-31');
  assert.equal(current.calendar.totalDays,31);assert.equal(current.calendar.futureDays,4);
  assert.equal(current.calendar.leadingDays,3);assert.equal(current.calendar.canNext,false);
  for(const day of current.calendar.days.filter(day=>day.future)){
    assert.equal(day.provenance,'future');assert.equal(day.actions,null);assert.equal(day.units,null);
  }
  const leap=overview(document(),{month:'2024-02'});
  assert.equal(leap.calendar.end,'2024-02-29');assert.equal(leap.calendar.days.length,29);
  assert.equal(leap.calendar.canNext,true);
  const future=overview(document(),{month:'2026-11'});
  assert.equal(future.calendar.futureDays,30);assert.equal(future.calendar.declaredDays,0);
});

test('DST changes do not turn a 23-hour interval into an acquired 24-hour cap',()=>{
  const date='2026-03-29',instant='2026-03-29T10:00:00Z';
  const doc=clock(document('2026-03-28'),'2026-03-28T11:00:00Z');
  const result=overview(doc,{today:date,now:instant});
  assert.equal(result.journey.currentStreak,1);assert.equal(result.journey.days,0);
  assert.equal(result.journey.elapsedMinutes,23*60);assert.equal(result.currentCap,null);
  assert.equal(result.nextCap.remainingMinutes,60);
  assert.equal(result.nextCap.targetAt,'2026-03-29T11:00:00.000Z');
  assert.deepEqual(result.week.days.map(day=>day.date),Array.from({length:7},(_,index)=>moveDay(date,index-6)));
});

test('before timeline setup, existing actual daily records remain visible without an invented start or savings',()=>{
  const checks=[{checkin_date:moveDay(today,-1),sober_today:true},{checkin_date:today,alcohol_cost_eur:0}];
  const result=overview(null,{checks});
  assert.equal(result.hasTimeline,false);assert.equal(result.journey.status,'setup');assert.equal(result.nextCap,null);
  assert.equal(result.week.declaredDays,1);assert.equal(result.week.days.at(-2).state,'abstinent');
  assert.equal(result.week.days.at(-1).state,'unknown');assert.equal(result.ritual.consumption.completed,false);
  assert.equal(result.savings.available,false);assert.equal(result.savings.value,null);
});

test('only a saved plan for today completes planning, never an ongoing goal or an unrelated reflection',()=>{
  const unrelated=[
    {id:id(2),entry_date:today,kind:'reflection',body:'Une réflexion'},
    {id:id(3),entry_date:moveDay(today,-1),kind:'plan',body:'Hier'},
    {id:id(4),entry_date:moveDay(today,1),kind:'plan',body:'Demain'},
    {entry_date:today,kind:'plan',body:'Brouillon sans identité'},
  ];
  assert.equal(overview(document(),{journal:unrelated}).ritual.plan.completed,false);
  const older={id:id(5),entry_date:today,kind:'plan',title:'Mon intention',body:'Mon action',created_at:'2026-10-27T08:00:00Z'};
  const newer={...older,id:id(6),body:'Mon plan ajusté',created_at:'2026-10-27T10:00:00Z'};
  const result=overview(document(),{journal:[...unrelated,newer,older]});
  assert.equal(result.ritual.plan.completed,true);assert.equal(result.ritual.plan.count,2);
  assert.equal(result.ritual.plan.id,newer.id);assert.equal(result.ritual.plan.body,newer.body);
  assert.equal(result.ritual.intention.kind,'ongoing-goal');assert.equal('completed' in result.ritual.intention,false);
  assert.equal(result.actions.plan.action,'journal-edit');assert.equal(result.actions.plan.id,newer.id);
});

test('real mood and energy can merge with health notes but feelings never declare an alcohol-free day',()=>{
  const checks=[{checkin_date:today,mood:4,energy:3}];
  const healthRows=[{checkin_date:today,mood:null,anxiety:2},{checkin_date:moveDay(today,1),mood:5}];
  const result=overview(document(today),{checks,healthRows});
  assert.equal(result.ritual.feelings.completed,true);
  assert.deepEqual(result.ritual.feelings.metrics,[{key:'mood',value:4},{key:'energy',value:3},{key:'anxiety',value:2}]);
  assert.equal(result.ritual.consumption.completed,false);assert.equal(result.week.days.at(-1).state,'unknown');
  assert.equal(overview(document(),{healthRows:[{checkin_date:today,note:'Texte seul'}]}).ritual.feelings.completed,false);
});

test('consumption status is explicit even if quantity is unknown; a bare zero is not abstinence',()=>{
  const drinking=overview(document(),{checks:[{checkin_date:today,sober_today:false,alcohol_units:null}]});
  assert.equal(drinking.ritual.consumption.completed,true);assert.equal(drinking.ritual.consumption.state,'drinking');
  assert.equal(drinking.week.days.at(-1).units,null);
  const zero=overview(document(),{checks:[{checkin_date:today,alcohol_units:0}]});
  assert.equal(zero.ritual.consumption.completed,false);assert.equal(zero.week.days.at(-1).state,'unknown');
  const real=overview(document(),{checks:[{checkin_date:today,alcohol_units:2}]});
  assert.equal(real.ritual.consumption.completed,true);assert.equal(real.ritual.consumption.state,'drinking');
});

test('savings reuse the canonical summary including actual spending today and unavailable reference data',()=>{
  const doc=document(moveDay(today,-2));doc.occasions=[{id:id(2),date:today,units:1,cost:100}];
  const state=timelineSnapshot(doc,[],today,now),result=overview(doc,{snapshot:state});
  assert.equal(result.savings.value,state.summary.saved);assert.equal(result.savings.rawValue,state.summary.saved);
  assert.ok(result.savings.value<0);assert.equal(result.savings.overBudget,true);
  assert.equal(result.savings.todayActualCost,100);assert.equal(result.savings.includesActualToday,true);
  assert.equal(result.savings.source,'timelineSnapshot.summary.saved');
  const fresh=overview(document(today));
  assert.equal(fresh.savings.rawValue,0);assert.equal(fresh.savings.value,null);assert.equal(fresh.savings.status,'unavailable');
});

test('program progress counts real completed steps once and action descriptors preserve existing channels',()=>{
  const program=[
    {step:1,completed_at:'2026-10-26T12:00:00Z'},{step:1,completed_at:'2026-10-26T12:00:00Z'},
    {step:3,completed_at:'2026-10-26T12:00:00Z'},{step:2,completed_at:'2026-10-28T12:00:00Z'},
    {step:31,completed_at:'2026-10-26T12:00:00Z'},{step:4,reflection:'Brouillon'},
  ];
  const result=overview(document(),{program});
  assert.equal(result.program.completedCount,2);assert.equal(result.program.nextStep,2);
  assert.equal(result.program.allComplete,false);assert.equal(result.actions.program.action,'step');
  assert.deepEqual(result.actions.feelings,{channel:'health',action:'checkin',date:today});
  assert.deepEqual(result.actions.consumption,{channel:'progression',method:'openOccasion',args:[today]});
  assert.equal(result.actions.review.channel,'daily-entry');assert.equal(result.actions.review.method,'open');
  assert.equal(Object.hasOwn(result.actions.review,'needsAdapter'),false);
  assert.equal(result.actions.plan.prefill.kind,'plan');assert.equal(result.actions.plan.prefill.entry_date,today);
  assert.equal(result.actions.help.action,'help');assert.equal(result.actions.movement.channel,'movement');
});

test('explicit journey timezone controls targets without inventing an unknown stop hour',()=>{
  const doc=document('2026-10-25');doc.timezone='America/Los_Angeles';
  clock(doc,zonedDateTimeToInstant('2026-10-25','12:00',doc.timezone));
  const result=overview(doc,{today:'2026-10-26',now:'2026-10-27T00:30:00Z'});
  assert.equal(result.today,'2026-10-26');assert.equal(result.timeZone,'America/Los_Angeles');
  assert.equal(result.week.days.at(-1).date,'2026-10-26');
  assert.equal(result.nextCap.targetDate,'2026-10-28');
  assert.equal(result.nextCap.targetAt,'2026-10-28T19:00:00.000Z');
});

test('the model is deterministic, detached and rejects invalid explicit dates or instants',()=>{
  const doc=document(),checks=[{checkin_date:today,sober_today:true,mood:4,craving:0}],journal=[{id:id(4),entry_date:today,kind:'plan',title:'Titre',body:'Plan'}];
  const input={document:doc,today,now,checks,journal},before=JSON.stringify(input);
  const first=dailyOverview(input),second=dailyOverview(input);
  assert.deepEqual(first,second);assert.equal(JSON.stringify(input),before);
  first.snapshot.current.event.note='changed';assert.equal(doc.events[0].note,'');
  first.actions.plan.id='changed';assert.equal(journal[0].id,id(4));
  for(const change of [{today:'2026-02-30'},{month:'2026-13'},{month:'1899-12'},{now:'2026-10-27T12:30'},{now:undefined}]){
    assert.throws(()=>dailyOverview({...input,...change}));
  }
});
