import {esc,parseDay,dateLabel} from './core.mjs';
import {dailyOverview} from './daily-core.mjs';
import {localDateTime} from './time-core.mjs';
import {stageProgress} from './health-core.mjs';
import {HEALTH_STAGES} from './health-evidence.mjs';

// Presentation only. The timeline remains the source of dates and declarations;
// daily-entry owns saves. No private data is written to browser storage.
const paths={check:'M5 12l4 4L19 6',arrow:'M5 12h14m-6-6 6 6-6 6',calendar:'M8 3v4m8-4v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z',plan:'M5 4h14v17H5V4Zm4-2h6v4H9V2Zm-1 9h8m-8 4h5',heart:'M20.5 5.5a5 5 0 0 0-7 0L12 7l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-8.5a5 5 0 0 0 0-7Z',spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',pause:'M8 5v14M16 5v14',goal:'M12 22V3m0 1h8l-2 4 2 4h-8M7 22h10'};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.arrow}"/></svg>`;
const plural=(n,one,many=one+'s')=>n===1?one:many;
const dateText=(date,options)=>parseDay(date).toLocaleDateString('fr-FR',options);

export function createDailyUI(api){
 const {S,progression,health}=api;
 let month=null,owner=null,renderedDay=null;
 function reset(){month=null;owner=null;renderedDay=null;}
 function overview(){
  if(owner!==S.user){reset();owner=S.user;}
  const today=progression.today();
  if(month&&month>today.slice(0,7))month=today.slice(0,7);
  const doc=progression.document();
  return {...dailyOverview({document:doc,today,now:new Date().toISOString(),checks:S.checks,healthRows:health.exportRows(),journal:S.journal,program:S.program,month:month||today.slice(0,7)}),baseline:doc?.baseline?.started_on||'1900-01-01'};
 }
 function face(j){
  if(!j.active)return {value:'—',unit:'arrêt à renseigner',detail:'Ton historique reste conservé.'};
  if(j.precision!=='minute')return {value:String(j.days),unit:plural(j.days,'jour')+' sans alcool',detail:'Selon les dates de ton parcours · heure à préciser'};
  const total=j.elapsedMinutes,days=Math.floor(total/1440),hours=Math.floor(total/60)%24,minutes=total%60;
  if(days)return {value:String(days),unit:plural(days,'jour')+' sans alcool',detail:`Et ${hours} h ${String(minutes).padStart(2,'0')} min · depuis ton dernier verre déclaré`};
  if(total>=60)return {value:String(Math.floor(total/60)),unit:plural(Math.floor(total/60),'heure')+' sans alcool',detail:`Et ${minutes} min · depuis ton dernier verre déclaré`};
  return {value:String(total),unit:plural(total,'minute')+' sans alcool',detail:'Depuis ton dernier verre déclaré. Ton départ compte.'};
 }
 function capText(m){
  if(!m.nextCap)return {title:'Ton parcours continue',detail:'Chaque nouvelle journée garde sa place.',percent:100};
  const cap=m.nextCap,elapsed=m.journey.precision==='minute'?m.journey.elapsedMinutes:m.journey.days*1440;
  const start=m.currentCap?.fromMinutes||0;
  const percent=Math.max(0,Math.min(100,Math.floor((elapsed-start)/(cap.fromMinutes-start)*100)));
  const target=cap.targetAt?localDateTime(cap.targetAt,m.timeZone):null;
  return {title:`Prochain repère : ${cap.label}`,detail:target?`${dateLabel(target.date)} à ${target.time}`:`Vers le ${dateLabel(cap.targetDate)} · heure à préciser`,percent};
 }
 function progressCard(m){
  const j=m.journey,goal=m.ritual.intention;
  if(j.mode!=='abstain')return `<section class="dy-focus dy-focus-observe"><span class="eyebrow">MON OBJECTIF · ${esc(j.modeLabel.toLocaleUpperCase('fr-FR'))}</span><h2>Tu reprends la main.</h2><p>${esc(goal.why||'Une journée après l’autre, tu construis des repères qui te ressemblent.')}</p><div class="dy-counter"><strong>${m.week.declaredDays}<span class="dy-counter-denominator">/7</span></strong><span>jours renseignés</span></div><p class="dy-clock-detail">Sur les 7 derniers jours. Chaque observation t’aide à mieux connaître ton rythme.</p><button type="button" class="text" data-tl-action="settings">Ajuster mon objectif ${icon('arrow')}</button></section>`;
  if(!j.active)return `<section class="dy-focus"><span class="eyebrow">MON OBJECTIF · ARRÊTER</span><h2>Le prochain pas commence ici.</h2><p>Renseigne ton dernier verre pour retrouver ton compteur et les prochaines étapes de ton arrêt.</p><button type="button" class="primary" data-tl-action="stop-time">Renseigner mon arrêt ${icon('arrow')}</button><p class="dy-clock-detail">Les journées et les efforts déjà notés restent dans ton historique.</p></section>`;
  const f=face(j),cap=capText(m),start=j.startedAt?localDateTime(j.startedAt,m.timeZone):null;
  return `<section class="dy-focus"><div class="dy-focus-top"><span class="eyebrow">MON ARRÊT EN COURS</span><span class="dy-earned">${icon('check')}<span data-daily-earned>${m.currentCap?esc(m.currentCap.label)+' parcourus':'Premier pas posé'}</span></span></div><div class="dy-counter"><strong data-daily-clock-value>${esc(f.value)}</strong><span data-daily-clock-unit>${esc(f.unit)}</span></div><p class="dy-clock-detail" data-daily-clock-detail>${esc(f.detail)}</p><div class="dy-next-cap"><div class="dy-next-cap-top"><strong data-daily-cap-title>${esc(cap.title)}</strong><span data-daily-cap-date>${esc(cap.detail)}</span></div><div class="dy-cap-track" role="progressbar" aria-label="Durée parcourue vers le prochain repère" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${cap.percent}"><span class="dy-cap-fill" style="width:${cap.percent}%"></span></div><small>Des repères de parcours, à ton rythme.</small></div><button type="button" class="dy-start-edit" data-tl-action="stop-time">Depuis le ${dateLabel(j.startDate)}${start?` à ${esc(start.time)}`:' · préciser l’heure'} <span>Modifier</span></button></section>`;
 }
 function dayButton(day,{compact=false}={}){
  const weekday=dateText(day.date,{weekday:'short'}).replace('.','');
  const status=day.beforeStart?'Avant le suivi':day.provenance==='declared'?(day.state==='abstinent'?'Sans alcool':'Avec alcool'):day.estimated?'Selon période':day.future?'À venir':'À noter';
  const mark=day.state==='abstinent'?icon('check'):day.state==='drinking'?'<span aria-hidden="true">•</span>':day.future?'<span aria-hidden="true">·</span>':'<span aria-hidden="true">+</span>';
  return `<button type="button" class="dy-day-button ${compact?'dy-day-compact':''} ${day.today?'is-today':''}" data-daily-action="day" data-date="${day.date}" data-state="${day.state}" data-provenance="${day.provenance}" ${day.future||day.beforeStart?'disabled':''} ${day.today?'aria-current="date"':''} aria-label="${esc(dateText(day.date,{weekday:'long',day:'numeric',month:'long',year:'numeric'})+', '+(day.beforeStart?'Avant le début de ton suivi':day.label)+(day.partial?' · journée en cours':'')+(day.future||day.beforeStart?'':'. Ouvrir cette journée'))}">${compact?`<span class="dy-weekday">${day.today?'Auj.':esc(weekday)}</span>`:''}<span class="dy-day-number">${Number(day.date.slice(8))}</span><span class="dy-day-mark">${mark}</span><span class="dy-day-status">${status}</span></button>`;
 }
 function legend(){return `<div class="dy-legend" aria-label="Légende du calendrier"><span><i data-state="abstinent" aria-hidden="true"></i>Sans alcool déclaré</span><span><i data-state="drinking" aria-hidden="true"></i>Consommation déclarée</span><span><i data-provenance="estimated" aria-hidden="true"></i>Selon une période</span><span><i data-state="unknown" aria-hidden="true"></i>Non renseigné</span></div>`;}
 function weekView(m){return `<section class="dy-week" aria-labelledby="dy-week-title"><div class="dy-section-heading"><div><span class="eyebrow">MON PARCOURS</span><h2 id="dy-week-title">Les 7 derniers jours</h2><p>Du ${dateLabel(m.week.start)} au ${dateLabel(m.today)}</p></div><button type="button" class="text dy-entry-link" data-daily-action="day" data-date="${m.today}">Renseigner une journée ${icon('arrow')}</button></div><div class="dy-week-days">${m.week.days.map(d=>dayButton({...d,beforeStart:d.date<m.baseline},{compact:true})).join('')}</div><div class="dy-week-footer"><p>${m.journey.totalSoberDays>0?`<strong>${m.journey.totalSoberDays} ${plural(m.journey.totalSoberDays,'jour')} sans alcool dans ton parcours.</strong> Chaque journée garde sa place.`:'Ton histoire se construit, une journée après l’autre.'}</p>${legend()}</div></section>`;}
 function benefitData(m){
  const progress=stageProgress(m.journey.active?m.snapshot:null,HEALTH_STAGES,m.today,new Date());
  const current=progress.stages[progress.stageIndex];
  const stage=current&&current.fromMinutes>=10080?current:HEALTH_STAGES.find(stage=>stage.id==='one-month');
  const scope=current&&current.fromMinutes>=10080?`À ce stade · ${stage.rangeLabel}`:'En continuant · autour d’un mois';
  return {stage,scope};
 }
 function benefitView(m){
  const {stage,scope}=benefitData(m);
  const items=[stage.physical[0],stage.mental[0]];
  const sourceIds=[...new Set(items.flatMap(item=>item.sourceIds))];
  return `<section class="dy-benefit" data-daily-benefit-stage="${stage.id}"><span class="eyebrow">CORPS & ESPRIT</span><h2>De bonnes raisons de continuer.</h2><span class="dy-benefit-scope">${esc(scope)}</span><ul class="dy-benefit-list">${items.map((item,i)=>`<li>${icon(i?'heart':'spark')}<strong>${esc(item.title)}</strong></li>`).join('')}</ul><p class="dy-benefit-context">Des progrès observés dans les études. Ton espace santé explique ces résultats et les relie à tes propres ressentis.</p><button type="button" class="primary dy-main-action" data-page="health">Voir mes bienfaits ${icon('arrow')}</button><button type="button" class="text dy-benefit-source" data-health-action="sources" data-sources="${esc(sourceIds.join(','))}">Sources scientifiques</button></section>`;
 }
 function home(){
  if(!progression.ready()||!progression.document())return progression.home();
  const m=overview();renderedDay=m.today;
  return `<div class="dy-page"><div class="dy-heading"><div><span class="eyebrow">${esc(dateText(m.today,{weekday:'long',day:'numeric',month:'long'}))}</span><h1>Chaque jour compte.</h1><p>Ce que tu construis aujourd’hui reste avec toi.</p></div><button type="button" class="dy-goal" data-tl-action="settings">${icon('goal')}<span>Mon objectif<strong>${esc(m.journey.modeLabel)}</strong></span>${icon('arrow')}</button></div><div class="dy-primary-grid">${progressCard(m)}${benefitView(m)}</div>${weekView(m)}<div class="dy-shortcuts"><button type="button" class="dy-shortcut" data-page="progress">${icon('calendar')}<span><strong>Mon calendrier</strong><span>Tout mon parcours, en un regard.</span></span>${icon('arrow')}</button><button type="button" class="dy-shortcut" data-page="health">${icon('heart')}<span><strong>Mes bienfaits</strong><span>Corps, esprit et évolution.</span></span>${icon('arrow')}</button><button type="button" class="dy-shortcut" data-action="help">${icon('pause')}<span><strong>Un soutien maintenant</strong><span>Des appuis quand j’en ai besoin.</span></span>${icon('arrow')}</button></div><details class="dy-safety"><summary>Un arrêt accompagné quand c’est nécessaire</summary><p>Si tu bois beaucoup ou tous les jours, ou si tu ressens un manque, demande un avis médical avant un arrêt brutal ou une forte réduction. Confusion, hallucinations, convulsions ou malaise sévère : 15 / 112 en France.</p><button type="button" class="text" data-action="help">Retrouver les contacts et les conseils</button></details></div>`;
 }
 function calendarView(){
  if(!progression.ready()||!progression.document())return '';
  const m=overview(),c=m.calendar;renderedDay=m.today;
  const label=dateText(c.start,{month:'long',year:'numeric'});
  return `<section class="dy-calendar" id="dy-calendar" aria-labelledby="dy-calendar-title"><div class="dy-calendar-header"><div><span class="eyebrow">UNE JOURNÉE, UN REPÈRE</span><h2 id="dy-calendar-title" tabindex="-1">Mon calendrier</h2><p>Tes jours sans alcool, tes consommations et les dates à compléter.</p></div><button type="button" class="secondary" data-daily-action="day" data-date="${m.today}">Renseigner une journée ${icon('arrow')}</button></div><div class="dy-calendar-controls"><button type="button" data-daily-action="month-prev" aria-label="Mois précédent" ${c.canPrevious?'':'disabled'}>‹</button><h3 aria-live="polite" aria-atomic="true">${esc(label)}</h3><button type="button" data-daily-action="month-next" aria-label="Mois suivant" ${c.canNext?'':'disabled'}>›</button><button type="button" class="text" data-daily-action="month-today" ${c.month===m.today.slice(0,7)?'disabled':''}>Ce mois-ci</button></div><div class="dy-month-grid">${['Lun.','Mar.','Mer.','Jeu.','Ven.','Sam.','Dim.'].map(d=>`<span class="dy-weekday-label">${d}</span>`).join('')}${'<span class="dy-empty-day" aria-hidden="true"></span>'.repeat(c.leadingDays)}${c.days.map(d=>dayButton({...d,beforeStart:d.date<m.baseline})).join('')}</div>${legend()}<div class="dy-calendar-summary"><strong>${c.declaredDays} ${plural(c.declaredDays,'journée')} ${plural(c.declaredDays,'renseignée')}</strong><span>${c.estimatedDays} selon ${plural(c.estimatedDays,'une période','tes périodes')} · ${c.days.filter(d=>d.provenance==='unknown'&&d.date>=m.baseline).length} à renseigner</span></div><p class="dy-calendar-note">Aujourd’hui reste une journée en cours. Les cases en pointillés viennent de tes périodes déclarées ; elles ne remplacent pas un point quotidien. Une journée vide reste inconnue.</p>${c.start<m.baseline?`<p class="dy-calendar-note">Ton suivi commence le ${dateLabel(m.baseline)}. <button type="button" class="text" data-tl-action="settings">Ajuster mes repères de départ</button></p>`:''}<div class="dy-calendar-links"><button type="button" class="text" data-tl-action="change">Arrêt ou reprise</button><button type="button" class="text" data-tl-action="history">Mon historique complet ${icon('arrow')}</button></div></section>`;
 }
 function replaceCalendar(focusAction){
  const root=document.getElementById('dy-calendar');if(!root)return;
  root.outerHTML=calendarView();
  const button=document.querySelector(`#dy-calendar [data-daily-action="${focusAction}"]`);
  (button&&!button.disabled?button:document.getElementById('dy-calendar-title'))?.focus({preventScroll:true});
 }
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-daily-action]');if(!button)return;
  event.preventDefault();event.stopImmediatePropagation();
  try{
   if(!S.user||!api.healthConsentActive())throw Error('Active ton suivi personnel pour ouvrir cette journée.');if(!progression.ready())throw Error('Ton parcours est en cours de chargement. Réessaie dans un instant.');
   const action=button.dataset.dailyAction;
   if(action==='day'){api.privateWrite();api.openDay(button.dataset.date);return;}
   if(action==='plan'){api.privateWrite();const m=overview();api.openPlan(m.ritual.plan.completed?m.ritual.plan.id:null,m.today);return;}
   const m=overview();
   if(action==='month-today')month=m.today.slice(0,7);
   else if(action==='month-prev'||action==='month-next'){
    if(action==='month-prev'&&!m.calendar.canPrevious||action==='month-next'&&!m.calendar.canNext)return;
    const [year,mon]=m.calendar.month.split('-').map(Number),date=new Date(Date.UTC(year,mon-1+(action==='month-prev'?-1:1),1));
    month=date.toISOString().slice(0,7);
   }else return;
   replaceCalendar(action);
  }catch(error){api.notify(api.message(error));}
 },true);
 function tick(){
  if(!S.user||!api.healthConsentActive()||!progression.ready()||!['home','progress'].includes(S.page))return;
  if(document.visibilityState==='hidden')return;
  const today=progression.today();
  if(renderedDay&&today!==renderedDay&&!document.querySelector('#modal[open]')){
   const active=document.activeElement,action=active?.dataset?.dailyAction,date=active?.dataset?.date,id=active?.id;
   renderedDay=today;api.render();
   const next=id?document.getElementById(id):action?[...document.querySelectorAll('[data-daily-action]')].find(node=>node.dataset.dailyAction===action&&node.dataset.date===date&&!node.disabled):null;
   next?.focus({preventScroll:true});return;
  }
  if(S.page!=='home'||!document.querySelector('[data-daily-clock-value]'))return;
  const m=overview(),f=face(m.journey),cap=capText(m);
  const benefit=document.querySelector('.dy-benefit');
  if(benefit&&benefit.dataset.dailyBenefitStage!==benefitData(m).stage.id){
   const focus=benefit.contains(document.activeElement)?(document.activeElement.dataset.healthAction?'sources':'health'):null;
   benefit.outerHTML=benefitView(m);
   if(focus)document.querySelector(focus==='sources'?'.dy-benefit-source':'.dy-benefit .dy-main-action')?.focus({preventScroll:true});
  }
  for(const [key,value] of [['value',f.value],['unit',f.unit],['detail',f.detail]]){const node=document.querySelector(`[data-daily-clock-${key}]`);if(node&&node.textContent!==value)node.textContent=value;}
  const title=document.querySelector('[data-daily-cap-title]'),date=document.querySelector('[data-daily-cap-date]'),track=document.querySelector('.dy-cap-track');
  if(title)title.textContent=cap.title;if(date)date.textContent=cap.detail;
  const earned=document.querySelector('[data-daily-earned]');if(earned)earned.textContent=m.currentCap?m.currentCap.label+' parcourus':'Premier pas posé';
  if(track){track.setAttribute('aria-valuenow',String(cap.percent));track.firstElementChild.style.width=cap.percent+'%';}
 }
 setInterval(tick,30000);
 document.addEventListener('visibilitychange',tick);
 return {home,calendarView,reset,tick};
}
