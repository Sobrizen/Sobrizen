import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {integrateApp} from '../scripts/integrate-community.mjs';
import {environment,boot,mockService,$,txt,click,value,settle} from './ux-dom-support.mjs';

const env=await environment({online:true,mobile:true}),mock=await mockService();
const originalSession=mock.client.auth.getSession;
mock.client.auth.getSession=async()=>{const result=await originalSession();if(result.data.session)result.data.session.access_token='eyJ.mock-account-token';return result;};
let subscriptions=[],requests=[];
globalThis.fetch=async(url,options)=>{
 const route=new URL(String(url)).pathname.split('/').at(-1);assert.ok(['sync','status'].includes(route));assert.equal(options.method,'POST');assert.equal(options.body,'{}');requests.push(route);
 return new Response(JSON.stringify({subscriptions}),{status:200,headers:{'Content-Type':'application/json'}});
};
const appURL=new URL('../app.mjs',import.meta.url).href;
const hook=registerHooks({load(url,context,next){const result=next(url,context);return url===appURL?{...result,source:integrateApp(readFileSync(new URL(url),'utf8'))+'\nexport {S,render,accessRefresh};\n'}:result;}});
await boot({mock});const app=await import(appURL);await settle(30);
const paid=()=>[{status:'active',paid_until:'2027-01-01T00:00:00Z',plan:'monthly',unit_amount:299,access_blocked:false,cancel_at_period_end:false}];

test('Mon Plan is an ordinary available link in the mobile menu and guest entry',async()=>{
 const menu=$('#nav [data-plan]');assert.ok(menu);assert.equal(menu.getAttribute('href'),'/abonnement');assert.equal(menu.getAttribute('aria-label'),'Mon Plan');assert.match(menu.textContent,/Mon Plan/);
 await click('[data-action="menu-toggle"]');assert.equal($('#appNav').getAttribute('aria-hidden'),null);assert.equal(menu.closest('[hidden],[inert]'),null);
 assert.ok([...document.querySelectorAll('#welcome a[href="/abonnement"]')].some(a=>a.textContent==='Mon Plan'));
 await click('[data-action="menu-close"]');
});

test('a confirmed purchase updates access and the plan card without replacing profile drafts',async()=>{
 app.S.page='profile';app.render();await settle();const form=$('#profileForm');await value(form,'bio','Brouillon conservé pendant la vérification.');const checks=app.S.checks;
 subscriptions=paid();await app.accessRefresh.refresh({expiry:true});await settle();
 assert.equal(app.S.billing.premium,true);assert.equal(document.documentElement.dataset.premium,'true');assert.equal($('#profileForm'),form);assert.equal(form.elements.bio.value,'Brouillon conservé pendant la vérification.');assert.equal(app.S.checks,checks);assert.match(txt('[data-billing-summary]'),/Mon Plan · Premium/);assert.ok(requests.includes('sync'));
 subscriptions=[];await app.accessRefresh.refresh({expiry:true});await settle();assert.equal(app.S.billing.premium,false);assert.equal($('#profileForm'),form);assert.equal(form.elements.bio.value,'Brouillon conservé pendant la vérification.');assert.match(txt('[data-billing-summary]'),/17,99 € \/ an/);
});

test('access revalidation retains an open journal draft and its DOM node',async()=>{
 app.S.page='journal';app.render();await settle();await click('[data-action="journal-new"]');const form=$('#journalForm');await value(form,'body','Une note encore en cours de rédaction.');
 subscriptions=paid();await app.accessRefresh.refresh({expiry:true});await settle();assert.equal($('#journalForm'),form);assert.equal(form.elements.body.value,'Une note encore en cours de rédaction.');assert.equal($('#modal').open,true);assert.equal(app.S.billing.premium,true);
 await click('#modal [data-action="close"]');await click('[data-jn-discard]');
});

test('game cards change entitlement actions in place without losing filter references',async()=>{
 subscriptions=[];await app.accessRefresh.refresh({expiry:true});app.S.page='games';app.render();await settle();const card=$('[data-game-upgrade="merge"]');assert.ok(card);card.hidden=true;
 subscriptions=paid();await app.accessRefresh.refresh({expiry:true});await settle();assert.equal($('[data-game="merge"]'),card);assert.equal(card.hasAttribute('data-game-upgrade'),false);assert.equal(card.hidden,true);
 subscriptions=[];await app.accessRefresh.refresh({expiry:true});await settle();assert.equal($('[data-game-upgrade="merge"]'),card);assert.equal(card.hasAttribute('data-game'),false);assert.equal(card.hidden,true);assert.deepEqual(env.errors,[]);
});

test.after(()=>{app.accessRefresh.destroy();hook.deregister();env.close();});
