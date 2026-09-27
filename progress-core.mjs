/** Pure, date-only progress calculations. Unknown is NEVER zero. No clinical scores. */
import {dayKey,parseDay,moveDay,dayDiff} from './core.mjs';
export const MODES={abstain:'Arrêter et maintenir mon arrêt',reduce:'Réduire ma consommation',observe:'Faire le point'};
export const round2=n=>Math.round((n+Number.EPSILON)*100)/100;
export function numberOrNull(value){if(value===null||value===undefined||String(value).trim()==='')return null;const n=Number(String(value).replace(',','.'));return Number.isFinite(n)?n:null}
export function optionalNumber(value,label,max){if(value===null||value===undefined||String(value).trim()==='')return null;const n=numberOrNull(value);if(n===null||n<0||n>max)throw Error(`${label} : renseigne un nombre entre 0 et ${max}, ou laisse vide si inconnu.`);return round2(n)}
export function unitsOf(row){if(!row)return null;if(row.sober_today===true)return 0;const v=numberOrNull(row.alcohol_units);return row.sober_today===false&&v!==null&&v>0?v:null}
export function costOf(row){if(!row)return null;const v=numberOrNull(row.alcohol_cost_eur);return v!==null&&v>=0?v:null}
export function standardUnits(drinks){if(!Array.isArray(drinks)||!drinks.length||drinks.length>20)throw Error('Ajoute entre 1 et 20 boissons dans le calculateur.');let total=0;for(const d of drinks){const ml=numberOrNull(d.volume_ml),abv=numberOrNull(d.abv),count=numberOrNull(d.count);if(ml===null||ml<=0||ml>10000||abv===null||abv<0||abv>100||count===null||!Number.isInteger(count)||count<1||count>100)throw Error('Vérifie le volume en ml, le degré en % et le nombre de portions.');total+=ml*abv*0.000789*count;}if(total>1000)throw Error('Quantité calculée trop élevée : vérifie les unités saisies.');return round2(total)}
export function validateAlcohol(row){const r={...row};if(r.sober_today===true){r.alcohol_units=0;r.quantity_method='standard';r.drink_details=null;}else{if(r.quantity_method==='calculator'){r.alcohol_units=standardUnits(r.drink_details);}else{r.alcohol_units=optionalNumber(r.alcohol_units,'Verres standard',1000);r.quantity_method=r.alcohol_units===null?null:'standard';r.drink_details=null;}if(r.alcohol_units===0)throw Error('Tu as déclaré une consommation : renseigne une quantité positive, laisse-la inconnue, ou choisis une journée sans alcool.');}r.alcohol_cost_eur=optionalNumber(r.alcohol_cost_eur,'Dépenses alcool en euros',1000000);if(r.energy!==null&&(!Number.isInteger(r.energy)||r.energy<1||r.energy>5))throw Error('Énergie : choisis une valeur de 1 à 5.');return r}
export function indexChecks(checks,today=dayKey()){return new Map(checks.filter(c=>c.checkin_date&&c.checkin_date<=today).map(c=>[c.checkin_date,c]))}
export function addMonths(date,n){const d=parseDay(date),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));return dayKey(d)}
export function resolveAnchor(settings={},verified=null,profile={},user={},today=dayKey()){
 const valid=v=>{try{return v&&parseDay(v)&&v<=today?v:null}catch{return null}};
 if(valid(verified?.started_on))return {date:verified.started_on,kind:'verified',label:'Début d’abonnement vérifié'};
 if(valid(settings.subscription_started_on))return {date:settings.subscription_started_on,kind:'declared',label:'Début d’abonnement déclaré'};
 for(const value of [profile.created_at,user.created_at]){const d=new Date(value);if(value&&!Number.isNaN(d.getTime())&&valid(dayKey(d)))return {date:dayKey(d),kind:'tracking',label:'Début du suivi (création du compte)'};}
 return {date:today,kind:'temporary',label:'Repère provisoire : aujourd’hui'};
}
export function yearCount(anchor,today=dayKey()){parseDay(anchor);let n=1;while(n<200&&addMonths(anchor,n*12)<=today)n++;return n}
export function annualRange(anchor,index=0){if(!Number.isInteger(index)||index<0||index>199)throw Error('Année invalide.');const start=addMonths(anchor,index*12),end=moveDay(addMonths(anchor,(index+1)*12),-1);return {anchor,index,start,end,days:dayDiff(end,start)+1,months:Array.from({length:12},(_,i)=>({start:addMonths(anchor,index*12+i),end:moveDay(addMonths(anchor,index*12+i+1),-1)}))}}
export function spanSummary(checks,start,end,today=dayKey(),settings={}){
 const stop=end<today?end:today,expected=stop<start?0:dayDiff(stop,start)+1,map=indexChecks(checks,today);let filled=0,sober=0,quantityDays=0,costDays=0,units=0,cost=0,max=null;
 for(let i=0;i<expected;i++){const row=map.get(moveDay(start,i));if(row&&typeof row.sober_today==='boolean'){filled++;if(row.sober_today)sober++;}const u=unitsOf(row),c=costOf(row);if(u!==null){quantityDays++;units+=u;max=max===null?u:Math.max(max,u);}if(c!==null){costDays++;cost+=c;}}
 const baseline=numberOrNull(settings.baseline_cost_week),saved=baseline===null||!costDays?null:baseline*costDays/7-cost;
 return {start,end,stop,expected,filled,sober,drinking:filled-sober,missing:expected-filled,quantityDays,costDays,units:round2(units),cost:round2(cost),max,quantityComplete:expected>0&&quantityDays===expected,costComplete:expected>0&&costDays===expected,saved:saved===null?null:round2(saved)};
}
export function closedWindow(checks,n=7,today=dayKey(),offset=0,settings={}){return spanSummary(checks,moveDay(today,-n-offset),moveDay(today,-1-offset),today,settings)}
export function percentChange(current,reference){const c=numberOrNull(current),r=numberOrNull(reference);return c===null||r===null||r<=0?null:round2((c-r)/r*100)}
export function bestStreak(checks,today=dayKey()){let longest=0,run=0,last=null;for(const row of [...indexChecks(checks,today).values()].sort((a,b)=>a.checkin_date.localeCompare(b.checkin_date))){if(row.sober_today===true){run=last&&dayDiff(row.checkin_date,last)===1?run+1:1;longest=Math.max(longest,run);}else run=0;last=row.checkin_date;}return longest}
export function annualPoints(checks,range,kind='daily',today=dayKey()){
 const map=indexChecks(checks,today);return Array.from({length:range.days},(_,i)=>{const date=moveDay(range.start,i),row=map.get(date);let units=unitsOf(row),cost=costOf(row);if(date>today){units=null;cost=null;}if(kind==='rolling'){
  units=null;cost=null;if(i>=6&&date<today){const rows=Array.from({length:7},(_,j)=>map.get(moveDay(date,j-6))),u=rows.map(unitsOf),c=rows.map(costOf);if(u.every(v=>v!==null))units=round2(u.reduce((a,b)=>a+b,0)/7);if(c.every(v=>v!==null))cost=round2(c.reduce((a,b)=>a+b,0)/7);}
 }return {date,units,cost,provisional:date===today,future:date>today};});
}
export function orderedChapters(chapters){return [...chapters].sort((a,b)=>a.effective_on.localeCompare(b.effective_on)||String(a.created_at||'').localeCompare(String(b.created_at||''))||String(a.id).localeCompare(String(b.id)))}
export function chapterAt(chapters,date=dayKey()){return orderedChapters(chapters).filter(c=>c.effective_on<=date).at(-1)||null}
export function evaluateGoal(chapter,summary){if(!chapter||chapter.support_first||chapter.mode==='observe')return {status:'not-evaluated',label:'Observation, sans verdict de réussite'};if(chapter.mode==='abstain'){if(summary.filled!==summary.expected||!summary.expected)return {status:'incomplete',label:'Bilans incomplets : objectif non évalué'};return summary.sober===summary.expected?{status:'met',label:'Objectif sans alcool suivi'}:{status:'review',label:'Une consommation est notée, les acquis restent'};}
 const weekly=numberOrNull(chapter.weekly_limit),daily=numberOrNull(chapter.daily_limit);if(weekly===null&&daily===null)return {status:'not-evaluated',label:'Action personnelle à faire le point'};if(!summary.quantityComplete)return {status:'incomplete',label:'Quantités incomplètes : objectif non évalué'};const met=(weekly===null||summary.units<=weekly)&&(daily===null||summary.max<=daily);return met?{status:'met',label:'Limite personnelle suivie, pas un seuil sans risque'}:{status:'review',label:'Limite dépassée : préparer le prochain pas'};
}
export function goalHistory(checks,chapters,today=dayKey()){
 const sorted=orderedChapters(chapters),rows=[];for(let i=0;i<sorted.length;i++){const c=sorted[i],end=sorted[i+1]?.effective_on&&sorted[i+1].effective_on<today?sorted[i+1].effective_on:today;for(let s=c.effective_on;moveDay(s,7)<=end&&rows.length<5000;s=moveDay(s,7)){const sum=spanSummary(checks,s,moveDay(s,6),today);rows.push({...sum,chapter:c,...evaluateGoal(c,sum)});}}return rows;
}
export function weeklyGoal(checks,chapters,today=dayKey()){
 const week=closedWindow(checks,7,today),caps=Array.from({length:7},(_,i)=>chapterAt(chapters,moveDay(week.start,i)));if(!caps[0]||!caps.every(c=>c?.id===caps[0].id))return {...week,status:'changed',label:'Cap choisi ou modifié pendant la période : pas de verdict rétroactif'};return {...week,chapter:caps[0],...evaluateGoal(caps[0],week)};
}
export function annualCSV(checks,chapters,range,today=dayKey()){
 const map=indexChecks(checks,today),lines=['Date;Statut;Verres standard (10 g);Depenses alcool EUR;Cap'];for(let i=0;i<range.days;i++){const d=moveDay(range.start,i),r=map.get(d),u=unitsOf(r),c=costOf(r),status=d>today?'A venir':r?(r.sober_today?'Sans alcool declare':'Consommation declaree'):'Non renseigne';lines.push([d,status,u===null?'':String(u).replace('.',','),c===null?'':String(c).replace('.',','),d>today?'':MODES[chapterAt(chapters,d)?.mode]||''].join(';'));}return '\ufeff'+lines.join('\r\n');
}
