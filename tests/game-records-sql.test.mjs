/** Actual PostgreSQL semantics in an isolated in-memory PGlite database. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {PGlite}=require(process.env.SOBRIZEN_PGLITE_PATH||'@electric-sql/pglite');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const run=n=>`99999999-9999-4999-8999-${String(n).padStart(12,'0')}`;

test('game records SQL: ownership, atomic monotone updates, Premium and pause idempotency',async t=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema auth;create table auth.users(id uuid primary key);
      insert into auth.users values('${A}'),('${B}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon;
      create function public.sobrizen_has_premium() returns boolean language sql stable as $$select coalesce(current_setting('test.premium',true),'false')='true'$$;`);
    await db.exec(await readFile(new URL('../game-records.sql',import.meta.url),'utf8'));
    await db.exec(`set role authenticated;select set_config('test.uid','${A}',false);select set_config('test.premium','true',false);`);
    const save=async(game,score=0,level=0,time=null,completed=false,id=run(1),owner=A)=>(await db.query('select * from public.save_game_record($1,$2,$3,$4,$5,$6,$7)',[game,score,level,time,completed,id,owner])).rows[0];
    await t.test('higher/lower scores and direct stale updates keep the maximum',async()=>{
      assert.equal((await save('snake',12,2)).best_score,12);
      assert.equal((await save('snake',4,1)).best_score,12);
      await db.query("update public.game_records set best_score=1,best_level=0 where game_id='snake'");
      const result=(await db.query("select * from public.game_records where game_id='snake'")).rows[0];
      assert.equal(result.best_score,12);assert.equal(result.best_level,2);
    });
    await t.test('lower valid time wins without losing a better success score',async()=>{
      await save('reaction',14,5,330,true);await save('reaction',10,4,210,true);
      const result=await save('reaction',15,6,500,true);
      assert.equal(result.best_time_ms,210);assert.equal(result.best_score,15);
      await assert.rejects(save('reaction',16,6,200,true),/Invalid game result/);
      await assert.rejects(save('memory',28,4,1000,false),/Invalid game result/);
    });
    await t.test('one receipt per completed pause makes retries idempotent',async()=>{
      const first=await save('ground',0,0,null,true,run(3));assert.equal(first.completed_sessions,1);
      const repeated=await save('ground',0,0,null,true,run(3));assert.equal(repeated.completed_sessions,1);
      const second=await save('ground',0,0,null,true,run(4));assert.equal(second.completed_sessions,2);
      assert.equal((await db.query('select count(*)::int as n from public.game_record_completions')).rows[0].n,2);
    });
    await t.test('a free account can save free games but cannot save Premium results',async()=>{
      await db.query("select set_config('test.premium','false',false)");
      assert.equal((await save('blocks',100,1)).best_score,100);
      await assert.rejects(save('merge',100,1),/Premium is required/);
      await assert.rejects(db.query("insert into public.game_records(user_id,game_id,best_score) values($1,'merge',100)",[A]),/row-level security/);
    });
    await t.test('another account cannot read, insert or transfer the first account records',async()=>{
      await db.query("select set_config('test.uid',$1,false)",[B]);
      assert.equal((await db.query('select * from public.game_records')).rows.length,0);
      assert.equal((await db.query('select * from public.game_record_completions')).rows.length,0);
      await assert.rejects(save('snake',99,1,null,false,run(8),A),/no longer belongs/);
      await assert.rejects(db.query("insert into public.game_records(user_id,game_id) values($1,'snake')",[A]),/row-level security/);
      await save('snake',3,1,null,false,run(9),B);
      await assert.rejects(db.query('update public.game_records set user_id=$1',[A]),/cannot change owner/);
      await assert.rejects(db.query('delete from public.game_records'),/permission denied/);
    });
    await t.test('anonymous users cannot call the RPC or read records',async()=>{
      await db.exec('reset role;set role anon;');
      await assert.rejects(db.query('select * from public.game_records'),/permission denied/);
      await assert.rejects(save('snake',1),/permission denied/);
    });
  }finally{await db.close();}
});
