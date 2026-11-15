import test from 'node:test';
import assert from 'node:assert/strict';
import {formatDay, dateLabel, moveDay} from '../core.mjs';
import {createTimelineReader, timelineStopBasis} from '../timeline-core.mjs';

test('a long history reuses date formatters while keeping each civil date correct across device zones',()=>{
  const Original=Intl.DateTimeFormat,previousZone=process.env.TZ;
  let created=0;
  Intl.DateTimeFormat=new Proxy(Original,{construct(target,args){created++;return Reflect.construct(target,args);}});
  try{
    for(const zone of ['Pacific/Honolulu','Europe/Paris','Pacific/Kiritimati']){
      process.env.TZ=zone;
      assert.equal(dateLabel('2024-02-29'),'29 février 2024');
      assert.equal(formatDay('2026-10-25',{weekday:'long'}),'dimanche');
      for(let i=0;i<500;i++)assert.ok(formatDay(moveDay('2024-01-01',i),{day:'numeric',month:'short'}));
    }
    assert.ok(created<=3,`Created ${created} formatters for a fixed set of three formats`);
    assert.throws(()=>dateLabel('2024-02-30'),/Date invalide/);
  }finally{
    Intl.DateTimeFormat=Original;
    if(previousZone===undefined)delete process.env.TZ;else process.env.TZ=previousZone;
  }
});

test('shared calculations refresh after in-place corrections, new drinking and a new civil day',()=>{
  const today='2026-11-15',checks=[];
  const doc={schema_version:3,timezone:'Europe/Paris',baseline:{started_on:'2026-11-01',units_week:14,cost_week:35},
    events:[{id:'00000000-0000-4000-8000-000000000001',started_on:'2026-11-01',state:'abstinent',units_week:0,cost_week:0,note:'',stopped_at:'2026-11-01T12:00:00.000Z'}],ranges:[],occasions:[],
    goal:{mode:'abstain',weekly_limit:null,daily_limit:null,target_on:null,why:'',triggers:[],support_first:false,planned_action:''}};
  doc.events[0].stop_basis=timelineStopBasis(doc,checks,'2026-11-01');
  let reader=createTimelineReader(doc,checks,today,'2026-11-15T12:00:00Z');
  assert.equal(reader.snapshot().stopClock.valid,true);
  assert.equal(reader.summary('2026-11-01',today).saved,70);
  checks.push({checkin_date:'2026-11-14',sober_today:false,alcohol_units:3,alcohol_cost_eur:12});
  reader=createTimelineReader(doc,checks,today,'2026-11-15T12:00:00Z');
  assert.equal(reader.snapshot().stopClock.valid,false);
  assert.equal(reader.summary('2026-11-01',today).saved,58);
  assert.equal(reader.rows('2026-11-14',today)[0].alcohol_units,3);
  checks[0].alcohol_cost_eur=20;
  reader=createTimelineReader(doc,checks,'2026-11-16','2026-11-16T12:00:00Z');
  assert.equal(reader.summary('2026-11-01','2026-11-16').saved,55);
  assert.equal(reader.snapshot().currentStreak,1);
});
