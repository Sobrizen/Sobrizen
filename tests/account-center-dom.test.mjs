import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountCenter} from '../account-center.mjs';
import {environment,settle,$,txt,value,submit,click,UID,UID2} from './ux-dom-support.mjs';

test('account settings and inbox follow the authenticated session, retain failures and never mix accounts',async t=>{
 const env=await environment({online:true,mobile:true});
 const S={user:{id:UID,email:'qa@exemple.fr',email_confirmed_at:'2026-10-01'},demo:false,page:'profile'};
 const notices=[],writes=[],opened=[],verified=[];let rev=0,prefs=null,gate=null,error=null;
 const notification={id:'33333333-3333-4333-8333-333333333333',recipient_id:UID,actor_id:UID2,post_id:'44444444-4444-4444-8444-444444444444',kind:'comment',created_at:'2026-10-27T12:00:00Z',read_at:null,profiles:{display_name:'<script>Un membre</script>'}};
 const items=[notification];
 const sessionContext=()=>({user:S.user,demo:S.demo,rev});const sameSession=c=>c.user===S.user&&c.demo===S.demo&&c.rev===rev;
 const assertSession=c=>{if(!c?.user||!sameSession(c))throw Error('Session changée.');};
 class Query{
  constructor(table){this.table=table;this.filters=[];this.payload=null;this.head=false;}
  select(columns,options){this.head=!!options?.head;return this;}eq(key,val){this.filters.push([key,val]);return this;}is(key,val){this.filters.push([key,val]);return this;}order(){return this;}range(){return this;}maybeSingle(){this.singleRow=true;return this;}single(){this.singleRow=true;return this;}upsert(payload){this.payload=payload;return this;}
  then(ok,bad){return this.run().then(ok,bad);}
  async run(){
   if(gate){const wait=gate;gate=null;await wait;}
   if(error)return {data:null,error:{message:error}};
   if(this.payload){writes.push(this.payload);prefs={...prefs,...this.payload};}
   if(this.table==='notification_preferences')return {data:prefs,error:null};
   const data=items.filter(row=>this.filters.every(([key,val])=>row[key]===val));return {data:this.head?null:this.singleRow?data[0]||null:structuredClone(data),count:data.length,error:null};
  }
 }
 const db={from:table=>new Query(table),auth:{updateUser:async(payload,options)=>{writes.push({payload,options});if(error)return{error:{message:error}};return{data:{user:{...S.user,new_email:payload.email}},error:null};},signOut:async args=>{writes.push(args);return{data:{},error:null};},reauthenticate:async()=>({data:{},error:null})},rpc:async(name,args)=>{writes.push({name,args});if(name==='mark_notifications_read')for(const row of items)if(row.recipient_id===S.user.id&&(!args.p_ids||args.p_ids.includes(row.id)))row.read_at=new Date().toISOString();return{data:null,error:null};}};
 const avatar=$('#avatar');avatar.insertAdjacentHTML('beforebegin','<button data-account="inbox"><span data-notification-count></span></button>');
 const checkResult=r=>{if(r.error)throw r.error;return r.data;};
 const controller=createAccountCenter({S,getClient:async()=>db,sessionContext,sameSession,assertSession,checkResult,notify:text=>notices.push(text),message:error=>String(error.message||error),modal:(title,body)=>{$('#modalContent').innerHTML='<div class="modal-top"><h2>'+title+'</h2><button type="button" data-action="close">Fermer</button></div>'+body;$('#modal').showModal();},closeModal:()=>$('#modal').close(),verifyPassword:async(password,context)=>{verified.push(password);assertSession(context);if(password!==' current secret ')throw Error('Mot de passe actuel incorrect.');},openPublication:async id=>opened.push(id),leave:()=>{S.user=null;rev++;controller.reset();}});
 $('#content').innerHTML=controller.view();controller.rendered();await settle(30);
 try{
  await t.test('security actions and confirmed address are discoverable from the profile',async()=>{
   assert.match(txt('#content'),/Connexion et sécurité/);assert.match(txt('#content'),/qa@exemple.fr/);assert.match(txt('#content'),/Centre d’aide/);
   assert.equal($('[data-notification-count]').textContent,'1');assert.match($('[data-account="inbox"]').getAttribute('aria-label'),/1 non lue/);
  });
  await t.test('email validation prevents invalid changes and waits for confirmation without overwriting the current address',async()=>{
   await click('[data-account="email"]');let form=$('[data-account-form="email"]');
   await value(form,'email','new@exemple.fr');await value(form,'confirm_email','different@exemple.fr');await value(form,'current',' current secret ');await submit(form);
   assert.equal(verified.length,0);assert.equal(form.elements.confirm_email.getAttribute('aria-invalid'),'true');
   await value(form,'confirm_email','new@exemple.fr');await value(form,'current',' current secret ');await submit(form);
   assert.equal(verified[0],' current secret ');assert.deepEqual(writes.at(-1).payload,{email:'new@exemple.fr'});assert.equal(S.user.email,'qa@exemple.fr');assert.equal(S.user.new_email,'new@exemple.fr');assert.match(notices.at(-1),/Confirme les liens/);assert.equal($('#modal').open,false);
  });
  await t.test('password mismatch never calls auth and a rejected request keeps the editable form',async()=>{
   await click('[data-account="password"]');let form=$('[data-account-form="password"]');await value(form,'password',' new secret password ');await value(form,'confirm','not the same');await submit(form);assert.equal(form.elements.confirm.getAttribute('aria-invalid'),'true');
   await value(form,'confirm',' new secret password ');await value(form,'current','wrong');await submit(form);assert.match(txt('#modalContent'),/incorrect/);assert.equal(form.isConnected,true);assert.equal(form.elements.current.value,'');
   await value(form,'current',' current secret ');await submit(form);assert.deepEqual(writes.at(-1).payload,{password:' new secret password '});assert.equal($('#modal').open,false);
  });
  await t.test('inbox escapes member names, marks only the selected notification and opens its post',async()=>{
   await click('[data-account="inbox"]');assert.equal($('#modalContent script'),null);assert.ok($('#modalContent [data-action="close"]'),'Inbox refresh preserves its close control');assert.match(txt('#modalContent'),/Un membre/);assert.match(txt('#modalContent'),/Non lue/);
   await click('[data-account="open-notification"]');assert.deepEqual(opened,[notification.post_id]);assert.deepEqual(writes.find(x=>x.name==='mark_notifications_read').args.p_ids,[notification.id]);assert.equal($('[data-notification-count]').hidden,true);
  });
  await t.test('notification category preferences persist independently from device permission',async()=>{
   await click('[data-account="preferences"]');const form=$('[data-account-form="preferences"]');await value(form,'likes_enabled',false);await value(form,'comments_enabled',true);await submit(form);
   assert.deepEqual(writes.at(-1),{user_id:UID,likes_enabled:false,comments_enabled:true});
  });
  await t.test('late requests cannot populate another account or expose an old email',async()=>{
   let release;gate=new Promise(resolve=>{release=resolve;});const opening=click('[data-account="inbox"]');await settle();
   S.user={id:UID2,email:'second@exemple.fr'};rev++;controller.reset();$('#modal').close();$('#modalContent').replaceChildren();$('#content').innerHTML=controller.view();controller.rendered();release();await opening;await settle(25);
   assert.doesNotMatch(txt('#content'),/qa@exemple.fr/);assert.equal($('#modalContent').children.length,0);assert.equal($('[data-notification-count]').hidden,true);
  });
  await t.test('demo never calls the account service and unsupported push has an actionable explanation',async()=>{
   S.demo=true;rev++;controller.reset();controller.rendered();await click('[data-account="preferences"]');const before=writes.length;await click('[data-account="enable-push"]');assert.equal(writes.length,before);assert.match(notices.at(-1),/compte personnel/);
  });
 }finally{controller.reset();env.close();}
});
