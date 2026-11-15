import test from 'node:test';
import assert from 'node:assert/strict';
import {accessDeadline,expireUnverifiedAccess,createMembershipRefresh} from '../membership-refresh.mjs';

const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function setup({initial={},read,fallback}={}){
 let time=100000,revision=1,serial=0,billing=initial,user={id:'account-a'};
 const win=new EventTarget(),doc=new EventTarget(),channel=new EventTarget(),timers=new Map(),applied=[],calls=[];
 doc.hidden=false;channel.close=()=>{};
 const controller=createMembershipRefresh({context:()=>({user,revision,demo:false}),isCurrent:c=>c.user===user&&c.revision===revision,state:()=>billing,apply:next=>{billing=next;applied.push(next);},read:async c=>{calls.push(c.user.id);return read?read(c):{premium:false,ready:true};},readFallback:async c=>{if(fallback)return fallback(c);throw Error('offline');},win,doc,now:()=>time,setTimer:(fn,delay)=>{const id=++serial;timers.set(id,{fn,at:time+delay});return id;},clearTimer:id=>timers.delete(id),channelFactory:()=>channel});
 return {controller,win,doc,channel,calls,applied,timers,get state(){return billing;},setState:next=>{billing=next;controller.schedule();},switchAccount:()=>{revision++;user={id:'account-b'};billing={premium:false};controller.reset();},async advance(ms){time+=ms;for(const [id,t] of [...timers])if(t.at<=time){timers.delete(id);t.fn();}await flush();}};
}

test('focus, visible return and online signals share one bounded request',async()=>{
 const f=setup(),c=f.controller;
 f.win.dispatchEvent(new Event('focus'));f.doc.dispatchEvent(new Event('visibilitychange'));f.win.dispatchEvent(new Event('online'));await flush();assert.equal(f.calls.length,1);
 await f.advance(29999);f.win.dispatchEvent(new Event('focus'));await flush();assert.equal(f.calls.length,1);
 await f.advance(1);f.win.dispatchEvent(new Event('focus'));await flush();assert.equal(f.calls.length,2);c.destroy();
});
test('a hidden tab does not poll, then revalidates when visible',async()=>{
 const f=setup();f.doc.hidden=true;f.controller.schedule();await f.advance(300000);f.win.dispatchEvent(new Event('focus'));await flush();assert.equal(f.calls.length,0);
 f.doc.hidden=false;f.doc.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(f.calls.length,1);f.controller.destroy();
});
test('expiry tries the server before revoking and retains a confirmed renewal',async()=>{
 const response=deferred(),renewed={premium:true,ready:true,access_until:new Date(500000).toISOString()},f=setup({initial:{premium:true,access_until:new Date(110000).toISOString()},read:()=>response.promise});
 f.controller.schedule();await f.advance(10010);assert.equal(f.calls.length,1);assert.equal(f.state.premium,true);assert.equal(f.applied.length,0);
 response.resolve(renewed);await flush();assert.deepEqual(f.state,renewed);assert.equal(f.applied.some(s=>!s.premium),false);f.controller.destroy();
});
test('an unavailable service never extends expired access or creates Premium',async()=>{
 for(const initial of [{premium:false},{premium:true,access_until:new Date(100100).toISOString()}]){
  const f=setup({initial,read:()=>{throw Error('offline');}});await f.advance(200);await f.controller.refresh({expiry:true});assert.equal(f.state.premium,false);assert.equal(f.state.ready,false);f.controller.destroy();
 }
});
test('temporary outage preserves only a still valid previously verified entitlement',async()=>{
 const until=new Date(120000).toISOString(),f=setup({initial:{premium:true,ready:true,access_until:until},read:()=>{throw Error('offline');}});
 await f.controller.refresh();assert.equal(f.state.premium,true);assert.equal(f.state.access_until,until);
 await f.advance(20010);assert.equal(f.state.premium,false);f.controller.destroy();
});
test('status fallback is used when Stripe sync is unavailable',async()=>{
 let fallbacks=0;const f=setup({read:()=>{throw Error('sync unavailable');},fallback:()=>{fallbacks++;return {premium:true,ready:true,access_until:new Date(200000).toISOString()};}});
 await f.controller.refresh();assert.equal(fallbacks,1);assert.equal(f.state.premium,true);f.controller.destroy();
});
test('a late response from the previous account never grants the new account access',async()=>{
 const old=deferred(),f=setup({read:c=>c.user.id==='account-a'?old.promise:{premium:false,ready:true}});
 const pending=f.controller.refresh();await flush();f.switchAccount();await f.controller.refresh();old.resolve({premium:true,access_until:new Date(500000).toISOString()});await pending;
 assert.equal(f.state.premium,false);assert.equal(f.applied.length,1);assert.deepEqual(f.calls,['account-a','account-b']);f.controller.destroy();
});
test('a cross-tab message requests a server check and never trusts supplied entitlement data',async()=>{
 const f=setup();const fake=new Event('message');fake.data={type:'refresh',premium:true,access_until:'2099-01-01'};f.channel.dispatchEvent(fake);await flush();assert.equal(f.calls.length,1);assert.equal(f.state.premium,false);
 const unrelated=new Event('message');unrelated.data={premium:true};f.channel.dispatchEvent(unrelated);await flush();assert.equal(f.calls.length,1);f.controller.destroy();
});
test('periodic revalidation is bounded and destroy removes timers/listeners',async()=>{
 const f=setup();f.controller.schedule();await f.advance(300000);assert.equal(f.calls.length,1);assert.equal(f.timers.size,1);f.controller.destroy();assert.equal(f.timers.size,0);f.win.dispatchEvent(new Event('focus'));await flush();assert.equal(f.calls.length,1);
});
test('a payment return during cooldown queues a check instead of waiting five minutes',async()=>{
 const f=setup();await f.controller.refresh();await f.advance(3000);f.win.dispatchEvent(new Event('focus'));await flush();assert.equal(f.calls.length,1);
 await f.advance(27010);assert.equal(f.calls.length,2);f.controller.destroy();
});
test('a payment signal received during an in-flight request queues a later verification',async()=>{
 const first=deferred();let reads=0;const f=setup({read:()=>++reads===1?first.promise:{premium:false,ready:true}});const request=f.controller.refresh();await flush();
 const event=new Event('message');event.data={type:'refresh'};f.channel.dispatchEvent(event);first.resolve({premium:false,ready:true});await request;await f.advance(30010);assert.equal(f.calls.length,2);f.controller.destroy();
});
test('internal access has a separate finite deadline, never an arbitrary extension',()=>{
 assert.equal(accessDeadline({premium:true,access_until:new Date(20).toISOString(),test_until:new Date(30).toISOString()}),30);
 assert.equal(expireUnverifiedAccess({premium:true,test:true,test_until:new Date(30).toISOString()},31).premium,false);
 assert.equal(expireUnverifiedAccess({premium:true},1).premium,false);
});
