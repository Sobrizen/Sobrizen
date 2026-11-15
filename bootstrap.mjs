/** Public welcome first; account code is loaded only for an account or an intent. */
import './ergonomics.mjs';
import './install-prompt.mjs';
import {initFormValidation} from './form-validation.mjs';

const SESSION_KEY='sb-lnvtowdbbagwfbewnchz-auth-token';
const PLANS=new Set(['monthly','annual','launch']);
const PATH_ACTIONS=new Set(['signin','signup','start','demo','help','forgot','resend']);
async function loadApplication(){
  await import('./app.mjs');
  await Promise.all([import('./progress-motion.mjs'),import('./consumption-calculator.mjs')]);
}

export function createBootstrap(win=window,doc=win.document,{load=loadApplication}={}){
  const controller=new win.AbortController(),signal=controller.signal;
  let state='idle',promise=null,pending=null,auxiliary=null,modeAction=null,stopped=false;
  try{if(win.localStorage.getItem('sobrizen-theme')==='dark')doc.body.classList.add('dark');}catch{}
  const welcome=()=>doc.getElementById('welcome');
  const form=()=>doc.getElementById('authForm');
  const info=()=>doc.getElementById('authInfo');
  const loadingText='Ouverture de ton espace… Tu peux continuer à remplir le formulaire.';
  function updateStatus(failed=false){
    welcome()?.setAttribute('data-bootstrap-state',state);
    form()?.setAttribute('aria-busy',String(state==='loading'));
    const node=info();if(!node)return;
    if(failed){
      node.replaceChildren(doc.createTextNode('Ton espace n’a pas pu être chargé. Vérifie ta connexion, puis recharge cette page.'));
      const button=doc.createElement('button');button.type='button';button.className='secondary';
      button.dataset.bootstrapReload='';button.textContent='Recharger la page';node.append(doc.createTextNode(' '),button);
    }else if(state==='loading')node.textContent=loadingText;
    else if(node.textContent===loadingText)node.textContent='';
  }
  const available=node=>node?.isConnected&&!node.closest('[hidden],[inert]');
  function replay(){
    const intent=pending,extra=auxiliary,mode=modeAction;pending=null;auxiliary=null;modeAction=null;
    const click=node=>{if(available(node)&&!node.disabled)node.click();};
    // Restore the chosen mode before optional visibility/privacy actions, then
    // submit once. Auxiliary controls must never discard a queued submission.
    if(mode)click(mode);
    if(intent?.type==='click'&&intent.target!==mode)click(intent.target);
    if(extra)click(extra.target);
    if(intent?.type==='submit'&&available(intent.form)){
      // The live DOM retains the latest field values. No FormData or password copy.
      const submitter=available(intent.submitter)&&!intent.submitter.disabled&&intent.submitter.form===intent.form?intent.submitter:undefined;
      intent.form.requestSubmit(submitter);
    }
  }
  function start(){
    if(stopped||state==='failed')return Promise.resolve(false);
    if(state==='ready')return Promise.resolve(true);
    if(promise)return promise;
    state='loading';updateStatus();
    promise=Promise.resolve().then(load).then(()=>{
      if(stopped)return false;
      state='ready';updateStatus();replay();return true;
    },()=>{
      if(stopped)return false;
      state='failed';updateStatus(true);return false;
    });
    return promise;
  }
  function shouldStart(){
    try{if(win.localStorage.getItem(SESSION_KEY)!==null)return true;}catch{}
    const query=new win.URLSearchParams(win.location.search),hash=new win.URLSearchParams(win.location.hash.slice(1));
    return PLANS.has(query.get('subscribe'))||query.has('code')||
      ['access_token','refresh_token','token','token_hash','error','error_description'].some(key=>query.has(key)||hash.has(key))||
      ['recovery','signup','invite','email_change','magiclink'].some(type=>hash.get('type')===type||query.get('type')===type);
  }
  function capture(event,intent,isAuxiliary=false){
    event.preventDefault();event.stopImmediatePropagation();
    if(isAuxiliary)auxiliary=intent;else pending=intent;
    void start();
  }
  doc.addEventListener('click',event=>{
    const reload=event.target.closest?.('[data-bootstrap-reload]');
    if(reload){event.preventDefault();event.stopImmediatePropagation();win.location.reload();return;}
    if(state==='ready'||stopped)return;
    const target=event.target.closest?.('#welcome button[data-action]');
    if(!target||target.disabled)return;
    const path=PATH_ACTIONS.has(target.dataset.action);
    if(path){
      auxiliary=null;
      if(['signin','signup','start'].includes(target.dataset.action))modeAction=target;
    }
    capture(event,{type:'click',target},!path);
  },{capture:true,signal});
  doc.addEventListener('submit',event=>{
    if(state!=='ready'&&!stopped&&event.target===form())capture(event,{type:'submit',form:event.target,submitter:event.submitter});
  },{capture:true,signal});
  doc.addEventListener('focusin',event=>{if(!stopped&&event.target.closest?.('#authForm'))void start();},{signal});
  win.addEventListener('hashchange',()=>{if(shouldStart())void start();},{signal});
  win.addEventListener('storage',event=>{if(event.key===SESSION_KEY&&event.newValue!==null)void start();},{signal});
  if(shouldStart())void start();
  return {start,getState:()=>state,destroy(){stopped=true;pending=null;auxiliary=null;modeAction=null;controller.abort();}};
}
if(typeof window!=='undefined'&&typeof document!=='undefined'){
  initFormValidation();createBootstrap(window,document);
}
