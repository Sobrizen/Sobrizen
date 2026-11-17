/** Generic lock-screen text deliberately excludes member names, health data and post text. */
export function notificationPayload(id){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error('Invalid notification');
  return JSON.stringify({title:'Sobrizen',body:'Nouvelle activité dans Sobrizen.',id});
}
export function allowedPushEndpoint(value){
  try{
    const url=new URL(value);
    return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.hash&&url.pathname!=='/'&&
      /^(?:fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/.test(url.hostname);
  }catch{return false;}
}
export async function sameToken(a,b){
  if(typeof a!=='string'||typeof b!=='string'||a.length>512||b.length<32)return false;
  const encode=new TextEncoder(),[left,right]=await Promise.all([a,b].map(value=>crypto.subtle.digest('SHA-256',encode.encode(value))));
  const x=new Uint8Array(left),y=new Uint8Array(right);let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;
}
export async function dispatchNotifications({db,send,config}){
  const claimed=await db.rpc('claim_notification_push',{p_limit:30});if(claimed.error)throw Error('Queue unavailable');
  const result={processed:0,sent:0,failed:0};
  // Small concurrent groups keep a minute's scheduled dispatch bounded.
  const deliveries=claimed.data||[];
  for(let offset=0;offset<deliveries.length;offset+=5){
    await Promise.all(deliveries.slice(offset,offset+5).map(async delivery=>{
      let status=400;
      if(allowedPushEndpoint(delivery.endpoint)){
        try{
          const response=await send({endpoint:delivery.endpoint,keys:delivery.keys},notificationPayload(delivery.notification_id),{
            TTL:3600,urgency:'normal',contentEncoding:'aes128gcm',timeout:8000,
            vapidDetails:{subject:'mailto:contact@sobrizen.com',publicKey:config.public_key,privateKey:config.private_key}
          });status=response.statusCode||201;
        }catch(error){status=Number.isInteger(error?.statusCode)?error.statusCode:503;}
      }
      // Never log endpoints, keys, vendor errors or tokens. A stale lease cannot acknowledge another worker's delivery.
      const completed=await db.rpc('complete_notification_push',{p_id:delivery.id,p_lease_token:delivery.lease_token,p_status:status});
      if(completed.error)throw Error('Delivery acknowledgement unavailable');
      result.processed++;if(status>=200&&status<300)result.sent++;else result.failed++;
    }));
  }
  return result;
}
