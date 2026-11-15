import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createBootstrap} from '../bootstrap.mjs';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
const fixture=`<section id="welcome"><button type="button" data-action="start">Commencer</button><button type="button" data-action="demo">Démo</button><button type="button" data-action="help">Aide</button><div id="accountStart"><button type="button" data-action="signin">Connexion</button><button type="button" data-action="signup">Créer un compte</button><form id="authForm"><input name="email" type="email" required><input name="password" type="password" required><input name="consent" type="checkbox"><button id="authSubmit" type="submit">Continuer</button></form><button type="button" data-action="password-visibility">Afficher</button><button type="button" data-action="privacy">Confidentialité</button><button type="button" data-action="forgot">Mot de passe oublié</button><button type="button" data-action="resend">Renvoyer</button><p id="authInfo" role="status"></p></div></section><div id="workspace" hidden></div>`;
const tick=async()=>{await Promise.resolve();await Promise.resolve();await new Promise(resolve=>setTimeout(resolve,0));};
function setup({search='',hash='',session=false,brokenStorage=false,theme=null}={}){
  const dom=new JSDOM(fixture,{url:'https://sobrizen.test/'+search+hash}),doc=dom.window.document,clicks=[],submits=[],events=[];
  let resolve,reject,loads=0,reloads=0,mode='signin';
  const gate=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const win={AbortController:dom.window.AbortController,URLSearchParams:dom.window.URLSearchParams,
    location:{search,hash,reload(){reloads++;}},
    localStorage:{getItem(key){assert.ok(['sobrizen-theme','sb-lnvtowdbbagwfbewnchz-auth-token'].includes(key));if(brokenStorage)throw Error('Storage blocked');return key==='sobrizen-theme'?theme:session?'not-parsed-or-copied':null;}},
    addEventListener:dom.window.addEventListener.bind(dom.window),
  };
  const load=async()=>{loads++;await gate;
    doc.addEventListener('click',event=>{const target=event.target.closest('[data-action]');if(!target)return;clicks.push(target.dataset.action);events.push('click:'+target.dataset.action);if(['start','signup','signin'].includes(target.dataset.action)){mode=target.dataset.action==='signin'?'signin':'signup';doc.getElementById('authForm').elements.consent.required=mode==='signup';}if(target.dataset.action==='password-visibility'){const input=doc.getElementById('authForm').elements.password;input.type=input.type==='password'?'text':'password';}});
    doc.addEventListener('submit',event=>{event.preventDefault();events.push('submit:'+mode);submits.push({mode,email:event.target.elements.email.value,password:event.target.elements.password.value});});
  };
  const control=createBootstrap(win,doc,{load});
  return {dom,doc,win,control,clicks,submits,events,resolve,reject,get loads(){return loads;},get reloads(){return reloads;},close(){control.destroy();dom.window.close();}};
}
const click=(env,action)=>env.doc.querySelector(`[data-action="${action}"]`).click();
const fill=env=>{const form=env.doc.getElementById('authForm');form.elements.email.value='fictional@example.test';form.elements.password.value='fictional-only-password';return form;};

