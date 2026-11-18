import test from 'node:test';
import assert from 'node:assert/strict';
import {environment,boot,mockService,$,txt,click,settle} from './ux-dom-support.mjs';

test('expired confirmation links show a visible explanation without exposing tokens or silently entering an existing session',async()=>{
 const env=await environment({online:true}),mock=await mockService();
 try{
  history.replaceState(null,'','/?subscribe=annual&error=access_denied&error_code=otp_expired&error_description=Untrusted%20server%20details#type=signup&access_token=fiction');
  await boot({mock});await settle();
  assert.equal($('#modal').open,true);assert.match(txt('#modalContent'),/Ce lien n’est plus valable/);assert.match(txt('#modalContent'),/spams/);
  assert.doesNotMatch(txt('#modalContent'),/Untrusted|access_token|fiction/);
  assert.equal(location.hash,'');assert.equal(new URLSearchParams(location.search).get('subscribe'),'annual');assert.equal(new URLSearchParams(location.search).has('error'),false);
  assert.equal($('#workspace').hidden,true);assert.equal($('[data-auth-feedback="resend"]'),null,'No resend request is possible until an address has been supplied');
  await click('[data-auth-feedback="edit"]');assert.equal($('#modal').open,false);assert.equal(document.activeElement,$('#authForm').elements.email);
  assert.deepEqual(env.errors,[]);
 }finally{env.close();}
});
