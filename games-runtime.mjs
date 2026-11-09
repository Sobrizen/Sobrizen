import {gameRecordLabel} from './game-records-core.mjs';
let api={isPremium:()=>false,records:null,sessionContext:()=>null,sameSession:()=>true},unsubscribe=null;
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function configureGameRuntime(options={}){
  for(const name of ['isPremium','records','sessionContext','sameSession'])if(Object.hasOwn(options,name))api[name]=options[name];
  unsubscribe?.();unsubscribe=api.records?.subscribe(refreshGameRecords)||null;
  if(typeof document!=='undefined'&&!document.getElementById('gameRecordsStyle')){
    const link=document.createElement('link');link.id='gameRecordsStyle';link.rel='stylesheet';link.href=new URL('./game-records.css',import.meta.url).href;document.head.append(link);
  }
  refreshGameRecords();
}
export function gamePremiumAllowed(){return api.isPremium()===true;}
export function gameSession(){return api.sessionContext();}
export function sameGameSession(context){return api.sameSession(context);}
export function beginGameRecord(id){return api.records?.begin(id)||null;}
export function saveGameRecord(token,result){if(!token||!api.records)return;void api.records.save(token,result).catch(()=>{});}
export function gameRecordMarkup(id){return `<span class="game-personal-record" data-game-record="${id}">${esc(api.records?.describe(id)||gameRecordLabel(id,null))}</span>`;}
export function gameRecordStatusMarkup(){return `<span class="game-record-sync" data-game-record-sync role="status">${esc(api.records?.status()||'Records de cette visite uniquement.')}</span><button type="button" class="game-record-retry" data-game-record-retry ${api.records?.needsRetry()?'':'hidden'}>Réessayer l’enregistrement</button>`;}
export function retryGameRecords(){void api.records?.retry();}
export function refreshGameRecords(){
  if(typeof document==='undefined')return;
  for(const node of document.querySelectorAll('[data-game-record]'))node.textContent=api.records?.describe(node.dataset.gameRecord)||gameRecordLabel(node.dataset.gameRecord,null);
  for(const node of document.querySelectorAll('[data-game-record-sync]'))node.textContent=api.records?.status()||'Records de cette visite uniquement.';
  for(const node of document.querySelectorAll('[data-game-record-retry]'))node.hidden=!api.records?.needsRetry();
}
