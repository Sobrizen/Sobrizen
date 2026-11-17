import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const {PGlite}=await import(pathToFileURL(process.env.SOBRIZEN_QA_PGLITE||require.resolve('@electric-sql/pglite')).href);
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
const POST='44444444-4444-4444-8444-444444444444';
test('real notification migrations isolate recipients, honor preferences, deduplicate and securely lease push deliveries',async t=>{
 const db=new PGlite();
 const member=async(uid,sql,args=[],role='authenticated')=>{await db.exec(`set role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);try{return await db.query(sql,args);}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");}};
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema vault;grant usage on schema public,auth to anon,authenticated;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table auth.users(id uuid primary key);create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,display_name text);create table public.user_settings(user_id uuid primary key,hidden_authors uuid[] default '{}');create table public.posts(id uuid primary key,author_id uuid references public.profiles(id),created_at timestamptz default now());create table public.post_likes(post_id uuid references public.posts(id) on delete cascade,user_id uuid references auth.users(id),primary key(post_id,user_id));create table public.comments(id uuid primary key default gen_random_uuid(),post_id uuid references public.posts(id) on delete cascade,author_id uuid references public.profiles(id));create table vault.decrypted_secrets(id uuid primary key,decrypted_secret text);grant select,insert,delete on public.post_likes,public.comments to authenticated;`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261117230042_client_account_and_notifications.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261117230741_notification_web_push.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261117232043_finalize_expired_push_leases.sql',import.meta.url),'utf8'));
  for(const uid of [A,B,C]){await db.query('insert into auth.users values($1)',[uid]);await db.query('insert into public.profiles values($1,$2)',[uid,'Fiction '+uid[0]]);await db.query('insert into public.user_settings(user_id) values($1)',[uid]);}
  await db.query('insert into public.posts(id,author_id) values($1,$2)',[POST,A]);
  await t.test('a like creates exactly one owner-only alert, self activity creates none',async()=>{
    await member(B,'insert into public.post_likes values($1,$2)',[POST,B]);
    assert.equal((await member(A,'select * from public.user_notifications')).rows.length,1);
    assert.equal((await member(B,'select * from public.user_notifications')).rows.length,0);
    await member(A,'insert into public.post_likes values($1,$2)',[POST,A]);
    assert.equal((await db.query('select count(*)::int n from public.user_notifications')).rows[0].n,1);
    await member(B,'delete from public.post_likes where post_id=$1 and user_id=$2',[POST,B]);await member(B,'insert into public.post_likes values($1,$2)',[POST,B]);
    assert.equal((await db.query('select count(*)::int n from public.user_notifications')).rows[0].n,1);
  });
  await t.test('recipients cannot forge actors, recipient IDs or access private delivery secrets',async()=>{
    await assert.rejects(()=>member(A,'insert into public.user_notifications(recipient_id,actor_id,post_id,kind) values($1,$2,$3,\'like\')',[B,A,POST]),e=>e.code==='42501');
    await assert.rejects(()=>member(A,'update public.user_notifications set recipient_id=$1',[B]),e=>e.code==='42501');
    for(const role of ['anon','authenticated']){
      await assert.rejects(()=>member(A,'select * from private.notification_devices',[],role),e=>e.code==='42501');
      await assert.rejects(()=>member(A,'select public.notification_push_runtime()',[],role),e=>e.code==='42501');
      await assert.rejects(()=>member(A,'select public.claim_notification_push(30)',[],role),e=>e.code==='42501');
    }
    await assert.rejects(()=>member(A,'select * from public.user_notifications',[],'anon'),e=>e.code==='42501');
    assert.equal((await member(B,'select public.mark_notifications_read(null,now()) n')).rows[0].n,0);
    assert.equal((await member(A,'select public.mark_notifications_read(null,now()) n')).rows[0].n,1);
  });
  await t.test('disabled categories, hidden actors and self-comments do not notify',async()=>{
    await member(A,'insert into public.notification_preferences(user_id,comments_enabled) values($1,false)',[A]);
    await member(B,'insert into public.comments(post_id,author_id) values($1,$2)',[POST,B]);
    assert.equal((await db.query("select count(*)::int n from public.user_notifications where kind='comment'")).rows[0].n,0);
    await member(A,'update public.notification_preferences set comments_enabled=true');
    await db.query('update public.user_settings set hidden_authors=array[$1::uuid] where user_id=$2',[B,A]);
    await member(B,'insert into public.comments(post_id,author_id) values($1,$2)',[POST,B]);
    await member(A,'insert into public.comments(post_id,author_id) values($1,$2)',[POST,A]);
    assert.equal((await db.query("select count(*)::int n from public.user_notifications where kind='comment'")).rows[0].n,0);
    await db.query("update public.user_settings set hidden_authors='{}' where user_id=$1",[A]);
  });
  await t.test('push registrations reject hostile URLs, protect endpoint ownership and lease once',async()=>{
    await db.exec("insert into vault.decrypted_secrets values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fiction-private'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','fiction-dispatch');insert into private.notification_push_config values(true,'fiction-public','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true)");
    const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/fiction',keys:{p256dh:'B'.repeat(87),auth:'A'.repeat(22)}};
    for(const endpoint of ['http://127.0.0.1/','https://fcm.googleapis.com.evil.test/send','https://fcm.googleapis.com@evil.test/send','https://fcm.googleapis.com:8443/send'])await assert.rejects(()=>member(A,'select public.register_notification_device($1)',[{...subscription,endpoint}]));
    await member(A,'select public.register_notification_device($1)',[subscription]);
    await assert.rejects(()=>member(B,'select public.register_notification_device($1)',[subscription]));
    await member(B,'insert into public.comments(post_id,author_id) values($1,$2)',[POST,B]);
    assert.equal((await db.query('select count(*)::int n from private.notification_push_queue')).rows[0].n,1);
    const {rows:[claimed]}=await member(null,'select public.claim_notification_push(30) batch',[],'service_role');
    assert.equal(claimed.batch.length,1);const delivery=claimed.batch[0];
    assert.equal((await member(null,'select public.claim_notification_push(30) batch',[],'service_role')).rows[0].batch.length,0);
    await member(null,'select public.complete_notification_push($1,$2,201)',[delivery.id,C],'service_role');
    assert.equal((await db.query('select finished_at from private.notification_push_queue')).rows[0].finished_at,null);
    await member(null,'select public.complete_notification_push($1,$2,201)',[delivery.id,delivery.lease_token],'service_role');
    assert.equal((await db.query('select outcome from private.notification_push_queue')).rows[0].outcome,'sent');
    await member(B,'insert into public.comments(post_id,author_id) values($1,$2)',[POST,B]);
    await db.exec("update private.notification_push_queue set attempts=5,leased_until=now()-interval '1 minute' where finished_at is null");
    assert.equal((await member(null,'select public.claim_notification_push(30) batch',[],'service_role')).rows[0].batch.length,0);
    assert.equal((await db.query("select count(*)::int n from private.notification_push_queue where outcome='failed'")).rows[0].n,1,'Expired fifth attempts terminate instead of triggering an endless scheduler loop');
    await member(B,'insert into public.comments(post_id,author_id) values($1,$2)',[POST,B]);await member(A,'update public.notification_preferences set comments_enabled=false');
    assert.equal((await member(null,'select public.claim_notification_push(30) batch',[],'service_role')).rows[0].batch.length,0);
    await member(A,'select public.unregister_notification_device($1)',[subscription.endpoint]);
    assert.equal((await db.query('select count(*)::int n from private.notification_devices')).rows[0].n,0);
  });
  await t.test('complete exports include only own community data and deletion cascades alerts',async()=>{
    const exported=(await member(A,'select public.export_personal_data() doc')).rows[0].doc;
    assert.equal(exported.version,6);assert.equal(exported.posts.length,1);assert.equal(exported.comments.length,1);assert.equal(exported.likes.length,1);
    assert.equal(JSON.stringify(exported).includes('fiction-private'),false);assert.equal(Object.hasOwn(exported,'journal'),true);
    await db.query('delete from public.posts where id=$1',[POST]);
    assert.equal((await db.query('select count(*)::int n from public.user_notifications')).rows[0].n,0);
  });
 }finally{await db.close();}
});
