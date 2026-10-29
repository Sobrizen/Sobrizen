import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {MOTIVATION_QUOTES,MOTIVATION_TITLE,MOTIVATION_KIND,createQuoteRotation,isMotivationEntry,motivationEntryId,motivationEntryBody,motivationQuoteForEntry} from '../journal-motivation.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
assert.equal(MOTIVATION_QUOTES.length,150);
assert.equal(new Set(MOTIVATION_QUOTES.map(quote=>quote.id)).size,150);
assert.equal(new Set(MOTIVATION_QUOTES.map(quote=>quote.text)).size,150);
assert.ok(new Set(MOTIVATION_QUOTES.map(quote=>quote.author)).size>=25,'The collection must include a broad range of authors');
for(const quote of MOTIVATION_QUOTES){
  assert.ok(Object.isFrozen(quote));
  assert.ok(!quote.id.startsWith('sobrizen-'),'New quotations must never reuse the identifiers of earlier encouragements');
  for(const field of ['id','text','author','work','locator','url','theme','language'])assert.ok(typeof quote[field]==='string'&&quote[field].trim(),`${quote.id}: missing ${field}`);
  const url=new URL(quote.url);assert.equal(url.protocol,'https:');assert.equal(url.username,'');assert.equal(url.password,'');
  assert.equal(typeof quote.translation,'boolean');
  assert.ok(quote.text.length<=450,`${quote.id}: quote must fit a mobile dialog`);
  if(!quote.translation)assert.equal(quote.language,'fr');
  assert.ok(quote.original||quote.copyright==='short-excerpt','A source excerpt or an explicit short-quotation policy is required');
  const body=motivationEntryBody(quote);assert.ok(body.includes(quote.author));assert.ok(body.includes(quote.url));assert.ok(body.length<4000);
  assert.equal(motivationQuoteForEntry({kind:MOTIVATION_KIND,title:MOTIVATION_TITLE,body}),quote,'Saved plain text must retain its attribution after a reload');
}
const rotation=createQuoteRotation(()=>0),first=Array.from({length:150},()=>rotation.next());
assert.equal(new Set(first.map(quote=>quote.id)).size,150,'All quotes appear before any repeats');
assert.notEqual(rotation.next().id,first.at(-1).id,'Deck boundary never repeats the previous quote');
const id=await motivationEntryId('account-one',MOTIVATION_QUOTES[0].id);
assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.equal(await motivationEntryId('account-one',MOTIVATION_QUOTES[0].id),id);
assert.notEqual(await motivationEntryId('account-two',MOTIVATION_QUOTES[0].id),id);
assert.notEqual(await motivationEntryId('account-one',MOTIVATION_QUOTES[1].id),id);
assert.equal(isMotivationEntry({kind:MOTIVATION_KIND,title:MOTIVATION_TITLE,body:'Kept historical quote'}),true);
assert.equal(isMotivationEntry({kind:'reflection',title:'Ma réflexion personnelle'}),false);
assert.equal(isMotivationEntry({kind:'plan',title:MOTIVATION_TITLE}),false);
assert.equal(motivationQuoteForEntry({kind:MOTIVATION_KIND,title:MOTIVATION_TITLE,body:'Une journée difficile n’efface pas le chemin parcouru.'}),null,'Never invent attribution for a previously saved encouragement');
assert.equal(motivationQuoteForEntry({kind:'plan',title:MOTIVATION_TITLE,body:motivationEntryBody(MOTIVATION_QUOTES[0])}),null);
await assert.rejects(()=>motivationEntryId('account-one','sobrizen-01'));
console.log('PASS 150 sourced quotations, credits, historical compatibility, rotation and stable account-scoped identifiers');
