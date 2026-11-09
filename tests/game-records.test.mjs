import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_IDS,normalizeGameResult,mergeGameRecord,combineGameRecords,gameRecordLabel} from '../game-records-core.mjs';
import {createGameRecords} from '../game-records.mjs';

const UID='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture({demo=false}={}){
  const S={user:{id:UID},demo};let revision=1,online=true,delaySave=null,delayLoad=null,loseResponse=false;
  const rows=new Map(),receipts=new Set(),calls=[];
  const db={from(table){assert.equal(table,'game_records');let id;
    return {select(){return this;},eq(key,value){assert.equal(key,'user_id');id=value;return this;},async order(){
      calls.push({op:'load',id});const result={data:[...rows.values()].filter(r=>r.user_id===id),error:null};
      if(delayLoad){const gate=delayLoad;delayLoad=null;await gate.promise;}return result;
    }};
  },async rpc(name,p){
    assert.equal(name,'save_game_record');calls.push({op:'save',...p});
    if(!online)return {error:{message:'Offline'}};
    if(p.p_expected_user_id!==S.user.id)return {error:{code:'42501'}};
    const key=S.user.id+':'+p.p_game_id,receipt=S.user.id+':'+p.p_run_id;
    const row=mergeGameRecord(rows.get(key),p.p_game_id,{score:p.p_score,level:p.p_level,timeMs:p.p_time_ms,completed:p.p_completed},{userId:S.user.id,countCompletion:!receipts.has(receipt)});
    if(p.p_completed&&p.p_game_id==='ground')receipts.add(receipt);rows.set(key,row);
    if(loseResponse){loseResponse=false;return {error:{message:'Response lost after commit'}};}
    const result={data:structuredClone(row),error:null};
    if(delaySave){const gate=delaySave;delaySave=null;await gate.promise;}return result;
  }};
  const records=createGameRecords({S,getClient:async()=>db,sessionContext:()=>({id:S.user?.id,demo:S.demo,revision}),sameSession:c=>c.id===S.user?.id&&c.demo===S.demo&&c.revision===revision});
  return {S,records,rows,calls,receipts,offline:()=>{online=false;},online:()=>{online=true;},
    holdSave(){return delaySave=deferred();},holdLoad(){return delayLoad=deferred();},
    loseNextResponse(){loseResponse=true;},
    switchUser(id){revision++;S.demo=false;S.user=id?{id}:null;records.reset();},
  };
}

