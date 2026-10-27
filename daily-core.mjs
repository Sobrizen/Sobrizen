/**
 * Read-only model for the daily home. The caller owns consent and loading state.
 * No DOM, storage, implicit clock, medical score or synthetic daily completion.
 */
import {parseDay, moveDay, dayDiff} from './core.mjs';
import {timelineRows, timelineSnapshot} from './timeline-core.mjs';
import {HEALTH_METRICS, healthJourney, mergeHealthObservations} from './health-core.mjs';
import {instantMilliseconds, localDateTime} from './time-core.mjs';
import {PROGRAM} from './program.mjs';

export const DAILY_CAPS = Object.freeze([1,3,7,14,30,60,90,180,365].map(days=>Object.freeze({
  id:`day-${days}`,days,fromMinutes:days*1440,label:`${days} jour${days===1?'':'s'}`,
})));

const actualSources=new Set(['legacy','occasion']);
const estimatedSources=new Set(['period','range']);
const modeLabels={abstain:'Arrêter',reduce:'Réduire',observe:'Observer'};
const ownArray=value=>Array.isArray(value)?value:[];
const copy=value=>value==null?value:JSON.parse(JSON.stringify(value));
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const text=value=>typeof value==='string'?value.trim():'';
const amount=(value,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=max?value:null;

function validDate(value,today=null){
  if(typeof value!=='string'||value<'1900-01-01'||(today&&value>today))return false;
  try{parseDay(value);return true;}catch{return false;}
}

function pageAction(page){return {channel:'page',page};}
function appAction(action,extra={}){return {channel:'app',action,...extra};}
function progressionAction(method,date){return {channel:'progression',method,args:date?[date]:[]};}
function dailyReviewAction(date){
  // The daily form records an explicit status without requiring health scores.
  return {channel:'daily-entry',method:'open',args:[date]};
}

/** Only actual daily records can be shown before the canonical setup exists. */
function legacyRows(checks,today){
  const rows=new Map();
  for(const check of ownArray(checks)){
    if(!validDate(check?.checkin_date,today))continue;
    const raw=amount(check.alcohol_units,1000);
    const sober=typeof check.sober_today==='boolean'?check.sober_today:raw>0?false:null;
    const units=sober===true?0:sober===false&&raw>0?raw:null;
    rows.set(check.checkin_date,{
      checkin_date:check.checkin_date,sober_today:sober,alcohol_units:units,
      alcohol_cost_eur:amount(check.alcohol_cost_eur,1000000),
      status_source:sober===null?'unknown':'legacy',
      units_source:units===null?'unknown':'legacy',
      cost_source:amount(check.alcohol_cost_eur,1000000)===null?'unknown':'legacy',
      event_id:null,range_id:null,occasion_id:null,
    });
  }
  return rows;
}

function dayModel(date,row,today){
  const future=date>today,partial=date===today;
  const statusSource=future?'unknown':row?.status_source||'unknown';
  const state=future?'future':row?.sober_today===true?'abstinent':row?.sober_today===false?'drinking':'unknown';
  // Budget or quantity may be estimated while the alcohol status is declared.
  // row.estimated / row.source must never decide this calendar's provenance.
  const provenance=future?'future':state==='unknown'?'unknown'
    :actualSources.has(statusSource)?'declared':estimatedSources.has(statusSource)?'estimated':'unknown';
  const label=future?'À venir':provenance==='unknown'?'Non renseigné'
    :provenance==='declared'?(state==='abstinent'?'Sans alcool déclaré':'Consommation déclarée')
      :state==='abstinent'?'Sans alcool selon ta période':'Consommation estimée selon ta période';
  let editSource=null;
  if(!future&&row?.occasion_id)editSource=progressionAction('openOccasion',date);
  else if(!future&&provenance==='declared')editSource=dailyReviewAction(date);
  else if(!future&&row?.range_id)editSource={channel:'timeline',action:'edit-range',id:row.range_id};
  else if(!future&&row?.event_id)editSource={channel:'timeline',action:'edit-event',id:row.event_id};
  return {
    date,state,provenance,statusSource,label,
    today:partial,partial,future,closed:date<today,
    declared:provenance==='declared',estimated:provenance==='estimated',
    units:future?null:row?.alcohol_units??null,cost:future?null:row?.alcohol_cost_eur??null,
    unitsSource:future?'unknown':row?.units_source||'unknown',
    costSource:future?'unknown':row?.cost_source||'unknown',
    eventId:future?null:row?.event_id||null,rangeId:future?null:row?.range_id||null,
    occasionId:future?null:row?.occasion_id||null,
    actions:future?null:{review:dailyReviewAction(date),consumption:progressionAction('openOccasion',date),editSource},
  };
}

function summarizeDays(days){
  const n=predicate=>days.filter(predicate).length;
  const declaredDays=n(day=>day.declared),totalDays=days.length;
  return {
    totalDays,elapsedDays:n(day=>!day.future),closedDays:n(day=>day.closed),
    futureDays:n(day=>day.future),declaredDays,estimatedDays:n(day=>day.estimated),
    unknownDays:n(day=>day.provenance==='unknown'),
    declaredClosedDays:n(day=>day.declared&&day.closed),
    estimatedClosedDays:n(day=>day.estimated&&day.closed),
    unknownClosedDays:n(day=>day.provenance==='unknown'&&day.closed),
    declaredAbstinentDays:n(day=>day.declared&&day.state==='abstinent'),
    declaredDrinkingDays:n(day=>day.declared&&day.state==='drinking'),
    completedDeclaredAbstinentDays:n(day=>day.declared&&day.state==='abstinent'&&day.closed),
    estimatedAbstinentDays:n(day=>day.estimated&&day.state==='abstinent'),
    todayDeclared:days.some(day=>day.today&&day.declared),todayPartial:days.some(day=>day.today),
    coverageLabel:`${declaredDays}/${totalDays} jours renseignés`,
  };
}

function journeyModel(snapshot,document,today,now){
  const mode=document?.goal?.mode||'observe';
  const actual=healthJourney(snapshot,today,now);
  const active=mode==='abstain'&&actual.active;
  return {
    mode,modeLabel:modeLabels[mode]||modeLabels.observe,active,hasDeclaredStop:actual.active,
    status:!document?'setup':mode==='reduce'?'reducing':mode==='observe'?'observing':active?'abstinent':'no-current-stop',
    precision:active?actual.precision:'unknown',approx:active&&actual.precision==='day',
    startDate:active?actual.startDate:null,startedAt:active?actual.startedAt:null,
    days:active?actual.days:null,elapsedMinutes:active?actual.elapsedMinutes:null,
    elapsedHours:active?actual.elapsedHours:null,hours:active?actual.hours:null,minutes:active?actual.minutes:null,
    label:!active?null:actual.precision==='minute'?actual.elapsedLabel:`${actual.days} jour${actual.days===1?'':'s'} · heure inconnue`,
    currentStreak:count(snapshot?.currentStreak),totalSoberDays:count(snapshot?.totalSoberDays),
    bestStreak:count(snapshot?.bestStreak),lastConsumptionOn:snapshot?.lastConsumptionOn||null,
    timeZone:document?.timezone||null,
  };
}

function capModel(journey){
  const exact=journey.active&&journey.precision==='minute';
  const caps=DAILY_CAPS.map(cap=>{
    const reached=journey.active&&(exact?journey.elapsedMinutes>=cap.fromMinutes:journey.days>=cap.days);
    const targetAt=exact?new Date(instantMilliseconds(journey.startedAt)+cap.fromMinutes*60000).toISOString():null;
    const targetDate=targetAt?localDateTime(targetAt,journey.timeZone).date
      :journey.active?moveDay(journey.startDate,cap.days):null;
    return {...cap,state:!journey.active?'information':reached?'reached':'future',reached,
      approx:journey.active&&!exact,targetAt,targetDate,
      remainingMinutes:exact&&!reached?Math.max(0,cap.fromMinutes-journey.elapsedMinutes):null,
      remainingDays:journey.active&&!reached?Math.max(0,cap.days-journey.days):null,
    };
  });
  const currentCap=caps.findLast(cap=>cap.reached)||null;
  const nextCap=caps.find(cap=>cap.state==='future')||null;
  return {caps,currentCap,nextCap};
}

function savingsModel(snapshot,document,today){
  const summary=snapshot?.summary;
  const rawValue=Number.isFinite(summary?.saved)?summary.saved:null;
  const actualTodayCost=Number.isFinite(summary?.todayActual?.cost)?summary.todayActual.cost:null;
  const available=rawValue!==null&&(summary.referenceCostDays>0
    ||(actualTodayCost!==null&&document?.baseline?.started_on<=today));
  const partial=available&&summary.referenceCostDays<summary.referenceDays;
  return {
    value:available?rawValue:null,rawValue,available,currency:'EUR',
    status:!available?'unavailable':partial?'partial':'estimated',overBudget:available&&rawValue<0,
    referenceStart:summary?.referenceStart||null,referenceDays:count(summary?.referenceDays),
    referenceCostDays:count(summary?.referenceCostDays),actualCostDays:count(summary?.actualCostDays),
    estimatedCostDays:count(summary?.estimatedCostDays),todayActualCost:actualTodayCost,
    includesActualToday:actualTodayCost!==null,
    source:'timelineSnapshot.summary.saved',
    explanation:'Estimation par rapport à tes anciennes dépenses, sur les jours connus. Les dépenses déjà notées aujourd’hui sont incluses ; aucun budget théorique de la journée en cours n’est crédité.',
  };
}

/**
 * `document` and `checks` are canonical inputs. An optional caller snapshot is
 * accepted for integration, but refreshed through the same engine so an old
 * snapshot cannot keep a clock/cap after a newly recorded consumption.
 */
export function dailyOverview({document=null,today,now,snapshot=null,checks=[],healthRows=[],journal=[],program=[],month}={}){
  if(!validDate(today))throw Error('La date du jour est invalide.');
  const instant=instantMilliseconds(now);
  const currentMonth=month??today.slice(0,7);
  if(typeof currentMonth!=='string'||!/^\d{4}-\d{2}$/u.test(currentMonth)||!validDate(currentMonth+'-01'))throw Error('Le mois du calendrier est invalide.');
  checks=ownArray(checks);healthRows=ownArray(healthRows);journal=ownArray(journal);program=ownArray(program);
  // Use the existing engine's totals, clock validation and exception precedence.
  // Never rebuild savings as "streak × daily spending".
  const state=document?timelineSnapshot(document,checks,today,instant):null;
  const legacy=legacyRows(checks,today);
  function daysFor(start,end){
    const rows=document?new Map(timelineRows(document,checks,start,end,today,instant).map(row=>[row.checkin_date,row])):legacy;
    return Array.from({length:dayDiff(end,start)+1},(_,index)=>{
      const date=moveDay(start,index);return dayModel(date,rows.get(date),today);
    });
  }
  const weekStart=moveDay(today,-6),weekDays=daysFor(weekStart,today);
  const [year,monthNumber]=currentMonth.split('-').map(Number);
  const monthLength=new Date(Date.UTC(year,monthNumber,0)).getUTCDate();
  const monthStart=currentMonth+'-01',monthEnd=currentMonth+'-'+String(monthLength).padStart(2,'0');
  const calendarDays=daysFor(monthStart,monthEnd);
  const journey=journeyModel(state,document,today,instant);
  const currentDay=weekDays.at(-1);
  const observation=mergeHealthObservations(healthRows,checks,today).find(row=>row.checkin_date===today)||null;
  const plans=journal.filter(row=>row?.kind==='plan'&&row.entry_date===today&&text(row.id)&&text(row.body))
    .sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))||String(b.id).localeCompare(String(a.id)));
  const plan=plans[0]||null;
  const completedSteps=new Set(program.filter(row=>{
    if(!PROGRAM.some(step=>step.step===row?.step))return false;
    try{return instantMilliseconds(row.completed_at)<=instant;}catch{return false;}
  }).map(row=>row.step));
  const nextProgram=PROGRAM.find(step=>!completedSteps.has(step.step))||null;
  const actions={
    goal:progressionAction('openSettings'),stopTime:progressionAction('openStopTime'),
    plan:plan?appAction('journal-edit',{id:plan.id}):appAction('journal-new',{prefill:{entry_date:today,kind:'plan'},needsAdapter:true}),
    feelings:{channel:'health',action:'checkin',date:today},
    review:dailyReviewAction(today),consumption:progressionAction('openOccasion',today),
    history:pageAction('journey'),progress:pageAction('progress'),health:pageAction('health'),
    journal:pageAction('journal'),help:appAction('help'),pause:appAction('urge'),breath:appAction('breath'),
    games:pageAction('games'),movement:{channel:'movement',action:'open'},
    program:nextProgram?appAction('step',{step:nextProgram.step}):pageAction('journey'),
  };
  return {
    today,timeZone:document?.timezone||null,hasTimeline:Boolean(document),journey,...capModel(journey),
    week:{start:weekStart,end:today,days:weekDays,...summarizeDays(weekDays)},
    calendar:{month:currentMonth,start:monthStart,end:monthEnd,days:calendarDays,
      leadingDays:(parseDay(monthStart).getDay()+6)%7,canPrevious:currentMonth>'1900-01',canNext:currentMonth<today.slice(0,7),
      ...summarizeDays(calendarDays)},
    ritual:{
      intention:{kind:'ongoing-goal',mode:journey.mode,modeLabel:journey.modeLabel,
        why:text(document?.goal?.why),plannedAction:text(document?.goal?.planned_action),
        targetOn:document?.goal?.target_on||null,action:actions.goal},
      plan:{completed:Boolean(plan),date:plan?today:null,id:plan?.id||null,title:plan?.title||'',body:plan?.body||'',
        count:plans.length,source:'journal_entries',action:actions.plan},
      feelings:{completed:Boolean(observation),date:observation?today:null,
        metrics:observation?HEALTH_METRICS.filter(metric=>Number.isFinite(observation[metric.key])).map(metric=>({key:metric.key,value:observation[metric.key]})):[],
        source:'mergeHealthObservations',action:actions.feelings},
      consumption:{completed:currentDay.declared,date:currentDay.declared?today:null,
        state:currentDay.state,partial:true,source:currentDay.statusSource,action:actions.review},
    },
    program:{completedCount:completedSteps.size,total:PROGRAM.length,nextStep:nextProgram?.step||null,
      nextTitle:nextProgram?.title||null,allComplete:completedSteps.size===PROGRAM.length,action:actions.program},
    savings:savingsModel(state,document,today),actions,
    // Detached, useful to adapters that also render timeline details.
    snapshot:copy(state),
  };
}
