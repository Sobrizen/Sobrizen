import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUsername,USERNAME_MIN,USERNAME_MAX} from '../username.mjs';

test('friendly uppercase, accents and spaces produce an explicit canonical handle',()=>{
  for(const [input,value] of [
    ['  @Sarah Zen  ','sarah_zen'],
    ['@ Élan 2026','elan_2026'],
    ['CŒUR SÆR','coeur_saer'],
    ['ÇA VA TRÈS BIEN','ca_va_tres_bien'],
    ['Re\u0301ussite','reussite'],
    ['Alex -- Zen','alex_zen'],
    ['Alex\u00a0\u2011Zen','alex_zen'],
    ['Un—Jour–À—La—Fois','un_jour_a_la_fois'],
  ])assert.deepEqual(normalizeUsername(input),{value,error:''});
});

test('existing allowed handles retain their exact identity and require no new character rule',()=>{
  for(const value of ['alex_zen','un.jour.a.la.fois','sarah2026','123','_alex','alex_','.alex.','...','___','a__b..c']){
    assert.deepEqual(normalizeUsername(value),{value,error:''});
    assert.deepEqual(normalizeUsername(normalizeUsername(value).value),{value,error:''});
  }
});

test('only one optional initial at sign is accepted and internal at signs remain invalid',()=>{
  assert.deepEqual(normalizeUsername('@alex'),{value:'alex',error:''});
  for(const input of ['@@alex','alex@zen','alex@example.com','@ @alex']){
    const result=normalizeUsername(input);
    assert.ok(result.error);assert.ok(result.value.includes('@'));
  }
});

test('unsupported characters are reported without silently deleting or substituting them',()=>{
  for(const [input,kept] of [['Alex🌿','🌿'],["l’élan",'’'],['alex/zen','/'],['alex\\zen','\\'],['山田','山'],['alex\u200bzen','\u200b'],['alex+zen','+'],['straße','ß']]){
    const result=normalizeUsername(input);
    assert.ok(result.error,input);assert.ok(result.value.includes(kept),input);
  }
});

test('empty and short handles get an actionable explanation',()=>{
  for(const input of ['', '   ', '@', '@  ', null,undefined,{},123]){
    const result=normalizeUsername(input);assert.equal(result.value,'');assert.match(result.error,/Choisis un pseudo/);
  }
  for(const input of ['a','ab','  @É '])assert.match(normalizeUsername(input).error,/au moins 3/);
  assert.equal(USERNAME_MIN,3);assert.equal(normalizeUsername('abc').error,'');
});

test('length is checked after formatting and excessive handles are never truncated',()=>{
  assert.equal(USERNAME_MAX,30);
  assert.deepEqual(normalizeUsername('A'.repeat(30)),{value:'a'.repeat(30),error:''});
  const long=normalizeUsername('A'.repeat(31));
  assert.equal(long.value,'a'.repeat(31));assert.match(long.error,/30 caractères maximum/);
  assert.equal(normalizeUsername('@'+'E\u0301'.repeat(30)).error,'');
  assert.equal(normalizeUsername('œ'.repeat(15)).value.length,30);
  assert.equal(normalizeUsername('œ'.repeat(15)).error,'');
  const expanded=normalizeUsername('œ'.repeat(16));assert.equal(expanded.value,'oe'.repeat(16));assert.match(expanded.error,/30 caractères maximum/);
  assert.equal(normalizeUsername('alex'+' - '.repeat(40)+'zen').value,'alex_zen');
});

test('valid results satisfy the existing database format without claiming availability',()=>{
  for(const input of ['Alex Zen','Élan','@Sarah_2026','Œuvre','abc','a'.repeat(30)]){
    const result=normalizeUsername(input);
    assert.equal(result.error,'');assert.match(result.value,/^[a-z0-9_.]{3,30}$/);
    assert.deepEqual(Object.keys(result),['value','error']);
    assert.equal('available' in result,false);
  }
});
