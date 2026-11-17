const BASE='https://lnvtowdbbagwfbewnchz.supabase.co',KEY='sb_publishable_NejyPV0XbMiAW_yAmuIrhA_7_zDFYT7';
const PLAN_NAMES={monthly:'Mensuel',annual:'Annuel',launch:'Offre de lancement',unknown:'Autre offre'};
const number=value=>new Intl.NumberFormat('fr-FR').format(value??0);
const date=value=>new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Paris'}).format(new Date(value.length===10?value+'T12:00:00Z':value));

export function createAdminDashboard({client,doc=document,win=window}){
  const $=id=>doc.getElementById(id);let user=null,revision=0,destroyed=false;
  const controller=new win.AbortController();
  function status(message,error=false){$('status').textContent=message;$('status').dataset.error=String(error);}
  function clear(){
    $('dashboard').hidden=true;
    for(const id of ['total','confirmed','periodTotal','periodLabel','today','yesterday','paid','trials','updated','accountLabel'])$(id).textContent='';
    for(const id of ['daily','plans','subscriptionDetails'])$(id).replaceChildren();
  }
  function render(data){
    const a=data.accounts,s=data.subscriptions;
    $('total').textContent=number(a.total);$('confirmed').textContent=number(a.confirmed)+' e-mails confirmés';
    $('periodTotal').textContent=number(a.period);$('periodLabel').textContent='Du '+date(data.from)+' au '+date(data.through);
    $('today').textContent=number(a.today);$('yesterday').textContent=number(a.yesterday)+' hier';
    $('paid').textContent=number(s.active_paid);$('trials').textContent=number(s.trialing)+' essai(s) en cours';
    $('accountLabel').textContent='Connecté : '+user.email;
    const max=Math.max(1,...data.daily.map(row=>row.registrations));
    const rows=[...data.daily].reverse().map(row=>{
      const tr=doc.createElement('tr'),day=doc.createElement('td'),count=doc.createElement('td'),chart=doc.createElement('td'),meter=doc.createElement('meter');
      day.textContent=date(row.day);count.textContent=number(row.registrations);meter.min=0;meter.max=max;meter.value=row.registrations;meter.setAttribute('aria-label',row.registrations+' inscription(s) le '+date(row.day));
      chart.append(meter);tr.append(day,count,chart);return tr;
    });$('daily').replaceChildren(...rows);
    const details=[['Abonnements actifs payés',s.active_paid],['Essais en cours',s.trialing],['Paiements à régulariser',s.payment_pending],['Arrêts prévus en fin de période',s.cancel_at_period_end]].map(([label,value])=>{
      const div=doc.createElement('div'),dt=doc.createElement('dt'),dd=doc.createElement('dd');dt.textContent=label;dd.textContent=number(value);div.append(dt,dd);return div;
    });$('subscriptionDetails').replaceChildren(...details);
    $('plans').replaceChildren(...data.plans.map(plan=>{const li=doc.createElement('li');li.textContent=(PLAN_NAMES[plan.plan]||'Autre offre')+' : '+number(plan.count);return li;}));
    $('updated').textContent='Dernière actualisation : '+new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Paris'}).format(new Date(data.generated_at))+' · Heure de Paris. Les abonnements reflètent le dernier état synchronisé depuis Stripe.';
    $('loginPanel').hidden=true;$('dashboard').hidden=false;
  }
  async function refresh(){
    if(!user||destroyed)return;
    const ticket=++revision,uid=user.id;$('refresh').disabled=true;status('Actualisation des statistiques…');
    try{
      const {data,error}=await client.rpc('sobrizen_admin_statistics',{p_days:Number($('period').value)});
      if(destroyed||ticket!==revision||user?.id!==uid)return;
      if(error)throw error;
      render(data);status('Statistiques à jour.');
    }catch(error){
      if(destroyed||ticket!==revision||user?.id!==uid)return;
      clear();$('loginPanel').hidden=true;
      if(error.code==='42501')status('Ce compte n’a pas accès aux statistiques. Déconnecte-toi pour utiliser le compte administrateur.',true);
      else status('Les statistiques ne sont pas disponibles. Vérifie ta connexion, puis réessaie.',true);
      // Keep retry/sign-out controls available without leaving any private figures visible.
      $('dashboard').hidden=false;$('accountLabel').textContent='Connecté : '+user.email;
    }finally{if(!destroyed&&ticket===revision)$('refresh').disabled=false;}
  }
  function sessionChanged(session){
    if(destroyed)return;
    const changed=user?.id!==session?.user?.id;++revision;user=session?.user??null;
    if(changed||!user)clear();
    $('loginPanel').hidden=!!user;
    if(!user){status('Connecte-toi pour consulter les statistiques privées.');return;}
    // Supabase auth callbacks must finish before another SDK request starts.
    win.setTimeout(()=>{if(!destroyed&&user?.id===session.user.id)void refresh();},0);
  }
  $('refresh').addEventListener('click',()=>void refresh(),{signal:controller.signal});
  $('period').addEventListener('change',()=>void refresh(),{signal:controller.signal});
  $('logout').addEventListener('click',async()=>{
    ++revision;user=null;clear();$('loginPanel').hidden=false;status('Déconnexion…');
    const {error}=await client.auth.signOut({scope:'local'});
    if(!destroyed)status(error?'La déconnexion n’a pas pu être confirmée. Réessaie en rechargeant la page.':'Tu es déconnecté.',!!error);
  },{signal:controller.signal});
  $('loginForm').addEventListener('submit',async event=>{
    event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;status('Connexion…');
    try{
      const {error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
      $('password').value='';if(error)status('Connexion impossible. Vérifie tes identifiants Sobrizen.',true);
    }catch{status('Connexion impossible. Vérifie ta connexion Internet.',true);}
    finally{button.disabled=false;}
  },{signal:controller.signal});
  const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>sessionChanged(session));
  win.addEventListener('pagehide',()=>{++revision;clear();},{signal:controller.signal});
  win.addEventListener('pageshow',()=>{if(user)void refresh();},{signal:controller.signal});
  return {refresh,sessionChanged,destroy(){destroyed=true;++revision;clear();controller.abort();subscription.unsubscribe();}};
}
async function start(){
  try{
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.117.1');
    const timedFetch=(input,init={})=>fetch(input,{...init,cache:'no-store',signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
    createAdminDashboard({client:createClient(BASE,KEY,{global:{fetch:timedFetch}})});
  }catch{const status=document.getElementById('status');status.textContent='Connexion au service impossible. Vérifie Internet et recharge cette page.';status.dataset.error='true';}
}
if(typeof window!=='undefined'&&typeof document!=='undefined')void start();
