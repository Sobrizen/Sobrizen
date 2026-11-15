import {initFormValidation,showFieldError,showFormError,clearFormError} from './form-validation.mjs';
initFormValidation();
const BASE='https://lnvtowdbbagwfbewnchz.supabase.co',KEY='sb_publishable_NejyPV0XbMiAW_yAmuIrhA_7_zDFYT7',API=BASE+'/functions/v1/sobrizen-billing';
const BILLING_POLICY='immediate-v1';
const $=s=>document.querySelector(s);let client=null,session=null,health=null,receipt=null,receiptContext=null,membershipState=null,busy=false,sessionRevision=0,refreshRevision=0,actionRevision=0;
const errors={AUTH_REQUIRED:'Connecte-toi à SobriZen, puis reviens sur cette page.',VERIFIED_EMAIL_REQUIRED:'Confirme ton adresse email avant de continuer.',LAUNCH_SOLD_OUT:'Les dernières places de lancement viennent d’être attribuées. Actualise le compteur et choisis une autre offre.',OFFER_CHANGED:'L’offre a changé. Actualise cette page avant de confirmer.',BILLING_UPDATE_REQUIRED:'La mise à jour du paiement est en cours. Aucun nouveau paiement n’a été lancé. Réessaie dans quelques instants.',CHECKOUT_RECOVERY_REQUIRED:'Une souscription précédente doit être vérifiée. Aucun nouveau paiement n’a été lancé. Contacte le support si ce message persiste.',CHECKOUT_PLAN_PENDING:'Une autre offre est en cours de réservation. Actualise ton statut avant de réessayer.',SALES_NOT_OPEN:'Les souscriptions ne sont pas encore ouvertes.',STRIPE_KEY_MISSING:'Le paiement n’est pas disponible pour le moment. Aucun nouveau paiement ne peut être lancé.',EXISTING_SUBSCRIPTION:'Un abonnement existe déjà. Utilise Gérer mon abonnement pour éviter un double paiement.',CHECKOUT_IN_PROGRESS:'Une demande est déjà en cours. Actualise ton statut avant de réessayer.',NO_SUBSCRIPTION:'Aucun client Stripe n’est encore associé à ce compte.',SESSION_NOT_OWNED:'Ce paiement ne correspond pas à ce compte. Aucun accès n’a été modifié.',TERMS_REQUIRED:'Lis et accepte les conditions avant de continuer.',INVALID_SESSION:'La référence de retour n’est pas valide.',UPSTREAM_UNAVAILABLE:'Le service est momentanément indisponible. Aucune opération n’est confirmée.',SERVICE_UNAVAILABLE:'Le service est momentanément indisponible. Aucune opération n’est confirmée.'};
function note(text){$('#statusMessage').textContent=text;}
function failure(e,form=null){const text=errors[e.message]||'La vérification n’a pas abouti. Réessaie ou contacte contact@sobrizen.com.';note(text);if(form)showFormError(form,text);}
const sessionContext=()=>({uid:session?.user?.id||null,revision:sessionRevision});
const sameSession=context=>context.revision===sessionRevision&&context.uid===(session?.user?.id||null);
function assertSession(context,required=true){if(!sameSession(context))throw Error('SESSION_CHANGED');if(required&&!context.uid)throw Error('AUTH_REQUIRED');}
function setSession(next){
 const changed=(next?.user?.id||null)!==(session?.user?.id||null),wasSigned=!!session;session=next;
 if(changed){
  sessionRevision++;actionRevision++;busy=false;receipt=null;receiptContext=null;membershipState=null;
  $('#receipt').textContent='';$('#receiptBox').hidden=true;$('#emailRequest').removeAttribute('href');$('#terms').checked=false;$('#requestForm').reset();
  $('#membership').textContent=session?'Actualise le statut pour vérifier l’accès de ce compte.':'Reconnecte-toi pour vérifier ton accès.';
  note(wasSigned?(session?'Ton compte a changé. Actualise le statut avant de continuer.':'Tu es déconnecté.'): '');
 }
 $('#account').textContent=session?'Connecté avec '+session.user.email:'Tu n’es pas connecté à Sobrizen sur ce navigateur.';controls();
}
async function timedFetch(url,init={}){return fetch(url,{...init,cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(18000)});}
async function call(route,body={},context=sessionContext()){
 if(!client)throw Error('AUTH_REQUIRED');assertSession(context);
 const r=await client.auth.getSession();assertSession(context);
 if(r.error)throw Error('AUTH_REQUIRED');
 const current=r.data.session;
 if((current?.user?.id||null)!==context.uid){setSession(current);throw Error('SESSION_CHANGED');}
 const res=await timedFetch(API+'/'+route,{method:'POST',headers:{'Content-Type':'application/json',apikey:KEY,Authorization:'Bearer '+current.access_token},body:JSON.stringify(body)});assertSession(context);
 let data;try{data=await res.json();}catch{throw Error('SERVICE_UNAVAILABLE');}assertSession(context);if(!res.ok)throw Error(data.error||'SERVICE_UNAVAILABLE');return data;
}
const DISPLAY_PLANS={monthly:{amount:299,period:'mois'},annual:{amount:2999,period:'an'},launch:{amount:1999,period:'an'}};
const chosenPlan=()=>document.querySelector('input[name=plan]:checked')?.value||'monthly';
const priceText=amount=>(amount/100).toFixed(2).replace('.',',')+' €';
function updateOffer(){
 const count=health?.offer?.launch?.remaining,valid=Number.isInteger(count)&&count>=0&&count<=100;
 $('#launchCounter').textContent=valid?(count>0?`${count} place${count>1?'s':''} de lancement disponible${count>1?'s':''} sur 100`:'Les 100 places de lancement sont attribuées ou réservées.'):'Compteur momentanément indisponible. L’offre de lancement ne peut pas être sélectionnée.';
 document.querySelector('input[value=launch]').disabled=!valid||count===0;
 if(chosenPlan()==='launch'&&(!valid||count===0))document.querySelector('input[value=monthly]').checked=true;
}
function controls(){
 const signed=!!session,open=health?.sales_open===true&&health.offer?.billing_policy===BILLING_POLICY&&health.offer?.trial_days===0,premium=membershipState?.premium===true,known=membershipState!==null,plan=chosenPlan(),offer=DISPLAY_PLANS[plan];
 const subscriptions=membershipState?.subscriptions||[],resumable=membershipState?.checkout_pending===true&&membershipState?.checkout_plan===plan;
 const existing=subscriptions.some(s=>['active','past_due','trialing','unpaid','paused'].includes(s.status)||s.status==='incomplete'&&!resumable);
 const canCancel=membershipState?.can_cancel===true||premium,canManage=membershipState?.management_available===true||premium||subscriptions.length>0;
 const ownPendingLaunch=membershipState?.checkout_pending===true&&membershipState?.checkout_plan==='launch';
 const launchAvailable=plan!=='launch'||ownPendingLaunch||(Number.isInteger(health?.offer?.launch?.remaining)&&health.offer.launch.remaining>0&&health.offer.launch.remaining<=100);
 $('#checkoutHelp').textContent=busy?'Opération en cours…':!open?'Souscriptions actuellement indisponibles. Recharge cette page si le problème persiste.':!signed?'Connecte-toi pour t’abonner.':!known?'Actualise ton statut avant de choisir une offre.':premium||existing?'Un abonnement existe déjà. Utilise Gérer mon abonnement ou Résilier ci-dessous.':!launchAvailable?'Aucune place de lancement confirmée.':!$('#terms').checked?'Coche la case si tu acceptes les conditions pour continuer.':resumable?'Tu reprendras ta page Stripe existante pour terminer le paiement, sans créer un second abonnement.':'Tu vérifieras le récapitulatif et confirmeras le premier paiement sur Stripe.';
 $('#planSummary').textContent='Premier paiement à la confirmation : '+priceText(offer.amount)+' / '+offer.period+'. Aucun essai gratuit. Renouvellement automatique '+(offer.period==='mois'?'mensuel':'annuel')+'.'+(plan==='launch'?' Ce tarif est conservé tant que cet abonnement annuel reste actif.':'');
 $('#requestFormHelp').textContent=busy?'Enregistrement en cours…':!signed?'Connecte-toi pour envoyer une demande.':'Choisis ta demande puis confirme son envoi.';
 $('#login').hidden=signed;$('#terms').disabled=!signed||!open||premium||existing;
 $('#checkout').disabled=busy||!signed||!open||!known||premium||existing||!launchAvailable||!$('#terms').checked;
 $('#checkout').textContent=!open?'Souscriptions indisponibles':premium?'Premium déjà actif':existing?'Gérer mon abonnement':(resumable?'Reprendre mon paiement — ':'Souscrire — ')+priceText(offer.amount)+' / '+offer.period;
 $('#sendRequest').disabled=busy||!signed;$('#refresh').disabled=busy;$('#portal').hidden=!signed||!canManage;$('#portal').disabled=busy||health?.stripe_key_configured!==true;$('#cancelSubscription').hidden=!signed||!canCancel;$('#cancelSubscription').disabled=busy||health?.stripe_key_configured!==true;$('#download').disabled=!receipt||!receiptContext||!sameSession(receiptContext);
 for(const radio of document.querySelectorAll('input[name=plan]'))radio.disabled=busy||(radio.value==='launch'&&!ownPendingLaunch&&!(Number.isInteger(health?.offer?.launch?.remaining)&&health.offer.launch.remaining>0&&health.offer.launch.remaining<=100));
}
function showStatus(data,context){
 assertSession(context);membershipState=data;const until=data.access_until||data.trial_until||data.paid_until,period=data.plan==='monthly'?'mensuel':'annuel';
 const pending=(data.subscriptions||[]).find(s=>['incomplete','past_due','unpaid','paused'].includes(s.status)),blocked=(data.subscriptions||[]).some(s=>s.access_blocked===true);
 if(data.premium===true&&until)$('#membership').textContent=(data.trial?'Essai Premium déjà accordé jusqu’au ':'Premium actif jusqu’au ')+new Date(until).toLocaleDateString('fr-FR')+(data.cancel_at_period_end?' · renouvellement désactivé.':' · renouvellement '+period+'.')+(data.plan==='launch'?' Tarif de lancement : 19,99 € / an tant que cet abonnement reste actif.':'');
 else if(blocked)$('#membership').textContent='Ton accès Premium est suspendu après un incident de paiement. Tu peux gérer ou résilier ton abonnement et contacter le support.';
 else if(pending?.status==='incomplete')$('#membership').textContent=data.checkout_pending?'Paiement à finaliser. Sélectionne ton offre en cours, vérifie le prix, puis reprends ta page Stripe existante.':'Paiement à finaliser. Consulte Gérer mon abonnement ou contacte le support pour reprendre ta souscription.';
 else if(pending)$('#membership').textContent='Ton abonnement nécessite une action ('+({past_due:'paiement en retard',unpaid:'paiement impayé',paused:'abonnement en pause'}[pending.status])+'). Utilise Gérer mon abonnement pour vérifier ta carte ou Résilier pour désactiver son renouvellement.';
 else $('#membership').textContent='Aucun abonnement Premium actif confirmé pour ce compte. Ton espace gratuit et ton historique restent disponibles.';
 controls();
}
async function refresh(context=sessionContext()){
 const revision=++refreshRevision;
 const assertCurrent=()=>{assertSession(context,false);if(revision!==refreshRevision)throw Error('STALE_REFRESH');};
 const res=await timedFetch(API+'/health');assertCurrent();if(!res.ok)throw Error('SERVICE_UNAVAILABLE');
 const nextHealth=await res.json();assertCurrent();health=nextHealth;
 $('#launch').textContent=health.sales_open?'Les souscriptions Premium sont ouvertes. Choisis ton rythme ci-dessous.':'Les nouvelles souscriptions Premium sont actuellement fermées. Tu peux consulter ton accès et gérer un abonnement existant.';updateOffer();
 if(client&&context.uid){
  const status=await call('status',{},context);assertCurrent();showStatus(status,context);
  try{
   const grant=await client.from('premium_test_grants').select('expires_at').eq('user_id',context.uid).maybeSingle();assertCurrent();
   if(!grant.error&&grant.data?.expires_at&&Date.parse(grant.data.expires_at)>Date.now()&&membershipState?.premium!==true){$('#membership').textContent='Accès Premium temporaire jusqu’au '+new Date(grant.data.expires_at).toLocaleDateString('fr-FR')+'. Aucun paiement et aucun renouvellement automatique.';}
  }catch(error){assertCurrent();console.warn('Premium test access unavailable.',error?.message||error);}
 }
 assertCurrent();controls();
}
function redirectStripe(value,context){assertSession(context);const url=new URL(value);if(url.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(url.hostname))throw Error('SERVICE_UNAVAILABLE');location.assign(url.href);}
async function action(fn,form=null){if(busy)return;if(form)clearFormError(form);const context=sessionContext(),revision=++actionRevision;busy=true;controls();try{await fn(context);}catch(e){if(sameSession(context)&&revision===actionRevision&&e.message!=='STALE_REFRESH')failure(e,form);}finally{if(revision===actionRevision){busy=false;controls();}}}
$('#terms').addEventListener('change',controls);
for(const radio of document.querySelectorAll('input[name=plan]'))radio.addEventListener('change',()=>{$('#terms').checked=false;controls();});
$('#refresh').addEventListener('click',()=>action(async context=>{await refresh(context);assertSession(context,false);note('Ton statut d’abonnement est à jour.');}));
$('#checkout').addEventListener('click',()=>action(async context=>{note('Préparation de la page de paiement sécurisée…');const r=await call('checkout',{accept_terms:$('#terms').checked,terms_version:health?.terms_version,billing_policy:BILLING_POLICY,plan:chosenPlan(),expected_unit_amount:DISPLAY_PLANS[chosenPlan()].amount,expected_trial:false},context);redirectStripe(r.url,context);}));
$('#portal').addEventListener('click',()=>action(async context=>{const r=await call('portal',{},context);redirectStripe(r.url,context);}));
$('#cancelSubscription').addEventListener('click',()=>action(async context=>{note('Ouverture de la résiliation sécurisée…');const r=await call('portal',{intent:'cancel'},context);redirectStripe(r.url,context);}));
$('#requestForm').addEventListener('submit',e=>{e.preventDefault();if(!$('#confirmRequest').checked){showFieldError($('#confirmRequest'),'Coche cette case si tu souhaites envoyer ta demande.');return;}action(async context=>{const r=await call('request',{kind:$('#kind').value,confirm:true},context);assertSession(context);if(!r.id||!r.receipt)throw Error('SERVICE_UNAVAILABLE');receipt=r;receiptContext=context;$('#receipt').textContent=r.receipt;$('#receiptBox').hidden=false;$('#confirmRequest').checked=false;$('#emailRequest').href='mailto:contact@sobrizen.com?subject='+encodeURIComponent('SobriZen — demande '+r.id)+'&body='+encodeURIComponent(r.receipt);note('Demande enregistrée. Conserve ton accusé et préviens le support par email. Le traitement n’est pas encore effectué.');},e.target);});
$('#download').addEventListener('click',()=>{if(!receipt||!receiptContext||!sameSession(receiptContext))return;const url=URL.createObjectURL(new Blob([receipt.receipt],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='sobrizen-demande-'+receipt.id+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
let initialContext=sessionContext();
try{
 const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.117.1');client=createClient(BASE,KEY,{global:{fetch:timedFetch}});
 client.auth.onAuthStateChange((event,next)=>setSession(next));
 const revision=sessionRevision,initial=await client.auth.getSession();
 if(revision===sessionRevision){if(initial.error)throw Error('AUTH_REQUIRED');setSession(initial.data.session);}
 initialContext=sessionContext();await refresh(initialContext);assertSession(initialContext,false);
 const q=new URLSearchParams(location.search);
 if(q.get('checkout')==='success'){
  note('Vérification de ton abonnement en cours…');
  if(initialContext.uid){const data=await call('sync',{session_id:q.get('session_id')},initialContext);showStatus(data,initialContext);note(data.premium?'Ton abonnement Premium est confirmé.':'Aucun essai ni paiement ouvrant un accès n’a encore été confirmé. Actualise le statut ou contacte le support.');history.replaceState(null,'',location.pathname);}else note('Connecte-toi au compte utilisé pour le paiement afin de vérifier ton abonnement.');
 }else if(q.get('checkout')==='cancelled'){
  note('Tu as quitté la page de paiement. Ton statut est affiché ci-dessus.');history.replaceState(null,'',location.pathname);
 }else if(q.get('cancellation')==='submitted'){
  if(initialContext.uid){const data=await call('sync',{},initialContext);showStatus(data,initialContext);note(data.cancel_at_period_end?'Résiliation enregistrée : Premium reste actif jusqu’à la fin de ton essai ou de la période déjà payée.':'Ta demande de résiliation a été transmise à Stripe. Actualise le statut si la mise à jour n’apparaît pas encore.');}assertSession(initialContext,false);history.replaceState(null,'',location.pathname);
 }
}catch(e){if(sameSession(initialContext)&&e.message!=='STALE_REFRESH'){$('#account').textContent='La vérification de connexion n’a pas abouti.';failure(e);}}finally{controls();}
