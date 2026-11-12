import test from 'node:test';
import assert from 'node:assert/strict';
import {environment,click,$,txt} from './ux-dom-support.mjs';
import {createGameRecords} from '../game-records.mjs';

test('Blocs Zen controller uses the new fall interval and still pauses, resumes and saves records',async()=>{
  const env=await environment({online:true,mobile:true});
  globalThis.devicePixelRatio=1;globalThis.innerHeight=window.innerHeight;
  const S={demo:true,user:{id:'demo'}},sessionContext=()=>({revision:1,demo:true}),sameSession=c=>c?.revision===1;
  const records=createGameRecords({S,sessionContext,sameSession,getClient:async()=>{throw Error('Demo must not write remotely');}});
  const games=await import('../games.mjs');
  games.initGames({isPremium:()=>false,records,sessionContext,sameSession});
  await records.load();document.querySelector('#content').innerHTML=games.gamesView({premium:false});
  async function start(){await click('[data-game=blocks]');await env.frames(95,16);assert.equal($('#gaPlay').dataset.state,'playing');}
  try{
    await start();await env.frames(59,16);await click('[data-ga=drop]');
    assert.equal(txt('.ga-score'),'36','944 ms is before the first natural step');
    await click('[data-ga=close]');
    await start();await env.frames(60,16);await click('[data-ga=drop]');
    assert.equal(txt('.ga-score'),'34','960 ms includes one natural step, before the old 1000 ms threshold');
    await click('[data-ga=close]');
    await start();await env.frames(30,16);await click('[data-ga=pause]');
    assert.equal($('#gaPlay').dataset.state,'paused');await env.frames(600,16);
    await click('[data-ga=resume]');await env.frames(30,16);await click('[data-ga=drop]');
    assert.equal(txt('.ga-score'),'36','time while paused cannot advance gravity');
    await click('[data-ga=close]');assert.equal(records.record('blocks').best_score,36);
    assert.deepEqual(env.errors,[]);assert.equal(env.rafs.size,0);
  }finally{if($('#gaPlay'))await click('[data-ga=close]');records.destroy();env.close();}
});
