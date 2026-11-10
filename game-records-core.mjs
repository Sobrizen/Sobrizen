/** Personal, client-reported leisure results. No health or public ranking data. */
export const GAME_IDS=Object.freeze(['snake','blocks','merge','sequence','memory','reaction','taps','ground','mosaic','gems','sort','bubbles','links','semantizen']);
export const FREE_GAMES=Object.freeze(['snake','blocks','ground']);
const IDS=new Set(GAME_IDS),PUZZLES=new Set(['gems','sort','bubbles','links']);
const MAX_SCORE=1_000_000_000,MAX_LEVEL=1_000_000,MAX_TIME=86_400_000;
function integer(value,name,maximum){if(!Number.isSafeInteger(value)||value<0||value>maximum)throw Error(`${name} invalide.`);return value;}
export function normalizeGameResult(gameId,result={}){
 if(!IDS.has(gameId))throw Error('Jeu inconnu.');
 const score=integer(result.score??0,'Score',gameId==='reaction'?15:MAX_SCORE),level=integer(result.level??0,'Niveau',gameId==='memory'?4:MAX_LEVEL),completed=result.completed===true;
 let timeMs=result.timeMs??null;
 if(timeMs!==null){integer(timeMs,'Temps',MAX_TIME);if(!timeMs)throw Error('Temps invalide.');}
 if(timeMs!==null&&!(gameId==='reaction'&&score>0||gameId==='memory'&&completed&&level===4))throw Error('Ce résultat ne possède pas de record de temps.');
 if(gameId==='ground'&&(score!==0||level!==0||timeMs!==null))throw Error('Les pauses ne sont pas des performances.');
 if(gameId==='semantizen'&&(!completed||score<990000||score>999999||level!==0||timeMs!==null))throw Error('Une victoire sans indice est nécessaire pour ce record.');
 return Object.freeze({score,level,timeMs,completed});
}
export function normalizeGameRecord(row,expectedUserId=null){
 if(!row||!IDS.has(row.game_id)||expectedUserId!==null&&row.user_id!==expectedUserId)throw Error('Record personnel non confirmé.');
 const number=(value,name,max)=>integer(typeof value==='string'&&/^\d+$/.test(value)?Number(value):value,name,max);
 const record={game_id:row.game_id,user_id:row.user_id??null,best_score:number(row.best_score??0,'Score',row.game_id==='reaction'?15:MAX_SCORE),best_level:number(row.best_level??0,'Niveau',row.game_id==='memory'?4:MAX_LEVEL),best_time_ms:row.best_time_ms==null?null:number(row.best_time_ms,'Temps',MAX_TIME),completed_sessions:number(row.completed_sessions??0,'Séances',Number.MAX_SAFE_INTEGER),updated_at:typeof row.updated_at==='string'?row.updated_at:null};
 if(record.best_time_ms===0)throw Error('Temps invalide.');
 if(record.game_id==='semantizen'&&(record.best_score<990000||record.best_score>999999||record.best_level||record.best_time_ms!==null||record.completed_sessions))throw Error('Record de mots invalide.');
 return record;
}
export function mergeGameRecord(previous,gameId,result,{userId=null,countCompletion=true}={}){
 const value=normalizeGameResult(gameId,result),old=previous?normalizeGameRecord(previous):null,times=[old?.best_time_ms,value.timeMs].filter(n=>n!=null);
 return {game_id:gameId,user_id:userId??old?.user_id??null,best_score:Math.max(old?.best_score||0,value.score),best_level:Math.max(old?.best_level||0,value.level),best_time_ms:times.length?Math.min(...times):null,completed_sessions:(old?.completed_sessions||0)+(gameId==='ground'&&value.completed&&countCompletion?1:0),updated_at:old?.updated_at||null};
}
export function combineGameRecords(left,right){
 if(!left)return normalizeGameRecord(right);const a=normalizeGameRecord(left),b=normalizeGameRecord(right);
 if(a.game_id!==b.game_id||a.user_id!==b.user_id)throw Error('Les records appartiennent à des espaces différents.');
 const times=[a.best_time_ms,b.best_time_ms].filter(n=>n!==null);
 return {...b,best_score:Math.max(a.best_score,b.best_score),best_level:Math.max(a.best_level,b.best_level),best_time_ms:times.length?Math.min(...times):null,completed_sessions:Math.max(a.completed_sessions,b.completed_sessions)};
}
function duration(ms){const seconds=Math.max(1,Math.round(ms/1000));return `${Math.floor(seconds/60)} min ${String(seconds%60).padStart(2,'0')} s`;}
const plural=(value,word)=>`${value} ${word}${value===1?'':'s'}`;
export function gameRecordLabel(gameId,record){
 if(!IDS.has(gameId))return '';
 if(!record)return gameId==='ground'?'Mes pauses : aucune séance terminée':gameId==='semantizen'?'Mon record : aucun mot trouvé sans indice':'Mon record : à découvrir';
 const r=normalizeGameRecord(record),n=r.best_score;
 if(gameId==='ground')return `Mes pauses : ${r.completed_sessions} séance${r.completed_sessions===1?'':'s'} terminée${r.completed_sessions===1?'':'s'}`;
 if(gameId==='semantizen')return `Mon record : ${plural(1000000-n,'essai')} · sans indice`;
 let value='';
 if(gameId==='snake')value=plural(n,'fruit');
 else if(gameId==='sequence')value=`${n} suite${n===1?'':'s'} retrouvée${n===1?'':'s'}`;
 else if(gameId==='taps')value=`${plural(n,'cible')} en 20 s`;
 else if(gameId==='memory')value=r.best_level===4?`4 niveaux terminés${r.best_time_ms?` · ${duration(r.best_time_ms)}`:''}`:`${r.best_level}/4 niveaux terminés · ${plural(n,'paire')}`;
 else if(gameId==='reaction')value=`${n}/15 signaux${r.best_time_ms?` · meilleur signal ${r.best_time_ms} ms`:''}`;
 else if(PUZZLES.has(gameId))value=r.best_level?`niveau ${r.best_level} terminé · ${n} pts`:`${n} pts · aucun niveau terminé`;
 else value=`${n} pts${gameId==='mosaic'&&r.best_level?` · niveau ${r.best_level} atteint`:''}`;
 return 'Mon record : '+value;
}
