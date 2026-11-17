/** Public traffic only. Account callbacks, query strings and private screens are never sent. */
const PATHS=new Map([['/','/'],['/index.html','/'],['/abonnement','/abonnement'],['/abonnement.html','/abonnement'],['/legal','/legal'],['/legal.html','/legal']]);
const HOSTS=new Set(['www.sobrizen.com','sobrizen.com']);
export function publicPageEvent(event){
  if(event?.type!=='pageview')return null;
  try{
    const url=new URL(event.url),path=PATHS.get(url.pathname);
    if(url.protocol!=='https:'||!HOSTS.has(url.hostname)||!path)return null;
    if(['code','token','token_hash','access_token','refresh_token','error','error_description'].some(key=>url.searchParams.has(key))||/(?:access_token|refresh_token|token_hash|error_description)=/u.test(url.hash))return null;
    return {type:'pageview',url:'https://www.sobrizen.com'+path};
  }catch{return null;}
}
export function startAnalytics(win=window,doc=win.document){
  if(!HOSTS.has(win.location.hostname)||!PATHS.has(win.location.pathname)||win.navigator.doNotTrack==='1'||win.navigator.globalPrivacyControl===true)return false;
  if(doc.querySelector('[data-sobrizen-analytics]'))return false;
  win.va=win.va||function(){(win.vaq=win.vaq||[]).push(arguments);};
  win.va('beforeSend',publicPageEvent);
  const script=doc.createElement('script');script.defer=true;
  script.src='/_vercel/insights/script.js';script.dataset.sobrizenAnalytics='';
  doc.head.append(script);return true;
}
if(typeof window!=='undefined'&&typeof document!=='undefined')startAnalytics();
