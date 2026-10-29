import test from 'node:test';
import assert from 'node:assert/strict';
import {trackingAbstinence} from '../community-tracking.mjs';
import {timelineSnapshot,timelineStopBasis,upsertTimelineRange} from '../timeline-core.mjs';
import {moveDay} from '../core.mjs';
import {localDateTime} from '../time-core.mjs';

const today='2026-10-29',now='2026-10-29T12:30:00Z';
const id=n=>`00000000-0000-4000-8000-${n.toString(16).padStart(12,'0')}`;
const event=(n,date,state='abstinent')=>({id:id(n),started_on:date,state,units_week:state==='abstinent'?0:14,cost_week:0,note:''});
const document=(start=moveDay(today,-30),mode='abstain')=>({
  schema_version:3,timezone:'Europe/Paris',baseline:{started_on:'2020-01-01',units_week:14,cost_week:70},
  events:[event(1,start)],occasions:[],ranges:[],
  goal:{mode,weekly_limit:null,daily_limit:null,target_on:null,why:'Raison privée non partagée',triggers:['Stress'],support_first:false,planned_action:'Plan privé non partagé'},
});
function clock(doc,instant,checks=[]){
  const last=doc.events.at(-1);last.started_on=localDateTime(instant,doc.timezone).date;
  last.stopped_at=instant;last.stop_basis=timelineStopBasis(doc,checks,last.started_on);return doc;
}
const read=(doc=document(),checks=[],options={})=>trackingAbstinence({consent:true,ready:true,snapshot:timelineSnapshot(doc,checks,today,now),today,now,...options});

test('uses complete elapsed 24-hour periods when the stop hour is confirmed',()=>{
  const doc=clock(document(),'2026-10-28T13:00:00Z');
  assert.deepEqual(read(doc),{status:'active',days:0,precision:'minute'});
  doc.events[0].stopped_at='2026-10-28T12:30:00Z';
  assert.deepEqual(read(doc),{status:'active',days:1,precision:'minute'});
  // The civil day has changed in both cases; only the second completes 24h.
  assert.equal(timelineSnapshot(doc,[],today,now).currentStreak,1);
});

test('unknown stop hours keep calendar-day precision and an explicit day zero',()=>{
  assert.deepEqual(read(document(moveDay(today,-10))),{status:'active',days:10,precision:'day'});
  assert.deepEqual(read(document(today)),{status:'active',days:0,precision:'day'});
});

test('a confirmed new stop after same-day drinking remains active at zero days',()=>{
  const doc=document(today);doc.occasions=[{id:id(2),date:today,units:2,cost:10}];
  clock(doc,'2026-10-29T12:10:00Z');
  const snapshot=timelineSnapshot(doc,[],today,now);
  assert.equal(snapshot.current.state,'drinking');
  assert.deepEqual(trackingAbstinence({consent:true,ready:true,snapshot,today,now}),{status:'active',days:0,precision:'minute'});
});

test('retrospective drinking replaces a stale minute clock with the effective recent stop',()=>{
  const doc=clock(document(),'2026-09-29T12:30:00Z');
  doc.occasions.push({id:id(2),date:moveDay(today,-10),units:3,cost:12});
  const snapshot=timelineSnapshot(doc,[],today,now);
  assert.equal(snapshot.current.started_on,'2026-09-29');
  assert.equal(snapshot.stopClock.valid,false);
  assert.deepEqual(read(doc),{status:'active',days:9,precision:'day'});
  const ranged=upsertTimelineRange(doc,{...event(3,moveDay(today,-5),'drinking'),ended_on:moveDay(today,-3)},today);
  assert.deepEqual(read(ranged),{status:'active',days:2,precision:'day'});
});

test('a later explicit restart counts the latest stop, never totals or the best period',()=>{
  const doc=document(moveDay(today,-30));
  doc.events.push(event(2,moveDay(today,-10),'drinking'),event(3,moveDay(today,-2)));
  const snapshot=timelineSnapshot(doc,[],today,now);
  assert.ok(snapshot.totalSoberDays>2);assert.ok(snapshot.bestStreak>2);
  assert.deepEqual(read(doc),{status:'active',days:2,precision:'day'});
});

test('current resumed consumption and a new drinking declaration today give no duration',()=>{
  const resumed=document();resumed.events.push(event(2,moveDay(today,-2),'drinking'));
  assert.deepEqual(read(resumed),{status:'no-current-stop',days:null,precision:'unknown'});
  const occasion=clock(document(),'2026-09-29T12:30:00Z');
  occasion.occasions.push({id:id(2),date:today,units:1,cost:0});
  assert.equal(read(occasion).status,'no-current-stop');assert.equal(read(occasion).days,null);
  const checks=[{id:id(4),checkin_date:today,sober_today:false,alcohol_units:2}];
  assert.equal(read(document(),checks).days,null);
});

test('consent, loading and missing setup are distinct; gated private snapshots are not inspected',()=>{
  const guarded={get current(){throw Error('Private data must not be read');}};
  assert.deepEqual(trackingAbstinence({consent:false,ready:true,snapshot:guarded,today,now}),{status:'consent-required',days:null,precision:'unknown'});
  assert.deepEqual(trackingAbstinence({consent:true,ready:false,snapshot:guarded,today,now}),{status:'unavailable',days:null,precision:'unknown'});
  assert.deepEqual(trackingAbstinence({consent:true,ready:true,snapshot:null,today,now}),{status:'missing',days:null,precision:'unknown'});
  assert.equal(read(document(),[],{today:'invalid-date'}).status,'unavailable');
});

test('a current abstinent interval remains valid for reduction and observation goals',()=>{
  for(const mode of ['reduce','observe'])assert.deepEqual(read(document(moveDay(today,-4),mode)),{status:'active',days:4,precision:'day'});
});

test('the shared result exposes only status, days and precision and does not mutate the snapshot',()=>{
  const doc=clock(document(),'2026-09-29T12:30:00Z'),snapshot=timelineSnapshot(doc,[],today,now);
  const before=JSON.stringify(snapshot),result=trackingAbstinence({consent:true,ready:true,snapshot,today,now});
  assert.deepEqual(Object.keys(result).sort(),['days','precision','status']);
  assert.equal(JSON.stringify(snapshot),before);
  assert.equal(JSON.stringify(result).includes('2026-'),false);
  assert.equal(JSON.stringify(result).includes('Raison privée'),false);
});
