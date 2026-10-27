/** Run: node tests/ux-dom.test.mjs [--group=demo|without-consent|member|premium|races]. */
import assert from 'node:assert/strict';
import {HEALTH_SOURCES} from '../health-evidence.mjs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {environment,boot,mockService,UID,UID2,$,$$,txt,click,value,submit,key,closeModal,route,settle,setNow,now} from './ux-dom-support.mjs';

const group=process.argv.find(arg=>arg.startsWith('--group='))?.slice(8);
const groups=['demo','without-consent','member','premium','races'];
if(!group){
  let failures=0;
  for(const name of groups){
    const result=spawnSync(process.execPath,[fileURLToPath(import.meta.url),`--group=${name}`],{encoding:'utf8',timeout:120000,env:process.env});
    process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
    const summary=result.stdout?.split('\n').find(line=>line.startsWith(`UX DOM ${name}: `));
    const completed=summary?.match(/: (\d+)\/(\d+) passed; real network disabled$/);
    if(result.error||result.status!==0||!completed||Number(completed[2])<1||completed[1]!==completed[2]){
      failures++;
      console.error(result.error?.message||`UX DOM ${name} did not complete successfully (status ${result.status}).`);
    }
  }
  console.log(`UX DOM GROUPS: ${groups.length-failures}/${groups.length} passed`);process.exitCode=failures?1:0;
}else{
  assert.ok(groups.includes(group),`Unknown group ${group}`);
  const env=await environment({online:group!=='demo',mobile:group==='demo'});
  const mock=group==='demo'?null:await mockService({consent:group!=='without-consent',premium:group==='premium'});
  const results=[];
  async function check(name,fn){try{await fn();results.push({name,ok:true});console.log(`PASS [${group}] ${name}`);}catch(error){results.push({name,ok:false});console.error(`FAIL [${group}] ${name}\n${error.stack}`);env.answer(true);if($('#gaPlay [data-ga="close"]'))await click('#gaPlay [data-ga="close"]').catch(()=>{});$('#modal')?.close();}}
  await boot({mock});
  if(group==='demo')await click('[data-action="demo"]');
  else{assert.equal($('#workspace').hidden,false,txt('#authInfo'));assert.equal($('#loadError').hidden,true,txt('#loadError'));await closeModal();}

  if(group==='demo'){
    await check('all eight app routes have a current navigation state, heading and usable labels',async()=>{
      for(const page of ['home','progress','health','journey','journal','games','community','profile']){
        await route(page);assert.equal(document.body.dataset.page,page);assert.ok($('#content h1'),`Missing heading for ${page}`);assert.equal($(`#nav [data-page="${page}"]`).getAttribute('aria-current'),'page');assert.doesNotMatch(txt('#content'),/\bNaN\b|\bundefined\b|\bInfinity\b/);
      }
      const shortcuts=$$('.ux-bottom-nav [data-ux-action="navigate"]').map(el=>el.dataset.uxValue);assert.deepEqual(shortcuts,['home','progress','health','help','menu']);
      assert.ok($$('#nav button').every(el=>el.getAttribute('aria-label')||el.textContent.trim()));
    });
    await check('mobile menu Escape closes the drawer and restores focus',async()=>{
      const opener=$('[data-action="menu-toggle"]');opener.focus();await click(opener);assert.equal(document.body.classList.contains('menu-open'),true);
      await key(document.activeElement,'Escape');assert.equal(document.body.classList.contains('menu-open'),false);assert.equal(document.activeElement,opener);
    });
    await check('consumption and expenditure disclosures open natively and explain the numbers',async()=>{
      await route('home');assert.equal($$('.tl-simple-metric').length,2);
      for(const details of $$('.tl-simple-metric')){assert.equal(details.tagName,'DETAILS');assert.match(details.textContent,/Comprendre ce chiffre/);await click(details.querySelector('summary'));assert.equal(details.open,true);assert.match(details.querySelector('.tl-simple-explanation').textContent,/estimé|renseign|inconnus/);}
      await click('[data-tl-summary-period="month"]');assert.equal($('[data-tl-summary-period="month"]').getAttribute('aria-pressed'),'true');assert.equal(document.activeElement,$('[data-tl-summary-period="month"]'));
      await route('progress');assert.ok($('.tl-simple-summary'));assert.equal($('.tl-chart'),null,'Detailed chart is Premium');
    });
    await check('program drafts block navigation, then save without changing the chosen step',async()=>{
      await route('journey');await value($('#programForm'),'reflection','Réflexion QA privée');env.answer(false);const before=env.confirms.length;await route('health');assert.equal(document.body.dataset.page,'journey');assert.equal($('#programForm').elements.reflection.value,'Réflexion QA privée');assert.ok(env.confirms.length>before);
      env.answer(true);const step=$('#programForm').elements.step.value;await submit($('#programForm'));assert.equal($('#programForm').elements.step.value,step);assert.equal($('#programForm').elements.reflection.value,'Réflexion QA privée');assert.match(txt('#programForm'),/Mettre à jour/);
    });
    await check('program action links reach the real reflection, support and tracking destinations',async()=>{
      for(const[step,page]of [[2,'profile'],[7,'progress'],[9,'health'],[13,'journal'],[15,'profile'],[26,'community'],[28,'progress']]){await route('journey');await click(`[data-action="step"][data-step="${step}"]`);assert.ok($('.ux-program-link button'));await click('.ux-program-link button');assert.equal(document.body.dataset.page,page);}
      await route('journey');await click('[data-action="step"][data-step="8"]');await click('.ux-program-link button');assert.match(txt('#modalContent'),/soutien|sécurité/i);await closeModal();
      await click('[data-action="step"][data-step="21"]');await click('.ux-program-link button');assert.ok($('#tlOccasionForm'));await closeModal();
    });
    await check('a program action cannot silently discard the reflection draft after a modal save',async()=>{
      await route('journey');await click('[data-action="step"][data-step="21"]');await value($('#programForm'),'reflection','QA réflexion à conserver');env.answer(false);
      try{
        await click('.ux-program-link button');
        if($('#modal').open){const form=$('#tlOccasionForm');await submit(form);await value(form,'units','1');await value(form,'cost','0');await submit(form);await submit(form);assert.equal($('#modal').open,false,txt('[data-tl-error]'));}
        assert.equal($('#programForm').elements.reflection.value,'QA réflexion à conserver','Recording consumption through the step action must not silently lose the unsaved reflection');
      }finally{env.answer(true);}
    });
    await check('journal create, search, edit and delete preserve private text and escape markup',async()=>{
      await route('journal');await click('[data-action="journal-new"]');const form=$('#journalForm');await value(form,'title','Note QA unique');await value(form,'body','Texte privé <img id="qaInjection" src=x>');await submit(form);assert.equal($('#modal').open,false);assert.equal($('#qaInjection'),null);assert.match(txt('#journalList'),/<img id="qaInjection"/);
      const input=$('#journalSearch');input.value='QA unique';input.dispatchEvent(new Event('input',{bubbles:true}));await settle();assert.equal($$('#journalList article').length,1);await click('#journalList [data-action="journal-edit"]');await value($('#journalForm'),'body','Texte QA corrigé');await submit($('#journalForm'));assert.match(txt('#journalList'),/Texte QA corrigé/);
      const article=$$('#journalList article').find(el=>el.textContent.includes('Note QA unique')),remove=article.querySelector('[data-action="journal-delete"]');env.answer(false);await click(remove);assert.ok(article.isConnected);env.answer(true);await click(remove);assert.doesNotMatch(txt('#journalList'),/Note QA unique/);
    });
    await check('health has eleven evidence windows, sourced explanations and a twenty-minute live clock',async()=>{
      await click('[data-action="logout"]');setNow('2026-10-27T12:30:00Z');await click('[data-action="demo"]');await route('health');assert.equal($$('.hz-stage').length,11);assert.equal($$('.hz-metric').length,6);await click('.hz-evidence-footer [data-health-action="sources"]');assert.equal($$('#modal a[href^="https://"]').length,HEALTH_SOURCES.length);assert.match(txt('#modalContent'),/Population|population/);assert.match(txt('#modalContent'),/Limites|limites/);await closeModal();
      await click('.hz-hero [data-health-action="stop-time"]');const form=$('#tlStopTimeForm');await value(form,'started_on','2026-10-27');await value(form,'stopped_time','13:10');await value(form,'confirm_stop_time',true);await submit(form);assert.equal($('#modal').open,false,txt('[data-tl-error]'));assert.equal(txt('[data-health-clock-value]'),'20');setNow('2026-10-27T12:31:00Z');await env.tick();assert.equal(txt('[data-health-clock-value]'),'21');
    });
    await check('health drafts, future rejection and unknown hours never fabricate progress',async()=>{
      await click('.hz-hero [data-health-action="stop-time"]');const form=$('#tlStopTimeForm');await value(form,'stopped_time','23:59');await value(form,'confirm_stop_time',true);await submit(form);assert.equal($('#modal').open,true);assert.match(txt('[data-tl-error]'),/futur/);await closeModal();assert.equal(txt('[data-health-clock-value]'),'21');
      await click('.hz-hero [data-health-action="stop-time"]');await click('[data-tl-action="stop-unknown"]');await value($('#tlStopTimeForm'),'confirm_stop_time',true);await submit($('#tlStopTimeForm'));assert.match(txt('[data-health-clock-unit]'),/heure inconnue/);assert.equal($$('.hz-stage.is-current').length,0);assert.match(txt('.hz-stage-title .tag'),/Pour comprendre/);
    });
    await check('wellbeing radio inputs save, date switching restores drafts, anxiety is inverted',async()=>{
      await click('.hz-hero [data-health-action="checkin"]');let form=$('#healthCheckinForm');assert.equal($$('input[type="radio"]',form).length,30);await value(form,'mood','5');await value(form,'anxiety','1');await value(form,'note','Ressenti QA');await value(form,'checkin_date','2026-10-26');form=$('#healthCheckinForm');assert.notEqual(form.elements.note.value,'Ressenti QA');await value(form,'checkin_date','2026-10-27');form=$('#healthCheckinForm');assert.equal(form.elements.note.value,'Ressenti QA');assert.equal(form.elements.mood.value,'5');await submit(form);assert.equal($('#modal').open,false,txt('#healthFormError'));assert.match(txt('.hz-history'),/Ressenti QA/);await click('[data-health-action="metric"][data-metric="anxiety"]');assert.match(txt('.hz-chart'),/Une baisse correspond à moins d’anxiété/);
    });
    await check('demo community posts survive reload and filters; comments can be removed',async()=>{
      await route('community');await click('[data-action="post-new"]');const form=$('#postForm');await value(form,'body','Publication QA fictive unique');form.querySelector('input[type="checkbox"]').checked=true;await submit(form);assert.equal($('#modal').open,false);await click('[data-action="feed-refresh"]');assert.match(txt('#content .posts'),/Publication QA fictive unique/);
      await click('[data-action="feed-kind"][data-kind="question"]');assert.doesNotMatch(txt('#content .posts'),/Publication QA fictive unique/);await click('[data-action="feed-kind"][data-kind="all"]');
      const article=$$('#content .posts article').find(el=>el.textContent.includes('Publication QA fictive unique'));await click(article.querySelector('[data-action="like"]'));const post=$$('#content .posts article').find(el=>el.textContent.includes('Publication QA fictive unique'));assert.equal(post.querySelector('[data-action="like"]').getAttribute('aria-pressed'),'true');await click(post.querySelector('[data-action="comments"]'));await value($('#commentForm'),'body','Commentaire QA fictif');await submit($('#commentForm'));await click($$('#content .posts article').find(el=>el.textContent.includes('Publication QA fictive unique')).querySelector('[data-action="comments"]'));assert.match(txt('#modalContent'),/Commentaire QA fictif/);await click('[data-action="comment-delete"]');assert.doesNotMatch(txt('#modalContent'),/Commentaire QA fictif/);await closeModal();
    });
    await check('profile saves a demo display name and offers readable text and theme controls',async()=>{
      await route('profile');await value($('#profileForm'),'display_name','Alex QA');await submit($('#profileForm'));assert.equal($('#profileForm').elements.display_name.value,'Alex QA');await click('[data-ux-action="text-size"][data-ux-value="large"]');assert.equal(document.body.classList.contains('ux-large-text'),true);const dark=document.body.classList.contains('dark');await click('[data-action="theme"]');assert.equal(document.body.classList.contains('dark'),!dark);
    });
    await check('free game catalog exposes three games and keeps five Premium gates',async()=>{await route('games');assert.equal($$('#gameZone [data-game]').length,3);assert.equal($$('#gameZone [data-game-upgrade]').length,5);await click('[data-game="ground"]');assert.ok($('#gaPlay'));for(let i=0;i<5;i++)await click('#gaPlay [data-ga="ground"]');assert.equal($('#gaPlay').dataset.state,'result');await click('#gaPlay [data-ga="close"]');assert.equal($('#gaPlay'),null);});
    await check('help and a pause remain available without sending or calling anyone',async()=>{await click('header [data-action="help"]');assert.ok($('#modal a[href="tel:112"]'));assert.match(txt('#modalContent'),/ne traitent pas un sevrage/);await click('[data-action="urge"]');await submit($('#urgeStartForm'));assert.equal(txt('#timer'),'10:00');setNow(now()+60000);await env.tick();assert.equal(txt('#timer'),'09:00');await submit($('#urgeEndForm'));assert.equal($('#modal').open,false);});
  }

  if(group==='without-consent'){
    await check('bootstrap reads consent metadata but never private records or support plans',async()=>{
      const privateTables=['sobriety_journeys','daily_checkins','journal_entries','program_progress','urge_events','reasons','health_checkins','journey_timelines','progress_settings','progress_chapters'];assert.equal(mock.calls.filter(call=>privateTables.includes(call.table)).length,0);assert.ok(mock.calls.filter(call=>call.table==='user_settings').every(call=>call.columns!=='*'&&!call.columns.includes('response_plan')));assert.doesNotMatch(txt('body'),/QA PLAN SENSIBLE|Corps privé QA/);
    });
    await check('tracking routes are gated while public science and games remain accessible',async()=>{for(const page of ['home','progress','journey','journal']){await route(page);assert.ok($('#content [data-action="health-consent"]'));assert.equal($('#programForm'),null);assert.equal($('#journalList'),null);}await route('health');assert.equal($$('.hz-stage').length,11);assert.equal($$('.hz-metric').length,0);assert.equal($('.hz-hero [data-health-action="stop-time"]').disabled,true);await route('games');assert.equal($$('#gameZone [data-game]').length,3);});
    await check('profile and help do not display a plan without consent; forged plan submit does not write',async()=>{
      await route('profile');assert.doesNotMatch(txt('#content'),/QA PLAN SENSIBLE|Contact fictif QA/);const count=mock.calls.filter(call=>call.op!=='select').length,form=$('#settingsForm');if(form){await value(form,'response_plan','Brouillon QA interdit');await submit(form);}assert.equal(mock.calls.filter(call=>call.op!=='select').length,count);await click('header [data-action="help"]');assert.doesNotMatch(txt('#modalContent'),/QA PLAN SENSIBLE|Contact fictif QA/);await closeModal();
    });
    await check('wellbeing cannot be saved without consent even through a direct action',async()=>{await route('health');const before=mock.calls.length;const forged=document.createElement('button');forged.dataset.healthAction='checkin';document.body.append(forged);await click(forged);assert.equal($('#healthCheckinForm'),null);assert.equal(mock.calls.length,before);forged.remove();});
  }

  if(group==='member'){
    await check('active consent loads private data with owner filters and accurate current duration',async()=>{assert.ok(mock.calls.some(call=>call.table==='health_checkins'));assert.ok(mock.calls.some(call=>call.table==='user_settings'&&call.columns==='*'));await route('health');assert.equal(txt('[data-health-clock-value]'),'2');assert.equal(txt('.hz-stage.is-current strong'),'2 jours');assert.equal($$('.hz-chart-point').length,1);});
    await check('a health timer boundary must not navigate away from the movement page',async()=>{
      await route('health');await click('#nav [data-move="open"]');assert.equal(document.body.dataset.page,'movement');const before=now(),page=$('#movement-root'),focused=$('[data-move="level"][data-level="doux"]');focused.focus();
      try{setNow(before+86400000);await env.tick();assert.equal(document.body.dataset.page,'movement');assert.equal($('#movement-root'),page,'Background health clock must not replace the active movement DOM');assert.equal(document.activeElement,focused);}
      finally{setNow(before);await route('health');}
    });
    await check('day-change visibility refresh preserves the active movement view and keyboard focus',async()=>{
      await route('health');await click('#nav [data-move="open"]');const before=now(),page=$('#movement-root'),focused=$('[data-move="level"][data-level="doux"]');focused.focus();
      try{setNow(before+86400000);document.dispatchEvent(new Event('visibilitychange'));await settle();assert.equal($('#movement-root'),page,'Visibility handler must not replace another active view');assert.equal(document.activeElement,focused);}
      finally{setNow(before);await route('health');}
    });
    await check('the three-step alcohol form saves a versioned timeline and invalidates an earlier health clock',async()=>{
      await route('home');await click('[data-tl-action="occasion"]');const form=$('#tlOccasionForm');await submit(form);await value(form,'units','2');await value(form,'cost','5');await submit(form);await submit(form);assert.equal($('#modal').open,false,txt('[data-tl-error]'));
      const call=mock.calls.findLast(call=>call.rpc==='save_journey_timeline');assert.ok(call);assert.equal(call.args.p_expected_revision,1);const saved=mock.tables.journey_timelines[0];assert.equal(saved.revision,2);assert.equal(saved.document.occasions[0].units,2);assert.equal(saved.document.occasions[0].cost,5);await route('health');assert.equal($$('.hz-stage.is-current').length,0);assert.match(txt('.hz-context'),/conserv/);assert.ok($$('.hz-history-row').length>0);
    });
    await check('journal save uses the authenticated owner and returns the saved private record',async()=>{await route('journal');await click('[data-action="journal-new"]');await value($('#journalForm'),'title','Note authentifiée QA');await value($('#journalForm'),'body','Texte sauvegardé QA');await submit($('#journalForm'));assert.equal($('#modal').open,false,txt('#notice'));assert.match(txt('#journalList'),/Note authentifiée QA/);const call=mock.calls.findLast(call=>call.table==='journal_entries'&&call.op==='upsert');assert.equal(call.payload.user_id,UID);});
    await check('health RPC errors preserve drafts; a one-row REST array is accepted on success',async()=>{
      await route('health');await click('.hz-hero [data-health-action="checkin"]');let form=$('#healthCheckinForm');await value(form,'mood','4');await value(form,'note','Brouillon RPC QA');mock.faults.health={code:'PT409',message:'Conflit QA'};await submit(form);assert.equal($('#modal').open,true);assert.equal(form.elements.note.value,'Brouillon RPC QA');assert.ok(!$('#healthFormError').hidden);await submit(form);assert.equal($('#modal').open,false,txt('#healthFormError'));assert.match(txt('.hz-history'),/Brouillon RPC QA/);assert.ok(mock.tables.health_checkins.some(row=>row.note==='Brouillon RPC QA'&&row.user_id===UID));
    });
    await check('plan writes patch only personal fields and do not overwrite consent metadata',async()=>{await route('profile');await value($('#settingsForm'),'response_plan','Plan QA modifié');await submit($('#settingsForm'));const call=mock.calls.findLast(call=>call.table==='user_settings'&&call.op==='upsert');assert.ok(call);assert.equal(call.payload.user_id,UID);assert.equal(call.payload.response_plan,'Plan QA modifié');for(const key of ['health_data_consent_at','health_data_consent_version','health_data_consent_revoked_at'])assert.equal(Object.hasOwn(call.payload,key),false);assert.match(txt('#notice'),/enregistré/i);});
    await check('withdrawal clears health, journal and support data and prevents later writes',async()=>{
      await click('[data-action="health-consent-withdraw"]');assert.equal(mock.tables.user_settings[0].health_data_consent_revoked_at,new Date().toISOString());assert.doesNotMatch(txt('#content'),/Plan QA modifié|Contact fictif QA/);const before=mock.calls.length;await route('health');assert.equal($$('.hz-metric').length,0);await route('journal');assert.equal($('#journalList'),null);assert.equal(mock.calls.length,before);await click('header [data-action="help"]');assert.doesNotMatch(txt('#modalContent'),/Plan QA modifié|Contact fictif QA/);await closeModal();
    });
  }

  if(group==='premium'){
    await check('premium subscription unlocks detailed tracking and all eight games',async()=>{assert.equal(document.documentElement.dataset.premium,'true');await route('progress');assert.ok($('[data-tl-chart-instance]'));await route('games');assert.equal($$('#gameZone [data-game]').length,8);assert.equal($$('#gameZone [data-game-upgrade]').length,0);});
    await check('detailed chart supports keyboard selection and period navigation without writes',async()=>{await route('progress');const writes=mock.calls.filter(call=>call.op&&call.op!=='select'||call.rpc).length,point=$('.tl-chart-point');assert.ok(point);point.focus();const event=await key(point,'End');assert.equal(event.defaultPrevented,true);assert.ok(document.activeElement.matches('.tl-chart-point'));await key(document.activeElement,'Enter');assert.ok($('[data-tl-chart-instance]'));assert.equal(mock.calls.filter(call=>call.op&&call.op!=='select'||call.rpc).length,writes);});
    for(const id of ['snake','blocks','merge','sequence','memory','reaction','taps','ground'])await check(`game ${id}: launch, help, keyboard pause/resume and clean close`,async()=>{
      await route('games');const launch=$(`[data-game="${id}"]`);launch.focus();await click(launch);assert.equal($('#gaPlay')?.dataset.game,id);assert.equal(document.body.style.overflow,'hidden');await env.frames(3,800);await click('#gaPlay [data-ga="help"]');assert.equal($('#gaPlay').classList.contains('ga-paused'),true);await key($('#gaPlay'),'p');assert.equal($('#gaPlay').classList.contains('ga-paused'),false);await key($('#gaPlay'),'p');assert.equal($('#gaPlay').classList.contains('ga-paused'),true);await click('#gaPlay [data-ga="resume"]');if(id==='taps'){await click('#gaPlay [data-ga="target"]');assert.equal(txt('#gaPlay .ga-score'),'19 s');assert.match(txt('#gaPlay .ga-unit'),/1 cibles/);}if(id==='ground'){await click('#gaPlay [data-ga="ground"]');assert.equal(txt('#gaPlay .ga-level'),'2 / 5');}await click('#gaPlay [data-ga="close"]');assert.equal($('#gaPlay'),null);assert.equal(document.body.style.overflow,'');assert.equal(document.activeElement,launch);
    });
    await check('movement can open, switch a Premium level and open the exercise dialog',async()=>{await route('home');if($('#appNav')?.getAttribute('aria-hidden')==='true')await click('[data-action="menu-toggle"]');await click('#nav [data-move="open"]');assert.equal(document.body.dataset.page,'movement');assert.equal($$('.mv-card').length,4);await click('[data-move="level"][data-level="moyen"]');assert.equal($('#mv-tab-moyen').getAttribute('aria-selected'),'true');await click('[data-move="exercise"]');assert.ok($('dialog[open]'));});
  }

  if(group==='races'){
    await check('pending profile write cannot populate the next account after logout',async()=>{
      await route('profile');await value($('#profileForm'),'display_name','ANCIEN COMPTE RETARD QA');const gate=mock.defer(call=>call.table==='profiles'&&call.op==='update');await submit($('#profileForm'));assert.equal(gate.used,true);await mock.signOut();await mock.signIn();gate.release();await settle(30);await closeModal();await route('profile');assert.equal($('#profileForm').elements.display_name.value,'Autre compte QA');assert.equal($('#modal').open,false);assert.doesNotMatch(txt('#content'),/ANCIEN COMPTE RETARD QA/);
    });
    await check('paginated private export stops at an account change and downloads nothing',async()=>{
      await mock.signOut();await mock.signIn({id:UID});await closeModal();await route('profile');const base=mock.tables.daily_checkins[0];mock.tables.daily_checkins=Array.from({length:501},(_,i)=>({...base,id:`qa-check-${i}`,checkin_date:`2025-${String(Math.floor(i/28)%12+1).padStart(2,'0')}-${String(i%28+1).padStart(2,'0')}`}));const gate=mock.defer(call=>call.table==='daily_checkins'&&call.range?.[0]===0);const before=env.downloads.length;await click('[data-action="export"]');assert.equal(gate.used,true);await mock.signOut();await mock.signIn();gate.release();await settle(30);assert.equal(env.downloads.length,before);assert.equal(mock.calls.filter(call=>call.table==='daily_checkins'&&call.range?.[0]===500).length,0);assert.doesNotMatch(txt('#content'),/Corps privé QA|Motivation fictive QA/);
    });
    await check('pending wellbeing RPC cannot show an old account observation after logout',async()=>{
      await mock.signOut();await mock.signIn({id:UID});await closeModal();await route('health');await click('.hz-hero [data-health-action="checkin"]');await value($('#healthCheckinForm'),'mood','5');await value($('#healthCheckinForm'),'note','ANCIEN RESSENTI RETARD QA');const gate=mock.defer(call=>call.rpc==='save_health_checkin');await submit($('#healthCheckinForm'));assert.equal(gate.used,true);await mock.signOut();await mock.signIn();gate.release();await settle(30);await closeModal();await route('health');assert.equal($$('.hz-metric').length,0);assert.doesNotMatch(txt('#content'),/ANCIEN RESSENTI RETARD QA/);assert.equal($('#healthCheckinForm'),null);
    });
  }

  await check('no uncaught JavaScript or unsupported DOM errors occurred',async()=>assert.deepEqual(env.errors,[]));
  console.log(`UX DOM ${group}: ${results.filter(item=>item.ok).length}/${results.length} passed; real network disabled`);
  env.close();process.exitCode=results.some(item=>!item.ok)?1:0;
}
