/** Actual app and dialog lifecycle with fictional, deferred owner-scoped writes. */
import assert from 'node:assert/strict';
import {environment,boot,mockService,UID,UID2,$,$$,click,closeModal,submit,value,settle} from './ux-dom-support.mjs';
const env=await environment({online:true,mobile:true}),mock=await mockService(),results=[];
// Both accounts consent, so an account-switch test cannot accidentally pass
// merely because loading the second account withdrew all private state.
for(const table of ['user_settings','sobriety_journeys','progress_settings','journey_timelines']){
  const original=mock.tables[table].find(row=>row.user_id===UID);
  if(original)mock.tables[table]=[...mock.tables[table].filter(row=>row.user_id!==UID2),{...structuredClone(original),user_id:UID2}];
}
const from=mock.client.from;let failure=null;
mock.client.from=table=>{
  const query=from(table),run=query.run.bind(query);
  query.run=async()=>{
    if(table==='urge_events'&&query.op==='upsert'&&failure&&!failure.used){const hold=failure;hold.used=true;await hold.promise;return{data:null,error:{message:'Sauvegarde QA indisponible'}};}
    return run();
  };return query;
};
function failNextSave(){let release;const promise=new Promise(resolve=>{release=resolve;});failure={promise,release,used:false};return failure;}
const writes=()=>mock.calls.filter(call=>call.table==='urge_events'&&call.op==='upsert');
async function reset(){await mock.signOut();await mock.signIn({id:UID});await closeModal();mock.calls.length=0;mock.tables.urge_events=[];failure=null;}
async function startPause(){await click('header [data-action="help"]');await click('[data-action="urge"]');await value($('#urgeStartForm'),'before','8');await submit($('#urgeStartForm'));await value($('#urgeEndForm'),'after','7');return $('[data-urge-pause]').dataset.urgePause;}
async function check(name,run){const before=env.errors.length;try{await reset();await run();assert.deepEqual(env.errors.slice(before),[]);results.push(true);console.log('PASS '+name);}catch(error){results.push(false);console.error('FAIL '+name+'\n'+error.stack);}}
try{
  await boot({mock});
  await check('a reopened pause remains visibly pending and cannot create a second write or lose its selected intensity',async()=>{
    const id=await startPause(),gate=mock.defer(call=>call.table==='urge_events'&&call.op==='upsert');await submit($('#urgeEndForm'));assert.equal(gate.used,true);
    assert.match($('#urgeSaveStatus').textContent,/Enregistrement en cours/);assert.equal($('#afterValue').textContent,'7');
    await click('[data-action="help"]');assert.ok($('#modal a[href="tel:112"]'));await click('[data-action="urge"]');
    assert.equal($('[data-urge-pause]').dataset.urgePause,id);assert.equal($('#afterValue').textContent,'7');assert.equal($('#urgeEndForm').getAttribute('aria-busy'),'true');
    assert.equal($$('#urgeStartForm input,#urgeStartForm select,#urgeStartForm button,#urgeEndForm input,#urgeEndForm button').every(control=>control.disabled),true);
    assert.equal($('[data-action="urge-toggle"]'),null);await env.tick();assert.equal($('#urgeEndForm [name="after"]').disabled,true);
    $('#urgeEndForm').dispatchEvent(new SubmitEvent('submit',{bubbles:true,cancelable:true}));await settle();assert.equal(writes().length,1);
    gate.release();await settle(35);assert.equal($('#modal').open,false);assert.equal(mock.tables.urge_events.length,1);assert.equal(mock.tables.urge_events[0].id,id);assert.equal(mock.tables.urge_events[0].outcome,'Intensité après la pause : 7/10');
  });
  await check('confirmation of a background save leaves the help and emergency contacts open',async()=>{
    await startPause();const gate=mock.defer(call=>call.table==='urge_events'&&call.op==='upsert');await submit($('#urgeEndForm'));await click('[data-action="help"]');
    gate.release();await settle(35);assert.equal($('#modal').open,true);assert.ok($('#modal a[href="tel:112"]'));assert.equal($('#urgeEndForm'),null);
    await click('[data-action="urge"]');assert.equal($('[data-action="urge-toggle"]'),null);assert.equal($('#beforeValue').textContent,'5');assert.equal($('#urgeEndForm').hidden,true);
  });
  await check('a failed response re-enables the current pause with the same draft and UUID for a safe retry',async()=>{
    const id=await startPause(),hold=failNextSave();await submit($('#urgeEndForm'));assert.equal(hold.used,true);await click('[data-action="help"]');await click('[data-action="urge"]');hold.release();await settle(35);
    assert.equal($('#modal').open,true);assert.match($('#urgeSaveStatus').textContent,/indisponible/);assert.equal($('#urgeSaveStatus').getAttribute('role'),'alert');assert.equal($('#afterValue').textContent,'7');
    assert.equal($('#urgeEndForm [name="after"]').disabled,false);assert.equal($('#urgeEndForm button').disabled,false);assert.equal($('#urgeStartForm button').disabled,false);assert.equal($('[data-urge-pause]').dataset.urgePause,id);
    await submit($('#urgeEndForm'));await settle(30);assert.equal($('#modal').open,false);assert.equal(mock.tables.urge_events.length,1);assert.equal(mock.tables.urge_events[0].id,id);
  });
  await check('a failure while help is open reports the problem without reopening an editor',async()=>{
    const id=await startPause(),hold=failNextSave();await submit($('#urgeEndForm'));await click('[data-action="help"]');hold.release();await settle(35);
    assert.ok($('#modal a[href="tel:112"]'));assert.equal($('#urgeEndForm'),null);assert.match($('#notice').textContent,/indisponible/);
    await click('[data-action="urge"]');assert.equal($('[data-urge-pause]').dataset.urgePause,id);assert.equal($('#afterValue').textContent,'7');assert.match($('#urgeSaveStatus').textContent,/réessayer/);assert.equal($('#urgeEndForm button').disabled,false);
  });
  await check('a late save cannot restore a previous account pause, receipt or private intensity',async()=>{
    await startPause();const gate=mock.defer(call=>call.table==='urge_events'&&call.op==='upsert');await submit($('#urgeEndForm'));await mock.signIn({id:UID2});await closeModal();
    const notice=$('#notice').textContent;gate.release();await settle(35);assert.equal($('#notice').textContent,notice);
    await click('header [data-action="help"]');await click('[data-action="urge"]');assert.equal($('#beforeValue').textContent,'5');assert.equal($('[data-action="urge-toggle"]'),null);assert.equal($('#urgeEndForm').hidden,true);assert.equal(writes().some(call=>call.payload.user_id===UID2),false);
  });
}finally{await closeModal();env.close();}
const failed=results.filter(value=>!value).length;console.log(`${results.length-failed}/${results.length} urge saving checks passed`);if(failed)process.exitCode=1;
