import {dayKey, parseDay, moveDay, dayDiff, dateLabel, esc} from './core.mjs';
import {validateTimelineDocument, timelineSnapshot, timelineSummary, timelineStopBasis} from './timeline-core.mjs';
import {zonedDateTimeCandidates, zonedDateTimeToInstant, localDateTime, elapsedSince} from './time-core.mjs';
import {createTimelineChart} from './timeline-chart.mjs';
import {createSimpleSummary} from './timeline-summary.mjs';

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
const quantity=(name,label,value='',min=0,max=7000)=>`<label>${label}<span class="tl-quantity">${button('quantity-step','−',`data-tl-field="${name}" data-tl-delta="-1" aria-label="Retirer un verre"`,'tl-quantity-button')}<input class="tl-quantity-input" aria-label="${esc(label)}" name="${name}" type="number" value="${esc(value??'')}" required min="${min}" max="${max}" step="0.01" inputmode="decimal" placeholder="0">${button('quantity-step','+',`data-tl-field="${name}" data-tl-delta="1" aria-label="Ajouter un verre"`,'tl-quantity-button')}</span></label>`;
const budget=(name,label,value='',max=7000000)=>`<label>${label}<span class="tl-input-suffix"><input name="${name}" type="number" value="${esc(value??'')}" required min="0" max="${max}" step="0.01" inputmode="decimal" placeholder="Ex. 20"><span aria-hidden="true">€</span></span></label>`;
const errorBox=()=>'<p class="tl-error" data-tl-error role="alert" hidden></p>';
const validNumber=value=>value!==''&&value!==null&&value!==undefined&&Number.isFinite(Number(value))?Number(value):'';
function monthsBefore(date,months){const d=parseDay(date),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()-months);d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));return dayKey(d);}
function safeDate(value,fallback){try{const raw=String(value||'').trim();let s=raw;if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)){const instant=new Date(raw);if(!Number.isFinite(instant.getTime()))return fallback;s=dayKey(instant);}parseDay(s);return s>='1900-01-01'?s:fallback;}catch{return fallback;}}
function duration(n){return `${number(n)} jour${n===1?'':'s'}`;}
function deviceZone(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Paris';}catch{return 'Europe/Paris';}}
function preciseDuration(instant){const value=elapsedSince(instant);return value.elapsedDays?`${number(value.elapsedDays)} j ${value.hours} h ${value.minutes} min`:value.label;}
function clockLabel(instant,zone){const local=localDateTime(instant,zone);return `${dateLabel(local.date)} à ${local.time} · ${zone}`;}

/** All writes go through one versioned save; the displayed goal never follows a consumption event. */
export function createTimelineUI(api){
 let forms=new WeakMap(),generation=0;
 const $=selector=>document.querySelector(selector);
 const get=()=>api.data();
 const today=()=>get().today||dayKey();
 const chart=createTimelineChart({data:()=>({document:get().document,checks:get().checks||[],today:today()}),render:()=>api.render(),openConsumption:date=>openOccasion(date),openOccasion:date=>openOccasion(date),openRange:id=>openRange(id),openChange:date=>openChange(date),download:(...args)=>api.download(...args)});
 const snap=()=>timelineSnapshot(get().document,get().checks||[],today());
 const currentDoc=()=>get().document;
 const formZone=c=>c?.doc?.timezone||c?.timezone||currentDoc()?.timezone||deviceZone();
 const summary=createSimpleSummary({data:()=>({document:currentDoc(),checks:get().checks||[],today:today()}),render:()=>api.render()});
 function reset(){generation++;forms=new WeakMap();chart.reset();summary.reset();}
 function assertReady(){if(!get().ready)throw Error('Le suivi n’est pas encore chargé. Réessaie dans un instant.');}
 function readyView(){return '<section class="card tl-loading" role="status"><h2>Chargement de ton suivi…</h2><p>Tes repères apparaîtront ici.</p></section>';}
 function welcome(){return `<div class="greeting tl-heading"><h1>Ton point de départ</h1><p>Quelques repères pour voir tes progrès.</p></div><section class="card tl-welcome"><span class="tl-welcome-mark" aria-hidden="true">↗</span><h2>Tu as déjà commencé ?<br>Ton parcours compte déjà.</h2><p>Indique ta situation et sa date de début.</p><div class="tl-welcome-points"><span>Une date</span><span>Ton rythme</span><span>Tes économies</span></div>${button('setup','Configurer mon suivi','','primary full')}<p class="tl-caption">Pas de bilan quotidien obligatoire.</p></section>`;}
 function home(){
  if(!get().ready)return readyView();
  if(!currentDoc())return welcome();
  const d=currentDoc(),s=snap(),c=s.current,clock=s.stopClock?.valid?s.stopClock:null,sober=!!clock||c.state==='abstinent',actual=['occasion','legacy'].includes(c.source),saved=s.summary?.saved;
  const currentDate=clock?.date||(sober?(s.currentStreakStartedOn||today()):actual?today():c.started_on);
  const heroValue=sober?s.currentStreak:actual?s.todayActual?.alcohol_units:c.units_week;
  return `<div class="greeting tl-heading"><div><h1>Mon suivi</h1><p>Mon objectif : ${esc(MODES[d.goal.mode])}</p></div>${button('settings','Mes réglages','','text')}</div>
   <section class="card tl-hero tl-current"><div class="tl-current-main"><span>${sober?'Mon arrêt en cours':actual?'Aujourd’hui':'Mon rythme actuel'}</span><strong${clock?` data-tl-live-start="${esc(clock.startedAt)}" data-tl-live-day="${today()}"`:''}>${clock?preciseDuration(clock.startedAt):number(heroValue)} <span>${clock?'sans alcool':sober?'jour'+(heroValue===1?'':'s')+' sans alcool':actual?'verre'+(heroValue===1?'':'s'):'verres / semaine'}</span></strong><p>${sober?'Depuis le ':actual?'Le ':'Depuis le '}${clock?esc(clockLabel(clock.startedAt,d.timezone)):dateLabel(currentDate)}${sober&&!clock?' · heure à préciser':''}</p></div>${button(sober?'stop-time':'date',sober&&!clock?'Préciser':'Modifier','','tl-hero-edit')}</section>
   <div class="tl-actions">${button('occasion','<span aria-hidden="true">＋</span><b>Ajouter une consommation</b><small>Aujourd’hui ou une date passée</small>','','tl-action-card tl-action-primary')}${button('change','<span aria-hidden="true">↔</span><b>Arrêt ou reprise</b><small>Indiquer un changement</small>','','tl-action-card')}${button('history','<span aria-hidden="true">↗</span><b>Mon historique</b><small>Retrouver ou corriger une date</small>','','tl-action-card')}</div>
   ${summary.view()}
   <details class="card tl-details tl-all-progress"><summary>Mes progrès depuis le début</summary><div class="tl-achievement-grid"><div><strong>${number(s.totalSoberDays)}</strong><span>jours sans alcool cumulés</span></div><div><strong>${number(s.bestStreak)}</strong><span>jours pour mon meilleur arrêt</span></div><div><strong>${euros(Number.isFinite(saved)?Math.abs(saved):saved)}</strong><span>${saved<0?'de dépenses en plus estimées':'d’économies estimées'}</span></div></div><div class="tl-modal-links">${button('progress','Voir mon bilan','','secondary')}${button('history','Les dates de mes arrêts','','text')}</div></details>
   ${d.goal.why?`<details class="card tl-details tl-why"><summary>Ce qui me motive</summary><p>${esc(d.goal.why)}</p></details>`:''}`;
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
   const dates=occasion?dateLabel(row.date):range?`Du ${dateLabel(row.started_on)} au ${dateLabel(row.end)}`:`À partir du ${row.stopped_at?esc(clockLabel(row.stopped_at,d.timezone)):dateLabel(row.started_on)}`;
   const detail=occasion?`${number(row.units)} verres · ${euros(row.cost)}`:`${number(row.units_week)} verres / semaine · ${euros(row.cost_week)} / semaine · estimés`;
   const edits=occasion?button('edit-occasion','Modifier',`data-tl-date="${row.date}"`,'text'):button(range?'edit-range':'edit-event','Modifier',`data-tl-id="${esc(row.id)}"`,'text');
   return `<li class="tl-history-event"><span class="tl-history-dot ${sober?'is-abstinent':''}" aria-hidden="true"></span><div><div class="tl-history-top"><span class="tag">${label}</span>${range?`<small>${duration(dayDiff(row.end,row.started_on)+1)}</small>`:''}</div><h3>${dates}</h3>${row.kind==='event'?`<p>${row.end?'Repère jusqu’au '+dateLabel(row.end):'Repère actuel'} · précisé par les consommations ajoutées</p>`:''}<span class="tl-caption">${detail}</span>${row.note?`<p class="tl-event-note">${esc(row.note)}</p>`:''}</div>${edits}</li>`;
  }).join('');
  const stops=(s.bestPeriods||[]).slice(0,6).map(p=>`<li><strong>${duration(p.days)}</strong><span>${dateLabel(p.start)}${p.end?' → '+dateLabel(p.end):''}${p.ongoing?' · en cours':''}</span></li>`).join('');
  const body=`<details class="tl-details tl-records" ${collapsed?'':'open'}><summary>Mes plus longs arrêts <span>${s.bestPeriods?.length||0}</span></summary>${stops?`<ul class="tl-stop-list">${stops}</ul>`:'<p class="tl-caption">Ton premier jour complet apparaîtra ici.</p>'}</details><div class="tl-section-heading tl-history-heading"><h3>Mes déclarations</h3>${button('occasion','+ Ajouter','','text')}</div><p class="tl-caption">Même une date ancienne met à jour les compteurs et les courbes.</p><ol class="tl-history-list">${rows}</ol><div class="tl-history-tools">${button('occasion','Ajouter une consommation','','primary')}${button('change','Déclarer un arrêt ou une reprise','','secondary')}</div>`;
  return collapsed?`<details class="card tl-history tl-details tl-section"><summary>Mon historique <span>${declarations.length} repère${declarations.length===1?'':'s'}</span></summary>${body}</details>`:`<section class="card tl-history tl-section"><div class="tl-section-heading"><h2>Mes dates et mes progrès</h2>${button('settings','Mon objectif','','text')}</div>${body}</section>`;
 }
 function settingsSummary(){if(!get().ready)return readyView();if(!currentDoc())return `<section class="tl-settings-summary"><p>Ajoute ta date et tes premiers repères.</p>${button('setup','Configurer mon suivi','','primary')}</section>`;const d=currentDoc(),s=snap(),clock=s.stopClock?.valid?s.stopClock:null,sober=!!clock||s.current.state==='abstinent',actual=['occasion','legacy'].includes(s.current.source);return `<section class="tl-settings-summary"><div><span class="tl-caption">Mon objectif</span><b>${esc(MODES[d.goal.mode])}</b></div><div><span class="tl-caption">${sober?'Sans alcool depuis le':actual?'Consommation déclarée le':'Rythme actuel depuis le'}</span><b>${clock?esc(clockLabel(clock.startedAt,d.timezone)):dateLabel(sober?(s.currentStreakStartedOn||today()):actual?today():s.current.started_on)}</b></div><div class="row">${button('settings','Objectif et préférences','','secondary')}${sober?button('stop-time',clock?'Date et heure d’arrêt':'Préciser mon heure','','text'):''}${button('history','Mon historique','','text')}</div></section>`;}

 function wizard(steps,submitLabel='Enregistrer',extra=''){
  return `<ol class="tl-wizard-progress" aria-label="Étapes du formulaire">${steps.map((step,i)=>`<li class="tl-wizard-step${i===0?' is-current':''}" data-tl-step-indicator="${i}"${i===0?' aria-current="step"':''}><span class="tl-step-number">${i+1}</span><span class="tl-step-label">${step.label}</span></li>`).join('')}</ol>${steps.map((step,i)=>`<section class="tl-step-panel" data-tl-step="${i}"${i?' hidden':''}><h3 class="tl-step-heading" tabindex="-1">${step.title}</h3>${step.body}</section>`).join('')}${errorBox()}<footer class="tl-wizard-footer">${button('wizard-back','Retour','','secondary tl-step-back')}<button type="submit" class="primary tl-step-next" data-tl-wizard-submit data-tl-final-label="${esc(submitLabel)}" ${extra}>Continuer</button></footer>`;
 }
 function syncWizard(f,{focus=false}={}){
  const c=forms.get(f),panels=[...f.querySelectorAll('[data-tl-step]')];if(!c||!panels.length)return;
  c.step=Math.max(0,Math.min(c.step||0,panels.length-1));
  panels.forEach((p,i)=>p.hidden=i!==c.step);
  for(const li of f.querySelectorAll('[data-tl-step-indicator]')){const i=Number(li.dataset.tlStepIndicator);li.classList.toggle('is-current',i===c.step);li.classList.toggle('is-done',i<c.step);if(i===c.step)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');}
  const back=f.querySelector('[data-tl-action="wizard-back"]');back.hidden=c.step===0;
  const submit=f.querySelector('[data-tl-wizard-submit]'),last=c.step===panels.length-1;submit.textContent=last?(c.submitLabel||submit.dataset.tlFinalLabel):'Continuer';submit.classList.toggle('tl-step-submit',last);
  if(focus){const heading=panels[c.step].querySelector('.tl-step-heading');heading?.focus({preventScroll:true});f.closest('dialog')?.scrollTo?.({top:0,behavior:'instant'});}
 }
 function checkFields(f,step=null){
  const all=[...f.querySelectorAll('input,select,textarea')];
  const invalid=all.find(input=>!input.disabled&&(step===null||input.closest('[data-tl-step]')?.dataset.tlStep===String(step))&&!input.checkValidity());
  if(!invalid)return true;
  const c=forms.get(f),panel=invalid.closest('[data-tl-step]');if(c&&panel){c.step=Number(panel.dataset.tlStep);syncWizard(f,{focus:true});}
  for(let node=invalid.parentElement;node&&node!==f;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;
  invalid.focus();invalid.reportValidity();return false;
 }
 function stepDatesValid(f,c){
  if(f.dataset.tlForm==='consumption'){
   if(formKind(f,c)==='range'){
    const start=f.elements.started_on.value,end=f.elements.ended_on.value;
    if(end<start)throw Error('La fin doit être le même jour que le début ou après.');
    if((c.doc.ranges||[]).some(r=>r.id!==c.editId&&r.started_on<=end&&r.ended_on>=start))throw Error('Ces dates sont déjà renseignées. Tu peux modifier la période existante ci-dessus.');
   }else{const same=c.doc.occasions.find(o=>o.date===f.elements.date.value);if(same&&same.id!==c.editId)throw Error('Cette journée est déjà renseignée. Choisis « Modifier cette journée » ci-dessus.');}
  }
  if(f.dataset.tlForm==='event'&&c.doc.events.some(e=>e.id!==c.editId&&e.started_on===f.elements.started_on.value))throw Error('Un arrêt ou une reprise existe déjà à cette date. Modifie ce repère ci-dessus.');
  if(['start','event','stop-time'].includes(f.dataset.tlForm))readStopTime(f,new FormData(f),c);
 }
 function advanceWizard(f){
  const c=forms.get(f);if(!c||!checkFields(f,c.step||0))return;
  if((c.step||0)===0)stepDatesValid(f,c);
  const next=(c.step||0)+1;
  if(next===f.querySelectorAll('[data-tl-step]').length-1)draftFrom(f,new FormData(f),c,{preview:true});
  c.step=next;syncForm(f);syncWizard(f,{focus:true});
 }
 function reviewReceipt(){return '<div class="tl-review-receipt" data-tl-review-receipt></div>';}
 function updateReceipt(f,c){
  const out=f.querySelector('[data-tl-review-receipt]');if(!out)return;const data=new FormData(f),rows=[];
  const add=(label,value)=>rows.push(`<div class="tl-review-line"><span>${esc(label)}</span><b>${esc(value)}</b></div>`);
  try{
   if(f.dataset.tlForm==='consumption'&&formKind(f,c)==='occasion'){
    add('Le jour',dateLabel(data.get('date')));add('Consommation',`${number(validNumber(data.get('units')))} verre${Number(data.get('units'))===1?'':'s'}`);add('Dépenses',euros(validNumber(data.get('cost'))));
   }else if(f.dataset.tlForm==='consumption'){
    const days=dayDiff(data.get('ended_on'),data.get('started_on'))+1,sober=data.get('range_state')==='abstinent',units=sober?0:validNumber(data.get('range_units_week')),cost=validNumber(data.get(sober?'range_sober_cost':'range_cost_week'));
    add('Du… au… inclus',`${dateLabel(data.get('started_on'))} → ${dateLabel(data.get('ended_on'))}`);add('Durée',duration(days));add('Par semaine',`${number(units)} verres · ${euros(cost)}`);if(Number.isFinite(units)&&Number.isFinite(cost)){const total=timelineSummary(draftFrom(f,data,c,{preview:true}),get().checks||[],data.get('started_on'),data.get('ended_on'),today()),u=total.quantityDays>0||total.todayActual.units!==null?total.units:null,v=total.costDays>0||total.todayActual.cost!==null?total.cost:null;add('Total dans ton bilan',`${number(u)} verres · ${euros(v)}`);if(data.get('ended_on')===today())add('Aujourd’hui','Seuls les montants déjà notés comptent.');}
   }else{
    if(data.has('started_on'))add('À partir du',dateLabel(data.get('started_on')));
    if(['start','event','stop-time'].includes(f.dataset.tlForm)&&(f.dataset.tlForm==='stop-time'||data.get('state')==='abstinent')){const instant=readStopTime(f,data,c);add('Heure du dernier verre',instant?`${localDateTime(instant,formZone(c)).time} · ${formZone(c)}`:'Inconnue');if(instant)add('Durée écoulée',preciseDuration(instant));}
    if(data.has('state')){const sober=data.get('state')==='abstinent';add('Situation',sober?'Sans alcool':'Je consomme');add('Rythme par semaine',`${sober?'0':number(validNumber(data.get('current_units_week')))} verres · ${euros(validNumber(data.get(sober?'abstinent_cost_week':'current_cost_week')))}`);}
    if(data.has('baseline_units_week'))add('Avant, par semaine',`${number(validNumber(data.get('baseline_units_week')))} verres · ${euros(validNumber(data.get('baseline_cost_week')))}`);
    if(data.has('goal_mode'))add('Objectif',MODES[data.get('goal_mode')]);
   }
   out.innerHTML=rows.join('');
  }catch{out.replaceChildren();}
 }
 function stopTimeFields(event,zone){
  let time='',occurrence='';
  if(event?.stopped_at){const local=localDateTime(event.stopped_at,zone);time=local.time;const candidates=zonedDateTimeCandidates(local.date,time,zone);if(candidates.length>1)occurrence=candidates[0]===new Date(event.stopped_at).toISOString()?'earlier':'later';}
  return `<div class="tl-stop-time" data-tl-stop-time hidden><div class="tl-clock-input-row">${field('stopped_time','Heure du dernier verre · facultatif',time,'type="time" step="60" data-tl-change="stop-time"')}<div class="tl-clock-buttons">${button('stop-now','Maintenant','','tl-chip')}${button('stop-unknown','Je ne sais pas','','text')}</div></div><p class="tl-caption tl-clock-zone">Heure de ton suivi : <b>${esc(zone)}</b>.</p><fieldset class="tl-fieldset tl-clock-occurrence" data-tl-clock-occurrence hidden><legend>Cette heure existe deux fois ce jour-là</legend><p class="tl-caption">Avec le changement d’heure, laquelle correspond à ton dernier verre ?</p><div class="tl-clock-options">${[['earlier','Première occurrence'],['later','Seconde occurrence']].map(([value,label])=>`<label class="checklabel"><input type="radio" name="stop_occurrence" value="${value}"${checked(occurrence===value)}><span>${label}<small data-tl-occurrence-offset="${value}"></small></span></label>`).join('')}</div></fieldset><p class="tl-caption tl-clock-preview" data-tl-clock-preview aria-live="polite"></p></div>`;
 }
 function dateFields(value,{min='1900-01-01',max=today(),shortcuts=true,event=null,timezone=currentDoc()?.timezone||deviceZone()}={}){return `<fieldset class="tl-fieldset"><legend>Depuis quand ?</legend>${shortcuts?`<div class="tl-shortcuts" aria-label="Dates rapides">${[[0,'Aujourd’hui'],[7,'Il y a 7 jours'],[14,'Il y a 14 jours'],['month','Il y a 1 mois']].map(([n,t])=>{const date=n==='month'?monthsBefore(today(),1):moveDay(today(),-n);return button('date-shortcut',t,`data-tl-date="${date}" ${date<min||date>max?'disabled':''}`,'tl-chip');}).join('')}</div>`:''}${field('started_on','Date de début',value,`type="date" required min="${min}" max="${max}" data-tl-change="date"`)}${stopTimeFields(event,timezone)}<p class="tl-caption tl-date-preview" data-tl-date-preview aria-live="polite"></p></fieldset>`;}
 function readStopTime(f,data,c){
  if(f.dataset.tlForm!=='stop-time'&&data.get('state')!=='abstinent')return null;
  const time=String(data.get('stopped_time')||'').trim();if(!time)return null;
  const instant=zonedDateTimeToInstant(String(data.get('started_on')||''),time,formZone(c),String(data.get('stop_occurrence')||'reject'));
  elapsedSince(instant);return instant;
 }
 function stopConfirmation(){return '<div data-tl-stop-confirm hidden><label class="checklabel tl-confirm"><input type="checkbox" name="confirm_stop_time"><span>Je confirme la date et l’heure de début de cet arrêt.</span></label></div>';}
 function syncStopTime(f,c){
  const panel=f.querySelector('[data-tl-stop-time]');if(!panel)return;
  const visible=f.dataset.tlForm==='stop-time'||f.elements.state?.value==='abstinent',confirmPanel=f.querySelector('[data-tl-stop-confirm]');setPanel(panel,visible);
  if(confirmPanel){const needsConfirmation=visible&&!!f.elements.stopped_time.value;setPanel(confirmPanel,needsConfirmation);f.elements.confirm_stop_time.required=needsConfirmation;}
  if(!visible)return;
  const date=f.elements.started_on.value,time=f.elements.stopped_time.value,zone=formZone(c),key=`${date}|${time}|${zone}`,options=[...f.querySelectorAll('input[name="stop_occurrence"]')];
  if(c.timeKey!==undefined&&c.timeKey!==key){options.forEach(input=>input.checked=false);if(f.elements.confirm_stop_time)f.elements.confirm_stop_time.checked=false;}c.timeKey=key;
  const choices=f.querySelector('[data-tl-clock-occurrence]'),preview=f.querySelector('[data-tl-clock-preview]');let candidates=[];
  try{if(date&&time)candidates=zonedDateTimeCandidates(date,time,zone);}catch{}
  setPanel(choices,candidates.length>1);for(const input of options)input.required=candidates.length>1;
  for(const [i,value] of ['earlier','later'].entries()){const label=f.querySelector(`[data-tl-occurrence-offset="${value}"]`);if(label){const offset=candidates[i]?localDateTime(candidates[i],zone).offsetMinutes:null;label.textContent=offset===null?'':` · UTC${offset>=0?'+':'−'}${String(Math.floor(Math.abs(offset)/60)).padStart(2,'0')}:${String(Math.abs(offset)%60).padStart(2,'0')}`;}}
  try{const instant=readStopTime(f,new FormData(f),c);preview.textContent=instant?`Durée depuis cet instant : ${preciseDuration(instant)}.`:'Heure inconnue : tes dates restent suivies, sans inventer une heure.';preview.classList.remove('is-error');}catch(error){preview.textContent=error.message;preview.classList.add('is-error');}
  const confirmation=f.querySelector('[data-tl-stop-confirm-label]');if(confirmation)confirmation.textContent=time?'Je n’ai pas bu depuis cet instant.':'Je confirme cette date de début d’arrêt.';
 }
 function stateChoices(state){
  return `<fieldset class="tl-fieldset"><legend>Ma situation</legend><div class="tl-choices tl-choices-two">${[['abstinent','Sans alcool'],['drinking','Je consomme']].map(([value,label])=>`<label class="tl-choice"><input type="radio" name="state" value="${value}" required data-tl-change="state"${checked(state===value)}><span>${label}</span></label>`).join('')}</div></fieldset>`;
 }
 function stateAmounts(state,units='',cost=0){
  const soberCost=state==='abstinent'?cost:0;
  return `<div data-tl-abstinent hidden><div class="tl-zero"><div><strong>0</strong><span>verre / semaine</span></div><div><strong data-tl-zero-cost>${euros(validNumber(soberCost)||0)}</strong><span>d’alcool / semaine</span></div></div><details class="tl-details tl-budget-detail" ${soberCost>0?'open':''}><summary>J’ai encore des achats d’alcool</summary>${budget('abstinent_cost_week','Dépenses d’alcool par semaine',soberCost)}</details></div><div data-tl-drinking hidden><p class="tl-form-intro">Depuis cette date, une semaine habituelle :</p><div class="two-fields">${quantity('current_units_week','Verres par semaine',state==='drinking'?units:'',0.01)}${budget('current_cost_week','Dépenses par semaine',state==='drinking'?cost:'')}</div><p class="tl-caption">Une estimation suffit. Tu pourras l’ajuster.</p></div>`;
 }
 function baselineFields(baseline){return `<fieldset class="tl-fieldset tl-baseline"><legend>Avant ce changement</legend><p class="tl-caption">Sur une semaine habituelle, j’étais à :</p><div class="two-fields">${quantity('baseline_units_week','Verres par semaine',baseline.units_week)}${budget('baseline_cost_week','Dépenses par semaine',baseline.cost_week)}</div><details class="tl-details tl-help-detail"><summary>Depuis quand avais-tu ces habitudes ?</summary>${field('baseline_started_on','Début de ces habitudes',baseline.started_on,`type="date" required min="1900-01-01" max="${today()}"`)}<p class="tl-caption">Les économies sont comparées à ces habitudes, à partir de cette date.</p></details></fieldset>`;}
 function goalChoices(goal){return `<fieldset class="tl-fieldset"><legend>Mon objectif</legend><div class="tl-choices tl-choices-three">${Object.entries(MODES).map(([value,label])=>`<label class="tl-choice"><input type="radio" name="goal_mode" value="${value}" required data-tl-change="goal"${checked(goal.mode===value)}><span>${label}</span></label>`).join('')}</div><div data-tl-goal-confirm hidden><label class="checklabel tl-confirm"><input type="checkbox" name="confirm_goal_change"> Je choisis de modifier mon objectif d’arrêt.</label></div></fieldset>`;}
 function optionalGoalFields(goal){
  const triggers=[...new Set([...TRIGGERS,...(goal.triggers||[])])];
  return `<details class="tl-details tl-preferences"><summary>Objectifs et préférences <span>facultatif</span></summary><label>Mon pourquoi<textarea name="why" rows="2" maxlength="1000" placeholder="Ce que je veux retrouver…">${esc(goal.why||'')}</textarea></label><label>Mon prochain pas<textarea name="planned_action" rows="2" maxlength="500" placeholder="Une petite action qui me convient…">${esc(goal.planned_action||'')}</textarea></label><fieldset class="tl-fieldset"><legend>Mes situations à anticiper</legend><div class="tl-trigger-choices">${triggers.map(t=>`<label class="tl-trigger"><input type="checkbox" name="triggers" value="${esc(t)}"${checked((goal.triggers||[]).includes(t))}><span>${esc(t)}</span></label>`).join('')}</div></fieldset>${field('target_on','Date de mon objectif personnel',goal.target_on||'','type="date" min="1900-01-01" max="2100-12-31"')}<label class="checklabel tl-confirm"><input type="checkbox" name="support_first" data-tl-change="goal"${checked(goal.support_first)}> Je privilégie un accompagnement professionnel.</label><div data-tl-limits hidden><p class="tl-caption">Mes limites personnelles, sans quantité à atteindre.</p><div class="two-fields">${field('weekly_limit','Maximum / semaine (verres)',goal.weekly_limit??'','type="number" min="0" max="7000" step="0.01" inputmode="decimal" placeholder="Facultatif"')}${field('daily_limit','Maximum / jour (verres)',goal.daily_limit??'','type="number" min="0" max="1000" step="0.01" inputmode="decimal" placeholder="Facultatif"')}</div></div></details>`;
 }
 function supportNote(){return '<p class="tl-safety">En cas de symptômes de manque, demande une aide médicale. Si tu as bu, ne conduis pas.</p>';}
 function attach(formId,doc,extra={}){const f=$('#'+formId);if(!f)return;forms.set(f,{doc:doc?clone(doc):null,timezone:doc?.timezone||deviceZone(),versions:clone(api.versions()),generation,newId:crypto.randomUUID(),before:doc?timelineSnapshot(doc,get().checks||[],today()):null,...extra});syncForm(f);}
 function seedGoal(){const chapters=get().chapters||[],last=[...chapters].sort((a,b)=>String(a.effective_on||'').localeCompare(String(b.effective_on||''))).at(-1)||{};return {mode:MODES[last.mode]?last.mode:'abstain',weekly_limit:last.weekly_limit??null,daily_limit:last.daily_limit??null,target_on:null,why:get().journey?.why_text||'',triggers:[],support_first:!!last.support_first,planned_action:last.planned_action||''};}
 function openSetup(){
  assertReady();if(currentDoc())return openSettings();const data=get(),goal=seedGoal(),baseline={started_on:monthsBefore(today(),12),units_week:validNumber(data.settings?.baseline_units_week),cost_week:validNumber(data.settings?.baseline_cost_week??data.journey?.weekly_spend_estimate)};
  const initialDate=safeDate(data.journey?.started_at,today());
  const steps=[
   {label:'Ma situation',title:'Où en es-tu aujourd’hui ?',body:`${stateChoices('')}${dateFields(initialDate>today()?today():initialDate)}<p class="tl-caption">Tu as déjà arrêté ? Indique ta vraie date de début.</p>`},
   {label:'Mes repères',title:'Tes habitudes, simplement',body:`${stateAmounts('',null,0)}${baselineFields(baseline)}`},
   {label:'Vérifier',title:'Ton suivi peut commencer',body:`${goalChoices(goal)}${optionalGoalFields(goal)}${reviewReceipt()}${savePreview()}${stopConfirmation()}<label class="checklabel tl-confirm"><input type="checkbox" name="confirm_periods" required> Ces dates et estimations me correspondent.</label>`}
  ];
  api.modal('Mon point de départ',`<form id="tlStartForm" class="tl-form tl-wizard" data-tl-form="start" novalidate>${wizard(steps,'Commencer mon suivi')}</form>`);
  attach('tlStartForm',null,{originalMode:data.chapters?.length?goal.mode:null});
 }
 function openSettings(){
  assertReady();if(!currentDoc())return openSetup();const d=currentDoc();
  const steps=[
   {label:'Mon objectif',title:'Qu’aimerais-tu changer ?',body:`${goalChoices(d.goal)}${optionalGoalFields(d.goal)}`},
   {label:'Mes repères',title:'Tes habitudes de départ',body:`${baselineFields(d.baseline)}<p class="tl-caption">Ces chiffres servent à calculer tes progrès et tes économies.</p>`},
   {label:'Vérifier',title:'Vérifie tes repères',body:`${reviewReceipt()}${savePreview()}<label class="checklabel tl-confirm"><input type="checkbox" name="confirm_periods" required> Je confirme ces repères.</label>`}
  ];
  api.modal('Mon objectif et mes repères',`<form id="tlSettingsForm" class="tl-form tl-wizard" data-tl-form="settings" novalidate>${wizard(steps,'Enregistrer mes choix')}<div class="tl-modal-links">${button('date','Corriger ma date actuelle','','text')}${button('history','Mon historique','','text')}</div></form>`);
  attach('tlSettingsForm',d,{originalMode:d.goal.mode});
 }
 function openDate(){
  assertReady();if(!currentDoc())return openSetup();const d=currentDoc(),s=snap(),c=s.current;
  if(s.stopClock?.valid)return openStopTime();
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
 function openStopTime(){
  assertReady();if(!currentDoc())return openSetup();const d=currentDoc(),s=snap(),latest=[...d.events].sort((a,b)=>a.started_on.localeCompare(b.started_on)).at(-1);
  const existing=latest?.state==='abstinent'&&(!s.lastConsumptionOn||s.lastConsumptionOn<=latest.started_on)?latest:null;
  const date=existing?.started_on||s.currentStreakStartedOn||today();
  api.modal('La date et l’heure de ton arrêt',`<form id="tlStopTimeForm" class="tl-form tl-wizard tl-stop-form" data-tl-form="stop-time" novalidate><p class="tl-form-intro">Quand as-tu pris ton dernier verre ? Tu peux laisser l’heure vide si tu ne la connais pas.</p>${dateFields(date,{shortcuts:false,event:existing,timezone:d.timezone})}<div class="tl-collision" data-tl-stop-conflict hidden></div><label class="checklabel tl-confirm"><input type="checkbox" name="confirm_stop_time" required><span data-tl-stop-confirm-label>Je n’ai pas bu depuis cet instant.</span></label>${errorBox()}<footer class="tl-wizard-footer"><button type="submit" class="primary tl-step-submit">Enregistrer mon arrêt</button></footer></form>`);
  attach('tlStopTimeForm',d,{editId:existing?.id||null,editKind:'event',originalMode:d.goal.mode});
 }
 function stopTimeConflict(c,date){
  if(!date)return null;
  const same=c.doc.events.find(e=>e.id!==c.editId&&e.started_on===date);
  if(same)return {message:'Un arrêt ou une reprise existe déjà à cette date. Ouvre ce repère pour le corriger.',action:'edit-event',id:same.id,label:'Ouvrir ce repère'};
  if(date<c.doc.baseline.started_on)return {message:'Cette date est antérieure à tes premiers repères. Vérifie aussi tes habitudes de départ.',action:'edit-stop-full',label:'Corriger avec mes anciens repères'};
  if(c.doc.events.some(e=>e.id!==c.editId&&e.started_on>date))return {message:'Un changement de rythme plus récent est déjà renseigné. Retrouve-le dans ton historique avant de préciser ton arrêt actuel.',action:'history',label:'Voir mon historique'};
  return null;
 }
 function openChange(date){assertReady();if(!currentDoc())return openSetup();openEvent(date||today(),null,!date);}
 function savePreview(){return '<section class="tl-save-preview" data-tl-save-preview aria-live="polite" hidden></section>';}
 function openEvent(date,id,create=false){
  const d=currentDoc(),ordered=[...d.events].sort((a,b)=>a.started_on.localeCompare(b.started_on)),existing=id?ordered.find(e=>e.id===id):create?null:ordered.find(e=>e.started_on===date),editId=existing?.id||null;
  const previous=ordered.filter(e=>e.id!==editId&&e.started_on<(existing?.started_on||date)).at(-1),next=ordered.find(e=>e.id!==editId&&e.started_on>(existing?.started_on||date));
  const min=existing&&previous?moveDay(previous.started_on,1):'1900-01-01',max=existing&&next?moveDay(next.started_on,-1):today(),active=existing||previous||ordered[0],state=existing?.state||'';
  const steps=[
   {label:'Quand ?',title:'Qu’est-ce qui a changé ?',body:`${stateChoices(state)}${dateFields(existing?.started_on||date,{min,max,event:existing,timezone:d.timezone})}<div class="tl-collision" data-tl-event-overlap hidden></div><p class="tl-caption">Pour une consommation terminée, choisis plutôt « Une période ».</p>${button('new-range','Renseigner une période terminée','','text')}`},
   {label:'Mon rythme',title:'Quel est ton rythme ?',body:`${stateAmounts(state,active.units_week,active.cost_week)}<div data-tl-event-baseline ${existing?'':'hidden'}>${baselineFields(d.baseline)}</div><details class="tl-details"><summary>Ajouter une note <span>facultatif</span></summary><label>Ma note<textarea name="note" rows="2" maxlength="300">${esc(existing?.note||'')}</textarea></label></details>`},
   {label:'Vérifier',title:'Ton parcours se met à jour',body:`${reviewReceipt()}${savePreview()}${stopConfirmation()}<div data-tl-event-confirm><label class="checklabel tl-confirm"><input type="checkbox" name="confirm_periods" ${existing?'required':''}> Je confirme ces dates et mes habitudes précédentes.</label></div><p class="tl-caption">Ton objectif reste : ${esc(MODES[d.goal.mode])}.</p>`}
  ];
  api.modal(existing?'Corriger un arrêt ou une reprise':'Arrêt ou reprise',`<form id="tlEventForm" class="tl-form tl-wizard" data-tl-form="event" novalidate>${wizard(steps,existing?'Enregistrer la correction':'Enregistrer mon rythme')}${existing&&d.events.length>1?`<div class="tl-modal-links">${button('remove-open','Supprimer cette erreur','','text tl-remove')}</div>`:''}</form>`);
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
  const steps=[
   {label:'Quand ?',title:'Quand as-tu consommé ?',body:`${choices}<div data-tl-day>${dayShortcuts()}${field('date','Le jour de la consommation',existing?.date||date,`type="date" required min="1900-01-01" max="${today()}" data-tl-change="occasion-date"`)}</div><div data-tl-range hidden><div class="two-fields tl-range-dates">${field('started_on','Du',first,`type="date" required min="1900-01-01" max="${today()}"`)}${field('ended_on','Au (inclus)',last,`type="date" required min="1900-01-01" max="${today()}"`)}</div><p class="tl-range-duration" data-tl-range-duration aria-live="polite"></p></div><div class="tl-collision" data-tl-collision hidden></div><p class="tl-caption">Une date passée fonctionne aussi.</p>`},
   {label:'Combien ?',title:'Verres et dépenses',body:`<div data-tl-day><p class="tl-form-intro">Le total de cette journée :</p><div class="two-fields">${quantity('units','Verres consommés',kind==='occasion'?existing?.units??'':'',0.01,1000)}${budget('cost','Dépenses d’alcool',kind==='occasion'?existing?.cost??'':'',1000000)}</div><div class="tl-quick-values">${button('set-number','0 € · rien dépensé',`data-tl-field="cost" data-tl-value="0"`,'tl-chip')}</div><p class="tl-caption">Compte uniquement l’argent dépensé ce jour-là.</p></div><div data-tl-range hidden><fieldset class="tl-fieldset tl-range-state"><legend>Pendant cette période</legend><div class="tl-choices tl-choices-two">${[['drinking','J’ai consommé'],['abstinent','Sans alcool']].map(([value,label])=>`<label class="tl-choice"><input type="radio" name="range_state" value="${value}" data-tl-change="range-state"${checked(rangeState===value)}><span>${label}</span></label>`).join('')}</div></fieldset><div data-tl-range-drinking><p class="tl-form-intro">En moyenne, sur une semaine :</p><div class="two-fields">${quantity('range_units_week','Verres par semaine',range?.state==='drinking'?range.units_week:'',0.01)}${budget('range_cost_week','Dépenses par semaine',range?.state==='drinking'?range.cost_week:'')}</div><p class="tl-caption">Une estimation suffit. Le total de la période est calculé pour toi.</p></div><div data-tl-range-sober hidden><p class="tl-form-intro">0 verre pendant cette période.</p><details class="tl-details tl-budget-detail" ${range?.state==='abstinent'&&range.cost_week>0?'open':''}><summary>J’ai encore des achats d’alcool</summary>${budget('range_sober_cost','Dépenses par semaine',range?.state==='abstinent'?range.cost_week:0)}</details></div>${rangeBaseline?baselineFields(d.baseline):''}<details class="tl-details"><summary>Ajouter une note <span>facultatif</span></summary><label>Ma note<textarea name="range_note" rows="2" maxlength="300">${esc(range?.note||'')}</textarea></label></details></div><details class="tl-details tl-help-detail"><summary>Comment compter mes verres et mes dépenses ?</summary><p class="tl-caption">Un verre standard correspond à environ 10 g d’alcool : par exemple, 25 cl de bière à 5 % ou 10 cl de vin à 12 %. Une grande portion peut donc compter pour plusieurs verres.</p><p class="tl-caption">Pour un jour, indique les quantités et dépenses de ce jour. Pour une période, indique ta moyenne par semaine. Les journées déjà notées restent prioritaires.</p><a class="text" href="https://www.alcool-info-service.fr/sites/default/files/2024-12/Alcool_Infographie_reperes.pdf" target="_blank" rel="noopener noreferrer">Les équivalences · Alcool Info Service</a></details>`},
   {label:'Vérifier',title:'Tout est correct ?',body:`${reviewReceipt()}<p class="tl-caption" data-tl-consumption-hint></p>${rangeBaseline?'<label class="checklabel tl-confirm"><input type="checkbox" name="confirm_periods" required> Je confirme ces dates et mes habitudes précédentes.</label>':''}${savePreview()}`}
  ];
  api.modal(existing?(kind==='range'?'Corriger cette période':'Corriger cette consommation'):'Ajouter une consommation',`<form id="tlOccasionForm" class="tl-form tl-wizard" data-tl-form="consumption" novalidate>${wizard(steps,'Enregistrer','data-tl-consumption-submit')}${existing?`<div class="tl-modal-links">${button('remove-open','Supprimer cette erreur','','text tl-remove')}</div>`:''}</form>`);
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
  syncStopTime(f,c);
  const datePreview=f.querySelector('[data-tl-date-preview]');if(datePreview){const precise=!!f.elements.stopped_time?.value&&!f.elements.stopped_time.disabled;datePreview.hidden=precise;try{const days=dayDiff(today(),f.elements.started_on.value);datePreview.textContent=days===0?'À partir d’aujourd’hui.':`${duration(days)} depuis cette date.`;}catch{datePreview.textContent='';}}
  if(f.dataset.tlForm==='stop-time'){
   const conflict=stopTimeConflict(c,f.elements.started_on.value),out=f.querySelector('[data-tl-stop-conflict]');out.hidden=!conflict;
   out.innerHTML=conflict?`<p>${esc(conflict.message)}</p>${button(conflict.action,conflict.label,conflict.id?`data-tl-id="${esc(conflict.id)}"`:'','text')}`:'';
  }
  if(f.elements.abstinent_cost_week){const output=f.querySelector('[data-tl-zero-cost]');if(output)output.textContent=euros(validNumber(f.elements.abstinent_cost_week.value)||0);}
  if(f.dataset.tlForm==='event'){
   const baseline=!!c.editId||!!f.elements.started_on.value&&f.elements.started_on.value<c.doc.baseline.started_on;setPanel(f.querySelector('[data-tl-event-baseline]'),baseline);setPanel(f.querySelector('[data-tl-event-confirm]'),baseline);f.elements.confirm_periods.required=baseline;
   const range=(c.doc.ranges||[]).find(r=>r.started_on<=f.elements.started_on.value&&r.ended_on>=f.elements.started_on.value),same=c.doc.events.find(e=>e.id!==c.editId&&e.started_on===f.elements.started_on.value),overlap=f.querySelector('[data-tl-event-overlap]');overlap.hidden=!range&&!same;
   if(same)overlap.innerHTML=`<p>Un changement de rythme existe déjà à cette date.</p>${button('edit-event','Modifier ce repère',`data-tl-id="${same.id}"`,'text')}`;
   else if(range)overlap.innerHTML=`<p>Une période est déjà renseignée du ${dateLabel(range.started_on)} au ${dateLabel(range.ended_on)}. Elle reste prise en compte sur ces dates.</p>${button('edit-range','Modifier cette période',`data-tl-id="${range.id}"`,'text')}`;
  }
  if(f.dataset.tlForm==='consumption'){
   const kind=formKind(f,c),isRange=kind==='range';for(const p of f.querySelectorAll('[data-tl-day]'))setPanel(p,!isRange);for(const p of f.querySelectorAll('[data-tl-range]'))setPanel(p,isRange);
   const sober=isRange&&f.elements.range_state.value==='abstinent';setPanel(f.querySelector('[data-tl-range-drinking]'),isRange&&!sober);setPanel(f.querySelector('[data-tl-range-sober]'),sober);
   const hint=f.querySelector('[data-tl-consumption-hint]'),collision=f.querySelector('[data-tl-collision]'),submit=f.querySelector('[data-tl-consumption-submit]');collision.hidden=true;collision.replaceChildren();
   if(isRange){
    const start=f.elements.started_on.value,end=f.elements.ended_on.value,output=f.querySelector('[data-tl-range-duration]');f.elements.ended_on.min=start||'1900-01-01';
    try{const days=dayDiff(end,start)+1;output.textContent=days>0?`${duration(days)} · dates incluses`:'La fin doit suivre le début.';}catch{output.textContent='';}
    const other=(c.doc.ranges||[]).find(r=>r.id!==c.editId&&start&&end&&r.started_on<=end&&r.ended_on>=start);
    if(other){collision.hidden=false;collision.innerHTML=`<p>Une période existe déjà du ${dateLabel(other.started_on)} au ${dateLabel(other.ended_on)}.</p>${button('edit-range','Modifier la période existante',`data-tl-id="${other.id}"`,'text')}`;}
    hint.textContent='Après cette période, ton rythme déjà déclaré reste en place.';c.submitLabel=c.editId?'Enregistrer la correction':'Enregistrer cette période';submit.textContent=c.submitLabel;
   }else{
    syncDay(f);const same=c.doc.occasions.find(o=>o.date===f.elements.date.value),conflict=!!same&&same.id!==c.editId;
    if(conflict){collision.hidden=false;collision.innerHTML=`<p>Une consommation est déjà renseignée ce jour-là.</p>${button('edit-occasion','Modifier cette journée',`data-tl-date="${same.date}"`,'text')}`;}
    hint.textContent=same?'Tu corriges le total de cette journée.':'Cette consommation sera placée à sa vraie date dans ton historique.';c.submitLabel=c.editId||same?'Enregistrer la correction':'Enregistrer la consommation';submit.textContent=c.submitLabel;
   }
  }
  if(f.elements.baseline_started_on&&!f.elements.baseline_started_on.disabled){const dates=(c.doc?.events||[]).filter(e=>e.id!==c.editId).map(e=>e.started_on);if(f.elements.started_on&&!f.elements.started_on.disabled&&f.dataset.tlForm!=='consumption')dates.push(f.elements.started_on.value);f.elements.baseline_started_on.max=dates.filter(Boolean).sort()[0]||today();}
  for(const b of f.querySelectorAll('[data-tl-action="date-shortcut"]'))b.setAttribute('aria-pressed',String(b.dataset.tlDate===f.elements.started_on?.value));
  for(const b of f.querySelectorAll('[data-tl-action="quantity-step"]')){const input=f.elements[b.dataset.tlField],value=input.value===''?null:Number(input.value),delta=Number(b.dataset.tlDelta);b.disabled=input.disabled||(delta<0&&(value===null||value<=(Number(input.min)>0?1:0)))||(delta>0&&value!==null&&value>=Number(input.max));}
  updateReceipt(f,c);updatePreview(f,c);syncWizard(f);
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
  let doc=c.doc?{...clone(c.doc),schema_version:3,ranges:clone(c.doc.ranges||[])}:null,clockTarget=null;const type=f.dataset.tlForm;
  if(type==='start'){clockTarget=eventFrom(data,c.newId);doc={schema_version:3,timezone:formZone(c),baseline:baselineFrom(data),events:[clockTarget],occasions:[],ranges:[],goal:goalFrom(data,c,{preview})};}
  if(type==='settings'){doc.baseline=baselineFrom(data);doc.goal=goalFrom(data,c,{preview});}
  if(type==='event'){
   const event=eventFrom(data,c.editId||c.newId);if(event.started_on<c.min||event.started_on>c.max)throw Error('Choisis une date entre les deux changements de rythme voisins.');
   if(doc.events.some(e=>e.id!==c.editId&&e.started_on===event.started_on))throw Error('Un changement de rythme existe déjà à cette date. Modifie ce repère.');
   if(c.editId)doc.events=doc.events.map(e=>e.id===c.editId?event:e);else doc.events.push(event);
   clockTarget=event;
   if(data.has('baseline_started_on'))doc.baseline=baselineFrom(data);
  }
  if(type==='stop-time'){
   const date=String(data.get('started_on')||''),conflict=stopTimeConflict(c,date);if(conflict)throw Error(conflict.message);
   const previous=doc.events.find(e=>e.id===c.editId);
   clockTarget={id:c.editId||c.newId,started_on:date,state:'abstinent',units_week:0,cost_week:previous?.cost_week??0,note:previous?.note||''};
   if(c.editId)doc.events=doc.events.map(e=>e.id===c.editId?clockTarget:e);else doc.events.push(clockTarget);
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
  if(clockTarget?.state==='abstinent'){
   const instant=readStopTime(f,data,c),previous=c.doc?.events.find(e=>e.id===clockTarget.id);
   if(instant){
    clockTarget.stopped_at=instant;
    // An unrelated correction must keep the original facts confirmed for this
    // time. Only a changed time or the dedicated confirmation renews the basis.
    const unchanged=type!=='stop-time'&&previous?.stopped_at&&new Date(previous.stopped_at).getTime()===new Date(instant).getTime()&&previous.started_on===clockTarget.started_on;
    clockTarget.stop_basis=unchanged?previous.stop_basis:timelineStopBasis(doc,get().checks||[],clockTarget.started_on);
   }
  }
  validateDates(doc);const validated=validateTimelineDocument(doc,today());
  if(type==='stop-time'&&clockTarget?.stopped_at&&!timelineSnapshot(validated,get().checks||[],today()).stopClock?.valid)throw Error('Une consommation ou une période plus récente est renseignée. Corrige-la dans ton historique ou choisis l’instant de ton dernier arrêt.');
  return validated;
 }
 function updatePreview(f,c){
  const out=f.querySelector('[data-tl-save-preview]');if(!out)return;
  try{
   const doc=draftFrom(f,new FormData(f),c,{preview:true}),s=timelineSnapshot(doc,get().checks||[],today()),saved=s.summary?.saved;
   const clock=s.stopClock?.valid?s.stopClock:null,date=clock?`Sans alcool depuis le ${esc(clockLabel(clock.startedAt,doc.timezone))}.`:s.current.state==='abstinent'&&s.currentStreakStartedOn?`Sans alcool depuis le ${dateLabel(s.currentStreakStartedOn)}.`:'Les consommations déclarées restent prises en compte.';
   out.innerHTML=`<div class="tl-preview-heading"><span>Aperçu après enregistrement</span><small>Pas encore enregistré</small></div><div class="tl-preview-grid"><div><strong>${clock?preciseDuration(clock.startedAt):number(s.currentStreak)}</strong><span>${clock?'durée réelle · arrêt en cours':'jours · arrêt en cours'}</span></div><div><strong>${number(s.totalSoberDays)}</strong><span>jours sans alcool cumulés</span></div><div><strong>${euros(Math.abs(saved))}</strong><span>${saved<0?'dépenses en plus estimées':'économies estimées'}</span></div></div><p>${date} Les courbes suivront ces dates.</p>`;out.hidden=false;
  }catch{out.hidden=true;out.replaceChildren();}
 }
 function showError(f,error){const out=f.querySelector('[data-tl-error]');if(out){out.hidden=false;out.textContent=String(error?.message||error||'L’enregistrement a échoué.');out.scrollIntoView?.({block:'nearest'});}}
 async function saveForm(f,data){
  const c=forms.get(f);if(!c||c.generation!==generation)throw Error('Rouvre ce formulaire pour actualiser ton suivi.');
  if(f.elements.confirm_periods&&!f.elements.confirm_periods.disabled&&!data.get('confirm_periods'))throw Error('Confirme tes dates et tes anciens repères.');
  if(f.elements.confirm_stop_time&&!f.elements.confirm_stop_time.disabled&&!data.get('confirm_stop_time'))throw Error(f.dataset.tlForm==='stop-time'?'Confirme ton arrêt depuis la date et l’heure choisies.':'Confirme la date et l’heure de cet arrêt.');
  if(f.dataset.tlForm==='remove'&&!data.get('confirm_remove'))throw Error('Confirme que cette déclaration était une erreur.');
  const validated=draftFrom(f,data,c),saved=await api.save(validated,c.versions);
  if(saved!==true||c.generation!==generation)return;
  if(document.contains(f))api.closeModal();api.render();
  api.notify(f.dataset.tlForm==='start'?'Ton suivi est prêt. Les dates passées sont prises en compte.':f.dataset.tlForm==='remove'?'Déclaration retirée. Compteurs et courbes recalculés.':'Enregistré. Compteurs et courbes mis à jour.');
 }
 const actions={
  setup:openSetup,settings:openSettings,date:openDate,'stop-time':openStopTime,occasion:()=>openOccasion(),change:()=>openChange(),
  progress:()=>{api.closeModal();api.openProgress();},history:()=>{api.closeModal();api.openPage('journey');},games:()=>api.openPage('games'),
  help:()=>{api.modal('Un peu de soutien',`<p>Tu peux faire une pause et contacter une personne de confiance.</p><p class="tl-safety">En cas de symptômes de manque, demande une aide médicale. En cas d’urgence, appelle le 15 ou le 112.</p><div class="row"><a class="secondary tl-support-link" href="tel:0980980930">Alcool Info Service</a><a class="secondary tl-support-link" href="tel:112">112 · Urgence</a></div>`);},
  'edit-event':b=>{assertReady();const event=currentDoc()?.events.find(e=>e.id===b.dataset.tlId);if(!event)throw Error('Cette période n’est plus disponible.');openEvent(event.started_on,event.id);},
  'edit-occasion':b=>openOccasion(b.dataset.tlDate),'edit-range':b=>openRange(b.dataset.tlId),
  'new-range':()=>openRange(null),
  'remove-open':b=>openRemove(b.closest('form')),
  'wizard-back':b=>{const f=b.closest('form'),c=forms.get(f);if(!c)return;c.step=Math.max(0,(c.step||0)-1);const out=f.querySelector('[data-tl-error]');if(out)out.hidden=true;syncWizard(f,{focus:true});},
  'quantity-step':b=>{const f=b.closest('form'),input=f.elements[b.dataset.tlField];if(!input||input.disabled)return;const value=Number(input.value||0),next=Math.round((value+Number(b.dataset.tlDelta))*100)/100;input.value=Math.min(Number(input.max),Math.max(Number(input.min)>0?1:0,next));syncForm(f);},
  'set-number':b=>{const f=b.closest('form'),input=f.elements[b.dataset.tlField];if(!input||input.disabled)return;input.value=b.dataset.tlValue;syncForm(f);},
  'stop-now':b=>{const f=b.closest('form'),c=forms.get(f);if(!c)return;const local=localDateTime(new Date(),formZone(c));f.elements.started_on.value=local.date;f.elements.stopped_time.value=local.time;syncForm(f);},
  'stop-unknown':b=>{const f=b.closest('form');f.elements.stopped_time.value='';for(const input of f.querySelectorAll('input[name="stop_occurrence"]'))input.checked=false;syncForm(f);},
  'edit-stop-full':b=>{const f=b.closest('form'),c=forms.get(f);if(!c)return;const date=f.elements.started_on.value,time=f.elements.stopped_time.value;openEvent(date,c.editId,!c.editId);const next=$('#tlEventForm');if(!next)return;next.elements.state.value='abstinent';next.elements.started_on.value=date;next.elements.stopped_time.value=time;syncForm(next);},
  'date-shortcut':b=>{const f=b.closest('form');f.elements.started_on.value=b.dataset.tlDate;syncForm(f);},
  'day-shortcut':b=>{const f=b.closest('form');f.elements.date.value=b.dataset.tlDate;syncDay(f,{fill:true});syncForm(f);},
  'choose-day':b=>{const input=b.closest('form').elements.date;input.focus();try{input.showPicker?.();}catch{}},
 };
 document.addEventListener('click',async e=>{if(summary.handleClick(e.target)){e.preventDefault();e.stopImmediatePropagation();return;}const b=e.target.closest('[data-tl-action]');if(!b||b.disabled)return;const action=actions[b.dataset.tlAction];if(!action)return;e.preventDefault();e.stopImmediatePropagation();b.disabled=true;try{await action(b);}catch(error){const f=b.closest('form');if(f)showError(f,error);else api.notify(String(error?.message||error));}finally{if(b.dataset.tlAction!=='quantity-step')b.disabled=false;}},true);
 document.addEventListener('change',e=>{const f=e.target.closest('form[data-tl-form]');if(!f)return;if(e.target.dataset.tlChange==='occasion-date')syncDay(f,{fill:true});syncForm(f);});
 document.addEventListener('input',e=>{const f=e.target.closest('form[data-tl-form]');if(f){if(e.target.dataset.tlChange==='occasion-date')syncDay(f,{fill:true});syncForm(f);}});
 document.addEventListener('submit',async e=>{const f=e.target;if(!f.matches('form[data-tl-form]'))return;e.preventDefault();e.stopImmediatePropagation();const submit=e.submitter||f.querySelector('button[type="submit"]');if(submit?.disabled)return;const out=f.querySelector('[data-tl-error]');if(out)out.hidden=true;try{const c=forms.get(f),panels=f.querySelectorAll('[data-tl-step]');if(panels.length&&(c?.step||0)<panels.length-1){advanceWizard(f);return;}if(!checkFields(f))return;const data=new FormData(f);if(submit)submit.disabled=true;await saveForm(f,data);}catch(error){showError(f,error);}finally{if(submit)submit.disabled=false;}},true);
 function tickHomeClock(){
  const face=document.querySelector('[data-tl-live-start]');if(!face||document.hidden||document.querySelector('dialog[open]')||!get().ready||!currentDoc())return;
  try{const clock=snap().stopClock;if(!clock?.valid||clock.startedAt!==face.dataset.tlLiveStart||today()!==face.dataset.tlLiveDay){api.render();return;}const text=preciseDuration(clock.startedAt)+' ';if(face.firstChild?.nodeType===3&&face.firstChild.nodeValue!==text)face.firstChild.nodeValue=text;}catch{}
 }
 globalThis.window?.setInterval(tickHomeClock,15000);document.addEventListener('visibilitychange',tickHomeClock);
 return {home,view,journey,settingsSummary,summary:()=>summary.view(),openSettings,openDate,openStopTime,openOccasion,openRange,openChange,reset};
}
