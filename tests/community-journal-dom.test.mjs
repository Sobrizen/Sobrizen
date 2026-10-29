/** Reviewed journal copies use a mocked account and Storage API; no real publication. */
import assert from 'node:assert/strict';
import {createCommunity} from '../community.mjs';
import {environment,settle,$,txt,value,submit,UID,UID2} from './ux-dom-support.mjs';

const env=await environment({online:true,mobile:true});
const S={user:{id:UID},demo:false,page:'journal',profile:{display_name:'Compte fictif',username:'fictif'},settings:{hidden_authors:[]},posts:[],likes:new Set(),feedPage:0,feedKind:'all',feedSearch:'',morePosts:false};
let revision=0,posts=[],calls=[],objects=new Map(),notices=[],insertFault='',recoveryFailures=0,uploadGate=null,insertGate=null;
const context=()=>({user:S.user,demo:S.demo,revision});
const sameSession=c=>c.user===S.user&&c.demo===S.demo&&c.revision===revision;
const checkResult=result=>{if(result.error)throw result.error;return result.data;};
const result=data=>({data,error:null});
const clone=value=>structuredClone(value);
const jpeg=()=>new Blob([Uint8Array.from([255,216,255,224,0,4,0,0,255,217])],{type:'image/jpeg'});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};

class Query{
  constructor(table){this.table=table;this.op='select';this.filters=[];this.one=false;this.columns='*';}
  select(columns='*'){this.columns=columns;return this;}eq(key,val){this.filters.push([key,val]);return this;}in(key,val){this.filters.push([key,val]);return this;}
  order(){return this;}range(){return this;}limit(){return this;}single(){this.one=true;return this;}maybeSingle(){this.one=true;return this;}
  insert(payload){this.op='insert';this.payload=clone(payload);return this;}update(payload){this.op='update';this.payload=clone(payload);return this;}delete(){this.op='delete';return this;}
  then(resolve,reject){return this.run().then(resolve,reject);}
  async run(){
    calls.push({table:this.table,op:this.op,payload:clone(this.payload),filters:clone(this.filters)});
    if(this.table==='post_likes')return result([]);
    assert.equal(this.table,'posts','The share component must not read or write private journal rows');
    const matches=row=>this.filters.every(([key,val])=>Array.isArray(val)?val.includes(row[key]):row[key]===val);
    let rows=posts.filter(matches);
    if(this.op==='select'&&this.one&&recoveryFailures){recoveryFailures--;return{data:null,error:{message:'fetch failed'}};}
    if(this.op==='insert'){
      if(insertFault==='reject')return{data:null,error:{code:'42501',message:'Publication refusée pour ce test'}};
      if(posts.some(p=>p.id===this.payload.id))return{data:null,error:{code:'23505',message:'Duplicate id'}};
      rows=[{...this.payload,created_at:new Date().toISOString(),profiles:{display_name:S.profile.display_name,username:S.profile.username},post_likes:[{count:0}],comments:[{count:0}]}];posts.push(...rows);
      if(insertGate)await insertGate.promise;
      if(insertFault==='committed-timeout')return{data:null,error:{message:'fetch failed'}};
    }
    if(this.op==='update')for(const row of rows)Object.assign(row,this.payload);
    if(this.op==='delete')posts=posts.filter(row=>!matches(row));
    return result(clone(this.one?rows[0]||null:rows));
  }
}
const db={from:table=>new Query(table),storage:{from:bucket=>({
  async upload(path,blob,options){calls.push({op:'upload',bucket,path,blob,options});objects.set(path,blob);if(uploadGate)await uploadGate.promise;return result({path});},
  async remove(paths){calls.push({op:'remove-image',bucket,paths});for(const path of paths)objects.delete(path);return result(paths);},
  async createSignedUrls(paths){return result(paths.map(path=>({path,signedUrl:'https://lnvtowdbbagwfbewnchz.supabase.co/storage/v1/object/sign/'+bucket+'/'+path+'?token=fictif'})));}
})}};
const closeModal=()=>$('#modal').close();
const community=createCommunity({S,getClient:async()=>db,checkResult,notify:text=>notices.push(text),message:error=>String(error.message||error),modal:(title,body)=>{$('#modalContent').innerHTML='<h2>'+title+'</h2>'+body;$('#modal').showModal();},closeModal,render:()=>{},greeting:()=>'',sessionContext:context,sameSession,assertSession:c=>{if(!sameSession(c)||!c.user)throw Error('Session changée');}});
const note=extra=>({id:'33333333-3333-4333-8333-333333333333',user_id:UID,title:'Un petit pas',body:'Une note personnelle complète.',kind:'reflection',emotion:'stress',abstinence_days:55,...extra});
const writes=()=>calls.filter(call=>['upload','insert','update','delete'].includes(call.op));
const publish=async()=>{await value($('#communityPostForm'),'share_consent',true);await submit($('#communityPostForm'));await settle(20);};
const reset=()=>{community.reset();closeModal();$('#modalContent').replaceChildren();posts=[];calls=[];objects.clear();notices=[];insertFault='';recoveryFailures=0;uploadGate=null;insertGate=null;S.demo=false;S.posts=[];S.demoFeedSeeded=false;S.user={id:UID};revision++;};
let passed=0;
async function check(name,run){reset();await run();passed++;console.log('PASS '+name);}

