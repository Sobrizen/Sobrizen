import {esc,validUUID} from './community-core.mjs';
import {showFieldError,showFormError,clearFormError} from './form-validation.mjs';

const DEFAULTS=Object.freeze({likes_enabled:true,comments_enabled:true,push_enabled:false});
const PAGE_SIZE=20;
const options=(name,text,checked)=>`<label class="checklabel"><input type="checkbox" name="${name}" ${checked?'checked':''}> ${text}</label>`;
const passwordInput=(name,label)=>`<label>${label}<span class="account-password"><input name="${name}" type="password" autocomplete="${name==='current'?'current-password':'new-password'}" required ${name==='current'?'':'minlength="10"'}><button type="button" class="text" data-account="show-password" aria-pressed="false">Afficher</button></span></label>`;
const dateLabel=value=>new Date(value).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'});

/** Account changes never share a form, password, or late response across sessions. */
export function createAccountCenter({S,getClient,sessionContext,sameSession,assertSession,checkResult,modal,closeModal,notify,message,verifyPassword,openPublication,leave}){
  if(!document.querySelector('link[data-account-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/account-center.css';link.dataset.accountStyle='';document.head.append(link);}
  let seen=null,revision=0,preferences={...DEFAULTS},loaded=false,loadError='',rows=[],hasMore=false,unread=0,poll=null,loading=null,channel=null,opening=0;
  const $=selector=>document.querySelector(selector);
  const online=()=>navigator.onLine!==false;
  async function request(run,context=sessionContext()){
    assertSession(context);if(context.demo)throw Error('Cette action est disponible dans ton compte personnel, pas dans la démonstration.');
    if(!online())throw Error('Reconnecte-toi à Internet puis réessaie.');
    const db=await getClient();assertSession(context);const result=await run(db,context.user.id);assertSession(context);return checkResult(result);
  }
  function reset(){
    revision++;opening++;clearInterval(poll);poll=null;loading=null;loaded=false;loadError='';seen=null;rows=[];unread=0;hasMore=false;preferences={...DEFAULTS};
    if(channel){try{channel.unsubscribe();}catch{}channel=null;}
    updateBell();
  }
  function updateBell(){
    const bell=$('[data-account="inbox"]');if(!bell)return;
    bell.hidden=!S.user;bell.setAttribute('aria-label',`Notifications${unread?', '+unread+' non lue'+(unread>1?'s':''):''}`);
    const badge=bell.querySelector('[data-notification-count]');if(badge){badge.hidden=!unread;badge.textContent=unread>99?'99+':String(unread);}
  }
  function details(){return `<dl class="account-details"><div><dt>Email de connexion</dt><dd>${esc(S.demo?'alex@exemple.fr':S.user?.email||'Indisponible')}</dd></div><div><dt>Confirmation de l’email</dt><dd>${S.demo?'Démonstration':S.user?.email_confirmed_at?'Confirmé':'À confirmer'}</dd></div></dl>${S.user?.new_email?`<p class="account-pending" role="status">Changement en attente : <b>${esc(S.user.new_email)}</b>. Confirme les liens reçus dans les boîtes email concernées.</p>`:''}`;}
  function view(){return `
    <section class="card account-card"><span class="eyebrow">COMPTE & SÉCURITÉ</span><h2>Connexion et sécurité</h2><div data-account-details>${details()}</div><div class="account-actions"><button type="button" class="secondary" data-account="email">Modifier mon adresse email</button><button type="button" class="secondary" data-account="password">Modifier mon mot de passe</button><button type="button" class="text" data-account="logout-others">Déconnecter les autres appareils</button><button type="button" class="text" data-account="logout-all">Me déconnecter partout</button></div><p class="small">Le mot de passe actuel est demandé avant un changement. La déconnexion des autres appareils bloque leur renouvellement de session ; une session déjà ouverte peut rester valide quelques minutes.</p></section>
    <section class="card account-card"><span class="eyebrow">MES ÉCHANGES</span><h2>Mes notifications</h2><p>Retrouve les « J’aime » et les commentaires reçus sur tes publications.</p><div class="row"><button type="button" class="secondary" data-account="inbox">Ouvrir mes notifications</button><button type="button" class="text" data-account="preferences">Choisir mes notifications</button><button type="button" class="text" data-account="my-posts">Retrouver mes publications</button></div><p class="small">Les alertes sur cet appareil s’activent avec ton accord. Sur iPhone ou iPad, installe d’abord Sobrizen sur l’écran d’accueil.</p></section>
    <section class="card account-card"><span class="eyebrow">AIDE & MES DROITS</span><h2>Aide et gestion de mes données</h2><div class="account-actions"><button type="button" class="secondary" data-account="faq">Centre d’aide</button><a class="secondary" href="/abonnement.html">Gérer mon abonnement</a><a class="text" href="mailto:contact@sobrizen.com">Contacter le support</a><button type="button" class="text" data-account="deletion">Demander la suppression de mon compte</button></div><p class="small">Tu peux exporter ton suivi avant de demander l’effacement. Les demandes de suppression sont suivies dans Mon abonnement et traitées par le support.</p></section>`;}
  function renderDetails(){document.querySelectorAll('[data-account-details]').forEach(node=>node.innerHTML=details());}
  async function refresh(){
    if(!S.user||S.demo||!online()||document.hidden)return;
    if(loading)return loading;
    const context=sessionContext(),token=revision;
    const task=(async()=>{
      try{
        const [prefs,count]=await Promise.all([
          request((db,uid)=>db.from('notification_preferences').select('likes_enabled,comments_enabled,push_enabled').eq('user_id',uid).maybeSingle(),context),
          request(async(db,uid)=>{const result=await db.from('user_notifications').select('id',{count:'exact',head:true}).eq('recipient_id',uid).is('read_at',null);return {data:result.count||0,error:result.error};},context)
        ]);
        if(!sameSession(context)||token!==revision)return;
        if(loaded&&count>unread)notify('Tu as reçu une nouvelle interaction. Ouvre la cloche pour la retrouver.');
        preferences={...DEFAULTS,...prefs};unread=count;loaded=true;loadError='';updateBell();
      }catch(error){if(sameSession(context)&&token===revision)loadError=message(error);}
    })();loading=task;try{await task;}finally{if(loading===task)loading=null;}
  }
  function rendered(){
    if(!S.user)return;
    if(!seen||!sameSession(seen)){
      reset();seen=sessionContext();updateBell();
      if(!S.demo){
        void refresh();poll=setInterval(()=>void refresh(),45000);
        const context=seen,token=revision;
        void getClient().then(db=>{if(!sameSession(context)||token!==revision||!db.channel)return;
          channel=db.channel('account-notifications-'+context.user.id).on('postgres_changes',{event:'*',schema:'public',table:'user_notifications',filter:'recipient_id=eq.'+context.user.id},()=>void refresh()).subscribe();
        }).catch(()=>{});
      }
    }
    renderDetails();updateBell();
    const target=new URLSearchParams(location.search).get('notification');
    if(target&&validUUID(target)&&!S.demo){const url=new URL(location.href);url.searchParams.delete('notification');history.replaceState(null,'',url.pathname+url.search+url.hash);void openInbox(target);}
  }
  function dialog(title,body){modal(title,body);return $('#modalContent');}
  const boundForms=new WeakMap();
  function formDialog(title,body){const root=dialog(title,body);const form=root.querySelector('form');if(form)boundForms.set(form,sessionContext());return form;}
  async function loadRows(more=false){
    const context=sessionContext(),offset=more?rows.length:0;
    if(context.demo){rows=[];hasMore=false;return;}
    const data=await request((db,uid)=>db.from('user_notifications').select('id,kind,post_id,comment_id,created_at,read_at,actor_id,profiles!user_notifications_actor_id_fkey(display_name,username)').eq('recipient_id',uid).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+PAGE_SIZE),context);
    rows=more?[...new Map([...rows,...(data||[]).slice(0,PAGE_SIZE)].map(row=>[row.id,row])).values()]:(data||[]).slice(0,PAGE_SIZE);hasMore=(data||[]).length>PAGE_SIZE;
  }
  function inboxBody(error=''){
    return `<div data-account-inbox><p class="small">Seules les interactions sur tes publications sont affichées. Tes propres réactions ne déclenchent pas d’alerte.</p><div class="row"><button type="button" class="secondary" data-account="read-all" ${!unread?'disabled':''}>Tout marquer comme lu</button><button type="button" class="text" data-account="preferences">Préférences</button><button type="button" class="text" data-account="inbox">Actualiser</button></div>${error?`<p class="error-box" role="alert">${esc(error)}</p>`:''}<div class="notification-list">${rows.map(row=>`<article class="notification-item ${row.read_at?'':'is-unread'}"><button type="button" class="notification-open" data-account="open-notification" data-id="${esc(row.id)}"><strong>${esc(row.profiles?.display_name||row.profiles?.username||'Un membre')}</strong> ${row.kind==='like'?'a aimé ta publication.':'a commenté ta publication.'}<time datetime="${esc(row.created_at)}">${esc(dateLabel(row.created_at))}</time><span class="small">${row.read_at?'Lue':'Non lue'} · Voir la publication</span></button>${!row.read_at?`<button type="button" class="text" data-account="read-one" data-id="${esc(row.id)}" aria-label="Marquer cette notification comme lue">Marquer comme lue</button>`:''}</article>`).join('')||`<p class="empty">${S.demo?'Les notifications réelles apparaîtront dans ton compte personnel.':'Tu n’as pas encore de notification. Les prochains « J’aime » et commentaires reçus apparaîtront ici.'}</p>`}</div>${hasMore?'<button type="button" class="secondary full" data-account="more-notifications">Voir les notifications précédentes</button>':''}<p class="inline-message" data-account-status role="status"></p></div>`;
  }
  function renderInbox(error=''){const container=$('[data-account-inbox]');if(container)container.outerHTML=inboxBody(error);}
  async function openInbox(id=null){
    const context=sessionContext(),token=++opening;dialog('Mes notifications','<div data-account-inbox><p role="status">Chargement des notifications…</p></div>');
    try{
      await loadRows();await refresh();if(!sameSession(context)||token!==opening||!$('[data-account-inbox]'))return;
      renderInbox();
      if(id){let row=rows.find(item=>item.id===id);if(!row)row=await request((db,uid)=>db.from('user_notifications').select('id,post_id,created_at').eq('recipient_id',uid).eq('id',id).maybeSingle(),context);if(sameSession(context)&&token===opening&&$('[data-account-inbox]')){if(row)await openNotification(row);else notify('Cette notification n’est plus disponible.');}}
    }catch(error){if(sameSession(context)&&token===opening&&$('[data-account-inbox]'))renderInbox(message(error));}
  }
  async function markRead(ids=null){
    if(S.demo)return;
    await request(db=>db.rpc('mark_notifications_read',{p_ids:ids,p_before:new Date().toISOString()}));
    rows=rows.map(row=>!ids||ids.includes(row.id)?{...row,read_at:new Date().toISOString()}:row);await refresh();
  }
  async function openNotification(row){
    const context=sessionContext();await markRead([row.id]);if(!sameSession(context))return;
    closeModal();await openPublication(row.post_id);
  }
  function preferencesDialog(){
    if(!loaded&&!S.demo){formDialog('Mes préférences de notification',`<p>${esc(loadError||'Les réglages n’ont pas encore été chargés.')}</p><button class="secondary" type="button" data-account="retry-preferences">Réessayer</button>`);return;}
    formDialog('Mes préférences de notification',`<form data-account-form="preferences">${options('likes_enabled','Quand quelqu’un aime ma publication',preferences.likes_enabled)}${options('comments_enabled','Quand quelqu’un commente ma publication',preferences.comments_enabled)}<p class="small">Ces choix concernent les prochaines interactions. Ton historique reste consultable.</p><button class="primary full">Enregistrer mes préférences</button><p data-account-status role="status"></p></form><hr><h3>Alertes sur cet appareil</h3><p class="small">Un message discret « Nouvelle activité dans Sobrizen » s’affiche sans texte de publication ni nom de membre sur l’écran verrouillé.</p><div class="row"><button type="button" class="secondary" data-account="enable-push">Activer les alertes</button><button type="button" class="text" data-account="disable-push">Désactiver sur cet appareil</button></div><p class="small">${preferences.push_enabled?'Alertes autorisées pour ton compte. Chaque appareil doit être activé séparément.':'Les alertes système sont désactivées.'} Sur iPhone/iPad : installe Sobrizen sur l’écran d’accueil, ouvre l’application puis active les alertes. Si tu as refusé, utilise les réglages du navigateur pour autoriser les notifications.</p><p data-account-status role="status"></p>`);
  }
  function emailDialog(){formDialog('Modifier mon adresse email',`<p>Email actuel : <b>${esc(S.user?.email||'')}</b></p><form data-account-form="email"><label>Nouvelle adresse email<input type="email" name="email" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" required maxlength="254"></label><label>Confirmer la nouvelle adresse<input type="email" name="confirm_email" autocomplete="email" autocapitalize="none" spellcheck="false" required></label>${passwordInput('current','Mot de passe actuel')}<p class="small">Le changement prend effet après confirmation des liens envoyés aux adresses concernées. Ton parcours reste associé au même compte.</p><button class="primary full">Recevoir les liens de confirmation</button><p data-account-status role="status"></p></form>`);}
  function passwordDialog(){formDialog('Modifier mon mot de passe',`<form data-account-form="password">${passwordInput('current','Mot de passe actuel')}${passwordInput('password','Nouveau mot de passe')}<p class="small">10 caractères minimum. Utilise un mot de passe unique.</p>${passwordInput('confirm','Confirmer le nouveau mot de passe')}<label>Code de sécurité reçu par email · si demandé<input name="nonce" autocomplete="one-time-code" inputmode="numeric"></label><button type="button" class="text" data-account="reauthenticate">Recevoir un code de sécurité</button><button class="primary full">Enregistrer le nouveau mot de passe</button><p data-account-status role="status"></p></form>`);}
  function faq(){dialog('Centre d’aide',`<div class="account-faq"><details open><summary>Comment retrouver mes publications ?</summary><p>Ouvre Communauté et choisis « Mes publications » dans « Trier par ». Tu peux combiner ce choix avec la recherche, l’émotion et la durée.</p></details><details><summary>Changer mon email ou mon mot de passe</summary><p>Ouvre Mon profil → Réglages → Connexion et sécurité. Si tu as oublié ton mot de passe, utilise « Mot de passe oublié » sur l’écran de connexion.</p></details><details><summary>Je ne reçois pas l’email</summary><p>Vérifie l’adresse saisie et les courriers indésirables. Un lien expire et ne s’utilise qu’une fois. Tu peux renvoyer la confirmation depuis l’écran de connexion. Contacte le support si le problème continue.</p></details><details><summary>Changer de téléphone ou me reconnecter</summary><p>Connecte-toi au même compte pour retrouver les données sauvegardées en ligne. Une saisie non enregistrée ne sera pas transférée. La démo contient uniquement des exemples.</p></details><details><summary>Recevoir les « J’aime » et commentaires</summary><p>La cloche affiche les nouvelles interactions. Dans les préférences, choisis les réactions souhaitées et active les alertes sur chaque appareil. Sur iPhone/iPad, installe d’abord Sobrizen sur l’écran d’accueil.</p></details><details><summary>Mes données sont-elles publiques ?</summary><p>Ton profil communautaire et ce que tu publies sont visibles par les membres. Ton journal et ton suivi restent privés vis-à-vis des membres. Partager une note publie une copie distincte après ton accord.</p></details><details><summary>Abonnement, paiement ou résiliation</summary><p>Mon abonnement affiche ton offre et permet d’ouvrir le portail de gestion. Annuler un abonnement ne supprime pas le compte. Demander l’effacement ne résilie pas automatiquement un abonnement.</p><a href="/abonnement.html">Ouvrir Mon abonnement</a></details><details><summary>Utiliser Sobrizen hors connexion</summary><p>La connexion, les sauvegardes et la communauté demandent Internet. Vérifie la confirmation de sauvegarde avant de fermer une saisie. Tu peux exporter ton suivi depuis Mon profil.</p></details><details><summary>Signaler un contenu ou réafficher un membre</summary><p>Utilise « Signaler » ou « Masquer pour moi » sous une publication. Les signalements sont examinés par une personne. « Réafficher les membres » dans le profil annule les masquages personnels.</p></details></div><p><a href="mailto:contact@sobrizen.com">Contacter contact@sobrizen.com</a></p>`);}
  async function pushSubscription(){if(!('serviceWorker' in navigator))return null;let timer;try{const registration=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('L’installation des alertes est trop lente. Recharge Sobrizen puis réessaie.')),10000);})]);return {registration,subscription:await registration.pushManager?.getSubscription()};}finally{clearTimeout(timer);}}
  async function enablePush(){
    const context=sessionContext();assertSession(context);if(context.demo)throw Error('Active les alertes depuis ton compte personnel.');
    if(!('PushManager' in window)||!('Notification' in window)||!('serviceWorker' in navigator))throw Error('Ce navigateur ne permet pas les alertes. Sur iPhone/iPad, installe Sobrizen sur l’écran d’accueil puis ouvre-le.');
    // Request permission directly from the user gesture, before any network await.
    const permission=await window.Notification.requestPermission();assertSession(context);
    if(permission!=='granted')throw Error('Les alertes ne sont pas autorisées. Tu peux les autoriser dans les réglages du navigateur.');
    const publicKey=await request(db=>db.rpc('notification_push_public_key'),context);if(!publicKey)throw Error('Les alertes sur appareil sont momentanément indisponibles. Les notifications restent dans la cloche.');
    const raw=atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')),key=Uint8Array.from(raw,char=>char.charCodeAt(0));
    const state=await pushSubscription();assertSession(context);if(!state?.registration.pushManager)throw Error('Les alertes ne sont pas disponibles sur cet appareil.');
    const subscription=state.subscription||await state.registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    try{assertSession(context);await request(db=>db.rpc('register_notification_device',{p_subscription:subscription.toJSON()}),context);preferences.push_enabled=true;notify('Alertes activées sur cet appareil.');preferencesDialog();}
    catch(error){if(!state.subscription)await subscription.unsubscribe().catch(()=>{});throw error;}
  }
  async function beforeLogout(){
    if(S.demo)return;
    const context=sessionContext(),state=await pushSubscription();assertSession(context);
    if(state?.subscription){await request(db=>db.rpc('unregister_notification_device',{p_endpoint:state.subscription.endpoint}),context);await state.subscription.unsubscribe();}
  }
  async function disablePush(){await beforeLogout();notify('Alertes désactivées sur cet appareil. Les notifications restent dans la cloche.');}
  const actions={
    inbox:()=>openInbox(),email:emailDialog,password:passwordDialog,faq,preferences:preferencesDialog,
    'retry-preferences':async()=>{await refresh();preferencesDialog();},
    'my-posts':async()=>{closeModal();await openPublication(null);const select=document.querySelector('[data-community-filter="sort"]');if(select){select.value='mine';select.dispatchEvent(new Event('change',{bubbles:true}));}},
    'read-one':async button=>{await markRead([button.dataset.id]);renderInbox();},
    'read-all':async()=>{await markRead();renderInbox();},
    'more-notifications':async()=>{await loadRows(true);renderInbox();},
    'open-notification':button=>{const row=rows.find(item=>item.id===button.dataset.id);if(row)return openNotification(row);},
    'show-password':button=>{const input=button.parentElement.querySelector('input');input.type=input.type==='password'?'text':'password';button.textContent=input.type==='password'?'Afficher':'Masquer';button.setAttribute('aria-pressed',String(input.type!=='password'));},
    'logout-others':async()=>{if(!confirm('Déconnecter tes autres appareils ? Tu restes connecté ici.'))return;const context=sessionContext(),state=await pushSubscription();assertSession(context);await request(db=>db.rpc('unregister_other_notification_devices',{p_keep_endpoint:state?.subscription?.endpoint||null}),context);await request(db=>db.auth.signOut({scope:'others'}),context);notify('Les autres appareils devront se reconnecter après expiration de leur session actuelle.');},
    'logout-all':async()=>{if(!confirm('Te déconnecter sur tous les appareils, y compris celui-ci ?'))return;const context=sessionContext();await request(db=>db.rpc('unregister_other_notification_devices',{p_keep_endpoint:null}),context);await beforeLogout();const db=await getClient();assertSession(context);checkResult(await db.auth.signOut({scope:'global'}));if(sameSession(context))leave();},
    reauthenticate:async()=>{await request(db=>db.auth.reauthenticate());notify('Code demandé. Consulte ton email puis recopie le code si le service le demande.');},
    'enable-push':enablePush,'disable-push':disablePush,
    deletion:()=>dialog('Demander la suppression de mon compte',`<p>Ton compte, ton suivi et tes publications seront concernés par ta demande. Le support vérifie les données à effacer et les éventuelles obligations de conservation.</p><p>Avant de continuer, exporte ton suivi si tu veux en conserver une copie. Vérifie également ton abonnement : la demande d’effacement ne le résilie pas automatiquement.</p><div class="row"><button type="button" class="secondary" data-action="export">Exporter mon suivi</button><a class="primary" href="/abonnement.html#demandes">Déposer et suivre ma demande d’effacement</a></div>`)
  };
  document.addEventListener('click',async event=>{
    const button=event.target.closest?.('[data-account]');if(!button||button.disabled||!S.user)return;
    const run=actions[button.dataset.account];if(!run)return;event.preventDefault();const context=sessionContext();button.disabled=true;
    try{await run(button);}catch(error){if(sameSession(context)){const status=$('#modalContent [data-account-status]');if(status)status.textContent=message(error);notify(message(error));}}finally{button.disabled=false;}
  });
  document.addEventListener('submit',async event=>{
    const form=event.target;if(!form.matches?.('[data-account-form]'))return;
    event.preventDefault();event.stopImmediatePropagation();const context=boundForms.get(form);if(!context||!sameSession(context))return;
    const button=event.submitter||form.querySelector('button.primary');if(button.disabled)return;button.disabled=true;clearFormError(form);
    const data=new FormData(form),v=name=>String(data.get(name)||''),fail=(name,text)=>{showFieldError(form.elements[name],text);return false;};
    try{
      if(context.demo)throw Error('Ces réglages sont disponibles dans ton compte personnel.');
      switch(form.dataset.accountForm){
        case 'email':{
          const email=v('email').trim().toLowerCase();
          if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254){fail('email','Saisis une adresse email valide.');break;}
          if(email!==v('confirm_email').trim().toLowerCase()){fail('confirm_email','Les deux adresses doivent être identiques.');break;}
          if(email===String(context.user.email||'').toLowerCase()){fail('email','Choisis une adresse différente de ton adresse actuelle.');break;}
          if(!v('current')){fail('current','Saisis ton mot de passe actuel.');break;}
          await verifyPassword(v('current'),context);assertSession(context);
          const result=await request(db=>db.auth.updateUser({email},{emailRedirectTo:location.origin}),context);
          if(result?.user)Object.assign(S.user,result.user);renderDetails();form.reset();closeModal();notify('Changement demandé. Confirme les liens reçus par email pour utiliser ta nouvelle adresse.');break;
        }
        case 'password':{
          if(v('password').length<10){fail('password','Utilise au moins 10 caractères.');break;}
          if(v('password')!==v('confirm')){fail('confirm','Recopie exactement le nouveau mot de passe.');break;}
          if(v('password')===v('current')){fail('password','Choisis un mot de passe différent de l’actuel.');break;}
          if(!v('current')){fail('current','Saisis ton mot de passe actuel.');break;}
          await verifyPassword(v('current'),context);assertSession(context);
          await request(db=>db.auth.updateUser({password:v('password'),...(v('nonce').trim()?{nonce:v('nonce').trim()}:{})}),context);
          form.reset();closeModal();notify('Ton mot de passe a été modifié.');break;
        }
        case 'preferences':{
          const next={likes_enabled:data.has('likes_enabled'),comments_enabled:data.has('comments_enabled')};
          const saved=await request((db,uid)=>db.from('notification_preferences').upsert({user_id:uid,...next},{onConflict:'user_id'}).select('likes_enabled,comments_enabled,push_enabled').single(),context);
          preferences={...preferences,...saved};closeModal();notify('Préférences de notification enregistrées.');break;
        }
      }
    }catch(error){if(sameSession(context)&&form.isConnected)showFormError(form,message(error));}
    finally{if(form.elements.current)form.elements.current.value='';button.disabled=false;}
  },true);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});window.addEventListener('online',()=>void refresh());
  navigator.serviceWorker?.addEventListener?.('message',event=>{if(event.data?.type==='sobrizen-notification'&&S.user)void openInbox(event.data.id);});
  return {view,rendered,reset,refresh,beforeLogout,renderDetails};
}
