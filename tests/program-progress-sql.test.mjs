/** Actual migrations in an isolated PostgreSQL engine, using fictional records only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const {PGlite}=await import(pathToFileURL(process.env.SOBRIZEN_QA_PGLITE||require.resolve('@electric-sql/pglite')).href);
const UID='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const base=await readFile(new URL('../db/20261109_sensitive_consent_and_journal.sql',import.meta.url),'utf8');
const phone=await readFile(new URL('../supabase/migrations/20261114232737_fix_private_settings_phone.sql',import.meta.url),'utf8');
const cas=await readFile(new URL('../supabase/migrations/20261114232739_program_progress_cas.sql',import.meta.url),'utf8');

test('reflection revisions, consent and private settings remain enforced in PostgreSQL',async t=>{
  const db=new PGlite(),query=(sql,args=[])=>db.query(sql,args);
  async function member(sql,args=[],uid=UID,role='authenticated'){
    await db.exec(`set role ${role}`);await query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);
    try{return await query(sql,args);}finally{await query("select set_config('request.jwt.claim.sub','',false)");await db.exec('reset role');}
  }
  const reject=(run,code)=>assert.rejects(run,error=>error.code===code);
  const save=async(step,reflection,revision,uid=UID)=>{
    const result=await member('select public.save_program_progress($1,$2,$3,$4) as value',[uid,step,reflection,revision],uid);
    return result.rows[0].value;
  };
  try{
    await db.exec("create role authenticated; create role anon; create role service_role; create schema auth; create schema private; create schema storage; grant usage on schema public,auth,storage to authenticated,anon; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
    await db.exec(await readFile(new URL('./fixtures/consent-schema.sql',import.meta.url),'utf8'));
    await db.exec('alter table public.user_settings add primary key(user_id); alter table public.journal_entries add primary key(id); alter table public.program_progress add primary key(user_id,step); alter table public.program_progress add check(step between 1 and 30); alter table public.program_progress add check(char_length(reflection)<=2000); create table storage.objects(id uuid default gen_random_uuid(),bucket_id text not null,name text not null); grant select,insert,update,delete on all tables in schema public to authenticated; grant select,insert,delete on storage.objects to authenticated; alter table storage.objects enable row level security;');
    for(const table of ['sobriety_journeys','daily_checkins','journal_entries','program_progress','urge_events','reasons','health_checkins','journey_timelines','progress_settings','progress_chapters','user_settings','subscription_anchors']){
      await db.exec(`alter table public.${table} enable row level security; create policy owner_access on public.${table} for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));`);
    }
    for(const uid of [UID,OTHER])await query('insert into public.user_settings(user_id,health_data_consent_at,privacy_ack_at) values($1,now(),now())',[uid]);
    await db.exec(base);await db.exec(phone);await db.exec(cas);

    await t.test('common phone formats are accepted, unsafe input and unauthorized fields rejected',async()=>{
      for(const number of ['0612345678','+33612345678','+33 (0)6 12 34 56 78','01.23.45.67.89','']){
        const result=await member('select public.save_private_settings($1) as value',[{support_phone:number}]);
        assert.equal(result.rows[0].value.support_phone,number||null);
      }
      for(const number of ['javascript:alert(1)','abcd1234','+33/612345678','1234','1'.repeat(31)])await reject(()=>member('select public.save_private_settings($1)',[{support_phone:number}]),'22023');
      await reject(()=>member('select public.save_private_settings($1)',[{user_id:OTHER}]),'22023');
    });
    let first;
    await t.test('first write creates a server version; a second create cannot overwrite it',async()=>{
      first=await save(3,'Première réflexion',0);
      assert.equal(first.revision,1);assert.equal(first.user_id,UID);assert.equal(first.reflection,'Première réflexion');
      assert.ok(first.completed_at);assert.ok(first.updated_at);
      await reject(()=>save(3,'Tentative en retard',0),'40001');
    });
    let second;
    await t.test('two clients editing the same version preserve the first saved reflection',async()=>{
      second=await save(3,'La version sauvegardée',first.revision);
      assert.equal(second.revision,2);assert.equal(second.completed_at,first.completed_at);assert.notEqual(second.updated_at,first.updated_at);
      await reject(()=>save(3,'La version obsolète',first.revision),'40001');
      const result=await member('select reflection,revision from public.program_progress where step=3');
      assert.deepEqual(result.rows,[{reflection:'La version sauvegardée',revision:2}]);
    });
    await t.test('legacy clients still save, advance the version and cannot forge identity/timestamps',async()=>{
      const result=await member("insert into public.program_progress(user_id,step,reflection,completed_at) values($1,3,'Ancien client','1990-01-01') on conflict(user_id,step) do update set reflection=excluded.reflection,completed_at=excluded.completed_at returning revision,completed_at",[UID]);
      assert.equal(result.rows[0].revision,3);assert.equal(result.rows[0].completed_at.toISOString(),new Date(first.completed_at).toISOString());
      await reject(()=>save(3,'Version ouverte avant ancien client',second.revision),'40001');
      await reject(()=>member('update public.program_progress set user_id=$1 where step=3',[OTHER]),'22023');
      await reject(()=>member('update public.program_progress set step=4 where step=3'),'22023');
    });
    await t.test('account switch and malicious data cannot bypass owner isolation',async()=>{
      const theirs=await save(3,'Autre compte',0,OTHER);assert.equal(theirs.user_id,OTHER);
      await reject(()=>member('select public.save_program_progress($1,3,$2,1)',[OTHER,'Écriture croisée']),'42501');
      assert.equal((await member('select * from public.program_progress')).rows.length,1);
      for(const [step,reflection,revision] of [[31,'texte',0],[1,'x'.repeat(2001),0],[1,'texte',-1]])await reject(()=>save(step,reflection,revision),'22023');
      await reject(()=>member('select public.save_program_progress($1,1,$2,0)',[UID,'anonyme'],null,'anon'),'42501');
    });
    await t.test('consent withdrawal blocks both RPC and legacy writes without deleting data',async()=>{
      await member('update public.user_settings set health_data_consent_revoked_at=now() where user_id=$1',[UID]);
      await reject(()=>save(3,'Sans accord',3),'42501');
      await reject(()=>member('insert into public.program_progress(user_id,step) values($1,4)',[UID]),'42501');
      await reject(()=>member('select public.save_private_settings($1)',[{support_phone:'0612345678'}]),'42501');
      assert.equal((await member('select * from public.program_progress')).rows.length,0);
      assert.equal((await query('select count(*)::int as n from public.program_progress where user_id=$1',[UID])).rows[0].n,1);
    });
  }finally{await db.close();}
});
