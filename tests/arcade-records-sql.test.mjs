import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',RUN='99999999-9999-4999-8999-000000000001';
test('arcade migration preserves prior records, enforces honest metrics and owner Premium access',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${A}'),('${B}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;create function public.sobrizen_has_premium() returns boolean language sql stable as $$select coalesce(current_setting('test.premium',true),'false')='true'$$;`);
  await db.exec(fs.readFileSync(new URL('../game-records.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261110211705_semantizen_records.sql',import.meta.url),'utf8'));
  await db.exec(`insert into public.game_records(user_id,game_id,best_score) values('${A}','snake',12),('${A}','semantizen',999990);`);
  const migration=fs.readdirSync(new URL('../supabase/migrations/',import.meta.url)).find(file=>file.endsWith('_arcade_private_records.sql'));
  const sql=fs.readFileSync(new URL('../supabase/migrations/'+migration,import.meta.url),'utf8');
  assert.equal(sql,fs.readFileSync(new URL('../db/arcade-records.sql',import.meta.url),'utf8'));
  await db.exec(sql);
  await db.exec(`set role authenticated;select set_config('test.uid','${A}',false);select set_config('test.premium','true',false);`);
  const save=async(game,score,level=0,completed=true,owner=A)=>(await db.query('select * from public.save_game_record($1,$2,$3,null,$4,$5,$6)',[game,score,level,completed,RUN,owner])).rows[0];
  await t.test('old and semantic records are retained',async()=>{assert.equal((await db.query("select best_score from public.game_records where game_id='snake'")).rows[0].best_score,12);assert.equal((await save('semantizen',999991)).best_score,999991);});
  await t.test('maze retains score and highest level despite retries and stale writes',async()=>{await save('maze',200,2,false);assert.equal((await save('maze',100,1,false)).best_score,200);assert.equal((await save('maze',100,1,false)).best_level,2);await assert.rejects(save('maze',15,1));await assert.rejects(save('maze',100,0));});
  await t.test('only a completed solitaire victory can record fewer total actions',async()=>{assert.equal((await save('solitaire',999800)).best_score,999800);assert.equal((await save('solitaire',999900)).best_score,999900);assert.equal((await save('solitaire',999700)).best_score,999900);for(const args of [['solitaire',999999,0,false],['solitaire',1000000],['solitaire',0],['solitaire',999999,1]])await assert.rejects(save(...args));await assert.rejects(db.query("update public.game_records set best_level=1 where game_id='solitaire'"));});
  await t.test('free owners can read existing results but cannot write arcade results',async()=>{await db.exec("select set_config('test.premium','false',false)");assert.equal((await db.query("select game_id from public.game_records where game_id in ('maze','solitaire')")).rows.length,2);await assert.rejects(save('maze',300,3));await assert.rejects(save('solitaire',999999));await assert.rejects(db.query("update public.game_records set best_score=999999 where game_id='solitaire'"));await db.exec("select set_config('test.premium','true',false)");});
  await t.test('another account and anonymous callers cannot read or replace private records',async()=>{await assert.rejects(save('solitaire',999999,0,true,B));await db.exec(`select set_config('test.uid','${B}',false)`);assert.equal((await db.query('select * from public.game_records')).rows.length,0);await assert.rejects(db.query("insert into public.game_records(user_id,game_id,best_score,best_level) values($1,'maze',100,1)",[A]));await db.exec('reset role;set role anon');await assert.rejects(save('maze',100,1));await assert.rejects(db.query('select * from public.game_records'));});
 }finally{await db.close();}
});
