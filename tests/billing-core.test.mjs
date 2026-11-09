import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {CFG,PLANS,planForPrice,validPrice,launchReady,publicOffer,membership,snapshot,checkoutParameters,goodCharge,verifySignature} from '../billing/core.mjs';
const NOW=Date.parse('2026-11-09T12:00:00Z'),SEC=Math.floor(NOW/1000),DAY=86400;
const A='11111111-1111-4111-8111-111111111111',ATTEMPT='22222222-2222-4222-8222-222222222222';
const price=(plan='monthly',extra={})=>({id:`price_${plan}`,product:CFG.product,livemode:true,currency:'eur',type:'recurring',active:true,unit_amount:PLANS[plan].amount,recurring:{interval:PLANS[plan].interval,interval_count:1},...extra});
const subscription=(plan='monthly',extra={})=>({id:'sub_Example',customer:'cus_Example',livemode:true,status:'active',start_date:SEC-2*DAY,cancel_at_period_end:false,items:{data:[{quantity:1,price:price(plan)}]},...extra});
const charge=(plan='monthly',extra={})=>({id:'ch_Example',livemode:true,status:'succeeded',paid:true,disputed:false,refunded:false,amount_refunded:0,amount:PLANS[plan].amount,currency:'eur',...extra});
const invoice=(plan='monthly',extra={})=>({id:'in_Example',subscription:'sub_Example',livemode:true,status:'paid',currency:'eur',amount_paid:PLANS[plan].amount,paid_out_of_band:false,verified_charges:[charge(plan)],lines:{data:[{price:`price_${plan}`,quantity:1,proration:false,period:{start:SEC-DAY,end:SEC+(plan==='monthly'?29:364)*DAY}}]},...extra});
const readiness=()=>({sales_enabled:true,legal_ready:true,tax_ready:true,hosting_ready:true,premium_features_ready:true,terms_version:CFG.termsVersion});

test('billing offer validates exact live recurring prices and all readiness gates',()=>{
 for(const plan of ['monthly','annual','launch']){
  assert.equal(planForPrice(price(plan))?.id,plan);assert.equal(validPrice(price(plan)),true);
  assert.equal(planForPrice(price(plan,{product:{id:CFG.product}}))?.id,plan);
 }
 for(const patch of [{product:'prod_Other'},{livemode:false},{currency:'usd'},{type:'one_time'},{unit_amount:0},{unit_amount:300},{recurring:{interval:'year',interval_count:1}},{recurring:{interval:'month',interval_count:2}}])assert.equal(validPrice(price('monthly',patch)),false);
 assert.equal(validPrice(price('annual',{active:false})),false);
 assert.equal(planForPrice(price('annual',{active:false}))?.id,'annual','historic invoices may refer to an inactive price');
 assert.equal(validPrice(price('monthly',{livemode:false}),{livemode:false}),true);
 assert.equal(launchReady(readiness()),true);
 for(const key of ['sales_enabled','legal_ready','tax_ready','hosting_ready','premium_features_ready'])for(const value of [false,'true',null])assert.equal(launchReady({...readiness(),[key]:value}),false);
 assert.equal(launchReady({...readiness(),terms_version:'old'}),false);assert.equal(launchReady(null),false);
});

test('the public launch counter is bounded, keeps zero and never invents unknown availability',()=>{
 for(const n of [0,1,99,100])assert.equal(publicOffer(n).launch.remaining,n);
 for(const n of [-1,101,0.5,NaN,Infinity,'100',undefined,null])assert.equal(publicOffer(n).launch.remaining,null);
 const offer=publicOffer(100);assert.equal(offer.monthly.amount,299);assert.equal(offer.annual.amount,2999);assert.equal(offer.launch.amount,1999);assert.equal(offer.trial_days,7);assert.equal(offer.launch.limit,100);assert.equal(offer.launch.lifetime_while_active,true);
});

test('membership follows nonexpired paid/trial time, status, risk blocks and latest valid access',()=>{
 const future=new Date(NOW+DAY*1000).toISOString(),later=new Date(NOW+2*DAY*1000).toISOString(),past=new Date(NOW-1).toISOString();
 const row={status:'active',paid_until:future,trial_until:null,plan:'monthly',unit_amount:299};
 assert.equal(membership([row],NOW).premium,true);assert.equal(membership([{...row,status:'past_due'}],NOW).premium,true);
 for(const status of ['canceled','unpaid','paused','incomplete','incomplete_expired','trialing'])assert.equal(membership([{...row,status}],NOW).premium,false);
 for(const paid_until of [past,new Date(NOW).toISOString(),null,'invalid'])assert.equal(membership([{...row,paid_until}],NOW).premium,false);
 assert.equal(membership([{...row,access_blocked:true}],NOW).premium,false);
 const trial={...row,status:'trialing',paid_until:null,trial_until:later,plan:'annual',cancel_at_period_end:true};
 assert.deepEqual(membership([row,trial],NOW),{premium:true,paid_until:null,trial_until:later,access_until:later,trial:true,cancel_at_period_end:true,plan:'annual',unit_amount:299});
 assert.equal(membership([],NOW).premium,false);
});

