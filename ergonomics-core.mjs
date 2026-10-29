/** Presentation helpers only. No health scores, money, dates or account access. */
export const PAGE_LABELS=Object.freeze({home:'Accueil',progress:'Mon suivi',health:'Santé & bienfaits',journey:'Mon parcours',journal:'Mon journal',movement:'Bouger',games:'Jeux',community:'Communauté',profile:'Mon profil'});
export const PAGE_HINTS=Object.freeze({home:'Mon essentiel',progress:'Consommation & budget',health:'Corps, esprit & ressentis',journey:'Mes étapes & mon histoire',journal:'Notes & motivation',movement:'Exercices à mon rythme',games:'Une pause pour moi',community:'Échanger & se soutenir',profile:'Préférences & compte'});
export const normalizeSearch=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr-FR').replace(/\s+/g,' ').trim();
export function filterItems(items,{category='all',query='',limit=12}={}){
 const needle=normalizeSearch(query),bounded=Number.isFinite(limit)?Math.max(1,Math.floor(limit)):12;
 const matches=items.filter(item=>(category==='all'||item.category===category)&&(!needle||normalizeSearch(item.text).includes(needle)));
 return {visible:matches.slice(0,bounded),total:matches.length,remaining:Math.max(0,matches.length-bounded)};
}
export const gameCategory=id=>['memory','ground','merge','sequence'].includes(id)?'calm':'reflex';
export function formFingerprint(fields){
 // Values stay in ephemeral memory. Passwords and file inputs are never read.
 return JSON.stringify(fields.filter(f=>f.name&&!['password','file','submit','button','reset'].includes(f.type)).map(f=>[f.name,f.type,['checkbox','radio'].includes(f.type)?!!f.checked:String(f.value??'')]));
}
