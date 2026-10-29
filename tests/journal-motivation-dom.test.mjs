/** Real app controllers, no live services. Covers optional saving and account isolation. */
import assert from 'node:assert/strict';
import {MOTIVATION_QUOTES,MOTIVATION_TITLE,isMotivationEntry,motivationEntryId} from '../journal-motivation.mjs';
import {environment,boot,mockService,UID,UID2,$,$$,txt,click,value,submit,closeModal,route,settle,key} from './ux-dom-support.mjs';

const env=await environment({online:true,mobile:true});
const mock=await mockService(),results=[];
const writes=()=>mock.calls.filter(call=>call.table==='journal_entries'&&['insert','upsert','delete','update'].includes(call.op));
const quote=()=>MOTIVATION_QUOTES.find(item=>item.id===$('[data-journal-quote]')?.dataset.journalQuote);
async function check(name,run){
  const errors=env.errors.length;
  try{await run();assert.deepEqual(env.errors.slice(errors),[]);results.push({name,pass:true});console.log(`PASS ${name}`);}
  catch(error){results.push({name,pass:false});console.error(`FAIL ${name}\n${error.stack}`);}
}

try{
  await boot({mock});
  await check('entry opens an accessible quote exactly once; search, notes and tab changes do not reopen it',async()=>{
    const count=writes().length;await route('journal');
    assert.ok($('#modal').open);assert.ok(quote());assert.equal($('#modal').getAttribute('aria-describedby'),'jmQuoteText');
    assert.equal(document.activeElement,$('#jmQuoteText'));
    await click('#modal [data-action="close"]');assert.equal($('#modal').open,false);assert.equal(writes().length,count);
    assert.equal(document.activeElement,$('#content h1'),'Closing with the cross returns to the visible journal');
    assert.equal(document.body.classList.contains('menu-open'),false);assert.equal($('#appNav').getAttribute('aria-hidden'),'true');
    await route('home');await route('journal');
    // jsdom has no native Escape default; dispatch the browser cancel/close
    // sequence so the actual app listeners and focus restoration are checked.
    const cancel=new Event('cancel',{cancelable:true});$('#modal').dispatchEvent(cancel);assert.equal(cancel.defaultPrevented,false);$('#modal').close();await settle();
    assert.equal(document.activeElement,$('#content h1'),'Native Escape dismissal returns to the journal');assert.equal(writes().length,count);
    await click('#nav [data-page="journal"]');assert.equal($('#modal').open,false);
    const search=$('#journalSearch');search.value='QA';search.dispatchEvent(new Event('input',{bubbles:true}));await settle();assert.equal($('#modal').open,false);
    await key($('#jmNotesTab'),'ArrowRight');assert.equal($('#jmMotivationTab').getAttribute('aria-selected'),'true');assert.equal($('#modal').open,false);
    await key($('#jmMotivationTab'),'Home');assert.equal($('#jmNotesTab').getAttribute('aria-selected'),'true');
    search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));await settle();
    await click('[data-action="journal-new"]');await value($('#journalForm'),'title','Note après citation');await value($('#journalForm'),'body','Une note privée qui reste une note.');await submit($('#journalForm'));
    assert.equal($('#modal').open,false);assert.match(txt('#journalList'),/Une note privée qui reste une note/);
  });

  let stored;
  await check('saving is optional, double taps make one owner-scoped write and the saved quote appears in motivation only',async()=>{
    await route('home');await route('journal');const selected=quote(),count=writes().length;
    const gate=mock.defer(call=>call.table==='journal_entries'&&call.op==='insert');
    const button=$('[data-action="journal-quote-save"]');button.click();button.click();await settle(30);
    assert.equal(button.disabled,true);assert.equal(writes().length,count+1);assert.equal(gate.call.payload.user_id,UID);assert.equal(gate.call.payload.kind,'reflection');assert.equal(gate.call.payload.body,selected.text);
    gate.release();await settle(40);
    stored=mock.tables.journal_entries.find(item=>item.body===selected.text);
    assert.ok(stored);assert.equal(stored.id,await motivationEntryId(UID,selected.id));assert.equal($('#modal').open,false);
    assert.equal($('#jmMotivationTab').getAttribute('aria-selected'),'true');assert.match(txt('#journalMotivationList'),new RegExp(selected.text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    assert.equal($$('#journalList article').some(item=>item.textContent.includes(selected.text)),false);
    assert.equal(document.activeElement,$('#jmMotivationTab'));
  });

  await check('a stored quote survives a fresh account load and is read independently of the newest 50 notes',async()=>{
    for(let i=0;i<55;i++)mock.tables.journal_entries.push({id:crypto.randomUUID(),user_id:UID,entry_date:'2026-10-27',title:`Plus récente ${i}`,body:'Note normale.',kind:'reflection',created_at:'2026-10-27T15:00:00Z'});
    stored.entry_date='2026-01-01';
    await mock.signOut();await mock.signIn({id:UID});await route('journal');await closeModal();
    await click('#jmMotivationTab');await settle(30);
    assert.match(txt('#journalMotivationList'),new RegExp(stored.body.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    assert.ok(mock.calls.some(call=>call.table==='journal_entries'&&call.op==='select'&&call.filters.some(([name,value])=>name==='title'&&value===MOTIVATION_TITLE)));
  });

  await check('an existing remote quote is recovered without inserting or changing its original date',async()=>{
    await click('[data-action="journal-quote-open"]');const selected=quote(),id=await motivationEntryId(UID,selected.id),count=writes().length;
    const existing=mock.tables.journal_entries.find(item=>item.id===id);
    if(existing)existing.entry_date='2025-05-14';else mock.tables.journal_entries.push({id,user_id:UID,entry_date:'2025-05-14',title:MOTIVATION_TITLE,body:selected.text,kind:'reflection',created_at:'2025-05-14T12:00:00Z'});
    await click('[data-action="journal-quote-save"]');await settle(30);
    assert.equal(writes().length,count);assert.equal(mock.tables.journal_entries.find(item=>item.id===id).entry_date,'2025-05-14');assert.equal(mock.tables.journal_entries.filter(item=>item.id===id).length,1);
    assert.match(txt('#notice'),/déjà/);assert.equal($('#modal').open,false);
  });

  await check('offline save is visibly rejected and closing still works without creating an entry',async()=>{
    await click('[data-action="journal-quote-open"]');const count=writes().length;
    Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});
    await click('[data-action="journal-quote-save"]');assert.equal(writes().length,count);assert.equal($('#jmQuoteError').hidden,false);assert.match(txt('#jmQuoteError'),/Hors connexion/);assert.equal($('[data-action="journal-quote-save"]').disabled,false);
    await click('#modal .jm-quote-actions [data-action="close"]');assert.equal($('#modal').open,false);
    Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});
  });

  await check('a failed server write remains open, reports failure and can be retried with the same id',async()=>{
    await click('[data-action="journal-quote-open"]');const selected=quote(),id=await motivationEntryId(UID,selected.id);mock.tables.journal_entries=mock.tables.journal_entries.filter(item=>item.id!==id);
    const original=mock.client.from;
    mock.client.from=table=>{const query=original(table),run=query.run.bind(query);query.run=async()=>table==='journal_entries'&&query.op==='insert'?{data:null,error:{message:'fetch failed'}}:run();return query;};
    await click('[data-action="journal-quote-save"]');await settle(20);
    assert.ok($('#modal').open);assert.equal($('#jmQuoteError').hidden,false);assert.match(txt('#jmQuoteError'),/Connexion indisponible/);assert.equal(mock.tables.journal_entries.filter(item=>item.id===id).length,0);
    mock.client.from=original;await click('[data-action="journal-quote-save"]');await settle(30);
    assert.equal($('#modal').open,false);assert.equal(mock.tables.journal_entries.filter(item=>item.id===id).length,1);
  });

  await check('removing a saved quote updates the motivation panel without reopening the popup',async()=>{
    const count=mock.tables.journal_entries.filter(isMotivationEntry).length;await click('#journalMotivationList [data-action="journal-delete"]');
    assert.equal(mock.tables.journal_entries.filter(isMotivationEntry).length,count-1);assert.equal($('#modal').open,false);assert.equal($('#jmMotivationTab').getAttribute('aria-selected'),'true');
  });

  await check('a pending response cannot restore private content or navigate after sign-out',async()=>{
    await click('[data-action="journal-quote-open"]');const selected=quote(),id=await motivationEntryId(UID,selected.id);mock.tables.journal_entries=mock.tables.journal_entries.filter(item=>item.id!==id);
    const gate=mock.defer(call=>call.table==='journal_entries'&&call.op==='insert');$('[data-action="journal-quote-save"]').click();await settle(30);assert.ok(gate.used);
    await mock.signOut();const notice=txt('#notice');gate.release();await settle(35);
    assert.equal($('#workspace').hidden,true);assert.equal($('#modal').open,false);assert.equal(txt('#modalContent'),'');assert.equal(txt('#notice'),notice);
    await mock.signIn({id:UID2});await closeModal();const count=mock.calls.length;await route('journal');assert.equal($('#journalList'),null);assert.equal($('[data-journal-quote]'),null);assert.equal(mock.calls.length,count);
  });

  await check('demo explicitly keeps quotes in memory only and exit clears them',async()=>{
    await mock.signOut();await click('[data-action="demo"]');const count=writes().length;await route('journal');assert.match(txt('.jm-demo'),/Mode démo/);await click('[data-action="journal-quote-save"]');await settle(25);
    assert.equal(writes().length,count);assert.equal($$('#journalMotivationList .jm-saved-quote').length,1);assert.match(txt('#notice'),/Aucune donnée n’a été enregistrée en ligne/);
    assert.equal([...Array(localStorage.length)].map((_,i)=>localStorage.key(i)).some(name=>/journal|motivation|quote/i.test(name)),false);
    await click('#demoBanner [data-action="logout"]');await click('[data-action="demo"]');await route('journal');await closeModal();await click('#jmMotivationTab');assert.equal($$('#journalMotivationList .jm-saved-quote').length,0);
  });
}finally{env.close();}
const failed=results.filter(result=>!result.pass);console.log(`${results.length-failed.length}/${results.length} journal motivation DOM checks passed`);if(failed.length)process.exitCode=1;
