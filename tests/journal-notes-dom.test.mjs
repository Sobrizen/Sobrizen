/** Journal attachment/sharing controller against a mocked owner-scoped backend. */
import assert from 'node:assert/strict';
import {environment,mockService,UID,UID2,$,$$,value,submit,settle} from './ux-dom-support.mjs';
import {createJournalNotes} from '../journal-notes-ui.mjs';

const env=await environment({online:true,mobile:true});
const mock=await mockService(),results=[];
const stamp='2026-10-27T10:00:00.000Z';
const JPEG=new Blob([new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1,255,217])],{type:'image/jpeg'});
const originalImage=globalThis.Image,originalToBlob=window.HTMLCanvasElement.prototype.toBlob;
const originalRevoke=URL.revokeObjectURL.bind(URL),revokedURLs=new Set();
URL.revokeObjectURL=url=>{revokedURLs.add(url);originalRevoke(url);};
// jsdom does not decode images or encode canvases. These browser adapters leave
// the real validation/re-encoding, draft state, and Storage code under test.
globalThis.Image=class{naturalWidth=900;naturalHeight=600;set src(value){this._src=value;if(value)queueMicrotask(()=>this.onload?.());}get src(){return this._src;}};
window.HTMLCanvasElement.prototype.toBlob=function(callback){queueMicrotask(()=>callback(JPEG));};

const storageCalls=[],objects=new Map(),storageGates=[],storageFaults={};
const key=(bucket,path)=>bucket+'/'+path;
function deferStorage(op){let release;const promise=new Promise(resolve=>{release=resolve;});const gate={op,promise,release,used:false,call:null};storageGates.push(gate);return gate;}
async function storageResult(call,result){
  storageCalls.push(call);
  const fault=storageFaults[call.op];if(fault){delete storageFaults[call.op];return{data:null,error:fault};}
  const gate=storageGates.find(item=>!item.used&&item.op===call.op);
  if(gate){gate.used=true;gate.call=call;await gate.promise;}
  return result;
}
mock.client.storage={from(bucket){return{
  async upload(path,blob,options){
    assert.equal(bucket,'journal-images','The journal must never upload to community storage');
    assert.match(path,new RegExp('^'+UID+'/[0-9a-f-]{36}\\.jpg$'));
    assert.equal(options.upsert,false);assert.equal(options.contentType,'image/jpeg');
    const response=await storageResult({op:'upload',bucket,path,blob,options},{data:{path},error:null});
    if(!response.error)objects.set(key(bucket,path),blob);return response;
  },
  async download(path){return storageResult({op:'download',bucket,path},objects.has(key(bucket,path))?{data:objects.get(key(bucket,path)),error:null}:{data:null,error:{message:'Image QA indisponible'}});},
  async remove(paths){
    const response=await storageResult({op:'remove',bucket,paths:[...paths]},{data:paths.map(name=>({name})),error:null});
    if(!response.error)for(const path of paths)objects.delete(key(bucket,path));return response;
  },
};}};

