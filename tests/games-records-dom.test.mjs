import test from 'node:test';
import assert from 'node:assert/strict';
import {environment,click,$,txt,settle} from './ux-dom-support.mjs';
import {createGameRecords} from '../game-records.mjs';
import {GAME_IDS} from '../game-records-core.mjs';
import * as C from '../games-puzzles-core.mjs';

test('real game controllers: thirteen record displays, saved metrics, pause transitions and access',async t=>{
  const env=await environment({online:true});
  const originalRandom=Math.random;Math.random=()=>0;
  globalThis.devicePixelRatio=1;globalThis.innerHeight=window.innerHeight;
  let premium=true,revision=1;
  const S={demo:true,user:{id:'demo'}};
  const sessionContext=()=>({revision}),sameSession=c=>c?.revision===revision;
  const records=createGameRecords({S,sessionContext,sameSession,getClient:async()=>{throw Error('Demo must never request the backend.');}});
  const games=await import('../games.mjs');
  games.initGames({isPremium:()=>premium,records,sessionContext,sameSession});
  await records.load();
  const render=()=>{document.querySelector('#content').innerHTML=games.gamesView({premium});};
  render();
  async function launch(id,puzzle=false){await click('['+(puzzle?'data-brain-game':'data-game')+'='+id+']');assert.ok($(puzzle?'#pzPlay':'#gaPlay'));assert.ok($(puzzle?'#pzPlay [data-game-record]':'#gaPlay [data-game-record]'));}
  async function close(puzzle=false){await click('[data-'+(puzzle?'pz':'ga')+'=close]');assert.equal($(puzzle?'#pzPlay':'#gaPlay'),null);assert.equal(env.rafs.size,0);}
  async function pauseResume(puzzle=false){const prefix=puzzle?'pz':'ga';await click('[data-'+prefix+'=pause]');assert.equal($('.'+prefix+'-cover').hidden,false);await click('[data-'+prefix+'=resume]');assert.equal($('.'+prefix+'-cover').hidden,true);}
  function pointer(type,target,x,y){const event=new env.w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperty(event,'pointerId',{value:1});target.dispatchEvent(event);}
  async function tapPoint(x,y){const canvas=$('#pzPlay canvas');pointer('pointerdown',canvas,x,y);pointer('pointerup',canvas,x,y);await settle();}
  async function tapCell(i,n){await tapPoint((i%n+.5)*100/n,(Math.floor(i/n)+.5)*40/n);}
  async function scenario(name,fn){await t.test(name,async()=>{const before=env.errors.length;try{await fn();assert.deepEqual(env.errors.slice(before),[]);}finally{if($('#gaPlay'))await close();if($('#pzPlay'))await close(true);}});}
  try{
    assert.equal(document.querySelectorAll('#gameZone [data-game-record]').length,13);
    await scenario('Snake: fruit record, pause/resume and close',async()=>{
      await launch('snake');await env.frames(170,16);assert.ok(Number(txt('.ga-score'))>=1);await pauseResume();await close();assert.ok(records.record('snake').best_score>=1);
    });
    await scenario('Blocks: drop score is retained on closing',async()=>{
      await launch('blocks');await env.frames(110,16);await click('[data-ga=drop]');assert.ok(Number(txt('.ga-score'))>0);await pauseResume();await close();assert.ok(records.record('blocks').best_score>0);
    });
    await scenario('2048: undo, replay, pause and record',async()=>{
      await launch('merge');await click('[data-ga=left]');await env.frames(20,16);assert.equal(txt('.ga-score'),'4');await click('[data-ga=undo]');assert.equal(txt('.ga-score'),'0');await click('[data-ga=left]');await env.frames(20,16);await pauseResume();await close();assert.equal(records.record('merge').best_score,4);
    });
    await scenario('Sequence: pause during successful feedback preserves the next two-light sequence',async()=>{
      await launch('sequence');await env.frames(140,16);await click('[data-ga="sequence:0"]');await pauseResume();await env.frames(280,16);assert.equal(txt('.ga-status'),'À toi !');
      await click('[data-ga="sequence:0"]');assert.equal(txt('.ga-status'),'1 / 2');await click('[data-ga="sequence:0"]');assert.equal(txt('.ga-score'),'2');await close();assert.equal(records.record('sequence').best_score,2);
    });
    await scenario('Memory: four levels and completion time exclude a long pause',async()=>{
      await launch('memory');
      for(let level=1;level<=4;level++){
        await env.frames(155,16);const bySymbol=new Map();for(const b of document.querySelectorAll('.ga-memory-key')){if(!bySymbol.has(b.dataset.symbol))bySymbol.set(b.dataset.symbol,[]);bySymbol.get(b.dataset.symbol).push(b);}
        for(const pair of bySymbol.values()){await click(pair[0]);await click(pair[1]);}
        if(level===1){await click('[data-ga=pause]');await env.frames(600,16);await click('[data-ga=resume]');}
        await env.frames(60,16);
      }
      assert.match(txt('.ga-cover'),/quatre niveaux/);assert.match(txt('.ga-cover [data-game-record]'),/4 niveaux terminés/);
      assert.equal(records.record('memory').best_level,4);assert.ok(records.record('memory').best_time_ms>0&&records.record('memory').best_time_ms<20000);await close();
    });
    await scenario('Reaction: fifteen signals and positive fastest response',async()=>{
      await launch('reaction');await env.frames(100,16);for(let n=1;n<=15;n++){assert.match(txt('.ga-reaction'),/Maintenant/);await click('[data-ga=react]');await env.frames(n===15?80:150,16);}
      assert.match(txt('.ga-cover'),/15 signaux réussis sur 15/);assert.equal(records.record('reaction').best_score,15);assert.ok(records.record('reaction').best_time_ms>=1);await close();
    });
    await scenario('Targets: complete twenty seconds and retain hits',async()=>{
      await launch('taps');for(let i=0;i<3;i++)await click('[data-ga=target]');await env.frames(1255,16);assert.match(txt('.ga-cover'),/3 cibles en 20 secondes/);assert.equal(records.record('taps').best_score,3);await close();
    });
    await scenario('5 things: a completed pause is counted once through finish and close',async()=>{
      await launch('ground');for(let i=0;i<5;i++)await click('[data-ga=ground]');assert.match(txt('.ga-cover'),/cinq étapes/);assert.match(txt('.ga-cover [data-game-record]'),/1 séance terminée/);await close();assert.equal(records.record('ground').completed_sessions,1);
    });
    await scenario('Mosaic: placement, undo, new placement and retained score',async()=>{
      await launch('mosaic',true);await click('[data-piece="0"]');await tapCell(27,8);await click('[data-pz=undo]');assert.match(txt('.pz-score'),/^0 pts/);await env.frames(30,16);await click('[data-piece="0"]');await tapCell(27,8);await pauseResume(true);await close(true);assert.ok(records.record('mosaic').best_score>0);
    });
    await scenario('Gems: legal swaps preserve the score metric',async()=>{
      await launch('gems',true);const [i,j]=C.gemMoves(C.newGems(1,C.rng(0)).board)[0];await tapCell(i,5);await tapCell(j,5);await env.frames(110,16);assert.doesNotMatch(txt('.pz-score'),/^0\//);await close(true);assert.ok(records.record('gems').best_score>0);
    });
    await scenario('Colours: a complete generated solution records the finished level',async()=>{
      await launch('sort',true);const game=C.newSort(1,C.rng(0));
      const center=i=>{const row=Math.floor(i/3),num=Math.min(3,game.tubes.length-row*3);return [(i%3+1)*100/(num+1),(row*156+73)/330*40];};
      for(const [from,to] of game.solution){await tapPoint(...center(from));await tapPoint(...center(to));await env.frames(40,16);}
      assert.match(txt('.pz-cover'),/Niveau réussi/);assert.equal(records.record('sort').best_level,1);await close(true);
    });
    await scenario('Links: every route completed and a level record',async()=>{
      await launch('links',true);const game=C.newLinks(1,C.rng(0)),canvas=$('#pzPlay canvas');
      for(const path of game.solutions){for(let i=0;i<path.length;i++){const cell=path[i],x=(cell%game.size+.5)*100/game.size,y=(Math.floor(cell/game.size)+.5)*40/game.size;pointer(i===0?'pointerdown':'pointermove',canvas,x,y);if(i===path.length-1)pointer('pointerup',canvas,x,y);}await settle();}
      assert.match(txt('.pz-cover'),/Niveau réussi/);assert.equal(records.record('links').best_level,1);await close(true);
    });
    await scenario('Bubbles: a scoring shot, animation and personal score',async()=>{
      await launch('bubbles',true);const game=C.newBubbles(1,C.rng(0));let best=null;
      for(let k=0;k<=120;k++){const angle=-Math.PI+.22+k*(Math.PI-.44)/120,result=C.shootBubble(game,angle,C.rng(12345));if(result&&(!best||result.state.score>best.score))best={angle,score:result.state.score};}
      assert.ok(best.score>0);await tapPoint((171+Math.cos(best.angle)*100)/342*100,(432+Math.sin(best.angle)*100)/470*40);await env.frames(45,16);await pauseResume(true);await close(true);assert.ok(records.record('bubbles').best_score>0);
    });
    await scenario('all thirteen records appear on their cards',async()=>{
      for(const id of GAME_IDS){assert.ok(records.record(id),id);assert.doesNotMatch(txt('#gameZone [data-game-record='+id+']'),/à découvrir|aucune séance/,id);}
    });
    await scenario('Sequence: last-error pause/resume finishes at zero and cannot resume below zero',async()=>{
      await launch('sequence');await env.frames(140,16);
      for(let i=0;i<2;i++){await click('[data-ga="sequence:1"]');await env.frames(200,16);}
      await click('[data-ga="sequence:1"]');assert.equal(txt('.ga-unit'),'0 chances');await pauseResume();await env.frames(100,16);
      assert.equal($('#gaPlay').dataset.state,'result');assert.equal($('.ga-cover').hidden,false);assert.equal(txt('.ga-unit'),'0 chances');
      await click('[data-ga="sequence:1"]');assert.equal(txt('.ga-unit'),'0 chances');await close();
    });
    await scenario('changing dataset.premium cannot open either Premium controller',async()=>{
      premium=false;document.documentElement.dataset.premium='true';await click('[data-game=merge]');assert.equal($('#gaPlay'),null);
      await click('[data-brain-game=gems]');assert.equal($('#pzPlay'),null);assert.equal(env.navigations.length,2);premium=true;
    });
    await scenario('revoked entitlement and changed session close open games',async()=>{
      await launch('merge');premium=false;document.dispatchEvent(new CustomEvent('sobrizen-access-change'));assert.equal($('#gaPlay'),null);
      premium=true;await launch('gems',true);revision++;records.reset();document.dispatchEvent(new CustomEvent('sobrizen-access-change'));assert.equal($('#pzPlay'),null);assert.equal(records.record('gems'),null);
    });
    assert.deepEqual(env.errors,[]);
  }finally{records.destroy();env.close();Math.random=originalRandom;}
});
