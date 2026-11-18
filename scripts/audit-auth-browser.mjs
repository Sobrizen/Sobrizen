/** Real public UI with a fictitious, in-memory Auth service. No email or credentials leave the browser. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),output=resolve(root,'artifacts/auth-browser');
await mkdir(output,{recursive:true});
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{const path=resolve(root,'dist','.'+(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':decodeURIComponent(new URL(req.url,'http://localhost').pathname)));if(!path.startsWith(resolve(root,'dist')+'\\')&&!path.startsWith(resolve(root,'dist')+'/'))throw Error('Path');res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});const report={viewports:[],errors:[],unexpectedRequests:[]};
try{
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  await context.addInitScript(()=>{
   window.__authCalls=[];
   window.__authQaClient={auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:null},error:null}),
    signUp:async payload=>{window.__authCalls.push({kind:'signup',email:payload.email});return {data:{session:null,user:{id:'11111111-1111-4111-8111-111111111111'}},error:null};},
    resend:async payload=>{window.__authCalls.push({kind:'confirmation',email:payload.email});return {data:{},error:null};},
    resetPasswordForEmail:async email=>{window.__authCalls.push({kind:'recovery',email});return {data:{},error:null};}}};
  });
  await context.route('**/*',async route=>{
   const url=route.request().url();if(url.startsWith(origin))return route.continue();
   if(url.startsWith('https://esm.sh/@supabase/supabase-js@'))return route.fulfill({contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:'export function createClient(){return window.__authQaClient;}'});
   report.unexpectedRequests.push(new URL(url).origin);return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(origin);await page.locator('#signupTab').click();await page.locator('#authForm [name="email"]').fill('recette@example.test');await page.locator('#authForm [name="password"]').fill('FictionOnlyPassword123');await page.locator('#authForm [name="consent"]').check();await page.locator('#authSubmit').click();
  await page.locator('[data-auth-email-feedback]').waitFor();assert.match(await page.locator('#modalContent').innerText(),/spams/);assert.match(await page.locator('#modalContent').innerText(),/recette@example.test/);assert.equal(await page.locator('[data-auth-feedback="resend"]').isEnabled(),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:resolve(output,'signup-'+width+'.png')});
  await page.locator('[data-auth-feedback="edit"]').click();assert.equal(await page.locator('#signupTab').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#authForm [name="email"]').inputValue(),'recette@example.test');
  await page.locator('[data-action="forgot"]').click();await page.locator('[data-auth-email-feedback]').waitFor();assert.match(await page.locator('#modalContent').innerText(),/réinitialiser|réinitialisation/);assert.match(await page.locator('#modalContent').innerText(),/spams/);await page.screenshot({path:resolve(output,'recovery-'+width+'.png')});
  await page.locator('#modal [data-action="close"]').click();await page.locator('#authForm [name="email"]').fill('confirmation@example.test');await page.locator('[data-action="resend"]').click();await page.locator('[data-auth-email-feedback]').waitFor();assert.match(await page.locator('#modalContent').innerText(),/Confirmation demandée/);
  assert.equal((await page.evaluate(()=>window.__authCalls)).length,3);await context.close();
  report.viewports.push({width,signup:true,spamInstructions:true,correctEmailKeepsSignup:true,recovery:true,confirmationResend:true,noHorizontalOverflow:true});
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpectedRequests,[]);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
