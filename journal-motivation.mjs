/** Original SobriZen encouragements. No medical claims or borrowed attributions. */
export const MOTIVATION_TITLE = 'Une pensée pour avancer · SobriZen';
export const MOTIVATION_KIND = 'reflection';

export const MOTIVATION_QUOTES = Object.freeze([
  'Une journée difficile n’efface pas le chemin parcouru.',
  'Le prochain pas est encore possible.',
  'Recommencer est déjà une façon d’avancer.',
  'Tu peux construire une suite différente.',
  'Même un petit pas mérite d’être reconnu.',
  'Ton histoire continue de s’écrire.',
  'Aujourd’hui peut commencer par un petit choix pour toi.',
  'Prendre soin de toi mérite une place dans ta journée.',
  'Tu as le droit d’aller mieux à ton rythme.',
  'Demander de l’aide, c’est faire de la place au changement.',
  'Tu peux traverser ce moment avec du soutien.',
  'Tu mérites d’être accompagné, même les jours où tu doutes.',
  'Le progrès existe aussi dans les efforts que personne ne voit.',
  'Un pas imparfait ouvre déjà une nouvelle direction.',
  'Tu peux être fier d’essayer encore.',
  'Ta valeur dépasse les chiffres d’un compteur.',
  'Accorde-toi la patience que tu offrirais à quelqu’un que tu aimes.',
  'Tu n’as pas à porter tout ton avenir aujourd’hui.',
  'L’espoir peut commencer par une décision minuscule.',
  'Le changement se construit aussi dans les petites décisions.',
  'Chaque retour vers toi compte.',
  'Tu peux apprendre de cette journée sans te juger.',
  'Ta vie mérite les efforts que tu lui consacres.',
  'Une nouvelle page peut commencer ici.',
  'Tu peux avancer avec tes doutes et trouver du soutien en chemin.',
  'Prends le temps de reconnaître ce que tu as déjà traversé.',
  'Ce que tu construis pour toi mérite du temps.',
  'Il reste de la place pour des jours différents.',
  'Tu as le droit de faire de toi une priorité.',
  'Un moment de douceur envers toi peut compter beaucoup.',
  'Les petites victoires ont leur place dans les grandes histoires.',
  'Tu peux revenir à ce qui compte, un choix à la fois.',
  'Une rechute ne réécrit pas toutes tes victoires.',
  'Tes efforts comptent aussi les jours où ton compteur recommence.',
  'Ta vie vaut la peine d’être reconstruite, même pièce par pièce.',
  'Le courage, parfois, c’est simplement de dire : j’ai besoin d’aide.',
  'Tu mérites une vie dans laquelle tu peux être pleinement présent.',
  'Ton passé a marqué ton histoire. Tu peux encore en écrire la suite.',
  'Reprendre soin de toi, c’est redonner de la place à ta vie.',
  'Les détours n’enlèvent rien à ton droit d’avancer.',
].map((text,index)=>Object.freeze({id:`sobrizen-${String(index+1).padStart(2,'0')}`,text})));

/** Uses only existing journal columns and an already supported kind. */
export function isMotivationEntry(entry){
  return entry?.kind===MOTIVATION_KIND && entry?.title===MOTIVATION_TITLE;
}

/** A shuffled deck lives only in memory. Every quote is seen before a repeat. */
export function createQuoteRotation(random=Math.random){
  let deck=[],last=null;
  return {
    next(){
      if(!deck.length){
        deck=[...MOTIVATION_QUOTES];
        for(let i=deck.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
        if(deck.at(-1).id===last)[deck[0],deck[deck.length-1]]=[deck.at(-1),deck[0]];
      }
      const quote=deck.pop();last=quote.id;return quote;
    },
    reset(){deck=[];last=null;},
  };
}

/**
 * Stable UUIDv8 per account and quote. The existing journal primary key makes
 * retries and concurrent tabs idempotent without a new database constraint.
 * Nothing is written to browser storage.
 */
export async function motivationEntryId(userId,quoteId){
  if(!userId||!MOTIVATION_QUOTES.some(quote=>quote.id===quoteId))throw Error('Cette citation n’est plus disponible.');
  const source=new TextEncoder().encode(`sobrizen:journal-motivation:v1:${userId}:${quoteId}`);
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',source)).slice(0,16);
  bytes[6]=(bytes[6]&15)|128;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
