import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const {PGlite}=await import(pathToFileURL(process.env.SOBRIZEN_QA_PGLITE||require.resolve('@electric-sql/pglite')).href);

test('operator queue exposes bounded references and stays inaccessible to client roles',async()=>{
  const db=new PGlite();
  try{
    await db.exec("create role anon; create role authenticated; create schema private; grant usage on schema private to anon,authenticated; create table public.billing_requests(id uuid primary key,kind text,status text check(status in ('received','processing','completed','rejected')),created_at timestamptz default now()); create table public.content_reports(id uuid primary key,post_id uuid,comment_id uuid,created_at timestamptz default now());");
    await db.exec(await readFile(new URL('../supabase/migrations/20261115001032_operations_review_log.sql',import.meta.url),'utf8'));
    await db.exec("insert into public.billing_requests select gen_random_uuid(),'account_deletion','received',now() from generate_series(1,105); insert into public.content_reports select gen_random_uuid(),gen_random_uuid(),null,now() from generate_series(1,3);");
    for(const role of ['anon','authenticated']){
      await db.exec(`set role ${role}`);
      await assert.rejects(()=>db.query('select * from private.operations_review_log'),error=>error.code==='42501');
      await assert.rejects(()=>db.query("insert into private.operations_review_log(queue,source_id,decision) values('content_report',gen_random_uuid(),'no_action')"),error=>error.code==='42501');
      await db.exec('reset role');
    }
    const {rows:[report]}=await db.query('select id from public.content_reports limit 1');
    await db.query("insert into private.operations_review_log(queue,source_id,decision) values('content_report',$1,'no_action')",[report.id]);
    const result=await db.exec(await readFile(new URL('../ops/review-queues.sql',import.meta.url),'utf8'));
    const lists=result.filter(row=>row.rows?.length);
    assert.equal(lists[0].rows.length,100);assert.equal(lists[1].rows.length,2);
    assert.equal(lists[1].rows.some(row=>row.id===report.id),false);
    for(const result of lists)for(const row of result.rows)assert.ok(Object.keys(row).every(key=>!/(email|user_id|reporter|reason|body|reflection|receipt)/u.test(key)));
    assert.equal((await db.query('select count(*)::int as n from public.content_reports')).rows[0].n,3,'Review logging must not delete content or reports.');
  }finally{await db.close();}
});
