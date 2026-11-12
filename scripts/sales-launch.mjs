/** Build-time integration, like the existing community/profile bridges. Fails on source drift. */
function once(source,needle,replacement,label){
 if(!source.includes(needle))throw Error('Sales integration marker missing: '+label);
 if(source.indexOf(needle)!==source.lastIndexOf(needle))throw Error('Sales integration marker ambiguous: '+label);
 return source.replace(needle,replacement);
}
export function integrateSalesApp(source){
 if(source.includes('// sales-purchase-flow-v1'))return source;
 source="// sales-purchase-flow-v1\nimport {capturePurchaseIntent,completePurchaseLogin,clearPurchaseIntent,purchaseEmailRedirect} from './purchase-intent.mjs';\ncapturePurchaseIntent();\n"+source;
 source=once(source,"render();if(S.recovery)passwordModal();else if(!S.settings.privacy_ack_at)","render();if(!S.recovery&&completePurchaseLogin(S.user,S.demo))return;if(S.recovery)passwordModal();else if(!S.settings.privacy_ack_at)",'post-login');
 source=once(source,'function demo(){invalidateSession();','function demo(){clearPurchaseIntent();invalidateSession();','demo clears purchase');
 if(source.split('emailRedirectTo:location.origin').length!==3)throw Error('Sales integration marker changed: email redirect');
 source=source.replaceAll('emailRedirectTo:location.origin','emailRedirectTo:purchaseEmailRedirect()');
 return source;
}
export function integrateSalesSubscription(source){
 if(source.includes('// sales-purchase-flow-v1'))return source;
 source="// sales-purchase-flow-v1\nimport {rememberPlan,loginForPurchase,restorePurchaseSelection} from './purchase-intent.mjs';\n"+source;
 source=once(source," if(chosenPlan()==='launch'&&(!valid||count===0))document.querySelector('input[value=monthly]').checked=true;",'', 'never silently switch plan');
 source=once(source," $('#checkout').disabled=busy||!signed||!open||!known||premium||!launchAvailable||!$('#terms').checked;"," $('#login').href='/?subscribe='+plan;\n $('#checkout').disabled=busy||!open||premium||!launchAvailable||(signed&&(!known||!$('#terms').checked));",'checkout eligibility');
 source=once(source,"$('#checkout').textContent=!open?'Souscriptions non ouvertes':premium?","$('#checkout').textContent=!open?'Souscriptions non ouvertes':!signed?'Continuer avec cette offre':premium?",'guest checkout label');
 source=once(source,"$('#portal').hidden=!signed;","$('#portal').hidden=!signed||!membershipState?.subscriptions?.length;",'portal membership');
 source=once(source,"for(const radio of document.querySelectorAll('input[name=plan]'))radio.addEventListener('change',()=>{$('#terms').checked=false;controls();});","restorePurchaseSelection();\n$('#login').addEventListener('click',()=>{loginForPurchase(chosenPlan());});\nfor(const radio of document.querySelectorAll('input[name=plan]'))radio.addEventListener('change',()=>{rememberPlan(chosenPlan());$('#terms').checked=false;controls();});",'plan retention');
 source=once(source,"$('#checkout').addEventListener('click',()=>action(async context=>{note(","$('#checkout').addEventListener('click',()=>{if(!session){location.assign(loginForPurchase(chosenPlan()));return;}return action(async context=>{rememberPlan(chosenPlan());note(",'guest login');
 source=once(source,"redirectStripe(r.url,context);}));\n$('#portal')","redirectStripe(r.url,context);});});\n$('#portal')",'checkout handler close');
 source=once(source,"$('#launch').textContent=health.sales_open?'Les souscriptions Premium sont ouvertes. Choisis ton rythme ci-dessous.':'Les nouvelles souscriptions Premium sont actuellement fermées. Tu peux consulter ton accès et gérer un abonnement existant.';updateOffer();","$('#launch').hidden=health.sales_open===true;$('#launch').textContent=health.sales_open?'':'Les nouvelles souscriptions sont momentanément indisponibles. Réessaie dans quelques instants.';updateOffer();",'availability notice');
 source=once(source,"if(q.get('checkout')==='success'){","if(q.get('checkout')==='success'){",'checkout return exists');
 return source;
}
export function integrateSalesSubscriptionHtml(source){
 source=source.replace('Les nouvelles souscriptions sont actuellement fermées. Vérification de la disponibilité en cours…','Vérification de la disponibilité des offres…').replace('>Souscriptions non ouvertes</button>','>Vérification des offres…</button>').replace('>Souscriptions actuellement fermées.</p>','>Choisis ton offre pour continuer.</p>');
 const account=source.match(/<section><h2>Mon accès actuel<\/h2>[\s\S]*?<\/section>/);
 if(account){source=source.replace(account[0],'');source=source.replace('<article class="card"><span class="eyebrow">Le socle',account[0]+'\n<article class="card"><span class="eyebrow">Le socle');}
 return source;
}
export function integrateSalesLegal(source){
 source=source.replace(/<p class="notice"><strong>SobriZen est en phase bêta\.[\s\S]*?<\/p>/,'');
 source=source.replace(/<p class="notice">Ces conditions ne constituent pas une ouverture des ventes\.[\s\S]*?<\/p>/,'');
 source=source.replace('Mouad El Khamlichi, entrepreneur individuel. SobriZen est le nom du service.','JANNAH BOUTIQUE — Mouad El Khamlichi, entrepreneur individuel. SobriZen est le nom du service.');
 source=source.replace(/Les coordonnées téléphoniques de l'hébergeur restent à compléter\./,'');
 source=source.replace('service bêta','service').replace(/<strong>L'adhésion ou la convention couvrant SobriZen et les coordonnées du médiateur restent à confirmer et à publier avant la première vente\.<\/strong> Aucun médiateur n'est présenté comme partenaire sans vérification\./,'');
 source=source.replace(/[^<>]*documentation des sous-traitants et des garanties de transferts internationaux doit être finalisée pour l'ouverture commerciale\./,'');
 return source;
}
