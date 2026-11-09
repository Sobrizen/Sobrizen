import assert from 'node:assert/strict';
import {test} from 'node:test';
import {agendaDate, agendaMoveDay, agendaPeriod, agendaMovePeriod, agendaToday, agendaPayloadFromFields,
  validateAgendaPayload, agendaRecord, agendaItemsInPeriod, agendaItemDates, createAgendaStore,
  exportAgendaIcs, foldAgendaIcsLine} from '../agenda-core.mjs';

const UID='11111111-1111-4111-8111-111111111111', OTHER='22222222-2222-4222-8222-222222222222';
const ID='a0000000-0000-4000-8000-000000000001', NOW='2026-11-09T08:00:00.000Z';
const task=overrides=>({kind:'task',category:'personal',title:'Une priorité',notes:'',item_date:'2026-11-09',all_day:true,time_zone:'Europe/Paris',starts_at:null,ends_at:null,status:'open',goal_target:null,goal_current:null,goal_unit:'',...overrides});
const row=overrides=>({...task(),id:ID,user_id:UID,version:1,created_at:NOW,updated_at:NOW,...overrides});
const timed=overrides=>({kind:'appointment',category:'work',title:'Un rendez-vous',notes:'',item_date:'2026-11-09',end_date:'2026-11-09',start_time:'09:00',end_time:'10:00',time_zone:'Europe/Paris',status:'open',...overrides});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};

function harness(initial=[]) {
  const S={user:{id:UID},demo:false}, calls=[], hooks={}, data=initial.map(x=>({...x})); let revision=0,premium=true,changes=0;
  const api={S,now:()=>new Date(NOW),isPremium:()=>premium,sessionContext:()=>({user:S.user,demo:S.demo,revision}),sameSession:c=>c.user===S.user&&c.demo===S.demo&&c.revision===revision,onChange:()=>changes++};
  const db={
    from(table){const q={table,limit:200,cursor:null,uid:null};const chain={select(){return chain;},eq(key,value){assert.equal(key,'user_id');q.uid=value;return chain;},order(key,opts){assert.equal(key,'id');assert.equal(opts.ascending,true);return chain;},limit(n){q.limit=n;return chain;},gt(key,value){assert.equal(key,'id');q.cursor=value;return chain;},then(resolve,reject){calls.push({...q});const snapshot=data.filter(r=>r.user_id===q.uid&&(!q.cursor||r.id>q.cursor)).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,q.limit).map(x=>({...x}));return Promise.resolve(hooks.query?.(snapshot,q)??snapshot).then(resolve,reject);}};return chain;},
    async rpc(name,p){calls.push({rpc:name,p});if(hooks.rpc)return hooks.rpc(name,p);const index=data.findIndex(x=>x.id===p.p_id&&x.user_id===S.user.id),existing=data[index];
      if(name==='delete_agenda_item'){if(existing?.version!==p.p_expected_version)throw {code:'PT409'};data.splice(index,1);return p.p_id;}
      if((existing?.version??null)!==p.p_expected_version)throw {code:'PT409'};
      const saved={...p.p_payload,id:p.p_id,user_id:S.user.id,version:(p.p_expected_version||0)+1,created_at:existing?.created_at||NOW,updated_at:NOW};
      if(index<0)data.push(saved);else data[index]=saved;return {...saved};
    },
  };
  api.accountRequest=run=>run(db,S.user?.id);
  const store=createAgendaStore(api);
  return {store,S,calls,hooks,data,api,get changes(){return changes;},setPremium:v=>{premium=v;},switchUser:()=>{revision++;S.user={id:OTHER};}};
}

