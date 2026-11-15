import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {integrateApp} from '../scripts/integrate-community.mjs';
import {environment,boot,mockService,UID2,$,txt,click,value,submit,settle} from './ux-dom-support.mjs';

test('a direct account switch clears the previous private pause even when both accounts consented',async()=>{
 const env=await environment({online:true}),mock=await mockService();
 Object.assign(mock.tables.user_settings.find(row=>row.user_id===UID2),{health_data_consent_at:'2026-10-27T10:00:00Z',health_data_consent_version:'2026-10-02-v1'});
 // The production signup trigger creates each account's journey as well.
 mock.tables.sobriety_journeys.push({...structuredClone(mock.tables.sobriety_journeys[0]),user_id:UID2});
 const appURL=new URL('../app.mjs',import.meta.url).href;
 const hook=registerHooks({load(url,context,next){const result=next(url,context);return url===appURL?{...result,source:integrateApp(readFileSync(new URL(url),'utf8'))+'\nexport {S};\n'}:result;}});
 try{
  await boot({mock});const app=await import(appURL);
  await click('header [data-action="help"]');await click('[data-action="urge"]');
  await value($('#urgeStartForm'),'before','8');await value($('#urgeStartForm'),'strategy','appel');await submit($('#urgeStartForm'));
  assert.ok(app.S.urge);assert.equal(app.S.urge.before,8);
  await mock.signIn({id:UID2});await settle(30);
  assert.equal(app.S.user.id,UID2);assert.equal(app.S.urge,null);assert.equal($('#modal').open,false);
  assert.equal([...env.intervals.values()].filter(item=>item.delay===1000).length,0);
  await click('header [data-action="help"]');assert.ok($('[data-action="urge"]'),txt('#notice')+' '+txt('#modalContent'));await click('[data-action="urge"]');
  assert.equal($('#urgeStartForm').elements.before.value,'5');assert.equal($('#urgeStartForm').elements.strategy.value,'pause');
  assert.equal($('#urgeEndForm').hidden,true);assert.equal(txt('#timer'),'10:00');
  await submit($('#urgeEndForm'));assert.equal(mock.calls.filter(call=>call.table==='urge_events'&&call.op!=='select').length,0);
  assert.deepEqual(env.errors,[]);
 }finally{hook.deregister();env.close();}
});