let sessionRevision=0,consented=true,changed=0;
const S={user:{id:UID},demo:false,page:'journal',profile:{display_name:'Compte QA',username:'compte_qa'},journal:[]};
const notices=[],shares=[];
const sessionContext=()=>({user:S.user,demo:S.demo,revision:sessionRevision});
const sameSession=context=>context.user===S.user&&context.demo===S.demo&&context.revision===sessionRevision;
const privateWrite=()=>{if(!S.user||!consented)throw Error('Le suivi privé est indisponible.');if(!S.demo&&!navigator.onLine)throw Error('Hors connexion.');};
const assertSession=(context,sensitive=false)=>{if(!sameSession(context)||!context.user)throw Error('Ton espace a changé.');if(sensitive)privateWrite();};
const checkResult=result=>{if(result.error)throw result.error;return result.data;};
function closeModal(){const dialog=$('#modal');if(dialog.open)dialog.close();}
function modal(title,body){$('#modalContent').innerHTML=`<h2>${title}</h2>${body}`;if(!$('#modal').open)$('#modal').showModal();}
let controller;
function render(){
  $('#content').innerHTML=`<div id="journalList">${S.journal.map(entry=>`<article data-note-id="${entry.id}">${controller?.imageMarkup(entry)||''}</article>`).join('')}</div>`;
  void controller?.pageRendered();
}
controller=createJournalNotes({S,getClient:async()=>mock.client,checkResult,notify:text=>notices.push(text),message:error=>String(error?.message||error),modal,closeModal,render,sessionContext,sameSession,assertSession,privateWrite,healthConsentActive:()=>consented||S.demo,today:()=> '2026-10-27',onChanged:()=>{changed++;},openShare:options=>{shares.push(options);}});
const note=(extra={})=>({id:crypto.randomUUID(),user_id:UID,entry_date:'2026-10-26',title:'Ma note personnelle',body:'Une petite victoire à conserver.',kind:'reflection',created_at:stamp,updated_at:stamp,image_path:null,image_alt:null,shared_post_id:null,...extra});
const writes=()=>mock.calls.filter(call=>call.table==='journal_entries'&&['insert','upsert','delete','update'].includes(call.op));
const uploads=()=>storageCalls.filter(call=>call.op==='upload');
async function reset(){
  closeModal();controller.reset();sessionRevision++;S.user={id:UID};S.demo=false;S.page='journal';S.journal=[];consented=true;changed=0;
  mock.tables.journal_entries=[];mock.calls.length=0;notices.length=0;shares.length=0;storageCalls.length=0;objects.clear();storageGates.length=0;
  for(const name of Object.keys(storageFaults))delete storageFaults[name];render();await settle();
}
function seed(entry){S.journal=[structuredClone(entry)];mock.tables.journal_entries=[structuredClone(entry)];render();return entry;}
async function fillNote(title='Un pas aujourd’hui',body='J’ai pris du temps pour moi.'){
  await value($('#journalForm'),'title',title);await value($('#journalForm'),'body',body);
}
async function pickImage(){
  const input=$('#journalForm [name="image"]');assert.ok(input);
  const file=new File([JPEG],'photo-personnelle.jpg',{type:'image/jpeg'});
  Object.defineProperty(input,'files',{configurable:true,value:[file]});input.dispatchEvent(new Event('change',{bubbles:true}));await settle(30);
}
async function setVisibility(mode){
  const radio=$(`#journalForm input[name="visibility"][value="${mode}"]`);assert.ok(radio);radio.checked=true;
  radio.dispatchEvent(new Event('change',{bubbles:true}));await settle();
}
async function check(name,run){
  const errors=env.errors.length;
  try{await reset();await run();assert.deepEqual(env.errors.slice(errors),[]);results.push({name,pass:true});console.log(`PASS ${name}`);}
  catch(error){results.push({name,pass:false});console.error(`FAIL ${name}\n${error.stack}`);}
}

