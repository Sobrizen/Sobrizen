/** Execute the actual migration against an isolated PostgreSQL-compatible engine.
 * No network, auth account, payment or production write. The fixture contains
 * empty column definitions, then deliberately artificial records only.
 * SOBRIZEN_QA_PGLITE=/path/to/@electric-sql/pglite/dist/index.js node --test tests/consent-db.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
let PGlite;
try{({PGlite}=await import(pathToFileURL(process.env.SOBRIZEN_QA_PGLITE||'/tmp/sobrizen-audit-qa/node_modules/@electric-sql/pglite/dist/index.js').href));}
catch(error){if(process.env.SOBRIZEN_QA_PGLITE)throw error;}
const UID='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const sensitive=['sobriety_journeys','daily_checkins','journal_entries','program_progress','urge_events','reasons','health_checkins','journey_timelines','progress_settings','progress_chapters'];
const migration=await readFile(new URL('../db/20261109_sensitive_consent_and_journal.sql',import.meta.url),'utf8');
const fixture=await readFile(new URL('./fixtures/consent-schema.sql',import.meta.url),'utf8');

test('actual consent migration, owner isolation, explicit exports, bounded journal search and CAS',{skip:!PGlite&&'Provide the test-only PGlite dependency to execute database regressions.'},async t=>{
  const db=new PGlite();
  const query=async(sql,args=[])=>db.query(sql,args);
  async function member(sql,args=[],uid=UID,role='authenticated'){
    await db.exec(`set role ${role}`);await query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);
    try{return await query(sql,args);}finally{await query("select set_config('request.jwt.claim.sub','',false)");await db.exec('reset role');}
  }
  const rejected=(fn,code)=>assert.rejects(fn,error=>error.code===code);
  const active=()=>query('update public.user_settings set health_data_consent_at=now(),health_data_consent_revoked_at=null where user_id=$1',[UID]);
  const withdraw=()=>member('update public.user_settings set health_data_consent_revoked_at=now() where user_id=$1 returning user_id,health_data_consent_revoked_at',[UID]);
  try{
    await db.exec("create role authenticated; create role anon; create role service_role; create schema auth; create schema private; create schema storage; grant usage on schema public,auth,storage to authenticated,anon; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
    await db.exec(fixture);
    await db.exec('alter table public.user_settings add primary key(user_id); alter table public.journal_entries add primary key(id); create table storage.objects(id uuid default gen_random_uuid(),bucket_id text not null,name text not null); grant select,insert,update,delete on all tables in schema public to authenticated; grant select,insert,delete on storage.objects to authenticated; alter table storage.objects enable row level security;');
    for(const table of [...sensitive,'user_settings','subscription_anchors'])await db.exec(`alter table public.${table} enable row level security; create policy owner_access on public.${table} for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));`);
    await db.exec("create policy owned_images on storage.objects for all to authenticated using (split_part(name,'/',1)=auth.uid()::text) with check (split_part(name,'/',1)=auth.uid()::text);");
    for(const uid of [UID,OTHER]){
      await query('insert into public.user_settings(user_id,health_data_consent_at,privacy_ack_at,response_plan) values($1,now(),now(),$2)',[uid,'PRIVATE PLAN '+uid]);
      await query('insert into public.profiles(id,username) values($1,$2)',[uid,'qa_'+uid.slice(0,8)]);
      await query('insert into public.journal_entries(user_id,title,body) values($1,$2,$3)',[uid,'A personal note','PRIVATE BODY '+uid]);
      await query('insert into public.sobriety_journeys(user_id) values($1)',[uid]);
      await query('insert into public.daily_checkins(user_id) values($1)',[uid]);
      await query('insert into public.health_checkins(user_id,checkin_date) values($1,current_date)',[uid]);
      await query('insert into public.program_progress(user_id,step) values($1,1)',[uid]);
      await query('insert into public.urge_events(user_id,intensity) values($1,3)',[uid]);
      await query("insert into public.reasons(user_id,title) values($1,'Private reason')",[uid]);
      await query("insert into public.journey_timelines(user_id,document) values($1,'{}')",[uid]);
      await query('insert into public.progress_settings(user_id) values($1)',[uid]);
      await query("insert into public.progress_chapters(user_id,mode) values($1,'observe')",[uid]);
      for(const bucket of ['journal-images','community-images','profile-avatars'])await query('insert into storage.objects(bucket_id,name) values($1,$2)',[bucket,uid+'/image.jpg']);
    }
    await db.exec(migration);

    await t.test('migration installs all 30 restrictive policies and preserves existing owner policies',async()=>{
      const result=await query("select tablename,policyname,permissive from pg_policies where policyname like 'sensitive_consent_%'");
      assert.equal(result.rows.length,30);assert.ok(result.rows.every(row=>row.permissive==='RESTRICTIVE'));
      for(const table of sensitive){const result=await member(`select user_id from public.${table}`);assert.equal(result.rows.length,1,table);assert.equal(result.rows[0].user_id,UID,table);}
    });
    await t.test('active journal edits compare id, owner and server version atomically; the old version affects zero rows',async()=>{
      const {rows:[before]}=await member('select id,updated_at::text as version from public.journal_entries');
      const first=await member('update public.journal_entries set body=$1 where id=$2 and user_id=$3 and updated_at=$4 returning body,updated_at::text as version',['NEW LOCAL BODY',before.id,UID,before.version]);
      assert.equal(first.rows.length,1);assert.notEqual(first.rows[0].version,before.version);
      const stale=await member('update public.journal_entries set body=$1 where id=$2 and user_id=$3 and updated_at=$4 returning id',['STALE BODY',before.id,UID,before.version]);
      assert.equal(stale.rows.length,0);assert.equal((await member('select body from public.journal_entries where id=$1',[before.id])).rows[0].body,'NEW LOCAL BODY');
      await rejected(()=>member('update public.journal_entries set user_id=$1 where id=$2',[OTHER,before.id]),'22023');
    });
    await t.test('server search reaches older notes, isolates citations and treats wildcard characters literally',async()=>{
      for(let i=0;i<62;i++)await query('insert into public.journal_entries(user_id,entry_date,title,body) values($1,$2,$3,$4)',[UID,'2020-01-01',`Old ${i}`,i===0?'LITERAL 100%_\\ marker':'Old body']);
      await query("insert into public.journal_entries(user_id,title,body,kind) values($1,'Une pensée pour avancer · SobriZen','A saved quote','reflection')",[UID]);
      const page1=await member("select id from public.list_journal_entries('',0,21,false)");
      const page3=await member("select id from public.list_journal_entries('',40,21,false)");
      assert.equal(page1.rows.length,21);assert.equal(page3.rows.length,21);assert.ok(page3.rows.every(r=>!page1.rows.some(first=>first.id===r.id)));
      const old=await member('select title from public.list_journal_entries($1,0,21,false)',['100%_\\']);assert.deepEqual(old.rows,[{title:'Old 0'}]);
      const quotes=await member("select title from public.list_journal_entries('',0,21,true)");assert.deepEqual(quotes.rows,[{title:'Une pensée pour avancer · SobriZen'}]);
      await rejected(()=>member("select * from public.list_journal_entries('',0,500,false)"),'22023');
    });
    await t.test('private settings require the guarded RPC and cannot alter consent or another identity',async()=>{
      await rejected(()=>member('select response_plan from public.user_settings'),'42501');
      const read=await member('select public.read_private_settings() as value');assert.equal(read.rows[0].value.user_id,UID);assert.match(read.rows[0].value.response_plan,/PRIVATE PLAN/);
      const saved=await member('select public.save_private_settings($1) as value',[{response_plan:'An updated plan',reminder_time:'18:45'}]);assert.equal(saved.rows[0].value.response_plan,'An updated plan');assert.ok(saved.rows[0].value.health_data_consent_at);
      await rejected(()=>member('select public.save_private_settings($1)',[{user_id:OTHER}]),'22023');
      await rejected(()=>member('select public.save_private_settings($1)',[{reminder_time:'25:00'}]),'22023');
    });
    await t.test('withdrawal removes ordinary access to every sensitive table and journal pictures but preserves community images',async()=>{
      await withdraw();
      for(const table of sensitive){assert.equal((await member(`select * from public.${table}`)).rows.length,0,table);}
      await rejected(()=>member("insert into public.journal_entries(user_id,title,body) values($1,'forged','no consent')",[UID]),'42501');
      await rejected(()=>member("select * from public.list_journal_entries('',0,21,false)"),'42501');
      const objects=await member('select bucket_id from storage.objects order by bucket_id');assert.deepEqual(objects.rows.map(row=>row.bucket_id),['community-images','profile-avatars']);
      await rejected(()=>member("insert into storage.objects(bucket_id,name) values('journal-images',$1)",[UID+'/new.jpg']),'42501');
    });
    await t.test('withdrawal keeps safe controls and explicit owner export available; private plan writes and journey RPCs are rejected',async()=>{
      assert.equal((await member('select user_id,health_data_consent_revoked_at,reminder_time from public.user_settings')).rows.length,1);
      await member("update public.user_settings set reminder_time='19:00' where user_id=$1",[UID]);
      await rejected(()=>member("update public.user_settings set response_plan='FORGED' where user_id=$1",[UID]),'42501');
      await rejected(()=>member('select public.read_private_settings()'),'42501');
      await rejected(()=>member('select public.save_private_settings($1)',[{response_plan:'FORGED'}]),'42501');
      await rejected(()=>member("select public.save_journey_reference(current_date,'Europe/Paris',0,0,null,null)"),'42501');
      await rejected(()=>member("select public.save_journey_timeline('{}',1,null,null,null)"),'42501');
      const payload=(await member('select public.export_personal_data() as value')).rows[0].value;
      assert.equal(payload.version,5);assert.equal(payload.profile.id,UID);assert.equal(payload.journal.length,64);assert.equal(payload.settings.response_plan,'An updated plan');
      assert.ok(payload.journal.every(row=>row.user_id===UID));assert.equal(JSON.stringify(payload).includes(OTHER),false);
      assert.deepEqual(payload.agenda_items,[]);assert.deepEqual(payload.game_records,[]);
    });
    await t.test('new release tables are included automatically, owner scoped, in explicit exports',async()=>{
      for(const table of ['agenda_items','game_records','game_record_completions']){
        await db.exec(`create table public.${table}(user_id uuid not null,label text);`);
        await query(`insert into public.${table}(user_id,label) values($1,'mine'),($2,'other')`,[UID,OTHER]);
      }
      const payload=(await member('select public.export_personal_data() as value')).rows[0].value;
      for(const table of ['agenda_items','game_records','game_record_completions'])assert.deepEqual(payload[table],[{user_id:UID,label:'mine'}]);
    });
    await t.test('consent can be regranted without reading a private column and anonymous callers cannot export or bypass the guards',async()=>{
      await member('update public.user_settings set health_data_consent_at=now(),health_data_consent_revoked_at=null where user_id=$1 returning user_id,health_data_consent_at',[UID]);
      assert.ok((await member('select * from public.journal_entries')).rows.length>0);
      for(const sql of ['select public.export_personal_data()','select public.read_private_settings()',"select * from public.list_journal_entries('',0,21,false)"]){await rejected(()=>member(sql,[],null,'anon'),'42501');}
      const definer=await query("select proname,prosecdef,proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('read_private_settings','save_private_settings','export_personal_data')");
      assert.equal(definer.rows.length,3);assert.ok(definer.rows.every(row=>row.prosecdef&&row.proconfig.includes('search_path=""')));
    });
  }finally{await db.close();}
});
