/** App installation promotion. Only browser-confirmed installation is called a success.
 * Storage contains UI dismissal timestamps only: never account or health data.
 */
export const INSTALL_DELAY = 3000;
const WEEK = 7 * 86400000;
const KEYS = {later:'sobrizen-install-later-v1', shown:'sobrizen-install-shown-v1', installed:'sobrizen-install-confirmed-v1'};
const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 17v4h14v-4"/></svg>';

export function createInstallExperience(win = window, doc = win.document, {delay = INSTALL_DELAY, now = () => Date.now()} = {}) {
  const controller = new win.AbortController(), signal = controller.signal;
  const media = win.matchMedia?.('(display-mode: standalone), (display-mode: minimal-ui), (display-mode: window-controls-overlay)');
  const ua = win.navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && win.navigator.maxTouchPoints > 1);
  const chrome = /Chrome|CriOS|Chromium/.test(ua) && !/Edg|OPR|SamsungBrowser/.test(ua);
  const android = /Android/.test(ua);
  const nativeAPI = () => !ios && typeof win.navigator.install === 'function';
  const read = (store,key) => {try {return win[store].getItem(key);} catch {return null;}};
  const write = (store,key,value) => {try {win[store].setItem(key,String(value));} catch {/* Storage may be disabled. */}};
  const remove = (store,key) => {try {win[store].removeItem(key);} catch {}};
  const timestamp = key => {const value=Number(read('localStorage',key));return Number.isFinite(value)&&value>0?value:0;};
  const recent = (key,age) => {const value=timestamp(key);return value>0&&now()-value>=0&&now()-value<age;};
  let deferred=null, confirmed=!!media?.matches||win.navigator.standalone===true;
  let installedHint=recent(KEYS.installed,90*86400000), accepted=false, busy=false, stopped=false;
  let shown=read('sessionStorage',KEYS.shown)==='1', dismissed=recent(KEYS.later,WEEK);
  let timer=0, deadline=0, queued=false, sheet=null, origin=null;
  const observers=[];
  const installed=()=>confirmed||installedHint||!!media?.matches||win.navigator.standalone===true;
  const ready=()=>!!deferred||nativeAPI();
  const home=()=>!doc.getElementById('welcome')?.hidden || (doc.body?.dataset.page==='home'&&!doc.getElementById('workspace')?.hidden);
  const sensitive=()=>/access_token=|refresh_token=|type=recovery|error_description=/.test(win.location.hash)||new URLSearchParams(win.location.search).has('code');
  const otherDialog=()=>[...doc.querySelectorAll('dialog[open]')].some(el=>el!==sheet);
  const editing=()=>!!doc.activeElement?.matches('input,textarea,select,[contenteditable="true"]');
  function cancelTimer(){if(timer)win.clearTimeout(timer);timer=0;}
  function rememberLater(){dismissed=true;shown=true;write('localStorage',KEYS.later,now());write('sessionStorage',KEYS.shown,'1');cancelTimer();}
  function closeSheet(later=false){
    if(later)rememberLater();
    if(sheet?.open){sheet.close();if(origin?.isConnected&&!origin.closest('[hidden]'))origin.focus({preventScroll:true});}
  }
  function label(){return busy?'Confirmation dans le navigateur…':ready()?'Installer SobriZen':'Ajouter SobriZen à mon écran';}
  function updateButtons(){
    for(const button of doc.querySelectorAll('[data-pwa-action="install"]')){
      const text=button.querySelector('[data-pwa-label]');if(text&&text.textContent!==label())text.textContent=label();
      button.setAttribute('aria-disabled',String(busy));
    }
    for(const note of doc.querySelectorAll('[data-pwa-mode]'))note.textContent=ready()?'Confirme ensuite dans ton navigateur.':'Un guide simple pour l’ajouter à ton écran.';
  }
  function banner(){
    const node=doc.createElement('section');node.className='sz-install-banner';node.dataset.pwaBanner='';
    node.setAttribute('aria-label','Installer SobriZen');
    node.innerHTML='<img src="/icon-192.png" alt="" width="52" height="52"><div class="sz-install-copy"><strong>Ton élan, à portée de main.</strong><p>Retrouve ton suivi et tes outils depuis ton écran d’accueil.</p></div><div class="sz-install-banner-action"><button type="button" class="sz-install-primary" data-pwa-action="install">'+ICON+'<span data-pwa-label></span></button><small data-pwa-mode></small></div>';
    return node;
  }
  function sync(){
    if(stopped||!doc.body)return;
    const visible=!installed()&&!accepted&&(chrome||ready()||ios);
    const welcome=doc.querySelector('#welcome .welcome-hero');
    let landing=welcome?.querySelector('[data-pwa-banner]');
    if(visible&&welcome&&!landing){landing=banner();const tags=welcome.querySelector('.hero-tags');tags?tags.after(landing):welcome.append(landing);}
    if(landing)landing.hidden=!visible;
    const content=doc.getElementById('content');let account=content?.querySelector('[data-pwa-banner]');
    const onHome=doc.body.dataset.page==='home'&&!doc.getElementById('workspace')?.hidden;
    if(visible&&onHome&&content&&!account){account=banner();const heading=content.querySelector('.dy-heading,.greeting');heading?heading.after(account):content.prepend(account);}
    if(account)account.hidden=!visible||!onHome;
    updateButtons();
    if(installed()||accepted){cancelTimer();closeSheet();return;}
    schedule();
  }
  function queueSync(){if(queued||stopped)return;queued=true;win.queueMicrotask(()=>{queued=false;sync();});}
  function schedule(){
    if(timer||shown||dismissed||installed()||accepted||busy||!home()||sensitive()||doc.visibilityState==='hidden'||!(chrome||ready()))return;
    if(!deadline)deadline=now()+Math.max(0,delay);
    timer=win.setTimeout(attempt,Math.max(0,deadline-now()));
  }
  function attempt(){
    timer=0;
    if(stopped||shown||dismissed||installed()||accepted||doc.visibilityState==='hidden'||!home()||sensitive())return;
    if(editing()||otherDialog()||doc.body.classList.contains('menu-open')){timer=win.setTimeout(attempt,1000);return;}
    shown=true;write('sessionStorage',KEYS.shown,'1');showSheet();
  }
  function ensureSheet(){
    if(sheet)return sheet;
    sheet=doc.createElement('dialog');sheet.id='szInstallDialog';sheet.className='sz-install-sheet';
    sheet.setAttribute('aria-labelledby','szInstallTitle');sheet.setAttribute('aria-describedby','szInstallDescription');
    sheet.innerHTML='<button type="button" class="sz-install-close" data-pwa-action="later" aria-label="Fermer l’invitation à installer">×</button><div class="sz-install-art" aria-hidden="true"><span class="sz-install-orbit"></span><img src="/icon-192.png" alt="" width="80" height="80"><span class="sz-install-check">✓</span></div><p class="sz-install-kicker">UN RACCOURCI VERS TES PROGRÈS</p><h2 id="szInstallTitle">Garde ton élan.<br>Emporte SobriZen.</h2><p id="szInstallDescription">Un geste pour retrouver ton suivi, ton journal et tes pauses, chaque jour.</p><div class="sz-install-benefits"><span><b aria-hidden="true">↗</b>Ton suivi à portée de main</span><span><b aria-hidden="true">◇</b>Tes jeux pour faire une pause</span><span><b aria-hidden="true">✓</b>Une icône sur ton écran d’accueil</span></div><button type="button" class="sz-install-primary sz-install-full" data-pwa-action="install">'+ICON+'<span data-pwa-label></span></button><p class="sz-install-mode" data-pwa-mode></p><div class="sz-install-guide" id="szInstallGuide" hidden tabindex="-1"></div><p class="sz-install-status" role="status" aria-live="polite"></p><button type="button" class="sz-install-later" data-pwa-action="later">Plus tard, je continue sur le site</button><p class="sz-install-footnote">Installation sans frais. Les conditions de ton offre restent inchangées.</p>';
    sheet.addEventListener('cancel',e=>{e.preventDefault();closeSheet(true);},{signal});
    sheet.addEventListener('click',e=>{if(e.target===sheet){const r=sheet.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeSheet(true);}},{signal});
    doc.body.append(sheet);return sheet;
  }
  function showSheet(guide=false,message=''){
    if(installed()||busy)return;
    ensureSheet();
    if(!sheet.open){origin=doc.activeElement;try{sheet.showModal();}catch{return;}sheet.querySelector('.sz-install-primary')?.focus({preventScroll:true});}
    updateButtons();sheet.querySelector('.sz-install-status').textContent=message;
    if(guide){
      const panel=sheet.querySelector('.sz-install-guide');panel.hidden=false;
      const steps=ios?['Touche Partager dans la barre du navigateur.','Choisis « Sur l’écran d’accueil », puis « Ajouter ».','L’option n’apparaît pas ? Ouvre cette page dans Safari et utilise Partager.']:android?['Ouvre le menu ⋮ de Chrome.','Choisis « Installer l’application » ou « Ajouter à l’écran d’accueil ».','Confirme, puis retrouve l’icône SobriZen sur ton écran.']:chrome?['Dans Chrome, ouvre le menu ⋮.','Choisis « Caster, enregistrer et partager », puis « Installer la page en tant qu’application ».','L’icône d’installation dans la barre d’adresse peut aussi être proposée.']:['Ouvre le menu de ton navigateur.','Cherche « Installer » ou « Ajouter à l’écran d’accueil ».','Si cette option est absente, continue sur le site ou ouvre SobriZen dans Chrome.'];
      panel.innerHTML='<strong>Ajoute SobriZen en quelques gestes</strong><ol>'+steps.map(s=>'<li>'+s+'</li>').join('')+'</ol><small>Les intitulés peuvent varier selon la version. Si SobriZen est déjà installé, ouvre son icône.</small>';
      panel.focus({preventScroll:true});
    }
  }
  function installedNow(){confirmed=true;installedHint=true;deferred=null;accepted=false;busy=false;write('localStorage',KEYS.installed,now());cancelTimer();closeSheet();sync();}
  async function requestInstall(){
    if(stopped||busy)return;
    shown=true;write('sessionStorage',KEYS.shown,'1');cancelTimer();
    if(installed())return;
    if(!ready()){showSheet(true);return;}
    const event=deferred;deferred=null;busy=true;updateButtons();
    try{
      // No await before prompt(): preserve the click's transient user activation.
      const native=!event&&nativeAPI();
      const pending=event?event.prompt():win.navigator.install();
      const result=await pending;
      const choice=event?(event.userChoice?await event.userChoice:result):null;
      if(native){installedNow();return;}
      if(choice?.outcome==='accepted'){
        accepted=true;closeSheet();
        // Do not call this a completed install: wait for appinstalled.
      }else{rememberLater();closeSheet();}
    }catch(error){
      if(error?.name==='AbortError'){rememberLater();closeSheet();}
      else {busy=false;showSheet(true,'L’installation directe n’est pas disponible ici. Tu peux utiliser le menu de ton navigateur.');}
    }finally{busy=false;sync();}
  }
  // Take ownership of the existing profile Install action, keeping one prompt owner.
  doc.addEventListener('click',e=>{
    const button=e.target.closest?.('[data-pwa-action],[data-action="install"]');if(!button)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(button.dataset.pwaAction==='later')closeSheet(true);else void requestInstall();
  },{capture:true,signal});
  win.addEventListener('beforeinstallprompt',e=>{
    if(typeof e.prompt!=='function')return;
    e.preventDefault();e.stopImmediatePropagation();deferred=e;
    installedHint=false;confirmed=!!media?.matches||win.navigator.standalone===true;accepted=false;
    remove('localStorage',KEYS.installed);queueSync();
  },{capture:true,signal});
  win.addEventListener('appinstalled',installedNow,{signal});
  media?.addEventListener?.('change',()=>{if(media.matches)installedNow();else queueSync();},{signal});
  doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='hidden'){cancelTimer();deadline=0;}else queueSync();},{signal});
  doc.addEventListener('close',queueSync,{capture:true,signal});
  win.addEventListener('pagehide',()=>{cancelTimer();deadline=0;closeSheet();},{signal});
  win.addEventListener('pageshow',queueSync,{signal});
  win.addEventListener('storage',e=>{if(e.key===KEYS.later){dismissed=recent(KEYS.later,WEEK);if(dismissed)closeSheet();}if(e.key===KEYS.installed){installedHint=recent(KEYS.installed,90*86400000);queueSync();}},{signal});
  function observe(){
    if(stopped)return;
    const content=doc.getElementById('content');
    if(content){const ob=new win.MutationObserver(queueSync);ob.observe(content,{childList:true});observers.push(ob);}
    const ob=new win.MutationObserver(queueSync);ob.observe(doc.body,{attributes:true,attributeFilter:['data-page']});
    for(const id of ['welcome','workspace']){const el=doc.getElementById(id);if(el)ob.observe(el,{attributes:true,attributeFilter:['hidden']});}observers.push(ob);sync();
  }
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',observe,{once:true,signal});else observe();
  return {open:()=>showSheet(),sync,destroy(){stopped=true;cancelTimer();controller.abort();observers.forEach(o=>o.disconnect());closeSheet();sheet?.remove();doc.querySelectorAll('[data-pwa-banner]').forEach(el=>el.remove());}};
}
if(typeof window!=='undefined'&&typeof document!=='undefined')createInstallExperience(window,document);

