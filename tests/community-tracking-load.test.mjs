/** Real app loading lifecycle and canonical tracking; only the service and DOM are mocked. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {integrateApp} from '../scripts/integrate-community.mjs';
import {environment,boot,mockService,UID,$,txt,settle} from './ux-dom-support.mjs';

const env=await environment({online:true});
const mock=await mockService();
const appURL=new URL('../app.mjs',import.meta.url).href;
// Apply the real deployment bridge in memory and expose test access without changing production exports.
const hook=registerHooks({load(url,context,next){
  const loaded=next(url,context);
  return url===appURL?{...loaded,source:integrateApp(readFileSync(new URL(url),'utf8'))+'\nexport {S,progression,communityTrackingDuration,loadPrivate,invalidateSession,postModal,demo};\n'}:loaded;
}});
let failNextTable=null;
const from=mock.client.from;
mock.client.from=table=>{
  const query=from(table);
  if(table===failNextTable){
    failNextTable=null;
    const run=query.run.bind(query);
    query.run=async()=>{await run();throw Error('Simulated private read failure');};
  }
  return query;
};
const baseChecks=structuredClone(mock.tables.daily_checkins);
const drinkingToday={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',user_id:UID,checkin_date:'2026-10-27',sober_today:false,alcohol_units:2,updated_at:'2026-10-27T12:00:00.000Z'};
const holdChecks=()=>mock.defer(call=>call.table==='daily_checkins'&&call.op==='select');
let passed=0;
async function check(name,run){await run();passed++;console.log('PASS '+name);}

try{
  await boot({mock});
  const app=await import(appURL);
  const read=()=>app.communityTrackingDuration();
  const unavailable=()=>assert.deepEqual(read(),{status:'unavailable',days:null,precision:'unknown'});

  await check('initial completed loading makes the canonical duration available without extra queries',async()=>{
    assert.equal($('#loadError').hidden,true,txt('#loadError'));
    const calls=mock.calls.length;
    assert.deepEqual(read(),{status:'active',days:2,precision:'minute'});
    assert.equal(mock.calls.length,calls);
  });

  await check('a reload cannot revive an old stop while its daily consumption records are empty',async()=>{
    mock.tables.daily_checkins.push(drinkingToday);
    await app.loadPrivate();assert.equal(read().status,'no-current-stop');
    const gate=holdChecks(),loading=app.loadPrivate();
    unavailable();
    try{
      await settle();assert.equal(gate.used,true);
      assert.equal(app.S.checks.length,0);
      assert.equal(app.progression.ready(),true,'The old timeline is still loaded in this vulnerable interval');
      unavailable();
      app.postModal();assert.equal($('[data-community-duration] .community-duration-badge'),null);
      assert.match(txt('[data-community-duration]'),/indisponible/);$('#modal').close();
    }finally{gate.release();}
    assert.equal(await loading,true);
    assert.deepEqual(read(),{status:'no-current-stop',days:null,precision:'unknown'});
  });

  await check('a failed private reload stays unavailable until a full successful reload',async()=>{
    failNextTable='journal_entries';
    await assert.rejects(app.loadPrivate(),/Simulated private read failure/);
    assert.equal(app.S.checks.length,0);assert.equal(app.progression.ready(),true);unavailable();
    await app.loadPrivate();assert.equal(read().status,'no-current-stop');
  });

  await check('a replaced load cannot enable the duration while its replacement remains pending',async()=>{
    mock.tables.daily_checkins=structuredClone(baseChecks);await app.loadPrivate();assert.equal(read().days,2);
    const olderGate=holdChecks(),older=app.loadPrivate();await settle();assert.equal(olderGate.used,true);
    mock.tables.daily_checkins.push(drinkingToday);
    const newerGate=holdChecks(),newer=app.loadPrivate();
    try{
      await settle();assert.equal(newerGate.used,true);
      olderGate.release();assert.equal(await older,false);unavailable();
    }finally{olderGate.release();newerGate.release();}
    assert.equal(await newer,true);assert.equal(read().status,'no-current-stop');
  });

  await check('late completion of a replaced load cannot undo a failed replacement',async()=>{
    const gate=holdChecks(),older=app.loadPrivate();await settle();assert.equal(gate.used,true);
    try{
      failNextTable='journal_entries';
      await assert.rejects(app.loadPrivate(),/Simulated private read failure/);unavailable();
    }finally{gate.release();}
    assert.equal(await older,false);unavailable();
    mock.tables.daily_checkins=structuredClone(baseChecks);await app.loadPrivate();assert.equal(read().days,2);
  });

  await check('the integrated session reset invalidates a previously complete loading generation',async()=>{
    app.postModal();assert.ok($('[data-community-duration] .community-duration-badge'));
    app.invalidateSession();assert.equal(app.progression.ready(),true);unavailable();
    app.postModal();assert.equal($('[data-community-duration] .community-duration-badge'),null);$('#modal').close();
    await app.loadPrivate();assert.equal(read().days,2);
  });

  await check('consent withdrawal keeps the duration absent and does not load private records',async()=>{
    const settings=mock.tables.user_settings.find(row=>row.user_id===UID);
    settings.health_data_consent_revoked_at='2026-10-27T12:30:00.000Z';
    const before=mock.calls.length;
    assert.equal(await app.loadPrivate(),true);
    assert.deepEqual(read(),{status:'consent-required',days:null,precision:'unknown'});
    assert.equal(mock.calls.slice(before).some(call=>['daily_checkins','journey_timelines','journal_entries'].includes(call.table)),false);
  });

  await check('demo setup supplies its own complete in-memory tracking without a private load',async()=>{
    const before=mock.calls.length;
    app.demo();
    assert.deepEqual(read(),{status:'active',days:14,precision:'minute'});
    assert.equal(mock.calls.length,before);
  });

  assert.deepEqual(env.errors,[]);
}finally{hook.deregister();env.close();}
console.log(`${passed}/8 community tracking load checks passed; real network disabled`);
