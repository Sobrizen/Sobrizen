import {clamp,shuffle,createSnake,turnSnake,stepSnake,snakeDelay,createBlocks,moveBlock,rotateBlock,collides,ghostY,lockBlock,dropBlock,blocksDelay,SHAPES,BLOCK_COLORS,memoryPairs,targetSize,targetWindow,reactionWindow} from './games-core.mjs';
import {create2048,slide2048,spawn2048,canMove2048,level2048,sequenceTiming,extendSequence} from './games-brain-core.mjs';
import {HeldControls,fitBoard,memoryGrid,boundedTarget} from './games-mobile-core.mjs';
const FREE=new Set(['snake','blocks','ground']);
const GAMES={
  snake:['🐍','Snake Zen','Un fruit, un virage. Trouve ton rythme.','Attrape les fruits. Évite les murs et ta queue. Glisse ou utilise les flèches.'],
  blocks:['🧱','Blocs Zen','Construis, tourne, complète les lignes.','← et → déplacent le bloc. ↓ accélère sa chute. Tourner change sa forme ; Poser le dépose immédiatement.'],
  merge:['🔢','2048 Zen','Fusionne les nombres, sans chronomètre.','Glisse ou utilise les flèches. Les nombres identiques fusionnent. Annuler permet de revenir un coup en arrière.'],
  sequence:['💡','Séquence Zen','Observe les lumières. Retrouve la suite.','Observe, puis reproduis la suite. Une lumière de plus à chaque manche. Trois chances ; Revoir montre à nouveau la suite.'],
  memory:['🧠','Memory','Retrouve les paires, une étape à la fois.','Observe les cartes avant qu’elles se retournent. Retrouve les paires sans limite de temps.'],
  reaction:['⚡','Réflexe Zen','Attends le signal. À toi !','Touche uniquement quand « Maintenant » apparaît. Quinze essais, avec un début facile.'],
  taps:['🎯','Cibles Zen','Vingt secondes pour viser juste.','Touche les cibles lumineuses. Elles deviennent plus petites, mais la zone de toucher reste confortable.'],
  ground:['🌿','5 choses','Une pause tranquille, à ton rythme.','Observe ce qui t’entoure. Tu peux passer une étape : aucune performance à atteindre.']
};
const PATHS={left:'M21 12H3m8-8-8 8 8 8',right:'M3 12h18m-8-8 8 8-8 8',up:'M12 21V3m-8 8 8-8 8 8',down:'M12 3v18m-8-8 8 8 8-8',rotate:'M20 9a8 8 0 1 0 0 7M20 3v6h-6',drop:'M12 2v14m-6-6 6 6 6-6M4 21h16',undo:'M9 5 3 11l6 6M3 11h10a7 7 0 0 1 7 7',pause:'M8 4v16M16 4v16',close:'M6 6l12 12M18 6 6 18',help:'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4M12 19v.1',fullscreen:'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6'};
const $=(s,r=document)=>r.querySelector(s);
const esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${PATHS[name]}" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const button=(action,label,face=icon(action),cls='')=>`<button type="button" class="${cls}" data-ga="${action}" aria-label="${esc(label)}">${face}</button>`;
const key=(action,label,caption='')=>button(action,label,icon(action)+(caption?`<span>${caption}</span>`:''),'ga-key ga-'+action);
const number=key=>{try{const n=Number(localStorage.getItem(key));return Number.isFinite(n)&&n>=0?Math.min(n,Number.MAX_SAFE_INTEGER):0;}catch{return 0;}};
const store=(key,value)=>{try{localStorage.setItem(key,String(value));}catch{}};
let installed=false,active=null,points=number('sobrizen-game-score');
function styles(){if($('#gaStyle'))return;const l=document.createElement('link');l.id='gaStyle';l.rel='stylesheet';l.href=new URL('./games-mobile.css',import.meta.url).href;document.head.append(l);}
export function gamesView({premium=false}={}){
  styles();return `<section id="gameZone" class="ga-library sz-library"><div class="greeting"><span class="eyebrow">UNE PAUSE POUR TOI</span><h1>Entre dans le jeu.</h1><p class="muted">Un début facile. Du plaisir à ton rythme.</p></div><div class="ga-library-meta"><span>✦ <b id="gameScore">${points}</b> points détente</span><span>Sans publicité</span></div><div class="ga-catalog sz-library-grid">${Object.entries(GAMES).map(([id,[emoji,title,detail]])=>{const allowed=premium||FREE.has(id);return `<button type="button" class="ga-card ga-theme-${id}" ${allowed?`data-game="${id}"`:`data-game-upgrade="${id}"`} aria-label="${title}${allowed?' — jouer':' — Premium'}"><span class="ga-card-icon" aria-hidden="true">${emoji}</span><small>${FREE.has(id)?'GRATUIT':premium?'PREMIUM':'🔒 PREMIUM'}</small><b>${title}</b><span>${detail}</span><strong>${allowed?'Jouer':'Découvrir'} ↗</strong></button>`;}).join('')}</div><p class="ga-note">Points et records sur cet appareil. Ces jeux ne modifient pas ton suivi et ne remplacent pas une aide médicale.</p></section>`;
}
function award(a,n){if(n<=0)return;points=Math.min(Number.MAX_SAFE_INTEGER,points+n);a.earned+=n;store('sobrizen-game-score',points);const el=$('#gameScore');if(el)el.textContent=points;}
function record(a){const key='sobrizen-record-'+a.id;if(a.score>a.best){a.best=a.score;store(key,a.best);}}
function setText(el,text){if(el.textContent!==String(text))el.textContent=text;}
function hud(a){
  setText(a.levelEl,a.id==='ground'?`${Math.min(5,a.step+1)} / 5`:`Niv. ${a.level}`);
  setText(a.scoreEl,a.id==='taps'?Math.max(0,Math.ceil((20000-a.time)/1000))+' s':a.score);
  setText(a.unitEl,{snake:'fruits',blocks:`${a.game?.lines||0} lignes`,merge:'points',sequence:`${a.lives} chances`,memory:'paires',reaction:'succès',taps:`${a.score} cibles`,ground:'étapes'}[a.id]);record(a);
}
function status(a,text){setText(a.statusEl,text);}
function launch(id){
  if(!GAMES[id])return;if(!FREE.has(id)&&document.documentElement.dataset.premium!=='true'){location.href='/abonnement.html';return;}
  close();styles();const root=document.createElement('dialog');root.className='ga-play ga-theme-'+id;root.id='gaPlay';root.dataset.game=id;root.setAttribute('aria-labelledby','gaTitle');
  root.innerHTML=`<header class="ga-top"><h2 id="gaTitle">${GAMES[id][1]}</h2><div>${button('help','Règles du jeu')}${button('pause','Mettre en pause')}${button('close','Quitter le jeu')}</div></header><div class="ga-hud"><b class="ga-level"></b><div class="ga-preview" aria-label="Prochain bloc" hidden></div><div class="ga-stat"><b class="ga-score"></b><span class="ga-unit"></span></div></div><div class="ga-main"><div class="ga-stage" tabindex="0"></div><div class="ga-dock"><div class="ga-move"></div><div class="ga-actions"></div></div></div><p class="ga-status" role="status" aria-live="polite"></p><div class="ga-cover" hidden></div>`;
  const a={id,root,source:$('#gameZone'),origin:document.activeElement,controller:new AbortController(),state:'playing',score:0,level:1,earned:0,best:number('sobrizen-record-'+id),time:0,last:0,raf:0,jobs:[],pressed:new Map(),holds:new HeldControls(),gestures:new Map(),suppressed:new WeakMap(),particles:[],reduced:matchMedia('(prefers-reduced-motion:reduce)').matches,previousOverflow:document.body.style.overflow,ownsFullscreen:false};active=a;
  for(const [key,selector] of Object.entries({stage:'.ga-stage',move:'.ga-move',actions:'.ga-actions',statusEl:'.ga-status',scoreEl:'.ga-score',unitEl:'.ga-unit',levelEl:'.ga-level',cover:'.ga-cover'}))a[key]=$(selector,root);
  document.body.append(root);document.body.style.overflow='hidden';root.showModal();const signal=a.controller.signal;
  root.addEventListener('click',click,{signal});root.addEventListener('pointerdown',pointerDown,{signal});root.addEventListener('pointermove',pointerMove,{signal});root.addEventListener('pointerup',pointerUp,{signal});root.addEventListener('pointercancel',e=>release(a,e.pointerId),{signal});root.addEventListener('lostpointercapture',e=>release(a,e.pointerId),{signal});
  root.addEventListener('keydown',keydown,{signal});root.addEventListener('keyup',e=>release(a,'key:'+e.code),{signal});root.addEventListener('contextmenu',e=>{if(e.target.closest('.ga-stage,.ga-dock'))e.preventDefault();},{signal});
  root.addEventListener('cancel',e=>{e.preventDefault();if(a.state==='paused')resume(a);else if(a.state==='result')close();else pause(a);},{signal});
  window.addEventListener('blur',()=>pause(a),{signal});window.addEventListener('pagehide',close,{signal});document.addEventListener('visibilitychange',()=>{if(document.hidden)pause(a);},{signal});
  document.addEventListener('fullscreenchange',()=>{if(a.ownsFullscreen&&!document.fullscreenElement){a.ownsFullscreen=false;pause(a);}viewport(a);},{signal});
  window.addEventListener('resize',()=>viewport(a),{signal});window.visualViewport?.addEventListener('resize',()=>viewport(a),{signal});
  a.resize=new ResizeObserver(()=>fit(a));a.resize.observe(a.stage);
  a.observer=new MutationObserver(()=>{if(!a.source?.isConnected)close();});if(a.source?.parentNode)a.observer.observe(a.source.parentNode,{childList:true});
  viewport(a);reset(a);a.stage.focus({preventScroll:true});run(a);
}
function viewport(a){if(active!==a)return;if(!window.visualViewport||window.visualViewport.scale===1)a.root.style.setProperty('--ga-height',(window.visualViewport?.height||window.innerHeight)+'px');fit(a);}
function close(){const a=active;if(!a)return;active=null;record(a);cancelAnimationFrame(a.raf);clearInput(a);a.jobs=[];a.controller.abort();a.resize.disconnect();a.observer.disconnect();a.root.close();a.root.remove();document.body.style.overflow=a.previousOverflow;if(a.ownsFullscreen&&document.fullscreenElement)document.exitFullscreen().catch(()=>{});if(a.origin?.isConnected)a.origin.focus({preventScroll:true});}
function cover(a,title,text,action='resume',label='Reprendre'){
  a.cover.hidden=false;a.cover.innerHTML=`<section class="ga-modal"><h3>${esc(title)}</h3><p>${esc(text)}</p>${button(action,label,label,'ga-primary')}${a.state==='result'?(action==='undo'?button('restart','Nouvelle partie','Nouvelle partie'):''):button('fullscreen','Plein écran du navigateur',icon('fullscreen')+' Plein écran')}${button('close','Retour aux jeux','Retour aux jeux','ga-quiet')}</section>`;
  a.cover.querySelector('button').focus({preventScroll:true});
}
function pause(a,help=false){if(active!==a||a.state==='result')return;if(a.state!=='paused'){a.beforePause=a.state;a.state='paused';a.root.dataset.state='paused';cancelAnimationFrame(a.raf);a.raf=0;clearInput(a);a.root.classList.add('ga-paused');}
  cover(a,help?'Comment jouer ?':'En pause',help?GAMES[a.id][3]:'Ta partie est conservée.');
}
function resume(a){if(a.state!=='paused')return;a.state=a.beforePause||'playing';a.cover.hidden=true;a.root.classList.remove('ga-paused');a.stage.focus({preventScroll:true});if(a.id==='reaction'){a.jobs=[];reactionRound(a);}if(a.id==='sequence'){a.jobs=[];playSequence(a);}run(a);}
function finish(a,title,text,undo=false){a.state='result';a.root.dataset.state='result';cancelAnimationFrame(a.raf);a.raf=0;a.jobs=[];clearInput(a);record(a);draw(a);hud(a);cover(a,title,text,undo?'undo':'restart',undo?'Annuler le dernier coup':'Rejouer');}
function schedule(a,delay,fn){a.jobs.push({at:a.time+delay,fn});run(a);}
function run(a){if(active===a&&!a.raf&&!a.inFrame&&a.state!=='paused'&&a.state!=='result'){a.last=0;a.raf=requestAnimationFrame(frame);}}
function reset(a){
  clearInput(a);Object.assign(a,{state:'playing',score:0,level:1,earned:0,time:0,jobs:[],particles:[],accumulator:0,canvas:null,ctx:null,mergeQueue:[],mergeUntil:0,attempts:0,step:0,countdown:0});a.root.classList.remove('ga-paused');a.cover.hidden=true;a.stage.replaceChildren();a.move.replaceChildren();a.actions.replaceChildren();$('.ga-preview',a.root).hidden=true;
  if(a.id==='snake'||a.id==='blocks'){
    a.game=a.id==='snake'?createSnake(18,22):createBlocks();a.stage.innerHTML='<canvas class="ga-canvas" role="img" aria-label="Plateau de jeu"></canvas>';a.canvas=$('canvas',a.stage);a.ctx=a.canvas.getContext('2d');
    a.move.innerHTML=a.id==='snake'?['up','left','down','right'].map(x=>key(x,{up:'Monter',left:'Aller à gauche',down:'Descendre',right:'Aller à droite'}[x])).join(''):key('left','Déplacer à gauche')+key('down','Descendre plus vite')+key('right','Déplacer à droite');
    if(a.id==='blocks'){a.actions.innerHTML=key('rotate','Tourner le bloc','Tourner')+key('drop','Poser immédiatement le bloc','Poser');preview(a);}
    a.countdown=1500;a.state='countdown';a.stage.insertAdjacentHTML('beforeend','<div class="ga-count" aria-live="off">Prêt ?</div>');status(a,a.id==='snake'?'Glisse ou utilise les flèches.':'Maintiens une flèche pour répéter.');
  }else if(a.id==='merge'){
    a.board=create2048();a.undo=null;a.won=false;a.stage.innerHTML='<div class="ga-merge" role="group" aria-label="2048 : quatre lignes et quatre colonnes"></div>';
    a.move.innerHTML=['up','left','down','right'].map(x=>key(x,{up:'Monter',left:'Aller à gauche',down:'Descendre',right:'Aller à droite'}[x])).join('');a.actions.innerHTML=key('undo','Annuler le dernier déplacement','Annuler');renderMerge(a);status(a,'Glisse les tuiles. Aucun chrono.');
  }else if(a.id==='sequence'){
    a.sequence=extendSequence([]);a.lives=3;a.input=0;a.phase='watch';a.stage.innerHTML='<div class="ga-sequence" role="group" aria-label="Touches de mémoire">'+['●','◆','▲','■'].map((shape,i)=>button('sequence:'+i,'Touche '+(i+1),`<span>${shape}</span><b>${i+1}</b>`,'ga-sequence-key')).join('')+'</div>';a.actions.innerHTML=button('replay','Revoir la séquence',icon('undo')+' Revoir','ga-replay');playSequence(a);
  }else if(a.id==='memory'){a.stage.innerHTML='<div class="ga-memory" role="group" aria-label="Cartes à retrouver"></div>';memoryRound(a);
  }else if(a.id==='reaction'){a.stage.innerHTML=button('react','Attends le signal','', 'ga-reaction');reactionRound(a);
  }else if(a.id==='taps'){a.stage.innerHTML='<div class="ga-arena">'+button('target','Attraper la cible','<span>✦</span>','ga-target')+'</div>';a.targetAt=0;status(a,'Touche la cible lumineuse.');placeTarget(a);
  }else {a.stage.innerHTML='<div class="ga-ground"></div>';a.actions.innerHTML=button('ground','Étape suivante','C’est fait','ga-primary')+button('ground','Passer cette étape','Passer','ga-quiet');ground(a);}
  a.root.dataset.controls=String(!!(a.move.children.length||a.actions.children.length));fit(a);hud(a);draw(a);run(a);
}
function fit(a){
  if(active!==a||!a.stage)return;const rect=a.stage.getBoundingClientRect(),w=Math.max(1,rect.width-8),h=Math.max(1,rect.height-8);
  if(a.canvas){const ratio=a.id==='blocks'?.5:a.game.size/a.game.height,size=fitBoard(w,h,ratio);const dpr=Math.min(2,window.devicePixelRatio||1),cw=Math.round(size.width*dpr),ch=Math.round(size.height*dpr);a.canvas.style.width=size.width+'px';a.canvas.style.height=size.height+'px';if(a.canvas.width!==cw||a.canvas.height!==ch){a.canvas.width=cw;a.canvas.height=ch;}
    a.logicalW=(a.id==='blocks'?10:a.game.size)*30;a.logicalH=(a.id==='blocks'?20:a.game.height)*30;a.ctx.setTransform(cw/a.logicalW,0,0,ch/a.logicalH,0,0);draw(a);
  }
  const square=$('.ga-merge,.ga-sequence,.ga-reaction',a.stage);if(square){const s=Math.min(w,h,a.id==='reaction'?420:650);square.style.width=s+'px';square.style.height=s+'px';}
  const memory=$('.ga-memory',a.stage);if(memory&&memory.children.length){const g=memoryGrid(memory.children.length,Math.min(w,850),h);memory.style.setProperty('--ga-cols',g.columns);memory.style.setProperty('--ga-rows',g.rows);}
  if(a.id==='taps'&&a.state==='playing')placeTarget(a,true);
}
function preview(a){const el=$('.ga-preview',a.root);el.hidden=false;const id=a.game.next[0],shape=SHAPES[id];el.innerHTML=`<svg viewBox="0 0 96 48" role="img" aria-label="Prochain bloc">${shape.map((row,y)=>row.map((v,x)=>v?`<rect x="${x*24+(4-row.length)*12+1}" y="${y*24+1}" width="21" height="21" rx="4" fill="${BLOCK_COLORS[id]}"/>`:'').join('')).join('')}</svg>`;}
function frame(now){
  const a=active;if(!a)return;a.raf=0;if(a.state==='paused'||a.state==='result')return;
  a.inFrame=true;const raw=a.last?Math.max(0,now-a.last):0,dt=Math.min(80,raw);a.last=now;
  if(a.state==='countdown'){
    a.countdown-=raw;const el=$('.ga-count',a.stage);if(a.countdown<=0){a.state='playing';el?.remove();}else if(el)setText(el,a.countdown>750?'Prêt ?':'À toi !');
  }else{
    a.time+=raw;
    if(a.id==='blocks')for(const action of a.holds.due(a.time))act(a,action);
    const jobs=a.jobs.filter(j=>j.at<=a.time);a.jobs=a.jobs.filter(j=>j.at>a.time);for(const job of jobs){if(a.state==='playing'&&active===a)job.fn();}
    if(a.state==='playing')update(a,dt);
  }
  a.inFrame=false;if(a.state==='playing'||a.state==='countdown'){
    a.particles=a.particles.filter(p=>(p.life-=dt)>0);for(const p of a.particles){p.x+=p.dx*dt;p.y+=p.dy*dt;}
    draw(a);a.root.dataset.state=a.state;
    const continuous=['snake','blocks','reaction','taps'].includes(a.id);
    if(continuous||a.jobs.length||a.mergeQueue.length||a.particles.length)a.raf=requestAnimationFrame(frame);
  }
}
function update(a,dt){
  if(a.id==='snake'){
    a.accumulator+=dt;const delay=snakeDelay(a.game.level);if(a.accumulator>=delay){a.accumulator-=delay;const r=stepSnake(a.game);if(r.ate){a.score=a.game.fruits;a.level=a.game.level;award(a,1);burst(a,a.game.body[0][0]*30+15,a.game.body[0][1]*30+15,'#ffcf76');hud(a);}if(r.over)finish(a,r.won?'Plateau complété !':'Bien joué !',`${a.score} fruits · niveau ${a.level}.`);}
  }else if(a.id==='blocks'){
    const b=a.game;a.accumulator+=dt;
    if(a.accumulator>=blocksDelay(b.level)){a.accumulator=0;if(!collides(b,b.x,b.y+1)){b.y++;b.lock=0;}}
    if(collides(b,b.x,b.y+1)){b.lock+=dt;if(b.lock>=450)blockResult(a,lockBlock(b));}else b.lock=0;
  }else if(a.id==='merge'&&a.mergeQueue.length&&a.time>=a.mergeUntil){mergeMove(a,a.mergeQueue.shift());
  }else if(a.id==='reaction'){
    if(a.phase==='waiting'&&a.time>=a.signalAt){a.phase='signal';a.signalStamp=performance.now();a.signalAt=a.time;const el=$('.ga-reaction',a.stage);el.classList.add('ga-signal');el.innerHTML='<span>✦</span><b>Maintenant !</b><small>Touche ici</small>';el.setAttribute('aria-label','Maintenant ! Touche ici');}
    else if(a.phase==='signal'&&a.time-a.signalAt>reactionWindow(a.level))reactionFeedback(a,false,'Le signal est passé.');
  }else if(a.id==='taps'){
    if(a.time>=20000)finish(a,'Belle pause !',`${a.score} cibles en 20 secondes.`);
    else if(a.time>=a.targetAt)placeTarget(a);hud(a);
  }
}
function act(a,action){
  if(a.state!=='playing'&&!(a.state==='countdown'&&['left','right','up','down','rotate'].includes(action)))return;
  if(a.id==='snake'){turnSnake(a.game,action);return;}
  if(a.id==='merge'){
    if(['up','down','left','right'].includes(action)){if(a.mergeQueue.length<8)a.mergeQueue.push(action);run(a);}else if(action==='undo')undo(a);return;
  }
  if(a.id!=='blocks')return;const b=a.game;
  if(action==='left')moveBlock(b,-1);if(action==='right')moveBlock(b,1);if(action==='rotate')rotateBlock(b);
  if(action==='down'&&!collides(b,b.x,b.y+1)){b.y++;b.score++;b.lock=0;a.accumulator=0;}
  if(action==='drop')blockResult(a,dropBlock(b));a.score=b.score;hud(a);draw(a);
}
function blockResult(a,result){a.accumulator=0;a.score=a.game.score;a.level=a.game.level;for(const y of result.rows)burst(a,150,y*30+15,'#b4f4ff');if(result.lines){award(a,result.lines*5);status(a,`${result.lines} ligne${result.lines>1?'s':''} !`);}preview(a);hud(a);if(result.over)finish(a,'Belle construction !',`${a.game.lines} lignes · ${a.score} points.`);}
function burst(a,x,y,color){if(a.reduced)return;for(let i=0;i<10;i++){const angle=Math.random()*Math.PI*2;a.particles.push({x,y,dx:Math.cos(angle)*.12,dy:Math.sin(angle)*.12,life:400,color});}a.particles=a.particles.slice(-60);}
function round(c,x,y,w,h,r,color){c.fillStyle=color;c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();c.fill();}
function draw(a){
  if(!a.ctx)return;const c=a.ctx,w=a.logicalW,h=a.logicalH;if(!w||!h)return;c.clearRect(0,0,w,h);c.fillStyle='#101c30';c.fillRect(0,0,w,h);c.strokeStyle='#ffffff09';c.lineWidth=1;c.beginPath();for(let x=30;x<w;x+=30){c.moveTo(x,0);c.lineTo(x,h);}for(let y=30;y<h;y+=30){c.moveTo(0,y);c.lineTo(w,y);}c.stroke();
  if(a.id==='snake'){
    const s=a.game,t=a.reduced?1:clamp(a.accumulator/snakeDelay(s.level),0,1);
    if(s.food){const x=s.food[0]*30,y=s.food[1]*30;round(c,x+5,y+5,20,20,7,'#ffc774');round(c,x+14,y+1,8,5,2,'#8ceab9');}
    for(let i=s.body.length-1;i>=0;i--){const p=s.body[i],q=s.previous[i]||p,x=(q[0]+(p[0]-q[0])*t)*30,y=(q[1]+(p[1]-q[1])*t)*30;round(c,x+1,y+1,28,28,8,i?'#39cda3':'#b1ffda');if(!i)for(const n of [-1,1]){const [dx,dy]=s.direction;c.fillStyle='#15372e';c.beginPath();c.arc(x+15+dx*6-dy*n*6,y+15+dy*6+dx*n*6,2.8,0,Math.PI*2);c.fill();}}
  }else{
    const b=a.game,cell=(x,y,color,ghost=false)=>{if(ghost){c.strokeStyle=color;c.lineWidth=2;c.globalAlpha=.5;c.strokeRect(x*30+4,y*30+4,22,22);c.globalAlpha=1;}else{round(c,x*30+1,y*30+1,28,28,4,color);round(c,x*30+5,y*30+4,20,3,1,'#ffffff66');}};
    b.board.forEach((row,y)=>row.forEach((v,x)=>{if(v)cell(x,y,BLOCK_COLORS[v-1]);}));
    if(!b.over){const gy=ghostY(b);b.piece.forEach((row,y)=>row.forEach((v,x)=>{if(v){cell(b.x+x,gy+y,BLOCK_COLORS[b.color-1],true);cell(b.x+x,b.y+y,BLOCK_COLORS[b.color-1]);}}));}
  }
  for(const p of a.particles){c.globalAlpha=p.life/400;c.fillStyle=p.color;c.fillRect(p.x,p.y,4,4);}c.globalAlpha=1;
}
const SYMBOLS=['🌱','☀️','🌊','🍃','🌙','⭐','🦋','🌸','🍋','💎'];
function memoryRound(a){
  a.pairs=memoryPairs(a.level);a.matched=0;a.open=[];a.phase='watch';const icons=shuffle([...SYMBOLS.slice(0,a.pairs),...SYMBOLS.slice(0,a.pairs)]),grid=$('.ga-memory',a.stage);
  grid.innerHTML=icons.map((s,i)=>`<button type="button" data-ga="memory:${i}" data-symbol="${s}" class="ga-memory-key ga-revealed" aria-label="Carte ${i+1} : ${s}"><span class="ga-back">✦</span><span class="ga-front">${s}</span></button>`).join('');status(a,'Observe les cartes…');fit(a);
  schedule(a,Math.max(1000,2300-(a.level-1)*300),()=>{a.phase='input';grid.querySelectorAll('button').forEach((b,i)=>{b.classList.remove('ga-revealed');b.setAttribute('aria-label',`Carte ${i+1}, face cachée`);});status(a,'Retrouve les paires.');});hud(a);
}
function pickMemory(a,index){
  const b=$(`[data-ga="memory:${index}"]`,a.stage);if(a.phase!=='input'||!b||b.disabled||b.classList.contains('ga-revealed')||a.open.length>=2)return;
  b.classList.add('ga-revealed');b.setAttribute('aria-label','Carte : '+b.dataset.symbol);a.open.push(b);if(a.open.length<2)return;const [x,y]=a.open;
  if(x.dataset.symbol===y.dataset.symbol){x.disabled=y.disabled=true;x.classList.add('ga-matched');y.classList.add('ga-matched');a.open=[];a.matched++;a.score++;hud(a);
    if(a.matched===a.pairs){award(a,20);status(a,'Toutes les paires retrouvées !');schedule(a,850,()=>{if(a.level===4)finish(a,'Belle mémoire !','Les quatre niveaux sont terminés.');else{a.level++;memoryRound(a);}});}
  }else schedule(a,650,()=>{for(const el of [x,y]){el.classList.remove('ga-revealed');el.setAttribute('aria-label','Carte face cachée');}a.open=[];});
}
function reactionRound(a){a.phase='waiting';a.signalAt=a.time+1000+Math.random()*2200;const el=$('.ga-reaction',a.stage);el.classList.remove('ga-signal');el.innerHTML='<span>◌</span><b>Attends…</b><small>Le signal arrive.</small>';el.setAttribute('aria-label','Attends le signal');status(a,`Essai ${a.attempts+1} / 15`);hud(a);}
function reactionFeedback(a,success,text){
  if(a.phase==='feedback')return;a.phase='feedback';a.attempts++;if(success){a.score++;award(a,5);a.level=Math.min(8,1+Math.floor(a.score/3));}
  const el=$('.ga-reaction',a.stage);el.classList.remove('ga-signal');el.innerHTML=`<span>${success?'✓':'◌'}</span><b>${success?'Bien joué !':'On réessaie.'}</b><small>${esc(text)}</small>`;el.setAttribute('aria-label',text);hud(a);
  schedule(a,1100,()=>{if(a.attempts>=15)finish(a,'Belle concentration !',`${a.score} signaux réussis sur 15.`);else reactionRound(a);});
}
function placeTarget(a,resizeOnly=false){
  const el=$('.ga-target',a.stage),arena=$('.ga-arena',a.stage);if(!el||!arena)return;const r=arena.getBoundingClientRect();if(resizeOnly&&a.targetPosition){a.targetPosition={...a.targetPosition,...boundedTarget(r.width,r.height,a.targetPosition.size,a.targetPosition.rx,a.targetPosition.ry)};}else{const rx=Math.random(),ry=Math.random();a.targetPosition={...boundedTarget(r.width,r.height,Math.max(64,targetSize(a.level)),rx,ry),rx,ry};a.targetAt=a.time+targetWindow(a.level);}
  const p=a.targetPosition;Object.assign(el.style,{left:p.x+'px',top:p.y+'px',width:p.size+'px',height:p.size+'px'});el.firstElementChild.style.transform=`scale(${Math.max(.68,targetSize(a.level)/p.size)})`;
}
function renderMerge(a,change){
  const grid=$('.ga-merge',a.stage);grid.innerHTML=a.board.map((v,i)=>`<div class="ga-tile ${v?'ga-filled':''}" data-value="${v}" style="--tile:${Math.min(11,Math.log2(v||1))}" aria-label="Ligne ${1+Math.floor(i/4)}, colonne ${1+i%4} : ${v||'vide'}">${v||''}</div>`).join('');$('[data-ga="undo"]',a.actions).disabled=!a.undo;
  if(change&&!a.reduced){const cells=[...grid.children],box=grid.getBoundingClientRect();for(const p of change.motion){if(p.from===p.to)continue;const from=cells[p.from].getBoundingClientRect(),to=cells[p.to].getBoundingClientRect(),tile=document.createElement('i');tile.className='ga-moving-tile';tile.textContent=p.value;tile.style.cssText=`left:${from.x-box.x}px;top:${from.y-box.y}px;width:${from.width}px;height:${from.height}px;--tile:${Math.min(11,Math.log2(p.value))}`;grid.append(tile);tile.animate?.([{transform:'translate(0,0)'},{transform:`translate(${to.x-from.x}px,${to.y-from.y}px)`}],{duration:110,easing:'ease-out',fill:'forwards'});}
    schedule(a,120,()=>grid.querySelectorAll('.ga-moving-tile').forEach(x=>x.remove()));
  }hud(a);
}
function mergeMove(a,direction){
  const r=slide2048(a.board,direction);if(!r.changed){if(!canMove2048(a.board))finish(a,'Le plateau est rempli.',`${a.score} points.`,!!a.undo);return;}
  a.undo={board:[...a.board],score:a.score,won:a.won};a.score+=r.gained;const spawned=spawn2048(r.board);a.board=spawned.board;a.level=level2048(a.board);a.mergeUntil=a.time+120;renderMerge(a,r);status(a,r.gained?`+${r.gained} points`:'À ton rythme.');
  if(!a.won&&a.board.some(x=>x>=2048)){a.won=true;status(a,'2048 atteint ! Continue vers 4096.');}
  if(!canMove2048(a.board)){a.mergeQueue=[];finish(a,'Belle réflexion !',`${a.score} points. Tu peux annuler le dernier coup.`,true);}
}
function undo(a){if(!a.undo)return;Object.assign(a,{board:[...a.undo.board],score:a.undo.score,won:a.undo.won,undo:null,mergeQueue:[],mergeUntil:0,state:'playing'});a.level=level2048(a.board);a.cover.hidden=true;renderMerge(a);status(a,'Dernier coup annulé.');a.stage.focus({preventScroll:true});run(a);}
function light(a,index){a.stage.querySelectorAll('.ga-sequence-key').forEach((el,i)=>el.classList.toggle('ga-lit',i===index));}
function playSequence(a){
  a.jobs=[];a.input=0;a.phase='watch';light(a,-1);a.stage.querySelectorAll('.ga-sequence-key').forEach(b=>b.setAttribute('aria-disabled','true'));$('[data-ga="replay"]',a.actions).disabled=true;status(a,'Observe…');hud(a);const {on,gap}=sequenceTiming(a.sequence.length);let delay=450;
  for(const [i,pad] of a.sequence.entries()){schedule(a,delay,()=>{light(a,pad);status(a,`Observe : ${i+1} / ${a.sequence.length}`);});delay+=on;schedule(a,delay,()=>light(a,-1));delay+=gap;}
  schedule(a,delay,()=>{a.phase='input';a.stage.querySelectorAll('.ga-sequence-key').forEach(b=>b.setAttribute('aria-disabled','false'));$('[data-ga="replay"]',a.actions).disabled=false;status(a,'À toi !');});
}
function sequenceHit(a,index){
  if(a.phase!=='input')return;light(a,index);const token=(a.flashToken||0)+1;a.flashToken=token;schedule(a,160,()=>{if(a.flashToken===token)light(a,-1);});
  if(index!==a.sequence[a.input]){a.lives--;a.phase='feedback';hud(a);status(a,'Presque ! Regarde à nouveau.');schedule(a,650,()=>{if(a.lives===0)finish(a,'Belle concentration !',`${a.score} suites retrouvées.`);else playSequence(a);});return;}
  a.input++;status(a,`${a.input} / ${a.sequence.length}`);if(a.input===a.sequence.length){a.score++;a.level=a.score+1;a.phase='feedback';hud(a);status(a,'Exact ! Une lumière de plus.');schedule(a,800,()=>{a.sequence=extendSequence(a.sequence);playSequence(a);});}
}
const GROUND=[['5','choses que tu vois','Observe les formes et les couleurs.'],['4','choses que tu peux toucher','Le tissu, une surface, le sol…'],['3','sons que tu entends','Proches ou lointains.'],['2','odeurs que tu remarques','Tu peux aussi passer cette étape.'],['1','chose que tu apprécies','Un détail, un souvenir, ce moment.']];
function ground(a){const [n,title,text]=GROUND[a.step];$('.ga-ground',a.stage).innerHTML=`<b>${n}</b><h3>${title}</h3><p>${text}</p>`;status(a,'Sans chrono, sans pression.');hud(a);}
function action(a,name){
  if(name==='close'){close();return;}if(name==='help'){pause(a,true);return;}if(name==='pause'){if(a.state==='paused')resume(a);else pause(a);return;}if(name==='resume'){resume(a);return;}
  if(name==='fullscreen'){if(document.fullscreenElement){document.exitFullscreen?.().catch(()=>{});}else if(document.documentElement.requestFullscreen){document.documentElement.requestFullscreen({navigationUI:'hide'}).then(()=>{if(active===a)a.ownsFullscreen=true;else if(document.fullscreenElement===document.documentElement)document.exitFullscreen().catch(()=>{});}).catch(()=>{if(active===a)status(a,'Le jeu occupe déjà tout l’espace disponible.');});}else status(a,'Le jeu occupe déjà tout l’espace disponible.');return;}
  if(name==='restart'){reset(a);a.stage.focus({preventScroll:true});return;}if(name==='undo'&&a.id==='merge'&&a.state==='result'){undo(a);return;}
  if(['left','right','up','down','rotate','drop','undo'].includes(name)){act(a,name);return;}if(a.state!=='playing')return;
  if(name.startsWith('memory:'))pickMemory(a,Number(name.split(':')[1]));
  if(name.startsWith('sequence:'))sequenceHit(a,Number(name.split(':')[1]));
  if(name==='replay'&&a.id==='sequence'&&a.phase==='input')playSequence(a);
  if(name==='react'){if(a.phase==='waiting')reactionFeedback(a,false,'Un peu trop tôt.');else if(a.phase==='signal')reactionFeedback(a,true,Math.round(performance.now()-a.signalStamp)+' ms');}
  if(name==='target'){a.score++;award(a,1);a.level=Math.min(8,1+Math.floor(a.score/6));placeTarget(a);hud(a);}
  if(name==='ground'){a.step++;a.score=a.step;if(a.step>=5){award(a,10);finish(a,'Un moment pour toi.','Les cinq étapes sont terminées.');}else ground(a);}
  run(a);
}
function release(a,id){const p=a.pressed.get(id);a.pressed.delete(id);a.holds.release(id);a.gestures.delete(id);if(p&&![...a.pressed.values()].some(x=>x.button===p.button))p.button.classList.remove('ga-pressed');}
function clearInput(a){for(const id of [...a.pressed.keys()])release(a,id);a.holds.clear();a.gestures.clear();}
function pointerDown(e){
  const a=active;if(!a||e.button!==0)return;const b=e.target.closest('button[data-ga]');
  if(b){if(b.disabled||b.getAttribute('aria-disabled')==='true')return;const name=b.dataset.ga;
    // Destructive drop and navigation use pointer-up, and can be cancelled by sliding off.
    const deferred=['drop','close','pause','help','resume','restart','fullscreen'].includes(name);e.preventDefault();a.pressed.set(e.pointerId,{button:b,action:name,deferred});a.suppressed.set(b,performance.now());b.classList.add('ga-pressed');try{b.setPointerCapture(e.pointerId);}catch{}
    if(!deferred){action(a,name);if(a.id==='blocks'&&a.state==='playing'&&['left','right','down'].includes(name))a.holds.press(e.pointerId,name,a.time);}return;
  }
  if(a.state==='playing'&&e.target.closest('.ga-canvas,.ga-merge')){e.preventDefault();a.gestures.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false,used:false});try{a.stage.setPointerCapture(e.pointerId);}catch{}}
}
function pointerMove(e){
  const a=active,g=a?.gestures.get(e.pointerId);if(!g||a.state!=='playing')return;const dx=e.clientX-g.x,dy=e.clientY-g.y;if(Math.max(Math.abs(dx),Math.abs(dy))<20)return;g.moved=true;const direction=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';
  if(a.id==='merge'){if(!g.used){act(a,direction);g.used=true;}}
  else if(a.id==='snake')act(a,direction);
  else if(direction==='left'||direction==='right'||direction==='down')act(a,direction);
  g.x=e.clientX;g.y=e.clientY;
}
function pointerUp(e){
  const a=active;if(!a)return;const p=a.pressed.get(e.pointerId),g=a.gestures.get(e.pointerId);if(p){a.suppressed.set(p.button,performance.now());if(p.deferred){const r=p.button.getBoundingClientRect();if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)action(a,p.action);}}
  if(active===a&&g&&!g.moved&&a.id==='blocks')act(a,'rotate');release(a,e.pointerId);
}
function click(e){const a=active,b=e.target.closest('button[data-ga]');if(!a||!b||b.disabled||b.getAttribute('aria-disabled')==='true')return;
  // Native keyboard / assistive clicks remain enabled. Pointer clicks were handled above.
  if(e.detail>0&&performance.now()-(a.suppressed.get(b)??-Infinity)<1200)return;action(a,b.dataset.ga);
}
function keydown(e){
  const a=active;if(!a)return;if(e.key.toLowerCase()==='p'){e.preventDefault();if(!e.repeat)action(a,'pause');return;}
  // Space/Enter on a focused button must activate that button, never also hard-drop.
  if(e.target.closest('button')&&[' ','Enter'].includes(e.key))return;
  if(a.state!=='playing'&&a.state!=='countdown')return;
  let name={ArrowLeft:'left',ArrowRight:'right',ArrowDown:'down',ArrowUp:a.id==='blocks'?'rotate':'up',' ':a.id==='blocks'?'drop':a.id==='reaction'?'react':null}[e.key];
  if(a.id==='sequence'&&/^[1-4]$/.test(e.key))name='sequence:'+(Number(e.key)-1);
  if(!name||(!['snake','blocks','merge','sequence','reaction'].includes(a.id)))return;e.preventDefault();if(e.repeat)return;action(a,name);
  if(a.id==='blocks'&&a.state==='playing'&&['left','right','down'].includes(name))a.holds.press('key:'+e.code,name,a.time);
}
export function initGames(){if(installed)return;installed=true;styles();document.addEventListener('click',e=>{if(active)return;const upgrade=e.target.closest('[data-game-upgrade]');if(upgrade){location.href='/abonnement.html';return;}const game=e.target.closest('button[data-game]')?.dataset.game;if(game)launch(game);});}
