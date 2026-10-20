import {dayKey, parseDay, moveDay, dayDiff, dateLabel, esc} from './core.mjs';
import {validateTimelineDocument, timelineSnapshot} from './timeline-core.mjs';
import {createTimelineChart} from './timeline-chart.mjs';

const MODES={abstain:'Arrêter',reduce:'Réduire',observe:'Observer'};
const TRIGGERS=['Stress','Fatigue','Habitude','Ennui','Solitude','Soirées','Repas','Émotions'];
const nf=new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2});
const cf=new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:2});
const number=value=>Number.isFinite(value)?nf.format(value):'—';
const euros=value=>Number.isFinite(value)?cf.format(value):'—';
const clone=value=>JSON.parse(JSON.stringify(value));
const checked=value=>value?' checked':'';
const button=(action,text,extra='',className='secondary')=>`<button type="button" class="${className}" data-tl-action="${action}" ${extra}>${text}</button>`;
const field=(name,label,value='',extra='')=>`<label>${label}<input name="${name}" value="${esc(value??'')}" ${extra}></label>`;
const errorBox=()=>'<p class="tl-error" data-tl-error role="alert" hidden></p>';
const validNumber=value=>value!==''&&value!==null&&value!==undefined&&Number.isFinite(Number(value))?Number(value):'';
function monthsBefore(date,months){const d=parseDay(date),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()-months);d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));return dayKey(d);}
function safeDate(value,fallback){try{const raw=String(value||'').trim();let s=raw;if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)){const instant=new Date(raw);if(!Number.isFinite(instant.getTime()))return fallback;s=dayKey(instant);}parseDay(s);return s>='1900-01-01'?s:fallback;}catch{return fallback;}}
function duration(n){return `${number(n)} jour${n===1?'':'s'}`;}

