/**
 * Integration checks for encouraging health feedback. Uses the real application,
 * controller and ergonomics code; only the service, clock and DOM are adapted.
 * Run: node tests/health-encouragement-dom.test.mjs [--group=empty|mixed|craving|motion|without-consent]
 * CSS checks validate the motion opt-out, not browser layout or visual rendering.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {HEALTH_STAGES} from '../health-evidence.mjs';
import {timelineStopBasis} from '../timeline-core.mjs';
import {environment,boot,mockService,UID,$,$$,txt,click,value,submit,closeModal,route,settle,setNow,now} from './ux-dom-support.mjs';

const groups=['empty','mixed','craving','motion','without-consent'];
const group=process.argv.find(arg=>arg.startsWith('--group='))?.slice(8);
const writeCount=mock=>mock.calls.filter(call=>call.rpc||['insert','upsert','update','delete'].includes(call.op)).length;
const stageAt=minutes=>HEALTH_STAGES.find(stage=>stage.fromMinutes===minutes);
const stamp='2026-10-27T10:00:00.000Z';
const id=number=>`99999999-9999-4999-8999-${number.toString(16).padStart(12,'0')}`;

function setObservations(mock,mode){
  mock.tables.daily_checkins=[];
  mock.tables.health_checkins=[];
  if(mode!=='empty'&&mode!=='motion'){
    const dates=['2026-10-16','2026-10-19','2026-10-24','2026-10-27'];
    mock.tables.health_checkins=dates.map((date,index)=>({
      id:id(index+1),user_id:UID,checkin_date:date,
      mood:index<2?2:4,anxiety:index<2?4:2,concentration:index<2?4:2,
      energy:3,sleep_quality:3,physical_comfort:3,
      note:'OBSERVATION PRIVÉE QA ENCOURAGEMENT',created_at:stamp,updated_at:stamp,
    }));
    mock.tables.daily_checkins=dates.map((date,index)=>({
      id:id(index+11),user_id:UID,checkin_date:date,sober_today:true,
      mood:null,energy:null,craving:mode==='craving'?(index<2?4:0):(index<2?0:2),
      note:'BILAN PRIVÉ QA ENCOURAGEMENT',updated_at:stamp,
    }));
  }
  const document=mock.tables.journey_timelines[0].document;
  document.events[0].stop_basis=timelineStopBasis(document,mock.tables.daily_checkins,document.events[0].started_on);
}

if(!group){
  let failed=0,scenarios=0;
  for(const name of groups){
    const result=spawnSync(process.execPath,[fileURLToPath(import.meta.url),`--group=${name}`],{encoding:'utf8',timeout:60000,env:process.env});
    process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
    const completion=result.stdout?.match(new RegExp(`HEALTH ENCOURAGEMENT \\[${name}\\]: (\\d+)/(\\d+) passed`));
    const complete=completion&&Number(completion[1])>0&&completion[1]===completion[2];
    if(result.error||result.status!==0||!complete){
      failed++;
      console.error(result.error?.message||`The ${name} subprocess did not confirm a complete passing run (exit ${result.status}).`);
    }else scenarios+=Number(completion[1]);
  }
  console.log(`HEALTH ENCOURAGEMENT DOM GROUPS: ${groups.length-failed}/${groups.length} passed`);
  console.log(`HEALTH ENCOURAGEMENT CONFIRMED SCENARIOS: ${scenarios}`);
  process.exitCode=failed?1:0;
}else{
  assert.ok(groups.includes(group),`Unknown group: ${group}`);
  const env=await environment({online:true});
  const mock=await mockService({consent:group!=='without-consent'});
  setObservations(mock,group);
  const results=[];
  async function check(name,run){
    try{await run();results.push(true);console.log(`PASS [${group}] ${name}`);}
    catch(error){results.push(false);console.error(`FAIL [${group}] ${name}\n${error.stack}`);await closeModal().catch(()=>{});}
  }
  try{
    await boot({mock});await closeModal();await route('health');

    if(group==='empty'){
      await check('elapsed time alone does not manufacture a health improvement',async()=>{
        assert.ok($('.hz-wins'));
        assert.equal($('.hz-wins').dataset.healthSupportiveState,'beginning');
        assert.equal($$('[data-health-gain]').length,0);
        assert.equal($$('[data-health-difficult]').length,0);
        assert.equal($$('.hz-chart-point').length,0);
        assert.equal($('.hz-craving-observed'),null);
        assert.equal($('.hz-page [role="progressbar"]'),null);
        assert.match(txt('.hz-wins'),/premier ressenti|point de départ/i);
        assert.doesNotMatch(txt('.hz-wins'),/humeur plus favorable|moins d’anxiété|concentration en hausse|envies moins fortes/i);
        const before=writeCount(mock);
        await click('.hz-wins [data-health-action="checkin"]');
        assert.equal($$('#healthCheckinForm input[type="radio"]:checked').length,0);
        await closeModal();assert.equal(writeCount(mock),before);
      });
      await check('public addiction information links to its sources and usable support actions',async()=>{
        assert.ok($('.hz-addiction'));
        assert.ok($('.hz-addiction [data-action="urge"]'));
        const before=writeCount(mock);
        await click('.hz-addiction [data-health-action="sources"]');
        assert.ok($$('#modal a[href^="https://"]').length>0);
        assert.match(txt('#modalContent'),/Population|population/);
        assert.match(txt('#modalContent'),/Limites|limites/);
        await closeModal();
        await click('.hz-addiction [data-action="help"]');
        assert.ok($('#modal a[href="tel:112"]'));await closeModal();
        assert.equal(writeCount(mock),before);
      });
      await check('acknowledgement waits for confirmed saving and a first note is not a trend',async()=>{
        await click('.hz-hero [data-health-action="checkin"]');
        const form=$('#healthCheckinForm');await value(form,'mood','2');
        mock.faults.health={code:'PT409',message:'Conflit fictif QA'};
        await submit(form);
        assert.equal($('#modal').open,true);
        assert.equal($('.hz-save-feedback'),null);
        assert.equal(form.elements.mood.value,'2');
        await submit(form);
        assert.equal($('#modal').open,false,txt('#healthFormError'));
        assert.ok($('.hz-save-feedback'));
        assert.equal($$('[data-health-gain]').length,0);
        assert.equal($$('.hz-chart-point').length,1);
      });
    }

    if(group==='mixed'||group==='craving'){
      await check('reported improvements keep their measured values and difficulties remain visible',async()=>{
        assert.equal($('.hz-wins').dataset.healthSupportiveState,'mixed');
        const gains=$$('[data-health-gain]').map(node=>node.dataset.healthGain);
        assert.deepEqual(gains,group==='craving'?['mood','anxiety','craving']:['mood','anxiety']);
        const mood=$('[data-health-gain="mood"]'),anxiety=$('[data-health-gain="anxiety"]');
        assert.equal(txt('.hz-win-values>span:first-child',mood),'2');
        assert.equal(txt('.hz-win-values>b',mood),'4/5');
        assert.equal(txt('.hz-win-values>span:first-child',anxiety),'4');
        assert.equal(txt('.hz-win-values>b',anxiety),'2/5');
        assert.match(mood.textContent,/2 notes puis 2 notes/);
        assert.match(txt('[data-health-difficult]'),/concentration/);
        if(group==='mixed')assert.match(txt('[data-health-difficult]'),/envie d’alcool/);
        assert.ok($('.hz-metric[data-metric="concentration"] .hz-trend-worse'));
        assert.match(txt('.hz-gains-explanation'),/au moins 2 notes/);
        assert.match(txt('.hz-gains-explanation'),/jours sans note restent vides/);
      });
      await check('a gain opens the corresponding observations with keyboard focus on the chart',async()=>{
        const before=writeCount(mock);
        for(const metric of ['mood','anxiety']){
          await click(`[data-health-gain="${metric}"]`);
          assert.equal($(`.hz-metric[data-metric="${metric}"]`).getAttribute('aria-pressed'),'true');
          assert.equal(document.activeElement,$('#hz-chart-heading'),'Focus must reach the selected chart heading');
          assert.match(txt('.hz-chart h3'),metric==='mood'?/Humeur/:/Anxiété/);
          assert.equal($$('.hz-chart-point').length,4,'Only four real observations belong in the chart');
        }
        assert.equal(writeCount(mock),before);
      });
      if(group==='craving')await check('zero craving is a real value and its gain links to the separate ten-point report',async()=>{
        const craving=$('[data-health-gain="craving"]');
        assert.equal(craving.tagName,'A');
        assert.equal(craving.getAttribute('href'),'#hz-addiction');
        assert.equal(craving.hasAttribute('data-health-action'),false);
        assert.equal(txt('.hz-win-values>b',craving),'0/10');
        assert.match(txt('.hz-craving-observed'),/4 → 0 \/ 10/);
        assert.equal($$('.hz-metric').length,6,'A craving comparison must not become a fabricated health metric');
      });
      if(group==='mixed')await check('revoking consent also removes the new personal summary and craving report',async()=>{
        await route('profile');await click('[data-action="health-consent-withdraw"]');await route('health');
        assert.equal($('.hz-wins'),null);
        assert.equal($('.hz-craving-observed'),null);
        assert.equal($$('[data-health-gain]').length,0);
        assert.doesNotMatch(txt('#content'),/OBSERVATION PRIVÉE QA|BILAN PRIVÉ QA/);
        assert.ok($('.hz-addiction [data-action="help"]'));
      });
    }

    if(group==='motion'){
      await check('the current declared milestone animates once and a minute tick preserves the DOM and focus',async()=>{
        const hero=$('[data-health-celebration]');
        assert.equal(hero.dataset.healthMilestone,stageAt(2880).id);
        assert.equal(hero.dataset.healthNewMilestone,'true');
        assert.equal(hero.classList.contains('hz-celebrate'),true);
        for(const svg of $$('svg',hero)){assert.equal(svg.getAttribute('aria-hidden'),'true');assert.equal(svg.getAttribute('focusable'),'false');}
        assert.equal(hero.querySelector('[aria-live]'),null);
        const focus=$('.hz-metric[data-metric="mood"]');focus.focus();$('.hz-history').open=true;
        setNow(now()+60000);await env.tick();
        assert.equal($('[data-health-celebration]'),hero);
        assert.equal(document.activeElement,focus);
        assert.equal($('.hz-history').open,true);
        assert.match(txt('[data-health-clock-detail]'),/1 min/);
      });
      await check('ordinary rerenders and return navigation do not replay the same milestone',async()=>{
        await click('[data-health-action="window"][data-window="90"]');
        assert.equal($('[data-health-celebration]').dataset.healthNewMilestone,'false');
        assert.equal($('.hz-hero').classList.contains('hz-celebrate'),false);
        await route('home');await route('health');
        assert.equal($('[data-health-celebration]').dataset.healthNewMilestone,'false');
        assert.equal($('.hz-hero').classList.contains('hz-celebrate'),false);
      });
      await check('exploring a future stage never awards that milestone; replay is local and keeps focus',async()=>{
        const index=HEALTH_STAGES.length-1,before=writeCount(mock);
        await click(`[data-health-action="stage"][data-index="${index}"]`);
        assert.equal($('.hz-stage.selected').dataset.index,String(index));
        assert.match(txt('.hz-stage-title .tag'),/Pour la suite de ton arrêt/);
        assert.equal($('[data-health-celebration]').dataset.healthMilestone,stageAt(2880).id);
        assert.equal($('[data-health-celebration]').dataset.healthNewMilestone,'false');
        assert.equal($('.hz-hero').classList.contains('hz-celebrate'),false);
        const replay=$('[data-health-action="celebrate"]');replay.focus();await click(replay);
        assert.equal($('.hz-hero').classList.contains('hz-celebrate'),true);
        assert.equal(document.activeElement,replay);
        assert.equal($('[data-health-celebration]').dataset.healthMilestone,stageAt(2880).id);
        assert.equal(writeCount(mock),before);
      });
      await check('a real new milestone preserves the active control, open disclosures and explored stage',async()=>{
        const index=HEALTH_STAGES.length-1;
        const focus=$('.hz-metric[data-metric="mood"]');focus.focus();$('.hz-history').open=true;
        $('#hz-addiction-support').open=true;
        setNow('2026-10-28T12:30:00Z');await env.tick();
        const hero=$('[data-health-celebration]');
        assert.equal(hero.dataset.healthMilestone,stageAt(4320).id);
        assert.equal(hero.dataset.healthNewMilestone,'true');
        assert.equal(hero.classList.contains('hz-celebrate'),true);
        assert.equal(document.activeElement,$('.hz-metric[data-metric="mood"]'));
        assert.equal($('.hz-history').open,true);
        assert.equal($('#hz-addiction-support').open,true);
        assert.equal($('.hz-stage.selected').dataset.index,String(index));
        assert.match(txt('.hz-stage-title .tag'),/Pour la suite de ton arrêt/);
        await click('[data-health-action="window"][data-window="30"]');
        assert.equal($('[data-health-celebration]').dataset.healthNewMilestone,'false');
        assert.equal($('.hz-hero').classList.contains('hz-celebrate'),false);
      });
      await check('every animated hero element has an explicit reduced-motion opt-out and no loop',async()=>{
        await click('[data-health-action="celebrate"]');
        const style=document.createElement('style');
        style.textContent=await readFile(new URL('../health.css',import.meta.url),'utf8');
        document.head.append(style);
        try{
          const normal=[],reduced=[];
          const collect=(rules,inReduced=false)=>{
            for(const rule of rules){
              if(rule.type===4)collect(rule.cssRules,inReduced||/prefers-reduced-motion\s*:\s*reduce/.test(rule.conditionText));
              else if(rule.type===1){
                const animation=rule.style.getPropertyValue('animation')||rule.style.getPropertyValue('animation-name');
                if(animation)(inReduced?reduced:normal).push({selector:rule.selectorText,animation,priority:rule.style.getPropertyPriority('animation')||rule.style.getPropertyPriority('animation-name')});
              }
            }
          };
          collect(style.sheet.cssRules);
          const hero=$('.hz-hero');
          const animated=[hero,...$$('*',hero)].flatMap(node=>normal.filter(rule=>node.matches(rule.selector)&&rule.animation!=='none').map(rule=>({node,rule})));
          assert.ok(animated.length>0,'The claimed celebration must have an animation rule');
          for(const {node,rule}of animated){
            assert.doesNotMatch(rule.animation,/\binfinite\b/,'The encouragement must not loop');
            assert.ok(reduced.some(stop=>node.matches(stop.selector)&&stop.animation==='none'&&stop.priority==='important'),`Missing reduced-motion opt-out for ${rule.selector}`);
          }
        }finally{style.remove();}
      });
    }

    if(group==='without-consent'){
      await check('public encouragement never exposes observations or personal milestones without consent',async()=>{
        assert.equal($('.hz-wins'),null);assert.equal($('.hz-craving-observed'),null);
        assert.equal($$('[data-health-gain]').length,0);assert.equal($$('.hz-metric').length,0);
        assert.equal($$('[data-health-action="celebrate"]').length,0);
        assert.equal($('[data-health-celebration]').dataset.healthNewMilestone,'false');
        assert.equal($('[data-health-celebration]').dataset.healthMilestone,'');
        assert.doesNotMatch(txt('#content'),/OBSERVATION PRIVÉE QA|BILAN PRIVÉ QA/);
        assert.equal(mock.calls.filter(call=>['health_checkins','daily_checkins','urge_events','journey_timelines'].includes(call.table)).length,0);
        assert.ok($('.hz-addiction'));
      });
      await check('support and an unrecorded pause stay usable without private reads or writes',async()=>{
        const calls=mock.calls.length,before=writeCount(mock);
        await click('.hz-addiction [data-action="help"]');
        assert.doesNotMatch(txt('#modalContent'),/QA PLAN SENSIBLE|Contact fictif QA/);await closeModal();
        await click('.hz-addiction [data-action="urge"]');assert.ok($('#urgeStartForm'));
        await submit($('#urgeStartForm'));assert.equal(txt('#timer'),'10:00');await closeModal();
        assert.equal(mock.calls.length,calls);assert.equal(writeCount(mock),before);
      });
    }
    await settle();
    await check('the exercised application paths report no unexpected runtime errors',async()=>assert.deepEqual(env.errors,[]));
  }finally{env.close();}
  const failed=results.filter(result=>!result).length;
  console.log(`HEALTH ENCOURAGEMENT [${group}]: ${results.length-failed}/${results.length} passed`);
  process.exitCode=failed?1:0;
}