test('civil deadlines reject normalized invalid dates and keep their date in remote zones',()=>{
  assert.equal(agendaDate('2028-02-29'),'2028-02-29');
  for(const invalid of ['2026-02-29','2026-02-31','2026-13-01','2026-1-01','1899-12-31','2200-01-01',''])assert.throws(()=>agendaDate(invalid));
  assert.equal(agendaMoveDay('2026-03-28',2),'2026-03-30');
  assert.deepEqual(agendaItemDates(row(), 'Pacific/Kiritimati'),{start:'2026-11-09',end:'2026-11-09'});
  assert.equal(agendaToday('America/Los_Angeles',new Date('2026-11-09T03:00:00Z')),'2026-11-08');
});
test('week/month navigation includes leap days and clips the final supported week',()=>{
  assert.deepEqual(agendaPeriod('2028-02-29','month'),{start:'2028-02-01',end:'2028-02-29'});
  assert.deepEqual(agendaPeriod('2026-11-15','week'),{start:'2026-11-09',end:'2026-11-15'});
  assert.equal(agendaMovePeriod('2026-01-31','month',1),'2026-02-01');
  assert.equal(agendaPeriod('2199-12-31','week').end,'2199-12-31');
});
test('validation rejects hidden times, invalid categories, blank titles and inconsistent goals',()=>{
  assert.equal(validateAgendaPayload(task({title:'  Mon projet  '})).title,'Mon projet');
  for(const patch of [{title:'   '},{category:'admin'},{title:'x'.repeat(121)},{notes:'x'.repeat(2001)},{time_zone:'No/SuchZone'},{all_day:false},{starts_at:NOW},{goal_target:1},{status:'cancelled'}]) assert.throws(()=>validateAgendaPayload(task(patch)));
  assert.throws(()=>validateAgendaPayload(task({title:'abc\u0000def'})));
  assert.throws(()=>validateAgendaPayload(task({kind:'goal',goal_target:4,goal_current:5})));
  assert.throws(()=>validateAgendaPayload(task({kind:'goal',goal_target:'',goal_current:0})));
  assert.throws(()=>validateAgendaPayload(task({kind:'goal',goal_target:4.1,goal_current:0})));
});
test('goal completion follows the actual progress and does not mutate input',()=>{
  const input=task({kind:'goal',goal_target:3,goal_current:3,goal_unit:'pauses'}), result=validateAgendaPayload(input);
  assert.equal(result.status,'done');assert.equal(input.status,'open');
  assert.equal(validateAgendaPayload({...input,goal_current:2,status:'done'}).status,'open');
});
test('appointments reject nonexistent DST wall time before persisting',()=>{
  assert.throws(()=>agendaPayloadFromFields(timed({item_date:'2026-03-29',end_date:'2026-03-29',start_time:'02:30',end_time:'03:30'})),e=>e.code==='TIME_NONEXISTENT'&&e.field==='start_time');
  assert.throws(()=>agendaPayloadFromFields(timed({item_date:'2026-10-04',end_date:'2026-10-04',start_time:'02:15',end_time:'03:30',time_zone:'Australia/Lord_Howe'})),e=>e.code==='TIME_NONEXISTENT');
});
test('repeated DST hours require a choice, then preserve the chosen UTC instant',()=>{
  const fields=timed({item_date:'2026-10-25',end_date:'2026-10-25',start_time:'02:30',end_time:'03:30'});
  assert.throws(()=>agendaPayloadFromFields(fields),e=>e.code==='TIME_AMBIGUOUS'&&e.field==='start_occurrence');
  const earlier=agendaPayloadFromFields({...fields,start_occurrence:'earlier'}), later=agendaPayloadFromFields({...fields,start_occurrence:'later'});
  assert.equal(earlier.starts_at,'2026-10-25T00:30:00.000Z');assert.equal(later.starts_at,'2026-10-25T01:30:00.000Z');
  assert.equal(Date.parse(earlier.ends_at)-Date.parse(earlier.starts_at),2*3600000);
});
test('end time, overnight spans and upper duration bound are explicit',()=>{
  assert.throws(()=>agendaPayloadFromFields(timed({end_time:'08:00'})),e=>e.field==='end_time');
  assert.throws(()=>agendaPayloadFromFields(timed({end_date:'2026-11-17'})),e=>e.field==='end_time');
  const overnight=agendaPayloadFromFields(timed({start_time:'23:30',end_date:'2026-11-10',end_time:'00:00'}));
  assert.deepEqual(agendaItemDates(overnight,'Europe/Paris'),{start:'2026-11-09',end:'2026-11-09'});
  assert.deepEqual(agendaItemDates({...overnight,ends_at:'2026-11-09T23:30:00Z'},'Europe/Paris'),{start:'2026-11-09',end:'2026-11-10'});
  const historical=agendaPayloadFromFields(timed({item_date:'1900-01-01',end_date:'1900-01-01'}));
  assert.equal(historical.starts_at,'1900-01-01T08:50:39.000Z');
});
test('filters and calendar overlap use the display zone without moving date-only deadlines',()=>{
  const appointment=row({...agendaPayloadFromFields(timed({start_time:'00:30',end_time:'01:30'})),id:ID});
  const deadline=row({id:'a0000000-0000-4000-8000-000000000002'});
  assert.equal(agendaItemsInPeriod([appointment,deadline],{start:'2026-11-08',end:'2026-11-08'},'America/New_York').length,1);
  assert.equal(agendaItemsInPeriod([appointment,deadline],{start:'2026-11-09',end:'2026-11-09'},'America/New_York',{kind:'task'}).length,1);
  assert.equal(agendaItemsInPeriod([appointment,deadline],{start:'2026-11-09',end:'2026-11-09'},'Europe/Paris',{category:'wellbeing'}).length,0);
});
test('persisted records reject foreign ownership, missing versions and inconsistent status',()=>{
  assert.throws(()=>agendaRecord(row({user_id:OTHER}),UID));assert.throws(()=>agendaRecord(row({version:0}),UID));
  assert.throws(()=>agendaRecord(row({kind:'goal',goal_target:2,goal_current:2,status:'open'}),UID));
});
test('ICS uses UTC for timed events, exclusive all-day end, private class and task completion',()=>{
  const event=row({...agendaPayloadFromFields(timed()),title:'Café, équipe; projet',notes:'Une ligne\nBEGIN:VEVENT'});
  const allDay=row({kind:'appointment',item_date:'2199-12-31',id:'a0000000-0000-4000-8000-000000000002'});
  const goal=row({kind:'goal',goal_target:4,goal_current:4,goal_unit:'étapes',status:'done',id:'a0000000-0000-4000-8000-000000000003'});
  const text=exportAgendaIcs([event,allDay,goal],new Date(NOW));
  assert.ok(text.includes('DTSTART:20261109T080000Z\r\nDTEND:20261109T090000Z'));
  assert.ok(text.includes('DTEND;VALUE=DATE:22000101'));assert.ok(text.includes('SUMMARY:Café\\, équipe\\; projet'));
  assert.ok(text.includes('DESCRIPTION:Une ligne\\nBEGIN:VEVENT'));assert.equal(text.split('\r\n').filter(line=>line==='BEGIN:VEVENT').length,2);
  assert.ok(text.includes('STATUS:COMPLETED\r\nPERCENT-COMPLETE:100'));assert.ok(text.endsWith('END:VCALENDAR\r\n'));
  assert.equal(text.includes('VALARM'),false);
});
test('ICS folding counts UTF-8 bytes without splitting accented letters or emoji',()=>{
  const original='SUMMARY:'+('é🪴'.repeat(55)), folded=foldAgendaIcsLine(original);
  assert.equal(folded.replaceAll('\r\n ',''),original);
  for(const line of folded.split('\r\n'))assert.ok(Buffer.byteLength(line,'utf8')<=75);
});
test('store CRUD waits for the server, uses the owning account and CAS version',async()=>{
  const h=harness();await h.store.load();
  const saved=await h.store.save(task(),{id:ID});assert.equal(saved.version,1);
  const update=await h.store.save({...saved,title:'Titre modifié'},{id:ID,expectedVersion:1});assert.equal(update.version,2);
  assert.equal(h.store.snapshot().rows[0].title,'Titre modifié');
  await h.store.remove(ID,2);assert.equal(h.store.snapshot().rows.length,0);
  assert.deepEqual(h.calls.filter(c=>c.rpc).map(c=>c.rpc),['save_agenda_item','save_agenda_item','delete_agenda_item']);
  assert.equal(h.calls[0].uid,UID);
});
test('paginated loading uses a stable owner-filtered UUID cursor without dropping older rows',async()=>{
  const rows=Array.from({length:403},(_,i)=>row({id:`a0000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`})),h=harness(rows);
  assert.equal(await h.store.load(),true);assert.equal(h.store.snapshot().rows.length,403);assert.equal(h.calls.length,3);
  assert.equal(h.calls[1].cursor,rows[199].id);assert.equal(h.calls[2].cursor,rows[399].id);
});
test('stale reads after a session switch never appear in the next account',async()=>{
  const h=harness([row()]),wait=deferred();h.hooks.query=()=>wait.promise;const pending=h.store.load();
  await Promise.resolve();h.switchUser();wait.resolve([row()]);assert.equal(await pending,false);
  assert.equal(h.store.snapshot().rows.length,0);assert.equal(h.store.snapshot().ready,false);
});
test('stale write responses after logout/session switch cannot repopulate cache',async()=>{
  const h=harness(),wait=deferred();h.hooks.rpc=()=>wait.promise;const pending=h.store.save(task(),{id:ID});
  h.switchUser();wait.resolve(row());await assert.rejects(pending,e=>e.code==='AGENDA_SESSION_CHANGED');
  assert.equal(h.store.snapshot().rows.length,0);
});
test('concurrent load cannot roll a successful mutation back to an old version',async()=>{
  const h=harness([row()]);await h.store.load();const wait=deferred();h.hooks.query=()=>wait.promise;
  const loading=h.store.load();await Promise.resolve();await h.store.save(task({title:'Nouveau titre'}),{id:ID,expectedVersion:1});
  wait.resolve([row()]);assert.equal(await loading,false);assert.equal(h.store.snapshot().rows[0].title,'Nouveau titre');
});
test('load started during a save cannot replace the confirmed creation or update with its earlier snapshot',async()=>{
  for(const initial of [[],[row()]]){
    const h=harness(initial);await h.store.load();const write=deferred(),read=deferred(),readStarted=deferred();
    h.hooks.rpc=()=>write.promise;
    const expectedVersion=initial.length?1:null,saved=row({title:'Nouveau titre',version:(expectedVersion||0)+1});
    const saving=h.store.save(task({title:saved.title}),{id:ID,expectedVersion});
    h.hooks.query=snapshot=>{readStarted.resolve(snapshot);return read.promise;};
    const loading=h.store.load(),oldSnapshot=await readStarted.promise;
    write.resolve(saved);assert.deepEqual(await saving,saved);
    read.resolve(oldSnapshot);const loadAccepted=await loading;
    assert.deepEqual(h.store.snapshot().rows,[saved]);assert.equal(loadAccepted,false);assert.equal(h.store.snapshot().loading,false);
    assert.equal(h.store.snapshot().pending.size,0);
  }
});
test('load started during a delete cannot restore the confirmed deleted item from its earlier snapshot',async()=>{
  const h=harness([row()]);await h.store.load();const write=deferred(),read=deferred(),readStarted=deferred();
  h.hooks.rpc=()=>write.promise;const removing=h.store.remove(ID,1);
  h.hooks.query=snapshot=>{readStarted.resolve(snapshot);return read.promise;};
  const loading=h.store.load(),oldSnapshot=await readStarted.promise;
  write.resolve(ID);assert.equal(await removing,true);
  read.resolve(oldSnapshot);const loadAccepted=await loading;
  assert.deepEqual(h.store.snapshot().rows,[]);assert.equal(loadAccepted,false);assert.equal(h.store.snapshot().loading,false);
  assert.equal(h.store.snapshot().pending.size,0);
});
test('write failures and optimistic conflicts keep the last confirmed state',async()=>{
  const h=harness([row()]);await h.store.load();h.hooks.rpc=()=>{throw {code:'PT409',message:'changed'};};
  await assert.rejects(h.store.save(task({title:'Brouillon'}),{id:ID,expectedVersion:1}),e=>e.code==='PT409');
  assert.equal(h.store.snapshot().rows[0].title,'Une priorité');assert.equal(h.store.snapshot().pending.size,0);
});
test('free access can still read and delete its data but cannot create or edit',async()=>{
  const h=harness([row()]);h.setPremium(false);assert.equal(await h.store.load(),true);
  await assert.rejects(h.store.save(task(),{id:ID,expectedVersion:1}),e=>e.code==='42501');
  assert.equal(h.calls.filter(c=>c.rpc).length,0);await h.store.remove(ID,1);assert.equal(h.data.length,0);
});
test('duplicate submissions are suppressed and unconfirmed payloads are rejected',async()=>{
  const h=harness(),wait=deferred();h.hooks.rpc=()=>wait.promise;const pending=h.store.save(task(),{id:ID});
  await assert.rejects(h.store.save(task(),{id:ID}),/déjà en cours/);assert.equal(h.calls.length,1);
  wait.resolve(row({title:'Un autre titre'}));await assert.rejects(pending,e=>e.code==='AGENDA_RESPONSE_INVALID');
  assert.equal(h.store.snapshot().rows.length,0);
});
test('missing schema produces an explicit unavailable state rather than an empty ready agenda',async()=>{
  const h=harness();h.hooks.query=()=>{throw {code:'PGRST205'};};
  assert.equal(await h.store.load(),false);const state=h.store.snapshot();assert.equal(state.ready,false);assert.match(state.error,/pas encore activé/);
});
test('fictitious demo supports local CRUD and never sends account requests',async()=>{
  const h=harness();h.S.demo=true;h.setPremium(false);h.store.seedDemo('Europe/Paris');
  assert.equal(h.store.snapshot().rows.length,6);assert.equal(h.calls.length,0);
  const current=h.store.snapshot().rows[1];await h.store.save({...current,status:'done'},{id:current.id,expectedVersion:1});
  await h.store.remove(current.id,2);assert.equal(h.calls.length,0);assert.equal(h.store.snapshot().rows.length,5);
  h.store.reset();assert.equal(h.store.snapshot().rows.length,0);
});
