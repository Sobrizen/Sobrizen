import {esc} from './core.mjs';

const WAIT_MS=60000;
const SPAM='Regarde dans ta boîte de réception et dans les courriers indésirables (spams).';
export function emailFeedback(kind,email=''){
 const address=String(email).trim();
 const common={address,steps:[SPAM,'Patiente quelques minutes. Si tu reçois plusieurs liens, utilise le plus récent.'],resend:['signup','confirmation','recovery'].includes(kind)};
 switch(kind){
  case 'signup':return {...common,title:'Vérifie ta boîte mail',message:'Consulte ton email pour confirmer ton inscription. Si cette adresse peut être utilisée, tu recevras un lien pour activer ton compte.',tip:'Tu as déjà un compte ? Reviens à la connexion ou utilise « Mot de passe oublié ». Aucun nouveau compte n’est nécessaire.'};
  case 'confirmation':return {...common,title:'Confirmation demandée',message:'Si une confirmation est nécessaire, un nouveau lien sera envoyé. Utilise seulement le plus récent.',tip:'Si ton adresse est déjà confirmée, tu peux te connecter directement.'};
  case 'recovery':return {...common,title:'Vérifie tes emails pour réinitialiser ton mot de passe',message:'Si un compte correspond à cette adresse, un email de réinitialisation sera envoyé.',tip:'Ouvre le lien reçu pour choisir un nouveau mot de passe. Ton mot de passe actuel reste valable tant que tu n’en as pas enregistré un nouveau.'};
  case 'email-change':return {...common,title:'Confirme ta nouvelle adresse email',message:'Le changement d’adresse a été demandé. Consulte les emails envoyés aux adresses concernées.',steps:[SPAM,'Vérifie ta nouvelle adresse et ton ancienne boîte mail : une confirmation peut être demandée dans les deux.','Ouvre les liens les plus récents pour terminer le changement.'],tip:'Ton compte et ton parcours restent les mêmes. Ton ancienne adresse reste affichée tant que le changement n’est pas confirmé.',resend:false};
  case 'security-code':return {...common,title:'Consulte tes emails pour le code de sécurité',message:'Un code de sécurité a été demandé. '+SPAM+' Recopie-le dans le champ prévu, puis enregistre le nouveau mot de passe.',resend:false};
  case 'link-expired':return {...common,title:'Ce lien n’est plus valable',message:'Le lien a expiré ou a déjà été utilisé. Reviens à la connexion, renseigne ton adresse et demande un nouveau lien.',tip:'Choisis « Mot de passe oublié » pour réinitialiser ton mot de passe, ou « Renvoyer la confirmation » pour confirmer ton compte.',resend:false};
  default:throw Error('Unknown email feedback');
 }
}
export function authErrorMessage(error){
 const code=String(error?.code||''),text=String(error?.message||error||'');
 if(code==='email_not_confirmed'||/Email not confirmed/i.test(text))return 'Ton adresse email n’est pas encore confirmée. '+SPAM+' Tu peux demander un nouveau lien avec « Renvoyer la confirmation ».';
 if(['otp_expired','flow_state_expired','flow_state_not_found','bad_code_verifier'].includes(code)||/link.*expired|expired.*link|token.*expired/i.test(text))return 'Ce lien a expiré ou a déjà été utilisé. Demande un nouveau lien, vérifie tes emails et tes spams, puis ouvre seulement le plus récent.';
 if(['reauthentication_needed','reauthentication_not_valid'].includes(code))return 'Pour continuer, demande un code de sécurité. Vérifie tes emails et tes spams, recopie le code reçu, puis enregistre à nouveau.';
 if(code.includes('rate_limit')||/rate limit|too many requests|security purposes/i.test(text))return 'La demande est trop rapprochée. Attends au moins une minute, vérifie les emails et les spams déjà reçus, puis réessaie.';
 if(['email_address_not_authorized','email_provider_disabled','email_send_failed','smtp_max_frequency'].includes(code)||/error sending.*email/i.test(text))return 'Le service n’a pas pu envoyer l’email. Réessaie un peu plus tard ou contacte contact@sobrizen.com si le problème continue.';
 return null;
}
export function authLinkState(href){
 const url=new URL(href),hash=new URLSearchParams(url.hash.slice(1)),query=url.searchParams;
 return {type:hash.get('type')||query.get('type')||'',error:hash.get('error_code')||query.get('error_code')||hash.get('error')||query.get('error')||'',failed:!!(hash.has('error')||query.has('error')||hash.has('error_description')||query.has('error_description'))};
}
export function cleanAuthErrorURL(href){const url=new URL(href);for(const name of ['error','error_code','error_description'])url.searchParams.delete(name);return url.pathname+url.search;}

