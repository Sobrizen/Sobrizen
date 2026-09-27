import {dayKey,parseDay,moveDay,dayDiff,dateLabel,esc} from './core.mjs';
import {unitsOf,costOf,annualCSV} from './progress-core.mjs';
import {trackingRange,trackingSummary,trackingPoints} from './tracking-core.mjs';

const nf=new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2});
const money=new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:2});
const num=v=>v===null||v===undefined?'—':nf.format(v);
const euros=v=>v===null||v===undefined?'—':money.format(v);
const short=d=>parseDay(d).toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
const labels={week:'Semaine',month:'Mois',year:'Année'};
const currentLabels={week:'Cette semaine',month:'Ce mois-ci',year:'Cette année'};
const act=(action,text,attrs='',cls='secondary')=>`<button type="button" class="${cls}" data-tracking-action="${action}" ${attrs}>${text}</button>`;

/** Presentation only: period changes never write personal records or objectives. */
export function createTracker(api){
 const state={scale:'week',offset:0,metric:'units',point:null,detailsOpen:false};
 const reset=()=>Object.assign(state,{scale:'week',offset:0,metric:'units',point:null,detailsOpen:false});
 function data(){const d=api.data(),today=dayKey(),range=trackingRange(d.anchor.date,state.scale,state.offset,today);return {...d,today,range,...trackingSummary(d.checks,range,today,d.settings),points:trackingPoints(d.checks,range,today)};}
 function title(range){return range.scale==='month'?parseDay(range.start).toLocaleDateString('fr-FR',{month:'long',year:'numeric'}):range.scale==='year'?`${short(range.start)} ${parseDay(range.start).getFullYear()} – ${short(range.end)} ${parseDay(range.end).getFullYear()}`:`${short(range.start)} – ${short(range.end)} ${parseDay(range.end).getFullYear()}`;}
 function delta(value,key,comparison){
  if(!value)return '<span class="tr-delta muted">Pas encore de comparaison</span>';
  const sign=value.delta>0?'+':'',amount=value.percent===null?`${sign}${key==='cost'?euros(value.delta):num(value.delta)+' verres'}`:`${value.percent>0?'+':''}${num(value.percent)} %`;
  const dates=`${dateLabel(comparison.current.start)} au ${dateLabel(comparison.current.end)} comparé au ${dateLabel(comparison.previous.start)} au ${dateLabel(comparison.previous.end)}`;
  return `<span class="tr-delta ${value.delta<0?'tr-down':''}" title="${esc(dates)}">${value.delta===0?'Stable':amount}<span> · ${comparison.days} jours comparés</span></span>`;
 }
 function statCard(key,label,value,coverage,summary,comparison){const selected=state.metric===key;return act('metric',`<span class="tr-metric-label">${label}<span aria-hidden="true">${key==='units'?'◒':'€'}</span></span><strong>${value}</strong><span class="tr-metric-unit">${key==='units'?'verres standard':'dépenses alcool'}</span>${delta(comparison[key],key,comparison)}<span class="tr-coverage">${coverage}/${summary.expected} jours renseignés${coverage<summary.expected?' · partiel':''}</span>`,`data-metric="${key}" aria-pressed="${selected}"`,'tr-metric tr-metric-'+key+(selected?' is-selected':''));}
 function pointText(p,key){const known=key==='units'?p.unitsCoverage:p.costCoverage,value=key==='units'?num(p.units)+' verres':euros(p.cost);return p[key]===null?'Non renseigné':`${value}${p[key+'Partial']?' · partiel':''} · ${known}/${p.expected} jours renseignés`;}
 function chart(d){
  const {points,range}=d,key=state.metric,compact=window.innerWidth<700,W=compact?Math.max(250,window.innerWidth-80):850,H=compact?240:270,L=43,R=20,T=22,B=range.scale==='year'?55:40,ph=H-T-B;
  const values=points.map(p=>p[key]).filter(v=>v!==null),raw=Math.max(1,...values),max=raw<=5?Math.ceil(raw):Math.ceil(raw/5)*5;
  const x=i=>L+i/Math.max(1,points.length-1)*(W-L-R),y=v=>T+(1-v/max)*ph;
  const fallback=points.findLastIndex(p=>p[key]!==null),selected=state.point!==null&&points[state.point]?state.point:fallback;
  let path='',previous=false;
  const dots=points.map((p,i)=>{
   const v=p[key];if(v===null){previous=false;return '';}
   const complete=p[key+'Complete'];
   if(complete){path+=(previous?' L':' M')+x(i).toFixed(2)+' '+y(v).toFixed(2);previous=true;}else previous=false;
   const label=`${p.start===p.end?dateLabel(p.date):short(p.start)+' au '+short(p.end)} : ${pointText(p,key)}`;
   return `<g class="tr-point-group" role="button" tabindex="0" data-tracking-action="point" data-index="${i}" aria-label="${esc(label)}" aria-pressed="${selected===i}"><circle cx="${x(i)}" cy="${y(v)}" r="17" class="tr-hit"/><circle cx="${x(i)}" cy="${y(v)}" r="${selected===i?6:4}" class="tr-dot${complete?'':' tr-partial'}${selected===i?' tr-selected-dot':''}"/><title>${esc(label)}</title></g>`;
  }).join('');
  const grid=Array.from({length:5},(_,i)=>{const v=max*i/4;return `<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" class="pg-gridline"/><text x="${L-9}" y="${y(v)+4}" text-anchor="end">${v>=1000?num(v/1000)+'k':num(v)}</text>`;}).join('');
  const ticks=points.map((p,i)=>{let text;if(range.scale==='year')text=['jan','fév','mar','avr','mai','juin','juil','aoû','sep','oct','nov','déc'][parseDay(p.date).getMonth()];else if(range.scale==='week')text=parseDay(p.date).toLocaleDateString('fr-FR',{weekday:'short'}).replace('.','');else if(i===0||i===points.length-1||i%5===0)text=String(parseDay(p.date).getDate());else return '';return `<text x="${x(i)}" y="${H-B+22}" text-anchor="${compact&&range.scale==='year'?'end':'middle'}" ${compact&&range.scale==='year'?`transform="rotate(-45 ${x(i)} ${H-B+22})"`:''}>${text}</text>`;}).join('');
  const firstFuture=points.findIndex(p=>p.future),futureX=firstFuture<0?W:x(Math.max(0,firstFuture-.5)),p=points[selected];
  return `<div class="tr-chart tr-chart-${key}" aria-label="${key==='units'?'Consommation':'Dépenses'} : ${esc(title(range))}"><svg viewBox="0 0 ${W} ${H}" role="group" aria-labelledby="tr-chart-title tr-chart-desc"><title id="tr-chart-title">${key==='units'?'Verres standard':'Euros'} ${range.scale==='year'?'par mois de suivi':'par jour'}</title><desc id="tr-chart-desc">Les données manquantes interrompent la courbe. Les points creux sont partiels. Le détail est accessible sous le graphique.</desc>${firstFuture>=0?`<rect x="${futureX}" y="${T}" width="${W-R-futureX}" height="${ph}" class="pg-future"/>`:''}${grid}${ticks}<path d="${path}" class="tr-line"/>${dots}${firstFuture>=0&&W-R-futureX>70?`<text x="${futureX+8}" y="${T+15}">À venir</text>`:''}</svg>${!values.length?`<div class="tr-empty"><strong>Ta courbe commence ici</strong><p>${key==='units'?'Ajoute ta consommation, même à zéro.':'Renseigne tes dépenses, même à 0 €.'}</p>${act('add','Ajouter une journée',`data-date="${range.end<d.today?range.end:d.today}"`,'primary')}</div>`:''}</div><div class="tr-readout" aria-live="polite">${p?`<div><b>${p.start===p.end?dateLabel(p.date):short(p.start)+' – '+short(p.end)}</b><span>${pointText(p,key)}</span></div>${act(p.start===p.end?'add':'days',p.start===p.end?'Voir la journée':'Voir les journées',`data-date="${p.date}" data-start="${p.start}" data-end="${p.end}"`,'text')}`:'<span>Les journées non renseignées restent vides.</span>'}</div><p class="tr-legend">${range.scale==='year'?'Totaux mensuels':'Valeurs par jour'} · ○ partiel · touche un point</p>`;
 }
 function rows(points){return points.map(p=>`<tr><th scope="row">${p.start===p.end?short(p.date):short(p.start)+' – '+short(p.end)}</th><td>${p.future?'À venir':p.units===null?'—':num(p.units)}${p.expected?`<small>${p.unitsCoverage}/${p.expected} j${p.unitsPartial?' · partiel':''}</small>`:''}</td><td>${p.future?'À venir':euros(p.cost)}${p.expected?`<small>${p.costCoverage}/${p.expected} j${p.costPartial?' · partiel':''}</small>`:''}</td><td>${p.future||!p.expected?'':act(p.start===p.end?'add':'days',p.units===null&&p.cost===null?'Ajouter':'Voir',`data-date="${p.date}" data-start="${p.start}" data-end="${p.end}" aria-label="Voir les données du ${dateLabel(p.start)}"`,'text')}</td></tr>`).join('');}
 function table(points){return `<div class="pg-table-scroll"><table class="pg-table tr-table"><caption>Consommation et dépenses renseignées</caption><thead><tr><th scope="col">Période</th><th scope="col">Verres</th><th scope="col">Dépenses</th><th scope="col"><span class="tr-sr-only">Action</span></th></tr></thead><tbody>${rows(points)}</tbody></table></div>`;}
 function view(){
  const d=data(),{range,summary,comparison}=d;state.offset=range.offset;
  const saved=summary.saved,anchorLabel=d.anchor.kind==='tracking'?'Début du suivi':d.anchor.label;
  return `<section class="card tr-tracker" id="tracking"><div class="tr-periods" role="group" aria-label="Période du suivi">${Object.entries(labels).map(([scale,label])=>act('scale',label,`data-scale="${scale}" aria-pressed="${state.scale===scale}"`,state.scale===scale?'is-selected':'')).join('')}</div><div class="tr-period-heading">${act('previous','‹',`aria-label="Période précédente" ${range.canPrev?'':'disabled'}`,'tr-arrow')}<div aria-live="polite"><h2>${esc(title(range))}</h2><span>${range.scale==='year'?'12 mois depuis ton point de départ':range.offset===0?'En cours':range.scale==='week'?'Du lundi au dimanche':'Mois complet'}</span></div>${act('next','›',`aria-label="Période suivante" ${range.canNext?'':'disabled'}`,'tr-arrow')}</div>${range.offset!==0?`<div class="tr-current">${act('current',currentLabels[range.scale],'','text')}</div>`:''}<div class="tr-metrics">${statCard('units','Consommation',summary.quantityDays?num(summary.units):'—',summary.quantityDays,summary,comparison)}${statCard('cost','Dépenses',summary.costDays?euros(summary.cost):'—',summary.costDays,summary,comparison)}</div>${chart(d)}<div class="tr-extras"><div><b>${num(summary.sober)}</b><span>jours sans alcool<small>sur ${summary.filled} bilans</small></span></div><div><b>${euros(saved)}</b><span>${saved!==null&&saved<0?'écart au budget':'économies estimées'}<small>${saved===null?'référence à renseigner':`sur ${summary.costDays} jours connus`}</small></span></div></div><details class="tr-details" id="trDetails" ${state.detailsOpen?'open':''}><summary>Voir le détail</summary>${table(d.points)}<div class="row">${act('export','Exporter cette période','','secondary')}${api.settingsButton()}</div><p class="small">${esc(anchorLabel)} : ${dateLabel(d.anchor.date)}. ${d.anchor.kind==='declared'?'Date déclarée, non vérifiée.':''}</p><p class="small">Totaux sur les jours connus. Les comparaisons utilisent le même nombre de jours entièrement renseignés, hors aujourd’hui. Une donnée manquante ne vaut jamais zéro.</p>${comparison.current&&comparison.previous?`<p class="small">Comparaison : ${short(comparison.current.start)} – ${short(comparison.current.end)} avec ${short(comparison.previous.start)} – ${short(comparison.previous.end)}.</p>`:''}<p class="small">Économies estimées = ancien budget hebdomadaire ÷ 7 × jours de dépenses connus, moins les dépenses déclarées. Un montant négatif indique un dépassement. Les achats et la consommation peuvent avoir lieu à des dates différentes.</p></details></section>`;
 }
 function refresh(action,extra=''){api.render();const target=document.querySelector(`[data-tracking-action="${action}"]${extra}`);target?.focus({preventScroll:true});}
 function showDays(start,end){const d=data(),stop=end<d.today?end:d.today,from=start>d.anchor.date?start:d.anchor.date,map=new Map(d.checks.map(c=>[c.checkin_date,c]));const points=Array.from({length:Math.max(0,dayDiff(stop,from)+1)},(_,i)=>{const date=moveDay(from,i),r=map.get(date),units=unitsOf(r),cost=costOf(r);return {date,start:date,end:date,units,cost,unitsCoverage:units===null?0:1,costCoverage:cost===null?0:1,expected:1,unitsPartial:date===d.today,costPartial:date===d.today,future:false};});api.modal(`${short(start)} – ${short(end)}`,table(points));}
 const actions={
  scale:b=>{if(!labels[b.dataset.scale])return;state.scale=b.dataset.scale;state.offset=0;state.point=null;refresh('scale',`[data-scale="${state.scale}"]`);},
  open:b=>{state.scale=labels[b.dataset.scale]?b.dataset.scale:'week';state.offset=0;state.point=null;api.open();},
  metric:b=>{if(!['units','cost'].includes(b.dataset.metric))return;state.metric=b.dataset.metric;state.point=null;refresh('metric',`[data-metric="${state.metric}"]`);},
  previous:()=>{state.offset=data().range.offset-1;state.point=null;refresh('previous');},
  next:()=>{state.offset=data().range.offset+1;state.point=null;refresh('next');},
  current:()=>{state.offset=0;state.point=null;refresh('scale',`[data-scale="${state.scale}"]`);},
  point:b=>{state.point=Number(b.dataset.index);refresh('point',`[data-index="${state.point}"]`);},
  add:b=>api.openCheck(b.dataset.date||dayKey()),
  days:b=>showDays(b.dataset.start,b.dataset.end),
  export:()=>{const d=data(),range={...d.range,start:d.range.start>d.anchor.date?d.range.start:d.anchor.date};range.days=dayDiff(range.end,range.start)+1;api.download(`sobrizen-${state.scale}-${range.start}-${range.end}.csv`,annualCSV(d.checks,d.chapters,range,d.today),'text/csv;charset=utf-8');}
 };
 document.addEventListener('click',e=>{const b=e.target.closest('[data-tracking-action]');if(!b||b.disabled)return;const action=actions[b.dataset.trackingAction];if(!action)return;e.preventDefault();e.stopImmediatePropagation();try{action(b);}catch(err){api.notify(err.message);}},true);
 document.addEventListener('keydown',e=>{const b=e.target.closest('.tr-point-group');if(b&&(e.key==='Enter'||e.key===' ')){e.preventDefault();actions.point(b);}});
 document.addEventListener('toggle',e=>{if(e.target.id==='trDetails'&&e.target.isConnected)state.detailsOpen=e.target.open;},true);
 return {view,reset};
}
