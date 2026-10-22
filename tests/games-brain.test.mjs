import test from 'node:test';
import assert from 'node:assert/strict';
import {slide2048,spawn2048,create2048,canMove2048,level2048,sequenceTiming,extendSequence} from '../games-brain-core.mjs';
const board=row=>[...row,...Array(12).fill(0)];
test('Pairs merge once, never twice in one move',()=>{
 let r=slide2048(board([2,2,2,2]),'left');assert.deepEqual(r.board.slice(0,4),[4,4,0,0]);assert.equal(r.gained,8);
 r=slide2048(board([2,2,4,0]),'left');assert.deepEqual(r.board.slice(0,4),[4,4,0,0]);assert.equal(r.gained,4);
 r=slide2048(board([4,4,4,4]),'right');assert.deepEqual(r.board.slice(0,4),[0,0,8,8]);assert.equal(r.gained,16);
});
test('All four directions and input immutability',()=>{
 const b=[2,0,0,2,2,0,0,2,0,0,0,0,0,0,0,0],original=[...b];
 assert.deepEqual(slide2048(b,'up').board,[4,0,0,4,0,0,0,0,0,0,0,0,0,0,0,0]);
 assert.deepEqual(slide2048(b,'down').board,[0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,4]);
 assert.equal(slide2048(b,'left').board[0],4);assert.equal(slide2048(b,'right').board[3],4);assert.deepEqual(b,original);
});
test('Invalid move creates no tile; invalid arguments throw',()=>{
 const b=board([2,4,0,0]);const r=slide2048(b,'left');assert.equal(r.changed,false);assert.equal(r.gained,0);
 assert.throws(()=>slide2048([], 'left'),TypeError);assert.throws(()=>slide2048(b,'diagonal'),TypeError);
});
test('Beginner start contains exactly two 2 tiles',()=>{
 for(let i=0;i<100;i++){const b=create2048();assert.equal(b.filter(Boolean).length,2);assert.equal(b.reduce((x,y)=>x+y),4);}
});
test('Spawning changes only one empty cell and never overwrites a tile',()=>{
 const b=board([2,4,8,16]);const r=spawn2048(b,()=>.99);assert.equal(r.index,15);assert.equal(r.board[15],4);assert.deepEqual(r.board.slice(0,4),b.slice(0,4));
 const full=Array(16).fill(2);assert.deepEqual(spawn2048(full).board,full);assert.equal(spawn2048(full).index,-1);
});
test('Blocked board, horizontal and vertical opportunities',()=>{
 const dead=[2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2];assert.equal(canMove2048(dead),false);
 const a=[...dead];a[0]=4;assert.equal(canMove2048(a),true);a[0]=0;assert.equal(canMove2048(a),true);
});
test('2048 values conserved through random slides; score only merges',()=>{
 for(let n=0;n<1000;n++){const b=Array.from({length:16},()=>Math.random()<.2?0:2**(1+Math.floor(Math.random()*6)));for(const d of ['left','right','up','down']){const r=slide2048(b,d);assert.equal(r.board.reduce((x,y)=>x+y,0),b.reduce((x,y)=>x+y,0));assert.ok(r.board.every(x=>x===0||Number.isInteger(Math.log2(x))));}}
});
test('Level increases with maximum tile and stays bounded',()=>{assert.equal(level2048(board([2,2,0,0])),1);assert.ok(level2048(board([512,0,0,0]))>level2048(board([32,0,0,0])));assert.ok(level2048(board([2**20,0,0,0]))<=10);});
test('Sequence extends by exactly one light, preserves history',()=>{const s=[2,1,0];const next=extendSequence(s,()=>.999);assert.deepEqual(next,[2,1,0,3]);assert.deepEqual(s,[2,1,0]);});
test('Sequence pacing starts slow, becomes faster, remains bounded',()=>{assert.equal(sequenceTiming(1).on,820);assert.ok(sequenceTiming(10).on<sequenceTiming(1).on);assert.ok(sequenceTiming(100).on>=300);assert.ok(sequenceTiming(100).gap>=150);});
