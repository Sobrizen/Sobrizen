/** Server-only billing orchestration. Stripe is injected (SDK in the Edge entrypoint). */
import {CFG,PLANS,objectId,isUuid,validPrice,planForPrice,launchReady,publicOffer,membership,snapshot,checkoutParameters,invoiceSubscription,verifySignature} from './core.mjs';
export class BillingFault extends Error {constructor(code,status=400){super(code);this.status=status;}}
const pendingStatuses=new Set(['active','past_due','trialing','unpaid','paused','incomplete']);
const knownDbErrors=new Set(['LAUNCH_SOLD_OUT','CHECKOUT_PLAN_PENDING','CHECKOUT_STATE_CONFLICT']);
const id=(value,prefix)=>typeof value==='string'&&new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value);
const origins=new Set([CFG.site,'https://sobrizen.com','https://sobrizen.vercel.app']);
export function createBillingHandler({env,stripe,fetch:fetcher=globalThis.fetch,now=Date.now,database,authenticate,logger=console}){
 const base=env('SUPABASE_URL'),admin=env('SUPABASE_SERVICE_ROLE_KEY')||JSON.parse(env('SUPABASE_SECRET_KEYS')||'{}').default||'';
 const mode=true; // A deployed live service never accepts a test-mode event or price.
 const configured=()=>/^(sk|rk)_live_/.test(env('STRIPE_SECRET_KEY'));
 const request=async(url,options={})=>{
  let response;try{response=await fetcher(url,{...options,signal:AbortSignal.timeout(18000)});}catch{throw new BillingFault('UPSTREAM_UNAVAILABLE',502);}
  let data;try{data=await response.json();}catch{throw new BillingFault('UPSTREAM_UNAVAILABLE',502);}
  if(!response.ok){const code=[...knownDbErrors].find(c=>String(data.message||'').includes(c));throw new BillingFault(code||'UPSTREAM_UNAVAILABLE',code?409:502);}return data;
 };
 const db=database||((path,method='GET',body,prefer)=>request(`${base}/rest/v1/${path}`,{method,headers:{apikey:admin,...(admin.startsWith('eyJ')?{Authorization:`Bearer ${admin}`}:{ }),'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}));
 const rpc=(name,args={})=>db(`rpc/${name}`,'POST',args);
 const conf=async()=>(await db('billing_config?select=*&id=eq.true'))[0]||{};
 const customer=async uid=>(await db(`billing_customers?select=*&user_id=eq.${uid}`))[0]||null;
 const webhookSecret=async()=>env('STRIPE_WEBHOOK_SECRET')||await rpc('billing_get_webhook_secret');
 async function verifyAccount(){if(!configured()||!stripe)throw new BillingFault('STRIPE_KEY_MISSING',503);const a=await stripe.accounts.retrieve();if(a.id!==CFG.account||a.charges_enabled!==true)throw new BillingFault('STRIPE_ACCOUNT_MISMATCH',503);}
 async function user(req){
  if(authenticate)return authenticate(req);
  const token=req.headers.get('Authorization')||'';if(!/^Bearer eyJ/.test(token))throw new BillingFault('AUTH_REQUIRED',401);
  let r;try{r=await fetcher(`${base}/auth/v1/user`,{headers:{apikey:admin,Authorization:token},signal:AbortSignal.timeout(12000)});}catch{throw new BillingFault('AUTH_REQUIRED',401);}
  if(!r.ok)throw new BillingFault('AUTH_REQUIRED',401);const u=await r.json();if(!isUuid(u.id)||!u.email_confirmed_at)throw new BillingFault('VERIFIED_EMAIL_REQUIRED',403);return u;
 }
 async function all(resource,params,maxPages=10){
  let values=[],cursor;for(let page=0;page<maxPages;page++){const result=await resource.list({...params,...(cursor?{starting_after:cursor}:{}),limit:100});values.push(...(result.data||[]));if(!result.has_more)return values;cursor=result.data?.at(-1)?.id;if(!cursor)break;}throw new BillingFault('UPSTREAM_UNAVAILABLE',502);
 }
 async function priceFor(plan){
  const definition=typeof plan==='string'&&Object.hasOwn(PLANS,plan)?PLANS[plan]:null;if(!definition)throw new BillingFault('INVALID_PLAN');
  const price=await stripe.prices.retrieve(definition.stripePriceId);
  if(!validPrice(price)||planForPrice(price)?.id!==plan)throw new BillingFault('PRICE_MISMATCH',503);return price;
 }
 async function invoiceCharges(invoice){
  const payments=await all(stripe.invoicePayments,{invoice:invoice.id,status:'paid'}),charges=[];
  for(const payment of payments){
   if(payment.livemode!==mode||payment.status!=='paid')continue;
   let charge=null;
   if(payment.payment?.type==='payment_intent'){
    let intent=payment.payment.payment_intent;
    if(typeof intent==='string')intent=await stripe.paymentIntents.retrieve(intent,{expand:['latest_charge']});
    const reference=intent?.latest_charge;if(reference)charge=typeof reference==='string'?await stripe.charges.retrieve(reference):reference;
   }else if(payment.payment?.type==='charge'){
    const reference=payment.payment.charge;charge=typeof reference==='string'?await stripe.charges.retrieve(reference):reference;
   }
   if(charge?.disputed===true){const disputes=await all(stripe.disputes,{charge:charge.id});if(disputes.length&&disputes.every(d=>d.status==='won'))charge={...charge,disputed:false};}
   if(charge&&!charges.some(c=>c.id===charge.id))charges.push(charge);
  }
  return charges;
 }
 async function saveSub(subscriptionId,{required=false}={}){
  if(!id(subscriptionId,'sub'))throw new BillingFault('INVALID_SUBSCRIPTION');
  const checked=new Date(now()).toISOString(),sub=await stripe.subscriptions.retrieve(subscriptionId);
  const rows=await db(`billing_customers?select=user_id&stripe_customer_id=eq.${encodeURIComponent(objectId(sub.customer))}`),uid=rows[0]?.user_id;
  if(!uid||sub.metadata?.user_id!==uid||sub.metadata?.app!=='sobrizen'){if(required)throw new BillingFault('SUBSCRIPTION_NOT_LINKED',409);return null;}
  const invoices=await all(stripe.invoices,{subscription:subscriptionId,status:'paid',created:{gte:Math.floor(now()/1000)-371*86400}});
  for(const invoice of invoices)invoice.verified_charges=await invoiceCharges(invoice);
  const flags=await db(`billing_risk_flags?select=active&stripe_subscription_id=eq.${subscriptionId}&active=eq.true`);
  let result;try{result=snapshot(sub,invoices,now(),{livemode:mode,blocked:flags.length>0});}catch{throw new BillingFault('SUBSCRIPTION_PRODUCT_MISMATCH',409);}
  await rpc('billing_save_snapshot_v2',{p_user_id:uid,p_snapshot:result,p_checked_at:checked});
  return result;
 }
 async function stripeState(uid){
  const c=await customer(uid);if(!c)return[];const list=await all(stripe.subscriptions,{customer:c.stripe_customer_id,status:'all'});
  for(const sub of list)if(sub.metadata?.app==='sobrizen'&&sub.metadata?.user_id===uid)await saveSub(sub.id,{required:true});return list;
 }
 async function status(uid){
  const [rows,c]=await Promise.all([db(`billing_subscriptions?select=status,paid_until,trial_until,plan,unit_amount,access_blocked,cancel_at_period_end,original_started_at&user_id=eq.${uid}`),customer(uid)]);
  return {...membership(rows,now()),trial_eligible:!c?.trial_used_at&&rows.length===0,subscriptions:rows};
 }
 async function settleSession(session,attempt){
  if(!attempt){const ref=session.metadata?.checkout_attempt_id||session.metadata?.launch_reservation_id;if(!isUuid(ref))return;attempt=(await db(`billing_checkout_attempts?select=*&id=eq.${ref}`))[0];}
  if(!attempt)return;
  if(session.livemode!==mode||session.mode!=='subscription'||session.metadata?.app!=='sobrizen'||session.metadata?.user_id!==attempt.user_id||session.client_reference_id!==attempt.user_id||objectId(session.customer)!==attempt.stripe_customer_id||session.metadata?.plan!==attempt.plan)throw new BillingFault('SESSION_NOT_OWNED',403);
  if(session.status==='complete'){
   const row=await saveSub(objectId(session.subscription),{required:true});
   if(row.plan!==attempt.plan||row.stripe_price_id!==attempt.stripe_price_id)throw new BillingFault('PRICE_MISMATCH',409);
   await rpc('billing_settle_checkout',{p_attempt_id:attempt.id,p_status:'completed',p_session_id:session.id,p_subscription_id:objectId(session.subscription)});
  }else if(session.status==='expired')await rpc('billing_settle_checkout',{p_attempt_id:attempt.id,p_status:'expired',p_session_id:session.id});
 }
 async function recoverAttempt(attempt,{expire=false}={}){
  let session=attempt.stripe_session_id?await stripe.checkout.sessions.retrieve(attempt.stripe_session_id):null;
  if(!session){
   const recent=await all(stripe.checkout.sessions,{customer:attempt.stripe_customer_id,created:{gte:Math.floor(Date.parse(attempt.created_at)/1000)-1}});
   session=recent.find(s=>s.metadata?.checkout_attempt_id===attempt.id||s.metadata?.launch_reservation_id===attempt.id)||null;
   if(session&&session.url)await rpc('billing_attach_checkout',{p_attempt_id:attempt.id,p_session_id:session.id,p_session_url:session.url});
  }
  if(session&&expire&&session.status==='open')session=await stripe.checkout.sessions.expire(session.id);
  if(session)await settleSession(session,attempt);
  return session;
 }
 async function reconcileStaleLaunch(limit=10){
  const stale=await db(`billing_checkout_attempts?select=*&plan=eq.launch&status=in.(reserved,open)&expires_at=lt.${encodeURIComponent(new Date(now()).toISOString())}&order=created_at.asc&limit=${limit}`);
  for(const attempt of stale)await recoverAttempt(attempt,{expire:true});
 }
 async function checkout(u,input){
  if(!launchReady(await conf()))throw new BillingFault('SALES_NOT_OPEN',503);
  if(input.accept_terms!==true||input.terms_version!==CFG.termsVersion)throw new BillingFault('TERMS_REQUIRED');
  if(typeof input.plan!=='string'||!Object.hasOwn(PLANS,input.plan)||input.expected_unit_amount!==PLANS[input.plan].amount)throw new BillingFault('OFFER_CHANGED',409);
  await verifyAccount();
  if(!await rpc('billing_take_checkout_lock',{p_user_id:u.id}))throw new BillingFault('CHECKOUT_IN_PROGRESS',429);
  try{
   let c=await customer(u.id);
   if(!c){const created=await stripe.customers.create({email:u.email,preferred_locales:['fr'],invoice_settings:{footer:'TVA non applicable, article 293 B du Code général des impôts (CGI).'},metadata:{app:'sobrizen',user_id:u.id}},{idempotencyKey:`sobrizen-customer-${u.id}`});c={user_id:u.id,stripe_customer_id:created.id};await db('billing_customers','POST',c,'return=representation');}
   const subs=await stripeState(u.id);
   if(subs.some(s=>pendingStatuses.has(s.status)))throw new BillingFault('EXISTING_SUBSCRIPTION',409);
   c=await customer(u.id);
   const eligible=!c.trial_used_at&&subs.length===0;
   if(input.expected_trial!==eligible)throw new BillingFault('TRIAL_ELIGIBILITY_CHANGED',409);
   const pending=(await db(`billing_checkout_attempts?select=*&user_id=eq.${u.id}&status=in.(reserved,open)`))[0];
   if(pending){
    const existing=await recoverAttempt(pending,{expire:pending.plan!==input.plan});
    if(existing?.status==='complete')throw new BillingFault('EXISTING_SUBSCRIPTION',409);
    if(existing?.status==='open'&&pending.plan===input.plan)return {url:existing.url,plan:pending.plan,trial:pending.trial_enabled};
    // An ambiguous request must not be replaced by a second chargeable checkout.
    if(!existing&&pending.plan!==input.plan)throw new BillingFault('CHECKOUT_IN_PROGRESS',409);
    if(!existing&&Date.parse(pending.expires_at)<now()+31*60_000)throw new BillingFault('CHECKOUT_RECOVERY_REQUIRED',409);
   }
   await reconcileStaleLaunch();
   const price=await priceFor(input.plan);
   const attempt=await rpc('billing_begin_checkout',{p_user_id:u.id,p_plan:input.plan,p_customer_id:c.stripe_customer_id,p_price_id:price.id});
   await db('billing_consents','POST',{user_id:u.id,terms_version:CFG.termsVersion,purpose:'subscription_terms'},'return=representation');
   const params=checkoutParameters({userId:u.id,customerId:c.stripe_customer_id,priceId:attempt.stripe_price_id,plan:attempt.plan,trial:attempt.trial_enabled,reservationId:attempt.plan==='launch'?attempt.id:undefined,now:Date.parse(attempt.created_at)});
   params.metadata.checkout_attempt_id=attempt.id;params.subscription_data.metadata.checkout_attempt_id=attempt.id;
   let session;
   try{session=await stripe.checkout.sessions.create(params,{idempotencyKey:`sobrizen-checkout-v2-${attempt.id}`});}
   catch(error){
    // A definite parameter rejection cannot have created a session. Network/5xx errors remain reserved.
    if(error?.type==='StripeInvalidRequestError'&&error.statusCode===400)await rpc('billing_settle_checkout',{p_attempt_id:attempt.id,p_status:'failed'});
    throw error;
   }
   await rpc('billing_attach_checkout',{p_attempt_id:attempt.id,p_session_id:session.id,p_session_url:session.url});
   return {url:session.url,plan:attempt.plan,trial:attempt.trial_enabled};
  }finally{await rpc('billing_release_checkout_lock',{p_user_id:u.id}).catch(()=>{});}
 }
 async function subscriptionsForCharge(charge){
  const refs=new Set();
  if(charge.invoice){const inv=await stripe.invoices.retrieve(objectId(charge.invoice));if(invoiceSubscription(inv))refs.add(invoiceSubscription(inv));}
  if(charge.payment_intent){const payments=await all(stripe.invoicePayments,{payment:{type:'payment_intent',payment_intent:objectId(charge.payment_intent)}});for(const payment of payments){const invoice=await stripe.invoices.retrieve(objectId(payment.invoice));if(invoiceSubscription(invoice))refs.add(invoiceSubscription(invoice));}}
  return refs;
 }
 async function webhook(req){
  if(!req.headers.get('stripe-signature'))throw new BillingFault('SIGNATURE_REQUIRED');
  if(Number(req.headers.get('content-length')||0)>1048576)throw new BillingFault('BODY_TOO_LARGE',413);
  const raw=await req.text();if(new TextEncoder().encode(raw).length>1048576)throw new BillingFault('BODY_TOO_LARGE',413);
  let event;try{event=await verifySignature(raw,req.headers.get('stripe-signature'),await webhookSecret(),Math.floor(now()/1000));}catch{throw new BillingFault('INVALID_SIGNATURE');}
  if((await db(`billing_events?select=stripe_event_id&stripe_event_id=eq.${event.id}`)).length)return {received:true};
  await verifyAccount();const obj=event.data?.object||{},refs=new Set();
  if(event.type.startsWith('customer.subscription.'))refs.add(obj.id);
  else if(event.type.startsWith('invoice.')){const ref=invoiceSubscription(obj);if(ref)refs.add(ref);}
  else if(['checkout.session.completed','checkout.session.expired','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed'].includes(event.type)){
   const session=await stripe.checkout.sessions.retrieve(obj.id);await settleSession(session);if(session.subscription)refs.add(objectId(session.subscription));
  }else if(event.type.startsWith('charge.')||event.type==='radar.early_fraud_warning.created'){
   const reference=event.type.startsWith('charge.dispute.')||event.type.startsWith('radar.')?objectId(obj.charge):obj.id;
   if(id(reference,'ch')){
    const charge=await stripe.charges.retrieve(reference),subscriptionIds=await subscriptionsForCharge(charge);
    for(const sid of subscriptionIds){
     refs.add(sid);
     if(event.type.startsWith('charge.dispute.')){const dispute=await stripe.disputes.retrieve(obj.id);await db('billing_risk_flags','POST',{stripe_charge_id:charge.id,reason:'dispute',stripe_subscription_id:sid,active:dispute.status!=='won',updated_at:new Date(now()).toISOString()},'resolution=merge-duplicates,return=representation');}
     if(event.type==='radar.early_fraud_warning.created')await db('billing_risk_flags','POST',{stripe_charge_id:charge.id,reason:'early_fraud_warning',stripe_subscription_id:sid,active:true,updated_at:new Date(now()).toISOString()},'resolution=merge-duplicates,return=representation');
    }
   }
  }
  for(const ref of refs)if(id(ref,'sub'))await saveSub(ref);
  await db('billing_events','POST',{stripe_event_id:event.id,event_type:event.type},'resolution=ignore-duplicates,return=representation');return {received:true};
 }
 async function accountRequest(u,input){
  if(!['withdrawal','account_deletion'].includes(input.kind)||input.confirm!==true)throw new BillingFault('CONFIRMATION_REQUIRED');
  const existing=await db(`billing_requests?select=*&user_id=eq.${u.id}&kind=eq.${input.kind}&status=eq.received&order=created_at.desc&limit=1`);if(existing.length)return existing[0];
  const requestId=crypto.randomUUID(),when=new Date(now()).toISOString();
  const receipt=`SobriZen — accusé de réception\nRéférence : ${requestId}\nDemande : ${input.kind==='withdrawal'?'Rétractation du contrat Premium':'Suppression du compte et retrait du consentement au suivi'}\nDate UTC : ${when}\nContact : contact@sobrizen.com\nVotre demande est enregistrée. Son traitement nécessite une intervention du support. Cet accusé ne confirme ni un remboursement ni la suppression effective. La désactivation du renouvellement reste disponible dans Gérer mon abonnement.`;
  return(await db('billing_requests','POST',{id:requestId,user_id:u.id,kind:input.kind,receipt},'return=representation'))[0];
 }
 const out=(data,status=200,origin='')=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(origins.has(origin)?{'Access-Control-Allow-Origin':origin,Vary:'Origin'}:{})}});
 return async req=>{
  const origin=req.headers.get('Origin')||'',route=new URL(req.url).pathname.split('/').filter(Boolean).at(-1);
  if(req.method==='OPTIONS')return new Response(null,{status:origins.has(origin)?204:403,headers:{...(origins.has(origin)?{'Access-Control-Allow-Origin':origin}:{}),'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Max-Age':'600',Vary:'Origin'}});
  try{
   if(origin&&!origins.has(origin))throw new BillingFault('ORIGIN_NOT_ALLOWED',403);
   if(route==='health'&&req.method==='GET'){
    const config=await conf();let wh=false,remaining=null;
    try{wh=/^whsec_[A-Za-z0-9]+$/.test(await webhookSecret());}catch{}try{remaining=await rpc('billing_launch_remaining');}catch{}
    let accountReady=false;if(launchReady(config)&&configured()&&wh&&(Number.isInteger(remaining)&&remaining>=0&&remaining<=CFG.launchLimit))try{await verifyAccount();accountReady=true;}catch{}
    return out({version:'billing-v2',sales_open:launchReady(config)&&configured()&&wh&&(Number.isInteger(remaining)&&remaining>=0&&remaining<=CFG.launchLimit)&&accountReady,stripe_key_configured:configured(),webhook_secret_configured:wh,readiness:{legal:config.legal_ready,tax:config.tax_ready,hosting:config.hosting_ready,premium_features:config.premium_features_ready},amount:CFG.amount,currency:CFG.currency,interval:'year',terms_version:CFG.termsVersion,offer:publicOffer(remaining)},200,origin);
   }
   if(route==='healthz'&&req.method==='GET'){await verifyAccount();if(!/^whsec_[A-Za-z0-9]+$/.test(await webhookSecret()))throw new BillingFault('WEBHOOK_NOT_CONFIGURED',503);return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});}
   if(req.method!=='POST')throw new BillingFault('METHOD_NOT_ALLOWED',405);
   if(route==='webhook')return out(await webhook(req));
   if(!['status','checkout','portal','sync','request'].includes(route))throw new BillingFault('NOT_FOUND',404);
   const u=await user(req);if(Number(req.headers.get('content-length')||0)>8192)throw new BillingFault('BODY_TOO_LARGE',413);
   const text=await req.text();if(new TextEncoder().encode(text).length>8192)throw new BillingFault('BODY_TOO_LARGE',413);
   let input;try{input=text?JSON.parse(text):{};}catch{throw new BillingFault('INVALID_JSON');}if(!input||Array.isArray(input)||typeof input!=='object')throw new BillingFault('INVALID_JSON');
   if(route==='status'){if(configured())try{await reconcileStaleLaunch(1);}catch{logger.error('billing checkout reconciliation deferred');}return out(await status(u.id),200,origin);}
   if(route==='checkout')return out(await checkout(u,input),200,origin);
   if(route==='portal'){
    await verifyAccount();const c=await customer(u.id);if(!c)throw new BillingFault('NO_SUBSCRIPTION',404);
    const params={customer:c.stripe_customer_id,configuration:CFG.portal,return_url:`${CFG.site}/abonnement`,locale:'fr'};
    if(input.intent==='cancel'){const subs=await stripeState(u.id),active=subs.find(s=>s.metadata?.app==='sobrizen'&&s.metadata?.user_id===u.id&&['active','past_due','trialing','unpaid','paused'].includes(s.status));if(!active)throw new BillingFault('NO_SUBSCRIPTION',404);params.flow_data={type:'subscription_cancel',subscription_cancel:{subscription:active.id},after_completion:{type:'redirect',redirect:{return_url:`${CFG.site}/abonnement?cancellation=submitted`}}};}
    const portal=await stripe.billingPortal.sessions.create(params);return out({url:portal.url},200,origin);
   }
   if(route==='sync'){
    await verifyAccount();
    if(input.session_id){if(!/^cs_live_[A-Za-z0-9]+$/.test(input.session_id))throw new BillingFault('INVALID_SESSION');const session=await stripe.checkout.sessions.retrieve(input.session_id),c=await customer(u.id);if(!c||session.client_reference_id!==u.id||session.metadata?.user_id!==u.id||session.metadata?.app!=='sobrizen'||objectId(session.customer)!==c.stripe_customer_id)throw new BillingFault('SESSION_NOT_OWNED',403);await settleSession(session);if(session.status==='complete'&&session.subscription)await saveSub(objectId(session.subscription),{required:true});}
    else await stripeState(u.id);return out(await status(u.id),200,origin);
   }
   if(route==='request')return out(await accountRequest(u,input),200,origin);
  }catch(error){const known=error instanceof BillingFault;const code=known?error.message:'SERVICE_UNAVAILABLE';logger.error('billing request failed',code);return out({error:code},known?error.status:503,origin);}
 };
}
