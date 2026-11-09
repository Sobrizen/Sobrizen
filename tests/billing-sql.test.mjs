/** PostgreSQL semantics in isolated PGlite. No remote database or Stripe calls.
 * Baseline columns/constraints/owner SELECT policies match the read-only catalogue
 * checked on 2026-11-09. Parallel JS calls use PGlite's single connection: this
 * exercises allocator atomicity and repeat calls, not multi-connection contention.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {PGlite}=require(process.env.SOBRIZEN_PGLITE_PATH||'@electric-sql/pglite');
const uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const customer=n=>`cus_User${n}`;
const session=n=>`cs_live_Test${n}`;
const checkoutUrl=n=>`https://checkout.stripe.com/c/pay/test${n}`;

test('billing migration: launch capacity, ownership, trial eligibility and entitlement',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   grant usage on schema auth,public to anon,authenticated,service_role;
   create table public.billing_customers(
    user_id uuid primary key references auth.users(id) on delete cascade,
    stripe_customer_id text not null unique check(stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),created_at timestamptz not null default now());
   create table public.billing_subscriptions(
    stripe_subscription_id text primary key check(stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
    user_id uuid not null references auth.users(id) on delete cascade,stripe_customer_id text not null,status text not null,
    paid_until timestamptz,cancel_at_period_end boolean not null default false,original_started_at timestamptz not null,
    checked_at timestamptz not null,updated_at timestamptz not null default now());
   create table public.premium_test_grants(
    user_id uuid primary key references auth.users(id) on delete cascade,expires_at timestamptz not null,
    created_at timestamptz not null default now(),note text not null default 'Internal Premium test access; not a Stripe subscription',check(expires_at>created_at));
   create table public.subscription_anchors(
    user_id uuid primary key references auth.users(id) on delete cascade,
    started_on date not null check(started_on>='1900-01-01'::date and started_on<=current_date+1),
    source text not null check(char_length(source) between 1 and 80),created_at timestamptz not null default now());
   alter table public.billing_customers enable row level security;
   alter table public.billing_subscriptions enable row level security;
   alter table public.premium_test_grants enable row level security;
   alter table public.subscription_anchors enable row level security;
   create policy owner_select on public.billing_subscriptions for select to authenticated using(user_id=(select auth.uid()));
   create policy owner_select on public.premium_test_grants for select to authenticated using(user_id=(select auth.uid()));
   create policy owner_select on public.subscription_anchors for select to authenticated using(user_id=(select auth.uid()));
   grant select on public.billing_subscriptions,public.premium_test_grants,public.subscription_anchors to authenticated;
   grant all on public.billing_customers,public.billing_subscriptions,public.premium_test_grants,public.subscription_anchors to service_role;
  `);
  await db.exec(await readFile(new URL('../db/billing-launch.sql',import.meta.url),'utf8'));
  const role=async(name,user='')=>{assert.ok(['anon','authenticated','service_role'].includes(name));await db.exec(`reset role;set role ${name}`);await db.query("select set_config('test.uid',$1,false)",[user]);};
  const reset=async(n=3)=>{
   await db.exec('reset role;truncate public.billing_checkout_attempts,public.billing_risk_flags,public.billing_customers,public.billing_subscriptions,public.premium_test_grants,public.subscription_anchors,auth.users cascade');
   const users=Array.from({length:n},(_,i)=>uid(i+1)),customers=users.map((_,i)=>customer(i+1));
   await db.query('insert into auth.users(id) select unnest($1::uuid[])',[users]);
   await db.query('insert into public.billing_customers(user_id,stripe_customer_id) select * from unnest($1::uuid[],$2::text[])',[users,customers]);
   await role('service_role');
  };
  const rpc=async(name,args=[],casts=[])=>{
   assert.match(name,/^billing_[a-z_0-9]+$/);
   return (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}${casts[i]?'::'+casts[i]:''}`).join(',')}) as result`,args)).rows[0].result;
  };
  const begin=(n=1,plan='launch')=>rpc('billing_begin_checkout',[uid(n),plan,customer(n),`price_${plan}`]);
  const attach=(a,n=1)=>rpc('billing_attach_checkout',[a.id,session(n),checkoutUrl(n)]);
  const settle=(a,status='completed',n=1,sub=`sub_Test${n}`)=>rpc('billing_settle_checkout',[a.id,status,session(n),sub]);
  const remaining=()=>rpc('billing_launch_remaining');
  const get=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
  const addSub=async(n=1,overrides={})=>{
   const value={stripe_subscription_id:`sub_User${n}`,stripe_customer_id:customer(n),status:'active',plan:'monthly',unit_amount:299,stripe_price_id:'price_monthly',paid_until:new Date(Date.now()+86400000).toISOString(),trial_until:null,original_started_at:new Date(Date.now()-86400000).toISOString(),access_blocked:false,cancel_at_period_end:false,...overrides};
   await rpc('billing_save_snapshot_v2',[uid(n),JSON.stringify(value),new Date().toISOString()],['uuid','jsonb','timestamptz']);return value;
  };

  await t.test('service-only functions use invoker rights and protected tables have RLS',async()=>{
   const functions=(await db.query("select proname,prosecdef from pg_proc where pronamespace='public'::regnamespace and (proname like 'billing_%' or proname='sobrizen_has_premium')")).rows;
   assert.equal(functions.length,6);assert.ok(functions.every(f=>f.prosecdef===false));
   const tables=(await db.query("select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname in ('billing_launch_pool','billing_checkout_attempts','billing_risk_flags')")).rows;
   assert.equal(tables.length,3);assert.ok(tables.every(r=>r.relrowsecurity));
  });

  await t.test('100 launch reservations succeed, the 101st is refused and monthly stays available',async()=>{
   await reset(102);assert.equal(await remaining(),100);
   const outcomes=await Promise.allSettled(Array.from({length:101},(_,i)=>begin(i+1)));
   assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,100);
   const rejected=outcomes.filter(r=>r.status==='rejected');assert.equal(rejected.length,1);assert.match(rejected[0].reason.message,/LAUNCH_SOLD_OUT/);
   assert.equal(await remaining(),0);
   assert.equal((await get("select count(*)::int as n from public.billing_checkout_attempts where plan='launch'")).n,100);
   assert.equal((await begin(102,'monthly')).plan,'monthly');assert.equal(await remaining(),0);
  });

  await t.test('retries return one pending attempt and cannot reserve a second plan or another customer',async()=>{
   await reset();const a=await begin();const again=await begin();assert.equal(a.id,again.id);assert.equal(a.trial_enabled,true);
   assert.equal(Date.parse(a.expires_at)-Date.parse(a.created_at),3600000);
   await assert.rejects(begin(1,'annual'),/CHECKOUT_PLAN_PENDING/);
   await assert.rejects(rpc('billing_begin_checkout',[uid(1),'launch',customer(2),'price_launch']),/BILLING_CUSTOMER_MISMATCH/);
   assert.equal((await get('select count(*)::int as n from public.billing_checkout_attempts')).n,1);assert.equal(await remaining(),99);
  });

  await t.test('attachment is idempotent, matching session is required and a completed seat cannot expire',async()=>{
   await reset();const a=await begin();const attached=await attach(a);assert.equal(attached.status,'open');assert.equal((await attach(a)).id,a.id);
   await assert.rejects(attach(a,2),/CHECKOUT_STATE_CONFLICT/);
   await assert.rejects(settle(a,'expired',2,null),/CHECKOUT_SESSION_MISMATCH/);
   await assert.rejects(rpc('billing_settle_checkout',[a.id,'expired',null,null]),/CHECKOUT_SESSION_MISMATCH/);
   const done=await settle(a);assert.equal(done.status,'completed');assert.equal(await remaining(),99);
   assert.equal((await settle(a,'expired',1,null)).status,'completed');assert.equal(await remaining(),99);
  });

  await t.test('elapsed reservation time alone does not recycle a seat; matching confirmed expiry does',async()=>{
   await reset();const a=await begin();await attach(a);
   await db.query("update public.billing_checkout_attempts set created_at=now()-interval '3 hours',expires_at=now()-interval '1 hour' where id=$1",[a.id]);
   assert.equal(await remaining(),99);await assert.rejects(settle(a,'failed',1,null),/CHECKOUT_EXPIRY_REQUIRED/);
   assert.equal((await settle(a,'expired',1,null)).status,'expired');assert.equal(await remaining(),100);
   assert.equal((await settle(a,'expired',1,null)).status,'expired');
   const retry=await begin();assert.notEqual(retry.id,a.id);assert.equal(retry.trial_enabled,true);
   await assert.rejects(settle(a,'completed',1),/CHECKOUT_STATE_CONFLICT/);
  });

  await t.test('completed launch history survives user deletion and still consumes capacity',async()=>{
   await reset();const a=await begin();await attach(a);await settle(a);
   await db.exec('reset role');await db.query('delete from auth.users where id=$1',[uid(1)]);await role('service_role');
   const retained=await get('select * from public.billing_checkout_attempts where id=$1',[a.id]);assert.equal(retained.user_id,null);assert.equal(retained.status,'completed');
   assert.equal(await remaining(),99);assert.equal((await get('select count(*)::int as n from public.billing_customers where user_id=$1',[uid(1)])).n,0);
  });

  await t.test('one completed trial permanently consumes eligibility; retries preserve its first timestamp',async()=>{
   await reset();const a=await begin();await attach(a);await settle(a);
   const first=(await get('select trial_used_at from public.billing_customers where user_id=$1',[uid(1)])).trial_used_at;
   assert.ok(first);await settle(a);const repeated=(await get('select trial_used_at from public.billing_customers where user_id=$1',[uid(1)])).trial_used_at;
   assert.equal(+new Date(repeated),+new Date(first));
   const next=await begin(1,'monthly');assert.equal(next.trial_enabled,false);
   await addSub(2,{status:'canceled',paid_until:null});assert.equal((await begin(2,'annual')).trial_enabled,false);
   assert.equal((await begin(3)).trial_enabled,true);
  });

  await t.test('malformed or NULL Checkout identity cannot attach or complete an allocation',async()=>{
   await reset();const a=await begin();
   for(const [id,url] of [[null,checkoutUrl(1)],[session(1),null],[null,null],['not-a-session',checkoutUrl(1)],[session(1),'https://evil.example/']]){
    await assert.rejects(rpc('billing_attach_checkout',[a.id,id,url]),/INVALID_CHECKOUT/);
   }
   for(const [id,sub] of [[null,'sub_Valid'],[session(1),null],['not-a-session','sub_Valid'],[session(1),'not-a-subscription']]){
    await assert.rejects(rpc('billing_settle_checkout',[a.id,'completed',id,sub]),/INVALID_CHECKOUT_COMPLETION/);
   }
   assert.equal((await get('select status from public.billing_checkout_attempts where id=$1',[a.id])).status,'reserved');
  });

  await t.test('anonymous and authenticated callers cannot allocate, settle, inspect or edit billing internals',async()=>{
   await reset();const a=await begin();await addSub(1);
   for(const name of ['anon','authenticated']){
    await role(name,uid(1));
    for(const [func,args] of [['billing_launch_remaining',[]],['billing_begin_checkout',[uid(1),'launch',customer(1),'price_launch']],['billing_attach_checkout',[a.id,session(1),checkoutUrl(1)]],['billing_settle_checkout',[a.id,'completed',session(1),'sub_Test']],['billing_save_snapshot_v2',[uid(1),'{}',new Date().toISOString()]]]){
     await assert.rejects(rpc(func,args),/permission denied/);
    }
    for(const table of ['billing_launch_pool','billing_checkout_attempts','billing_risk_flags']){
     await assert.rejects(db.query(`select * from public.${table}`),/permission denied/);
     await assert.rejects(db.query(`delete from public.${table}`),/permission denied/);
    }
    await assert.rejects(db.query("update public.billing_subscriptions set status='active'"),/permission denied/);
    await assert.rejects(db.query("insert into public.premium_test_grants(user_id,expires_at) values($1,now()+interval '1 year')",[uid(1)]),/permission denied/);
   }
   await role('anon');await assert.rejects(db.query('select public.sobrizen_has_premium()'),/permission denied/);
   await role('authenticated',uid(2));assert.equal((await db.query('select * from public.billing_subscriptions')).rows.length,0);
  });

  await t.test('Premium requires own verified paid time, valid trial or protected unexpired test grant',async()=>{
   await reset();await addSub(1);await role('authenticated',uid(1));
   const premium=async()=>Boolean((await get('select public.sobrizen_has_premium() as allowed')).allowed);
   assert.equal(await premium(),true);await role('authenticated',uid(2));assert.equal(await premium(),false);
   const change=async(sql)=>{await role('service_role');await db.query(sql);await role('authenticated',uid(1));};
   await change("update public.billing_subscriptions set access_blocked=true");assert.equal(await premium(),false);
   await change("update public.billing_subscriptions set access_blocked=false,status='canceled'");assert.equal(await premium(),false);
   await change("update public.billing_subscriptions set status='past_due'");assert.equal(await premium(),true);
   await change("update public.billing_subscriptions set paid_until=now()-interval '1 second'");assert.equal(await premium(),false);
   await change("update public.billing_subscriptions set status='trialing',trial_until=now()+interval '1 day'");assert.equal(await premium(),true);
   await change("update public.billing_subscriptions set trial_until=now()-interval '1 second'");assert.equal(await premium(),false);
   await change(`insert into public.premium_test_grants(user_id,expires_at) values('${uid(1)}',now()+interval '1 hour')`);assert.equal(await premium(),true);
   await change("update public.premium_test_grants set created_at=now()-interval '2 days',expires_at=now()-interval '1 day'");assert.equal(await premium(),false);
  });

  await t.test('verified snapshots preserve original start, resist stale callbacks and consume trial only once',async()=>{
   await reset();const value=await addSub(1);const first=(await get('select trial_used_at from public.billing_customers where user_id=$1',[uid(1)])).trial_used_at;assert.ok(first);
   const newer={...value,status:'canceled',access_blocked:true,original_started_at:new Date().toISOString()};
   await rpc('billing_save_snapshot_v2',[uid(1),JSON.stringify(newer),new Date(Date.now()+10000).toISOString()]);
   await rpc('billing_save_snapshot_v2',[uid(1),JSON.stringify(value),new Date(Date.now()-10000).toISOString()]);
   const stored=await get('select * from public.billing_subscriptions where user_id=$1',[uid(1)]);
   assert.equal(stored.status,'canceled');assert.equal(stored.access_blocked,true);assert.equal(+new Date(stored.original_started_at),Date.parse(value.original_started_at));
   assert.equal(+new Date((await get('select trial_used_at from public.billing_customers where user_id=$1',[uid(1)])).trial_used_at),+new Date(first));
   await assert.rejects(rpc('billing_save_snapshot_v2',[uid(2),JSON.stringify(value),new Date().toISOString()]),/BILLING_CUSTOMER_MISMATCH/);
  });
 }finally{await db.close();}
});
