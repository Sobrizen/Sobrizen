import test from 'node:test';
import assert from 'node:assert/strict';
import {environment,$,click,settle,value,submit,UID,UID2} from './ux-dom-support.mjs';
import {createCommunity,prepareImage} from '../community.mjs';
import {createProfilePhotos} from '../profile-photo-ui.mjs';
import {prepareProfilePhoto,photoMarkup} from '../profile-photo-core.mjs';
const jpeg=()=>new Blob([new Uint8Array([255,216,255,224,1,2,3])],{type:'image/jpeg'});
const uuid=n=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`;
const gate=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};

test('image lifetimes: superseded work, cached avatars, late modals and demo URLs',async t=>{
 const env=await environment({online:true});
 const original={create:URL.createObjectURL,revoke:URL.revokeObjectURL,Image:globalThis.Image},live=new Set(),revoked=[];let serial=0;
 URL.createObjectURL=()=>{const url='blob:review-'+(++serial);live.add(url);return url;};URL.revokeObjectURL=url=>{live.delete(url);revoked.push(url);};
 const decoders=[];globalThis.Image=class{constructor(){decoders.push(this);}set src(value){this.source=value;}get src(){return this.source;}get naturalWidth(){return 400;}get naturalHeight(){return 400;}};
 const S={user:{id:UID},demo:false,page:'community',profile:{display_name:'QA',username:'qa',avatar_path:null},settings:{hidden_authors:[]},posts:[],likes:new Set(),comments:{},feedPage:0,feedKind:'all',feedSearch:'',morePosts:false};
 let revision=1;const sessionContext=()=>({user:S.user,demo:S.demo,revision}),sameSession=c=>c.user===S.user&&c.demo===S.demo&&c.revision===revision,assertSession=c=>{if(!sameSession(c))throw Error('Session changed');};
 const requests=[],downloads=[];
 const db={storage:{from:()=>({async download(path){downloads.push(path);return{data:jpeg()};},async createSignedUrl(path){const g=gate();requests.push({path,...g});await g.promise;return{data:{signedUrl:'https://lnvtowdbbagwfbewnchz.supabase.co/storage/v1/object/sign/community-images/'+path+'?token=public-fixture'}};}})}};
 const modal=(title,body)=>{$('#modalContent').innerHTML='<h2>'+title+'</h2>'+body;$('#modal').showModal();},closeModal=()=>$('#modal').close();
 const photos=createProfilePhotos({S,getClient:async()=>db,sessionContext,sameSession,assertSession,modal,closeModal,notify:()=>{}});
 const community=createCommunity({S,getClient:async()=>db,checkResult:r=>{if(r.error)throw r.error;return r.data;},notify:()=>{},message:e=>e.message,modal,closeModal,render:()=>{},greeting:()=>'',sessionContext,sameSession,assertSession});
 const choose=(input,file)=>{Object.defineProperty(input,'files',{configurable:true,value:[file]});input.dispatchEvent(new Event('change',{bubbles:true}));};
 const post=n=>({id:uuid(n),author_id:UID2,kind:'share',body:'Photo '+n,image_path:UID2+'/'+uuid(n)+'.jpg',image_url:'',image_alt:'Description '+n,created_at:'2026-11-15T12:00:00Z',profiles:{display_name:'Membre',username:'membre'},post_likes:[{count:0}],comments:[{count:0}]});
 const renderPosts=()=>{$('#content').innerHTML=community.view();};
 try{
  for(const [name,prepare]of [['community',prepareImage],['avatar',prepareProfilePhoto]])await t.test(name+': cancelling decode releases its source URL immediately',async()=>{
   const controller=new AbortController(),start=decoders.length,pending=prepare(jpeg(),{signal:controller.signal}),rejected=assert.rejects(pending,error=>error.name==='AbortError');await settle();assert.equal(decoders.length,start+1);const decoder=decoders.at(-1),url=decoder.src;assert.ok(live.has(url));controller.abort();await rejected;assert.equal(decoder.src,'');assert.equal(decoder.onload,null);assert.equal(decoder.onerror,null);assert.ok(revoked.includes(url));
  });
  for(const kind of ['community','avatar'])await t.test(kind+': another selection and closing its editor abort pending decoding',async()=>{
   community.reset();photos.reset();S.profile.avatar_path=null;
   if(kind==='community')community.openPost();else photos.open();
   const input=kind==='community'?$('#communityPostForm').elements.image:$('#profilePhotoForm').elements.photo;
   choose(input,jpeg());await settle();const first=decoders.at(-1),firstURL=first.src;choose(input,jpeg());await settle();const second=decoders.at(-1),secondURL=second.src;assert.notEqual(first,second);assert.equal(first.src,'');assert.ok(revoked.includes(firstURL));assert.ok(live.has(secondURL));
   closeModal();await settle();assert.equal(second.src,'');assert.ok(revoked.includes(secondURL));assert.equal(live.size,0);
  });
  await t.test('avatar cache is bounded and evicts least-recently-used object URLs',async()=>{
   photos.reset();$('#content').replaceChildren();const startDownloads=downloads.length;
   for(let n=1;n<=65;n++){const holder=document.createElement('div');holder.innerHTML=photoMarkup({display_name:'Membre',avatar_path:UID2+'/'+uuid(n)+'.jpg'},UID2);$('#content').append(holder);photos.hydrate(holder);await settle(1);}
   assert.equal(downloads.length-startDownloads,65);assert.equal(live.size,64);assert.ok(revoked.length);
   const holder=document.createElement('div');holder.innerHTML=photoMarkup({avatar_path:UID2+'/'+uuid(1)+'.jpg'},UID2);$('#content').append(holder);photos.hydrate(holder);await settle();assert.equal(downloads.length-startDownloads,66);assert.equal(live.size,64);photos.reset();assert.equal(live.size,0);$('#content').replaceChildren();
  });
  await t.test('an error from a replaced avatar cannot remove the new avatar state',async()=>{
   S.profile.avatar_path=UID+'/'+uuid(80)+'.jpg';const holder=document.createElement('div');holder.innerHTML=photoMarkup(S.profile,UID);$('#content').append(holder);photos.hydrate(holder);await settle();const slot=holder.firstElementChild,old=slot.querySelector('img');assert.ok(old);
   S.profile.avatar_path=UID+'/'+uuid(81)+'.jpg';photos.hydrate(slot);await settle();const fresh=slot.querySelector('img');assert.notEqual(old,fresh);old.dispatchEvent(new Event('error'));assert.equal(slot.querySelector('img'),fresh);assert.equal(slot.classList.contains('has-photo'),true);photos.reset();$('#content').replaceChildren();S.profile.avatar_path=null;
  });
  await t.test('a slow image URL cannot replace a newly opened publication draft',async()=>{
   community.reset();S.posts=[post(101),post(102)];renderPosts();const start=requests.length;await click('[data-community-image="'+uuid(101)+'"]');assert.equal(requests.length,start+1);
   community.openPost();const form=$('#communityPostForm');await value(form,'body','Ce brouillon doit rester ici.');requests[start].resolve();await settle();assert.equal($('#communityPostForm'),form);assert.equal(form.elements.body.value,'Ce brouillon doit rester ici.');closeModal();await settle();
  });
  await t.test('the latest image click wins and changing accounts invalidates a pending opening',async()=>{
   renderPosts();const start=requests.length;await click('[data-community-image="'+uuid(101)+'"]');await click('[data-community-image="'+uuid(102)+'"]');requests[start+1].resolve();await settle();assert.equal($('.community-image-large').alt,'Description 102');requests[start].resolve();await settle();assert.equal($('.community-image-large').alt,'Description 102');closeModal();await settle();
   renderPosts();await click('[data-community-image="'+uuid(101)+'"]');revision++;community.reset();requests.at(-1).resolve();await settle();assert.equal($('#modal').open,false);
  });
  await t.test('replacing or removing a demo image releases the previous published URL',async()=>{
   S.demo=true;revision++;S.posts=[];S.demoFeedSeeded=false;community.reset();const publish=async()=>{await value($('#communityPostForm'),'share_consent',true);await submit($('#communityPostForm'));await settle();};
   community.openFromJournal({entry:{title:'Photo de démo',body:'Copie choisie.',user_id:UID},imageBlob:jpeg()});await settle();await publish();const saved=S.posts.find(p=>p.author_id===UID),first=saved.image_url;assert.ok(live.has(first));
   const toBlob=env.w.HTMLCanvasElement.prototype.toBlob;env.w.HTMLCanvasElement.prototype.toBlob=function(callback){callback(jpeg());};
   try{community.openPost(saved.id);choose($('#communityPostForm').elements.image,jpeg());await settle();decoders.at(-1).onload();await settle();await publish();const replaced=S.posts.find(p=>p.id===saved.id).image_url;assert.notEqual(replaced,first);assert.ok(revoked.includes(first));assert.ok(live.has(replaced));
    community.openPost(saved.id);await click('[data-community-remove]');await publish();assert.ok(revoked.includes(replaced));assert.equal(S.posts.find(p=>p.id===saved.id).image_url,'');community.reset();assert.equal(live.size,0);
   }finally{env.w.HTMLCanvasElement.prototype.toBlob=toBlob;}
  });
  assert.deepEqual(env.errors,[]);
 }finally{community.reset();photos.reset();URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;globalThis.Image=original.Image;env.close();}
});
