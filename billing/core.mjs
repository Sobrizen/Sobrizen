/** Shared, dependency-free billing validation. Contains identifiers, never credentials. */
export const CFG=Object.freeze({account:'acct_1ULRv6B6h4U0FlMo',price:'price_1ULSYDB6h4U0FlMoAnD7zybM',product:'prod_VMAu4k8wMdvkAu',portal:'bpc_1ULSYkB6h4U0FlMoFFlXmdcr',site:'https://sobrizen.com',apiVersion:'2025-02-24.acacia',termsVersion:'2026-09-30',amount:2999,currency:'eur'});
export const objectId=v=>typeof v==='string'?v:v?.id;
export const isUuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function validPrice(p){return !!p&&p.id===CFG.price&&objectId(p.product)===CFG.product&&p.active===true&&p.livemode===true&&p.currency===CFG.currency&&p.unit_amount===CFG.amount&&p.type==='recurring'&&p.recurring?.interval==='year'&&p.recurring?.interval_count===1;}
export function launchReady(c){return !!c&&['sales_enabled','legal_ready','tax_ready','hosting_ready','premium_features_ready'].every(k=>c[k]===true)&&c.terms_version===CFG.termsVersion;}
export function membership(rows,now=Date.now()){
 const paid=(rows||[]).filter(r=>['active','past_due'].includes(r.status)&&Number.isFinite(Date.parse(r.paid_until))&&Date.parse(r.paid_until)>now).sort((a,b)=>Date.parse(b.paid_until)-Date.parse(a.paid_until));
 const r=paid[0];return {premium:!!r,paid_until:r?.paid_until||null,cancel_at_period_end:r?.cancel_at_period_end||false};
}
/** Access follows collected, unrefunded invoices, never a redirect or user metadata. */
export function snapshot(sub,invoices,now=Date.now()){
 const item=sub?.items?.data?.find(i=>validPrice(i.price)&&i.quantity===1);
 if(!sub?.livemode||!item||sub.items.data.length!==1)throw Error('Unexpected subscription product');
 let paidUntil=null;
 for(const inv of invoices||[]){
  if(inv.livemode!==true||objectId(inv.subscription||inv.parent?.subscription_details?.subscription)!==sub.id||inv.status!=='paid'||inv.paid!==true||inv.currency!==CFG.currency||inv.amount_paid!==CFG.amount)continue;
  const charge=inv.charge;
  if(!charge||typeof charge!=='object'||charge.status!=='succeeded'||charge.paid!==true||charge.disputed===true||charge.refunded===true||charge.amount_refunded>=charge.amount||charge.currency!==CFG.currency)continue;
  for(const line of inv.lines?.data||[]){
   if(objectId(line.price||line.pricing?.price_details?.price)!==CFG.price||line.quantity!==1||line.proration===true)continue;
   const end=Number(line.period?.end),start=Number(line.period?.start);
   if(!Number.isFinite(end)||!Number.isFinite(start)||end<=start||end-start>370*86400)continue;
   if(paidUntil===null||end>paidUntil)paidUntil=end;
  }
 }
 const row={stripe_subscription_id:sub.id,stripe_customer_id:objectId(sub.customer),status:sub.status,paid_until:paidUntil===null?null:new Date(paidUntil*1000).toISOString(),cancel_at_period_end:sub.cancel_at_period_end===true,original_started_at:new Date(sub.start_date*1000).toISOString()};
 return {...row,premium:membership([row],now).premium};
}
export async function verifySignature(raw,header,secret,now=Math.floor(Date.now()/1000)){
 if(typeof secret!=='string'||!secret.startsWith('whsec_'))throw Error('Webhook secret unavailable');
 const parts=String(header||'').split(',').map(v=>v.split('='));
 const ts=parts.filter(([k])=>k==='t');if(ts.length!==1||!/^\d+$/.test(ts[0][1]))throw Error('Invalid signature');
 const t=Number(ts[0][1]);if(Math.abs(now-t)>300)throw Error('Expired signature');
 const signatures=parts.filter(([k,v])=>k==='v1'&&/^[0-9a-f]{64}$/i.test(v)).map(([,v])=>Uint8Array.from(v.match(/../g),x=>parseInt(x,16)));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const bytes=new TextEncoder().encode(`${t}.${raw}`);let valid=false;
 for(const sig of signatures){if(await crypto.subtle.verify('HMAC',key,sig,bytes))valid=true;}
 if(!valid)throw Error('Invalid signature');
 const event=JSON.parse(raw);
 if(!/^evt_[A-Za-z0-9]+$/.test(event.id||'')||event.livemode!==true||(event.account&&event.account!==CFG.account)||typeof event.type!=='string')throw Error('Wrong event environment');
 return event;
}
