import {GAME_IDS,normalizeGameResult,normalizeGameRecord,mergeGameRecord,combineGameRecords,gameRecordLabel} from './game-records-core.mjs';

/**
 * Call load after account loading, reset on session invalidation/logout/demo.
 * Unsynced results remain in memory only and are discarded on session changes.
 * Old anonymous localStorage keys are intentionally never read or imported.
 */
export function createGameRecords({S,getClient,sessionContext,sameSession}){
  let generation=0,owner=null,ownerSession=null,records=new Map(),state='idle',loadVersion=0;
  const runs=new WeakMap(),pending=new Map(),listeners=new Set();
  const key=()=>S.demo?'demo':S.user?.id?`account:${S.user.id}`:'guest';
  const emit=()=>{for(const listener of listeners)listener();};
  function reset(){generation++;loadVersion++;owner=null;ownerSession=null;records=new Map();pending.clear();state='idle';emit();}
  function ensure(){
    const next=key();
    if(next!==owner||ownerSession&&!sameSession(ownerSession)){
      generation++;loadVersion++;records=new Map();pending.clear();state='idle';owner=next;ownerSession=sessionContext();
    }
    return {generation,owner,session:ownerSession,userId:S.demo?null:S.user?.id||null,demo:!!S.demo};
  }
  function current(context){return context.generation===generation&&context.owner===key()&&sameSession(context.session);}
  function status(){
    ensure();
    if(owner==='demo')return 'Records de cette démo uniquement, effacés en quittant.';
    if(owner==='guest')return 'Records de cette visite uniquement. Connecte-toi pour les conserver.';
    if(pending.size)return [...pending.values()].some(run=>run.inflight)?'Enregistrement de ton record…':'Record non synchronisé. Réessaie avant de quitter cet espace.';
    if(state==='loading')return 'Chargement de tes records…';
    if(state==='unavailable')return 'Tes records sont momentanément indisponibles. Réessaie.';
    return 'Tes records sont privés et enregistrés avec ton compte.';
  }
  async function load(){
    const context=ensure(),version=++loadVersion;
    if(!context.userId){state='ready';emit();return true;}
    state='loading';emit();
    try{
      const db=await getClient();if(!current(context)||version!==loadVersion)return false;
      const result=await db.from('game_records').select('user_id,game_id,best_score,best_level,best_time_ms,completed_sessions,updated_at').eq('user_id',context.userId).order('game_id');
      if(!current(context)||version!==loadVersion)return false;
      if(result.error)throw result.error;if(!Array.isArray(result.data)||result.data.length>GAME_IDS.length)throw Error('Records indisponibles.');
      for(const row of result.data){const record=normalizeGameRecord(row,context.userId);records.set(record.game_id,combineGameRecords(records.get(record.game_id),record));}
      state='ready';emit();return true;
    }catch(error){if(current(context)&&version===loadVersion){state='unavailable';emit();}return false;}
  }
  function begin(gameId){
    if(!GAME_IDS.includes(gameId))throw Error('Jeu inconnu.');
    const context=ensure(),token=Object.freeze({id:crypto.randomUUID()});
    runs.set(token,{...context,gameId,id:token.id,saved:false,result:null,inflight:null});return token;
  }
  async function send(run){
    if(!current(run))return {saved:false,stale:true};
    if(run.saved)return {saved:true};
    if(run.inflight)return run.inflight;
    run.inflight=(async()=>{
      try{
        const db=await getClient();if(!current(run))return {saved:false,stale:true};
        const v=run.result;
        const result=await db.rpc('save_game_record',{p_game_id:run.gameId,p_score:v.score,p_level:v.level,p_time_ms:v.timeMs,p_completed:v.completed,p_run_id:run.id,p_expected_user_id:run.userId});
        if(!current(run))return {saved:false,stale:true};
        if(result.error)throw result.error;
        const row=Array.isArray(result.data)&&result.data.length===1?result.data[0]:result.data;
        const record=normalizeGameRecord(row,run.userId);
        if(record.game_id!==run.gameId||record.best_score<v.score||record.best_level<v.level||v.timeMs!==null&&(record.best_time_ms===null||record.best_time_ms>v.timeMs)||run.gameId==='ground'&&v.completed&&record.completed_sessions<1)throw Error('Le record enregistré n’est pas confirmé.');
        records.set(run.gameId,combineGameRecords(records.get(run.gameId),record));run.saved=true;pending.delete(run.id);state='ready';return {saved:true,record:{...records.get(run.gameId)}};
      }catch(error){return {saved:false,error:'Ton record n’a pas pu être synchronisé.'};}
      finally{run.inflight=null;if(current(run))emit();}
    })();
    emit();return run.inflight;
  }
  function save(token,result){
    const run=runs.get(token);if(!run||!current(run))return Promise.resolve({saved:false,stale:true});
    if(run.saved)return Promise.resolve({saved:true});
    if(!run.result)run.result=normalizeGameResult(run.gameId,result);
    const v=run.result;
    if(!v.score&&!v.level&&!v.completed&&v.timeMs===null){run.saved=true;return Promise.resolve({saved:true,empty:true});}
    if(!run.userId){
      records.set(run.gameId,mergeGameRecord(records.get(run.gameId),run.gameId,v));run.saved=true;state='ready';emit();return Promise.resolve({saved:true,local:true,record:{...records.get(run.gameId)}});
    }
    pending.set(run.id,run);return send(run);
  }
  async function retry(){ensure();if(state==='unavailable')await load();return Promise.all([...pending.values()].map(send));}
  const online=()=>{void retry();};globalThis.addEventListener?.('online',online);
  return {load,reset,begin,save,retry,status,
    record(gameId){ensure();const value=records.get(gameId);return value?{...value}:null;},
    describe(gameId){ensure();return gameRecordLabel(gameId,records.get(gameId));},
    needsRetry(){ensure();return state==='unavailable'||[...pending.values()].some(run=>!run.inflight);},
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    destroy(){globalThis.removeEventListener?.('online',online);reset();listeners.clear();},
  };
}
