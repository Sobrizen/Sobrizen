/** Community duration comes from the canonical tracking adapter, never an editable field. */
import assert from 'node:assert/strict';
import {createCommunity} from '../community.mjs';
import {environment,settle,$,txt,value,submit,UID} from './ux-dom-support.mjs';

const env=await environment({online:true,mobile:true});
const S={user:{id:UID},demo:false,page:'community',profile:{display_name:'Compte fictif',username:'compte_qa'},settings:{hidden_authors:[]},posts:[],likes:new Set(),feedPage:0,feedKind:'all',feedSearch:'',morePosts:false};
let revision=0,posts=[],calls=[],notices=[],tracking={status:'active',days:14,precision:'minute'},trackingCalls=0,trackingError=false,insertFault='',updateFault='',beforeUpdate=null,recoveryFailures=0,insertGate=null;
const context=()=>({user:S.user,demo:S.demo,revision});
const sameSession=c=>c.user===S.user&&c.demo===S.demo&&c.revision===revision;
const clone=value=>structuredClone(value),result=data=>({data,error:null});
const checkResult=response=>{if(response.error)throw response.error;return response.data;};
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
class Query{
  constructor(table){this.table=table;this.op='select';this.filters=[];this.one=false;}
  select(){return this;}eq(key,val){this.filters.push([key,val]);return this;}is(key,val){this.filters.push([key,{is:val}]);return this;}in(key,val){this.filters.push([key,val]);return this;}
  order(){return this;}range(){return this;}limit(){return this;}single(){this.one=true;return this;}maybeSingle(){this.one=true;return this;}
  insert(payload){this.op='insert';this.payload=clone(payload);return this;}update(payload){this.op='update';this.payload=clone(payload);return this;}
  then(resolve,reject){return this.run().then(resolve,reject);}
  async run(){
    calls.push({table:this.table,op:this.op,payload:clone(this.payload),filters:clone(this.filters)});
    if(this.table==='post_likes')return result([]);
    assert.equal(this.table,'posts','Only the adapter may access the private tracking source');
    if(this.op==='update'&&beforeUpdate){const mutate=beforeUpdate;beforeUpdate=null;mutate();}
    const matches=row=>this.filters.every(([key,val])=>Array.isArray(val)?val.includes(row[key]):val&&typeof val==='object'&&Object.hasOwn(val,'is')?(row[key]??null)===val.is:row[key]===val);
    let rows=posts.filter(matches);
    if(this.op==='select'&&this.one&&recoveryFailures){recoveryFailures--;return{data:null,error:{message:'fetch failed'}};}
    if(this.op==='insert'){
      if(posts.some(post=>post.id===this.payload.id))return{data:null,error:{code:'23505',message:'Duplicate id'}};
      rows=[{...this.payload,created_at:new Date().toISOString(),profiles:{...S.profile},post_likes:[{count:0}],comments:[{count:0}]}];posts.push(...rows);
      if(insertGate)await insertGate.promise;
      if(insertFault==='committed-timeout')return{data:null,error:{message:'fetch failed'}};
    }
    if(this.op==='update'){
      if(updateFault==='uncommitted-timeout')return{data:null,error:{message:'fetch failed'}};
      for(const row of rows)Object.assign(row,this.payload);
      if(updateFault==='committed-timeout')return{data:null,error:{message:'fetch failed'}};
    }
    return result(clone(this.one?rows[0]||null:rows));
  }
}
const db={from:table=>new Query(table),storage:{from:()=>{throw Error('No image operation expected in duration tests');}}};
const closeModal=()=>$('#modal').close();
const community=createCommunity({S,getClient:async()=>db,checkResult,notify:text=>notices.push(text),message:error=>String(error.message||error),modal:(title,body)=>{$('#modalContent').innerHTML='<h2>'+title+'</h2>'+body;$('#modal').showModal();},closeModal,render:()=>{},greeting:()=>'',sessionContext:context,sameSession,assertSession:c=>{if(!sameSession(c)||!c.user)throw Error('Session changée');},getTrackingDuration:()=>{trackingCalls++;if(trackingError)throw Error('private source error');return clone(tracking);}});
const post=extra=>({id:'33333333-3333-4333-8333-333333333333',author_id:UID,kind:'share',body:'Publication initiale.',emotion:null,abstinence_days:14,abstinence_source:'tracking',image_path:null,image_alt:null,created_at:'2026-09-27T10:00:00.000Z',updated_at:null,profiles:{...S.profile},post_likes:[{count:0}],comments:[{count:0}],...extra});
const writes=()=>calls.filter(call=>['insert','update'].includes(call.op));
const publish=async()=>{await value($('#communityPostForm'),'share_consent',true);await submit($('#communityPostForm'));await settle(20);};
const newDraft=async()=>{community.openPost();await settle();await value($('#communityPostForm'),'body','Un message de démonstration.');};
function reset(){community.reset();closeModal();$('#modalContent').replaceChildren();posts=[];calls=[];notices=[];tracking={status:'active',days:14,precision:'minute'};trackingCalls=0;trackingError=false;insertFault='';updateFault='';beforeUpdate=null;recoveryFailures=0;insertGate=null;S.posts=[];S.demo=false;S.demoFeedSeeded=false;S.user={id:UID};revision++;}
let passed=0;
async function check(name,run){reset();await run();passed++;console.log('PASS '+name);}

