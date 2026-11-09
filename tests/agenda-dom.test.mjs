import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createAgenda} from '../agenda-ui.mjs';

const require=createRequire(import.meta.url);
let JSDOM,VirtualConsole;
try { ({JSDOM,VirtualConsole}=require(process.env.SOBRIZEN_QA_JSDOM||process.env.SOBRIZEN_JSDOM_PATH||'jsdom')); } catch(error) {if(process.env.SOBRIZEN_QA_JSDOM||process.env.SOBRIZEN_JSDOM_PATH)throw error;}
const domTest=(name,fn)=>test(name,{skip:!JSDOM&&'Requires test-only jsdom@30.1.3 (SOBRIZEN_QA_JSDOM)'},fn);
const UID='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222',ID='a0000000-0000-4000-8000-000000000001';
const NOW='2026-11-09T08:00:00.000Z';
const row=patch=>({id:ID,user_id:UID,version:1,created_at:NOW,updated_at:NOW,kind:'task',category:'personal',title:'Une priorité',notes:'',item_date:'2026-11-09',all_day:true,time_zone:'Europe/Paris',starts_at:null,ends_at:null,status:'open',goal_target:null,goal_current:null,goal_unit:'',...patch});
const settle=async()=>{for(let i=0;i<10;i++)await Promise.resolve();await new Promise(resolve=>setImmediate(resolve));};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

async function environment(initial=[],{premium=true,demo=false}={}) {
  const errors=[],virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',cause=>errors.push(cause));
  const dom=new JSDOM('<!doctype html><html lang="fr"><head></head><body><main id="content"></main><dialog id="modal"><div id="modalContent"></div></dialog></body></html>',{url:'https://example.test/',pretendToBeVisual:true,virtualConsole});
  const {document:doc}=dom.window, S={user:{id:UID},demo,page:'agenda'}, data=initial.map(item=>({...item})), calls=[],hooks={},downloads=[],notices=[];
  let revision=0,agenda;
  const db={
    from(){let owner,cursor=null;const query={select(){return query;},eq(key,value){assert.equal(key,'user_id');owner=value;return query;},order(){return query;},limit(){return query;},gt(key,value){cursor=value;return query;},then(resolve,reject){const batch=data.filter(item=>item.user_id===owner&&(!cursor||item.id>cursor)).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,200).map(item=>({...item}));return Promise.resolve(hooks.read?.(batch)??batch).then(resolve,reject);}};return query;},
    async rpc(name,p){calls.push({name,p});if(hooks.rpc)return hooks.rpc(name,p);
      const index=data.findIndex(item=>item.id===p.p_id&&item.user_id===S.user.id),existing=data[index];
      if(name==='delete_agenda_item'){if(existing?.version!==p.p_expected_version)throw {code:'PT409'};data.splice(index,1);return p.p_id;}
      if((existing?.version??null)!==p.p_expected_version)throw {code:'PT409'};
      const result={...p.p_payload,id:p.p_id,user_id:S.user.id,version:(p.p_expected_version||0)+1,created_at:existing?.created_at||NOW,updated_at:NOW};
      if(index<0)data.push(result);else data[index]=result;return {...result};
    },
  };
  const api={S,document:doc,now:()=>new Date(NOW),isPremium:()=>premium,
    sessionContext:()=>({user:S.user,demo:S.demo,revision}),sameSession:ctx=>ctx.user===S.user&&ctx.demo===S.demo&&ctx.revision===revision,
    accountRequest:run=>run(db,S.user?.id),render:()=>{doc.getElementById('content').innerHTML=agenda.view();},
    modal:(title,body)=>{doc.getElementById('modalContent').innerHTML=`<h2>${title}</h2>${body}`;doc.getElementById('modal').setAttribute('open','');},
    closeModal:()=>doc.getElementById('modal').removeAttribute('open'),notify:text=>notices.push(text),message:cause=>cause.message,
    download:(...args)=>downloads.push(args),
  };
  agenda=createAgenda(api);
  if(demo)agenda.seedDemo();else await agenda.load();api.render();await settle();
  const $=selector=>doc.querySelector(selector), $$=selector=>[...doc.querySelectorAll(selector)];
  const click=async selector=>{const node=typeof selector==='string'?$(selector):selector;assert.ok(node,`Missing ${selector}`);assert.equal(node.closest('[hidden]'),null,`Hidden ${selector}`);node.focus();node.click();await settle();};
  const value=(name,text)=>{const node=$(`[name="${name}"]`);assert.ok(node);node.value=text;node.dispatchEvent(new dom.window.Event('input',{bubbles:true}));node.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
  const submit=async()=>{$('#modal form').dispatchEvent(new dom.window.SubmitEvent('submit',{bubbles:true,cancelable:true}));await settle();};
  return {agenda,api,S,doc,dom,data,calls,hooks,errors,downloads,notices,$,$$,click,value,submit,
    setPremium:value=>{premium=value;doc.dispatchEvent(new dom.window.CustomEvent('sobrizen-access-change'));},
    switchUser:()=>{revision++;S.user={id:OTHER};agenda.reset();api.render();},
    close(){agenda.destroy();assert.deepEqual(errors,[]);dom.window.close();}};
}

