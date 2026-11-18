/* Cache only public, same-origin application assets. Never cache API/auth/user responses. */
const CACHE='sobrizen-v32-20261118-auth-feedback';
const ASSETS=['/auth-feedback.mjs','/auth-feedback.css','/account-center.mjs','/account-center.css','/admin-entry.mjs','/care-theme.css','/brand/logo.png?v=care20261115-transparent','/brand/logo.png','/calm.css','/home-plan.mjs','/experience.css','/app-experience.mjs','/bootstrap.mjs','/launch.css','/program-progress.mjs','/brand/logo.svg','/favicon-32.png?v=care20261115-transparent','/apple-touch-icon.png?v=care20261115-transparent','/icon-192.png?v=care20261115-transparent','/icon-512.png?v=care20261115-transparent','/icon-maskable-512.png?v=care20261115-transparent','/brand/symbol.svg','/brand/wordmark.svg','/icon.svg?v=care20261115-transparent','/icon-192.png','/icon-512.png','/icon-maskable-512.png','/purchase-intent.mjs','/semantizen-core.mjs','/semantizen-data.mjs','/semantizen.mjs','/semantizen.css','/legal.mjs','/profile-photo.css','/profile-photo-ui.mjs','/profile-photo-core.mjs','/subscription.mjs','/billing/core.mjs','/games-runtime.mjs','/game-records.css','/game-records.mjs','/game-records-core.mjs','/agenda.css','/agenda-ui.mjs','/agenda-core.mjs','/form-validation.mjs','/form-validation.css','/username.mjs','/community-duration-ui.mjs','/community-tracking.mjs','/journal-notes-ui.mjs','/journal-notes.css','/community.css','/community-core.mjs','/community.mjs','/section-navigation.mjs','/journal-motivation-ui.mjs','/journal-motivation.mjs','/journal-motivation-quotes.mjs','/journal-motivation.css','/modern.css','/','/index.html','/install-prompt.css','/install-prompt.mjs','/app.mjs','/membership-refresh.mjs','/consumption-core.mjs','/consumption-calculator.mjs','/consumption-calculator.css','/daily-core.mjs','/daily-ui.mjs','/daily-entry.mjs','/daily.css','/ergonomics.mjs','/ergonomics-core.mjs','/ergonomics.css','/health-ui.mjs','/health-core.mjs','/health-encouragement.mjs','/time-core.mjs','/health-evidence.mjs','/health.css','/timeline-core.mjs','/timeline-ui.mjs','/timeline-summary.mjs','/timeline-chart.mjs','/timeline-ui.css','/timeline-summary.css','/timeline-chart.css','/renewal.css','/clinical.css','/section-colors.css','/journey-reference.mjs','/progress.mjs','/progress-motion.css','/progress-motion.mjs','/progress-core.mjs','/tracking-core.mjs','/tracking-ui.mjs','/progress.css','/games.mjs','/games-arcade.mjs','/games-mobile.mjs','/games-mobile.css','/games-mobile-core.mjs','/games-core.mjs','/games.css','/games-classic.mjs','/games-touch.mjs','/games-touch.css','/games-brain.mjs','/games-brain-core.mjs','/games-puzzles.mjs','/games-puzzles-core.mjs','/games-puzzles.css','/movement.mjs','/movement.css','/core.mjs','/program.mjs','/v2.css','/manifest.webmanifest','/icon.svg','/brand.css','/brand/symbol.png','/brand/wordmark.png','/apple-touch-icon.png','/favicon-32.png'];
/* Lazy-only public model assets: not downloaded when installing the general app. */
const SEMANTIC_ASSETS=['/semantizen-vocabulary.json','/semantizen-vectors.bin'];
self.addEventListener('push',event=>{
 let payload;try{payload=event.data?.json();}catch{return;}
 const id=String(payload?.id||'');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return;
 event.waitUntil(self.registration.showNotification('Sobrizen',{body:'Nouvelle activité dans Sobrizen.',icon:'/icon-192.png',badge:'/favicon-32.png',tag:'sobrizen-'+id,data:{id},renotify:false}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const id=String(event.notification.data?.id||'');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return;
 const target=new URL('/?notification='+encodeURIComponent(id),self.location.origin);
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{
   const app=windows.find(client=>new URL(client.url).origin===self.location.origin);
   if(app){await app.navigate(target.href);return app.focus();}return self.clients.openWindow(target.href);
 }));
});
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('sobrizen-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin||req.headers.has('Authorization'))return;
 if(url.pathname==='/admin'||url.pathname.startsWith('/admin.'))return;
 if(req.mode==='navigate'){
  event.respondWith(fetch(req).catch(async()=>await caches.match('/')||new Response('Hors connexion. Recharge Sobrizen avec Internet.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})));
  return;
 }
 if(!ASSETS.includes(url.pathname+url.search)&&!SEMANTIC_ASSETS.includes(url.pathname+url.search))return;
 event.respondWith(fetch(req).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,copy)))}return response}).catch(async()=>await caches.match(req)||new Response('',{status:503})));
});


