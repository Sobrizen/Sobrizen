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
/** French convention: ethanol density 0.8 g/ml, 10 g per standard drink. */
export function standardDrinks(volume,strength,portions='1'){
  const decimal=(value,label,max,allowZero=false)=>{
    const normalized=String(value).trim().replace(',','.');
    if(!/^\d+(?:\.\d{1,2})?$/u.test(normalized))throw Error(`${label} : saisis un nombre avec au maximum deux décimales.`);
    const result=Number(normalized);
    if(!Number.isFinite(result)||result>max||result<(allowZero?0:0.01))throw Error(`${label} : ${allowZero?`la valeur doit être comprise entre 0 et ${max}`:`la valeur doit être supérieure à 0 et ne pas dépasser ${max}`}.`);
    return result;
  };
  const cl=decimal(volume,'Volume en cl',2000),percent=decimal(strength,'Degré en %',100,true);
  const count=String(portions).trim();
  if(!/^\d{1,3}$/u.test(count)||Number(count)<1||Number(count)>100)throw Error('Nombre de portions : saisis un entier entre 1 et 100.');
  const grams=cl*percent*0.08*Number(count);
  return {grams,units:grams/10};
}