/** All writes go through one versioned save; the displayed goal never follows a consumption event. */
export function createTimelineUI(api){
 let forms=new WeakMap(),generation=0;
 const $=selector=>document.querySelector(selector);
 const get=()=>api.data();
 const today=()=>get().today||dayKey();
 const chart=createTimelineChart({data:()=>({document:get().document,checks:get().checks||[],today:today()}),render:()=>api.render(),openConsumption:date=>openOccasion(date),openOccasion:date=>openOccasion(date),openRange:id=>openRange(id),openChange:date=>openChange(date),download:(...args)=>api.download(...args)});
 const snap=()=>timelineSnapshot(get().document,get().checks||[],today());
 const currentDoc=()=>get().document;
 function reset(){generation++;forms=new WeakMap();chart.reset();}
 function assertReady(){if(!get().ready)throw Error('Le suivi n’est pas encore chargé. Réessaie dans un instant.');}
 function readyView(){return '<section class="card tl-loading" role="status"><h2>Chargement de ton suivi…</h2><p>Tes repères apparaîtront ici.</p></section>';}
 function welcome(){return `<div class="greeting tl-heading"><h1>Ton point de départ</h1><p>Quelques repères pour voir tes progrès.</p></div><section class="card tl-welcome"><span class="tl-welcome-mark" aria-hidden="true">↗</span><h2>Tu as déjà commencé ?<br>Ton parcours compte déjà.</h2><p>Indique ta situation et sa date de début.</p><div class="tl-welcome-points"><span>Une date</span><span>Ton rythme</span><span>Tes économies</span></div>${button('setup','Configurer mon suivi','','primary full')}<p class="tl-caption">Pas de bilan quotidien obligatoire.</p></section>`;}
 function home(){
  if(!get().ready)return readyView();
  if(!currentDoc())return welcome();
  const d=currentDoc(),s=snap(),c=s.current,sober=c.state==='abstinent',actual=['occasion','legacy'].includes(c.source),saved=s.summary?.saved;
  const currentDate=sober?(s.currentStreakStartedOn||today()):actual?today():c.started_on;
  const heroValue=sober?s.currentStreak:actual?s.todayActual?.alcohol_units:c.units_week;
  return `<div class="greeting tl-heading"><div><h1>Un pas après l’autre.</h1><p>Mon objectif : ${esc(MODES[d.goal.mode])}</p></div>${button('settings','Mes repères','','text')}</div>
   <div class="tl-home-grid"><section class="card tl-hero"><div class="tl-hero-top"><span class="tag">${sober?'Mon arrêt en cours':actual?'Ma consommation aujourd’hui':'Mon rythme actuel'}</span>${button('date','Corriger les dates','','tl-hero-edit')}</div>
   <div class="tl-hero-value">${number(heroValue)}<span>${sober?'jour'+(s.currentStreak===1?'':'s'):actual?'verre'+(heroValue===1?'':'s')+' déclaré'+(heroValue===1?'':'s'):'verres / semaine'}</span></div>
   <p class="tl-hero-label">${sober?'sans alcool, jours complets':actual?euros(s.todayActual?.alcohol_cost_eur)+' dépensés aujourd’hui':'moyenne estimée pour cette période'}</p>
   <div class="tl-hero-date"><span>${sober?'Sans alcool depuis le':actual?'Consommation déclarée le':'Rythme déclaré depuis le'}</span><b>${dateLabel(currentDate)}</b></div>
   <p class="tl-caption">${sober&&s.lastConsumptionOn?'Dernière consommation : '+dateLabel(s.lastConsumptionOn)+'.':sober?'Un jour à la fois.':c.range?'Période renseignée jusqu’au '+dateLabel(c.range.ended_on)+'.':'Tu peux ajouter une consommation passée.'}</p>
   </section><section class="card tl-earned"><h2>Ce que tu as parcouru</h2><div class="tl-earned-grid"><div><strong>${number(s.totalSoberDays)}</strong><span>jours sans alcool cumulés</span></div><div><strong>${number(s.bestStreak)}</strong><span>jours pour ton meilleur arrêt</span></div></div><div class="tl-money ${saved<0?'tl-negative':''}"><strong>${euros(saved<0?-saved:saved)}</strong><span>${saved<0?'de dépenses supplémentaires estimées':'d’économies estimées'}</span></div>${button('progress','Voir mes courbes →','','secondary full')}</section></div>
   <div class="tl-actions">${button('occasion','<span aria-hidden="true">＋</span><b>Ajouter une consommation</b><small>Un jour ou du… au…</small>','','tl-action-card tl-action-primary')}${button('change','<span aria-hidden="true">↔</span><b>Arrêt ou reprise</b><small>Actualiser mon rythme</small>','','tl-action-card')}${button('history','<span aria-hidden="true">↗</span><b>Mon historique</b><small>Dates et corrections</small>','','tl-action-card')}</div>
   <div class="tl-home-bottom"><p class="tl-caption">Une date passée ? Tout ton suivi se recalcule.</p><div class="row">${button('help','Besoin de soutien ?','','text')}${button('games','Faire une pause','','text')}</div></div>
   ${d.goal.why?`<section class="card tl-why"><span class="eyebrow">MON POURQUOI</span><p>${esc(d.goal.why)}</p></section>`:''}`;
 }
 function view(){if(!get().ready)return readyView();if(!currentDoc())return welcome();return `<div class="greeting tl-heading"><div><h1>Mes progrès</h1><p>Mon objectif : ${esc(MODES[currentDoc().goal.mode])}</p></div>${button('occasion','+ Consommation','','primary')}</div>${chart.view()}${history(true)}`;}
 function journey(){if(!get().ready)return readyView();if(!currentDoc())return welcome();return `<div class="greeting tl-heading"><div><h1>Mon parcours</h1><p>Mes arrêts, mes reprises et mes progrès.</p></div>${button('occasion','+ Consommation','','primary')}</div>${achievements()}${history(false)}`;}
 function achievements(){const s=snap();return `<section class="card tl-achievements"><h2>Mes acquis</h2><div class="tl-achievement-grid"><div><strong>${number(s.totalSoberDays)}</strong><span>jours sans alcool cumulés</span></div><div><strong>${number(s.bestStreak)}</strong><span>jours pour mon meilleur arrêt</span></div><div><strong>${number(api.programCount?.()||0)}</strong><span>étapes personnelles terminées</span></div></div><p class="tl-caption">Une consommation n’efface pas les jours déjà parcourus.</p></section>`;}
 function history(collapsed=false){
  const d=currentDoc(),s=snap(),events=[...d.events].sort((a,b)=>a.started_on.localeCompare(b.started_on));
  const declarations=[...events.map((event,i)=>({...event,kind:'event',sort:event.started_on,end:i+1<events.length?moveDay(events[i+1].started_on,-1):null})),...(d.ranges||[]).map(range=>({...range,kind:'range',sort:range.started_on,end:range.ended_on})),...d.occasions.map(o=>({...o,kind:'occasion',sort:o.date,end:o.date,state:'drinking'}))].sort((a,b)=>b.sort.localeCompare(a.sort)||a.kind.localeCompare(b.kind));
  const rows=declarations.map(row=>{
   const occasion=row.kind==='occasion',range=row.kind==='range',sober=row.state==='abstinent';
   const label=occasion?'Consommation ponctuelle':range?(sober?'Période sans alcool':'Période de consommation'):(sober?'Arrêt déclaré':'Rythme déclaré');
   const dates=occasion?dateLabel(row.date):range?`Du ${dateLabel(row.started_on)} au ${dateLabel(row.end)}`:`À partir du ${dateLabel(row.started_on)}`;
   const detail=occasion?`${number(row.units)} verres · ${euros(row.cost)}`:`${number(row.units_week)} verres / semaine · ${euros(row.cost_week)} / semaine · estimés`;
   const edits=occasion?button('edit-occasion','Modifier',`data-tl-date="${row.date}"`,'text'):button(range?'edit-range':'edit-event','Modifier',`data-tl-id="${esc(row.id)}"`,'text');
   return `<li class="tl-history-event"><span class="tl-history-dot ${sober?'is-abstinent':''}" aria-hidden="true"></span><div><div class="tl-history-top"><span class="tag">${label}</span>${range?`<small>${duration(dayDiff(row.end,row.started_on)+1)}</small>`:''}</div><h3>${dates}</h3>${row.kind==='event'?`<p>${row.end?'Repère jusqu’au '+dateLabel(row.end):'Repère actuel'} · précisé par les consommations ajoutées</p>`:''}<span class="tl-caption">${detail}</span>${row.note?`<p class="tl-event-note">${esc(row.note)}</p>`:''}</div>${edits}</li>`;
  }).join('');
  const stops=(s.bestPeriods||[]).slice(0,6).map(p=>`<li><strong>${duration(p.days)}</strong><span>${dateLabel(p.start)}${p.end?' → '+dateLabel(p.end):''}${p.ongoing?' · en cours':''}</span></li>`).join('');
  const body=`<details class="tl-details tl-records" ${collapsed?'':'open'}><summary>Mes plus longs arrêts <span>${s.bestPeriods?.length||0}</span></summary>${stops?`<ul class="tl-stop-list">${stops}</ul>`:'<p class="tl-caption">Ton premier jour complet apparaîtra ici.</p>'}</details><div class="tl-section-heading tl-history-heading"><h3>Mes déclarations</h3>${button('occasion','+ Ajouter','','text')}</div><p class="tl-caption">Même une date ancienne met à jour les compteurs et les courbes.</p><ol class="tl-history-list">${rows}</ol><div class="tl-history-tools">${button('occasion','Ajouter une consommation','','primary')}${button('change','Déclarer un arrêt ou une reprise','','secondary')}</div>`;
  return collapsed?`<details class="card tl-history tl-details tl-section"><summary>Mon historique <span>${declarations.length} repère${declarations.length===1?'':'s'}</span></summary>${body}</details>`:`<section class="card tl-history tl-section"><div class="tl-section-heading"><h2>Mes dates et mes progrès</h2>${button('settings','Mon objectif','','text')}</div>${body}</section>`;
 }
 function settingsSummary(){if(!get().ready)return readyView();if(!currentDoc())return `<section class="tl-settings-summary"><p>Ajoute ta date et tes premiers repères.</p>${button('setup','Configurer mon suivi','','primary')}</section>`;const d=currentDoc(),s=snap(),sober=s.current.state==='abstinent',actual=['occasion','legacy'].includes(s.current.source);return `<section class="tl-settings-summary"><div><span class="tl-caption">Mon objectif</span><b>${esc(MODES[d.goal.mode])}</b></div><div><span class="tl-caption">${sober?'Sans alcool depuis le':actual?'Consommation déclarée le':'Rythme actuel depuis le'}</span><b>${dateLabel(sober?(s.currentStreakStartedOn||today()):actual?today():s.current.started_on)}</b></div><div class="row">${button('settings','Objectif et préférences','','secondary')}${button('history','Mon historique','','text')}</div></section>`;}

 function dateFields(value,{min='1900-01-01',max=today(),shortcuts=true}={}){return `<fieldset class="tl-fieldset"><legend>Depuis quand ?</legend>${shortcuts?`<div class="tl-shortcuts" aria-label="Dates rapides">${[[0,'Aujourd’hui'],[7,'7 jours'],[14,'14 jours'],['month','1 mois']].map(([n,t])=>{const date=n==='month'?monthsBefore(today(),1):moveDay(today(),-n);return button('date-shortcut',t,`data-tl-date="${date}" ${date<min||date>max?'disabled':''}`,'tl-chip');}).join('')}</div>`:''}${field('started_on','Date de début',value,`type="date" required min="${min}" max="${max}" data-tl-change="date"`)}<p class="tl-caption tl-date-preview" data-tl-date-preview aria-live="polite"></p></fieldset>`;}
 function stateFields(state,units='',cost=0){
  const soberCost=state==='abstinent'?cost:0;
  return `<fieldset class="tl-fieldset"><legend>Ma situation</legend><div class="tl-choices tl-choices-two">${[['abstinent','Sans alcool'],['drinking','Je consomme']].map(([value,label])=>`<label class="tl-choice"><input type="radio" name="state" value="${value}" required data-tl-change="state"${checked(state===value)}><span>${label}</span></label>`).join('')}</div><div data-tl-abstinent hidden><div class="tl-zero"><div><strong>0</strong><span>verre / semaine</span></div><div><strong data-tl-zero-cost>${euros(validNumber(soberCost)||0)}</strong><span>d’alcool / semaine</span></div></div><details class="tl-details tl-budget-detail" ${soberCost>0?'open':''}><summary>J’ai encore des achats d’alcool</summary>${field('abstinent_cost_week','Budget alcool estimé / semaine (€)',soberCost,'type="number" min="0" max="7000000" step="0.01" inputmode="decimal" data-tl-change="sober-cost"')}</details></div><div data-tl-drinking hidden><div class="two-fields">${field('current_units_week','Verres standard / semaine',state==='drinking'?units:'','type="number" min="0.01" max="7000" step="0.01" inputmode="decimal" placeholder="Ex. 10"')}${field('current_cost_week','Budget alcool / semaine (€)',state==='drinking'?cost:'','type="number" min="0" max="7000000" step="0.01" inputmode="decimal" placeholder="Ex. 30"')}</div><p class="tl-caption">Une moyenne estimée. Pour 0 verre, choisis « Sans alcool ».</p></div></fieldset>`;
 }
 function baselineFields(baseline){return `<fieldset class="tl-fieldset tl-baseline"><legend>Mes anciens repères</legend><p class="tl-caption">Avant mon changement, en moyenne :</p><div class="two-fields">${field('baseline_units_week','Verres standard / semaine',baseline.units_week,'type="number" required min="0" max="7000" step="0.01" inputmode="decimal" placeholder="Ex. 20"')}${field('baseline_cost_week','Budget alcool / semaine (€)',baseline.cost_week,'type="number" required min="0" max="7000000" step="0.01" inputmode="decimal" placeholder="Ex. 60"')}</div>${field('baseline_started_on','Ces habitudes étaient valables depuis le',baseline.started_on,`type="date" required min="1900-01-01" max="${today()}"`)}<p class="tl-caption">Ces estimations servent de comparaison à partir de cette date.</p></fieldset>`;}
 function goalChoices(goal){return `<fieldset class="tl-fieldset"><legend>Mon objectif</legend><div class="tl-choices tl-choices-three">${Object.entries(MODES).map(([value,label])=>`<label class="tl-choice"><input type="radio" name="goal_mode" value="${value}" required data-tl-change="goal"${checked(goal.mode===value)}><span>${label}</span></label>`).join('')}</div><div data-tl-goal-confirm hidden><label class="checklabel tl-confirm"><input type="checkbox" name="confirm_goal_change"> Je choisis de modifier mon objectif d’arrêt.</label></div></fieldset>`;}
 function optionalGoalFields(goal){
  const triggers=[...new Set([...TRIGGERS,...(goal.triggers||[])])];
  return `<details class="tl-details tl-preferences"><summary>Objectifs et préférences <span>facultatif</span></summary><label>Mon pourquoi<textarea name="why" rows="2" maxlength="1000" placeholder="Ce que je veux retrouver…">${esc(goal.why||'')}</textarea></label><label>Mon prochain pas<textarea name="planned_action" rows="2" maxlength="500" placeholder="Une petite action qui me convient…">${esc(goal.planned_action||'')}</textarea></label><fieldset class="tl-fieldset"><legend>Mes situations à anticiper</legend><div class="tl-trigger-choices">${triggers.map(t=>`<label class="tl-trigger"><input type="checkbox" name="triggers" value="${esc(t)}"${checked((goal.triggers||[]).includes(t))}><span>${esc(t)}</span></label>`).join('')}</div></fieldset>${field('target_on','Date de mon objectif personnel',goal.target_on||'','type="date" min="1900-01-01" max="2100-12-31"')}<label class="checklabel tl-confirm"><input type="checkbox" name="support_first" data-tl-change="goal"${checked(goal.support_first)}> Je privilégie un accompagnement professionnel.</label><div data-tl-limits hidden><p class="tl-caption">Mes limites personnelles, sans quantité à atteindre.</p><div class="two-fields">${field('weekly_limit','Maximum / semaine (verres)',goal.weekly_limit??'','type="number" min="0" max="7000" step="0.01" inputmode="decimal" placeholder="Facultatif"')}${field('daily_limit','Maximum / jour (verres)',goal.daily_limit??'','type="number" min="0" max="1000" step="0.01" inputmode="decimal" placeholder="Facultatif"')}</div></div></details>`;
 }
 function supportNote(){return '<p class="tl-safety">En cas de symptômes de manque, demande une aide médicale. Si tu as bu, ne conduis pas.</p>';}
 function attach(formId,doc,extra={}){const f=$('#'+formId);if(!f)return;forms.set(f,{doc:doc?clone(doc):null,versions:clone(api.versions()),generation,newId:crypto.randomUUID(),before:doc?timelineSnapshot(doc,get().checks||[],today()):null,...extra});syncForm(f);}
 function seedGoal(){const chapters=get().chapters||[],last=[...chapters].sort((a,b)=>String(a.effective_on||'').localeCompare(String(b.effective_on||''))).at(-1)||{};return {mode:MODES[last.mode]?last.mode:'abstain',weekly_limit:last.weekly_limit??null,daily_limit:last.daily_limit??null,target_on:null,why:get().journey?.why_text||'',triggers:[],support_first:!!last.support_first,planned_action:last.planned_action||''};}
 function openSetup(){
  assertReady();if(currentDoc())return openSettings();const data=get(),goal=seedGoal(),baseline={started_on:monthsBefore(today(),12),units_week:validNumber(data.settings?.baseline_units_week),cost_week:validNumber(data.settings?.baseline_cost_week??data.journey?.weekly_spend_estimate)};
  const initialDate=safeDate(data.journey?.started_at,today());
  api.modal('Mon point de départ',`<form id="tlStartForm" class="tl-form" data-tl-form="start">${goalChoices(goal)}${stateFields('',null,0)}${dateFields(initialDate>today()?today():initialDate)}${baselineFields(baseline)}${optionalGoalFields(goal)}<label class="checklabel tl-confirm"><input type="checkbox" name="confirm_periods" required> Je confirme ces dates et ces estimations hebdomadaires.</label><p class="tl-caption">1 verre standard = 10 g d’alcool pur.</p>${errorBox()}<button type="submit" class="primary full">Commencer mon suivi</button>${supportNote()}</form>`);
  attach('tlStartForm',null,{originalMode:data.chapters?.length?goal.mode:null});
 }
 function openSettings(){
  assertReady();if(!currentDoc())return openSetup();const d=currentDoc();
  api.modal('Mes objectifs et repères',`<form id="tlSettingsForm" class="tl-form" data-tl-form="settings">${goalChoices(d.goal)}${optionalGoalFields(d.goal)}<details class="tl-details"><summary>Mes anciens repères</summary>${baselineFields(d.baseline)}<p class="tl-caption">Une correction recalcule les comparaisons de tout mon parcours.</p></details><label class="checklabel tl-confirm"><input type="checkbox" name="confirm_periods" required> Je confirme mes repères et leurs estimations.</label>${errorBox()}<button type="submit" class="primary full">Enregistrer mes choix</button><div class="tl-modal-links">${button('date','Modifier la date actuelle','','text')}${button('history','Voir mon historique','','text')}</div>${supportNote()}</form>`);
  attach('tlSettingsForm',d,{originalMode:d.goal.mode});
 }
 function openDate(){
  assertReady();if(!currentDoc())return openSetup();const d=currentDoc(),s=snap(),c=s.current;
  if(c.state==='drinking'&&['occasion','legacy'].includes(c.source))return openOccasion(today());
  if(c.range)return openRange(c.range.id);
  if(c.state==='abstinent'&&s.currentStreakStartedOn&&s.currentStreakStartedOn!==c.event?.started_on){
   const last=s.lastConsumptionOn,occasion=d.occasions.find(o=>o.date===last),range=(d.ranges||[]).find(r=>r.state==='drinking'&&r.started_on<=last&&r.ended_on>=last);
   api.modal('Mes dates d’arrêt',`<div class="tl-date-context"><span class="tl-caption">Mon arrêt en cours</span><strong>${dateLabel(s.currentStreakStartedOn)}</strong><p>Cette date tient compte de ta dernière consommation${last?' du '+dateLabel(last):''}.</p></div><div class="tl-date-actions">${occasion?button('edit-occasion','Corriger cette consommation',`data-tl-date="${last}"`,'primary full'):range?button('edit-range','Corriger cette période',`data-tl-id="${range.id}"`,'primary full'):''}${button('edit-event','Corriger mon arrêt déclaré',`data-tl-id="${c.event.id}"`,'secondary full')}${button('history','Voir toutes mes dates','','text')}</div>`);
   return;
  }
  if(c.event)return openEvent(c.event.started_on,c.event.id);
  openChange();
 }
 function openChange(date){assertReady();if(!currentDoc())return openSetup();openEvent(date||today(),null,!date);}
 function savePreview(){return '<section class="tl-save-preview" data-tl-save-preview aria-live="polite" hidden></section>';}
 function openEvent(date,id,create=false){
  const d=currentDoc(),ordered=[...d.events].sort((a,b)=>a.started_on.localeCompare(b.started_on)),existing=id?ordered.find(e=>e.id===id):create?null:ordered.find(e=>e.started_on===date),editId=existing?.id||null;
  const previous=ordered.filter(e=>e.id!==editId&&e.started_on<(existing?.started_on||date)).at(-1),next=ordered.find(e=>e.id!==editId&&e.started_on>(existing?.started_on||date));
  const min=existing&&previous?moveDay(previous.started_on,1):'1900-01-01',max=existing&&next?moveDay(next.started_on,-1):today(),active=existing||previous||ordered[0],state=existing?.state||'';
  api.modal(existing?'Corriger ce repère':'Arrêt ou reprise',`<form id="tlEventForm" class="tl-form" data-tl-form="event">${stateFields(state,active.units_week,active.cost_week)}${dateFields(existing?.started_on||date,{min,max})}<div data-tl-event-baseline ${existing?'':'hidden'}>${baselineFields(d.baseline)}<label class="checklabel tl-confirm"><input type="checkbox" name="confirm_periods" ${existing?'required':''}> Je confirme ces dates et mes anciens repères.</label></div><div class="tl-collision" data-tl-event-overlap hidden></div><details class="tl-details"><summary>Ajouter une note <span>facultatif</span></summary><label>Mon repère<textarea name="note" rows="2" maxlength="300">${esc(existing?.note||'')}</textarea></label></details>${savePreview()}${errorBox()}<button type="submit" class="primary full">${existing?'Enregistrer la correction':'Enregistrer mon rythme'}</button><div class="tl-modal-links">${button('new-range','Renseigner une période terminée','','text')}${existing&&d.events.length>1?button('remove-open','Ce repère est une erreur','','text tl-remove'):''}</div><p class="tl-caption">Mon objectif reste : ${esc(MODES[d.goal.mode])}.</p>${supportNote()}</form>`);
  attach('tlEventForm',d,{editId,editKind:'event',min,max,originalMode:d.goal.mode});
 }
 function dayShortcuts(){return `<div class="tl-shortcuts tl-day-shortcuts" aria-label="Choisir le jour">${button('day-shortcut','Aujourd’hui',`data-tl-date="${today()}"`,'tl-chip')}${button('day-shortcut','Hier',`data-tl-date="${moveDay(today(),-1)}"`,'tl-chip')}${button('choose-day','Choisir une date','','tl-chip')}</div>`;}
 function openOccasion(date){openConsumption({date:date||today()});}
 function openRange(id,date,state='drinking'){
  assertReady();if(!currentDoc())return openSetup();const existing=id?(currentDoc().ranges||[]).find(r=>r.id===id):null;if(id&&!existing)throw Error('Cette période n’est plus disponible.');
  openConsumption({kind:'range',range:existing,date:date||today(),state});
 }
 function openConsumption({date=today(),kind='occasion',range=null,state='drinking'}={}){
  assertReady();if(!currentDoc())return openSetup();const d=currentDoc(),existing=kind==='range'?range:d.occasions.find(o=>o.date===date),editKind=existing?kind:null,rangeBaseline=existing?.state==='abstinent';
  const first=range?.started_on||date,last=range?.ended_on||date,rangeState=range?.state||state;
  const choices=editKind?`<p class="tl-form-kicker">${kind==='occasion'?'Une journée précise':'Une période, du début à la fin'}</p>`:`<fieldset class="tl-fieldset tl-kind-picker"><legend>Sur quelle durée ?</legend><div class="tl-choices tl-choices-two">${[['occasion','Un jour'],['range','Une période']].map(([value,label])=>`<label class="tl-choice"><input type="radio" name="consumption_kind" value="${value}" data-tl-change="consumption-kind"${checked(kind===value)}><span>${label}</span></label>`).join('')}</div></fieldset>`;
  api.modal(existing?(kind==='range'?'Corriger cette période':'Corriger cette consommation'):'Ajouter une consommation',`<form id="tlOccasionForm" class="tl-form" data-tl-form="consumption">${choices}<div data-tl-day ${kind==='occasion'?'':'hidden'}>${dayShortcuts()}${field('date','Quel jour ?',existing?.date||date,`type="date" required min="1900-01-01" max="${today()}" data-tl-change="occasion-date"`)}<div class="two-fields">${field('units','Verres ce jour-là',kind==='occasion'?existing?.units??'':'','type="number" required min="0.01" max="1000" step="0.01" inputmode="decimal" placeholder="Ex. 2"')}${field('cost','Dépenses ce jour-là (€)',kind==='occasion'?existing?.cost??'':'','type="number" required min="0" max="1000000" step="0.01" inputmode="decimal" placeholder="Ex. 0"')}</div></div><div data-tl-range ${kind==='range'?'':'hidden'}><div class="two-fields tl-range-dates">${field('started_on','Du',first,`type="date" required min="1900-01-01" max="${today()}"`)}${field('ended_on','Au (inclus)',last,`type="date" required min="1900-01-01" max="${today()}"`)}</div><p class="tl-range-duration" data-tl-range-duration aria-live="polite"></p><fieldset class="tl-fieldset tl-range-state"><legend>Pendant cette période</legend><div class="tl-choices tl-choices-two">${[['drinking','J’ai consommé'],['abstinent','Sans alcool']].map(([value,label])=>`<label class="tl-choice"><input type="radio" name="range_state" value="${value}" data-tl-change="range-state"${checked(rangeState===value)}><span>${label}</span></label>`).join('')}</div></fieldset><div data-tl-range-drinking><p class="tl-caption">Ma moyenne estimée par semaine :</p><div class="two-fields">${field('range_units_week','Verres / semaine',range?.state==='drinking'?range.units_week:'','type="number" required min="0.01" max="7000" step="0.01" inputmode="decimal" placeholder="Ex. 10"')}${field('range_cost_week','Dépenses / semaine (€)',range?.state==='drinking'?range.cost_week:'','type="number" required min="0" max="7000000" step="0.01" inputmode="decimal" placeholder="Ex. 30"')}</div></div><div data-tl-range-sober hidden><p class="tl-caption">0 verre pendant cette période.</p><details class="tl-details tl-budget-detail" ${range?.state==='abstinent'&&range.cost_week>0?'open':''}><summary>J’ai encore des achats d’alcool</summary>${field('range_sober_cost','Budget alcool / semaine (€)',range?.state==='abstinent'?range.cost_week:0,'type="number" min="0" max="7000000" step="0.01" inputmode="decimal"')}</details></div>${rangeBaseline?`${baselineFields(d.baseline)}<label class="checklabel tl-confirm"><input type="checkbox" name="confirm_periods" required> Je confirme ces dates et mes anciens repères.</label>`:''}<details class="tl-details"><summary>Ajouter une note <span>facultatif</span></summary><label>Mon repère<textarea name="range_note" rows="2" maxlength="300">${esc(range?.note||'')}</textarea></label></details></div><p class="tl-caption" data-tl-consumption-hint></p><div class="tl-collision" data-tl-collision hidden></div>${savePreview()}${errorBox()}<button type="submit" class="primary full" data-tl-consumption-submit>Enregistrer la consommation</button>${existing?`<div class="tl-modal-links">${button('remove-open','Cette déclaration est une erreur','','text tl-remove')}</div>`:''}</form>`);
  attach('tlOccasionForm',d,{editKind,editId:existing?.id||null,kind,originalDate:existing?.date||null,rangeBaseline});
 }
 function openRemove(f){
  assertReady();const context=forms.get(f);if(!context||context.generation!==generation)throw Error('Rouvre cette déclaration depuis ton historique.');
  const kind=context.editKind,rows=kind==='occasion'?context.doc.occasions:kind==='range'?context.doc.ranges:context.doc.events,row=rows?.find(r=>r.id===context.editId);if(!row)throw Error('Cette déclaration n’est plus disponible.');
  const dates=kind==='occasion'?dateLabel(row.date):kind==='range'?`Du ${dateLabel(row.started_on)} au ${dateLabel(row.ended_on)}`:`À partir du ${dateLabel(row.started_on)}`;
  const values=kind==='occasion'?`${number(row.units)} verres · ${euros(row.cost)}`:`${row.state==='abstinent'?'Sans alcool':number(row.units_week)+' verres / semaine'} · ${euros(row.cost_week)} / semaine`;
  api.modal('Retirer une déclaration erronée',`<form id="tlRemoveForm" class="tl-form" data-tl-form="remove"><div class="tl-correction-summary"><b>${dates}</b><span>${values}</span></div><p>Les compteurs et les courbes seront recalculés avec les autres informations de ton parcours.</p><label class="checklabel tl-confirm"><input type="checkbox" name="confirm_remove" required> Cette déclaration a été ajoutée par erreur.</label>${savePreview()}${errorBox()}<button type="submit" class="primary full">Retirer cette déclaration</button><div class="tl-modal-links">${kind==='occasion'?button('edit-occasion','Revenir sans retirer',`data-tl-date="${row.date}"`,'text'):button(kind==='range'?'edit-range':'edit-event','Revenir sans retirer',`data-tl-id="${row.id}"`,'text')}</div></form>`);
  attach('tlRemoveForm',context.doc,{editId:row.id,editKind:kind,versions:clone(context.versions),generation:context.generation});
 }
 function setPanel(panel,visible){if(!panel)return;panel.hidden=!visible;for(const input of panel.querySelectorAll('input,select,textarea'))input.disabled=!visible;}
 function formKind(f,c){return c.editKind&&f.dataset.tlForm==='consumption'?c.editKind:f.elements.consumption_kind?.value||c.kind||'occasion';}
 function syncDay(f,{fill=false}={}){
  const c=forms.get(f);if(!c)return;const chosen=f.elements.date?.value,same=c.doc?.occasions.find(o=>o.date===chosen);
  if(fill&&!c.editId&&same){f.elements.units.value=same.units;f.elements.cost.value=same.cost;}
  for(const b of f.querySelectorAll('[data-tl-action="day-shortcut"]'))b.setAttribute('aria-pressed',String(b.dataset.tlDate===chosen));
 }
 function syncForm(f){
  const c=forms.get(f);if(!c)return;
  if(f.elements.state){const state=f.elements.state.value,sober=state==='abstinent',drinking=state==='drinking';setPanel(f.querySelector('[data-tl-abstinent]'),sober);setPanel(f.querySelector('[data-tl-drinking]'),drinking);f.elements.abstinent_cost_week.required=sober;for(const key of ['current_units_week','current_cost_week'])f.elements[key].required=drinking;}
  if(f.elements.goal_mode){const goal=f.elements.goal_mode.value,changed=c.originalMode==='abstain'&&goal!=='abstain';f.querySelector('[data-tl-goal-confirm]').hidden=!changed;f.elements.confirm_goal_change.required=changed;const targets=goal==='reduce'&&!f.elements.support_first?.checked;f.querySelector('[data-tl-limits]').hidden=!targets;for(const key of ['weekly_limit','daily_limit'])f.elements[key].disabled=!targets;}
  const datePreview=f.querySelector('[data-tl-date-preview]');if(datePreview){try{const days=dayDiff(today(),f.elements.started_on.value);datePreview.textContent=days===0?'À partir d’aujourd’hui.':`${duration(days)} depuis cette date.`;}catch{datePreview.textContent='';}}
  if(f.elements.abstinent_cost_week){const output=f.querySelector('[data-tl-zero-cost]');if(output)output.textContent=euros(validNumber(f.elements.abstinent_cost_week.value)||0);}
  if(f.dataset.tlForm==='event'){
   const baseline=!!c.editId||!!f.elements.started_on.value&&f.elements.started_on.value<c.doc.baseline.started_on;setPanel(f.querySelector('[data-tl-event-baseline]'),baseline);f.elements.confirm_periods.required=baseline;
   const range=(c.doc.ranges||[]).find(r=>r.started_on<=f.elements.started_on.value&&r.ended_on>=f.elements.started_on.value),same=c.doc.events.find(e=>e.id!==c.editId&&e.started_on===f.elements.started_on.value),overlap=f.querySelector('[data-tl-event-overlap]');overlap.hidden=!range&&!same;
   if(same)overlap.innerHTML=`<p>Un changement de rythme existe déjà à cette date.</p>${button('edit-event','Modifier ce repère',`data-tl-id="${same.id}"`,'text')}`;
   else if(range)overlap.innerHTML=`<p>Une période est déjà renseignée du ${dateLabel(range.started_on)} au ${dateLabel(range.ended_on)}. Elle reste prise en compte sur ces dates.</p>${button('edit-range','Modifier cette période',`data-tl-id="${range.id}"`,'text')}`;
  }
  if(f.dataset.tlForm==='consumption'){
   const kind=formKind(f,c),isRange=kind==='range';setPanel(f.querySelector('[data-tl-day]'),!isRange);setPanel(f.querySelector('[data-tl-range]'),isRange);
   const sober=isRange&&f.elements.range_state.value==='abstinent';setPanel(f.querySelector('[data-tl-range-drinking]'),isRange&&!sober);setPanel(f.querySelector('[data-tl-range-sober]'),sober);
   const hint=f.querySelector('[data-tl-consumption-hint]'),collision=f.querySelector('[data-tl-collision]'),submit=f.querySelector('[data-tl-consumption-submit]');collision.hidden=true;collision.replaceChildren();
   if(isRange){
    const start=f.elements.started_on.value,end=f.elements.ended_on.value,output=f.querySelector('[data-tl-range-duration]');f.elements.ended_on.min=start||'1900-01-01';
    try{const days=dayDiff(end,start)+1;output.textContent=days>0?`${duration(days)} · dates incluses`:'La fin doit suivre le début.';}catch{output.textContent='';}
    const other=(c.doc.ranges||[]).find(r=>r.id!==c.editId&&start&&end&&r.started_on<=end&&r.ended_on>=start);
    if(other){collision.hidden=false;collision.innerHTML=`<p>Une période existe déjà du ${dateLabel(other.started_on)} au ${dateLabel(other.ended_on)}.</p>${button('edit-range','Modifier la période existante',`data-tl-id="${other.id}"`,'text')}`;}
    hint.textContent='Ces dates précisent ton historique. Ton rythme déclaré reprend après la fin.';submit.textContent=c.editId?'Enregistrer la correction':'Enregistrer cette période';
   }else{
    syncDay(f);const same=c.doc.occasions.find(o=>o.date===f.elements.date.value),conflict=!!c.editId&&same&&same.id!==c.editId;
    if(conflict){collision.hidden=false;collision.innerHTML=`<p>Une consommation est déjà renseignée ce jour-là.</p>${button('edit-occasion','Modifier cette journée',`data-tl-date="${same.date}"`,'text')}`;}
    hint.textContent=same?'Le total de cette journée sera corrigé.':'Indique le total de la journée, même si elle est passée.';submit.textContent=c.editId||same?'Enregistrer la correction':'Enregistrer la consommation';
   }
  }
  updatePreview(f,c);
 }
 function baselineFrom(data){return {started_on:String(data.get('baseline_started_on')||''),units_week:requiredNumber(data.get('baseline_units_week'),'Ancienne consommation',0,7000),cost_week:requiredNumber(data.get('baseline_cost_week'),'Ancien budget alcool',0,7000000)};}
 function requiredNumber(raw,label,min,max){if(String(raw??'').trim()==='')throw Error(`${label} : renseigne une estimation.`);const n=Number(raw);if(!Number.isFinite(n)||n<min||n>max)throw Error(`${label} : choisis un nombre entre ${min} et ${max}.`);return Math.round(n*100)/100;}
 function optionalNumber(raw,label,max){return raw===null||String(raw).trim()===''?null:requiredNumber(raw,label,0,max);}
 function goalFrom(data,context,{preview=false}={}){
  const mode=String(data.get('goal_mode')||'');if(!MODES[mode])throw Error('Choisis ton objectif.');if(!preview&&context.originalMode==='abstain'&&mode!=='abstain'&&!data.get('confirm_goal_change'))throw Error('Confirme ton choix de modifier ton objectif d’arrêt.');
  const support_first=!!data.get('support_first'),limits=mode==='reduce'&&!support_first;
  return {mode,weekly_limit:limits?optionalNumber(data.get('weekly_limit'),'Limite hebdomadaire',7000):null,daily_limit:limits?optionalNumber(data.get('daily_limit'),'Limite quotidienne',1000):null,target_on:String(data.get('target_on')||'')||null,why:String(data.get('why')||'').trim(),triggers:data.getAll('triggers').map(String),support_first,planned_action:String(data.get('planned_action')||'').trim()};
 }
 function eventFrom(data,id){const state=String(data.get('state')||'');if(!['abstinent','drinking'].includes(state))throw Error('Choisis ta situation pour cette période.');return {id:id||crypto.randomUUID(),started_on:String(data.get('started_on')||''),state,units_week:state==='abstinent'?0:requiredNumber(data.get('current_units_week'),'Consommation hebdomadaire',0.01,7000),cost_week:requiredNumber(data.get(state==='abstinent'?'abstinent_cost_week':'current_cost_week'),'Budget alcool',0,7000000),note:String(data.get('note')||'').trim()};}
 function validateDates(doc){const earliest=[...doc.events.map(e=>e.started_on)].sort()[0];if(earliest&&doc.baseline.started_on>earliest)throw Error(`Les anciens repères doivent commencer au plus tard le ${dateLabel(earliest)}. Corrige « Ces habitudes étaient valables depuis le ».`);}
 function draftFrom(f,data,c,{preview=false}={}){
  let doc=c.doc?{...clone(c.doc),schema_version:2,ranges:clone(c.doc.ranges||[])}:null;const type=f.dataset.tlForm;
  if(type==='start'){let timezone='Europe/Paris';try{timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||timezone;}catch{}doc={schema_version:2,timezone,baseline:baselineFrom(data),events:[eventFrom(data,c.newId)],occasions:[],ranges:[],goal:goalFrom(data,c,{preview})};}
  if(type==='settings'){doc.baseline=baselineFrom(data);doc.goal=goalFrom(data,c,{preview});}
  if(type==='event'){
   const event=eventFrom(data,c.editId||c.newId);if(event.started_on<c.min||event.started_on>c.max)throw Error('Choisis une date entre les deux changements de rythme voisins.');
   if(doc.events.some(e=>e.id!==c.editId&&e.started_on===event.started_on))throw Error('Un changement de rythme existe déjà à cette date. Modifie ce repère.');
   if(c.editId)doc.events=doc.events.map(e=>e.id===c.editId?event:e);else doc.events.push(event);
   if(data.has('baseline_started_on'))doc.baseline=baselineFrom(data);
  }
  if(type==='consumption'){
   const kind=formKind(f,c);
   if(kind==='occasion'){
    const date=String(data.get('date')||''),sameDay=doc.occasions.find(o=>o.date===date);
    if(c.editId&&sameDay&&sameDay.id!==c.editId)throw Error('Une consommation existe déjà à cette date. Ouvre cette journée pour corriger son total.');
    const occasion={id:c.editId||sameDay?.id||c.newId,date,units:requiredNumber(data.get('units'),'Verres ce jour-là',0.01,1000),cost:requiredNumber(data.get('cost'),'Dépenses ce jour-là',0,1000000)};
    doc.occasions=doc.occasions.filter(o=>o.date!==date&&(!c.editId||o.id!==c.editId));doc.occasions.push(occasion);
   }else{
    const state=String(data.get('range_state')||''),start=String(data.get('started_on')||''),end=String(data.get('ended_on')||'');
    if(!['drinking','abstinent'].includes(state))throw Error('Choisis ta situation pendant cette période.');
    if(end<start)throw Error('La date de fin doit être le même jour que le début ou après.');
    const other=doc.ranges.find(r=>r.id!==c.editId&&r.started_on<=end&&r.ended_on>=start);
    if(other)throw Error(`Une période existe déjà du ${dateLabel(other.started_on)} au ${dateLabel(other.ended_on)}. Modifie-la ou choisis des dates séparées.`);
    const row={id:c.editId||c.newId,started_on:start,ended_on:end,state,units_week:state==='abstinent'?0:requiredNumber(data.get('range_units_week'),'Verres par semaine',0.01,7000),cost_week:requiredNumber(data.get(state==='abstinent'?'range_sober_cost':'range_cost_week'),'Dépenses par semaine',0,7000000),note:String(data.get('range_note')||'').trim()};
    doc.ranges=doc.ranges.filter(r=>r.id!==c.editId);doc.ranges.push(row);if(c.rangeBaseline)doc.baseline=baselineFrom(data);
   }
  }
  if(type==='remove'){
   const collection=c.editKind==='occasion'?'occasions':c.editKind==='range'?'ranges':'events';
   if(collection==='events'&&doc.events.length<2)throw Error('Garde un point de départ. Tu peux corriger sa date et son rythme.');
   doc[collection]=doc[collection].filter(row=>row.id!==c.editId);
  }
  validateDates(doc);return validateTimelineDocument(doc,today());
 }
 function updatePreview(f,c){
  const out=f.querySelector('[data-tl-save-preview]');if(!out)return;
  try{
   const doc=draftFrom(f,new FormData(f),c,{preview:true}),s=timelineSnapshot(doc,get().checks||[],today()),saved=s.summary?.saved;
   const date=s.current.state==='abstinent'&&s.currentStreakStartedOn?`Sans alcool depuis le ${dateLabel(s.currentStreakStartedOn)}.`:'Les consommations déclarées restent prises en compte.';
   out.innerHTML=`<div class="tl-preview-heading"><span>Aperçu après enregistrement</span><small>Pas encore enregistré</small></div><div class="tl-preview-grid"><div><strong>${number(s.currentStreak)}</strong><span>jours · arrêt en cours</span></div><div><strong>${number(s.totalSoberDays)}</strong><span>jours sans alcool cumulés</span></div><div><strong>${euros(Math.abs(saved))}</strong><span>${saved<0?'dépenses en plus estimées':'économies estimées'}</span></div></div><p>${date} Les courbes suivront ces dates.</p>`;out.hidden=false;
  }catch{out.hidden=true;out.replaceChildren();}
 }
 function showError(f,error){const out=f.querySelector('[data-tl-error]');if(out){out.hidden=false;out.textContent=String(error?.message||error||'L’enregistrement a échoué.');out.scrollIntoView?.({block:'nearest'});}}
 async function saveForm(f,data){
  const c=forms.get(f);if(!c||c.generation!==generation)throw Error('Rouvre ce formulaire pour actualiser ton suivi.');
  if(f.elements.confirm_periods&&!f.elements.confirm_periods.disabled&&!data.get('confirm_periods'))throw Error('Confirme tes dates et tes anciens repères.');
  if(f.dataset.tlForm==='remove'&&!data.get('confirm_remove'))throw Error('Confirme que cette déclaration était une erreur.');
  const validated=draftFrom(f,data,c),saved=await api.save(validated,c.versions);
  if(saved!==true||c.generation!==generation)return;
  if(document.contains(f))api.closeModal();api.render();
  api.notify(f.dataset.tlForm==='start'?'Ton suivi est prêt. Les dates passées sont prises en compte.':f.dataset.tlForm==='remove'?'Déclaration retirée. Compteurs et courbes recalculés.':'Enregistré. Compteurs et courbes mis à jour.');
 }
 const actions={
  setup:openSetup,settings:openSettings,date:openDate,occasion:()=>openOccasion(),change:()=>openChange(),
  progress:()=>{api.closeModal();api.openProgress();},history:()=>{api.closeModal();api.openPage('journey');},games:()=>api.openPage('games'),
  help:()=>{api.modal('Un peu de soutien',`<p>Tu peux faire une pause et contacter une personne de confiance.</p><p class="tl-safety">En cas de symptômes de manque, demande une aide médicale. En cas d’urgence, appelle le 15 ou le 112.</p><div class="row"><a class="secondary tl-support-link" href="tel:0980980930">Alcool Info Service</a><a class="secondary tl-support-link" href="tel:112">112 · Urgence</a></div>`);},
  'edit-event':b=>{assertReady();const event=currentDoc()?.events.find(e=>e.id===b.dataset.tlId);if(!event)throw Error('Cette période n’est plus disponible.');openEvent(event.started_on,event.id);},
  'edit-occasion':b=>openOccasion(b.dataset.tlDate),'edit-range':b=>openRange(b.dataset.tlId),
  'new-range':()=>openRange(null),
  'remove-open':b=>openRemove(b.closest('form')),
  'date-shortcut':b=>{const f=b.closest('form');f.elements.started_on.value=b.dataset.tlDate;syncForm(f);},
  'day-shortcut':b=>{const f=b.closest('form');f.elements.date.value=b.dataset.tlDate;syncDay(f,{fill:true});syncForm(f);},
  'choose-day':b=>{const input=b.closest('form').elements.date;input.focus();try{input.showPicker?.();}catch{}},
 };
 document.addEventListener('click',async e=>{const b=e.target.closest('[data-tl-action]');if(!b||b.disabled)return;const action=actions[b.dataset.tlAction];if(!action)return;e.preventDefault();e.stopImmediatePropagation();b.disabled=true;try{await action(b);}catch(error){const f=b.closest('form');if(f)showError(f,error);else api.notify(String(error?.message||error));}finally{b.disabled=false;}},true);
 document.addEventListener('change',e=>{const f=e.target.closest('form[data-tl-form]');if(!f)return;if(e.target.dataset.tlChange==='occasion-date')syncDay(f,{fill:true});syncForm(f);});
 document.addEventListener('input',e=>{const f=e.target.closest('form[data-tl-form]');if(f){if(e.target.dataset.tlChange==='occasion-date')syncDay(f,{fill:true});syncForm(f);}});
 document.addEventListener('submit',async e=>{const f=e.target;if(!f.matches('form[data-tl-form]'))return;e.preventDefault();e.stopImmediatePropagation();const submit=e.submitter||f.querySelector('button[type="submit"]');if(submit?.disabled)return;const data=new FormData(f);if(submit)submit.disabled=true;const out=f.querySelector('[data-tl-error]');if(out)out.hidden=true;try{await saveForm(f,data);}catch(error){showError(f,error);}finally{if(submit)submit.disabled=false;}},true);
 return {home,view,journey,settingsSummary,openSettings,openDate,openOccasion,openRange,openChange,reset};
}
