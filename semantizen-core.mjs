/** Original semantic word game. Cosine similarity of quantized French word2vec vectors. */
export const SEMANTIC_VERSION='frwac200-v1';
export const MAX_ATTEMPTS=10000;
const fold=s=>s.normalize('NFD').replace(/\p{M}/gu,'').replaceAll('œ','oe').replaceAll('æ','ae');
export function normalizeWord(value){
  if(typeof value!=='string'||value.length>80)throw Error('Saisis un seul mot français, de 2 à 32 lettres.');
  const word=value.trim().normalize('NFC').toLocaleLowerCase('fr').replaceAll('’',"'");
  if(!/^[a-zàâæçéèêëîïôœùûüÿ]+(?:[-'][a-zàâæçéèêëîïôœùûüÿ]+)*$/u.test(word)||word.length<2||word.length>32)throw Error('Saisis un seul mot français, sans chiffre ni espace.');
  return word;
}
export function createLexicon(manifest,bytes){
  if(manifest?.version!==SEMANTIC_VERSION||manifest.dimensions!==200||!Array.isArray(manifest.words)||manifest.words.length<1000||manifest.words.length>60000||!Array.isArray(manifest.targets)||manifest.targets.length<30)throw Error('Le dictionnaire du jeu est incompatible. Recharge puis réessaie.');
  const vectors=bytes instanceof Int8Array?bytes:new Int8Array(bytes),words=manifest.words;
  if(vectors.length!==words.length*200)throw Error('Le dictionnaire est incomplet. Réessaie son chargement.');
  const index=new Map(),aliases=new Map(),norms=new Float32Array(words.length);
  words.forEach((word,i)=>{
    if(normalizeWord(word)!==word||index.has(word))throw Error('Dictionnaire invalide.');
    index.set(word,i);const key=fold(word);aliases.set(key,aliases.has(key)?-1:i);
    let n=0;for(let j=0;j<200;j++){const v=vectors[i*200+j];n+=v*v;}if(!n)throw Error('Vecteur vide.');norms[i]=Math.sqrt(n);
  });
  if(new Set(manifest.targets).size!==manifest.targets.length||manifest.targets.some(i=>!Number.isInteger(i)||i<0||i>=words.length))throw Error('Liste de défis invalide.');
  return {words,targets:Object.freeze([...manifest.targets]),index,aliases,vectors,norms,dimensions:200};
}
export function lookupWord(lexicon,value){
  const word=normalizeWord(value);let id=lexicon.index.get(word);
  if(id===undefined)id=lexicon.aliases.get(fold(word));
  if(id===undefined||id===-1)throw Error('Ce mot n’est pas reconnu dans le dictionnaire du jeu. Vérifie les accents ou essaie un autre mot.');
  return {id,word:lexicon.words[id],adapted:lexicon.words[id]!==word};
}
export function cosine(lexicon,a,b){
  if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<0||a>=lexicon.words.length||b>=lexicon.words.length)throw Error('Mot inconnu.');
  if(a===b)return 1;
  const {vectors,dimensions:d,norms}=lexicon;let dot=0;
  for(let j=0;j<d;j++)dot+=vectors[a*d+j]*vectors[b*d+j];
  return Math.max(-1,Math.min(.9999,dot/(norms[a]*norms[b])));
}
export function parisDay(date=new Date()){
  if(!Number.isFinite(date.getTime()))throw Error('Date invalide.');
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const value=type=>parts.find(p=>p.type===type).value;return `${value('year')}-${value('month')}-${value('day')}`;
}
export function dailyTarget(lexicon,day=parisDay()){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)throw Error('Date de défi invalide.');
  const n=Math.floor((Date.parse(day+'T00:00:00Z')-Date.UTC(2026,10,10))/86400000),length=lexicon.targets.length;
  return lexicon.targets[((n%length)+length)%length];
}
export function randomTarget(lexicon,excluded=-1,random=Math.random){
  const choices=lexicon.targets.filter(n=>n!==excluded),r=random();
  if(!Number.isFinite(r)||r<0||r>=1)throw Error('Tirage invalide.');return choices[Math.floor(r*choices.length)];
}
export function rankWords(lexicon,target){
  const scores=new Float32Array(lexicon.words.length),order=[];
  for(let i=0;i<scores.length;i++){scores[i]=cosine(lexicon,target,i);if(i!==target)order.push(i);}
  order.sort((a,b)=>scores[b]-scores[a]||a-b);
  const ranks=new Int32Array(scores.length);order.forEach((id,i)=>{ranks[id]=i+1;});
  return {scores,ranks,order};
}
export function newRound(target,{mode='daily',day=parisDay()}={}){
  if(!['daily','free'].includes(mode)||!Number.isInteger(target)||target<0)throw Error('Défi invalide.');
  return {target,mode,day,attempts:[],hints:[],status:'playing',recordSubmitted:false};
}
export function submitGuess(round,lexicon,ranking,value){
  if(round.status!=='playing')throw Error('Cette partie est terminée. Choisis un nouveau défi.');
  const found=lookupWord(lexicon,value),existing=round.attempts.find(x=>x.id===found.id);
  if(existing)return {duplicate:true,entry:existing,adapted:found.adapted};
  if(round.attempts.length>=MAX_ATTEMPTS)throw Error('Limite de propositions atteinte. Tu peux consulter la solution ou lancer un autre défi.');
  const won=found.id===round.target,rank=ranking.ranks[found.id];
  const entry={id:found.id,word:found.word,number:round.attempts.length+1,temperature:won?100:Math.round(ranking.scores[found.id]*10000)/100,rank:won?0:rank,progress:won?1000:rank<=1000?1000-rank:0};
  round.attempts.push(entry);if(won)round.status='won';return {entry,won,duplicate:false,adapted:found.adapted};
}
export function revealHint(round,lexicon,ranking){
  if(round.status!=='playing')throw Error('Cette partie est terminée.');
  if(round.hints.length>=3)throw Error('Les trois indices sont déjà affichés.');
  const used=new Set([...round.attempts.map(x=>x.id),...round.hints.map(x=>x.id)]),start=[299,99,9][round.hints.length];
  let id=ranking.order.slice(0,start+1).reverse().find(i=>!used.has(i));
  if(id===undefined)id=ranking.order.find(i=>!used.has(i));
  if(id===undefined)throw Error('Tous les mots proches ont déjà été proposés.');
  const hint={id,word:lexicon.words[id],rank:ranking.ranks[id]};round.hints.push(hint);return hint;
}
export function recordResult(round){
  if(round.status!=='won'||round.hints.length||!round.attempts.length||round.attempts.length>MAX_ATTEMPTS)return null;
  return {score:1000000-round.attempts.length,level:0,completed:true,timeMs:null};
}
export function shareSummary(round){
  if(round.status!=='won')throw Error('Trouve le mot avant de partager ton résultat.');
  return `SémantiZen · ${round.mode==='daily'?'Défi du '+round.day:'Mode libre'}\nMot trouvé en ${round.attempts.length} essai${round.attempts.length>1?'s':''} · ${round.hints.length?round.hints.length+' indice(s)':'sans indice'}\n🧠 SobriZen — une pause pour soi.`;
}