try{
  await check('private is the default and a normal note saves once with owner scope and no sharing',async()=>{
    await controller.open();assert.equal($('#journalForm [name="visibility"]:checked').value,'private');
    await fillNote();await submit($('#journalForm'));await settle(25);
    assert.equal(mock.tables.journal_entries.length,1);assert.equal(mock.tables.journal_entries[0].user_id,UID);
    assert.equal(writes().length,1);assert.equal(shares.length,0);assert.equal(storageCalls.length,0);assert.equal($('#modal').open,false);
    assert.equal(mock.calls.some(call=>call.table==='posts'),false);
  });

  await check('selecting an image previews it without uploading and cancelling keeps it private',async()=>{
    await controller.open();await fillNote();await pickImage();
    const preview=$('[data-jn-preview]');assert.ok(preview);assert.equal(preview.hidden,false);assert.match(preview.src,/^blob:/);
    assert.equal(uploads().length,0);assert.equal(writes().length,0);assert.equal(shares.length,0);
    const previewURL=preview.src;closeModal();await settle();assert.equal(uploads().length,0);assert.equal(writes().length,0);assert.ok(revokedURLs.has(previewURL),'Closing the draft revokes its private image URL');
  });

  await check('a saved image uses private storage and reload retrieves it through an authenticated download',async()=>{
    await controller.open();await fillNote();await pickImage();await value($('#journalForm'),'image_alt','Un souvenir de ma promenade.');await submit($('#journalForm'));await settle(35);
    assert.equal(uploads().length,1);const saved=mock.tables.journal_entries[0];assert.ok(saved.image_path);assert.equal(saved.image_alt,'Un souvenir de ma promenade.');assert.equal(shares.length,0);
    assert.equal(saved.image_path,uploads()[0].path);assert.equal(uploads()[0].blob.type,'image/jpeg');
    controller.reset();S.journal=[structuredClone(saved)];render();await settle(35);
    assert.ok(storageCalls.some(call=>call.op==='download'&&call.bucket==='journal-images'&&call.path===saved.image_path));
    const photo=$('[data-journal-image] img');assert.ok(photo);assert.match(photo.src,/^blob:/);assert.equal(photo.alt,'Un souvenir de ma promenade.');
    assert.equal([...Array(localStorage.length)].map((_,i)=>localStorage.key(i)).some(name=>/journal|photo|note/i.test(name)),false);
  });

  await check('a failed image upload retains the note and image draft without publishing or writing a partial note',async()=>{
    await controller.open();await fillNote();await pickImage();await setVisibility('community');storageFaults.upload={message:'Échec image QA'};
    await submit($('#journalForm'));await settle(25);
    assert.equal($('#modal').open,true);assert.equal($('#journalForm [name="title"]').value,'Un pas aujourd’hui');assert.match($('[data-jn-status]').textContent,/Échec image QA/);
    assert.equal(writes().length,0);assert.equal(shares.length,0);assert.equal($('[data-jn-preview]').hidden,false);assert.equal($('#journalForm [type="submit"]').disabled,false);
    await submit($('#journalForm'));await settle(30);assert.equal(mock.tables.journal_entries.length,1);assert.equal(shares.length,1);
  });

  await check('double submit produces one note and one upload while sharing remains an explicit reviewed step',async()=>{
    await controller.open();await fillNote();await pickImage();await setVisibility('community');
    const gate=deferStorage('upload'),form=$('#journalForm');await submit(form);assert.equal(gate.used,true);await submit(form);
    assert.equal(uploads().length,1);gate.release();await settle(40);
    assert.equal(writes().length,1);assert.equal(mock.tables.journal_entries.length,1);assert.equal(shares.length,1);
    assert.equal(shares[0].entry.body,'J’ai pris du temps pour moi.');assert.equal(mock.calls.some(call=>call.table==='posts'),false);
  });

  await check('an uncertain save keeps its UUID and uploaded image so retry cannot duplicate or delete a confirmed attachment',async()=>{
    const originalFrom=mock.client.from;let uncertain=true;
    mock.client.from=table=>{
      const query=originalFrom(table),run=query.run.bind(query);
      query.run=async()=>{
        if(uncertain&&table==='journal_entries'&&query.op==='upsert'){await run();return{data:null,error:{message:'fetch failed after commit'}};}
        if(uncertain&&table==='journal_entries'&&query.op==='select'&&query.filters.some(([name])=>name==='id'))return{data:null,error:{message:'fetch unavailable during confirmation'}};
        return run();
      };
      return query;
    };
    try{
      await controller.open();await fillNote();await pickImage();await submit($('#journalForm'));await settle(25);
      assert.equal($('#modal').open,true);assert.equal(mock.tables.journal_entries.length,1);assert.equal(uploads().length,1);
      const savedId=mock.tables.journal_entries[0].id,imagePath=mock.tables.journal_entries[0].image_path;
      assert.equal(storageCalls.some(call=>call.op==='remove'),false);
      uncertain=false;await submit($('#journalForm'));await settle(30);
      assert.equal(mock.tables.journal_entries.length,1);assert.equal(mock.tables.journal_entries[0].id,savedId);assert.equal(mock.tables.journal_entries[0].image_path,imagePath);assert.equal(uploads().length,1);assert.equal($('#modal').open,false);
    }finally{mock.client.from=originalFrom;}
  });

  await check('sharing a new illustrated note first preserves the private original, then records only the confirmed publication reference',async()=>{
    await controller.open();await fillNote('Un souvenir à partager','Le texte complet de mon journal.\nMon original reste à moi.');await pickImage();
    await value($('#journalForm'),'image_alt','Le chemin de ma promenade.');await setVisibility('community');await submit($('#journalForm'));await settle(30);
    assert.equal(writes().length,1);assert.equal(mock.tables.journal_entries.length,1);assert.equal(uploads().length,1);assert.equal(shares.length,1);
    const original=structuredClone(mock.tables.journal_entries[0]),sharing=shares[0];
    assert.deepEqual(sharing.entry,original);assert.equal(sharing.entry.user_id,UID);assert.equal(sharing.imageBlob,uploads()[0].blob);
    assert.equal(sharing.imageBlob.type,'image/jpeg');assert.equal(sharing.entry.image_alt,'Le chemin de ma promenade.');assert.equal(mock.calls.some(call=>call.table==='posts'),false);
    const published={id:'99999999-9999-4999-8999-999999999999',author_id:UID,body:'La copie relue pour la communauté.'};
    await sharing.onPublished(published);await settle(25);
    const updates=writes().filter(call=>call.op==='update');assert.equal(updates.length,1);
    assert.deepEqual(updates[0].payload,{shared_post_id:published.id});assert.deepEqual(updates[0].filters,[['id',original.id],['user_id',UID]]);
    assert.equal(writes().length,2);assert.equal(mock.tables.journal_entries.length,1);assert.equal(uploads().length,1);
    const saved=mock.tables.journal_entries[0];assert.equal(saved.shared_post_id,published.id);assert.equal(S.journal[0].shared_post_id,published.id);
    for(const field of ['id','user_id','entry_date','title','body','kind','image_path','image_alt'])assert.equal(saved[field],original[field],`The private ${field} must remain unchanged after publication`);
    assert.equal(mock.calls.some(call=>call.table==='posts'),false);
  });

  await check('sharing an existing note opens an exact copy without changing its text, image or publication state',async()=>{
    const entry=seed(note({body:'Texte personnel\nDeuxième ligne.'}));await controller.share(entry.id);await settle();
    assert.equal(shares.length,1);assert.equal(shares[0].entry.title,entry.title);assert.equal(shares[0].entry.body,entry.body);
    assert.equal(writes().length,0);assert.equal(storageCalls.length,0);assert.equal(mock.tables.journal_entries[0].shared_post_id,null);
    assert.equal(shares[0].valid(),true);
  });

  await check('a foreign-owner attachment path is rejected before any storage request or image sharing',async()=>{
    const entry=seed(note({image_path:UID2+'/'+crypto.randomUUID()+'.jpg'}));await settle(25);
    assert.equal(storageCalls.length,0);assert.equal($('[data-journal-image] img'),null);
    await controller.share(entry.id);assert.equal(shares.length,1);assert.equal(shares[0].imageBlob,null);
    await assert.rejects(()=>shares[0].loadImage(),/image n’est pas disponible/);assert.equal(storageCalls.length,0);assert.equal(writes().length,0);
  });

  await check('editing a previously shared original defaults to private and never republishes automatically',async()=>{
    const entry=seed(note({shared_post_id:'99999999-9999-4999-8999-999999999999'}));await controller.open(entry.id);
    assert.equal($('#journalForm [name="visibility"]:checked').value,'private');await value($('#journalForm'),'body','Une réflexion nouvelle, pour moi.');await submit($('#journalForm'));await settle(25);
    assert.equal(mock.tables.journal_entries[0].body,'Une réflexion nouvelle, pour moi.');assert.equal(mock.tables.journal_entries[0].shared_post_id,entry.shared_post_id);assert.equal(shares.length,0);
    assert.equal(mock.calls.some(call=>call.table==='posts'&&call.op!=='select'),false);
  });

  await check('removing an image updates the private note before deleting only its unreferenced owned object',async()=>{
    const imagePath=UID+'/'+crypto.randomUUID()+'.jpg';objects.set(key('journal-images',imagePath),JPEG);
    const entry=seed(note({image_path:imagePath,image_alt:'Ancienne photo'}));await settle(20);await controller.open(entry.id);await settle(20);
    $('[data-jn-remove]').click();await settle();await submit($('#journalForm'));await settle(35);
    assert.equal(mock.tables.journal_entries[0].image_path,null);assert.equal(mock.tables.journal_entries[0].image_alt,null);
    assert.ok(storageCalls.some(call=>call.op==='remove'&&call.bucket==='journal-images'&&call.paths.length===1&&call.paths[0]===imagePath));assert.equal(shares.length,0);
  });

  await check('deleting a private note cleans its owned attachment and leaves community posts untouched',async()=>{
    const imagePath=UID+'/'+crypto.randomUUID()+'.jpg';objects.set(key('journal-images',imagePath),JPEG);
    const entry=seed(note({image_path:imagePath,shared_post_id:'99999999-9999-4999-8999-999999999999'}));await settle(20);
    await controller.remove(entry.id);await settle(25);
    assert.equal(mock.tables.journal_entries.length,0);assert.equal(S.journal.length,0);
    assert.ok(storageCalls.some(call=>call.op==='remove'&&call.paths.includes(imagePath)));assert.equal(mock.calls.some(call=>call.table==='posts'&&call.op==='delete'),false);
  });

  await check('logout during upload prevents the later note write and cannot open sharing in a new session',async()=>{
    await controller.open();await fillNote();await pickImage();await setVisibility('community');const gate=deferStorage('upload');await submit($('#journalForm'));assert.equal(gate.used,true);
    sessionRevision++;S.user={id:UID2};S.journal=[];controller.reset();closeModal();$('#modalContent').replaceChildren();const noticeCount=notices.length;
    gate.release();await settle(40);
    assert.equal(writes().length,0);assert.equal(shares.length,0);assert.equal(S.journal.length,0);assert.equal($('#modal').open,false);assert.equal($('#modalContent').textContent,'');assert.equal(notices.length,noticeCount);
  });

  await check('a note-save response from a closed session cannot restore private content or trigger sharing',async()=>{
    await controller.open();await fillNote();await setVisibility('community');const gate=mock.defer(call=>call.table==='journal_entries'&&['upsert','insert'].includes(call.op));await submit($('#journalForm'));assert.equal(gate.used,true);
    sessionRevision++;S.user=null;S.journal=[];controller.reset();closeModal();$('#modalContent').replaceChildren();const noticeCount=notices.length;
    gate.release();await settle(35);assert.equal(S.journal.length,0);assert.equal(shares.length,0);assert.equal($('#modal').open,false);assert.equal(notices.length,noticeCount);
  });

  await check('demo keeps private images and the share draft in memory without any backend operation',async()=>{
    S.demo=true;S.user={id:'demo'};await controller.open();await fillNote('Note de démo','Souvenir fictif');await pickImage();await setVisibility('community');await submit($('#journalForm'));await settle(35);
    assert.equal(S.journal.length,1);assert.equal(shares.length,1);assert.equal(mock.calls.length,0);assert.equal(storageCalls.length,0);assert.ok(shares[0].imageBlob||shares[0].loadImage);
    controller.reset();S.journal=[];sessionRevision++;S.demo=false;S.user=null;render();assert.equal($('[data-jn-photo]'),null);assert.equal(shares[0].valid(),false);
  });
}finally{
  controller.reset();globalThis.Image=originalImage;window.HTMLCanvasElement.prototype.toBlob=originalToBlob;URL.revokeObjectURL=originalRevoke;env.close();
}
const failed=results.filter(result=>!result.pass);console.log(`${results.length-failed.length}/${results.length} journal note DOM checks passed`);if(failed.length)process.exitCode=1;
