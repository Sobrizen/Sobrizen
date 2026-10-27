import test from 'node:test';
import assert from 'node:assert/strict';
import {HEALTH_SOURCES,HEALTH_STAGES,HEALTH_SAFETY} from '../health-evidence.mjs';
import {PROGRAM} from '../program.mjs';

test('every scientific finding links to an identifiable source with a population and limitations',()=>{
  const sources=new Map(HEALTH_SOURCES.map(source=>[source.id,source]));
  assert.equal(sources.size,HEALTH_SOURCES.length);
  for(const source of HEALTH_SOURCES){
    for(const key of ['title','authors','type','population','limits'])assert.ok(typeof source[key]==='string'&&source[key].trim(),`${source.id}: missing ${key}`);
    const url=new URL(source.url);assert.equal(url.protocol,'https:');
  }
  for(const stage of HEALTH_STAGES){
    for(const finding of [...stage.physical,...stage.mental]){
      assert.ok(finding.sourceIds.length,`${stage.id}/${finding.title}: no scientific reference`);
      assert.ok(finding.sourceIds.every(id=>sources.has(id)),`${stage.id}: unresolved reference`);
    }
    assert.ok(stage.sourceIds.length);assert.ok(stage.sourceIds.every(id=>sources.has(id)));
  }
});

test('time windows are ordered and the public safety text remains available beyond any milestone',()=>{
  assert.equal(new Set(HEALTH_STAGES.map(stage=>stage.id)).size,HEALTH_STAGES.length);
  assert.equal(HEALTH_STAGES[0].fromMinutes,0);
  for(let i=0;i<HEALTH_STAGES.length;i++){assert.ok(Number.isSafeInteger(HEALTH_STAGES[i].fromMinutes));if(i)assert.ok(HEALTH_STAGES[i].fromMinutes>HEALTH_STAGES[i-1].fromMinutes);}
  assert.match(HEALTH_SAFETY.urgent,/15|112/);assert.match(HEALTH_SAFETY.mental,/3114/);
  assert.match(HEALTH_SAFETY.withdrawal,/avis médical/);
});

test('all thirty reflection steps are complete and refer to current app destinations',()=>{
  assert.equal(PROGRAM.length,30);
  for(const[item,index]of PROGRAM.map((item,index)=>[item,index])){assert.equal(item.step,index+1);for(const key of ['title','lesson','action','prompt'])assert.ok(item[key]?.trim());}
  assert.doesNotMatch(PROGRAM.map(step=>step.action).join('\n'),/calendrier|dans Moi|taux de jours renseignés/i);
});
