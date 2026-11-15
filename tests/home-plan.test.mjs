import test from 'node:test';
import assert from 'node:assert/strict';
import {membership} from '../billing/core.mjs';
import {renderHomePlan} from '../home-plan.mjs';

const now=Date.parse('2026-11-15T12:00:00Z');
const future=new Date(now+86400000).toISOString();
const past=new Date(now-86400000).toISOString();

test('home plan discovery stays absent for verified paid, trial and test access',()=>{
  for(const billing of [
    {...membership([{status:'active',paid_until:future}],now),ready:true},
    {...membership([{status:'trialing',trial_until:future}],now),ready:true},
    {ready:true,premium:true,test:true,test_until:future},
    {ready:false,premium:true},
  ]){
    assert.equal(renderHomePlan(billing),'');
    assert.equal(renderHomePlan(billing,{demo:true}),'');
  }
});

test('unknown billing status offers verification without making subscription claims',()=>{
  for(const billing of [undefined,null,{}, {ready:false,premium:false},{ready:'true',premium:false}]){
    const html=renderHomePlan(billing);
    assert.match(html,/sz-home-plan--pending/);
    assert.match(html,/statut de ton plan n’a pas encore pu être confirmé/);
    assert.match(html,/href="\/abonnement">Consulter mon plan/);
    assert.doesNotMatch(html,/Gratuit|Avec Premium|Choisir mon plan|aucun abonnement|abonnement actif/i);
  }
});

test('confirmed nonpremium access has a voluntary free versus Premium comparison',()=>{
  for(const billing of [
    {ready:true,premium:false},
    {...membership([{status:'trialing',trial_until:past}],now),ready:true},
    {...membership([{status:'canceled',paid_until:past}],now),ready:true},
  ]){
    const html=renderHomePlan(billing);
    assert.match(html,/L’essentiel est déjà accessible gratuitement/);
    assert.match(html,/>Gratuit<|>Gratuit<\/span>/);
    assert.match(html,/>Avec Premium</);
    assert.match(html,/href="\/abonnement">Choisir mon plan/);
    assert.match(html,/href="\/abonnement">Comparer les options/);
    assert.doesNotMatch(html,/dialog|<form|checkout|stripe|€|essai gratuit|sans paiement/i);
  }
});

test('demo shows a labelled preview and keeps the actual offer navigation',()=>{
  for(const ready of [false,true]){
    const html=renderHomePlan({ready,premium:false},{demo:true});
    assert.match(html,/DÉMONSTRATION · APERÇU DES OFFRES/);
    assert.match(html,/href="\/abonnement"/);
    assert.doesNotMatch(html,/disabled|aria-disabled/);
  }
});

test('untrusted billing data cannot inject content, links or entitlement claims',()=>{
  const payload='"><img src=x onerror=alert(1)><script>alert(1)</script>';
  const baseline=renderHomePlan({ready:true,premium:false});
  const billing=Object.freeze({ready:true,premium:false,plan:payload,status:payload,unit_amount:payload,access_until:payload,test:payload,trial:payload});
  assert.equal(renderHomePlan(billing),baseline);
  assert.doesNotMatch(baseline,/<script|onerror|<img/);
  assert.deepEqual([...baseline.matchAll(/href="([^"]+)"/g)].map(match=>match[1]),['/abonnement','/abonnement']);
  assert.equal(renderHomePlan({ready:true,premium:payload}),baseline,'Only a verified boolean flag suppresses discovery');
  assert.equal(renderHomePlan({ready:payload,premium:false}),renderHomePlan({ready:false,premium:false}));
});
