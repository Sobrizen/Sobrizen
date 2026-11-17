/** Small, browser-local calculations. No storage, network, application or SDK imports. */
const DAY=86400000;
export function civilDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(value))return null;
  const [year,month,day]=value.split('-').map(Number);
  if(year<1900||year>2100||month<1||month>12||day<1||day>31)return null;
  const serial=Date.UTC(year,month-1,day)/DAY;
  const check=new Date(serial*DAY);
  return check.getUTCFullYear()===year&&check.getUTCMonth()===month-1&&check.getUTCDate()===day?{year,month,day,serial}:null;
}
export function localToday(now=new Date()){
  return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
}
export function elapsedDays(start,today=localToday()){
  const a=civilDate(start),b=civilDate(today);
  if(!a||!b)throw Error('Choisis une date valide.');
  if(a.serial>b.serial)throw Error('La date de départ ne peut pas être dans le futur.');
  return b.serial-a.serial;
}
export function amount(value){
  const normalized=String(value).trim().replace(',','.');
  if(!/^\d+(?:\.\d{1,2})?$/u.test(normalized))throw Error('Saisis un montant positif, avec au maximum deux décimales.');
  const result=Number(normalized);
  if(!Number.isFinite(result)||result>10000)throw Error('Le montant hebdomadaire doit être compris entre 0 et 10 000 €.');
  return result;
}
export function savings(before,after){
  const weekly=amount(before)-amount(after);
  return {weekly,month:weekly*30/7,year:weekly*365/7};
}
export function monthGrid(value){
  if(!/^\d{4}-\d{2}$/u.test(value))throw Error('Choisis un mois valide.');
  const first=civilDate(value+'-01');
  if(!first)throw Error('Choisis un mois entre 1900 et 2100.');
  const count=new Date(Date.UTC(first.year,first.month,0)).getUTCDate();
  return {offset:(new Date(first.serial*DAY).getUTCDay()+6)%7,days:Array.from({length:count},(_,i)=>({day:i+1,date:value+'-'+String(i+1).padStart(2,'0')}))};
}
export function calendarTotals(entries){
  return Object.values(entries).reduce((sum,value)=>{
    if(value==='without')sum.without++;
    if(value==='with')sum.with++;
    return sum;
  },{without:0,with:0});
}
