import test from 'node:test';
import assert from 'node:assert/strict';
import {PHOTO_BUCKET,MAX_PHOTO_BYTES,validPhotoPath,photoMarkup,photoSignature,prepareProfilePhoto,persistProfilePhoto,removeUnusedProfilePhoto} from '../profile-photo-core.mjs';
import {integratePhotosApp,integratePhotosCommunity,integratePhotosWorker} from '../scripts/integrate-profile-photos.mjs';
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const old=uid+'/33333333-3333-4333-8333-333333333333.jpg';
const jpeg=()=>new Blob([new Uint8Array([255,216,255,224,1,2,3])],{type:'image/jpeg'});
function backend(path=null){
  const row={id:uid,avatar_path:path,display_name:'Original',bio:'Preserve me'},objects=new Map(),calls=[];
  const state={uploadError:false,uploadLost:false,writeLost:false,writeUncommitted:false,readError:false,otherPath:null,afterUpload:null};
  class Query{
    constructor(){this.op='select';this.filters=[];this.singleRow=false;}
    select(){return this;}eq(k,v){this.filters.push([k,v]);return this;}is(k,v){return this.eq(k,v);}limit(){return this;}
    update(payload){this.op='update';this.payload=payload;return this;}single(){this.singleRow=true;return this;}maybeSingle(){this.singleRow=true;return this;}
    then(resolve,reject){return this.run().then(resolve,reject);}
    async run(){
      calls.push({op:this.op,payload:this.payload,filters:this.filters});
      if(this.op==='select'&&state.readError)return {error:{message:'Network error'}};
      if(state.otherPath&&this.op==='update')row.avatar_path=state.otherPath;
      const matches=this.filters.every(([k,v])=>(row[k]??null)===(v??null));
      if(this.op==='update'&&matches){if(!state.writeUncommitted)Object.assign(row,this.payload);if(state.writeLost||state.writeUncommitted)return {error:{message:'Network error'}};}
      return {data:this.singleRow?(matches?{...row}:null):(matches?[{...row}]:[])};
    }
  }
  const db={from(table){assert.equal(table,'profiles');return new Query();},storage:{from(bucket){assert.equal(bucket,PHOTO_BUCKET);return {
    async upload(path,blob,options){calls.push({op:'upload',path,options});assert.equal(options.upsert,false);if(state.uploadError)return {error:{message:'Upload failed'}};if(objects.has(path))return {error:{message:'Already exists'}};objects.set(path,blob);state.afterUpload?.();return state.uploadLost?{error:{message:'Response lost'}}:{data:{path}};},
    async download(path){calls.push({op:'download',path});return objects.has(path)?{data:objects.get(path)}:{error:{message:'Not found'}};},
    async remove(paths){calls.push({op:'remove',paths});paths.forEach(path=>objects.delete(path));return {data:paths};}
  };}}};return {db,row,objects,calls,state};
}
test('paths are owned UUID JPEG names and arbitrary external avatar URLs are never used',()=>{
 assert(validPhotoPath(old,uid));for(const path of ['https://evil.test/a.jpg',other+'/33333333-3333-4333-8333-333333333333.jpg',uid+'/../a.jpg',uid+'/photo.svg'])assert(!validPhotoPath(path,uid));
 const html=photoMarkup({display_name:'<script>',avatar_url:'https://evil.test',avatar_path:old},uid);assert(!html.includes('<script>'));assert(!html.includes('https:'));assert(html.includes('&lt;'));assert(html.includes('data-photo-path="'+old+'"'));
});
test('source signature and file limit give clear explanations without decoding',async()=>{
 assert.equal(photoSignature(new Uint8Array([255,216,255])),'image/jpeg');
 await assert.rejects(prepareProfilePhoto(new Blob(['<svg>'])) ,/JPG, PNG ou WebP/);
 await assert.rejects(prepareProfilePhoto({size:11*1024*1024}),/10 Mo/);
 await assert.rejects(prepareProfilePhoto({size:0}),/non vide/);
});
test('save uploads once and updates only the current owners avatar, not profile text',async()=>{
 const b=backend(),attempt={};const result=await persistProfilePhoto({db:b.db,uid,blob:jpeg(),attempt});
 assert(validPhotoPath(result.path,uid));assert.equal(b.row.avatar_path,result.path);assert.equal(b.row.bio,'Preserve me');assert.equal(b.row.display_name,'Original');
 assert.equal(b.calls.filter(c=>c.op==='upload').length,1);assert.deepEqual(b.calls.find(c=>c.op==='update').filters,[['id',uid],['avatar_path',null]]);
});
test('lost upload response is reconciled by checking the exact stored bytes',async()=>{
 const b=backend();b.state.uploadLost=true;await persistProfilePhoto({db:b.db,uid,blob:jpeg(),attempt:{}});
 assert.ok(b.row.avatar_path);assert.equal(b.calls.filter(c=>c.op==='upload').length,1);assert.equal(b.calls.filter(c=>c.op==='download').length,1);
});
test('upload rejection never publishes a broken path or removes the old photo',async()=>{
 const b=backend(old);b.state.uploadError=true;await assert.rejects(persistProfilePhoto({db:b.db,uid,originalPath:old,blob:jpeg(),attempt:{}}),/aperçu est conservé/);
 assert.equal(b.row.avatar_path,old);assert.equal(b.calls.some(c=>c.op==='update'||c.op==='remove'),false);
});
test('a committed write with a lost response is confirmed and not duplicated',async()=>{
 const b=backend();b.state.writeLost=true;const attempt={};const r=await persistProfilePhoto({db:b.db,uid,blob:jpeg(),attempt});assert.equal(r.path,b.row.avatar_path);
 await persistProfilePhoto({db:b.db,uid,blob:jpeg(),attempt});assert.equal(b.calls.filter(c=>c.op==='upload').length,1);assert.equal(b.calls.filter(c=>c.op==='update').length,1);
});
test('an uncommitted write retries the same path without a second upload',async()=>{
 const b=backend(old),attempt={};b.state.writeUncommitted=true;
 await assert.rejects(persistProfilePhoto({db:b.db,uid,originalPath:old,blob:jpeg(),attempt}),/pas confirmé/);
 assert.equal(b.row.avatar_path,old);const path=attempt.path;b.state.writeUncommitted=false;
 const result=await persistProfilePhoto({db:b.db,uid,originalPath:old,blob:jpeg(),attempt});assert.equal(result.path,path);assert.equal(b.calls.filter(c=>c.op==='upload').length,1);
});
test('concurrent changes cannot be overwritten',async()=>{
 const b=backend(old);b.state.otherPath=uid+'/44444444-4444-4444-8444-444444444444.jpg';
 await assert.rejects(persistProfilePhoto({db:b.db,uid,originalPath:old,blob:jpeg(),attempt:{}}),/autre écran/);assert.equal(b.row.avatar_path,b.state.otherPath);
});
test('remove changes only the profile reference, then cleanup deletes only unreferenced owned objects',async()=>{
 const b=backend(old);b.objects.set(old,jpeg());assert.equal(await removeUnusedProfilePhoto({db:b.db,path:old,uid}),false);assert(b.objects.has(old));
 const result=await persistProfilePhoto({db:b.db,uid,originalPath:old,attempt:{}});assert.equal(result.path,null);assert.equal(b.row.bio,'Preserve me');
 assert.equal(await removeUnusedProfilePhoto({db:b.db,path:old,uid}),true);assert(!b.objects.has(old));
});
test('session switch during upload blocks the profile write',async()=>{
 const b=backend();let valid=true;b.state.afterUpload=()=>{valid=false;};
 await assert.rejects(persistProfilePhoto({db:b.db,uid,blob:jpeg(),attempt:{},assertActive:()=>{if(!valid)throw Error('Session changed');}}),/Session changed/);
 assert.equal(b.row.avatar_path,null);assert.equal(b.calls.some(c=>c.op==='update'),false);
});
test('server path ownership is also enforced by the client and output byte limits are checked',async()=>{
 const b=backend();await assert.rejects(persistProfilePhoto({db:b.db,uid,originalPath:other+'/33333333-3333-4333-8333-333333333333.jpg',blob:jpeg(),attempt:{}}),/compte/);
 await assert.rejects(persistProfilePhoto({db:b.db,uid,blob:new Blob([new Uint8Array(MAX_PHOTO_BYTES+1)],{type:'image/jpeg'}),attempt:{}}),/invalide/);assert.equal(b.calls.length,0);
});
test('build bridge is idempotent, adds both profile joins and does not cache private images',()=>{
 const fixture='<form id="profileForm">\nprofiles!posts_author_id_fkey(display_name,username)\nprofiles!comments_author_id_fkey(display_name)\n'+`<span class="avatar">\${esc((p.profiles?.display_name||'M').slice(0,1))}</span>\n<div class="comment"><b>\${esc(c.profiles?.display_name||'Membre')}</b>`+'\ninitGames();';
 const app=integratePhotosApp(fixture);assert.equal(integratePhotosApp(app),app);assert.match(app,/profilePhotos.reset\(\)/);assert.match(app,/comments_author_id_fkey\(display_name,username,avatar_path\)/);assert.throws(()=>integratePhotosApp('source drift'));
 const cf='profiles!posts_author_id_fkey(display_name,username)'+`<span class="avatar" aria-hidden="true">\${esc((p.profiles?.display_name||'M').slice(0,1))}</span>`;
 const community=integratePhotosCommunity(cf);assert.equal(integratePhotosCommunity(community),community);
 const sw=integratePhotosWorker("const CACHE='sobrizen-old';\nconst ASSETS=['/app.mjs'];");assert.equal(integratePhotosWorker(sw),sw);assert.match(sw,/profile-photo-ui.mjs/);assert.doesNotMatch(sw,/profile-avatars|storage\/v1/);
});
