/** Public offer constants and pure validation. Never put credentials here. */
export const ANNUAL_PRICE_ID='price_1Uc4WZB6h4U0FlMox1pwl1Lj';
export const CFG=Object.freeze({account:'acct_1ULRv6B6h4U0FlMo',price:ANNUAL_PRICE_ID,product:'prod_VMAu4k8wMdvkAu',portal:'bpc_1ULSYkB6h4U0FlMoFFlXmdcr',site:'https://www.sobrizen.com',apiVersion:'2026-10-28.endive',termsVersion:'2026-11-15',billingPolicy:'immediate-v2-annual1799',amount:1799,currency:'eur',trialDays:0,legacyTrialDays:7,annualLimit:1000,checkoutSeconds:3600,syncSeconds:30});
export const PLANS=Object.freeze({
 monthly:Object.freeze({id:'monthly',stripePriceId:'price_1UZzodB6h4U0FlMoqyWxNKjy',amount:299,interval:'month',label:'Mensuel',lookupKey:'sobrizen_premium_monthly_299_v1'}),
 annual:Object.freeze({id:'annual',stripePriceId:ANNUAL_PRICE_ID,amount:1799,interval:'year',label:'Annuel',lookupKey:'sobrizen_premium_annual_1799_first1000_v1'})
});
// Historical prices remain valid for entitlement, invoices and renewals. They
// are deliberately excluded from PLANS, the only catalogue accepted at checkout.
export const LEGACY_PLANS=Object.freeze([
 Object.freeze({id:'annual',stripePriceId:'price_1ULSYDB6h4U0FlMoAnD7zybM',amount:2999,interval:'year',label:'Annuel historique',legacy:true}),
 Object.freeze({id:'launch',stripePriceId:'price_1UZzojB6h4U0FlMos31G0H6E',amount:1999,interval:'year',label:'Annuel lancement historique',legacy:true})
]);
const catalogue=[...Object.values(PLANS),...LEGACY_PLANS];
export const objectId=v=>typeof v==='string'?v:v?.id;
export const isUuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const stamp=v=>typeof v==='number'&&Number.isFinite(v)&&v>0?v:null;
const iso=v=>stamp(v)===null?null:new Date(v*1000).toISOString();
export function planForPrice(p,{livemode=true,requireActive=false}={}){
 if(!p||objectId(p.product)!==CFG.product||p.livemode!==livemode||p.currency!==CFG.currency||p.type!=='recurring'||p.recurring?.interval_count!==1||(requireActive&&p.active!==true))return null;
 return catalogue.find(plan=>p.unit_amount===plan.amount&&p.recurring.interval===plan.interval)||null;
}
export const validPrice=(p,options={})=>!!planForPrice(p,{requireActive:true,...options});
/** Commercial approval is distinct from legal verification. Only server-side admin configuration can authorize launch. */
export function launchReady(c){
 const authorized=c?.legal_ready===true||(c?.owner_launch_authorized===true&&typeof c.owner_launch_authorized_at==='string'&&Number.isFinite(Date.parse(c.owner_launch_authorized_at))&&Date.parse(c.owner_launch_authorized_at)<=Date.now());
 return !!c&&authorized&&['sales_enabled','tax_ready','hosting_ready','premium_features_ready'].every(k=>c[k]===true)&&c.terms_version===CFG.termsVersion;
}
export function publicOffer(available){
 return {currency:CFG.currency,trial_days:CFG.trialDays,billing_policy:CFG.billingPolicy,monthly:{...PLANS.monthly},annual:{...PLANS.annual,limit:CFG.annualLimit,available:typeof available==='boolean'?available:null,lifetime_while_active:true},terms_version:CFG.termsVersion};
}
export function membership(rows=[],now=Date.now()){
 const valid=rows.map(r=>{const paid=['active','past_due'].includes(r.status)&&Date.parse(r.paid_until)>now,trial=r.status==='trialing'&&Date.parse(r.trial_until)>now;return {...r,eligible:r.access_blocked!==true&&(paid||trial),trial:trial&&!paid,until:trial?r.trial_until:r.paid_until};}).filter(r=>r.eligible).sort((a,b)=>Date.parse(b.until)-Date.parse(a.until));
 const r=valid[0];return {premium:!!r,paid_until:r?.paid_until||null,trial_until:r?.trial_until||null,access_until:r?.until||null,trial:r?.trial===true,cancel_at_period_end:r?.cancel_at_period_end===true,plan:r?.plan||null,unit_amount:r?.unit_amount??null};
}
/** A stable customer-facing summary. Never return card details or infer an old
 * customer's amount from the currently marketed offer. */
