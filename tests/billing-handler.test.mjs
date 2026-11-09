/** Real request handler, fake Stripe/DB/Auth only. No real network or money. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createBillingHandler,BillingFault} from '../billing/handler.mjs';
import {CFG,PLANS,membership} from '../billing/core.mjs';
const UID='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const START=Date.parse('2026-11-09T22:00:00Z'),SECRET='whsec_QAFIXTUREONLY123';
const copy=value=>structuredClone(value),uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const paidPlan=(plan='monthly')=>({id:PLANS[plan].stripePriceId,active:true,livemode:true,type:'recurring',product:CFG.product,currency:'eur',unit_amount:PLANS[plan].amount,recurring:{interval:PLANS[plan].interval,interval_count:1}});
function fixture(){
  const state={now:START,config:{sales_enabled:true,legal_ready:true,tax_ready:true,hosting_ready:true,premium_features_ready:true,terms_version:CFG.termsVersion},account:{id:CFG.account,charges_enabled:true},env:{SUPABASE_URL:'https://qa.invalid',SUPABASE_SERVICE_ROLE_KEY:'qa-service-fixture-only',STRIPE_SECRET_KEY:'sk_live_QAFIXTUREONLY',STRIPE_WEBHOOK_SECRET:SECRET},auth:{id:UID,email:'qa@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z'},authStatus:200,dbCalls:[],stripeCalls:[],authCalls:[],logs:[],serial:10,locked:false,lockAllowed:true,remainingOverride:undefined,checkoutFailure:null,fetchFailures:false,prices:Object.fromEntries(Object.keys(PLANS).map(plan=>[PLANS[plan].stripePriceId,paidPlan(plan)])),subscriptions:[],invoices:[],invoicePayments:[],charges:[],disputes:[],intents:[],sessions:[],tables:{billing_customers:[{user_id:UID,stripe_customer_id:'cus_QA1',trial_used_at:null}],billing_subscriptions:[],billing_checkout_attempts:[],billing_consents:[],billing_events:[],billing_risk_flags:[],billing_requests:[]},checked:new Map()};
  const remaining=()=>state.remainingOverride===undefined?100-state.tables.billing_checkout_attempts.filter(row=>row.plan==='launch'&&['reserved','open','completed'].includes(row.status)).length:state.remainingOverride;
  function matches(row,params){
    for(const [key,condition] of params){if(['select','order','limit'].includes(key))continue;
      if(condition.startsWith('eq.')){const expected=condition.slice(3),value=row[key];if(String(value)!==expected)return false;}
      else if(condition.startsWith('lt.')){if(!(String(row[key])<condition.slice(3)))return false;}
      else if(condition.startsWith('in.(')){if(!condition.slice(4,-1).split(',').includes(String(row[key])))return false;}
      else throw Error('Unsupported QA filter '+condition);
    }return true;
  }
  async function database(path,method='GET',body,prefer){
    state.dbCalls.push({path,method,body:copy(body),prefer});
    if(path.startsWith('rpc/')){
      const name=path.slice(4);
      if(name==='billing_get_webhook_secret')return state.storedWebhookSecret||null;
      if(name==='billing_launch_remaining')return remaining();
      if(name==='billing_take_checkout_lock'){if(!state.lockAllowed||state.locked)return false;state.locked=true;return true;}
      if(name==='billing_release_checkout_lock'){state.locked=false;return null;}
      if(name==='billing_begin_checkout'){
        assert.equal(state.locked,true,'Attempt reservation must be inside the checkout lock');
        const old=state.tables.billing_checkout_attempts.find(row=>row.user_id===body.p_user_id&&['reserved','open'].includes(row.status));
        if(old){if(old.plan!==body.p_plan)throw new BillingFault('CHECKOUT_PLAN_PENDING',409);return copy(old);}
        if(body.p_plan==='launch'&&remaining()<=0)throw new BillingFault('LAUNCH_SOLD_OUT',409);
        const c=state.tables.billing_customers.find(row=>row.user_id===body.p_user_id);
        const attempt={id:uuid(++state.serial),user_id:body.p_user_id,plan:body.p_plan,stripe_customer_id:body.p_customer_id,stripe_price_id:body.p_price_id,trial_enabled:!c?.trial_used_at,status:'reserved',created_at:new Date(state.now).toISOString(),expires_at:new Date(state.now+CFG.checkoutSeconds*1000).toISOString()};state.tables.billing_checkout_attempts.push(attempt);return copy(attempt);
      }
      if(name==='billing_attach_checkout'){
        const attempt=state.tables.billing_checkout_attempts.find(row=>row.id===body.p_attempt_id);assert.ok(attempt);Object.assign(attempt,{stripe_session_id:body.p_session_id,stripe_session_url:body.p_session_url,status:'open'});return copy(attempt);
      }
      if(name==='billing_settle_checkout'){
        const attempt=state.tables.billing_checkout_attempts.find(row=>row.id===body.p_attempt_id);assert.ok(attempt);attempt.status=body.p_status;if(body.p_session_id)attempt.stripe_session_id=body.p_session_id;if(body.p_subscription_id)attempt.stripe_subscription_id=body.p_subscription_id;
        if(body.p_status==='completed'&&attempt.trial_enabled){const c=state.tables.billing_customers.find(row=>row.user_id===attempt.user_id);c.trial_used_at=new Date(state.now).toISOString();}return copy(attempt);
      }
      if(name==='billing_save_snapshot_v2'){
        const snapshot=copy(body.p_snapshot),key=snapshot.stripe_subscription_id;
        if((state.checked.get(key)||'')>body.p_checked_at)return null;
        state.checked.set(key,body.p_checked_at);delete snapshot.premium;
        const old=state.tables.billing_subscriptions.find(row=>row.stripe_subscription_id===key);if(old)Object.assign(old,snapshot,{user_id:body.p_user_id});else state.tables.billing_subscriptions.push({...snapshot,user_id:body.p_user_id});return null;
      }
      throw Error('Unexpected RPC '+name);
    }
    const url=new URL(path,'https://qa.invalid/'),table=url.pathname.slice(1);
    if(table==='billing_config')return [copy(state.config)];
    assert.ok(Object.hasOwn(state.tables,table),'Unexpected table '+table);const rows=state.tables[table];
    if(method==='GET'){
      let result=rows.filter(row=>matches(row,url.searchParams));
      if(url.searchParams.has('order')){const [key,direction]=url.searchParams.get('order').split('.');result.sort((a,b)=>String(a[key]).localeCompare(String(b[key]))*(direction==='desc'?-1:1));}
      if(url.searchParams.has('limit'))result=result.slice(0,Number(url.searchParams.get('limit')));
      const select=url.searchParams.get('select');if(select&&select!=='*')result=result.map(row=>Object.fromEntries(select.split(',').filter(key=>key in row).map(key=>[key,row[key]])));return copy(result);
    }
    assert.equal(method,'POST');
    if(table==='billing_risk_flags'){
      const old=rows.find(row=>row.stripe_charge_id===body.stripe_charge_id&&row.reason===body.reason);if(old)Object.assign(old,copy(body));else rows.push(copy(body));return [copy(body)];
    }
    if(table==='billing_events'&&rows.some(row=>row.stripe_event_id===body.stripe_event_id))return [];
    rows.push(copy(body));return [copy(body)];
  }
  const wrap=(name,fn)=>async(...args)=>{state.stripeCalls.push({name,args:copy(args)});return copy(await fn(...args));};
  const list=(key,filter=()=>true)=>wrap(key+'.list',params=>({data:state[key].filter(row=>filter(row,params)),has_more:false}));
  const retrieve=key=>wrap(key+'.retrieve',id=>{const value=state[key].find(row=>row.id===id);if(!value)throw Error('Missing QA '+key+' '+id);return value;});
  const stripe={accounts:{retrieve:wrap('accounts.retrieve',()=>state.account)},prices:{retrieve:wrap('prices.retrieve',id=>{assert.ok(state.prices[id],'Unknown configured price');return state.prices[id];})},customers:{create:wrap('customers.create',params=>({id:'cus_QA1',...params}))},subscriptions:{list:list('subscriptions',(row,params)=>row.customer===params.customer),retrieve:retrieve('subscriptions')},invoices:{list:list('invoices',(row,params)=>row.subscription===params.subscription&&row.status===params.status),retrieve:retrieve('invoices')},invoicePayments:{list:list('invoicePayments',(row,params)=>params.invoice?row.invoice===params.invoice:true)},charges:{retrieve:retrieve('charges')},disputes:{list:list('disputes',(row,params)=>row.charge===params.charge),retrieve:retrieve('disputes')},paymentIntents:{retrieve:wrap('paymentIntents.retrieve',id=>state.intents.find(row=>row.id===id))},checkout:{sessions:{list:wrap('checkout.sessions.list',params=>({data:state.sessions.filter(row=>row.customer===params.customer),has_more:false})),retrieve:wrap('checkout.sessions.retrieve',id=>{const session=state.sessions.find(row=>row.id===id);if(!session)throw Error('Missing QA session');return session;}),expire:wrap('checkout.sessions.expire',id=>{const session=state.sessions.find(row=>row.id===id);assert.equal(session.status,'open');session.status='expired';return session;}),create:wrap('checkout.sessions.create',(params,options)=>{
    const failure=state.checkoutFailure;state.checkoutFailure=null;
    if(failure==='definite')throw Object.assign(Error('Invalid QA parameter'),{type:'StripeInvalidRequestError',statusCode:400});
    if(failure==='before')throw Error('Network interrupted before QA create');
    let session=state.sessions.find(row=>row.idempotencyKey===options.idempotencyKey);
    if(!session){session={...copy(params),id:'cs_live_QA'+(++state.serial),status:'open',livemode:true,url:'https://checkout.stripe.com/c/pay/QA'+state.serial,idempotencyKey:options.idempotencyKey};state.sessions.push(session);}
    if(failure==='after')throw Error('Network interrupted after QA create');return session;
  })}},billingPortal:{sessions:{create:wrap('billingPortal.sessions.create',()=>({url:'https://billing.stripe.com/p/session/QA'}))}}};
  const fetcher=async(url,options)=>{state.authCalls.push({url,headers:options.headers});assert.equal(url,'https://qa.invalid/auth/v1/user','Tests must not perform real service requests');if(state.fetchFailures)throw Error('Offline QA');return new Response(JSON.stringify(state.auth),{status:state.authStatus,headers:{'Content-Type':'application/json'}});};
  const handler=createBillingHandler({env:key=>state.env[key]||'',stripe,database,fetch:fetcher,now:()=>state.now,logger:{error:(...args)=>state.logs.push(args)}});
  async function send(route,input={},options={}){
    const method=options.method||'POST',headers={'Origin':CFG.site,'Authorization':'Bearer eyJQAFIXTUREONLY','Content-Type':'application/json',...options.headers};
    const response=await handler(new Request('https://qa.invalid/functions/v1/sobrizen-billing/'+route,{method,headers,...(['GET','OPTIONS'].includes(method)?{}:{body:options.raw??JSON.stringify(input)})}));
    return {status:response.status,body:response.status===204?null:await response.json(),headers:response.headers};
  }
  const checkout=(plan='monthly',extra={})=>send('checkout',{plan,expected_unit_amount:PLANS[plan]?.amount,expected_trial:true,terms_version:CFG.termsVersion,accept_terms:true,...extra});
  async function event(type,object,{eventId='evt_QA'+(++state.serial),timestamp=Math.floor(state.now/1000),mode=true,account=CFG.account,secret=SECRET}={}){
    const raw=JSON.stringify({id:eventId,type,livemode:mode,account,data:{object}}),signature=createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest('hex');
    return send('webhook',{}, {raw,headers:{Origin:'','stripe-signature':`t=${timestamp},v1=${signature}`}});
  }
  function subscription({plan='monthly',status='active',trial=false,paid=false}={}){
    const sec=Math.floor(state.now/1000),sub={id:'sub_QA1',customer:'cus_QA1',livemode:true,status,start_date:sec-3600,metadata:{app:'sobrizen',user_id:UID},items:{data:[{quantity:1,price:paidPlan(plan)}]},cancel_at_period_end:false,...(trial?{trial_start:sec-3600,trial_end:sec-3600+7*86400}:{})};state.subscriptions=[sub];
    if(paid){
      const charge={id:'ch_QA1',livemode:true,status:'succeeded',paid:true,currency:'eur',amount:PLANS[plan].amount,amount_refunded:0,refunded:false,disputed:false,invoice:'in_QA1',payment_intent:'pi_QA1'};
      const invoice={id:'in_QA1',livemode:true,subscription:sub.id,status:'paid',currency:'eur',amount_paid:PLANS[plan].amount,paid_out_of_band:false,lines:{data:[{price:PLANS[plan].stripePriceId,quantity:1,period:{start:sec-3600,end:sec+29*86400}}]}};
      state.charges=[charge];state.invoices=[invoice];state.invoicePayments=[{id:'inpay_QA1',invoice:invoice.id,livemode:true,status:'paid',payment:{type:'charge',charge:charge.id}}];
    }return sub;
  }
  const premium=()=>membership(state.tables.billing_subscriptions,state.now).premium;
  const financialCreates=()=>state.stripeCalls.filter(call=>/\.create$/.test(call.name));
  return {state,send,checkout,event,subscription,premium,financialCreates,remaining};
}

test('health fails closed for every readiness flag, wrong account, invalid secret/key and invalid quota',async t=>{
  const changes=[...['sales_enabled','legal_ready','tax_ready','hosting_ready','premium_features_ready'].map(key=>[key,h=>h.state.config[key]=false]),['terms version',h=>h.state.config.terms_version='old'],['test key',h=>h.state.env.STRIPE_SECRET_KEY='sk_test_QA'],['missing webhook',h=>h.state.env.STRIPE_WEBHOOK_SECRET=''],['invalid webhook',h=>h.state.env.STRIPE_WEBHOOK_SECRET='not-a-secret'],['wrong account',h=>h.state.account.id='acct_OTHER'],['charges disabled',h=>h.state.account.charges_enabled=false],['quota high',h=>h.state.remainingOverride=101],['quota negative',h=>h.state.remainingOverride=-1],['quota missing',h=>h.state.remainingOverride=null]];
  for(const [name,change] of changes)await t.test(name,async()=>{const h=fixture();change(h);const r=await h.send('health',{}, {method:'GET'});assert.equal(r.status,200);assert.equal(r.body.sales_open,false);assert.equal(h.financialCreates().length,0);assert.equal(h.premium(),false);});
  const h=fixture(),r=await h.send('health',{}, {method:'GET'});assert.equal(r.body.sales_open,true);assert.equal(r.body.offer.trial_days,7);assert.equal(r.body.offer.monthly.amount,299);assert.equal(r.body.offer.launch.amount,1999);assert.equal(r.body.offer.launch.remaining,100);assert.equal(h.financialCreates().length,0);
});

test('checkout verifies email through Auth and rejects unknown identities before any Stripe/DB mutation',async t=>{
  for(const [name,change,code]of [['unconfirmed',h=>h.state.auth.email_confirmed_at=null,'VERIFIED_EMAIL_REQUIRED'],['bad UUID',h=>h.state.auth.id='invalid','VERIFIED_EMAIL_REQUIRED'],['expired token',h=>h.state.authStatus=401,'AUTH_REQUIRED'],['auth offline',h=>h.state.fetchFailures=true,'AUTH_REQUIRED']])await t.test(name,async()=>{const h=fixture();change(h);const r=await h.checkout();assert.equal(r.body.error,code);assert.equal(h.state.dbCalls.length,0);assert.equal(h.state.stripeCalls.length,0);assert.equal(h.premium(),false);});
});

test('terms, displayed amount, inherited/unknown plans and sales gates are checked before creating anything',async t=>{
  for(const [label,extra,error]of [['terms absent',{accept_terms:false},'TERMS_REQUIRED'],['old terms',{terms_version:'old'},'TERMS_REQUIRED'],['wrong amount',{expected_unit_amount:1},'OFFER_CHANGED'],['inherited plan',{plan:'toString',expected_unit_amount:undefined},'OFFER_CHANGED'],['prototype plan',{plan:'__proto__',expected_unit_amount:undefined},'OFFER_CHANGED'],['unknown plan',{plan:'unknown'},'OFFER_CHANGED']])await t.test(label,async()=>{const h=fixture(),r=await h.checkout('monthly',extra);assert.equal(r.body.error,error);assert.equal(h.financialCreates().length,0);assert.equal(h.state.tables.billing_checkout_attempts.length,0);assert.equal(h.premium(),false);});
  const h=fixture();h.state.config.sales_enabled=false;assert.equal((await h.checkout()).body.error,'SALES_NOT_OPEN');assert.equal(h.state.stripeCalls.length,0);
});

test('configured price must be live, active, correct product, currency, amount and recurring period',async t=>{
  const changes=[['amount',p=>p.unit_amount=1],['inactive',p=>p.active=false],['test mode',p=>p.livemode=false],['product',p=>p.product='prod_OTHER'],['currency',p=>p.currency='usd'],['period',p=>p.recurring.interval='year'],['interval count',p=>p.recurring.interval_count=2]];
  for(const[name,change]of changes)await t.test(name,async()=>{const h=fixture();change(h.state.prices[PLANS.monthly.stripePriceId]);const r=await h.checkout();assert.equal(r.body.error,'PRICE_MISMATCH');assert.equal(h.financialCreates().length,0);assert.equal(h.state.locked,false);assert.equal(h.premium(),false);});
});

test('new checkout contains exact price, explicit owner, seven-day trial, stable attempt/idempotency and no Premium activation',async t=>{
  for(const plan of Object.keys(PLANS))await t.test(plan,async()=>{const h=fixture(),r=await h.checkout(plan);assert.equal(r.status,200);assert.equal(r.body.trial,true);assert.equal(h.premium(),false);assert.equal(h.state.tables.billing_subscriptions.length,0);const call=h.state.stripeCalls.find(call=>call.name==='checkout.sessions.create'),[params,opts]=call.args,attempt=h.state.tables.billing_checkout_attempts[0];assert.equal(params.line_items[0].price,PLANS[plan].stripePriceId);assert.equal(params.subscription_data.trial_period_days,7);assert.equal(params.payment_method_collection,'always');assert.equal(params.client_reference_id,UID);assert.equal(params.metadata.user_id,UID);assert.equal(params.metadata.checkout_attempt_id,attempt.id);assert.equal(params.metadata.terms_version,CFG.termsVersion);assert.equal(opts.idempotencyKey,'sobrizen-checkout-v2-'+attempt.id);assert.equal(params.expires_at,Math.floor(START/1000)+CFG.checkoutSeconds);assert.equal(h.state.tables.billing_consents[0].terms_version,CFG.termsVersion);assert.equal(h.remaining(),plan==='launch'?99:100);assert.equal(h.state.locked,false);});
});

test('used trial and active remote subscription cannot be silently replaced or trialed again',async()=>{
  const used=fixture();used.state.tables.billing_customers[0].trial_used_at=new Date(START-86400000).toISOString();assert.equal((await used.checkout()).body.error,'TRIAL_ELIGIBILITY_CHANGED');assert.equal(used.financialCreates().length,0);
  assert.equal((await used.checkout('monthly',{expected_trial:false})).status,200);const params=used.state.stripeCalls.find(call=>call.name==='checkout.sessions.create').args[0];assert.equal(Object.hasOwn(params.subscription_data,'trial_period_days'),false);assert.equal(used.premium(),false);
  const existing=fixture();existing.subscription({trial:true,status:'trialing'});assert.equal((await existing.checkout()).body.error,'EXISTING_SUBSCRIPTION');assert.equal(existing.state.stripeCalls.some(call=>call.name==='checkout.sessions.create'),false);assert.equal(existing.premium(),true,'Only the existing freshly verified Stripe trial may grant access');
});

test('status never creates customers, prices, checkout or portal sessions and cannot accept a claimed Premium from the client',async()=>{
  const h=fixture(),r=await h.send('status',{premium:true,status:'active',paid_until:'2099-01-01',session_id:'cs_live_FAKE'});assert.equal(r.status,200);assert.equal(r.body.premium,false);assert.equal(h.financialCreates().length,0);assert.equal(h.state.stripeCalls.length,0);assert.equal(h.state.tables.billing_subscriptions.length,0);
});

test('checkout retries reuse an existing open session and do not consume two launch slots',async()=>{
  const h=fixture();const first=await h.checkout('launch'),second=await h.checkout('launch');assert.equal(first.status,200);assert.equal(second.body.url,first.body.url);assert.equal(h.state.tables.billing_checkout_attempts.length,1);assert.equal(h.remaining(),99);assert.equal(h.state.stripeCalls.filter(call=>call.name==='checkout.sessions.create').length,1);assert.equal(h.premium(),false);
});

test('uncertain network failures preserve the reservation and recover without duplicate billable checkout',async t=>{
  for(const mode of ['before','after'])await t.test(mode,async()=>{const h=fixture();h.state.checkoutFailure=mode;assert.equal((await h.checkout('launch')).status,503);const attempt=h.state.tables.billing_checkout_attempts[0];assert.equal(attempt.status,'reserved');assert.equal(h.remaining(),99);assert.equal(h.premium(),false);const retry=await h.checkout('launch');assert.equal(retry.status,200);assert.equal(h.state.tables.billing_checkout_attempts.length,1);assert.equal(h.state.sessions.length,1);assert.equal(h.remaining(),99);const keys=h.state.stripeCalls.filter(call=>call.name==='checkout.sessions.create').map(call=>call.args[1].idempotencyKey);assert.equal(new Set(keys).size,1);assert.equal(h.state.locked,false);});
});

test('definite rejection releases a launch slot; sold-out and busy locks never create a session',async()=>{
  const h=fixture();h.state.checkoutFailure='definite';assert.equal((await h.checkout('launch')).status,503);assert.equal(h.state.tables.billing_checkout_attempts[0].status,'failed');assert.equal(h.remaining(),100);assert.equal(h.premium(),false);
  const full=fixture();full.state.remainingOverride=0;assert.equal((await full.checkout('launch')).body.error,'LAUNCH_SOLD_OUT');assert.equal(full.financialCreates().length,0);assert.equal(full.state.locked,false);
  const busy=fixture();busy.state.lockAllowed=false;assert.equal((await busy.checkout()).body.error,'CHECKOUT_IN_PROGRESS');assert.equal(busy.financialCreates().length,0);
});

test('a foreign session cannot be synchronized into the authenticated account or complete its attempt',async t=>{
  for(const key of ['client_reference_id','customer','metadata'])await t.test(key,async()=>{const h=fixture();await h.checkout();const session=h.state.sessions[0];session.status='complete';session.subscription='sub_QA1';h.subscription({trial:true,status:'trialing'});if(key==='metadata')session.metadata.user_id=OTHER;else session[key]=key==='customer'?'cus_OTHER':OTHER;const r=await h.send('sync',{session_id:session.id});assert.equal(r.body.error,'SESSION_NOT_OWNED');assert.equal(h.state.tables.billing_subscriptions.length,0);assert.equal(h.state.tables.billing_checkout_attempts[0].status,'open');assert.equal(h.premium(),false);});
});

test('a completed redirect alone grants no access; only a freshly retrieved valid seven-day trial can activate Premium',async()=>{
  const h=fixture();await h.checkout();h.subscription({status:'active'});const session=h.state.sessions[0];Object.assign(session,{status:'complete',subscription:'sub_QA1',payment_status:'paid'});const r=await h.send('sync',{session_id:session.id});assert.equal(r.status,200);assert.equal(r.body.premium,false);assert.equal(h.premium(),false);assert.ok(h.state.dbCalls.filter(call=>call.path==='rpc/billing_save_snapshot_v2').every(call=>call.body.p_snapshot.premium===false));
  const trial=fixture();await trial.checkout();trial.subscription({status:'trialing',trial:true});Object.assign(trial.state.sessions[0],{status:'complete',subscription:'sub_QA1'});const verified=await trial.send('sync',{session_id:trial.state.sessions[0].id});assert.equal(verified.body.premium,true);assert.equal(verified.body.trial,true);assert.equal(verified.body.paid_until,null);assert.ok(trial.state.tables.billing_customers[0].trial_used_at);
});

test('unpaid, unverifiable, refunded, disputed and overlong-trial snapshots stay non-Premium',async t=>{
  const cases=[['no invoices',h=>h.subscription()],['no collected charge',h=>{h.subscription({paid:true});h.state.invoicePayments=[];}],['partial refund',h=>{h.subscription({paid:true});h.state.charges[0].amount_refunded=1;}],['disputed',h=>{h.subscription({paid:true});h.state.charges[0].disputed=true;h.state.disputes=[{id:'dp_QA1',charge:'ch_QA1',status:'needs_response'}];}],['out of band',h=>{h.subscription({paid:true});h.state.invoices[0].paid_out_of_band=true;}],['eight-day trial',h=>{const sub=h.subscription({status:'trialing',trial:true});sub.trial_end=sub.trial_start+8*86400;}]];
  for(const[name,setup]of cases)await t.test(name,async()=>{const h=fixture();setup(h);const r=await h.send('sync');assert.equal(r.status,200);assert.equal(r.body.premium,false);assert.equal(h.premium(),false);});
});

test('invalid, stale, future, test-mode and wrong-account webhooks change nothing',async t=>{
  const cases=[['bad signature',{secret:'whsec_WRONG'}],['stale signature',{timestamp:Math.floor(START/1000)-301}],['future signature',{timestamp:Math.floor(START/1000)+301}],['test-mode',{mode:false}],['wrong account',{account:'acct_OTHER'}]];
  for(const[name,options]of cases)await t.test(name,async()=>{const h=fixture();h.subscription({paid:true});const r=await h.event('invoice.paid',{subscription:'sub_QA1'},options);assert.equal(r.body.error,'INVALID_SIGNATURE');assert.equal(h.state.stripeCalls.length,0);assert.equal(h.state.dbCalls.length,0);assert.equal(h.premium(),false);});
});

test('a signed paid event verifies live charges, stores a timestamped snapshot once, and a replay is idempotent',async()=>{
  const h=fixture();h.subscription({paid:true});const first=await h.event('invoice.paid',{subscription:'sub_QA1'},{eventId:'evt_REPEAT'});assert.equal(first.status,200);assert.equal(h.premium(),true);const calls=h.state.stripeCalls.length,snapshots=h.state.dbCalls.filter(call=>call.path==='rpc/billing_save_snapshot_v2');assert.equal(snapshots.length,1);assert.equal(snapshots[0].body.p_checked_at,new Date(START).toISOString());assert.equal(snapshots[0].body.p_user_id,UID);assert.ok(h.state.stripeCalls.some(call=>call.name==='invoicePayments.list'));assert.ok(h.state.stripeCalls.some(call=>call.name==='charges.retrieve'));
  assert.equal((await h.event('invoice.paid',{subscription:'sub_QA1'},{eventId:'evt_REPEAT'})).status,200);assert.equal(h.state.stripeCalls.length,calls);assert.equal(h.state.tables.billing_events.length,1);assert.equal(h.financialCreates().length,0);
});

test('refunds revoke verified access, and stale event payloads cannot regrant it over the live refunded charge',async()=>{
  const h=fixture();h.subscription({paid:true});assert.equal((await h.event('invoice.paid',{subscription:'sub_QA1'})).status,200);assert.equal(h.premium(),true);h.state.now+=1000;Object.assign(h.state.charges[0],{refunded:true,amount_refunded:299});const r=await h.event('charge.refunded',{id:'ch_QA1',refunded:false});assert.equal(r.status,200);assert.equal(h.premium(),false);assert.equal(h.state.tables.billing_subscriptions[0].paid_until,null);
  h.state.now+=1000;assert.equal((await h.event('invoice.paid',{subscription:'sub_QA1',status:'paid'})).status,200);assert.equal(h.premium(),false);assert.equal(h.financialCreates().length,0);
});

test('open disputes block access; only a freshly retrieved won dispute and valid paid charge restore it',async()=>{
  const h=fixture();h.subscription({paid:true});await h.event('invoice.paid',{subscription:'sub_QA1'});h.state.charges[0].disputed=true;h.state.disputes=[{id:'dp_QA1',charge:'ch_QA1',status:'needs_response'}];h.state.now+=1000;assert.equal((await h.event('charge.dispute.created',{id:'dp_QA1',charge:'ch_QA1',status:'won'})).status,200);assert.equal(h.premium(),false);assert.equal(h.state.tables.billing_risk_flags[0].active,true);
  h.state.disputes[0].status='won';h.state.now+=1000;assert.equal((await h.event('charge.dispute.closed',{id:'dp_QA1',charge:'ch_QA1',status:'lost'})).status,200);assert.equal(h.state.tables.billing_risk_flags[0].active,false);assert.equal(h.premium(),true);
  h.state.now+=1000;await h.event('charge.dispute.created',{id:'dp_QA1',charge:'ch_QA1',status:'needs_response'});assert.equal(h.premium(),true,'Current Stripe state wins over a stale event type/payload');assert.equal(h.financialCreates().length,0);
});

test('stale launch reconciliation may expire a checkout but cannot create a payment or activate an unpaid subscription',async()=>{
  const h=fixture();await h.checkout('launch');h.state.now+=CFG.checkoutSeconds*1000+1000;h.state.stripeCalls.length=0;const r=await h.send('status');assert.equal(r.status,200);assert.equal(r.body.premium,false);assert.equal(h.state.tables.billing_checkout_attempts[0].status,'expired');assert.equal(h.remaining(),100);assert.equal(h.financialCreates().length,0);assert.equal(h.state.stripeCalls.filter(call=>call.name==='checkout.sessions.expire').length,1);
});

test('processing failure is not acknowledged as delivered; a signed retry can succeed later',async()=>{
  const h=fixture();assert.equal((await h.event('invoice.paid',{subscription:'sub_MISSING'},{eventId:'evt_RETRY'})).status,503);assert.equal(h.state.tables.billing_events.length,0);assert.equal(h.premium(),false);const sub=h.subscription({paid:true});sub.id='sub_MISSING';h.state.invoices[0].subscription=sub.id;assert.equal((await h.event('invoice.paid',{subscription:sub.id},{eventId:'evt_RETRY'})).status,200);assert.equal(h.state.tables.billing_events.length,1);assert.equal(h.premium(),true);
});

test('CORS, invalid JSON, excessive bodies and explicit account requests cannot activate access',async()=>{
  const h=fixture();assert.equal((await h.send('health',{}, {method:'GET',headers:{Origin:'https://attacker.invalid'}})).status,403);assert.equal((await h.send('status',{}, {raw:'{'})).body.error,'INVALID_JSON');assert.equal((await h.send('checkout',{}, {raw:' '.repeat(8193)})).status,413);assert.equal((await h.send('request',{kind:'account_deletion',confirm:false})).body.error,'CONFIRMATION_REQUIRED');const r=await h.send('request',{kind:'account_deletion',confirm:true});assert.equal(r.status,200);assert.equal(r.body.user_id,UID);assert.match(r.body.receipt,/ne confirme ni un remboursement ni la suppression effective/);assert.equal(h.premium(),false);assert.equal(h.financialCreates().length,0);
});
