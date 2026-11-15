// mon-plan-v2: purchase routing is part of the source, not a build-time rewrite.
import {initFormValidation,showFieldError,showFormError,clearFormError} from './form-validation.mjs';
import {rememberPlan,loginForPurchase,restorePurchaseSelection} from './purchase-intent.mjs';
initFormValidation();
const BASE='https://lnvtowdbbagwfbewnchz.supabase.co',KEY='sb_publishable_NejyPV0XbMiAW_yAmuIrhA_7_zDFYT7',API=BASE+'/functions/v1/sobrizen-billing';
const BILLING_POLICY='immediate-v2-annual1799';
const $=s=>document.querySelector(s);
let client=null,session=null,health=null,receipt=null,receiptContext=null,membershipState=null,busy=false,sessionRevision=0,refreshRevision=0,actionRevision=0;
const errors={AUTH_REQUIRED:'Connecte-toi à SobriZen, puis retrouve Mon Plan.',VERIFIED_EMAIL_REQUIRED:'Confirme ton adresse email avant de continuer.',LAUNCH_SOLD_OUT:'L’offre annuelle de lancement n’est plus disponible. Aucune autre offre n’a été choisie à ta place.',ANNUAL_SOLD_OUT:'L’offre annuelle de lancement n’est plus disponible. Aucune autre offre n’a été choisie à ta place.',OFFER_CHANGED:'L’offre a changé. Actualise cette page et vérifie le montant avant de confirmer.',BILLING_UPDATE_REQUIRED:'La mise à jour du paiement est en cours. Aucun nouveau paiement n’a été lancé.',CHECKOUT_RECOVERY_REQUIRED:'Une souscription précédente doit être vérifiée. Aucun nouveau paiement n’a été lancé. Contacte le support si ce message persiste.',CHECKOUT_PLAN_PENDING:'Une autre offre est en cours de réservation. Actualise ton plan avant de réessayer.',SALES_NOT_OPEN:'Les souscriptions sont momentanément indisponibles.',STRIPE_KEY_MISSING:'Le paiement est momentanément indisponible.',EXISTING_SUBSCRIPTION:'Un abonnement existe déjà. Utilise Gérer mon abonnement pour éviter un double paiement.',CHECKOUT_IN_PROGRESS:'Une demande est déjà en cours. Actualise ton plan avant de réessayer.',NO_SUBSCRIPTION:'Aucun client Stripe n’est encore associé à ce compte.',SESSION_NOT_OWNED:'Ce paiement ne correspond pas à ce compte. Aucun accès n’a été modifié.',TERMS_REQUIRED:'Lis et accepte les conditions avant de continuer.',INVALID_SESSION:'La référence de retour n’est pas valide.',UPSTREAM_UNAVAILABLE:'Le service est momentanément indisponible. Aucune opération n’est confirmée.',SERVICE_UNAVAILABLE:'Le service est momentanément indisponible. Aucune opération n’est confirmée.'};
const sessionContext=()=>({uid:session?.user?.id||null,revision:sessionRevision});
const sameSession=context=>context.revision===sessionRevision&&context.uid===(session?.user?.id||null);
function assertSession(context,required=true){if(!sameSession(context))throw Error('SESSION_CHANGED');if(required&&!context.uid)throw Error('AUTH_REQUIRED');}
function note(text){$('#statusMessage').textContent=text;}
function failure(e,form=null){const text=errors[e.message]||'La vérification n’a pas abouti. Réessaie ou contacte contact@sobrizen.com.';note(text);if(form)showFormError(form,text);}
function clearPlan(){
 $('#planFacts').hidden=true;$('#planGuarantee').hidden=true;$('#planGuarantee').textContent='';$('#currentPrice').textContent='—';$('#currentPlan').textContent='Retrouve ton plan';$('#planState').textContent='À vérifier';$('#billingChecked').textContent='';
 for(const id of ['planStarted','planPeriod','renewalValue'])$('#'+id).textContent='—';
 $('#accessSummary').textContent='Ton historique reste lié à ton compte, même après la fin de Premium.';
}
function setSession(next){
 const changed=(next?.user?.id||null)!==(session?.user?.id||null),wasSigned=!!session;session=next;
 if(changed){
  sessionRevision++;actionRevision++;busy=false;receipt=null;receiptContext=null;membershipState=null;
  $('#receipt').textContent='';$('#receiptBox').hidden=true;$('#emailRequest').removeAttribute('href');$('#terms').checked=false;$('#requestForm').reset();clearPlan();
  $('#membership').textContent=session?'Actualise ton plan pour vérifier l’accès de ce compte.':'Reconnecte-toi pour vérifier ton accès.';
  note(wasSigned?(session?'Ton compte a changé. Actualise ton plan avant de continuer.':'Tu es déconnecté.'):'');
 }
 $('#account').textContent=session?'Connecté avec '+session.user.email:'Connecte-toi pour retrouver ton abonnement et tes factures.';controls();
}
async function timedFetch(url,init={}){return fetch(url,{...init,cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(18000)});}
async function call(route,body={},context=sessionContext()){
 if(!client)throw Error('AUTH_REQUIRED');assertSession(context);
 const r=await client.auth.getSession();assertSession(context);if(r.error)throw Error('AUTH_REQUIRED');
 const current=r.data.session;
 if((current?.user?.id||null)!==context.uid){setSession(current);throw Error('SESSION_CHANGED');}
 const res=await timedFetch(API+'/'+route,{method:'POST',headers:{'Content-Type':'application/json',apikey:KEY,Authorization:'Bearer '+current.access_token},body:JSON.stringify(body)});assertSession(context);
 let data;try{data=await res.json();}catch{throw Error('SERVICE_UNAVAILABLE');}assertSession(context);if(!res.ok)throw Error(data.error||'SERVICE_UNAVAILABLE');return data;
}
const DISPLAY_PLANS={monthly:{amount:299,period:'mois'},annual:{amount:1799,period:'an'}};
const chosenPlan=()=>document.querySelector('input[name=plan]:checked')?.value||'monthly';
const priceText=amount=>(amount/100).toFixed(2).replace('.',',')+' €';
const validDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const dateText=value=>validDate(value)?new Date(value).toLocaleDateString('fr-FR'):'Non communiquée';
const ownPendingAnnual=()=>membershipState?.checkout_pending===true&&membershipState?.checkout_plan==='annual';
const annualAvailable=()=>ownPendingAnnual()||health?.offer?.annual?.available===true;
const offerMatches=()=>health?.offer?.billing_policy===BILLING_POLICY&&health.offer?.trial_days===0&&health.offer?.monthly?.amount===299&&health.offer?.annual?.amount===1799;
function updateOffer(){
 const availability=health?.offer?.annual?.available;
 $('#annualAvailability').textContent=ownPendingAnnual()?'Tu peux reprendre ton paiement annuel déjà ouvert.':availability===true?'Le tarif annuel peut être sélectionné. Sa disponibilité sera confirmée à l’ouverture du paiement.':availability===false?'L’offre annuelle de lancement n’est plus disponible pour une nouvelle souscription.':'La disponibilité de l’offre annuelle n’a pas pu être confirmée. Actualise ton plan pour réessayer.';
}
function controls(){
 const signed=!!session,open=health?.sales_open===true&&offerMatches(),premium=membershipState?.premium===true,known=membershipState!==null,plan=chosenPlan(),offer=DISPLAY_PLANS[plan];
 const subscriptions=membershipState?.subscriptions||[],resumable=membershipState?.checkout_pending===true&&membershipState?.checkout_plan===plan;
 const existing=subscriptions.some(s=>['active','past_due','trialing','unpaid','paused'].includes(s.status)||s.status==='incomplete'&&!resumable);
 const cancellationScheduled=membershipState?.cancel_at_period_end===true||membershipState?.plan_details?.cancel_scheduled===true;
 const canCancel=!cancellationScheduled&&(membershipState?.can_cancel===true||premium),canManage=membershipState?.management_available===true||membershipState?.plan_details?.portal_available===true||premium||subscriptions.length>0,available=plan!=='annual'||annualAvailable();
 $('#checkoutHelp').textContent=busy?'Opération en cours…':!open?'Souscriptions actuellement indisponibles. Tu peux toujours gérer un abonnement existant.':premium||existing?'Ton abonnement est déjà en place. Utilise les outils de Mon Plan pour le gérer.':!available?'Cette offre annuelle ne peut pas être ouverte pour le moment.':!signed?'Crée ton compte ou connecte-toi ; ton choix sera conservé.':!known?'Actualise ton plan avant de confirmer une offre.':!$('#terms').checked?'Coche la case si tu acceptes les conditions pour continuer.':resumable?'Tu reprendras ta page Stripe existante, sans créer un second abonnement.':'Tu vérifieras le récapitulatif et confirmeras le premier paiement sur Stripe.';
 $('#planSummary').textContent='Premier paiement à la confirmation : '+priceText(offer.amount)+' / '+offer.period+'. Aucun essai gratuit. Renouvellement automatique '+(plan==='monthly'?'mensuel.':'annuel. Ce tarif est conservé tant que cet abonnement annuel reste actif.');
 $('#requestFormHelp').textContent=busy?'Enregistrement en cours…':!signed?'Connecte-toi pour envoyer une demande.':'Choisis ta demande puis confirme son envoi.';
 $('#login').hidden=signed;$('#login').href='/?subscribe='+plan;$('#openWorkspace').hidden=!signed;
 $('#terms').disabled=!signed||!open||!known||premium||existing||!available;
 $('#checkout').disabled=busy||!open||premium||existing||!available||(signed&&(!known||!$('#terms').checked));
 $('#checkout').textContent=!open?'Souscriptions indisponibles':!signed?'Continuer avec cette offre':premium?'Premium déjà actif':existing?'Abonnement déjà existant':(resumable?'Reprendre mon paiement — ':'Souscrire — ')+priceText(offer.amount)+' / '+offer.period;
 $('#sendRequest').disabled=busy||!signed;$('#refresh').disabled=busy;
 for(const id of ['portal','invoices','paymentMethod']){$('#'+id).hidden=!signed||!canManage;$('#'+id).disabled=busy||health?.stripe_key_configured===false;}
 $('#cancelSubscription').hidden=!signed||!canCancel;$('#cancelSubscription').disabled=busy||health?.stripe_key_configured===false;
 $('#download').disabled=!receipt||!receiptContext||!sameSession(receiptContext);
 for(const radio of document.querySelectorAll('input[name=plan]'))radio.disabled=busy||(radio.value==='annual'&&!annualAvailable());
 updateOffer();
}
function detailsFor(data){
 if(data.plan_details)return data.plan_details;
 const rows=data.subscriptions||[],row=rows.find(s=>s.plan===data.plan)||rows.find(s=>['active','trialing','past_due','unpaid','paused','incomplete'].includes(s.status))||rows[0];
 if(!row&&!data.plan)return null;
 return {...row,id:row?.plan||data.plan,unit_amount:row?.unit_amount??data.unit_amount,currency:row?.currency||'eur',interval:row?.interval||(data.plan==='monthly'?'month':'year'),interval_count:row?.interval_count||1,status:row?.status||(data.trial?'trialing':data.premium?'active':null),access_until:data.access_until||data.trial_until||data.paid_until,trial_until:data.trial_until||row?.trial_until,paid_until:data.paid_until||row?.paid_until,cancel_scheduled:row?.cancel_at_period_end===true||data.cancel_at_period_end===true};
}
function showStatus(data,context){
 assertSession(context);membershipState=data;const details=detailsFor(data),until=data.access_until||data.trial_until||data.paid_until;
 const pending=(data.subscriptions||[]).find(s=>['incomplete','past_due','unpaid','paused'].includes(s.status)),blocked=(data.subscriptions||[]).some(s=>s.access_blocked===true)||details?.payment_state==='blocked';
 const canceled=details?.cancel_scheduled===true||data.cancel_at_period_end===true,ended=['canceled','incomplete_expired'].includes(details?.status);
 $('#planFacts').hidden=!details;$('#planGuarantee').hidden=true;
 const label=details?.label||(details?.id==='launch'?'Annuel fondateur — offre historique':details?.id==='annual'&&details?.unit_amount===2999?'Annuel — offre historique':details?.id==='annual'?'Annuel':details?.id==='monthly'?'Mensuel':'Abonnement');
 $('#currentPlan').textContent=details?'Premium · '+label:'Gratuit';
 let price='0 €';
 if(details){
  const count=Number.isSafeInteger(details.interval_count)&&details.interval_count>0?details.interval_count:1;
  const unit={month:'mois',year:'an',week:'semaine',day:'jour'}[details.interval];
  const period=unit?(count===1?unit:count+' '+(unit==='mois'?unit:unit+'s')):null;
  price=Number.isSafeInteger(details.unit_amount)&&details.unit_amount>=0?(String(details.currency||'eur').toLowerCase()==='eur'?priceText(details.unit_amount):new Intl.NumberFormat('fr-FR',{style:'currency',currency:/^[a-z]{3}$/i.test(details.currency||'')?details.currency.toUpperCase():'EUR'}).format(details.unit_amount/100))+(period?' / '+period:''):'Montant à consulter dans Stripe';
 }
 $('#currentPrice').textContent=price;
 $('#planState').textContent=blocked?'Accès suspendu':pending?'Action nécessaire':data.trial?'Essai déjà accordé':data.premium?(canceled?'Fin programmée':'Premium actif'):ended?'Abonnement terminé':details?'À vérifier':'Gratuit';
 if(data.premium&&until)$('#membership').textContent=(data.trial?'Essai Premium déjà accordé jusqu’au ':'Premium actif jusqu’au ')+dateText(until)+(canceled?' · renouvellement désactivé.':'.');
 else if(blocked)$('#membership').textContent='Ton accès Premium est suspendu après un incident de paiement. Tu peux gérer ou résilier ton abonnement et contacter le support.';
 else if(pending?.status==='incomplete')$('#membership').textContent=data.checkout_pending?'Paiement à finaliser. Sélectionne ton offre en cours puis reprends ta page Stripe existante.':'Paiement à finaliser. Consulte Gérer mon abonnement ou contacte le support.';
 else if(pending)$('#membership').textContent='Ton abonnement nécessite une action ('+({past_due:'paiement en retard',unpaid:'paiement impayé',paused:'abonnement en pause'}[pending.status])+'). Vérifie ton moyen de paiement dans Stripe.';
 else $('#membership').textContent='Aucun abonnement Premium actif confirmé pour ce compte. Ton espace gratuit et ton historique restent disponibles.';
 if(details){
  $('#planStarted').textContent=dateText(details.started_at||details.original_started_at);
  $('#planPeriod').textContent=validDate(details.current_period_start)&&validDate(details.current_period_end)?'Du '+dateText(details.current_period_start)+' au '+dateText(details.current_period_end):validDate(details.current_period_end)?'Jusqu’au '+dateText(details.current_period_end):'À consulter dans Stripe';
  const nextKnown=validDate(details.next_payment_at),pastDue=nextKnown&&Date.parse(details.next_payment_at)<=Date.now();
  $('#renewalLabel').textContent=canceled?'Fin programmée de l’abonnement':ended?'Renouvellement':pastDue?'Échéance à vérifier':!nextKnown?'Échéance de facturation':data.trial?'Premier paiement prévu':'Prochain paiement prévu';
  $('#renewalValue').textContent=canceled?dateText(details.cancel_at||details.current_period_end||until):ended?'Désactivé':nextKnown?dateText(details.next_payment_at)+(pastDue?' · vérifie le paiement dans Stripe.':''):'À consulter dans Stripe';
  const guaranteed=(details.id==='annual'&&details.unit_amount===1799||details.id==='launch'&&details.unit_amount===1999)&&!ended;
  if(guaranteed){$('#planGuarantee').hidden=false;$('#planGuarantee').textContent='Ton tarif de '+price+' est conservé tant que cet abonnement reste actif. Sa fin effective met fin à cette garantie.';}
 }
 $('#accessSummary').textContent=data.premium?'Tes droits Premium sont actifs : rapports détaillés, tous les jeux, exercices Moyen et Intense, création et modification dans l’agenda. Ton suivi, ton journal et ton historique restent accessibles après Premium.':'Ton accès gratuit conserve le suivi synthétique, le journal, la communauté, les outils de soutien et l’export. Les éléments déjà créés dans l’agenda restent consultables, exportables et supprimables.';
 controls();
}
function broadcastRefresh(){try{const channel=new BroadcastChannel('sobrizen-billing');channel.postMessage({type:'refresh'});channel.close();}catch{}}
async function refresh(context=sessionContext(),synchronize=false){
 const revision=++refreshRevision;
 const assertCurrent=()=>{assertSession(context,false);if(revision!==refreshRevision)throw Error('STALE_REFRESH');};
 let offerError=null,syncError=null;
 try{const res=await timedFetch(API+'/health');assertCurrent();if(!res.ok)throw Error('SERVICE_UNAVAILABLE');const next=await res.json();assertCurrent();health=next;}catch(error){assertCurrent();health=null;offerError=error;}
 $('#launch').hidden=health?.sales_open===true&&offerMatches();$('#launch').textContent='Les nouvelles souscriptions sont momentanément indisponibles. La gestion des abonnements existants reste accessible.';controls();
 if(client&&context.uid){
  let status;
  if(synchronize){try{status=await call('sync',{},context);assertCurrent();broadcastRefresh();}catch(error){assertCurrent();syncError=error;}}
  if(!status){status=await call('status',{},context);assertCurrent();}
  showStatus(status,context);$('#billingChecked').textContent=syncError?'Statut enregistré consulté. La synchronisation avec Stripe n’a pas abouti ; réessaie ou contacte le support.':'Statut consulté le '+new Date().toLocaleString('fr-FR')+'.';
  try{const grant=await client.from('premium_test_grants').select('expires_at').eq('user_id',context.uid).maybeSingle();assertCurrent();if(!grant.error&&validDate(grant.data?.expires_at)&&Date.parse(grant.data.expires_at)>Date.now()&&membershipState?.premium!==true){$('#membership').textContent='Accès Premium temporaire jusqu’au '+dateText(grant.data.expires_at)+'. Aucun paiement et aucun renouvellement automatique.';$('#planState').textContent='Accès temporaire';$('#currentPlan').textContent='Premium temporaire';$('#accessSummary').textContent='Un accès Premium temporaire t’a été accordé. Il ne constitue pas un abonnement Stripe.';}}catch(error){assertCurrent();}
 }
 assertCurrent();controls();return {offerError,syncError};
}
function redirectStripe(value,context){assertSession(context);const url=new URL(value);if(url.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(url.hostname))throw Error('SERVICE_UNAVAILABLE');location.assign(url.href);}
async function action(fn,form=null){if(busy)return;if(form)clearFormError(form);const context=sessionContext(),revision=++actionRevision;busy=true;controls();try{await fn(context);}catch(e){if(sameSession(context)&&revision===actionRevision&&e.message!=='STALE_REFRESH')failure(e,form);}finally{if(revision===actionRevision){busy=false;controls();}}}
restorePurchaseSelection();
$('#terms').addEventListener('change',controls);
$('#login').addEventListener('click',()=>{loginForPurchase(chosenPlan());});
for(const radio of document.querySelectorAll('input[name=plan]'))radio.addEventListener('change',()=>{rememberPlan(chosenPlan());$('#terms').checked=false;controls();});
$('#refresh').addEventListener('click',()=>action(async context=>{const result=await refresh(context,!!context.uid);assertSession(context,false);note(result.syncError?'Ton statut enregistré reste affiché. La synchronisation Stripe est momentanément indisponible.':result.offerError?'Ton plan a été consulté. La disponibilité des nouvelles offres n’a pas pu être vérifiée.':'Ton plan est à jour.');}));
$('#checkout').addEventListener('click',()=>{if(!session){location.assign(loginForPurchase(chosenPlan()));return;}return action(async context=>{rememberPlan(chosenPlan());note('Préparation de la page de paiement sécurisée…');const r=await call('checkout',{accept_terms:$('#terms').checked,terms_version:health?.terms_version,billing_policy:BILLING_POLICY,plan:chosenPlan(),expected_unit_amount:DISPLAY_PLANS[chosenPlan()].amount,expected_trial:false},context);redirectStripe(r.url,context);});});
function openPortal(intent){return action(async context=>{note('Ouverture du portail sécurisé Stripe…');const r=await call('portal',intent?{intent}:{},context);redirectStripe(r.url,context);});}
$('#portal').addEventListener('click',()=>openPortal());
$('#invoices').addEventListener('click',()=>openPortal());
$('#paymentMethod').addEventListener('click',()=>openPortal('payment_method_update'));
$('#cancelSubscription').addEventListener('click',()=>openPortal('cancel'));
$('#requestForm').addEventListener('submit',e=>{e.preventDefault();if(!$('#confirmRequest').checked){showFieldError($('#confirmRequest'),'Coche cette case si tu souhaites envoyer ta demande.');return;}action(async context=>{const r=await call('request',{kind:$('#kind').value,confirm:true},context);assertSession(context);if(!r.id||!r.receipt)throw Error('SERVICE_UNAVAILABLE');receipt=r;receiptContext=context;$('#receipt').textContent=r.receipt;$('#receiptBox').hidden=false;$('#confirmRequest').checked=false;$('#emailRequest').href='mailto:contact@sobrizen.com?subject='+encodeURIComponent('SobriZen — demande '+r.id)+'&body='+encodeURIComponent(r.receipt);note('Demande enregistrée. Conserve ton accusé et préviens le support par email. Le traitement n’est pas encore effectué.');},e.target);});
$('#download').addEventListener('click',()=>{if(!receipt||!receiptContext||!sameSession(receiptContext))return;const url=URL.createObjectURL(new Blob([receipt.receipt],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='sobrizen-demande-'+receipt.id+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
let initialContext=sessionContext();
try{
 const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.117.1');client=createClient(BASE,KEY,{global:{fetch:timedFetch}});
 client.auth.onAuthStateChange((event,next)=>setSession(next));
 const revision=sessionRevision,initial=await client.auth.getSession();
 if(revision===sessionRevision){if(initial.error)throw Error('AUTH_REQUIRED');setSession(initial.data.session);}
 initialContext=sessionContext();await refresh(initialContext,!!initialContext.uid);assertSession(initialContext,false);
 const q=new URLSearchParams(location.search);
 if(q.get('checkout')==='success'||q.get('cancellation')==='submitted'||q.get('payment_method')==='updated'){
  if(initialContext.uid){
   note('Vérification de ton plan en cours…');
   const data=await call('sync',q.get('checkout')==='success'?{session_id:q.get('session_id')}:{},initialContext);showStatus(data,initialContext);broadcastRefresh();
   note(q.get('checkout')==='success'?(data.premium?'Ton abonnement Premium est confirmé. Tu peux retrouver ton espace.':'Aucun paiement ouvrant un accès n’a encore été confirmé. Actualise ton plan ou contacte le support.'):q.get('cancellation')==='submitted'?(data.cancel_at_period_end||data.plan_details?.cancel_scheduled?'Résiliation enregistrée. La date de fin figure dans Mon Plan.':'Ton statut a été vérifié. Consulte les prochaines échéances ci-dessus.'):'Le portail Stripe a été fermé après la gestion du moyen de paiement. Ton plan a été actualisé.');
   history.replaceState(null,'',location.pathname);
  }else note('Connecte-toi au compte utilisé pour le paiement afin de vérifier ton abonnement.');
 }else if(q.get('checkout')==='cancelled'){
  note('Tu as quitté la page de paiement. Aucun nouveau paiement n’est confirmé ici. Tu peux consulter ton plan ou reprendre ta souscription.');history.replaceState(null,'',location.pathname);
 }
}catch(e){if(sameSession(initialContext)&&e.message!=='STALE_REFRESH')failure(e);}finally{controls();}