export function planDetails(rows=[],now=Date.now(),portalAvailable=false){
 const living=new Set(['active','trialing','past_due','unpaid','paused','incomplete']);
 const rank=r=>membership([r],now).premium?2:living.has(r.status)?1:0;
 const row=[...rows].sort((a,b)=>rank(b)-rank(a)||(Date.parse(b.original_started_at)||0)-(Date.parse(a.original_started_at)||0))[0];
 if(!row)return null;
 const access=membership([row],now),definition=catalogue.find(p=>p.id===row.plan&&p.amount===row.unit_amount);
 const cancelled=row.cancel_at_period_end===true||!!row.cancel_at;
 const paymentState=row.access_blocked?'blocked':['canceled','incomplete_expired'].includes(row.status)?'ended':['past_due','unpaid','paused'].includes(row.status)?'payment_required':access.trial?'trial':access.premium?'paid':'pending';
 const next=!cancelled&&['active','trialing'].includes(row.status)?(row.status==='trialing'?row.trial_until:row.current_period_end):null;
 return {id:row.plan,label:definition?.label||'Premium',unit_amount:row.unit_amount,currency:row.currency||CFG.currency,interval:row.interval||definition?.interval||null,interval_count:row.interval_count||1,status:row.status,started_at:row.original_started_at||null,current_period_start:row.current_period_start||null,current_period_end:row.current_period_end||null,paid_until:row.paid_until||null,trial_until:row.trial_until||null,access_until:access.access_until,next_payment_at:next&&Date.parse(next)>now?next:null,cancel_scheduled:living.has(row.status)&&cancelled,cancel_at:row.cancel_at||(cancelled?row.current_period_end:null)||null,payment_state:paymentState,portal_available:portalAvailable};
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
 // Previously granted trials keep their original seven-day entitlement. Changing
 // the public offer must never end or invoice an existing trial early.
 const start=stamp(sub.trial_start),end=stamp(sub.trial_end),trialUntil=start&&end&&end>start&&end-start<=CFG.legacyTrialDays*86400+60?end:null;
 const periodStart=stamp(item.current_period_start)||stamp(sub.current_period_start),periodEnd=stamp(item.current_period_end)||stamp(sub.current_period_end);
 const cancelAt=stamp(sub.cancel_at)||(sub.cancel_at_period_end===true?periodEnd:null);
 const row={stripe_subscription_id:sub.id,stripe_customer_id:objectId(sub.customer),status:sub.status,plan:plan.id,unit_amount:plan.amount,stripe_price_id:item.price.id,currency:CFG.currency,interval:plan.interval,interval_count:1,current_period_start:iso(periodStart),current_period_end:iso(periodEnd),cancel_at:iso(cancelAt),paid_until:iso(paidUntil),trial_until:iso(trialUntil),access_blocked:blocked===true,cancel_at_period_end:sub.cancel_at_period_end===true||cancelAt!==null,original_started_at:iso(sub.start_date)};
 return {...row,premium:membership([row],now).premium};
}
export function checkoutParameters({userId,customerId,priceId,plan,reservationId,now=Date.now(),integrationId}){
 if(!isUuid(userId)||!/^cus_[A-Za-z0-9]+$/.test(customerId||'')||!/^price_[A-Za-z0-9]+$/.test(priceId||'')||typeof plan!=='string'||!Object.hasOwn(PLANS,plan))throw Error('Invalid checkout context');
 if(plan==='annual'&&!isUuid(reservationId))throw Error('Annual reservation required');
 const chosen=PLANS[plan],price=(chosen.amount/100).toFixed(2).replace('.',','),period=chosen.interval==='month'?'mois':'an';
 const metadata={app:'sobrizen',user_id:userId,terms_version:CFG.termsVersion,billing_policy:CFG.billingPolicy,plan,...(reservationId?{annual_reservation_id:reservationId}:{})};
 return {mode:'subscription',adaptive_pricing:{enabled:false},branding_settings:{display_name:'SobriZen — JANNAH BOUTIQUE',button_color:'#21654f',background_color:'#f5f6f2'},customer:customerId,client_reference_id:userId,line_items:[{price:priceId,quantity:1}],payment_method_collection:'always',locale:'fr',billing_address_collection:'required',customer_update:{address:'auto'},expires_at:Math.floor(now/1000)+CFG.checkoutSeconds,success_url:`${CFG.site}/abonnement?checkout=success&session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${CFG.site}/abonnement?checkout=cancelled`,metadata,subscription_data:{metadata:{...metadata,tier:'premium'}},...(integrationId?{integration_identifier:integrationId}:{}),custom_text:{submit:{message:`${price} €/${period}, premier paiement à la confirmation. Aucun essai gratuit. Renouvellement automatique, désactivable dans ton compte.${plan==='annual'?' Offre réservée aux 1 000 premières souscriptions annuelles ; tarif conservé tant que cet abonnement reste actif.':''} Droit de rétractation : 14 jours.`}},automatic_tax:{enabled:false}};
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