try{
  await check('a new composer previews the last stop automatically and has no editable duration field',async()=>{
    community.openPost();await settle();const form=$('#communityPostForm');
    assert.equal(form.elements.abstinence_days,undefined);assert.equal(form.elements.abstinence_source,undefined);
    assert.ok($('[data-community-duration]'));assert.match(txt('[data-community-duration]'),/14/);assert.match(txt('[data-community-duration]'),/suivi|arrêt/i);
    assert.equal(form.elements.share_consent.checked,false);assert.equal(writes().length,0);assert.ok(trackingCalls>=1);
  });

  await check('publication ignores forged duration fields and sends no extra private tracking data',async()=>{
    tracking={status:'active',days:14,precision:'minute',private_note:'PRIVATE_TRACKING_SENTINEL',started_at:'2020-01-01T00:00:00Z',health_scores:{mood:1}};
    await newDraft();const form=$('#communityPostForm');
    for(const [name,content]of[['abstinence_days','49000'],['abstinence_source','declared']]){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=content;form.append(input);}
    await publish();assert.equal(posts.length,1);assert.equal(posts[0].abstinence_days,14);assert.equal(posts[0].abstinence_source,'tracking');
    assert.equal(JSON.stringify(writes()).includes('PRIVATE_TRACKING_SENTINEL'),false);assert.equal(Object.hasOwn(posts[0],'started_at'),false);assert.equal(Object.hasOwn(posts[0],'health_scores'),false);
  });

  await check('the duration is recomputed immediately before initial publication',async()=>{
    await newDraft();assert.match(txt('[data-community-duration]'),/14/);
    tracking={status:'active',days:15,precision:'minute'};await publish();
    assert.equal(posts[0].abstinence_days,15);assert.equal(posts[0].abstinence_source,'tracking');assert.ok(trackingCalls>=2);
    const feed=document.createElement('div');feed.innerHTML=community.postList();const badge=feed.querySelector('.community-author-meta .community-duration-badge');assert.ok(badge,'The badge must sit with the author handle');assert.match(feed.querySelector('.community-author-meta').textContent,/compte_qa/);assert.match(badge.textContent,/15 j/);assert.match(badge.textContent,/sans alcool/);assert.match(badge.getAttribute('aria-label'),/moment.*publication|partage/i);
  });

  await check('a journal share takes duration from tracking rather than note metadata',async()=>{
    tracking={status:'active',days:21,precision:'day'};
    const entry={id:'44444444-4444-4444-8444-444444444444',user_id:UID,title:'Ma note',body:'Une note que je choisis de partager.',kind:'victory',abstinence_days:700,emotion:'stress',private_detail:'PRIVATE_NOTE_SENTINEL'};
    community.openFromJournal({entry});await settle();assert.equal($('#communityPostForm').elements.abstinence_days,undefined);assert.match(txt('[data-community-duration]'),/21/);
    await publish();assert.equal(posts[0].abstinence_days,21);assert.equal(posts[0].abstinence_source,'tracking');assert.equal(posts[0].emotion,null);assert.equal(JSON.stringify(writes()).includes('PRIVATE_NOTE_SENTINEL'),false);
  });

  await check('a confirmed stop under one day remains zero; absent or invalid tracking never becomes zero',async()=>{
    tracking={status:'active',days:0,precision:'minute'};await newDraft();await publish();assert.equal(posts[0].abstinence_days,0);assert.match(community.postList(),/&lt; 1 j|Moins d’un jour/);
    for(const state of ['consent-required','unavailable','missing','no-current-stop']){
      reset();tracking={status:state,days:null,precision:'unknown'};await newDraft();await publish();
      assert.equal(posts.length,1,state+' should not prevent a community message');assert.equal(posts[0].abstinence_days,null,state);assert.equal(posts[0].abstinence_source??null,null,state);
    }
    for(const invalid of [-1,50001,NaN,Infinity,'14']){
      reset();tracking={status:'active',days:invalid,precision:'minute'};await newDraft();await publish();assert.equal(posts[0].abstinence_days,null,'Invalid tracking count must be omitted');
    }
    reset();trackingError=true;await newDraft();assert.equal(txt('#modalContent').includes('private source error'),false);await publish();assert.equal(posts[0].abstinence_days,null);
  });

  await check('editing preserves the publication-time duration and legacy provenance without consulting current tracking',async()=>{
    for(const original of [post(),post({abstinence_days:8,abstinence_source:null}),post({abstinence_days:null,abstinence_source:null})]){
      reset();posts=[clone(original)];S.posts=clone(posts);tracking={status:'active',days:150,precision:'minute'};
      community.openPost(original.id);await settle();assert.equal($('#communityPostForm').elements.abstinence_days,undefined);
      await value($('#communityPostForm'),'body','Texte modifié, ancien repère conservé.');await publish();
      assert.equal(posts.length,1);assert.equal(posts[0].body,'Texte modifié, ancien repère conservé.');assert.equal(posts[0].abstinence_days,original.abstinence_days);assert.equal(posts[0].abstinence_source??null,original.abstinence_source??null);assert.equal(trackingCalls,0);
    }
  });

  await check('an uncertain committed publication keeps its original duration when reconciling the same post',async()=>{
    insertFault='committed-timeout';recoveryFailures=1;await newDraft();await publish();
    assert.equal(posts.length,1);assert.equal(posts[0].abstinence_days,14);assert.equal($('#modal').open,true);assert.match(txt('[type="submit"]',$('#communityPostForm')),/Vérifier/);
    tracking={status:'active',days:99,precision:'minute'};const sourceCalls=trackingCalls;insertFault='';await submit($('#communityPostForm'));await settle(20);
    assert.equal(posts.length,1);assert.equal(posts[0].abstinence_days,14);assert.equal(writes().filter(call=>call.op==='insert').length,1);assert.equal(trackingCalls,sourceCalls);assert.equal($('#modal').open,false);
  });

  await check('an edit that times out before committing can retry the same frozen payload against the unchanged original',async()=>{
    for(const updated_at of [null,'2026-09-27T12:00:00.000Z']){
      reset();const original=post({updated_at});posts=[clone(original)];S.posts=clone(posts);updateFault='uncommitted-timeout';
      community.openPost(original.id);await value($('#communityPostForm'),'body','Ma modification à conserver.');await publish();
      assert.equal(posts[0].body,original.body);assert.equal($('#modal').open,true);assert.match(txt('[type="submit"]',$('#communityPostForm')),/Vérifier/);
      const pendingPayload=clone(writes()[0].payload);tracking={status:'active',days:99,precision:'minute'};$('#communityPostForm').elements.body.value='Cette altération ne remplace pas la tentative en cours.';updateFault='';
      await submit($('#communityPostForm'));await settle(20);
      assert.equal(posts[0].body,'Ma modification à conserver.');assert.equal(posts[0].abstinence_days,14);assert.equal(posts[0].abstinence_source,'tracking');assert.equal(trackingCalls,0);assert.equal($('#modal').open,false);
      const updates=writes().filter(call=>call.op==='update');assert.equal(updates.length,2);assert.deepEqual(updates[1].payload,pendingPayload,'A retry preserves the complete pending payload');
      for(const call of updates)assert.ok(call.filters.some(([key,val])=>key==='updated_at'&&(updated_at===null?val?.is===null:val===updated_at)),'Each update must compare the original revision, including null');
    }
  });

  await check('a committed edit with a lost response is confirmed without a second update',async()=>{
    const original=post({updated_at:'2026-09-27T12:00:00.000Z'});posts=[clone(original)];S.posts=clone(posts);updateFault='committed-timeout';recoveryFailures=1;
    community.openPost(original.id);await value($('#communityPostForm'),'body','Modification déjà enregistrée.');await publish();
    assert.equal(posts[0].body,'Modification déjà enregistrée.');assert.equal($('#modal').open,true);updateFault='';tracking={status:'active',days:99,precision:'minute'};
    await submit($('#communityPostForm'));await settle(20);
    assert.equal(writes().filter(call=>call.op==='update').length,1);assert.equal(posts[0].abstinence_days,14);assert.equal(trackingCalls,0);assert.equal($('#modal').open,false);
  });

  await check('edit recovery rejects a concurrent change instead of overwriting it',async()=>{
    const original=post();posts=[clone(original)];S.posts=clone(posts);updateFault='uncommitted-timeout';
    community.openPost(original.id);await value($('#communityPostForm'),'body','Mon brouillon en attente.');await publish();
    const concurrent={body:'Modification depuis un autre appareil.',updated_at:'2026-09-28T12:00:00.000Z'};Object.assign(posts[0],concurrent);updateFault='';
    await submit($('#communityPostForm'));await settle(20);
    assert.equal(posts[0].body,concurrent.body);assert.equal(posts[0].updated_at,concurrent.updated_at);assert.equal(writes().filter(call=>call.op==='update').length,1);assert.equal($('#modal').open,true);assert.match(txt('[data-community-status]'),/modifiée|changé|actualise/i);assert.equal(trackingCalls,0);
  });

  await check('a version guard prevents a concurrent edit between recovery readback and retry',async()=>{
    for(const updated_at of [null,'2026-09-27T12:00:00.000Z']){
      reset();const original=post({updated_at});posts=[clone(original)];S.posts=clone(posts);updateFault='uncommitted-timeout';
      community.openPost(original.id);await value($('#communityPostForm'),'body','Mon brouillon protégé.');await publish();updateFault='';
      beforeUpdate=()=>Object.assign(posts[0],{body:'Modification concurrente pendant la nouvelle tentative.',updated_at:'2026-09-28T12:00:00.000Z'});
      await submit($('#communityPostForm'));await settle(20);
      assert.equal(posts[0].body,'Modification concurrente pendant la nouvelle tentative.');assert.equal(posts[0].updated_at,'2026-09-28T12:00:00.000Z');assert.equal(writes().filter(call=>call.op==='update').length,2);assert.equal($('#modal').open,true);assert.match(txt('[data-community-status]'),/modifiée|changé|actualise/i);
      await submit($('#communityPostForm'));await settle(20);assert.equal(posts[0].body,'Modification concurrente pendant la nouvelle tentative.','Later submissions also cannot overwrite the changed revision');
    }
  });

  await check('an initial edit submission also refuses a stale original version',async()=>{
    const original=post({updated_at:'2026-09-27T12:00:00.000Z'});posts=[clone(original)];S.posts=clone(posts);
    community.openPost(original.id);await value($('#communityPostForm'),'body','Brouillon déjà dépassé.');
    Object.assign(posts[0],{body:'Version plus récente conservée.',updated_at:'2026-09-28T12:00:00.000Z'});await publish();
    assert.equal(posts[0].body,'Version plus récente conservée.');assert.equal(posts[0].updated_at,'2026-09-28T12:00:00.000Z');assert.equal($('#modal').open,true);assert.match(txt('[data-community-status]'),/modifiée|changé|actualise/i);
  });

  await check('double submission takes one snapshot and writes a single post',async()=>{
    insertGate=deferred();await newDraft();await value($('#communityPostForm'),'share_consent',true);const form=$('#communityPostForm');void submit(form);void submit(form);await settle(20);
    assert.equal(writes().length,1);assert.equal(posts[0].abstinence_days,14);insertGate.resolve();await settle(20);assert.equal(posts.length,1);assert.equal($('#modal').open,false);
  });

  assert.deepEqual(env.errors,[]);
}finally{community.reset();env.close();}
console.log(`${passed}/13 community duration DOM checks passed`);
