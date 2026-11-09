/** Bounded journal pages and real-server-query behavior; services only are mocked. */
import assert from 'node:assert/strict';
import {createJournalMotivation} from '../journal-motivation-ui.mjs';
import {MOTIVATION_TITLE} from '../journal-motivation.mjs';
import {environment,mockService,UID,UID2,$,$$,settle,click} from './ux-dom-support.mjs';
const env=await environment({online:true}),mock=await mockService(),results=[];
let revision=0,consent=true;
const S={user:{id:UID},demo:false,page:'journal',journal:[]};
const context=()=>({user:S.user,demo:S.demo,revision}),same=context=>context.user===S.user&&context.demo===S.demo&&context.revision===revision;
const rpcCalls=()=>mock.calls.filter(call=>call.rpc==='list_journal_entries');
const session=()=>{if(!S.user||!consent)throw Error('Consentement requis');};
const controller=createJournalMotivation({S,modal:(title,body)=>{$('#modalContent').innerHTML=`<h2>${title}</h2>${body}`;$('#modal').showModal();},closeModal:()=>$('#modal').close(),notify:()=>{},privateWrite:session,healthConsentActive:()=>consent,accountRequest:async build=>{session();const result=await build(mock.client,UID);if(result.error)throw result.error;return result.data;},message:error=>String(error.message||error),sessionContext:context,sameSession:same,today:()=> '2026-11-09'});
const stamp=i=>new Date(Date.UTC(2026,9,27,0,0,i)).toISOString();
const row=(i,extra={})=>({id:`12345678-1234-4234-8234-${String(i).padStart(12,'0')}`,user_id:UID,entry_date:'2026-10-27',title:`Note ${i}`,body:i===1?'Souvenir rare tout au fond':'Un moment personnel',kind:'reflection',created_at:stamp(i),updated_at:stamp(i),...extra});
const source=Array.from({length:75},(_,i)=>row(i+1));
source.push(row(200,{user_id:UID2,title:'Souvenir rare étranger'}));
for(let i=0;i<35;i++)source.push(row(300+i,{title:MOTIVATION_TITLE,body:`Citation privée ${i}`}));
async function reset(){revision++;controller.reset();S.user={id:UID};S.page='journal';S.demo=false;consent=true;mock.tables.journal_entries=structuredClone(source);mock.calls.length=0;const first=await mock.client.rpc('list_journal_entries',{p_search:'',p_offset:0,p_limit:21,p_motivation:false});S.journal=first.data;controller.reloaded(first.data);$('#content').innerHTML='<h1>Mon journal</h1>'+controller.view();}
async function check(name,run){try{await reset();await run();assert.deepEqual(env.errors,[]);results.push(true);console.log('PASS '+name);}catch(error){results.push(false);console.error('FAIL '+name+'\n'+error.stack);}}
try{
  await check('sequential pages reach notes older than 50 while retaining at most 20 notes',async()=>{
    assert.equal($$('#journalList article').length,20);assert.equal(S.journal.length,20);
    const ids=new Set(S.journal.map(row=>row.id));
    for(const offset of [20,40,60]){await click(`[data-jm-page="notes"][data-jm-offset="${offset}"]`);await settle(15);assert.ok(S.journal.length<=20);for(const note of S.journal){assert.equal(ids.has(note.id),false);ids.add(note.id);}}
    assert.equal(ids.size,75);assert.equal($$('#journalList article').length,15);assert.match($('#journalList').textContent,/61–75 · Page 4/);
    assert.equal($('[data-jm-page="notes"][data-jm-offset="80"]').disabled,true);assert.ok(rpcCalls().every(call=>call.args.p_limit===21));
  });
  await check('search queries the whole owner journal and finds an oldest note instead of the loaded page only',async()=>{
    assert.doesNotMatch($('#journalList').textContent,/Souvenir rare tout au fond/);
    controller.search('Souvenir rare');await settle(220);
    assert.equal($$('#journalList article').length,1);assert.match($('#journalList').textContent,/Souvenir rare tout au fond/);assert.doesNotMatch($('#journalList').textContent,/étranger/);
    assert.ok(rpcCalls().some(call=>call.args.p_search==='Souvenir rare'&&call.args.p_offset===0));assert.equal(S.journal.length,1);
  });
  await check('saved quotations use separate bounded pages and do not replace the active notes',async()=>{
    const noteIds=S.journal.map(row=>row.id);controller.selectTab('motivation');await settle(25);
    assert.equal($$('#journalMotivationList .jm-saved-quote').length,20);assert.equal(S.journal.length,40);
    await click('[data-jm-page="motivation"][data-jm-offset="20"]');await settle(20);
    assert.equal($$('#journalMotivationList .jm-saved-quote').length,15);assert.equal(S.journal.length,35);
    assert.deepEqual(S.journal.filter(row=>row.title!==MOTIVATION_TITLE).map(row=>row.id),noteIds);
    assert.ok(rpcCalls().filter(call=>call.args.p_motivation).every(call=>call.args.p_limit===21));
  });
  await check('a delayed old search cannot overwrite the newest query or another session',async()=>{
    const gate=mock.defer(call=>call.rpc==='list_journal_entries'&&call.args.p_search==='Un moment');controller.search('Un moment');await settle(210);assert.equal(gate.used,true);
    controller.search('Souvenir rare');await settle(210);assert.equal($$('#journalList article').length,1);gate.release();await settle(20);assert.match($('#journalList').textContent,/Souvenir rare tout au fond/);assert.equal(S.journal.length,1);
    const logoutGate=mock.defer(call=>call.rpc==='list_journal_entries'&&call.args.p_search==='Un moment');controller.search('Un moment');await settle(210);assert.equal(logoutGate.used,true);
    revision++;S.user=null;S.journal=[];consent=false;controller.reset();$('#content').replaceChildren();logoutGate.release();await settle(25);assert.deepEqual(S.journal,[]);assert.equal($('#content').textContent,'');
  });
  await check('deleting the final visible page reloads page one in one bounded retry',async()=>{
    await click('[data-jm-page="notes"][data-jm-offset="20"]');await settle(20);
    await click('[data-jm-page="notes"][data-jm-offset="40"]');await settle(20);
    await click('[data-jm-page="notes"][data-jm-offset="60"]');await settle(20);
    mock.tables.journal_entries=mock.tables.journal_entries.filter(row=>row.user_id===UID2||row.title===MOTIVATION_TITLE||Number(row.id.slice(-12))>60);
    const before=rpcCalls().length;controller.changed();await settle(30);
    assert.equal(rpcCalls().length-before,2);assert.equal($$('#journalList article').length,15);assert.equal($('[data-jm-page="notes"][data-jm-offset="40"]'),null);
  });
}finally{controller.reset();env.close();}
const failed=results.filter(value=>!value).length;console.log(`${results.length-failed}/${results.length} journal pagination DOM checks passed`);if(failed)process.exitCode=1;