test('a new public visitor loads no account code until an interaction',async()=>{
  const env=setup();try{await tick();assert.equal(env.loads,0);assert.equal(env.control.getState(),'idle');}finally{env.close();}
});
test('the remembered dark appearance is applied without loading account code',async()=>{
  const env=setup({theme:'dark'});try{await tick();assert.equal(env.doc.body.classList.contains('dark'),true);assert.equal(env.loads,0);}finally{env.close();}
});
test('focus preloads exactly once and does not replay an unsolicited action',async()=>{
  const env=setup();try{env.doc.querySelector('input[name=email]').focus();await tick();assert.equal(env.loads,1);assert.deepEqual(env.clicks,[]);env.resolve();assert.equal(await env.control.start(),true);assert.deepEqual(env.clicks,[]);}finally{env.close();}
});
test('multiple early clicks retain the latest action and invoke the loader once',async()=>{
  const env=setup();try{click(env,'demo');click(env,'help');click(env,'help');await tick();assert.equal(env.loads,1);env.resolve();await env.control.start();assert.deepEqual(env.clicks,['help']);click(env,'demo');assert.deepEqual(env.clicks,['help','demo']);}finally{env.close();}
});
test('a clicked authentication submit is intercepted then replayed once with the latest DOM values',async()=>{
  const env=setup();try{const form=fill(env);form.querySelector('button').click();form.querySelector('button').click();await tick();assert.equal(env.loads,1);assert.equal(env.submits.length,0);form.elements.password.value='changed-while-loading';env.resolve();await env.control.start();assert.deepEqual(env.submits,[{mode:'signin',email:'fictional@example.test',password:'changed-while-loading'}]);}finally{env.close();}
});
test('the intended signup mode is restored before an Enter-key submission',async()=>{
  const env=setup();try{const form=fill(env);click(env,'signup');form.elements.consent.checked=true;form.requestSubmit();env.resolve();await env.control.start();assert.deepEqual(env.clicks,['signup']);assert.equal(env.submits.length,1);assert.equal(env.submits[0].mode,'signup');}finally{env.close();}
});
test('password visibility during loading cannot cancel an authentication submission',async()=>{
  const env=setup();try{const form=fill(env);form.requestSubmit();click(env,'password-visibility');env.resolve();await env.control.start();assert.deepEqual(env.events,['click:password-visibility','submit:signin']);assert.equal(form.elements.password.type,'text');assert.equal(env.submits.length,1);assert.equal(env.submits[0].password,'fictional-only-password');}finally{env.close();}
});
test('opening privacy during loading preserves one authentication submission',async()=>{
  const env=setup();try{fill(env).requestSubmit();click(env,'privacy');env.resolve();await env.control.start();assert.deepEqual(env.events,['click:privacy','submit:signin']);assert.equal(env.submits.length,1);}finally{env.close();}
});
test('mode and latest auxiliary action replay before the latest single submission',async()=>{
  const env=setup();try{const form=fill(env);click(env,'signup');form.elements.consent.checked=true;form.requestSubmit();click(env,'privacy');form.elements.email.value='updated@example.test';form.elements.password.value='updated-fictional-password';form.requestSubmit();click(env,'password-visibility');env.resolve();await env.control.start();assert.deepEqual(env.events,['click:signup','click:password-visibility','submit:signup']);assert.deepEqual(env.submits,[{mode:'signup',email:'updated@example.test',password:'updated-fictional-password'}]);}finally{env.close();}
});
test('an explicit path change cancels a pending authentication submission',async()=>{
  for(const action of ['signin','signup','start','demo','help','forgot','resend']){
    const env=setup();try{fill(env).requestSubmit();click(env,'privacy');click(env,action);env.resolve();await env.control.start();assert.equal(env.submits.length,0,action);assert.deepEqual(env.clicks,[action]);}finally{env.close();}
  }
});
test('signup replay still requires consent and does not accidentally sign in',async()=>{
  const env=setup();try{const form=fill(env);click(env,'signup');form.requestSubmit();env.resolve();await env.control.start();assert.equal(env.submits.length,0);form.elements.consent.checked=true;form.requestSubmit();assert.equal(env.submits.length,1);assert.equal(env.submits[0].mode,'signup');}finally{env.close();}
});
test('existing account presence and supported email/purchase returns start account code automatically',async()=>{
  for(const options of [{session:true},{hash:'#access_token=fictional&type=recovery'},{hash:'#type=signup'},{hash:'#error_description=expired'},{search:'?type=recovery&token=fictional'},{search:'?error_description=expired'},{search:'?code=fictional'},{search:'?token_hash=fictional'},{search:'?subscribe=monthly'},{search:'?subscribe=annual'},{search:'?subscribe=launch'}]){
    const env=setup(options);try{await tick();assert.equal(env.loads,1,JSON.stringify(options));assert.equal(env.win.location.hash,options.hash||'','Bootstrap must leave auth URLs untouched for Supabase.');env.resolve();await env.control.start();assert.equal(env.submits.length,0);}finally{env.close();}
  }
});
test('blocked storage and unrelated query parameters preserve the public page',async()=>{
  const env=setup({brokenStorage:true,search:'?subscribe=unknown&utm_source=fictional'});try{await tick();assert.equal(env.loads,0);click(env,'demo');env.resolve();await env.control.start();assert.deepEqual(env.clicks,['demo']);}finally{env.close();}
});
test('load failure keeps fields in the DOM, does not leak details and offers an explicit page reload',async()=>{
  const env=setup();try{const form=fill(env);form.requestSubmit();await tick();env.reject(Error('internal detail must stay private'));assert.equal(await env.control.start(),false);assert.equal(form.elements.password.value,'fictional-only-password');assert.equal(env.submits.length,0);const info=env.doc.getElementById('authInfo');assert.match(info.textContent,/connexion.*recharge/);assert.doesNotMatch(info.textContent,/internal detail/);info.querySelector('[data-bootstrap-reload]').click();assert.equal(env.reloads,1);click(env,'help');await tick();assert.equal(env.loads,1);}finally{env.close();}
});
test('an action on a welcome hidden by restored session is not replayed',async()=>{
  const env=setup({session:true});try{click(env,'demo');env.doc.getElementById('welcome').hidden=true;env.resolve();await env.control.start();assert.deepEqual(env.clicks,[]);}finally{env.close();}
});
test('destroyed bootstrap never replays a pending form',async()=>{
  const env=setup();try{fill(env).requestSubmit();env.control.destroy();env.resolve();await tick();assert.equal(env.submits.length,0);}finally{env.close();}
});
