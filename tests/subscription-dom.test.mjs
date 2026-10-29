/**
 * Subscription-page contract tests. Run with Node 24 and test-only jsdom 30.1.3:
 * node tests/subscription-dom.test.mjs
 * SOBRIZEN_QA_JSDOM may point to another jsdom lib/api.js.
 * No account, payment, email, browser navigation or external request is real.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const jsdomPath=process.env.SOBRIZEN_QA_JSDOM||'/tmp/sobrizen-audit-qa/node_modules/jsdom/lib/api.js';
let JSDOM,VirtualConsole;
try{({JSDOM,VirtualConsole}=await import(pathToFileURL(jsdomPath).href));}
catch(error){throw Error(`Install the test-only dependency: npm install --prefix /tmp/sobrizen-audit-qa --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org jsdom@30.1.3\n${error.message}`);}

const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const NOW=Date.parse('2026-10-27T12:30:00Z');
const stampA='2027-01-31T23:59:00Z';
const copy=value=>structuredClone(value);
const settle=async()=>{await Promise.resolve();await new Promise(resolve=>setTimeout(resolve,5));};
async function until(predicate,label){for(let i=0;i<100;i++){if(predicate())return;await settle();}assert.fail(`Timed out: ${label}`);}

async function page(t,{signedIn=true,salesOpen=false,premiumA=true,grantA=null,url='https://sobrizen.test/abonnement.html'}={}){
  const html=await readFile(new URL('../abonnement.html',import.meta.url),'utf8');
  const source=html.match(/<script\s+type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(source,'The real subscription module must remain present');
  const sdkImport=/import\((['"])https:\/\/esm\.sh\/@supabase\/supabase-js@[^'"]+\1\)/g;
  assert.equal([...source.matchAll(sdkImport)].length,1,'Replace only the external SDK import');
  const validationSource=await readFile(new URL('../form-validation.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(validationSource,/^import\s/m,'The DOM helper is evaluated unchanged apart from exports');
  const localImport=/^import \{initFormValidation,showFieldError,showFormError,clearFormError\} from '\.\/form-validation\.mjs';\n/m;
  assert.match(source,localImport,'The subscription form uses the same real validation helper');
  const script=validationSource.replace(/^export\s+/gm,'')+'\n'+source.replace(localImport,'').replace(sdkImport,'Promise.resolve(window.__subscriptionQaSdk)');
  const errors=[],navigations=[],downloads=[],calls=[],gates=[],faults=new Map();
  const virtualConsole=new VirtualConsole();
  virtualConsole.on('jsdomError',error=>{
    if(/navigation to another Document|Not implemented: navigation/i.test(error.message))navigations.push(error.message);
    else errors.push(error.stack||error.message);
  });
  const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
  const w=dom.window;
  class FixedDate extends Date{constructor(...args){super(...(args.length?args:[NOW]));}static now(){return NOW;}}
  w.Date=FixedDate;
  w.addEventListener('error',event=>{errors.push(event.error?.stack||event.message);event.preventDefault();});
  w.addEventListener('unhandledrejection',event=>{errors.push(String(event.reason));event.preventDefault();});
  w.URL.createObjectURL=()=>`blob:https://sobrizen.test/qa-${downloads.length+1}`;
  w.URL.revokeObjectURL=()=>{};
  const anchorClick=w.HTMLAnchorElement.prototype.click;
  w.HTMLAnchorElement.prototype.click=function(){
    if(this.download){downloads.push({href:this.href,name:this.download});return;}
    return anchorClick.call(this);
  };
  let authCallback=null,boot=null,serial=0;
  const tokens=new Map();
  function makeSession(uid,version=1){
    if(!uid)return null;
    const token=`qa-token-${uid===A?'A':'B'}-${version}`;tokens.set(token,uid);
    return{access_token:token,user:{id:uid,email:uid===A?'account-a@example.invalid':'account-b@example.invalid'}};
  }
  let current=signedIn?makeSession(A):null;
  const statuses={
    [A]:{premium:premiumA,paid_until:premiumA?stampA:null,cancel_at_period_end:false},
    [B]:{premium:false,paid_until:null,cancel_at_period_end:false},
  };
  const grants={[A]:grantA?{expires_at:grantA}:null,[B]:null};
  function defer(match){
    let release;const promise=new Promise(resolve=>{release=resolve;});
    const gate={match,promise,release,used:false,call:null};gates.push(gate);return gate;
  }
  async function pause(call,result){
    calls.push(call);
    const gate=gates.find(item=>!item.used&&item.match(call));
    if(gate){gate.used=true;gate.call=call;await gate.promise;}
    return result;
  }
  const client={
    auth:{
      onAuthStateChange(callback){authCallback=callback;return{data:{subscription:{unsubscribe(){}}}};},
      async getSession(){return pause({kind:'session',uid:current?.user.id||null},{data:{session:copy(current)},error:null});},
    },
    from(table){
      assert.equal(table,'premium_test_grants','Unexpected database table');
      let uid=null;
      return{
        select(columns){assert.equal(columns,'expires_at');return this;},
        eq(key,value){assert.equal(key,'user_id');assert.ok([A,B].includes(value));uid=value;return this;},
        async maybeSingle(){assert.ok(uid,'Grant lookup requires an owner');return pause({kind:'grant',uid},{data:copy(grants[uid]),error:null});},
      };
    },
  };
  w.__subscriptionQaSdk={createClient(){return client;}};
  w.fetch=async(input,init={})=>{
    const target=new URL(String(input));
    assert.equal(target.protocol,'https:');
    assert.equal(target.hostname,'lnvtowdbbagwfbewnchz.supabase.co');
    assert.ok(target.pathname.startsWith('/functions/v1/sobrizen-billing/'));
    const route=target.pathname.split('/').at(-1),method=init.method||'GET';
    const authorization=init.headers?.Authorization||init.headers?.authorization;
    const uid=tokens.get(String(authorization||'').replace(/^Bearer /,''))||null;
    const body=init.body?JSON.parse(init.body):null;
    if(route==='health')assert.equal(method,'GET');
    else{assert.equal(method,'POST');assert.ok(uid,'POST requires a known fictional session token');}
    assert.ok(['health','status','request','checkout','portal','sync'].includes(route),`Unexpected endpoint ${route}`);
    const fault=faults.get(route);faults.delete(route);
    let data;
    if(fault)data=fault.data;
    else if(route==='health')data={sales_open:salesOpen,stripe_key_configured:true,terms_version:'qa-terms-v1'};
    else if(route==='status'||route==='sync')data=copy(statuses[uid]);
    else if(route==='request'){
      assert.equal(body.confirm,true);assert.ok(['withdrawal','account_deletion'].includes(body.kind));
      const name=uid===A?'A':'B';data={id:`QA-${name}-${++serial}`,receipt:`REÇU PRIVÉ QA ${name} — demande fictive ${serial}`};
    }else if(route==='checkout'){
      assert.equal(body.accept_terms,true);assert.equal(body.terms_version,'qa-terms-v1');
      data={url:`https://checkout.stripe.com/c/pay/qa-${uid===A?'A':'B'}`};
    }else data={url:`https://billing.stripe.com/p/session/qa-${uid===A?'A':'B'}`};
    const result={ok:!fault||fault.ok!==false,status:fault?.ok===false?503:200,json:async()=>copy(data)};
    return pause({kind:'http',route,method,uid,authorization,body},result);
  };
  const $=selector=>w.document.querySelector(selector);
  const text=selector=>$(selector)?.textContent.trim()||'';
  async function click(selector){const element=$(selector);assert.ok(element,selector);assert.equal(element.disabled,false,`Disabled: ${selector}`);element.click();await settle();}
  async function checked(selector,value){const input=$(selector);input.checked=value;input.dispatchEvent(new w.Event('change',{bubbles:true}));await settle();}
  async function request(){
    await checked('#confirmRequest',true);
    $('#requestForm').dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:$('#sendRequest')}));
    await settle();
  }
  async function emit(uid,event=uid?'SIGNED_IN':'SIGNED_OUT',version=1){
    assert.ok(authCallback,'Auth callback must be installed');current=makeSession(uid,version);
    authCallback(event,copy(current));await settle();
  }
  function start(){assert.equal(boot,null);boot=w.eval(`(async()=>{${script}\n})()`);return boot;}
  async function ready(){assert.ok(boot,'Call start first');await boot;await settle();}
  t.after(()=>{try{assert.deepEqual(errors,[],'No uncaught JavaScript or unsupported DOM errors');}finally{for(const gate of gates)gate.release();dom.window.close();}});
  return{w,$,text,click,checked,request,emit,start,ready,defer,calls,faults,statuses,grants,navigations,downloads};
}

function assertPurged(h){
  assert.equal(h.$('#receiptBox').hidden,true);
  assert.equal(h.text('#receipt'),'');
  assert.ok([null,'','mailto:contact@sobrizen.com'].includes(h.$('#emailRequest').getAttribute('href')),'No old receipt may remain in the mail link');
  assert.equal(h.$('#terms').checked,false);
  assert.equal(h.$('#confirmRequest').checked,false);
  assert.equal(h.$('#cancelSubscription').hidden,true);
  assert.doesNotMatch(h.text('#membership'),/^Premium actif|31\/01\/2027|REÇU PRIVÉ QA A/);
}

test('subscription: signed-out closed sales keep all purchase and request gates closed',async t=>{
  const h=await page(t,{signedIn:false});h.start();await h.ready();
  for(const selector of ['#terms','#checkout','#sendRequest'])assert.equal(h.$(selector).disabled,true);
  assert.equal(h.$('#login').hidden,false);assert.equal(h.$('#portal').hidden,true);
  assert.equal(h.calls.filter(call=>call.kind==='http'&&call.method==='POST').length,0);
  assert.match(h.text('#launch'),/fermées/);
  assert.match(h.text('.grid .card'),/trois jeux.*Snake Zen, Blocs Zen et 5 choses/);
  assert.doesNotMatch(h.text('.grid .card'),/2048|deux jeux/);
});

test('subscription: missing confirmation explains the exact field without sending a request',async t=>{
  const h=await page(t,{signedIn:true});h.start();await h.ready();
  const checkbox=h.$('#confirmRequest'),before=h.calls.length;
  await h.click('#sendRequest');
  assert.equal(checkbox.getAttribute('aria-invalid'),'true');
  const explanation=h.w.document.getElementById(checkbox.getAttribute('aria-errormessage'));
  assert.ok(explanation&&!explanation.hidden);
  assert.match(explanation.textContent,/Confirme l’envoi de ta demande/);
  assert.equal(h.calls.slice(before).some(call=>call.kind==='http'&&call.method==='POST'),false);
  await h.checked('#confirmRequest',true);
  assert.notEqual(checkbox.getAttribute('aria-invalid'),'true');
  assert.equal(h.$('[data-form-field-error]'),null);
});

test('subscription: closed sales retain account management and confirmed support requests',async t=>{
  const h=await page(t);h.start();await h.ready();
  assert.match(h.text('#membership'),/Premium actif/);
  assert.equal(h.$('#terms').disabled,true);assert.equal(h.$('#checkout').disabled,true);
  assert.equal(h.$('#portal').hidden,false);assert.equal(h.$('#portal').disabled,false);
  assert.equal(h.$('#cancelSubscription').hidden,false);
  h.$('#requestForm').dispatchEvent(new h.w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:h.$('#sendRequest')}));await settle();
  assert.equal(h.calls.filter(call=>call.route==='request').length,0,'Confirmation is required');
  await h.request();assert.equal(h.$('#receiptBox').hidden,false);assert.match(h.text('#receipt'),/REÇU PRIVÉ QA A/);
  await h.click('#download');assert.equal(h.downloads.length,1);assert.match(h.downloads[0].name,/QA-A/);
});

test('subscription: logout clears the receipt, mail link, acknowledgements and paid state',async t=>{
  const h=await page(t,{salesOpen:true});h.start();await h.ready();await h.request();
  await h.checked('#terms',true);await h.checked('#confirmRequest',true);
  await h.emit(null);assertPurged(h);assert.equal(h.$('#portal').hidden,true);assert.equal(h.$('#checkout').disabled,true);
  assert.equal(h.$('#download').disabled,true);
  const before=h.downloads.length;h.$('#download').dispatchEvent(new h.w.MouseEvent('click',{bubbles:true}));await settle();assert.equal(h.downloads.length,before,'Old receipt must not remain downloadable');
  assert.doesNotMatch(h.text('#account'),/account-a/);
});

test('subscription: switching accounts clears account A immediately before refreshing account B',async t=>{
  const h=await page(t,{salesOpen:true});h.start();await h.ready();await h.request();
  await h.checked('#terms',true);await h.checked('#confirmRequest',true);
  await h.emit(B);assertPurged(h);assert.match(h.text('#account'),/account-b/);
  await h.click('#refresh');assert.match(h.text('#membership'),/Aucun abonnement Premium actif/);
  assert.equal(h.$('#checkout').disabled,true,'Account B has not accepted the terms');
  assert.doesNotMatch(h.text('main'),/REÇU PRIVÉ QA A|account-a@example/);
});

test('subscription: a delayed status for A cannot replace the refreshed state of B',async t=>{
  const h=await page(t);h.start();await h.ready();
  const gate=h.defer(call=>call.kind==='http'&&call.route==='status'&&call.uid===A);
  await h.click('#refresh');await until(()=>gate.used,'A status');await h.emit(B);
  await h.click('#refresh');const membership=h.text('#membership');
  gate.release();await settle();
  assert.equal(h.text('#membership'),membership);assert.match(h.text('#account'),/account-b/);assertPurged(h);
});

test('subscription: a delayed temporary grant for A cannot appear in account B',async t=>{
  const h=await page(t,{premiumA:false,grantA:'2027-12-31T23:59:00Z'});h.start();await h.ready();
  assert.match(h.text('#membership'),/Premium temporaire/);
  const gate=h.defer(call=>call.kind==='grant'&&call.uid===A);
  await h.click('#refresh');await until(()=>gate.used,'A grant');await h.emit(B);await h.click('#refresh');
  gate.release();await settle();assert.doesNotMatch(h.text('#membership'),/temporaire|31\/12\/2027/);assert.match(h.text('#account'),/account-b/);
});

for(const failed of [false,true])test(`subscription: a delayed ${failed?'failed':'successful'} request for A cannot replace B's receipt`,async t=>{
  const h=await page(t);h.start();await h.ready();
  if(failed)h.faults.set('request',{ok:false,data:{error:'SERVICE_UNAVAILABLE'}});
  const gate=h.defer(call=>call.kind==='http'&&call.route==='request'&&call.uid===A);
  await h.request();await until(()=>gate.used,'A support request');await h.emit(B);assertPurged(h);
  await h.request();assert.match(h.text('#receipt'),/REÇU PRIVÉ QA B/);
  const receipt=h.text('#receipt'),notice=h.text('#statusMessage'),link=h.$('#emailRequest').href;
  gate.release();await settle();
  assert.equal(h.text('#receipt'),receipt);assert.equal(h.text('#statusMessage'),notice);assert.equal(h.$('#emailRequest').href,link);
  assert.doesNotMatch(h.text('main'),/REÇU PRIVÉ QA A/);assert.equal(h.$('#sendRequest').disabled,false);
});

for(const route of ['checkout','portal'])test(`subscription: a delayed ${route} URL cannot redirect after the account changes`,async t=>{
  const h=await page(t,{salesOpen:true});h.start();await h.ready();
  if(route==='checkout')await h.checked('#terms',true);
  const gate=h.defer(call=>call.kind==='http'&&call.route===route&&call.uid===A);
  await h.click(`#${route}`);await until(()=>gate.used,`${route} response`);await h.emit(route==='portal'?null:B);
  gate.release();await settle();assert.equal(h.navigations.length,0,'A stale Stripe URL must never be assigned');assertPurged(h);
});

test('subscription: a delayed getSession cannot send the old action or replace the new session',async t=>{
  const h=await page(t);h.start();await h.ready();
  const gate=h.defer(call=>call.kind==='session'&&call.uid===A);
  const before=h.calls.filter(call=>call.kind==='http'&&call.route==='request').length;
  await h.request();await until(()=>gate.used,'A getSession');await h.emit(B);gate.release();await settle();
  assert.equal(h.calls.filter(call=>call.kind==='http'&&call.route==='request').length,before,'No POST may follow a stale session read');
  assert.match(h.text('#account'),/account-b/);assertPurged(h);
  await h.click('#refresh');assert.equal(h.calls.findLast(call=>call.route==='status').uid,B);
});

test('subscription: token refresh for the same account retains its receipt and form choices',async t=>{
  const h=await page(t,{salesOpen:true});h.start();await h.ready();await h.request();
  await h.checked('#terms',true);await h.checked('#confirmRequest',true);
  const receipt=h.text('#receipt'),link=h.$('#emailRequest').href,membership=h.text('#membership');
  await h.emit(A,'TOKEN_REFRESHED',2);
  assert.equal(h.text('#receipt'),receipt);assert.equal(h.$('#receiptBox').hidden,false);
  assert.equal(h.$('#emailRequest').href,link);assert.equal(h.text('#membership'),membership);
  assert.equal(h.$('#terms').checked,true);assert.equal(h.$('#confirmRequest').checked,true);
  await h.click('#refresh');assert.equal(h.calls.findLast(call=>call.route==='status').authorization,'Bearer qa-token-A-2');
});

test('subscription: service failures are visible and restore controls without bypassing closed sales',async t=>{
  const h=await page(t);h.start();await h.ready();
  h.faults.set('status',{ok:false,data:{error:'SERVICE_UNAVAILABLE'}});await h.click('#refresh');
  assert.match(h.text('#statusMessage'),/indisponible/);assert.equal(h.$('#refresh').disabled,false);assert.equal(h.$('#checkout').disabled,true);
  h.faults.set('request',{ok:false,data:{error:'SERVICE_UNAVAILABLE'}});await h.request();
  assert.equal(h.$('#receiptBox').hidden,true);assert.equal(h.$('#confirmRequest').checked,true);
  assert.equal(h.$('#sendRequest').disabled,false);assert.match(h.text('#statusMessage'),/indisponible/);
});

test('subscription: only an allowed Stripe URL is passed to browser navigation',async t=>{
  const h=await page(t);h.start();await h.ready();
  h.faults.set('portal',{ok:true,data:{url:'https://invalid.example/qa-payment'}});await h.click('#portal');
  assert.equal(h.navigations.length,0);assert.match(h.text('#statusMessage'),/indisponible/);
  await h.click('#portal');assert.equal(h.navigations.length,1,'The valid simulated portal URL reaches location.assign');
});

test('subscription: a delayed payment-return sync for A cannot confirm Premium for B',async t=>{
  const h=await page(t,{url:'https://sobrizen.test/abonnement.html?checkout=success&session_id=cs_qa_A'});
  const gate=h.defer(call=>call.kind==='http'&&call.route==='sync'&&call.uid===A);
  h.start();await until(()=>gate.used,'return sync for A');await h.emit(B);gate.release();await h.ready();
  assert.match(h.text('#account'),/account-b/);assertPurged(h);
  assert.doesNotMatch(h.text('#statusMessage'),/abonnement Premium est confirmé/);
  assert.equal(h.calls.filter(call=>call.route==='sync'&&call.uid===B).length,0,'A payment return must not be reassigned to another account');
});
