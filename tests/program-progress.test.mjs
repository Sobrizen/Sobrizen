import test from 'node:test';
import assert from 'node:assert/strict';
import {saveProgramProgress,ProgramProgressConflictError} from '../program-progress.mjs';

const UID='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const saved={user_id:UID,step:2,reflection:'Une réflexion',revision:3,completed_at:'2026-11-15T10:00:00Z',updated_at:'2026-11-15T11:00:00Z'};
const input={userId:UID,step:2,reflection:' Une réflexion ',expectedRevision:2};

test('program saves the displayed revision and expected account through a single RPC',async()=>{
  const calls=[],db={async rpc(name,args){calls.push({name,args});return {data:saved,error:null};}};
  assert.deepEqual(await saveProgramProgress(db,input),saved);
  assert.deepEqual(calls,[{name:'save_program_progress',args:{p_expected_user_id:UID,p_step:2,p_reflection:'Une réflexion',p_expected_revision:2}}]);
});
test('conflicting reflection never falls back to a destructive upsert',async()=>{
  let calls=0;
  await assert.rejects(()=>saveProgramProgress({async rpc(){calls++;return {error:{code:'40001'}};}},input),error=>error instanceof ProgramProgressConflictError&&error.code==='PROGRAM_PROGRESS_CONFLICT');
  assert.equal(calls,1);
});
test('missing RPC fails clearly without silently using the former last-write-wins API',async()=>{
  await assert.rejects(()=>saveProgramProgress({async rpc(){return {error:{code:'PGRST202'}};}},input),/temporairement indisponible/);
});
test('RPC acknowledgement must match the account, step and a new server revision',async()=>{
  for(const result of [{...saved,user_id:OTHER},{...saved,step:1},{...saved,revision:2},{...saved,updated_at:null},[saved],null]){
    await assert.rejects(()=>saveProgramProgress({async rpc(){return {data:result,error:null};}},input),/confirmation de sauvegarde/);
  }
});
test('bad input is rejected before a request, while 2000 Unicode code points are supported',async()=>{
  let calls=0;const db={async rpc(_name,args){calls++;return {data:{...saved,step:args.p_step,revision:args.p_expected_revision+1},error:null};}};
  for(const value of [{userId:OTHER+'x'},{step:0},{step:31},{step:1.5},{expectedRevision:-1},{expectedRevision:1.5},{reflection:'é'.repeat(2001)},{reflection:{}}]){
    await assert.rejects(()=>saveProgramProgress(db,{...input,...value}));
  }
  assert.equal(calls,0);
  await saveProgramProgress(db,{...input,reflection:'🙂'.repeat(2000)});assert.equal(calls,1);
});
