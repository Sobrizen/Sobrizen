/** Only an allowlisted offer is retained; no arbitrary return URL or personal data. */
export const PURCHASE_KEY='sobrizen-purchase-intent-v1';
export const PLAN_KEY='sobrizen-selected-plan-v1';
export const PLAN_IDS=Object.freeze(['monthly','annual','launch']);
const valid=plan=>PLAN_IDS.includes(plan);
const storage=()=>{try{return globalThis.sessionStorage;}catch{return null;}};
export function selectedPlan(url=globalThis.location?.href,store=storage()){
 let query;try{query=new URL(url).searchParams.get('plan');}catch{}
 if(valid(query))return query;
 try{const remembered=store?.getItem(PLAN_KEY);if(valid(remembered))return remembered;}catch{}
 return 'monthly';
}
export function rememberPlan(plan,store=storage()){
 if(!valid(plan))return false;try{store?.setItem(PLAN_KEY,plan);}catch{}return true;
}
export function loginForPurchase(plan,store=storage(),now=Date.now()){
 if(!valid(plan))throw Error('Offre inconnue.');rememberPlan(plan,store);
 try{store?.setItem(PURCHASE_KEY,JSON.stringify({plan,expires:now+2*60*60*1000}));}catch{}
 return '/?subscribe='+plan;
}
export function capturePurchaseIntent(url=globalThis.location?.href,store=storage(),now=Date.now()){
 let plan;try{plan=new URL(url).searchParams.get('subscribe');}catch{}
 if(valid(plan)){loginForPurchase(plan,store,now);return plan;}return null;
}
export function pendingPurchase(store=storage(),now=Date.now()){
 try{const value=JSON.parse(store?.getItem(PURCHASE_KEY)||'null');if(value&&valid(value.plan)&&Number.isFinite(value.expires)&&value.expires>now&&value.expires<=now+2*60*60*1000)return value.plan;store?.removeItem(PURCHASE_KEY);}catch{}return null;
}
export function clearPurchaseIntent(store=storage()){try{store?.removeItem(PURCHASE_KEY);}catch{}}
export function completePurchaseLogin(user,demo=false,{store=storage(),now=Date.now(),navigate=url=>globalThis.location.assign(url)}={}){
 if(!user?.id||demo)return false;const plan=pendingPurchase(store,now);if(!plan)return false;
 clearPurchaseIntent(store);navigate('/abonnement?plan='+plan);return true;
}
export function restorePurchaseSelection(doc=globalThis.document,url=globalThis.location?.href,store=storage()){
 const plan=selectedPlan(url,store),radio=doc?.querySelector('input[name=plan][value="'+plan+'"]');
 if(radio){radio.checked=true;rememberPlan(plan,store);}return plan;
}
/** Confirmation links must retain the plan even in a different browser tab. */
export function purchaseEmailRedirect(origin=globalThis.location?.origin,store=storage(),now=Date.now()){
 const plan=pendingPurchase(store,now);
 return plan?'https://www.sobrizen.com/?subscribe='+plan:origin;
}
