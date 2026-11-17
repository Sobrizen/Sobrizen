import {localToday,civilDate,elapsedDays,savings,monthGrid,calendarTotals} from './tools-core.mjs';
const euro=new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:2});
const fullDate=value=>new Intl.DateTimeFormat('fr-FR',{dateStyle:'long',timeZone:'UTC'}).format(new Date(civilDate(value).serial*86400000));

export function mountTools(doc=document,today=localToday(),print=()=>window.print()){
  const counter=doc.querySelector('[data-tool="counter"]');
  if(counter){
    const input=counter.querySelector('[name="start"]'),error=counter.querySelector('[data-error]'),result=counter.querySelector('[data-result]');
    input.max=today;
    counter.addEventListener('submit',event=>{
      event.preventDefault();error.textContent='';
      try{
        const count=elapsedDays(input.value,today);
        counter.querySelector('[data-count]').textContent=new Intl.NumberFormat('fr-FR').format(count);
        counter.querySelector('[data-counter-caption]').textContent=`${count>1?'jours écoulés':'jour écoulé'} depuis le ${fullDate(input.value)}`;
        counter.querySelector('[data-next-cap]').textContent=count===0?'Ton point de départ est posé.':`Prochain repère de 10 jours : ${Math.floor(count/10)*10+10} jours.`;
        result.hidden=false;
      }catch(e){error.textContent=e.message;result.hidden=true;input.focus();}
    });
    counter.querySelector('[data-controls]').disabled=false;
  }
  const budget=doc.querySelector('[data-tool="budget"]');
  if(budget){
    budget.addEventListener('submit',event=>{
      event.preventDefault();const error=budget.querySelector('[data-error]'),result=budget.querySelector('[data-result]');error.textContent='';
      try{
        const projection=savings(budget.querySelector('[name="before"]').value,budget.querySelector('[name="after"]').value);
        for(const key of ['weekly','month','year'])budget.querySelector(`[data-money="${key}"]`).textContent=euro.format(projection[key]);
        budget.querySelector('[data-budget-caption]').textContent=projection.weekly<0?'Avec ces montants, ton budget augmente. Les valeurs négatives représentent ce surcoût.':'Écart de dépenses estimé si ces budgets restent identiques.';
        result.hidden=false;
      }catch(e){error.textContent=e.message;result.hidden=true;}
    });
    budget.querySelector('[data-controls]').disabled=false;
    budget.requestSubmit();
  }
  const calendar=doc.querySelector('[data-tool="calendar"]');
  if(calendar){
    const input=calendar.querySelector('[name="month"]'),grid=calendar.querySelector('[data-calendar-grid]'),error=calendar.querySelector('[data-error]');
    const months=new Map();
    input.value=today.slice(0,7);
    function render(){
      error.textContent='';
      let data;
      try{data=monthGrid(input.value);}catch(e){error.textContent=e.message;grid.replaceChildren();return;}
      if(!months.has(input.value))months.set(input.value,{});
      const entries=months.get(input.value),fragment=doc.createDocumentFragment();
      const name=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(input.value+'-01T12:00:00Z'));
      calendar.querySelector('[data-calendar-title]').textContent=name;
      for(let i=0;i<data.offset;i++){const blank=doc.createElement('span');blank.className='calendar-blank';blank.setAttribute('aria-hidden','true');fragment.append(blank);}
      for(const {day,date} of data.days){
        const state=entries[date]||'unknown',button=doc.createElement('button');button.type='button';button.className='calendar-day';button.dataset.day=date;button.dataset.state=state;
        const status=state==='without'?'Sans alcool':state==='with'?'Avec alcool':'Non renseigné';
        button.setAttribute('aria-label',`${fullDate(date)} : ${status}. ${date>today?'Date future.':'Changer l’observation.'}`);
        button.disabled=date>today;
        const num=doc.createElement('strong'),label=doc.createElement('span'),short=doc.createElement('span');
        num.textContent=day;label.className='calendar-status';label.textContent=status;
        short.className='calendar-status-short';short.textContent=state==='without'?'S':state==='with'?'A':'—';short.setAttribute('aria-hidden','true');
        button.append(num,label,short);fragment.append(button);
      }
      grid.replaceChildren(fragment);
      const totals=calendarTotals(entries);
      calendar.querySelector('[data-without]').textContent=totals.without;
      calendar.querySelector('[data-with]').textContent=totals.with;
      calendar.querySelector('[data-observed]').textContent=totals.without+totals.with;
    }
    input.addEventListener('change',render);
    grid.addEventListener('click',event=>{
      const button=event.target.closest('[data-day]');if(!button||button.disabled)return;
      const entries=months.get(input.value),current=entries[button.dataset.day]||'unknown';
      const next=current==='unknown'?'without':current==='without'?'with':'unknown';
      if(next==='unknown')delete entries[button.dataset.day];else entries[button.dataset.day]=next;
      const date=button.dataset.day;render();grid.querySelector(`[data-day="${date}"]`)?.focus();
    });
    calendar.querySelector('[data-print]')?.addEventListener('click',print);
    render();
  }
  const plan=doc.querySelector('[data-evening-plan]');
  if(plan){
    plan.addEventListener('submit',event=>{
      event.preventDefault();const parts=['moment','alternative','support'].map(name=>plan.querySelector(`[name="${name}"]`).value.trim());
      const error=plan.querySelector('[data-error]'),result=plan.querySelector('[data-result]');
      if(parts.some(p=>!p)){error.textContent='Complète les trois éléments pour préparer ton plan.';result.hidden=true;return;}
      error.textContent='';plan.querySelector('[data-plan-text]').textContent=`Quand ${parts[0]}, je prévois ${parts[1]}. Si j’ai besoin d’un appui : ${parts[2]}.`;result.hidden=false;
    });
    plan.querySelector('[data-controls]').disabled=false;
  }
}
if(typeof document!=='undefined')mountTools();