test('a snapshot grants each paid plan only for a verified collected invoice period',()=>{
 for(const plan of ['monthly','annual','launch']){
  const result=snapshot(subscription(plan),[invoice(plan)],NOW);assert.equal(result.premium,true);assert.equal(result.plan,plan);assert.equal(result.unit_amount,PLANS[plan].amount);assert.equal(result.paid_until,new Date(invoice(plan).lines.data[0].period.end*1000).toISOString());
  assert.equal(snapshot(subscription(plan),[],NOW).premium,false);
 }
});

test('subscription shape, product and environment cannot grant access accidentally',()=>{
 const base=subscription();
 for(const sub of [null,{...base,livemode:false},{...base,start_date:0},{...base,items:{data:[]}},{...base,items:{data:[base.items.data[0],base.items.data[0]]}},{...base,items:{data:[{...base.items.data[0],quantity:2}]}},{...base,items:{data:[{quantity:1,price:price('monthly',{product:'prod_Other'})}]}}])assert.throws(()=>snapshot(sub,[invoice()],NOW),/Unexpected subscription product/);
});

test('refunded, disputed, failed, uncollected, underpaid and unrelated invoices never grant paid access',()=>{
 const alteredInvoices=[
  invoice('monthly',{livemode:false}),invoice('monthly',{subscription:'sub_Other'}),invoice('monthly',{status:'open'}),invoice('monthly',{currency:'usd'}),invoice('monthly',{amount_paid:298}),invoice('monthly',{amount_paid:0}),invoice('monthly',{paid_out_of_band:true}),invoice('monthly',{verified_charges:[]})
 ];
 for(const patch of [{livemode:false},{status:'failed'},{paid:false},{disputed:true},{refunded:true},{amount_refunded:1},{currency:'usd'},{amount:298}])alteredInvoices.push(invoice('monthly',{verified_charges:[charge('monthly',patch)]}));
 for(const inv of alteredInvoices){const result=snapshot(subscription(),[inv],NOW);assert.equal(result.premium,false);assert.equal(result.paid_until,null);}
 assert.equal(goodCharge(null),false);assert.equal(goodCharge('ch_Example'),false);
 assert.equal(snapshot(subscription(),[invoice()],NOW,{blocked:true}).premium,false);
});

test('invoice lines reject proration, wrong prices, wrong quantity and implausible periods',()=>{
 const line=invoice().lines.data[0];
 for(const patch of [{price:'price_Other'},{quantity:2},{proration:true},{parent:{subscription_item_details:{proration:true}}},{period:{start:SEC,end:SEC}},{period:{start:SEC,end:SEC+33*DAY}},{period:{start:0,end:SEC+DAY}}]){
  const inv=invoice('monthly',{lines:{data:[{...line,...patch}]}});assert.equal(snapshot(subscription(),[inv],NOW).premium,false);
 }
 assert.equal(snapshot(subscription('annual'),[invoice('annual',{lines:{data:[{...invoice('annual').lines.data[0],period:{start:SEC,end:SEC+371*DAY}}]}})],NOW).premium,false);
});

test('current Stripe invoice shapes and multiple verified payments preserve valid access',()=>{
 const inv=invoice();delete inv.subscription;inv.parent={subscription_details:{subscription:{id:'sub_Example'}}};
 const line=inv.lines.data[0];delete line.price;line.pricing={price_details:{price:'price_monthly'}};
 inv.verified_charges=[charge('monthly',{id:'ch_One',amount:100}),charge('monthly',{id:'ch_Two',amount:199})];
 assert.equal(snapshot(subscription(),[inv],NOW).premium,true);
 const old=invoice('monthly',{lines:{data:[{...line,period:{start:SEC-40*DAY,end:SEC-10*DAY}}]}});
 assert.equal(snapshot(subscription(),[old,inv],NOW).paid_until,new Date((SEC+29*DAY)*1000).toISOString());
});

test('verified trial grants seven days, rejects oversized or expired periods and honors status',()=>{
 const trial=subscription('annual',{status:'trialing',trial_start:SEC-DAY,trial_end:SEC+6*DAY});
 const result=snapshot(trial,[],NOW);assert.equal(result.premium,true);assert.equal(result.paid_until,null);assert.equal(result.trial_until,new Date((SEC+6*DAY)*1000).toISOString());
 for(const sub of [{...trial,trial_end:SEC+7*DAY},{...trial,trial_start:0},{...trial,trial_start:SEC-8*DAY,trial_end:SEC-DAY},{...trial,status:'canceled'}])assert.equal(snapshot(sub,[],NOW).premium,false);
 assert.equal(snapshot(trial,[],NOW,{blocked:true}).premium,false);
});

