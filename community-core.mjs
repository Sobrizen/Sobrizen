/** Community metadata is deliberately separate from private health tracking. */
export const EMOTIONS = Object.freeze([
  ['hope','🌱 Espoir'], ['pride','🙌 Fierté'], ['joy','😊 Joie'],
  ['calm','🌿 Sérénité'], ['gratitude','💛 Gratitude'], ['sadness','😔 Tristesse'],
  ['stress','😟 Stress'], ['craving','🫶 Envie d’alcool'], ['anger','😤 Colère'],
  ['loneliness','🤝 Solitude']
]);
export const DURATIONS = Object.freeze([
  ['all','Toutes les durées',null,null], ['week','0 à 6 jours',0,7],
  ['month','7 à 29 jours',7,30], ['quarter','30 à 89 jours',30,90],
  ['half','90 à 179 jours',90,180], ['year','180 à 364 jours',180,365],
  ['long','1 an et plus',365,null], ['unset','Durée non partagée',null,null]
]);
export const KINDS = Object.freeze([['share','Partage'],['victory','Victoire'],['struggle','Moment difficile'],['question','Question']]);
export const SORTS = Object.freeze([['recent','Plus récents'],['short','Abstinence croissante'],['long','Abstinence décroissante']]);
export const PAGE_SIZE = 20;
export const BUCKET = 'community-images';
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export const validUUID = value => UUID.test(String(value));
export const label = (options,key,fallback='') => options.find(item=>item[0]===key)?.[1] ?? fallback;
export const emptyFilters = () => ({emotion:'all',duration:'all',sort:'recent'});
export function normalizeFilters(value={}) {
  return {
    emotion: ['all','unset',...EMOTIONS.map(x=>x[0])].includes(value.emotion) ? value.emotion : 'all',
    duration: DURATIONS.some(x=>x[0]===value.duration) ? value.duration : 'all',
    sort: SORTS.some(x=>x[0]===value.sort) ? value.sort : 'recent'
  };
}
export function validatePost(value={}) {
  const body=String(value.body??'').trim(), kind=String(value.kind??'share');
  if(!body || [...body].length>2000) throw Error('Écris un message de 1 à 2 000 caractères.');
  if(!KINDS.some(x=>x[0]===kind)) throw Error('Choisis un type de publication.');
  const emotion=String(value.emotion??'').trim()||null;
  if(emotion!==null && !EMOTIONS.some(x=>x[0]===emotion)) throw Error('Choisis une émotion de la liste.');
  const raw=String(value.abstinence_days??'').trim();
  let days=null;
  if(raw!==''){
    if(!/^\d+$/.test(raw)) throw Error('La durée doit être un nombre entier de jours, ou rester vide.');
    days=Number(raw);
    if(!Number.isSafeInteger(days)||days<0||days>50000) throw Error('Indique une durée de 0 à 50 000 jours.');
  }
  const alt=String(value.image_alt??'').trim();
  if([...alt].length>180) throw Error('La description de l’image est limitée à 180 caractères.');
  return {body,kind,emotion,abstinence_days:days,image_alt:alt||null};
}
export function matchesPost(post,filters={},kind='all',search='',hidden=[]) {
  const f=normalizeFilters(filters), d=post.abstinence_days;
  if(hidden.includes(post.author_id))return false;
  if(kind!=='all'&&post.kind!==kind)return false;
  if(search&&!String(post.body).toLocaleLowerCase('fr').includes(String(search).toLocaleLowerCase('fr')))return false;
  if(f.emotion==='unset'&&post.emotion!=null)return false;
  if(!['all','unset'].includes(f.emotion)&&post.emotion!==f.emotion)return false;
  if(f.duration==='unset')return d==null;
  const range=DURATIONS.find(x=>x[0]===f.duration);
  if(f.duration!=='all'&&(d==null||!Number.isInteger(d)||d<range[2]||(range[3]!=null&&d>=range[3])))return false;
  return true;
}
export function comparePosts(a,b,sort='recent') {
  if(sort!=='recent'){
    const av=a.abstinence_days,bv=b.abstinence_days;
    if(av==null&&bv!=null)return 1;
    if(bv==null&&av!=null)return -1;
    if(av!=null&&bv!=null&&av!==bv)return sort==='short'?av-bv:bv-av;
  }
  const time=Date.parse(b.created_at)-Date.parse(a.created_at);
  return (Number.isFinite(time)&&time!==0)?time:String(b.id).localeCompare(String(a.id));
}
/** Apply restrictions on the server BEFORE ordering and pagination. */
export function feedQuery(query,{filters={},kind='all',search='',hidden=[],page=0}={}) {
  const f=normalizeFilters(filters);
  if(KINDS.some(x=>x[0]===kind))query=query.eq('kind',kind);
  const term=String(search).trim().slice(0,80).replace(/[%_\\]/g,'');
  if(term)query=query.ilike('body','%'+term+'%');
  if(f.emotion==='unset')query=query.is('emotion',null);
  else if(f.emotion!=='all')query=query.eq('emotion',f.emotion);
  if(f.duration==='unset')query=query.is('abstinence_days',null);
  else if(f.duration!=='all'){
    const [, , min,max]=DURATIONS.find(x=>x[0]===f.duration);
    query=query.gte('abstinence_days',min);
    if(max!=null)query=query.lt('abstinence_days',max);
  }
  const ids=hidden.filter(validUUID).slice(0,500);
  if(ids.length)query=query.not('author_id','in','('+ids.join(',')+')');
  if(f.sort!=='recent')query=query.order('abstinence_days',{ascending:f.sort==='short',nullsFirst:false});
  query=query.order('created_at',{ascending:false}).order('id',{ascending:false});
  const offset=Math.max(0,Number.isSafeInteger(page)?page:0)*PAGE_SIZE;
  return query.range(offset,offset+PAGE_SIZE-1);
}
export function validImagePath(path,author) {
  if(typeof path!=='string'||!validUUID(author))return false;
  const parts=path.split('/');
  return parts.length===2&&parts[0]===author&&parts[1].endsWith('.jpg')&&validUUID(parts[1].slice(0,-4));
}
export function imageSignature(bytes) {
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if([137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png';
  if(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
  return null;
}
