// Date-only arithmetic: no UTC date shift and no daylight-saving drift.
export function dayKey(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
export function parseDay(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))throw Error('Date invalide.');const [y,m,d]=s.split('-').map(Number);const date=new Date(y,m-1,d,12);if(dayKey(date)!==s)throw Error('Date invalide.');return date}
export function moveDay(s,n){const d=parseDay(s);d.setDate(d.getDate()+n);return dayKey(d)}
export function dayDiff(a,b){return Math.round((Date.UTC(...a.split('-').map((n,i)=>Number(n)-(i===1?1:0)))-Date.UTC(...b.split('-').map((n,i)=>Number(n)-(i===1?1:0))))/86400000)}
export function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
export function money(v){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v)||0)}
export function dateLabel(s){return parseDay(s).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})}
export function avg(rows,key){const a=rows.map(x=>x[key]).filter(x=>x!==null&&x!==undefined&&Number.isFinite(Number(x))).map(Number);return a.length?a.reduce((a,b)=>a+b,0)/a.length:null}
export function metrics(checks,weekly=0,today=dayKey()){
 const unique=new Map(checks.filter(c=>c.checkin_date<=today).map(c=>[c.checkin_date,c]));const all=[...unique.values()];
 const recent=all.filter(c=>c.checkin_date>=moveDay(today,-29));const week=all.filter(c=>c.checkin_date>=moveDay(today,-6));const previous=all.filter(c=>c.checkin_date>=moveDay(today,-13)&&c.checkin_date<moveDay(today,-6));
 const sober=all.filter(c=>c.sober_today===true).length;let streak=0;let key=unique.has(today)?today:moveDay(today,-1);
 while(unique.get(key)?.sober_today===true){streak++;key=moveDay(key,-1)}
 const triggers={};for(const c of recent)for(const t of c.trigger_tags||[])triggers[t]=(triggers[t]||0)+1;
 return {sober,total:all.length,streak,saved:sober*Math.max(0,Number(weekly)||0)/7,recent,week,previous,missing30:30-recent.length,rate:recent.length?Math.round(100*recent.filter(c=>c.sober_today===true).length/recent.length):null,triggers:Object.entries(triggers).sort((a,b)=>b[1]-a[1])};
}
export function validateCheck(r,today=dayKey()){parseDay(r.checkin_date);if(r.checkin_date>today)throw Error('Une journée future ne peut pas être renseignée.');if(typeof r.sober_today!=='boolean')throw Error('Choisis le statut de ta journée.');if(!Number.isInteger(r.mood)||r.mood<1||r.mood>5)throw Error('Choisis une humeur de 1 à 5.');if(!Number.isInteger(r.craving)||r.craving<0||r.craving>10)throw Error('Envie : valeur de 0 à 10.');if(r.sleep_hours!==null&&(!Number.isFinite(r.sleep_hours)||r.sleep_hours<0||r.sleep_hours>24))throw Error('Sommeil : entre 0 et 24 heures.');if((r.note||'').length>1000)throw Error('La note est limitée à 1 000 caractères.');return r}
