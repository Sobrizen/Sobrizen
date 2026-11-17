import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {JSDOM} from 'jsdom';
import {publicPageEvent,startAnalytics} from '../analytics.mjs';
import {createAdminDashboard} from '../admin.mjs';

const OWNER='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
test('statistics authorize only a confirmed operator and return aggregates with Paris calendar boundaries',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
      create table auth.users(id uuid primary key,created_at timestamptz,email_confirmed_at timestamptz,deleted_at timestamptz,is_anonymous boolean default false);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
      create table public.billing_subscriptions(status text,paid_until timestamptz,trial_until timestamptz,access_blocked boolean,cancel_at_period_end boolean,plan text);
      insert into auth.users values('${OWNER}',now(),now(),null,false),('${OTHER}',now(),now(),null,false),
        ('33333333-3333-4333-8333-333333333333',now(),now(),now(),false),
        ('44444444-4444-4444-8444-444444444444',now(),now(),null,true),
        ('55555555-5555-4555-8555-555555555555',((now() at time zone 'Europe/Paris')::date)::timestamp at time zone 'Europe/Paris'-interval '1 millisecond',null,null,false);
      insert into public.billing_subscriptions values
        ('active',now()+interval '1 day',null,false,false,'annual'),
        ('active',now()-interval '1 day',null,false,false,'monthly'),
        ('active',now()+interval '1 day',null,true,false,'monthly'),
        ('trialing',null,now()+interval '1 day',false,false,'monthly');`);
    await db.exec(readFileSync(new URL('../schema/admin-statistics.sql',import.meta.url),'utf8'));
    await db.exec(`insert into sobrizen_admin.operators(user_id) values('${OWNER}');`);
    const privilege=await db.query(`select has_table_privilege('authenticated','sobrizen_admin.operators','SELECT') as read,
      has_table_privilege('authenticated','sobrizen_admin.operators','INSERT') as enroll,
      has_function_privilege('anon','public.sobrizen_admin_statistics(integer)','EXECUTE') as anon,
      (select prosecdef from pg_proc where oid='public.sobrizen_admin_statistics(integer)'::regprocedure) as public_definer`);
    assert.deepEqual(privilege.rows[0],{read:false,enroll:false,anon:false,public_definer:false});
    async function call(uid,days=7){
      await db.exec('set role authenticated');
      try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);return (await db.query('select public.sobrizen_admin_statistics($1) as data',[days])).rows[0].data;}
      finally{await db.exec('reset role');}
    }
    await assert.rejects(call(OTHER),error=>error.code==='42501');
    await assert.rejects(call(''),error=>error.code==='42501');
    await assert.rejects(call(OWNER,365),error=>error.code==='22023');
    const data=await call(OWNER);
    assert.equal(data.accounts.total,3);assert.equal(data.accounts.today,2);assert.equal(data.accounts.yesterday,1);
    assert.equal(data.accounts.period,3);assert.equal(data.daily.length,7);assert.equal(data.daily.at(-1).registrations,2);
    assert.equal(data.subscriptions.active_paid,1);assert.equal(data.subscriptions.trialing,1);assert.deepEqual(data.plans,[{plan:'annual',count:1}]);
    assert.equal(JSON.stringify(data).includes(OWNER),false);assert.equal(JSON.stringify(data).includes('@'),false);
    await db.exec(`delete from sobrizen_admin.operators where user_id='${OWNER}'`);
    await assert.rejects(call(OWNER),error=>error.code==='42501');
  }finally{await db.close();}
});

test('traffic removes query strings and fragments and rejects authentication callbacks, private pages and custom events',()=>{
  assert.deepEqual(publicPageEvent({type:'pageview',url:'https://www.sobrizen.com/?email=private@example.test#journal',data:{secret:1}}),{type:'pageview',url:'https://www.sobrizen.com/'});
  assert.deepEqual(publicPageEvent({type:'pageview',url:'https://sobrizen.com/abonnement.html?subscribe=annual'}),{type:'pageview',url:'https://www.sobrizen.com/abonnement'});
  for(const url of ['https://www.sobrizen.com/admin','https://www.sobrizen.com/admin.html','https://www.sobrizen.com/journal','https://www.sobrizen.com/?code=private','https://www.sobrizen.com/#access_token=private','https://other.test/'])assert.equal(publicPageEvent({type:'pageview',url}),null);
  assert.equal(publicPageEvent({type:'event',url:'https://www.sobrizen.com/',data:{name:'health'}}),null);
  const dom=new JSDOM('<head></head>',{url:'https://www.sobrizen.com/'});
  assert.equal(startAnalytics(dom.window,dom.window.document),true);assert.equal(startAnalytics(dom.window,dom.window.document),false);
  assert.equal(dom.window.document.querySelectorAll('[data-sobrizen-analytics]').length,1);assert.equal(dom.window.vaq[0][0],'beforeSend');dom.window.close();
  const preview=new JSDOM('<head></head>',{url:'http://localhost:4173/'});assert.equal(startAnalytics(preview.window,preview.window.document),false);preview.window.close();
});

const snapshot={accounts:{total:6,confirmed:6,period:4,today:0,yesterday:1},subscriptions:{active_paid:2,trialing:0,payment_pending:0,cancel_at_period_end:0},daily:[{day:'2026-11-17',registrations:0}],plans:[{plan:'annual',count:2}],from:'2026-11-11',through:'2026-11-17',generated_at:'2026-11-17T12:00:00Z'};
function harness(rpc){
  const dom=new JSDOM(readFileSync(new URL('../admin.html',import.meta.url),'utf8'),{url:'https://www.sobrizen.com/admin'});
  const client={rpc,auth:{onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};},async signOut(){return {error:null};},async signInWithPassword(){return {error:null};}}};
  const dashboard=createAdminDashboard({client,doc:dom.window.document,win:dom.window});
  return {dom,dashboard,$:id=>dom.window.document.getElementById(id),close(){dashboard.destroy();dom.window.close();}};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
test('admin page uses real results and clears all private figures when the session ends',async()=>{
  const h=harness(async()=>({data:snapshot,error:null}));
  try{h.dashboard.sessionChanged({user:{id:OWNER,email:'owner@example.test'}});await tick();assert.equal(h.$('total').textContent,'6');assert.equal(h.$('dashboard').hidden,false);
    h.dashboard.sessionChanged(null);assert.equal(h.$('dashboard').hidden,true);assert.equal(h.$('total').textContent,'');assert.equal(h.$('daily').children.length,0);assert.equal(h.$('accountLabel').textContent,'');
  }finally{h.close();}
});
test('late statistics cannot appear after a logout or an account switch',async()=>{
  let resolve;const h=harness(()=>new Promise(done=>{resolve=done;}));
  try{h.dashboard.sessionChanged({user:{id:OWNER,email:'owner@example.test'}});await tick();h.dashboard.sessionChanged(null);resolve({data:snapshot,error:null});await tick();assert.equal(h.$('total').textContent,'');assert.equal(h.$('dashboard').hidden,true);}
  finally{h.close();}
});
test('an unauthorized account sees an access message and no private numbers',async()=>{
  const h=harness(async()=>({data:null,error:{code:'42501'}}));
  try{h.dashboard.sessionChanged({user:{id:OTHER,email:'other@example.test'}});await tick();assert.match(h.$('status').textContent,/n’a pas accès/);assert.equal(h.$('total').textContent,'');assert.equal(h.$('daily').children.length,0);}
  finally{h.close();}
});
