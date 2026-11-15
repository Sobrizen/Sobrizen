/** Refresh only account access. Never reload private forms or trust cross-tab claims. */
export const BILLING_CHANNEL='sobrizen-billing';
export function accessDeadline(state={}){
 const paid=Date.parse(state.access_until||state.paid_until)||0,trial=Date.parse(state.trial_until)||0,test=Date.parse(state.test_until)||0;
 return Math.max(paid,state.trial?trial:0,test);
}
export function expireUnverifiedAccess(state={},now=Date.now()){
 // An unavailable service cannot invent or prolong an entitlement.
 if(state.premium===true&&accessDeadline(state)>now)return state;
 return {...state,premium:false,trial:false,test:false,ready:false};
}
export function createMembershipRefresh({context,isCurrent,read,readFallback,apply,state,win=globalThis.window,doc=globalThis.document,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,minInterval=30000,interval=300000,channelFactory=name=>new win.BroadcastChannel(name)}){
 let generation=0,pending=null,lastAttempt=-Infinity,retryAt=0,timer=null,stopped=false,channel=null;
 const eligible=c=>!!c?.user&&!c.demo;
 const current=(c,g)=>!stopped&&g===generation&&isCurrent(c);
 function schedule(){
  clearTimer(timer);timer=null;const c=context();if(stopped||!eligible(c))return;
  const until=accessDeadline(state()),remaining=until-now();
  let delay=state()?.premium&&remaining>0?Math.min(interval,remaining+10):interval;
  if(retryAt&&!doc?.hidden)delay=Math.min(delay,Math.max(10,retryAt-now()));
  timer=setTimer(()=>{timer=null;if(doc?.hidden){schedule();return;}void refresh({expiry:until>0&&now()>=until});},delay);
 }
 async function refresh({expiry=false,afterChange=false}={}){
  const c=context(),g=generation;if(stopped||!eligible(c)||doc?.hidden)return false;
  if(pending){if(afterChange)retryAt=Math.max(now()+10,lastAttempt+minInterval+10);return pending;}
  if(!expiry&&now()-lastAttempt<minInterval){retryAt=lastAttempt+minInterval+10;schedule();return false;}
  lastAttempt=now();retryAt=0;
  const task=(async()=>{
   let next;
   try{next=await read(c);}
   catch{
    if(!current(c,g))return false;
    try{next=await readFallback(c);}catch{if(current(c,g))next=expireUnverifiedAccess(state(),now());}
   }
   if(!current(c,g)||!next)return false;
   apply(next);return true;
  })();
  pending=task;
  try{return await task;}finally{if(current(c,g)&&pending===task){pending=null;schedule();}}
 }
 const visible=()=>{if(!doc?.hidden)void refresh();},signal=event=>{if(event?.data?.type==='refresh'&&!doc?.hidden)void refresh({afterChange:true});};
 win?.addEventListener('focus',visible);win?.addEventListener('online',visible);win?.addEventListener('pageshow',visible);doc?.addEventListener('visibilitychange',visible);
 try{channel=channelFactory(BILLING_CHANNEL);channel.addEventListener('message',signal);}catch{}
 return {refresh,schedule,reset(){generation++;pending=null;lastAttempt=-Infinity;retryAt=0;clearTimer(timer);timer=null;},destroy(){stopped=true;generation++;pending=null;clearTimer(timer);win?.removeEventListener('focus',visible);win?.removeEventListener('online',visible);win?.removeEventListener('pageshow',visible);doc?.removeEventListener('visibilitychange',visible);channel?.removeEventListener('message',signal);channel?.close();}};
}
