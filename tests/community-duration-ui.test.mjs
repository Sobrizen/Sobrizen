import test from 'node:test';
import assert from 'node:assert/strict';
import {durationBadge} from '../community-duration-ui.mjs';

test('No badge invents a duration for missing, invalid or out-of-range values',()=>{
  for(const value of [undefined,null,{}, {abstinence_days:null},{abstinence_days:'14'},{abstinence_days:-1},{abstinence_days:0.5},{abstinence_days:Infinity},{abstinence_days:50001}])assert.equal(durationBadge(value),'');
});

test('New tracking badges distinguish under one day, singular days and exact day counts',()=>{
  const under=durationBadge({abstinence_days:0,abstinence_source:'tracking'});
  assert.match(under,/&lt; 1 j/);assert.match(under,/Moins d’un jour sans alcool au moment de la publication/);
  assert.match(under,/Durée reprise du dernier arrêt enregistré dans le suivi/);
  const one=durationBadge({abstinence_days:1,abstinence_source:'tracking'});
  assert.match(one,/1 jour sans alcool/);assert.doesNotMatch(one,/1 jours/);
  const long=durationBadge({abstinence_days:365,abstinence_source:'tracking'});
  assert.match(long,/365 j</);assert.match(long,/365 jours sans alcool/);
});

test('Legacy declared durations remain attributed accurately and never expose tracking dates',()=>{
  const legacy=durationBadge({abstinence_days:14,abstinence_source:null,stopped_at:'PRIVATE',body:'SECRET',author_id:'PRIVATE'});
  assert.match(legacy,/Durée déclarée par l’auteur lors du partage/);
  assert.doesNotMatch(legacy,/PRIVATE|SECRET|repris/);
  const supplied=durationBadge({abstinence_days:14,abstinence_source:'<script>alert(1)</script>'});
  assert.doesNotMatch(supplied,/<script>|alert/);
});

test('Badge remains static and accessible across milestone colors',()=>{
  for(const [days,tone] of [[0,'first'],[6,'first'],[7,'week'],[29,'week'],[30,'month'],[89,'month'],[90,'steady'],[50000,'steady']]){
    const markup=durationBadge({abstinence_days:days,abstinence_source:'tracking'});
    assert.match(markup,new RegExp('community-duration-badge--'+tone));
    assert.match(markup,/role="img" aria-label="[^"<>]+" title="[^"<>]+"/);
    assert.doesNotMatch(markup,/<button|tabindex|aria-live|onclick/);
  }
});
