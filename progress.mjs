/** Period-based progression. The timeline is canonical; daily records remain intact. */
import {createTimelineUI} from './timeline-ui.mjs';
import {validateTimelineDocument,timelineSnapshot} from './timeline-core.mjs';
import {dayKey,moveDay,dateLabel,esc,parseDay} from './core.mjs';
import {addMonths,chapterAt,round2} from './progress-core.mjs';

export function createProgress(api){
 const {S}=api;
 const P={ready:false,error:'',settings:{},chapters:[],verified:null,timeline:null,uid:null,generation:0};
 const currentChapter=()=>chapterAt(P.chapters,timelineToday());
 const timelineDocument=()=>P.timeline?.document||null;
 function timelineToday(){const zone=timelineDocument()?.timezone;if(!zone)return dayKey();const parts=new Intl.DateTimeFormat('en',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${values.year}-${values.month}-${values.day}`;}
 const data=()=>({document:timelineDocument(),checks:S.checks,journey:S.journey,settings:P.settings,chapters:P.chapters,ready:P.ready,today:timelineToday()});
 const versions=()=>({revision:P.timeline?.revision||0,journeyVersion:S.journey.updated_at||null,settingsVersion:P.settings.updated_at||null,chapterId:currentChapter()?.id||null});
 const ui=createTimelineUI({data,versions,save:saveTimeline,modal:api.modal,closeModal:api.closeModal,render:api.render,notify:api.notify,download:api.download,programCount:()=>S.program.length,openPage,openProgress:()=>openPage('progress')});
 function openPage(page){S.page=page;api.render();window.scrollTo({top:0,behavior:'instant'});}
 function reset(){ui.reset();P.generation++;Object.assign(P,{ready:false,error:'',settings:{},chapters:[],verified:null,timeline:null,uid:null});}
 function checkReady(){api.privateWrite();if(!P.ready||P.uid!==S.user?.id)throw Error('Actualise ton parcours avant d’enregistrer.');}
 async function load(){
  const uid=S.user?.id,token=++P.generation;if(!uid||S.demo)return;
  P.ready=false;P.error='';
  try{
   const db=await api.getClient();
   const [settings,chapters,verified,timeline]=await Promise.all([
    db.from('progress_settings').select('*').eq('user_id',uid).maybeSingle(),
    api.ownRows('progress_chapters','created_at'),
    db.from('subscription_anchors').select('*').eq('user_id',uid).maybeSingle(),
    db.from('journey_timelines').select('*').eq('user_id',uid).maybeSingle()
   ]);
   if(S.demo||S.user?.id!==uid||token!==P.generation)return;
   api.checkResult(settings);api.checkResult(verified);api.checkResult(timeline);
   Object.assign(P,{settings:settings.data||{},chapters,verified:verified.data||null,timeline:timeline.data||null,uid,ready:true});
  }catch(e){if(S.user?.id===uid&&token===P.generation){P.error=api.message(e);P.ready=false;}}
 }
 async function saveTimeline(input,expected){
  checkReady();const user=S.user,uid=user.id,demo=S.demo,generation=P.generation;
  const doc=validateTimelineDocument(input,timelineToday()),before=versions();
  if(!expected||expected.revision!==before.revision||expected.journeyVersion!==before.journeyVersion||expected.settingsVersion!==before.settingsVersion||expected.chapterId!==before.chapterId)throw Error('Ton parcours a changé. Ferme ce formulaire et ouvre-le à nouveau.');
  let result;
  if(demo){
   const updated_at=new Date().toISOString(),last=doc.events.at(-1),g=doc.goal,c=currentChapter();
   const changed=!c||['mode','weekly_limit','daily_limit','support_first','planned_action'].some(k=>(c[k]??null)!==(g[k]??null));
   result={journey:{...S.journey,user_id:uid,started_at:parseDay(last.started_on).toISOString(),weekly_spend_estimate:doc.baseline.cost_week,why_text:g.why,updated_at},progress_settings:{...P.settings,user_id:uid,baseline_units_week:doc.baseline.units_week,baseline_cost_week:doc.baseline.cost_week,baseline_note:'Estimations confirmées dans le parcours par périodes.',updated_at},timeline:{...P.timeline,user_id:uid,document:doc,revision:before.revision+1,updated_at},chapters:changed?[...P.chapters,{id:crypto.randomUUID(),user_id:uid,effective_on:timelineToday(),mode:g.mode,weekly_limit:g.weekly_limit,daily_limit:g.daily_limit,planned_action:g.planned_action,support_first:g.support_first,origin:'chosen',created_at:updated_at}]:P.chapters};
  }else{
   const db=await api.getClient();
   if(S.user!==user||S.demo!==demo||P.generation!==generation)return false;
   api.privateWrite();
   try{result=api.checkResult(await db.rpc('save_journey_timeline',{p_document:doc,p_expected_revision:expected.revision,p_expected_journey_updated_at:expected.journeyVersion,p_expected_settings_updated_at:expected.settingsVersion,p_expected_chapter_id:expected.chapterId}));}catch(err){if(err?.code==='PT409'&&S.user===user&&S.demo===demo){await api.refresh();throw Error('Ton parcours a été actualisé. Ferme ce formulaire et rouvre-le avant de réessayer.');}throw err;}
  }
  if(S.user!==user||S.demo!==demo||P.generation!==generation)return false;
  if(!result?.journey||!result?.progress_settings||!result?.timeline||!Array.isArray(result.chapters)||[result.journey,result.progress_settings,result.timeline,...result.chapters].some(row=>row.user_id!==uid)||result.timeline.revision!==before.revision+1)throw Error('La sauvegarde n’a pas pu être confirmée. Actualise ton parcours.');
  S.journey=result.journey;P.settings=result.progress_settings;P.timeline=result.timeline;P.chapters=result.chapters;
  return true;
 }
 function seedDemo(){
  reset();const today=dayKey(),start=moveDay(today,-119),updated_at=new Date().toISOString();
  const goal={mode:'abstain',weekly_limit:null,daily_limit:null,target_on:null,why:'Retrouver de la place pour les choses qui comptent.',triggers:['Stress','Fin de journée'],support_first:false,planned_action:'Préparer une activité calme à la fin de ma journée.'};
  const event=(back,state,units,cost)=>({id:crypto.randomUUID(),started_on:moveDay(today,-back),state,units_week:units,cost_week:cost,note:''});
  const doc={schema_version:1,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Paris',baseline:{started_on:addMonths(today,-12),units_week:28,cost_week:70},events:[event(119,'drinking',21,52.5),event(75,'abstinent',0,0),event(50,'drinking',14,35),event(14,'abstinent',0,0)],occasions:[],goal};
  P.uid='demo';P.ready=true;P.settings={user_id:'demo',subscription_started_on:start,baseline_units_week:28,baseline_cost_week:70,updated_at};
  P.timeline={user_id:'demo',document:doc,revision:1,created_at:updated_at,updated_at};
  P.chapters=[{id:crypto.randomUUID(),user_id:'demo',effective_on:moveDay(today,-14),...goal,created_at:updated_at}];
  S.profile.created_at=parseDay(start).toISOString();S.journey={...S.journey,user_id:'demo',started_at:parseDay(moveDay(today,-14)).toISOString(),updated_at};
  // Sparse fictitious records illustrate measured points without requiring daily entry.
  S.checks=[100,92,40,31,20].map((back,i)=>({id:'demo-progress-'+i,user_id:'demo',checkin_date:moveDay(today,-back),sober_today:false,alcohol_units:round2(2+i/4),alcohol_cost_eur:round2(5+i*0.625),quantity_method:'standard',mood:3,craving:2,note:'Donnée fictive de démonstration.'}));
 }
 function unavailable(){return `<section class="card"><h2>Parcours momentanément indisponible</h2><p>${esc(P.error||'Connecte-toi pour retrouver ton suivi.')}</p><button class="secondary" data-progress-action="reload">Réessayer</button></section>`;}
 const safety=()=>`<details class="card pg-section"><summary>Santé et soutien</summary><p>Une consommation quotidienne, des signes de manque ou un antécédent de sevrage compliqué nécessitent un avis médical avant un arrêt brutal ou une forte réduction.</p><p>Confusion, hallucinations, convulsions ou malaise sévère : 15 / 112 en France.</p><a href="https://www.alcool-info-service.fr/agir-sur-sa-consommation/comment-arreter-de-boire/sevrage-ce-quil-faut-savoir-pour-mieux-vous" target="_blank" rel="noopener noreferrer">Comprendre le sevrage</a></details>`;
 function freeReport(){
  const s=timelineSnapshot(timelineDocument(),S.checks,timelineToday()),c=s.current,sober=c.state==='abstinent',saved=Number(s.summary?.saved||0),currency=new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0});
  return `<div class="greeting tl-heading"><div><span class="eyebrow">RAPPORT GRATUIT</span><h1>Mon bilan synthétique</h1><p>Des repères essentiels, calculés à partir de tes mêmes données. Les courbes détaillées et l'analyse annuelle sont incluses dans Premium.</p></div><span class="tag">Gratuit</span></div>
   <section class="card tl-achievements"><h2>Mes repères essentiels</h2><div class="tl-achievement-grid"><div><strong>${sober?s.currentStreak:round2(c.units_week)}</strong><span>${sober?'jours dans la période d’arrêt actuelle':'verres / semaine estimés actuellement'}</span></div><div><strong>${s.totalSoberDays}</strong><span>jours sans alcool cumulés</span></div><div><strong>${currency.format(Math.abs(saved))}</strong><span>${saved<0?'de dépenses supplémentaires estimées':'d’économies estimées'} depuis ton point de référence</span></div></div><p class="tl-caption">Le rapport gratuit reste exact : il affiche moins de détails, mais ne dégrade ni tes données ni les calculs enregistrés.</p></section>
   <section class="card pg-section"><span class="eyebrow">PREMIUM · 29,99 € / AN</span><h2>Voir l'évolution complète</h2><p>Premium débloque les courbes détaillées, la lecture de l'évolution sur l'année et l'historique analytique complet. Ton historique actuel est conservé si tu restes en gratuit.</p><a class="primary" style="display:inline-block;padding:12px 16px;border-radius:13px;text-decoration:none" href="/abonnement.html">Découvrir Premium →</a></section>`;
 }
 function home(){if(!P.ready)return unavailable();const step=api.nextStep();return ui.home()+`<details class="card pg-section"><summary>Mon prochain pas</summary><h3>${esc(step.title)}</h3><p>${esc(step.lesson)}</p><button class="secondary" data-action="step" data-step="${step.step}">Continuer · étape ${step.step}/30</button><button class="text" data-action="journal-new">Écrire dans mon journal</button></details>`+safety();}
 function view(){if(!P.ready)return unavailable();if(!timelineDocument())return ui.view()+safety();return api.isPremium?.()?ui.view()+safety():freeReport()+safety();}
 function dateSummary(){if(!P.ready)return '';const doc=timelineDocument();if(!doc)return ui.settingsSummary();const last=doc.events.at(-1),label=last.state==='abstinent'?'Début de mon arrêt':'Début de mon rythme actuel';return `<div class="journey-date row between"><div><span class="small">${label}</span><p><b>${dateLabel(last.started_on)}</b></p></div><button class="text" data-action="journey-date" aria-label="Modifier ma date de début">Modifier</button></div>`;}
 async function extraExport(){checkReady();const uid=S.user.id,demo=S.demo,generation=P.generation;if(demo)return {journey_timeline:P.timeline,progress_settings:P.settings,progress_chapters:P.chapters,subscription_anchor:P.verified};const db=await api.getClient();const [timeline,chapters]=await Promise.all([db.from('journey_timelines').select('*').eq('user_id',uid).maybeSingle(),api.ownRows('progress_chapters','created_at')]);if(S.user?.id!==uid||S.demo!==demo||generation!==P.generation)throw Error('Le compte a changé pendant l’export.');return {journey_timeline:api.checkResult(timeline),progress_settings:P.settings,progress_chapters:chapters,subscription_anchor:P.verified};}
 document.addEventListener('click',async e=>{const b=e.target.closest('[data-progress-action]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();try{if(b.dataset.progressAction==='reload'){await api.refresh();}else if(['goal','settings','weekly-review'].includes(b.dataset.progressAction))ui.openSettings();else if(b.dataset.progressAction==='advanced')openPage('progress');}catch(err){api.notify(api.message(err));}},true);
 return {load,reset,seedDemo,home,view,dateSummary,capCard:()=>P.ready?ui.settingsSummary():unavailable(),journey:()=>P.ready?ui.journey():unavailable(),openSettings:ui.openSettings,openDate:ui.openDate,openOccasion:ui.openOccasion,openChange:ui.openChange,extraExport,enhanceCheck:()=>{},mode:()=>timelineDocument()?.goal.mode||currentChapter()?.mode||'observe',snapshot:()=>timelineDocument()?timelineSnapshot(timelineDocument(),S.checks,timelineToday()):null};
}
