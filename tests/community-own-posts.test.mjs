import test from 'node:test';
import assert from 'node:assert/strict';
import {feedQuery,matchesPost,comparePosts,normalizeFilters} from '../community-core.mjs';
const uid='11111111-1111-4111-8111-111111111111';
test('own-post sorting restricts the server before pagination and keeps existing filters',()=>{
 const calls=[];const query=new Proxy({},{get:(_,name)=>(...args)=>{calls.push([name,...args]);return query;}});
 feedQuery(query,{filters:{sort:'mine',emotion:'pride',duration:'week'},userId:uid,kind:'victory',search:'balade',page:3});
 assert.equal(calls.findIndex(call=>call[0]==='eq'&&call[1]==='author_id'),0);
 assert.ok(calls.some(call=>call[0]==='eq'&&call[1]==='author_id'&&call[2]===uid));
 assert.ok(calls.some(call=>call[0]==='eq'&&call[1]==='emotion'&&call[2]==='pride'));
 assert.deepEqual(calls.at(-1),['range',60,79]);
 assert.equal(calls.some(call=>call[0]==='order'&&call[1]==='abstinence_days'),false);
 assert.equal(normalizeFilters({sort:'mine'}).sort,'mine');
 assert.throws(()=>feedQuery(query,{filters:{sort:'mine'}}),/Connecte-toi/);
});
test('own-post filtering also works in demonstration and orders by date',()=>{
 const own={id:'a',author_id:uid,body:'Une balade',kind:'share',created_at:'2026-11-17',abstinence_days:1};
 assert.equal(matchesPost(own,{sort:'mine'},'all','',[],uid),true);
 assert.equal(matchesPost({...own,author_id:'other'},{sort:'mine'},'all','',[],uid),false);
 assert.equal(matchesPost(own,{sort:'mine'},'all','',[]),false);
 assert.ok(comparePosts({...own,created_at:'2026-11-18',abstinence_days:100},own,'mine')<0);
});
