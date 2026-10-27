import test from 'node:test';
import assert from 'node:assert/strict';
import {pageSlice,textPages,preview} from '../compact-core.mjs';
test('all items remain reachable through pages',()=>{const a=Array.from({length:113},(_,i)=>i),seen=[];for(let i=0;i<pageSlice(a).pages;i++)seen.push(...pageSlice(a,i).items);assert.deepEqual(seen,a);});
test('empty and invalid page indices remain bounded',()=>{assert.equal(pageSlice([],10).pages,1);assert.equal(pageSlice([],10).page,0);assert.equal(pageSlice([1,2],-8).page,0);assert.equal(pageSlice([1],NaN,0).total,1);});
test('the last page contains remaining items, without duplicates',()=>{const a=Array.from({length:13},(_,i)=>i);assert.deepEqual(pageSlice(a,2,6).items,[12]);assert.equal(pageSlice(a,99).page,2);});
test('reading pages preserve every character including spaces and line breaks',()=>{const text=('Énergie.\nUn journal très personnel, encore un mot.  ').repeat(400);assert.equal(textPages(text,450).join(''),text);assert.ok(textPages(text,450).every(p=>p.length<=451));});
test('unbroken long strings and empty content do not hang',()=>{assert.equal(textPages('a'.repeat(5000),450).join(''),'a'.repeat(5000));assert.deepEqual(textPages(''),['']);});
test('preview never renders HTML or changes original strings',()=>{const t='<script>alert(1)</script> '+('mot '.repeat(100));const result=preview(t,50);assert.ok(result.endsWith('…'));assert.equal(preview('  petit  texte  '),'petit texte');assert.ok(t.includes('<script>'));});
