import test from 'node:test';
import assert from 'node:assert/strict';
import {blocksDelay,blocksLevel,createBlocks} from '../games-core.mjs';

test('Blocs Zen fall intervals are only about five percent shorter at every playable level',()=>{
  for(let level=1;level<=10;level++){
    const old=Math.max(120,Math.round(1000*Math.pow(.8,level-1)));
    const current=blocksDelay(level);
    assert.ok(current<old,`level ${level} must be slightly faster`);
    assert.ok(current/old>=.94&&current/old<=.96,`level ${level} stays within a gentle adjustment`);
    if(level>1)assert.ok(current<blocksDelay(level-1));
  }
  assert.equal(blocksDelay(1),950);
  assert.equal(blocksDelay(10),128);
  assert.equal(blocksDelay(200),120,'keep the existing minimum fall interval');
});

test('Blocs Zen keeps its easy opening, four-line levels and ten-level ceiling',()=>{
  const game=createBlocks(()=>.5);
  assert.equal(game.w,10);assert.equal(game.h,20);
  assert.ok(game.board.every(row=>row.every(cell=>cell===0)));
  assert.deepEqual(game.piece,[[1,1],[1,1]]);
  assert.deepEqual(game.next.slice(0,2),[0,2]);
  assert.equal(game.score,0);assert.equal(game.level,1);
  for(let lines=0;lines<=100;lines++)assert.equal(blocksLevel(lines),Math.min(10,1+Math.floor(lines/4)));
});
