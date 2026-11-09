/** Isolated WASM PostgreSQL, synthetic users only. Never connects to Supabase. */
import assert from 'node:assert/strict';
import {test, before, after} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {validateAgendaPayload} from '../agenda-core.mjs';

const require=createRequire(import.meta.url);
let PGlite;
try { ({PGlite}=require(process.env.SOBRIZEN_QA_PGLITE||process.env.SOBRIZEN_PGLITE_PATH||'@electric-sql/pglite')); } catch(error) {if(process.env.SOBRIZEN_QA_PGLITE||process.env.SOBRIZEN_PGLITE_PATH)throw error;}
const sqlTest=(name,fn)=>test(name,{skip:!PGlite&&'Requires test-only @electric-sql/pglite@0.5.16 (npm ci)'},fn);
const UID='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const id=n=>`a0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const task=patch=>validateAgendaPayload({kind:'task',category:'personal',title:'Une priorité',notes:'',item_date:'2026-11-09',all_day:true,time_zone:'Europe/Paris',starts_at:null,ends_at:null,status:'open',goal_target:null,goal_current:null,goal_unit:'',...patch});
let db;
before(async()=>{
  if(!PGlite)return;
  db=new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    insert into auth.users values('${UID}'),('${OTHER}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
    create table public.test_entitlements(user_id uuid primary key,premium boolean not null);
    insert into public.test_entitlements values('${UID}',true),('${OTHER}',false);
    alter table public.test_entitlements enable row level security;
    grant select on public.test_entitlements to authenticated;
    create policy entitlement_owner on public.test_entitlements for select to authenticated using(user_id=(select auth.uid()));
    create function public.sobrizen_has_premium() returns boolean language sql stable security invoker set search_path='' as $$select exists(select 1 from public.test_entitlements where user_id=(select auth.uid()) and premium)$$;
    revoke all on function public.sobrizen_has_premium() from public,anon;grant execute on function public.sobrizen_has_premium() to authenticated;`);
  await db.exec(await readFile(new URL('../schema/agenda.sql',import.meta.url),'utf8'));
});
after(async()=>{await db?.close();});
async function asUser(uid,query,params=[]) {
  await db.exec('set role authenticated');
  try {await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);return await db.query(query,params);}
  finally {await db.exec('reset role');}
}
async function save(uid,itemId,version,payload) {
  const result=await asUser(uid,'select row_to_json(public.save_agenda_item($1::uuid,$2::integer,$3::jsonb)) as item',[itemId,version,JSON.stringify(payload)]);
  return result.rows[0].item;
}
const code=expected=>cause=>cause.code===expected;

sqlTest('prepared SQL executes and exposes no anonymous table or RPC privilege',async()=>{
  const result=await db.query(`select has_table_privilege('anon','public.agenda_items','SELECT') as read,
    has_function_privilege('anon','public.save_agenda_item(uuid,integer,jsonb)','EXECUTE') as save,
    has_function_privilege('anon','public.delete_agenda_item(uuid,integer)','EXECUTE') as delete,
    (select relrowsecurity from pg_class where oid='public.agenda_items'::regclass) as rls`);
  assert.deepEqual(result.rows[0],{read:false,save:false,delete:false,rls:true});
});
sqlTest('premium owner creates and reads a row while another account sees nothing',async()=>{
  const saved=await save(UID,id(1),null,task());assert.equal(saved.user_id,UID);assert.equal(saved.version,1);
  assert.equal((await asUser(UID,'select * from public.agenda_items where id=$1',[id(1)])).rows.length,1);
  assert.equal((await asUser(OTHER,'select * from public.agenda_items where id=$1',[id(1)])).rows.length,0);
});
sqlTest('same creation retry is idempotent; changed payload cannot reuse that identifier',async()=>{
  const again=await save(UID,id(1),null,task());assert.equal(again.version,1);
  await assert.rejects(save(UID,id(1),null,task({title:'Autre projet'})),code('PT409'));
});
sqlTest('optimistic update increments version and refuses an old or missing version',async()=>{
  const saved=await save(UID,id(1),1,task({title:'Un projet modifié'}));assert.equal(saved.version,2);
  await assert.rejects(save(UID,id(1),1,task({title:'Écrasement'})),code('PT409'));
  await assert.rejects(save(UID,id(999),1,task()),code('PT409'));
  const rows=(await asUser(UID,'select title,version from public.agenda_items where id=$1',[id(1)])).rows;
  assert.deepEqual(rows,[{title:'Un projet modifié',version:2}]);
});
sqlTest('free account cannot create via RPC or bypass its premium policy through direct insert',async()=>{
  await assert.rejects(save(OTHER,id(2),null,task()),code('42501'));
  await assert.rejects(asUser(OTHER,"insert into public.agenda_items(id,user_id,kind,category,title,item_date,time_zone) values($1,$2,'task','personal','Direct','2026-11-09','Europe/Paris')",[id(2),OTHER]),code('42501'));
});
sqlTest('cross-account update and delete do not disclose or modify owner records',async()=>{
  await db.query('update public.test_entitlements set premium=true where user_id=$1',[OTHER]);
  await assert.rejects(save(OTHER,id(1),2,task({title:'Interdit'})),code('PT409'));
  await assert.rejects(asUser(OTHER,'select public.delete_agenda_item($1,$2)',[id(1),2]),code('PT409'));
  assert.equal((await asUser(OTHER,"update public.agenda_items set title='Interdit' where id=$1 returning id",[id(1)])).rows.length,0);
  assert.equal((await asUser(OTHER,'delete from public.agenda_items where id=$1 returning id',[id(1)])).rows.length,0);
});
sqlTest('owner cannot forge user_id, immutable identifiers or server version through the RPC/API',async()=>{
  await assert.rejects(save(UID,id(3),null,{...task(),user_id:OTHER}),code('22023'));
  await assert.rejects(asUser(UID,'update public.agenda_items set user_id=$1 where id=$2',[OTHER,id(1)]),code('42501'));
  await assert.rejects(asUser(UID,'update public.agenda_items set version=999 where id=$1',[id(1)]),code('42501'));
});
sqlTest('backend validates timezones, civil dates, timezone consistency and goal progress independently',async()=>{
  const cases=[
    {...task(),time_zone:'Not/AZone'},
    {...task(),item_date:'2026-02-30'},
    {...task(),kind:'appointment',all_day:false,starts_at:'2026-11-09T09:00:00',ends_at:'2026-11-09T10:00:00Z'},
    {...task(),kind:'appointment',all_day:false,starts_at:'2026-11-10T09:00:00Z',ends_at:'2026-11-10T10:00:00Z'},
    {...task(),kind:'goal',goal_target:3,goal_current:4},
    {...task(),kind:'goal',goal_target:3,goal_current:3,status:'open'},
    {...task(),kind:'goal',goal_target:3,goal_current:2.5},
  ];
  for(let i=0;i<cases.length;i++)await assert.rejects(save(UID,id(20+i),null,cases[i]),cause=>/^22|^23/u.test(cause.code));
});
sqlTest('stored repeated-hour instant is explicit and never reinterpreted by the SQL session timezone',async()=>{
  await db.exec("set timezone='Pacific/Kiritimati'");
  const payload=task({kind:'appointment',item_date:'2026-10-25',all_day:false,starts_at:'2026-10-25T01:30:00.000Z',ends_at:'2026-10-25T02:30:00.000Z'});
  const saved=await save(UID,id(40),null,payload);
  assert.equal(Date.parse(saved.starts_at),Date.parse('2026-10-25T01:30:00Z'));
  const historical=task({kind:'appointment',item_date:'1900-01-01',all_day:false,starts_at:'1900-01-01T08:50:39.000Z',ends_at:'1900-01-01T09:50:39.000Z'});
  await save(UID,id(41),null,historical);
  // Historic server zones may serialize a seconds-bearing UTC offset unsupported
  // by Date.parse; compare the stored instant rather than that JSON formatting.
  assert.equal(Number((await asUser(UID,'select extract(epoch from starts_at) as stamp from public.agenda_items where id=$1',[id(41)])).rows[0].stamp)*1000,Date.parse(historical.starts_at));
  await db.exec("set timezone='UTC'");
});
sqlTest('expired owner retains read and delete but edits are denied, including direct API',async()=>{
  await db.query('update public.test_entitlements set premium=false where user_id=$1',[UID]);
  assert.equal((await asUser(UID,'select id from public.agenda_items where id=$1',[id(1)])).rows.length,1);
  await assert.rejects(save(UID,id(1),2,task({title:'Édition expirée'})),code('42501'));
  assert.equal((await asUser(UID,"update public.agenda_items set title='Interdit' where id=$1 returning id",[id(1)])).rows.length,0);
  await assert.rejects(asUser(UID,'select public.delete_agenda_item($1,$2)',[id(1),1]),code('PT409'));
  assert.equal((await asUser(UID,'select public.delete_agenda_item($1,$2) as id',[id(1),2])).rows[0].id,id(1));
});