/** Visible, dismissible feedback. Only the email and session identity are retained; never passwords or tokens. */
export function createAuthFeedback({modal,closeModal,notify,context,isCurrent,onRequest,onEdit,onSignin,doc=document,now=()=>Date.now()}){
 let active=null,timer=null,serial=0;
 const cooldowns=new Map();
 const $=selector=>doc.querySelector(selector);
 if(!$('link[data-auth-feedback-style]')){const link=doc.createElement('link');link.rel='stylesheet';link.href='/auth-feedback.css';link.dataset.authFeedbackStyle='';doc.head.append(link);}
 const key=(kind,email)=>(kind==='confirmation'?'signup':kind)+'\n'+String(email).trim().toLowerCase();
 function remember(kind,email){cooldowns.set(key(kind,email),now()+WAIT_MS);}
 function current(item){return active===item&&isCurrent(item.context)&&!!$('[data-auth-email-feedback]');}
 function update(){
  if(!active||!current(active)){clearInterval(timer);timer=null;return;}
  const seconds=Math.max(0,Math.ceil(((cooldowns.get(key(active.kind,active.email))||0)-now())/1000));
  const button=$('[data-auth-feedback="resend"]');if(button){button.disabled=active.busy||seconds>0;button.textContent=active.busy?'Demande en cours…':seconds?'Renvoyer dans '+seconds+' s':'Renvoyer le lien';}
 }
 function show(kind,{email='',requested=true}={}){
  const copy=emailFeedback(kind,email);clearInterval(timer);
  if(requested&&copy.resend)remember(kind,email);
  const item={kind,email:copy.address,context:context(),serial:++serial,busy:false};active=item;
  modal(copy.title,`<section class="auth-email-feedback" data-auth-email-feedback><div class="auth-feedback-symbol" aria-hidden="true">✉</div><p class="auth-feedback-lead" role="status">${esc(copy.message)}</p>${copy.address?`<p class="auth-feedback-address">Adresse concernée<br><strong>${esc(copy.address)}</strong></p>`:''}<ol>${copy.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol><p class="small">${esc(copy.tip||'')}</p><div class="auth-feedback-actions">${copy.resend?'<button type="button" class="secondary" data-auth-feedback="resend">Renvoyer le lien</button>':''}<button type="button" class="text" data-auth-feedback="edit">${kind==='email-change'?'Revenir aux réglages':'Corriger l’adresse email'}</button>${kind!=='email-change'?'<button type="button" class="text" data-auth-feedback="signin">Revenir à la connexion</button>':''}</div><p class="inline-message" data-auth-feedback-status role="status"></p><p class="small">Toujours aucun email ? <a href="mailto:contact@sobrizen.com">Contacter le support</a>.</p><button type="button" class="primary full" data-auth-feedback="done">J’ai compris</button></section>`);
  update();if(copy.resend)timer=setInterval(update,1000);
  return copy;
 }
 function success(kind){
  const messages={
   'account-created':['Compte créé','Ton espace Sobrizen est prêt. Tu peux maintenant compléter ton profil et choisir ton parcours.'],
   'password-updated':['Mot de passe modifié','Ton nouveau mot de passe est enregistré. Utilise-le lors de ta prochaine connexion. Aucune autre confirmation n’est nécessaire pour cette modification.'],
   'email-confirmed':['Adresse email confirmée','Ton adresse email a été vérifiée. Tu peux poursuivre dans ton espace Sobrizen.'],
   'email-pending':['Changement d’email à confirmer','Une confirmation reste nécessaire. Vérifie les emails et les spams de ta nouvelle adresse et de ton ancienne boîte mail. Le changement n’est pas encore terminé.'],
   'email-updated':['Adresse email modifiée','Ta nouvelle adresse est enregistrée. Utilise-la pour tes prochaines connexions.']
  };
  const [title,text]=messages[kind]||messages['email-confirmed'];
  $('[data-auth-feedback-banner]')?.remove();const slot=$('#content')||$('#workspace');if(!slot)return;
  const banner=doc.createElement('aside');banner.className='auth-feedback-banner';banner.dataset.authFeedbackBanner='';banner.setAttribute('role','status');
  const body=doc.createElement('div'),heading=doc.createElement('strong'),paragraph=doc.createElement('p'),button=doc.createElement('button');heading.textContent=title;paragraph.textContent=text;body.append(heading,paragraph);button.type='button';button.className='text';button.textContent='Fermer';button.setAttribute('aria-label','Fermer la confirmation');button.addEventListener('click',()=>banner.remove());banner.append(body,button);slot.before(banner);banner.scrollIntoView?.({block:'nearest',behavior:'instant'});notify(title+'.');
 }
 function reset(){serial++;active=null;clearInterval(timer);timer=null;$('[data-auth-feedback-banner]')?.remove();}
 doc.addEventListener('click',async event=>{
  const button=event.target.closest?.('[data-auth-feedback]');if(!button||button.disabled||!active)return;
  event.preventDefault();const item=active;if(!current(item))return;
  switch(button.dataset.authFeedback){
   case 'done':closeModal();break;
   case 'edit':closeModal();onEdit(item.kind,item.email);break;
   case 'signin':closeModal();onSignin(item.email);break;
   case 'resend':{
    if(item.busy||(cooldowns.get(key(item.kind,item.email))||0)>now())return;
    item.busy=true;update();
    try{await onRequest(item.kind==='recovery'?'recovery':'confirmation',item.email,item.context);}
    catch(error){if(current(item)){const status=$('[data-auth-feedback-status]');status.textContent=authErrorMessage(error)||'La demande n’a pas pu être confirmée. Vérifie ta connexion puis réessaie.';if(/rate_limit/.test(String(error?.code)))remember(item.kind,item.email);}}
    finally{item.busy=false;if(current(item))update();}
    break;
   }
  }
 });
 $('#modal')?.addEventListener('close',()=>{active=null;clearInterval(timer);timer=null;});
  return {show,success,reset,canRequest:(kind,email)=>(cooldowns.get(key(kind,email))||0)<=now()};
}