test('all thirteen activities have a private, intelligible record metric',async()=>{
  const f=fixture();await f.records.load();
  for(const id of GAME_IDS){
    const result=id==='ground'?{score:0,level:0,completed:true}:id==='memory'?{score:28,level:4,timeMs:120000,completed:true}:id==='reaction'?{score:12,level:5,timeMs:350,completed:true}:{score:42,level:2,completed:true};
    assert.equal((await f.records.save(f.records.begin(id),result)).saved,true,id);
    assert.ok(f.records.record(id),id);
    assert.match(f.records.describe(id),id==='ground'?/séance terminée/:/Mon record/);
  }
  assert.equal(f.rows.size,13);assert.equal(f.receipts.size,1);f.records.destroy();
});
test('maxima never decrease and best time never increases with out-of-order responses',()=>{
  const best=mergeGameRecord(null,'reaction',{score:14,level:5,timeMs:230},{userId:UID});
  const older=mergeGameRecord(null,'reaction',{score:8,level:3,timeMs:410},{userId:UID});
  const combined=combineGameRecords(best,older);
  assert.equal(combined.best_score,14);assert.equal(combined.best_time_ms,230);assert.equal(combined.best_level,5);
  assert.throws(()=>combineGameRecords(best,{...older,user_id:OTHER}));
});
test('game results reject impossible, nonfinite and medically meaningless pause scores',()=>{
  for(const score of [-1,NaN,Infinity,1.5,1_000_000_001])assert.throws(()=>normalizeGameResult('snake',{score}));
  assert.throws(()=>normalizeGameResult('reaction',{score:16}));
  assert.throws(()=>normalizeGameResult('memory',{level:4,timeMs:500,completed:false}));
  assert.throws(()=>normalizeGameResult('snake',{score:1,timeMs:400}));
  assert.throws(()=>normalizeGameResult('ground',{score:5,completed:true}));
  assert.match(gameRecordLabel('ground',mergeGameRecord(null,'ground',{completed:true})),/1 séance terminée/);
});
test('repeated finish/close and a network retry count one completed pause',async()=>{
  const f=fixture();const run=f.records.begin('ground');f.offline();
  assert.equal((await f.records.save(run,{completed:true})).saved,false);
  assert.equal(f.records.needsRetry(),true);assert.equal(f.records.record('ground'),null);
  f.online();await f.records.retry();await f.records.save(run,{completed:true});
  assert.equal(f.records.record('ground').completed_sessions,1);assert.equal(f.calls.filter(c=>c.op==='save').length,2);
  assert.equal(f.records.needsRetry(),false);f.records.destroy();
});
test('simultaneous finish and close share one pending save',async()=>{
  const f=fixture();const run=f.records.begin('ground');const gate=f.holdSave();
  const saving=f.records.save(run,{completed:true});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.rows.get(UID+':ground').completed_sessions,1);
  const duplicate=f.records.save(run,{completed:true});gate.resolve();await Promise.all([saving,duplicate]);
  assert.equal(f.records.record('ground').completed_sessions,1);assert.equal(f.calls.filter(c=>c.op==='save').length,1);f.records.destroy();
});
test('a server success followed by a lost response remains idempotent on retry',async()=>{
  const f=fixture(),run=f.records.begin('ground');f.loseNextResponse();
  assert.equal((await f.records.save(run,{completed:true})).saved,false);
  assert.equal(f.rows.get(UID+':ground').completed_sessions,1);
  await f.records.retry();assert.equal(f.records.record('ground').completed_sessions,1);
  assert.equal(f.calls.filter(c=>c.op==='save').length,2);f.records.destroy();
});
test('a delayed record from account A cannot populate account B after logout',async()=>{
  const f=fixture(),gate=f.holdSave();const run=f.records.begin('snake');
  const saving=f.records.save(run,{score:9,level:2});await new Promise(resolve=>setImmediate(resolve));
  f.switchUser(OTHER);await f.records.load();gate.resolve();
  assert.equal((await saving).stale,true);assert.equal(f.records.record('snake'),null);
  assert.equal(f.rows.has(OTHER+':snake'),false);assert.equal((await f.records.save(run,{score:100})).stale,true);f.records.destroy();
});
test('delayed loading cannot disclose records after account change',async()=>{
  const f=fixture();f.rows.set(UID+':snake',mergeGameRecord(null,'snake',{score:99},{userId:UID}));
  const gate=f.holdLoad(),loading=f.records.load();await new Promise(resolve=>setImmediate(resolve));
  f.switchUser(OTHER);gate.resolve();assert.equal(await loading,false);assert.equal(f.records.record('snake'),null);f.records.destroy();
});
test('a later load snapshot cannot overwrite a record saved while it was pending',async()=>{
  const f=fixture();await f.records.save(f.records.begin('snake'),{score:2});
  const gate=f.holdLoad(),loading=f.records.load();await new Promise(resolve=>setImmediate(resolve));
  await f.records.save(f.records.begin('snake'),{score:8});gate.resolve();await loading;
  assert.equal(f.records.record('snake').best_score,8);f.records.destroy();
});
test('demo records stay in memory and anonymous storage is never imported',async()=>{
  const storage=globalThis.localStorage;globalThis.localStorage={getItem(){throw Error('Anonymous storage must not be read');},setItem(){throw Error('No persistent demo data');}};
  try{
    const f=fixture({demo:true});await f.records.load();await f.records.save(f.records.begin('blocks'),{score:900});
    assert.equal(f.records.record('blocks').best_score,900);assert.equal(f.calls.length,0);
    f.switchUser(UID);await f.records.load();assert.equal(f.records.record('blocks'),null);assert.equal(f.rows.size,0);f.records.destroy();
  }finally{if(storage===undefined)delete globalThis.localStorage;else globalThis.localStorage=storage;}
});
test('a stale session is rejected even if the same account logs in again',async()=>{
  const f=fixture(),run=f.records.begin('snake');f.switchUser(UID);
  assert.equal((await f.records.save(run,{score:30})).stale,true);assert.equal(f.calls.length,0);f.records.destroy();
});