domTest('reachable day/week/month controls preserve focus and expose unique ids',async()=>{
  const h=await environment([row(),row({id:'a0000000-0000-4000-8000-000000000002',kind:'goal',goal_target:4,goal_current:1,goal_unit:'étapes'})]);
  try {
    assert.equal(h.$('h1').textContent,'Agenda & objectifs');
    assert.equal(new Set(h.$$('[id]').map(el=>el.id)).size,h.$$('[id]').length);
    await h.click('#ag-view-month');assert.equal(h.$('#ag-view-month').getAttribute('aria-pressed'),'true');assert.equal(h.doc.activeElement.id,'ag-view-month');
    assert.equal(h.$$('.ag-day').length,30);await h.click('#ag-day-2026-11-12');assert.equal(h.doc.activeElement.id,'ag-day-2026-11-12');
    await h.click('#ag-next');assert.equal(h.doc.activeElement.id,'ag-next');assert.equal(h.$$('.ag-day').length,31);
    await h.click('#ag-today');assert.equal(h.$('#ag-day-2026-11-09').getAttribute('aria-pressed'),'true');
    await h.click('#ag-view-day');assert.equal(h.$$('.ag-day-list').length,1);
  } finally {h.close();}
});
domTest('create task, edit category and note, complete, reopen and delete with confirmation',async()=>{
  const h=await environment();
  try {
    await h.click('#ag-new');h.value('kind','task');h.value('title','Préparer mon projet');h.value('category','work');h.value('notes','Une étape concrète');
    assert.equal(h.$('[data-ag-section="times"]').hidden,true);await h.submit();
    assert.equal(h.data.length,1);assert.equal(h.data[0].kind,'task');assert.equal(h.data[0].starts_at,null);assert.equal(h.data[0].category,'work');assert.equal(h.$('#modal').open,false);
    await h.click('.ag-item [data-ag-action="edit"]');h.value('title','Mon projet avance');h.value('category','personal');await h.submit();assert.equal(h.data[0].version,2);
    await h.click('.ag-item [data-ag-action="toggle"]');assert.equal(h.data[0].status,'done');
    await h.click('.ag-item [data-ag-action="toggle"]');assert.equal(h.data[0].status,'open');
    await h.click('.ag-item [data-ag-action="edit"]');await h.click('[data-ag-action="delete"]');assert.ok(h.$('#agendaDeleteForm'));assert.equal(h.data.length,1);
    await h.submit();assert.equal(h.data.length,0);assert.match(h.$('.ag-feedback').textContent,/supprimé/);
  } finally {h.close();}
});
domTest('goal progression completes at its target and filters remain functional',async()=>{
  const h=await environment();
  try {
    await h.click('[data-ag-action="new-goal"]');h.value('title','Lire un livre');h.value('goal_target','8');h.value('goal_current','3');h.value('goal_unit','chapitres');await h.submit();
    assert.equal(h.data[0].status,'open');assert.equal(h.$('.ag-goal-progress progress').value,3);
    await h.click('.ag-planner [data-ag-action="edit"]');h.value('goal_current','8');await h.submit();assert.equal(h.data[0].status,'done');
    const status=h.$('#ag-status');status.value='open';status.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));await settle();
    assert.equal(h.$$('.ag-planner .ag-item').length,0);assert.match(h.$('.ag-empty').textContent,/filtres/);
  } finally {h.close();}
});
domTest('DST ambiguity is explained at its field and preserves the draft until explicitly resolved',async()=>{
  const h=await environment();
  try {
    await h.click('#ag-new');h.value('title','Un appel');h.value('item_date','2026-10-25');h.value('end_date','2026-10-25');h.value('time_zone','Europe/Paris');h.value('start_time','02:30');h.value('end_time','03:30');await h.submit();
    assert.equal(h.calls.length,0);assert.equal(h.$('[name="title"]').value,'Un appel');assert.equal(h.$('[name="start_occurrence"]').getAttribute('aria-invalid'),'true');
    assert.match(h.$('[data-form-field-error]').textContent,/deux fois/);assert.equal(h.doc.activeElement.name,'start_occurrence');
    h.value('start_occurrence','later');await h.submit();assert.equal(h.data[0].starts_at,'2026-10-25T01:30:00.000Z');
  } finally {h.close();}
});
domTest('invalid goal numbers and empty title never trigger a network mutation',async()=>{
  const h=await environment();
  try {
    await h.click('[data-ag-action="new-goal"]');h.value('title','  ');await h.submit();assert.equal(h.calls.length,0);assert.equal(h.$('[name="title"]').getAttribute('aria-invalid'),'true');
    h.value('title','Un objectif');h.value('goal_target','2');h.value('goal_current','3');await h.submit();assert.equal(h.calls.length,0);assert.equal(h.$('[name="goal_current"]').getAttribute('aria-invalid'),'true');
  } finally {h.close();}
});
domTest('conflict keeps user text, leaves the dialog open and offers an honest refresh instruction',async()=>{
  const h=await environment([row()]);
  try {
    await h.click('.ag-item [data-ag-action="edit"]');h.value('title','Mon brouillon');h.hooks.rpc=()=>{throw {code:'PT409'};};await h.submit();
    assert.equal(h.$('[name="title"]').value,'Mon brouillon');assert.equal(h.$('#modal').open,true);assert.match(h.$('[data-form-error]').textContent,/saisie est conservée/);
    assert.equal(h.data[0].title,'Une priorité');assert.equal(h.$('button[type="submit"]').disabled,false);
  } finally {h.close();}
});
domTest('network error retains the draft and double submit only sends one request',async()=>{
  const h=await environment(),wait=deferred();
  try {
    await h.click('#ag-new');h.value('kind','task');h.value('title','À conserver');h.hooks.rpc=()=>wait.promise;
    await h.submit();await h.submit();assert.equal(h.calls.length,1);assert.equal(h.$('.ag-editor-fields').disabled,true);
    wait.resolve(Promise.reject(new Error('Network request failed')));await settle();
    assert.equal(h.$('[name="title"]').value,'À conserver');assert.equal(h.$('.ag-editor-fields').disabled,false);assert.match(h.$('[data-form-error]').textContent,/Connexion interrompue/);
  } finally {h.close();}
});
domTest('a still-connected form from the previous session cannot submit or expose a late save',async()=>{
  const h=await environment(),wait=deferred();
  try {
    await h.click('#ag-new');h.value('kind','task');h.value('title','Compte précédent');const stale=h.$('#agendaItemForm');
    h.S.user={id:OTHER};assert.equal(stale.isConnected,true);await h.submit();assert.equal(h.calls.length,0);
    h.agenda.reset();assert.equal(stale.isConnected,false);assert.equal(h.$('#modal').open,false);h.api.render();
    h.api.closeModal();await h.click('#ag-new');h.value('kind','task');h.value('title','Deuxième compte');h.hooks.rpc=()=>wait.promise;await h.submit();
    const payload=h.calls[0].p;h.S.user={id:UID};h.agenda.reset();h.api.render();wait.resolve(row({...payload.p_payload,id:payload.p_id,user_id:OTHER}));await settle();
    assert.equal(h.doc.getElementById('content').textContent.includes('Deuxième compte'),false);assert.equal(h.notices.length,0);
  } finally {h.close();}
});
domTest('expired access retains viewing/export/deletion and never offers a misleading save',async()=>{
  const h=await environment([row()],{premium:false});
  try {
    await h.click('#ag-new');assert.ok(h.$('#modal a[href="/abonnement.html"]'));assert.equal(h.$('#agendaItemForm'),null);
    h.api.closeModal();await h.click('.ag-item [data-ag-action="edit"]');assert.equal(h.$('.ag-editor-fields').disabled,true);assert.equal(h.$('#agendaItemForm button[type="submit"]'),null);
    await h.click('[data-ag-action="delete"]');await h.submit();assert.equal(h.data.length,0);
  } finally {h.close();}
});
domTest('exports contain the private owner data and demo never calls the account service',async()=>{
  const h=await environment([],{demo:true,premium:false});
  try {
    assert.match(h.$('.ag-banner').textContent,/fictifs/);await h.click('[data-ag-action="export-ics"]');await h.click('[data-ag-action="export-json"]');
    assert.equal(h.downloads.length,2);assert.match(h.downloads[0][1],/CLASS:PRIVATE/);assert.equal(JSON.parse(h.downloads[1][1]).agenda_items.length,6);
    await h.click('[data-ag-action="new-goal"]');h.value('title','Mon exemple');await h.submit();assert.equal(h.calls.length,0);
  } finally {h.close();}
});
domTest('user text is escaped in list, notes and edit fields, and scoped CSS parses',async()=>{
  const h=await environment([row({title:'<img src=x onerror=alert(1)>',notes:'<script>evil()</script>'})]);
  try {
    assert.equal(h.$('.ag-item img'),null);assert.match(h.$('.ag-item h3').textContent,/<img/);assert.equal(h.$('.ag-note script'),null);
    await h.click('.ag-item [data-ag-action="edit"]');assert.equal(h.$('[name="title"]').value,'<img src=x onerror=alert(1)>');
    const style=h.doc.createElement('style');style.textContent=await readFile(new URL('../agenda.css',import.meta.url),'utf8');h.doc.head.append(style);
    assert.ok(style.sheet.cssRules.length>100);
  } finally {h.close();}
});
