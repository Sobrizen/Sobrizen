/** A profile shortcut, shown only after the server authorizes the current account. */
export function createAdminEntry({S,getClient,sessionContext,sameSession,doc=document}){
  let revision=0,checked=null,allowed=false,pending=null;
  const current=context=>context&&sameSession(context);
  const slot=()=>doc.querySelector('[data-admin-entry]');
  function apply(){const node=slot();if(node)node.hidden=!(current(checked)&&allowed&&!S.demo);}
  async function check(){
    const context=sessionContext();
    if(!context.user||context.demo||S.page!=='profile')return;
    if(current(checked)){apply();return;}
    if(pending&&current(pending.context))return pending.promise;
    const token=revision;
    const promise=(async()=>{
      try{
        const client=await getClient();if(token!==revision||!current(context))return;
        const result=await client.rpc('sobrizen_admin_access');
        if(token!==revision||!current(context))return;
        // Fail closed, and retry a temporary service error on the next profile visit.
        allowed=!result?.error&&result?.data===true;
        if(!result?.error)checked=context;
        apply();
      }catch{if(token===revision&&current(context)){allowed=false;apply();}}
      finally{if(pending?.context===context)pending=null;}
    })();
    pending={context,promise};return promise;
  }
  return {
    view(){return '<section class="card" data-admin-entry hidden><span class="eyebrow">ADMINISTRATION · PRIVÉ</span><h2>Les statistiques de Sobrizen</h2><p>Retrouve les nouvelles inscriptions, les abonnements et l’accès au rapport des visites.</p><a class="primary" href="/admin" style="display:inline-flex;padding:12px 18px;border-radius:13px;text-decoration:none">Ouvrir mes statistiques →</a></section>';},
    pageRendered(){apply();void check();},
    reset(){revision++;checked=null;allowed=false;pending=null;const node=slot();if(node)node.hidden=true;}
  };
}
