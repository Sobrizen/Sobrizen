import test from 'node:test';
import assert from 'node:assert/strict';
import {HEALTH_SOURCES,HEALTH_STAGES,HEALTH_SAFETY,HEALTH_ADDICTION} from '../health-evidence.mjs';
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

test('craving support has four complete strategies and references for its explanation, help and setback messages',()=>{
  const sources=new Set(HEALTH_SOURCES.map(source=>source.id));
  assert.ok(HEALTH_ADDICTION&&typeof HEALTH_ADDICTION==='object');
  assert.ok(Array.isArray(HEALTH_ADDICTION.steps));
  assert.equal(HEALTH_ADDICTION.steps.length,4);
  const blocks=[HEALTH_ADDICTION,...HEALTH_ADDICTION.steps,HEALTH_ADDICTION.support,HEALTH_ADDICTION.setback];
  for(const[index,block]of blocks.entries()){
    assert.ok(block&&typeof block==='object',`Missing craving content block ${index}`);
    for(const key of ['title','text'])assert.ok(typeof block[key]==='string'&&block[key].trim(),`Block ${index}: missing ${key}`);
    assert.ok(Array.isArray(block.sourceIds)&&block.sourceIds.length,`Block ${index}: missing references`);
    assert.equal(new Set(block.sourceIds).size,block.sourceIds.length,`Block ${index}: duplicate references`);
    assert.ok(block.sourceIds.every(id=>sources.has(id)),`Block ${index}: unresolved reference`);
  }
  const mainSources=new Set(HEALTH_ADDICTION.sourceIds);
  assert.ok(HEALTH_ADDICTION.steps.every(step=>step.sourceIds.every(id=>mainSources.has(id))),
    'The main source control must include the references used by the four strategies');
});

test('new craving and recovery sources retain identifiable institutional provenance and review dates',()=>{
  for(const id of ['niaaa-cravings','niaaa-recovery']){
    const source=HEALTH_SOURCES.find(item=>item.id===id);
    assert.ok(source,`Missing ${id}`);
    const hostname=new URL(source.url).hostname;
    assert.ok(hostname==='niaaa.nih.gov'||hostname.endsWith('.niaaa.nih.gov'),`${id}: expected the official NIAAA source`);
    assert.match(source.reviewedOn,/^\d{4}-\d{2}-\d{2}$/,`${id}: review date must be explicit`);
    const date=new Date(source.reviewedOn+'T12:00:00Z');
    assert.ok(Number.isFinite(date.getTime()),`${id}: invalid review date`);
    assert.equal(date.toISOString().slice(0,10),source.reviewedOn,`${id}: impossible review date`);
    assert.ok(source.reviewedOn>='2026-10-27',`${id}: must retain the completed source verification`);
    for(const key of ['population','limits'])assert.ok(source[key]?.trim(),`${id}: missing ${key}`);
  }
});

test('research benefits retain a study context and craving support does not promise a biological reset or fixed deadline',()=>{
  const studyIds=new Set(['gopaldas-2025','manning-2008','brower-2011','pitel-2009','kirpich-2017','mehta-2018']);
  const findings=HEALTH_STAGES.flatMap(stage=>[...stage.physical,...stage.mental]);
  for(const finding of findings.filter(item=>item.sourceIds.some(id=>studyIds.has(id)))){
    assert.match(finding.text,/étude|recherch|patients?|participants?|personnes|consommateurs?/iu,
      `${finding.title}: a result from a study must retain its population or research context`);
  }
  const blocks=[HEALTH_ADDICTION,...HEALTH_ADDICTION.steps,HEALTH_ADDICTION.support,HEALTH_ADDICTION.setback];
  const text=blocks.map(block=>block.title+'. '+block.text).join('\n').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  assert.doesNotMatch(text,/dopamine\s+(?:est\s+|a ete\s+)?reinitialisee|addiction\s+(?:est\s+)?guerie|cerveau\s+(?:est\s+)?repare/,
    'The encouragement block must not invent a biological recovery state');
  assert.doesNotMatch(text,/(?:envies?|craving)[^.!?\n]{0,70}(?:disparai\w*|cess\w*|elimin\w*)[^.!?\n]{0,30}\b(?:en|apres|dans)\s+(?:\d+|dix)\s*(?:min|heure|jour|semaine)/,
    'No fixed duration for the disappearance of cravings is established by these sources');
  assert.doesNotMatch(text,/\b(?:en|apres|dans)\s+(?:\d+|dix)\s*(?:minutes?|heures?|jours?|semaines?)[^.!?\n]{0,50}(?:envies?|craving)[^.!?\n]{0,30}(?:disparai\w*|cess\w*|elimin\w*)/,
    'A scheduled countdown must not become a promise about craving relief');
});

test('all thirty reflection steps are complete and refer to current app destinations',()=>{
  assert.equal(PROGRAM.length,30);
  for(const[item,index]of PROGRAM.map((item,index)=>[item,index])){assert.equal(item.step,index+1);for(const key of ['title','lesson','action','prompt'])assert.ok(item[key]?.trim());}
  assert.doesNotMatch(PROGRAM.map(step=>step.action).join('\n'),/calendrier|dans Moi|taux de jours renseignés/i);
});
