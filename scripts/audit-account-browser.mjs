/** Browser acceptance of the real public build; fictitious demo data, zero external calls. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),output=resolve(root,'artifacts/account-browser');
await mkdir(output,{recursive:true});
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),path=resolve(root,'dist','.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!path.startsWith(resolve(root,'dist')+'\\')&&!path.startsWith(resolve(root,'dist')+'/'))throw Error('Path');res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});const report={viewports:[],errors:[]};
try{
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
  await context.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
  await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(origin);await page.locator('#welcome [data-action="demo"]').first().click();await page.locator('#workspace').waitFor({state:'visible'});
  async function close(){if(await page.locator('#modal').evaluate(node=>node.open))await page.locator('#modal [data-action="close"]').click();}
  async function route(name){await close();if(width<800&&!await page.locator('body').evaluate(node=>node.classList.contains('menu-open')))await page.locator('[data-action="menu-toggle"]').click();await page.locator('#nav [data-page="'+name+'"]').click();}
  await route('profile');await page.locator('#sz-profile-tab-settings').click();
  await page.locator('summary').filter({hasText:'Connexion et sécurité'}).click();
  await page.locator('[data-account="email"]').click();await page.locator('[data-account-form="email"]').waitFor();
  assert.equal(await page.locator('[data-account-form="email"] input[type="password"]').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow in account dialog');
  await page.screenshot({path:resolve(output,'email-'+width+'.png')});await close();
  await page.locator('[data-account="password"]').click();await page.locator('[data-account-form="password"]').waitFor();
  assert.equal(await page.locator('[data-account-form="password"] input[type="password"]').count(),3);await close();
  const bell=page.locator('header [data-account="inbox"]');assert.equal(await bell.isVisible(),true);
  const bellBox=await bell.boundingBox();assert.ok(bellBox.x>=0&&bellBox.x+bellBox.width<=width,'Bell fits mobile header');
  await bell.click();await page.locator('[data-account-inbox]').waitFor();assert.match(await page.locator('#modalContent').innerText(),/compte personnel/);await close();
  await route('community');await page.locator('[data-community-filter="sort"]').selectOption('mine');await page.waitForTimeout(100);
  assert.match(await page.locator('.community-empty').innerText(),/aucune publication/);
  await page.locator('[data-action="post-new"]').click();await page.locator('#communityPostForm textarea[name="body"]').fill('Mon partage de démonstration pour vérifier Mes publications.');await page.locator('#communityPostForm [name="share_consent"]').check();await page.locator('#communityPostForm button[type="submit"]').click();
  await page.locator('.community-post').waitFor();assert.equal(await page.locator('.community-post').count(),1);assert.match(await page.locator('.community-post').innerText(),/Mon partage de démonstration/);
  await page.screenshot({path:resolve(output,'my-posts-'+width+'.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow in community');
  report.viewports.push({width,securityForms:true,notificationInbox:true,ownPostFilter:true,noHorizontalOverflow:true});await context.close();
 }
 assert.deepEqual(report.errors,[]);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