try{
  await check('opening and cancelling a reviewed copy never writes, preserves the original, and omits private metadata',async()=>{
    const entry=note({kind:'difficult',title:'<Titre privé>',body:'Corps <script>inactif</script>'}),original=clone(entry);
    community.openFromJournal({entry});
    const form=$('#communityPostForm');assert.equal(form.elements.body.value,entry.title+'\n\n'+entry.body);assert.equal(form.elements.kind.value,'struggle');assert.equal(form.elements.emotion.value,'');assert.equal(form.elements.abstinence_days.value,'');assert.equal(form.elements.share_consent.checked,false);
    assert.match(txt('#modalContent'),/copie indépendante/);assert.match(txt('#modalContent'),/note d’origine reste privée/);assert.equal($('#modalContent script'),null);assert.deepEqual(writes(),[]);
    form.querySelector('[data-community-cancel]').click();await settle();assert.equal($('#modal').open,false);assert.deepEqual(entry,original);assert.deepEqual(writes(),[]);
    assert.throws(()=>community.openFromJournal({entry:note({user_id:UID2})}),/ne peut pas être partagée/);
    assert.throws(()=>community.openFromJournal({entry:note(),valid:()=>false}),/plus accessible/);
  });

  await check('long notes remain complete and editable while publishing is blocked until explicitly shortened',async()=>{
    const entry=note({body:'é'.repeat(3000)});community.openFromJournal({entry});const form=$('#communityPostForm');
    assert.equal(form.elements.body.value,entry.title+'\n\n'+entry.body);assert.equal(form.elements.body.maxLength,-1);assert.equal(form.querySelector('[type="submit"]').disabled,true);assert.match(txt('[data-community-body-count]'),/Raccourcis/);
    await publish();assert.equal(writes().length,0);assert.equal($('#modal').open,true);
    await value(form,'body','La copie que je choisis de partager.');assert.equal(form.querySelector('[type="submit"]').disabled,false);await submit(form);await settle(20);
    assert.equal(posts.length,1);assert.equal(posts[0].body,'La copie que je choisis de partager.');assert.equal(entry.body.length,3000);assert.equal(posts[0].emotion,null);assert.equal(posts[0].abstinence_days,null);
  });

  await check('a prepared private photo is only reuploaded on explicit publication and calls back before closing',async()=>{
    const entry=note({kind:'victory',image_path:UID+'/private-original.jpg',image_alt:'Ma promenade'}),original=clone(entry);let callbacks=0;
    community.openFromJournal({entry,imageBlob:jpeg(),onPublished:saved=>{callbacks++;assert.equal($('#modal').open,true);assert.equal(posts.length,1);assert.equal(saved.id,posts[0].id);}});
    assert.equal($('#communityPostForm [type="submit"]').disabled,true);await settle(20);
    assert.equal(writes().length,0);assert.equal($('[data-community-preview]').hidden,false);assert.match($('[data-community-preview]').src,/^blob:/);
    await submit($('#communityPostForm'));await settle();assert.equal(writes().length,0,'Unchecked explicit consent blocks publication');
    await publish();assert.equal(callbacks,1);assert.equal($('#modal').open,false);assert.equal(posts.length,1);assert.equal(posts[0].kind,'victory');assert.equal(posts[0].image_alt,'Ma promenade');assert.notEqual(posts[0].image_path,entry.image_path);
    const uploads=calls.filter(call=>call.op==='upload');assert.equal(uploads.length,1);assert.equal(uploads[0].bucket,'community-images');assert.equal(uploads[0].options.upsert,false);assert.deepEqual(entry,original);
  });

  await check('image loading failure retains the form and requires retry or explicit removal',async()=>{
    let attempts=0;community.openFromJournal({entry:note({image_alt:'Description privée'}),loadImage:async()=>{attempts++;throw Error('Image momentanément indisponible');}});await settle(20);
    assert.equal($('#communityPostForm [type="submit"]').disabled,true);assert.equal($('[data-community-image-error]').hidden,false);assert.equal($('[data-community-image-retry]').hidden,false);assert.equal($('[data-community-remove]').hidden,false);
    await publish();assert.equal(writes().length,0);$('[data-community-image-retry]').click();await settle(20);assert.equal(attempts,2);
    $('[data-community-remove]').click();await settle();assert.equal($('#communityPostForm [type="submit"]').disabled,false);assert.equal($('[data-community-image-error]').hidden,true);await submit($('#communityPostForm'));await settle(20);
    assert.equal(posts.length,1);assert.equal(posts[0].image_path,null);assert.equal(posts[0].image_alt,null);assert.equal(calls.some(call=>call.op==='upload'),false);
  });

  await check('retrying a private image load succeeds and a late cancelled load cannot restore a preview',async()=>{
    let attempts=0;community.openFromJournal({entry:note(),loadImage:async()=>{if(++attempts===1)throw Error('Indisponible');return jpeg();}});await settle(20);
    $('[data-community-image-retry]').click();await settle(20);assert.equal(attempts,2);assert.equal($('[data-community-preview]').hidden,false);assert.equal($('#communityPostForm [type="submit"]').disabled,false);closeModal();
    const gate=deferred(),before=env.downloads.length;community.openFromJournal({entry:note(),loadImage:()=>gate.promise});closeModal();gate.resolve(jpeg());await settle(20);
    assert.equal(env.downloads.length,before);assert.equal(writes().length,0);assert.equal($('#modal').open,false);
  });

  await check('malformed prepared images remain blocked and withdrawn journal access cannot publish',async()=>{
    community.openFromJournal({entry:note(),imageBlob:new Blob(['<svg>'],{type:'image/jpeg'})});await settle(20);assert.equal($('#communityPostForm [type="submit"]').disabled,true);assert.match(txt('[data-community-image-error]'),/invalide/);closeModal();
    let allowed=true;const gate=deferred();community.openFromJournal({entry:note(),loadImage:()=>gate.promise,valid:()=>allowed});allowed=false;gate.resolve(jpeg());await settle(20);
    assert.equal($('[data-community-preview]').hidden,true);assert.equal($('#communityPostForm [type="submit"]').disabled,true);await publish();assert.equal(writes().length,0);
  });

  await check('double taps make one publication and consent revoked during upload prevents the post write',async()=>{
    insertGate=deferred();community.openFromJournal({entry:note()});await value($('#communityPostForm'),'share_consent',true);const form=$('#communityPostForm');void submit(form);void submit(form);await settle(20);
    assert.equal(calls.filter(call=>call.op==='insert').length,1);insertGate.resolve();await settle(20);assert.equal(posts.length,1);
    reset();let allowed=true;uploadGate=deferred();community.openFromJournal({entry:note(),imageBlob:jpeg(),valid:()=>allowed});await settle(20);await value($('#communityPostForm'),'share_consent',true);void submit($('#communityPostForm'));await settle(20);
    assert.equal(calls.filter(call=>call.op==='upload').length,1);allowed=false;uploadGate.resolve();await settle(20);assert.equal(posts.length,0);assert.equal(objects.size,0);assert.equal($('#communityPostForm [type="submit"]').disabled,true);
  });

  await check('an ambiguous committed write is reconciled with the same image and no duplicate or second upload',async()=>{
    insertFault='committed-timeout';recoveryFailures=1;let callbacks=0;
    community.openFromJournal({entry:note(),imageBlob:jpeg(),onPublished:()=>callbacks++});await settle(20);await publish();
    assert.equal(posts.length,1);assert.equal($('#modal').open,true);assert.equal(callbacks,0);assert.match(txt('[type="submit"]',$('#communityPostForm')),/Vérifier/);assert.equal($('#communityPostForm').elements.body.disabled,true);
    insertFault='';await submit($('#communityPostForm'));await settle(20);assert.equal(posts.length,1);assert.equal(callbacks,1);assert.equal($('#modal').open,false);assert.equal(calls.filter(call=>call.op==='insert').length,1);assert.equal(calls.filter(call=>call.op==='upload').length,1);assert.equal(objects.size,1);
  });

  await check('a definite write rejection safely removes its unused copy and leaves a retryable draft',async()=>{
    insertFault='reject';community.openFromJournal({entry:note(),imageBlob:jpeg()});await settle(20);await publish();
    assert.equal(posts.length,0);assert.equal(objects.size,0);assert.equal($('#modal').open,true);assert.equal($('#communityPostForm').elements.body.disabled,false);assert.match(txt('[data-community-status]'),/brouillon reste ouvert/);
    insertFault='';await submit($('#communityPostForm'));await settle(20);assert.equal(posts.length,1);assert.equal(objects.size,1);assert.equal($('#modal').open,false);
  });

  await check('normal community editing still works and callback failure cannot cause duplicate publications',async()=>{
    community.openPost();await value($('#communityPostForm'),'body','Publication normale.');await publish();assert.equal(posts.length,1);S.posts=clone(posts);
    community.openPost(posts[0].id);await value($('#communityPostForm'),'body','Publication modifiée.');await publish();assert.equal(posts.length,1);assert.equal(posts[0].body,'Publication modifiée.');
    community.openFromJournal({entry:note(),onPublished:()=>{throw Error('Lien indisponible');}});await publish();assert.equal(posts.length,2);assert.equal($('#modal').open,false);assert.match(notices.at(-1),/Publication enregistrée.*lien/);
  });

  await check('demo sharing stays in memory and reset clears its publication and image',async()=>{
    S.demo=true;let callbacks=0;community.openFromJournal({entry:note(),imageBlob:jpeg(),onPublished:()=>callbacks++});await settle(20);await publish();
    assert.equal(callbacks,1);assert.equal(writes().length,0);assert.equal(S.posts.length,1);assert.match(S.posts[0].image_url,/^blob:/);assert.match(notices.at(-1),/rien n’a été envoyé/);community.reset();S.posts=[];S.demoFeedSeeded=false;
    await community.loadFeed();assert.equal(S.posts.some(post=>post.body===note().title+'\n\n'+note().body),false);
  });

  assert.deepEqual(env.errors,[]);
}finally{community.reset();env.close();}
console.log(`${passed}/11 community journal DOM checks passed`);
