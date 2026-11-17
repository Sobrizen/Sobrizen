import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createAdminEntry} from '../admin-entry.mjs';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function harness(read){
  const dom=new JSDOM('<main id="content"></main>',{url:'https://www.sobrizen.com/'});
  const S={user:{id:'owner'},demo:false,page:'profile'};let revision=0,calls=0;
  const entry=createAdminEntry({S,doc:dom.window.document,getClient:async()=>({rpc:async name=>{calls++;assert.equal(name,'sobrizen_admin_access');return read();}}),sessionContext:()=>({user:S.user,demo:S.demo,revision}),sameSession:c=>c.user===S.user&&c.demo===S.demo&&c.revision===revision});
  const slot=()=>dom.window.document.querySelector('[data-admin-entry]');
  function render(){dom.window.document.getElementById('content').innerHTML=entry.view();entry.pageRendered();}
  return {S,entry,render,slot,get calls(){return calls;},switchUser(){entry.reset();revision++;S.user={id:'other'};},close(){entry.reset();dom.window.close();}};
}
test('profile shortcut is hidden until server confirmation and links to the existing private dashboard',async()=>{
  let resolve;const h=harness(()=>new Promise(done=>{resolve=done;}));
  try{h.render();assert.equal(h.slot().hidden,true);await tick();resolve({data:true,error:null});await tick();assert.equal(h.slot().hidden,false);assert.equal(h.slot().querySelector('a').getAttribute('href'),'/admin');
    h.render();await tick();assert.equal(h.slot().hidden,false);assert.equal(h.calls,1);
  }finally{h.close();}
});
test('ordinary members and service failures never display the administrator shortcut',async()=>{
  for(const result of [{data:false,error:null},{data:'true',error:null},{data:null,error:{message:'unavailable'}}]){
    const h=harness(async()=>result);try{h.render();await tick();assert.equal(h.slot().hidden,true);}finally{h.close();}
  }
});
test('late authorization cannot display the shortcut after a session switch',async()=>{
  let resolve;const h=harness(()=>new Promise(done=>{resolve=done;}));
  try{h.render();await tick();h.switchUser();resolve({data:true,error:null});await tick();assert.equal(h.slot().hidden,true);}
  finally{h.close();}
});
test('demo and other app pages send no administrator permission request',async()=>{
  const h=harness(async()=>({data:true,error:null}));
  try{h.S.demo=true;h.render();await tick();assert.equal(h.calls,0);assert.equal(h.slot().hidden,true);
    h.S.demo=false;h.S.page='home';h.render();await tick();assert.equal(h.calls,0);
  }finally{h.close();}
});
