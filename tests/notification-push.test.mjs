import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedPushEndpoint,notificationPayload,sameToken,dispatchNotifications} from '../supabase/functions/sobrizen-notifications/push-core.mjs';
const id='11111111-1111-4111-8111-111111111111';
test('push payload and endpoint validation prevent private content and external destinations',async()=>{
 assert.deepEqual(JSON.parse(notificationPayload(id)),{title:'Sobrizen',body:'Nouvelle activité dans Sobrizen.',id});
 assert.throws(()=>notificationPayload('https://evil.test'));
 for(const value of ['https://fcm.googleapis.com/a','https://web.push.apple.com/a','https://updates.push.services.mozilla.com/wpush/v2/a'])assert.equal(allowedPushEndpoint(value),true);
 for(const value of ['http://fcm.googleapis.com/a','https://fcm.googleapis.com.evil.test/a','https://fcm.googleapis.com@evil.test/a','https://127.0.0.1/a','https://fcm.googleapis.com:8443/a','https://fcm.googleapis.com/a#b'])assert.equal(allowedPushEndpoint(value),false);
 assert.equal(await sameToken('a'.repeat(40),'a'.repeat(40)),true);assert.equal(await sameToken('b'.repeat(40),'a'.repeat(40)),false);assert.equal(await sameToken('',''),false);
});
test('dispatch acknowledges success, retries temporary errors, removes expired endpoints and never sends untrusted URLs',async()=>{
 const deliveries=[201,503,410,400].map((status,i)=>({id:'delivery-'+i,lease_token:'lease-'+i,notification_id:id,endpoint:i===3?'https://127.0.0.1/private':'https://fcm.googleapis.com/'+status,keys:{p256dh:'fiction',auth:'fiction'}}));
 const calls=[],sent=[];
 const db={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='claim_notification_push'?deliveries:null,error:null};}};
 const result=await dispatchNotifications({db,config:{public_key:'public',private_key:'private'},send:async(subscription,payload,options)=>{sent.push({subscription,payload,options});const status=Number(subscription.endpoint.split('/').pop());if(status!==201)throw {statusCode:status};return {statusCode:status};}});
 assert.deepEqual(result,{processed:4,sent:1,failed:3});assert.equal(sent.length,3);
 assert.deepEqual(calls.filter(x=>x.name==='complete_notification_push').map(x=>x.args.p_status).sort(),[201,400,410,503]);
 assert.ok(sent.every(call=>JSON.parse(call.payload).body==='Nouvelle activité dans Sobrizen.'));
});
