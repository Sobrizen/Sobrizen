import {createClient} from 'npm:@supabase/supabase-js@2.117.1';
import webpush from 'npm:web-push@3.6.7';
import {sameToken,dispatchNotifications} from './push-core.mjs';

Deno.serve(async (req:Request)=>{
  const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
  if(req.method!=='POST')return new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers});
  const authorization=req.headers.get('Authorization')||'';
  if(!authorization.startsWith('Bearer ')||authorization.length>520)return new Response('{}',{status:401,headers});
  try{
    const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:config,error}=await db.rpc('notification_push_runtime');
    if(error||!config||!await sameToken(authorization.slice(7),config.dispatch_token))return new Response('{}',{status:401,headers});
    if(!config.enabled)return new Response(JSON.stringify({enabled:false}),{headers});
    const result=await dispatchNotifications({db,send:webpush.sendNotification.bind(webpush),config});
    return new Response(JSON.stringify(result),{headers});
  }catch{return new Response(JSON.stringify({error:'Notification service temporarily unavailable'}),{status:503,headers});}
});
