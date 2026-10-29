/** Real application forms and deployment bridge; DOM and external services are simulated. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {integrateApp} from '../scripts/integrate-community.mjs';
import {environment,boot,mockService,UID,$,txt,value,submit,click,settle,closeModal} from './ux-dom-support.mjs';

const env=await environment({online:true});
const mock=await mockService();
const appURL=new URL('../app.mjs',import.meta.url).href;
const hook=registerHooks({load(url,context,next){
  const loaded=next(url,context);
  return url===appURL?{...loaded,source:integrateApp(readFileSync(new URL(url),'utf8'))+'\nexport {S,render,setAuthMode,passwordModal,demo};\n'}:loaded;
}});
const authCalls=[];
mock.client.auth.signUp=async payload=>{authCalls.push({op:'signup',payload:structuredClone(payload)});return{data:{session:null,user:{id:UID}},error:null};};
mock.client.auth.signInWithPassword=async payload=>{authCalls.push({op:'signin',payload:structuredClone(payload)});return{data:{session:null,user:{id:UID}},error:null};};
mock.client.auth.updateUser=async payload=>{authCalls.push({op:'password',payload:structuredClone(payload)});return{data:{user:{id:UID}},error:null};};
let failNextProfile=null,nextProfileResponseGate=null;
function holdProfileResponse(){let release;const promise=new Promise(resolve=>{release=resolve;});const gate={promise,release,used:false};nextProfileResponseGate=gate;return gate;}
const from=mock.client.from;
mock.client.from=table=>{
  const query=from(table),run=query.run.bind(query);
  query.run=async()=>{
    if(table==='profiles'&&query.op==='update'){
      const duplicate=mock.tables.profiles.some(row=>row.id!==UID&&row.username===query.payload?.username);
      const error=failNextProfile||(duplicate?{code:'23505',message:'duplicate key value violates unique constraint "profiles_username_key"',details:'Key (username) already exists.'}:null);
      failNextProfile=null;
      if(error){mock.calls.push({table,op:query.op,payload:structuredClone(query.payload),filters:structuredClone(query.filters)});const gate=nextProfileResponseGate;nextProfileResponseGate=null;if(gate){gate.used=true;await gate.promise;}return{data:null,error};}
    }
    return run();
  };
  return query;
};
const writes=table=>mock.calls.filter(call=>call.table===table&&['insert','update','upsert','delete'].includes(call.op));
const linkedText=input=>[...new Set([input.getAttribute('aria-describedby'),input.getAttribute('aria-errormessage')].filter(Boolean).join(' ').split(/\s+/))]
  .map(id=>document.getElementById(id)).filter(node=>node&&!node.hidden&&!node.closest('[hidden]')).map(node=>node.textContent.trim()).join(' ');
function fieldError(input,pattern){
  assert.equal(input.getAttribute('aria-invalid'),'true','An invalid field must be marked accessibly');
  const text=linkedText(input);assert.ok(text,'An invalid field must link to its visible explanation');assert.match(text,pattern);return text;
}
const cleanField=input=>assert.notEqual(input.getAttribute('aria-invalid'),'true','A corrected field must not remain marked invalid');
async function blur(input){input.focus();input.blur();await settle();}
let app,passed=0;
async function profile(){await closeModal();app.S.page='profile';app.render();await settle();const tab=$('#sz-profile-tab-profile');if(tab)await click(tab);return $('#profileForm');}
async function check(name,run){await run();passed++;console.log('PASS '+name);}

try{
  await boot({mock});app=await import(appURL);

  await check('profile handles accept accents, spaces and an initial @ on blur or direct submit',async()=>{
    for(const [raw,canonical,useBlur] of [['Élan Zen','elan_zen',true],['@Alex','alex',false]]){
      const form=await profile(),input=form.elements.username,before=writes('profiles').length;
      assert.equal(input.hasAttribute('pattern'),false,'The native pattern must not reject friendly input before normalization');
      assert.equal(input.hasAttribute('minlength'),false);
      await value(form,'username',raw);
      if(useBlur){await blur(input);assert.equal(input.value,canonical);assert.match(txt('[data-username-preview]',form),new RegExp('@'+canonical));}
      await submit(form);await settle(20);
      const calls=writes('profiles');assert.equal(calls.length,before+1);assert.equal(calls.at(-1).payload.username,canonical);
      assert.equal(mock.tables.profiles.find(row=>row.id===UID).username,canonical);assert.equal(app.S.profile.username,canonical);
    }
  });

  await check('unsupported and short usernames explain the field error, prevent writes and clear when corrected',async()=>{
    for(const [raw,explanation] of [['alex🌿',/a à z|caractères|lettres/i],['ab',/au moins 3|3 caractères/i]]){
      const form=await profile(),input=form.elements.username,before=writes('profiles').length;
      await value(form,'username',raw);await submit(form);await settle();
      assert.equal(writes('profiles').length,before);fieldError(input,explanation);
      await value(form,'username','alex_corrige');await blur(input);cleanField(input);
      await submit(form);await settle(20);assert.equal(writes('profiles').length,before+1);
      assert.equal(mock.tables.profiles.find(row=>row.id===UID).username,'alex_corrige');
    }
  });

  await check('a duplicate username gets a brief field explanation without exposing SQL, then saves after correction',async()=>{
    const form=await profile(),input=form.elements.username,original=mock.tables.profiles.find(row=>row.id===UID).username;
    await value(form,'username','autre_qa');await submit(form);await settle(20);
    fieldError(input,/Ce pseudo est déjà pris\. Essaie un autre nom ou ajoute un chiffre\./);
    assert.doesNotMatch(form.textContent+' '+txt('#notice'),/23505|profiles_username_key|duplicate key|Key \(username\)/i);
    assert.equal(mock.tables.profiles.find(row=>row.id===UID).username,original);
    await value(form,'username','autre_qa2');cleanField(input);assert.doesNotMatch(linkedText(input),/déjà pris/);
    await submit(form);await settle(20);assert.equal(mock.tables.profiles.find(row=>row.id===UID).username,'autre_qa2');
  });

  await check('a delayed duplicate reply never marks a newer username invalid and the new choice can be saved',async()=>{
    const form=await profile(),input=form.elements.username,before=writes('profiles').length,gate=holdProfileResponse();
    try{
      await value(form,'username','autre_qa');await submit(form);assert.equal(gate.used,true);assert.equal(writes('profiles').length,before+1);
      await value(form,'username','nouveau_choix_libre');gate.release();await settle(25);
      assert.equal(input.value,'nouveau_choix_libre');cleanField(input);assert.equal(input.validity.valid,true);
      const summary=txt('[data-form-error]',form);
      assert.match(summary,/pseudo envoyé.*déjà pris/i);assert.match(summary,/nouveau choix|nouveau pseudo/i);
      assert.doesNotMatch(summary+' '+linkedText(input),/23505|profiles_username_key|duplicate key/i);
      await submit(form);await settle(20);assert.equal(writes('profiles').length,before+2);
      assert.equal(mock.tables.profiles.find(row=>row.id===UID).username,'nouveau_choix_libre');
    }finally{gate.release();}
  });

  await check('a service failure stays visible in its form without marking a valid field as wrong',async()=>{
    const form=await profile(),input=form.elements.username;
    await value(form,'username','alex_reseau');failNextProfile=Error('Failed to fetch');await submit(form);await settle(20);
    const errors=[...form.querySelectorAll('[role="alert"]')].filter(node=>!node.hidden&&!node.closest('[hidden]')).map(node=>node.textContent.trim()).join(' ');
    assert.match(errors,/connexion|réessaie|enregistr/i);assert.doesNotMatch(errors,/Failed to fetch|SQL/i);cleanField(input);
    assert.equal(input.value,'alex_reseau','The user keeps the draft after a failed request');
    await submit(form);await settle(20);assert.equal(mock.tables.profiles.find(row=>row.id===UID).username,'alex_reseau');
  });

  await check('an invalid support phone explains the affected field and a correction removes the error',async()=>{
    await profile();const tab=$('#sz-profile-tab-motivation');if(tab)await click(tab);
    const form=$('#settingsForm'),input=form.elements.support_phone,before=writes('user_settings').length;
    await value(form,'support_phone','pas un numero');await value(form,'privacy',true);await submit(form);await settle();
    assert.equal(writes('user_settings').length,before);fieldError(input,/numéro|chiffres|téléphone/i);
    await value(form,'support_phone','+33 6 12 34 56 78');cleanField(input);await submit(form);await settle(20);
    assert.equal(writes('user_settings').length,before+1);assert.equal(mock.tables.user_settings.find(row=>row.user_id===UID).support_phone,'+33 6 12 34 56 78');
  });

  await check('password confirmation explains a mismatch beside its field and clears after correction',async()=>{
    app.passwordModal();await settle();const form=$('#passwordForm'),confirm=form.elements.confirm;
    await value(form,'password','MotdepasseSimple!');await value(form,'confirm','AutreMotdepasse!');await submit(form);await settle();
    assert.equal(authCalls.filter(call=>call.op==='password').length,0);fieldError(confirm,/même|identique|correspond/i);
    await value(form,'confirm','MotdepasseSimple!');cleanField(confirm);await submit(form);await settle(20);
    assert.equal(authCalls.filter(call=>call.op==='password').length,1);assert.equal($('#modal').open,false);
  });

  await check('native required and malformed email validation produces a linked French explanation',async()=>{
    await mock.signOut();app.setAuthMode('signin');const form=$('#authForm'),email=form.elements.email;
    await value(form,'password','MotdepasseSimple!');await value(form,'email','');assert.equal(email.reportValidity(),false);await settle();
    fieldError(email,/renseigne|adresse|complète|obligatoire/i);
    await value(form,'email','pas-une-adresse');assert.equal(email.reportValidity(),false);await settle();fieldError(email,/adresse|email|exemple/i);
    await value(form,'email','personne@example.test');cleanField(email);assert.equal(email.reportValidity(),true);
    assert.equal(authCalls.some(call=>call.op==='signin'),false,'Reporting invalidity never submits credentials');
  });

  await check('signup clearly labels an optional display name, accepts 40 free characters and keeps the default when empty',async()=>{
    await click('#signupTab');const form=$('#authForm'),input=form.elements.display_name;
    assert.match(txt('#nameLabel'),/Nom affiché\s*·\s*facultatif/);assert.equal(input.required,false);assert.equal(input.maxLength,40);assert.equal(input.hasAttribute('pattern'),false);
    const prefix='Élodie 🌿 ',name=prefix+'x'.repeat(40-prefix.length);
    await value(form,'display_name',name);await value(form,'email','personne@example.test');await value(form,'password','MotdepasseSimple!');await value(form,'consent',true);
    assert.equal(input.checkValidity(),true);await submit(form);await settle(20);
    assert.equal(authCalls.filter(call=>call.op==='signup').at(-1).payload.options.data.display_name,name);
    await value(form,'display_name','');await submit(form);await settle(20);
    assert.equal(authCalls.filter(call=>call.op==='signup').at(-1).payload.options.data.display_name,'Nouveau membre');
  });

  await check('local username validation in an offline demo explains the rule instead of blaming the connection',async()=>{
    const online=Object.getOwnPropertyDescriptor(navigator,'onLine'),before=writes('profiles').length;
    try{
      Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});app.demo();const form=await profile(),input=form.elements.username;
      await value(form,'username','ab');await submit(form);await settle();
      fieldError(input,/au moins 3|3 caractères/);assert.doesNotMatch(linkedText(input),/connexion|internet|réseau/i);
      assert.equal(writes('profiles').length,before);
    }finally{Object.defineProperty(navigator,'onLine',online);}
  });

  assert.deepEqual(env.errors,[]);
}finally{hook.deregister();env.close();}
console.log(`${passed}/10 application form feedback checks passed; real network disabled`);