test('Checkout commits exact plan, trial, reservation, site and one-hour expiration',()=>{
 for(const plan of ['monthly','annual','launch'])for(const trial of [true,false]){
  const result=checkoutParameters({userId:A,customerId:'cus_Example',priceId:`price_${plan}`,plan,trial,reservationId:plan==='launch'?ATTEMPT:undefined,now:NOW,integrationId:'integration_test'});
  assert.equal(result.mode,'subscription');assert.equal(result.customer,'cus_Example');assert.equal(result.client_reference_id,A);assert.deepEqual(result.line_items,[{price:`price_${plan}`,quantity:1}]);
  assert.equal(result.expires_at,SEC+3600);assert.equal(result.payment_method_collection,'always');assert.equal(result.metadata.plan,plan);assert.equal(result.subscription_data.metadata.user_id,A);assert.equal(result.metadata.terms_version,CFG.termsVersion);assert.equal(result.integration_identifier,'integration_test');
  assert.ok(result.success_url.startsWith(CFG.site+'/abonnement?'));assert.ok(result.cancel_url.startsWith(CFG.site+'/abonnement?'));
  if(trial){assert.equal(result.subscription_data.trial_period_days,7);assert.equal(result.subscription_data.trial_settings.end_behavior.missing_payment_method,'cancel');assert.match(result.custom_text.submit.message,/7 jours gratuits/);}
  else {assert.equal(result.subscription_data.trial_period_days,undefined);assert.equal(result.subscription_data.trial_settings,undefined);assert.doesNotMatch(result.custom_text.submit.message,/7 jours gratuits/);}
  if(plan==='launch'){assert.equal(result.metadata.launch_reservation_id,ATTEMPT);assert.match(result.custom_text.submit.message,/reste actif/);}
  assert.match(result.custom_text.submit.message,/Renouvellement automatique/);assert.match(result.custom_text.submit.message,/14 jours/);
 }
});

test('invalid identities, missing launch reservation and unknown plans never produce a Checkout',()=>{
 const base={userId:A,customerId:'cus_Example',priceId:'price_Example',plan:'monthly',now:NOW};
 for(const patch of [{userId:'bad'},{customerId:'wrong'},{priceId:'wrong'},{plan:'unknown'},{plan:'launch'},{plan:'launch',reservationId:'bad'},{plan:'toString'},{plan:'__proto__'},{plan:['monthly']}])assert.throws(()=>checkoutParameters({...base,...patch}),/Invalid checkout context|Launch reservation required/);
});

const secret='whsec_isolated_unit_test_only';
const event=extra=>({id:'evt_Example',livemode:true,type:'invoice.paid',data:{object:{}},...extra});
const signed=(object=event(),timestamp=SEC,key=secret)=>{
 const raw=JSON.stringify(object),signature=createHmac('sha256',key).update(`${timestamp}.${raw}`).digest('hex');return {raw,header:`t=${timestamp},v1=${signature}`,signature};
};
test('webhook HMAC verifies raw body, environment, account and five-minute tolerance',async()=>{
 const valid=signed();assert.equal((await verifySignature(valid.raw,valid.header,secret,SEC)).id,'evt_Example');
 const withAccount=signed(event({account:CFG.account}));assert.equal((await verifySignature(withAccount.raw,withAccount.header,secret,SEC)).account,CFG.account);
 const rotation=`t=${SEC},v1=${'0'.repeat(64)},v1=${valid.signature}`;assert.equal((await verifySignature(valid.raw,rotation,secret,SEC)).id,'evt_Example');
 assert.equal((await verifySignature(valid.raw,valid.header,secret,SEC+300)).id,'evt_Example');
 await assert.rejects(verifySignature(valid.raw,valid.header,secret,SEC+301),/Expired signature/);
 await assert.rejects(verifySignature(valid.raw,valid.header,secret,SEC-301),/Expired signature/);
 await assert.rejects(verifySignature(valid.raw+' ',valid.header,secret,SEC),/Invalid signature/);
 await assert.rejects(verifySignature(valid.raw,valid.header,'whsec_wrong',SEC),/Invalid signature/);
 await assert.rejects(verifySignature(valid.raw,valid.header,'bad',SEC),/Webhook secret unavailable/);
 for(const header of ['',`t=${SEC},t=${SEC},v1=${valid.signature}`,`t=abc,v1=${valid.signature}`,`t=${SEC},v1=bad`])await assert.rejects(verifySignature(valid.raw,header,secret,SEC),/Invalid signature/);
 for(const wrong of [event({livemode:false}),event({account:'acct_Other'}),event({id:'bad'}),event({type:null})]){const value=signed(wrong);await assert.rejects(verifySignature(value.raw,value.header,secret,SEC),/Wrong event environment/);}
});
