/** Public offer constants and pure validation. Never put credentials here. */
export const CFG=Object.freeze({account:'acct_1ULRv6B6h4U0FlMo',price:'price_1ULSYDB6h4U0FlMoAnD7zybM',product:'prod_VMAu4k8wMdvkAu',portal:'bpc_1ULSYkB6h4U0FlMoFFlXmdcr',site:'https://www.sobrizen.com',apiVersion:'2026-10-28.endive',termsVersion:'2026-11-09',amount:2999,currency:'eur',trialDays:7,launchLimit:100,checkoutSeconds:3600});
export const PLANS=Object.freeze({
 monthly:Object.freeze({id:'monthly',stripePriceId:'price_1UZzodB6h4U0FlMoqyWxNKjy',amount:299,interval:'month',label:'Mensuel',lookupKey:'sobrizen_premium_monthly_299_v1'}),
 annual:Object.freeze({id:'annual',stripePriceId:'price_1ULSYDB6h4U0FlMoAnD7zybM',amount:2999,interval:'year',label:'Annuel',lookupKey:'sobrizen_premium_annual_2999_v1'}),
 launch:Object.freeze({id:'launch',stripePriceId:'price_1UZzojB6h4U0FlMos31G0H6E',amount:1999,interval:'year',label:'Annuel lancement',lookupKey:'sobrizen_premium_launch_1999_lifetime_v1'})
});
export const objectId=v=>typeof v==='string'?v:v?.id;
export const isUuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const stamp=v=>typeof v==='number'&&Number.isFinite(v)&&v>0?v:null;
const iso=v=>stamp(v)===null?null:new Date(v*1000).toISOString();
export function planForPrice(p,{livemode=true,requireActive=false}={}){
 if(!p||objectId(p.product)!==CFG.product||p.livemode!==livemode||p.currency!==CFG.currency||p.type!=='recurring'||p.recurring?.interval_count!==1||(requireActive&&p.active!==true))return null;
 return Object.values(PLANS).find(plan=>p.unit_amount===plan.amount&&p.recurring.interval===plan.interval)||null;
}
export const validPrice=(p,options={})=>!!planForPrice(p,{requireActive:true,...options});
export function launchReady(c){return !!c&&['sales_enabled','legal_ready','tax_ready','hosting_ready','premium_features_ready'].every(k=>c[k]===true)&&c.terms_version===CFG.termsVersion;}
export function publicOffer(remaining){
 const count=Number.isInteger(remaining)&&remaining>=0&&remaining<=CFG.launchLimit?remaining:null;
 return {currency:CFG.currency,trial_days:CFG.trialDays,monthly:{...PLANS.monthly},annual:{...PLANS.annual},launch:{...PLANS.launch,limit:CFG.launchLimit,remaining:count,discount_percent:33,lifetime_while_active:true},terms_version:CFG.termsVersion};
}
export function membership(rows=[],now=Date.now()){
 const valid=rows.map(r=>{const paid=['active','past_due'].includes(r.status)&&Date.parse(r.paid_until)>now,trial=r.status==='trialing'&&Date.parse(r.trial_until)>now;return {...r,eligible:r.access_blocked!==true&&(paid||trial),trial:trial&&!paid,until:trial?r.trial_until:r.paid_until};}).filter(r=>r.eligible).sort((a,b)=>Date.parse(b.until)-Date.parse(a.until));
 const r=valid[0];return {premium:!!r,paid_until:r?.paid_until||null,trial_until:r?.trial_until||null,access_until:r?.until||null,trial:r?.trial===true,cancel_at_period_end:r?.cancel_at_period_end===true,plan:r?.plan||null,unit_amount:r?.unit_amount??null};
}
export function invoiceSubscription(inv){return objectId(inv?.subscription||inv?.parent?.subscription_details?.subscription);}
export function invoiceLinePrice(line){return objectId(line?.price||line?.pricing?.price_details?.price);}
export function goodCharge(c,{livemode=true}={}){return !!c&&typeof c==='object'&&c.livemode===livemode&&c.status==='succeeded'&&c.paid===true&&c.disputed!==true&&c.refunded!==true&&Number(c.amount_refunded||0)===0&&c.currency===CFG.currency;}
/** Access follows verified trials or collected, unrefunded invoices, never redirects. */
export function snapshot(sub,invoices=[],now=Date.now(),{livemode=true,blocked=false}={}){
 const items=sub?.items?.data||[],item=items[0],plan=planForPrice(item?.price,{livemode});
 if(!sub||sub.livemode!==livemode||!plan||items.length!==1||item.quantity!==1||!stamp(sub.start_date))throw Error('Unexpected subscription product');
 let paidUntil=null;
 for(const inv of invoices){
  if(inv.livemode!==livemode||invoiceSubscription(inv)!==sub.id||inv.status!=='paid'||inv.currency!==CFG.currency||inv.amount_paid!==plan.amount||inv.paid_out_of_band===true)continue;
  const charges=inv.verified_charges||[inv.charge];
  if(!charges.length||charges.some(c=>!goodCharge(c,{livemode}))||charges.reduce((s,c)=>s+Number(c.amount||0),0)<plan.amount)continue;
  for(const line of inv.lines?.data||[]){
   if(invoiceLinePrice(line)!==item.price.id||line.quantity!==1||line.proration===true||line.parent?.subscription_item_details?.proration===true)continue;
   const end=stamp(line.period?.end),start=stamp(line.period?.start),maxDays=plan.interval==='month'?32:370;
   if(!end||!start||end<=start||end-start>maxDays*86400)continue;
   paidUntil=paidUntil===null?end:Math.max(paidUntil,end);
  }
 }
 const start=stamp(sub.trial_start),end=stamp(sub.trial_end),trialUntil=start&&end&&end>start&&end-start<=CFG.trialDays*86400+60?end:null;
 const row={stripe_subscription_id:sub.id,stripe_customer_id:objectId(sub.customer),status:sub.status,plan:plan.id,unit_amount:plan.amount,stripe_price_id:item.price.id,paid_until:iso(paidUntil),trial_until:iso(trialUntil),access_blocked:blocked===true,cancel_at_period_end:sub.cancel_at_period_end===true,original_started_at:iso(sub.start_date)};
 return {...row,premium:membership([row],now).premium};
}
export function checkoutParameters({userId,customerId,priceId,plan,trial=true,reservationId,now=Date.now(),integrationId}){
 if(!isUuid(userId)||!/^cus_[A-Za-z0-9]+$/.test(customerId||'')||!/^price_[A-Za-z0-9]+$/.test(priceId||'')||typeof plan!=='string'||!Object.hasOwn(PLANS,plan))throw Error('Invalid checkout context');
 if(plan==='launch'&&!isUuid(reservationId))throw Error('Launch reservation required');
 const chosen=PLANS[plan],price=(chosen.amount/100).toFixed(2).replace('.',','),period=chosen.interval==='month'?'mois':'an';
 const metadata={app:'sobrizen',user_id:userId,terms_version:CFG.termsVersion,plan,...(reservationId?{launch_reservation_id:reservationId}:{})};
 return {mode:'subscription',customer:customerId,client_reference_id:userId,line_items:[{price:priceId,quantity:1}],payment_method_collection:'always',locale:'fr',billing_address_collection:'required',customer_update:{address:'auto'},expires_at:Math.floor(now/1000)+CFG.checkoutSeconds,success_url:`${CFG.site}/abonnement?checkout=success&session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${CFG.site}/abonnement?checkout=cancelled`,metadata,subscription_data:{metadata:{...metadata,tier:'premium'},...(trial?{trial_period_days:CFG.trialDays,trial_settings:{end_behavior:{missing_payment_method:'cancel'}}}:{})},...(integrationId?{integration_identifier:integrationId}:{}),custom_text:{submit:{message:`${trial?'7 jours gratuits, puis ':''}${price} €/${period}. Renouvellement automatique, désactivable dans ton compte.${plan==='launch'?' Tarif de lancement conservé tant que cet abonnement annuel reste actif.':''} Droit de rétractation : 14 jours.`}},automatic_tax:{enabled:false}};
}
export async function verifySignature(raw,header,secret,now=Math.floor(Date.now()/1000),{livemode=true,account=CFG.account}={}){
 if(typeof secret!=='string'||!secret.startsWith('whsec_'))throw Error('Webhook secret unavailable');
 const parts=String(header||'').split(',').map(v=>v.split('=')),ts=parts.filter(([k])=>k==='t');
 if(ts.length!==1||!/^\d+$/.test(ts[0][1]))throw Error('Invalid signature');
 const t=Number(ts[0][1]);if(Math.abs(now-t)>300)throw Error('Expired signature');
 const signatures=parts.filter(([k,v])=>k==='v1'&&/^[0-9a-f]{64}$/i.test(v)).map(([,v])=>Uint8Array.from(v.match(/../g),x=>parseInt(x,16)));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const bytes=new TextEncoder().encode(`${t}.${raw}`);let valid=false;
 for(const sig of signatures)if(await crypto.subtle.verify('HMAC',key,sig,bytes))valid=true;
 if(!valid)throw Error('Invalid signature');
 const event=JSON.parse(raw);
 if(!/^evt_[A-Za-z0-9]+$/.test(event.id||'')||event.livemode!==livemode||(event.account&&event.account!==account)||typeof event.type!=='string')throw Error('Wrong event environment');
 return event;
}
