import test from 'node:test';
import assert from 'node:assert/strict';
import {DURATIONS,EMOTIONS,validatePost,matchesPost,comparePosts,feedQuery,validImagePath,imageSignature,esc} from './community-core.mjs';
import {integrateApp,integrateWorker} from './scripts/integrate-community.mjs';
const row=(days,extra={})=>({id:'x',body:'Une belle soirée',kind:'share',emotion:'pride',abstinence_days:days,created_at:'2026-10-28T00:00:00Z',author_id:'a',...extra});
const uid='11111111-1111-4111-8111-111111111111',img='22222222-2222-4222-8222-222222222222';
test('All duration boundaries are non-overlapping; missing is not zero',()=>{
  for(const days of [0,6,7,29,30,89,90,179,180,364,365,50000]){
    const bins=DURATIONS.filter(x=>!['all','unset'].includes(x[0])).filter(x=>matchesPost(row(days),{duration:x[0]}));
    assert.equal(bins.length,1,String(days));
  }
  assert(matchesPost(row(null),{duration:'unset'}));assert(!matchesPost(row(null),{duration:'week'}));
  assert(!matchesPost(row(0),{duration:'unset'}));assert(matchesPost(row(undefined),{duration:'all'}));
  assert(matchesPost(row(30),{duration:'quarter'}));assert(!matchesPost(row(90),{duration:'quarter'}));
});
test('Emotion, duration, kind, text and author restrictions combine',()=>{
  assert(matchesPost(row(45),{emotion:'pride',duration:'quarter'},'share','BELLE'));
  assert(!matchesPost(row(45),{emotion:'stress',duration:'quarter'}));
  assert(!matchesPost(row(45),{emotion:'pride',duration:'week'}));
  assert(!matchesPost(row(45),{},'question'));assert(!matchesPost(row(45),{},'all','introuvable'));
  assert(!matchesPost(row(45),{},'all','',['a']));
  assert(matchesPost(row(null,{emotion:null}),{emotion:'unset'}));
});
test('Ascending and descending duration put undisclosed durations last',()=>{
  const rows=[row(null,{id:'c'}),row(90,{id:'a'}),row(0,{id:'b'})];
  assert.deepEqual([...rows].sort((a,b)=>comparePosts(a,b,'short')).map(x=>x.abstinence_days),[0,90,null]);
  assert.deepEqual([...rows].sort((a,b)=>comparePosts(a,b,'long')).map(x=>x.abstinence_days),[90,0,null]);
  assert.equal(comparePosts(row(1,{id:'a'}),row(1,{id:'b'}),'short'),1);
});
test('Validation accepts explicit optional fields and refuses malformed values',()=>{
  assert.equal(validatePost({body:' hello '}).body,'hello');assert.equal(validatePost({body:'x',abstinence_days:''}).abstinence_days,null);
  assert.equal(validatePost({body:'x',abstinence_days:'0'}).abstinence_days,0);
  for(const days of ['-1','1.5','NaN','50001','1e3','Infinity'])assert.throws(()=>validatePost({body:'x',abstinence_days:days}));
  assert.throws(()=>validatePost({body:' '}));assert.throws(()=>validatePost({body:'x'.repeat(2001)}));
  assert.throws(()=>validatePost({body:'x',emotion:'<script>'}));assert.throws(()=>validatePost({body:'x',kind:'invented'}));
  assert.throws(()=>validatePost({body:'x',image_alt:'x'.repeat(181)}));
  for(const [emotion] of EMOTIONS)assert.equal(validatePost({body:'x',emotion}).emotion,emotion);
});
test('Server applies restrictions before pagination with a stable tie break',()=>{
  const calls=[],q=new Proxy({}, {get:(_,key)=>(...args)=>{calls.push([key,...args]);return q;}});
  feedQuery(q,{filters:{duration:'quarter',emotion:'pride',sort:'long'},kind:'share',search:'hello%_',hidden:[uid,'evil)'],page:2});
  assert(calls.find(x=>x[0]==='gte'&&x[2]===30));assert(calls.find(x=>x[0]==='lt'&&x[2]===90));
  assert(calls.find(x=>x[0]==='eq'&&x[1]==='emotion'&&x[2]==='pride'));
  assert(calls.find(x=>x[0]==='ilike'&&x[2]==='%hello%'));
  assert(calls.find(x=>x[0]==='not'&&x[3]==='('+uid+')'));
  assert.deepEqual(calls.at(-1),['range',40,59]);
  assert.deepEqual(calls.filter(x=>x[0]==='order').map(x=>x[1]),['abstinence_days','created_at','id']);
  assert.equal(calls.find(x=>x[0]==='order')[2].nullsFirst,false);
});
test('Image paths are author-owned JPEG UUID paths; magic bytes reject SVG',()=>{
  assert(validImagePath(uid+'/'+img+'.jpg',uid));
  for(const path of [uid+'/../x.jpg','https://bad.test/x.jpg',img+'/'+img+'.jpg',uid+'/'+img+'.svg'])assert(!validImagePath(path,uid));
  assert.equal(imageSignature(Uint8Array.from([255,216,255])),'image/jpeg');
  assert.equal(imageSignature(Uint8Array.from([137,80,78,71,13,10,26,10])),'image/png');
  assert.equal(imageSignature(new TextEncoder().encode('RIFFxxxxWEBP')),'image/webp');
  assert.equal(imageSignature(new TextEncoder().encode('<svg>')),null);
  assert.equal(esc('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');
});
test('Build integration is idempotent and rejects source drift',()=>{
  const fixture='function communityView(){}\nfunction postList(){}\nfunction postModal(){}\nasync function loadFeed(){}\nfunction invalidateSession(){}\nconst actionHandlers={};\ninitGames();';
  const once=integrateApp(fixture);assert.equal(integrateApp(once),once);assert(once.includes('communityView=community.view'));
  assert.throws(()=>integrateApp('unrelated source'));assert.throws(()=>integrateApp(fixture+'\ninitGames();'));
  const worker="const CACHE='sobrizen-v4-old';\nconst ASSETS=['/app.mjs'];";
  const updated=integrateWorker(worker);assert.equal(integrateWorker(updated),updated);assert(updated.includes('/community.mjs'));assert(!updated.includes('v4-old'));
});
test('A later release cache is preserved when the worker already includes community',()=>{
  const worker="const CACHE='sobrizen-v4-20261029-modern-journal-1';\nconst ASSETS=['/app.mjs','/community.mjs','/community-core.mjs','/community.css','/modern.css','/journal-motivation.mjs'];";
  const updated=integrateWorker(worker);
  assert.equal(updated,worker,'A subsequent build must not revert the release cache or remove the new assets');
  assert.equal(integrateWorker(updated),worker);
});
