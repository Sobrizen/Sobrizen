/* Cache only public, same-origin application assets. Never cache API/auth/user responses. */
const CACHE='sobrizen-v21-20261114-circular-logo';
const ASSETS=['/brand/logo.svg','/brand/symbol.svg','/brand/wordmark.svg','/icon.svg?v=logo20261114','/icon-192.png','/icon-512.png','/icon-maskable-512.png','/purchase-intent.mjs','/semantizen-core.mjs','/semantizen-data.mjs','/semantizen.mjs','/semantizen.css','/legal.mjs','/profile-photo.css','/profile-photo-ui.mjs','/profile-photo-core.mjs','/subscription.mjs','/billing/core.mjs','/games-runtime.mjs','/game-records.css','/game-records.mjs','/game-records-core.mjs','/agenda.css','/agenda-ui.mjs','/agenda-core.mjs','/form-validation.mjs','/form-validation.css','/username.mjs','/community-duration-ui.mjs','/community-tracking.mjs','/journal-notes-ui.mjs','/journal-notes.css','/community.css','/community-core.mjs','/community.mjs','/section-navigation.mjs','/journal-motivation-ui.mjs','/journal-motivation.mjs','/journal-motivation-quotes.mjs','/journal-motivation.css','/modern.css','/','/index.html','/install-prompt.css','/install-prompt.mjs','/app.mjs','/consumption-core.mjs','/consumption-calculator.mjs','/consumption-calculator.css','/daily-core.mjs','/daily-ui.mjs','/daily-entry.mjs','/daily.css','/ergonomics.mjs','/ergonomics-core.mjs','/ergonomics.css','/health-ui.mjs','/health-core.mjs','/health-encouragement.mjs','/time-core.mjs','/health-evidence.mjs','/health.css','/timeline-core.mjs','/timeline-ui.mjs','/timeline-summary.mjs','/timeline-chart.mjs','/timeline-ui.css','/timeline-summary.css','/timeline-chart.css','/renewal.css','/clinical.css','/section-colors.css','/journey-reference.mjs','/progress.mjs','/progress-motion.css','/progress-motion.mjs','/progress-core.mjs','/tracking-core.mjs','/tracking-ui.mjs','/progress.css','/games.mjs','/games-arcade.mjs','/games-mobile.mjs','/games-mobile.css','/games-mobile-core.mjs','/games-core.mjs','/games.css','/games-classic.mjs','/games-touch.mjs','/games-touch.css','/games-brain.mjs','/games-brain-core.mjs','/games-puzzles.mjs','/games-puzzles-core.mjs','/games-puzzles.css','/movement.mjs','/movement.css','/core.mjs','/program.mjs','/v2.css','/manifest.webmanifest','/icon.svg','/icon-192.png','/icon-512.png','/brand.css','/brand/symbol.png','/brand/wordmark.png','/apple-touch-icon.png','/icon-maskable-512.png','/favicon-32.png','/icon.svg?v=logo20261114','/icon-192.png','/icon-512.png'];
/* Lazy-only public model assets: not downloaded when installing the general app. */
const SEMANTIC_ASSETS=['/semantizen-vocabulary.json','/semantizen-vectors.bin'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('sobrizen-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin||req.headers.has('Authorization'))return;
 if(req.mode==='navigate'){
  event.respondWith(fetch(req).catch(async()=>await caches.match('/')||new Response('Hors connexion. Recharge Sobrizen avec Internet.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})));
  return;
 }
 if(!ASSETS.includes(url.pathname+url.search)&&!SEMANTIC_ASSETS.includes(url.pathname+url.search))return;
 event.respondWith(fetch(req).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,copy)))}return response}).catch(async()=>await caches.match(req)||new Response('',{status:503})));
});


