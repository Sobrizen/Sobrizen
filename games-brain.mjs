import {create2048,slide2048,spawn2048,canMove2048,level2048,sequenceTiming,extendSequence} from './games-brain-core.mjs';
import {controlFace} from './games-touch.mjs';
const GAMES={merge:['🔢','2048 Zen','Glisse, fusionne, anticipe. Sans chrono.'],sequence:['💡','Séquence Zen','Observe les lumières, puis reproduis la suite.']};
const $=(s,r=document)=>r.querySelector(s);
const esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(action,text,label=text,extra='')=>`<button type="button" data-z="${action}" aria-label="${label}" ${extra}>${text}</button>`;
let session=null,installed=false;
function readRecord(id){try{const n=Number(localStorage.getItem('sobrizen-record-'+id));return Number.isFinite(n)&&n>=0?n:0}catch{return 0}}
function saveRecord(a){if(a.score<=a.best)return;a.best=a.score;try{localStorage.setItem('sobrizen-record-'+a.id,String(a.best))}catch{}}
export function brainCards(premium){return Object.entries(GAMES).map(([id,[icon,title,detail]])=>`<button type="button" class="sz-game-card sz-theme-${id}" ${premium?`data-brain-game="${id}"`:`data-game-upgrade="${id}"`} aria-label="${title}${premium?' — jouer':' — réservé à Premium'}"><span class="sz-card-icon" aria-hidden="true">${icon}</span><span class="sz-card-label">NOUVEAU · ${premium?'PREMIUM':'🔒 PREMIUM'}</span><b>${title}</b><span class="sz-card-detail">${detail}</span><span class="sz-card-play">${premium?'Jouer':'Découvrir'} <span aria-hidden="true">↗</span></span></button>`).join('')}
function launch(id){
  if(!GAMES[id])return;
  if(document.documentElement.dataset.premium!=='true'){location.href='/abonnement.html';return;}
  close();if(document.getElementById('szPlay'))return;
  const root=document.createElement('dialog');root.id='szBrain';root.className=`sz-play sz-brain sz-theme-${id}`;root.dataset.game=id;root.setAttribute('aria-labelledby','szBrainTitle');
  root.innerHTML=`<div class="sz-top"><div class="sz-game-title"><span aria-hidden="true">${GAMES[id][0]}</span><div><small>SOBRIZEN · PAUSE ACTIVE</small><h2 id="szBrainTitle">${GAMES[id][1]}</h2></div></div><div class="sz-top-actions">${button('fullscreen','⛶','Plein écran')}${button('pause','Ⅱ','Mettre en pause')}${button('close','✕','Quitter le jeu')}</div></div><div class="sz-hud"><div><span class="sz-brain-level">Niveau 1</span><small class="sz-brain-detail">Facile</small></div><div class="sz-meter"><div class="sz-brain-progress"></div></div><div class="sz-score"><b class="sz-brain-score">0</b><small class="sz-brain-unit">points</small></div></div><div class="sz-brain-layout"><div class="sz-brain-stage" tabindex="0"></div><div class="sz-brain-console"><p class="sz-brain-status" role="status" aria-live="polite"></p><div class="sz-brain-controls"></div><p class="sz-brain-record"></p></div></div><div class="sz-cover" id="szBrainCover"></div>`;
  const a={id,root,origin:document.activeElement,source:$('#gameZone'),controller:new AbortController(),state:'ready',score:0,level:1,best:readRecord(id),jobs:[],time:0,last:0,raf:0,gesture:null,pressed:new Map(),ownsFullscreen:false,previousOverflow:document.body.style.overflow};
  session=a;document.body.append(root);document.body.style.overflow='hidden';root.showModal();
  const signal=a.controller.signal;
  root.addEventListener('click',click,{signal});root.addEventListener('pointerdown',down,{signal});root.addEventListener('pointermove',move,{signal});root.addEventListener('pointerup',up,{signal});root.addEventListener('pointercancel',cancel,{signal});root.addEventListener('lostpointercapture',e=>clearPressed(a,e.pointerId),{signal});
  root.addEventListener('contextmenu',e=>{if(e.target.closest('.sz-brain-stage,.sz-brain-controls'))e.preventDefault();},{signal});
  root.addEventListener('keydown',key,{signal});root.addEventListener('cancel',e=>{e.preventDefault();if(a.state==='playing')pause();else close();},{signal});
  window.addEventListener('blur',pause,{signal});window.addEventListener('pagehide',close,{signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();},{signal});
  document.addEventListener('fullscreenchange',()=>{if(a.ownsFullscreen&&!document.fullscreenElement){a.ownsFullscreen=false;pause();}},{signal});
  a.observer=new MutationObserver(()=>{if(a.source&&!a.source.isConnected)close();});a.observer.observe(document.body,{childList:true,subtree:true});
  a.resize=new ResizeObserver(()=>fit(a));a.resize.observe($('.sz-brain-stage',root));
  reset(a);cover(a,'À toi de jouer.',id==='merge'?'Glisse ou touche une flèche pour déplacer toutes les tuiles. Deux nombres identiques fusionnent. Atteins 2048 à ton rythme, sans chrono.':'Regarde les touches s’illuminer, puis reproduis la suite. Une lumière au départ, puis une de plus à chaque niveau. Tu as 3 chances et tu peux revoir la séquence.','Commencer',()=>start(a));fullscreen(a);
}
function fullscreen(a){if(!document.fullscreenEnabled||document.fullscreenElement)return;try{document.documentElement.requestFullscreen({navigationUI:'hide'}).then(()=>{if(session===a)a.ownsFullscreen=true;else if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});}).catch(()=>{});}catch{}}
function clearPressed(a,id){const b=a.pressed.get(id);a.pressed.delete(id);if(b&&![...a.pressed.values()].includes(b))b.classList.remove('sz-key-pressed');}
function clearInput(a){for(const id of [...a.pressed.keys()])clearPressed(a,id);a.gesture=null;}
function close(){const a=session;if(!a)return;session=null;saveRecord(a);cancelAnimationFrame(a.raf);a.jobs=[];clearInput(a);a.controller.abort();a.observer.disconnect();a.resize.disconnect();a.root.close();a.root.remove();document.body.style.overflow=a.previousOverflow;if(a.ownsFullscreen&&document.fullscreenElement)document.exitFullscreen().catch(()=>{});if(a.origin?.isConnected)a.origin.focus({preventScroll:true});}
function cover(a,title,text,label,fn){const c=$('#szBrainCover',a.root);c.hidden=false;c.innerHTML=`<div class="sz-cover-card"><span class="sz-cover-icon" aria-hidden="true">${GAMES[a.id][0]}</span><span class="sz-card-label">${a.state==='paused'?'PAUSE':a.state==='result'?'PARTIE TERMINÉE':'À TON RYTHME'}</span><h3>${esc(title)}</h3><p>${esc(text)}</p>${button('continue',label,label,'class="sz-primary"')}${button('close','Retour aux jeux','Retour aux jeux','class="sz-quiet"')}</div>`;a.continue=fn;$('[data-z="continue"]',c).focus({preventScroll:true});}
function hide(a){$('#szBrainCover',a.root).hidden=true;$('.sz-brain-stage',a.root).focus({preventScroll:true});}
function status(a,text){$('.sz-brain-status',a.root).textContent=text;}
function hud(a){saveRecord(a);$('.sz-brain-level',a.root).textContent=`Niveau ${a.level}`;$('.sz-brain-detail',a.root).textContent=a.id==='merge'?'Sans chrono':`${a.sequence.length} lumière${a.sequence.length>1?'s':''} · ${a.lives} chance${a.lives>1?'s':''}`;$('.sz-brain-score',a.root).textContent=a.score;$('.sz-brain-unit',a.root).textContent=a.id==='merge'?'points':'suites';$('.sz-brain-record',a.root).textContent=`Record sur cet appareil : ${a.best}${a.id==='sequence'?' suites':' points'}`;$('.sz-brain-progress',a.root).style.width=(a.id==='merge'?Math.min(100,Math.log2(Math.max(2,...a.board))/11*100):a.input/Math.max(1,a.sequence.length)*100)+'%';}
function reset(a){a.score=0;a.level=1;a.time=0;a.jobs=[];a.last=0;clearInput(a);a.root.classList.remove('sz-paused');const stage=$('.sz-brain-stage',a.root),controls=$('.sz-brain-controls',a.root);
  if(a.id==='merge'){
    a.board=create2048();a.undo=null;a.lockUntil=0;a.won=false;
    stage.innerHTML='<div class="sz-merge-board" role="group" aria-label="Plateau 2048, 4 lignes et 4 colonnes"></div>';
    controls.className='sz-brain-controls sz-merge-pad';
    controls.innerHTML=['up','left','right','down','undo'].map(x=>button(x,controlFace(x),x==='undo'?'Annuler le dernier déplacement':`Déplacer ${x==='up'?'vers le haut':x==='down'?'vers le bas':x==='left'?'à gauche':'à droite'}`,'class="sz-thumb-key"')).join('');
    renderBoard(a);status(a,'Glisse sur le plateau ou utilise les flèches.');
  }else{
    a.sequence=extendSequence([]);a.input=0;a.lives=3;a.phase='watch';a.flashToken=0;
    stage.innerHTML='<div class="sz-sequence-grid" role="group" aria-label="Quatre touches de mémoire">'+['●','◆','▲','■'].map((shape,i)=>button('pad',`<span class="sz-sequence-symbol" aria-hidden="true">${shape}</span><b>${i+1}</b>`,`Touche ${i+1}` ,`class="sz-sequence-pad" data-pad="${i}" aria-disabled="true"`)).join('')+'</div>';
    controls.className='sz-brain-controls sz-sequence-controls';controls.innerHTML=button('replay','↻ Revoir la séquence','Rejouer les lumières','class="sz-replay" disabled');status(a,'Observe les lumières, puis reproduis la suite.');
  }hud(a);fit(a);
}
function fit(a){if(session!==a)return;const rect=$('.sz-brain-stage',a.root).getBoundingClientRect();const size=Math.max(1,Math.min(rect.width-8,rect.height-8,a.id==='merge'?600:660));const board=$('.sz-merge-board,.sz-sequence-grid',a.root);if(board){board.style.width=size+'px';board.style.height=size+'px';}}
function start(a){a.state='playing';hide(a);if(a.id==='sequence')playSequence(a);run(a);}
function run(a){if(session===a&&!a.raf&&a.state==='playing'){a.last=0;a.raf=requestAnimationFrame(tick);}}
function tick(now){const a=session;if(!a)return;a.raf=0;if(a.state!=='playing')return;a.time+=a.last?Math.min(80,now-a.last):0;a.last=now;const jobs=a.jobs.filter(x=>x.at<=a.time);a.jobs=a.jobs.filter(x=>x.at>a.time);for(const j of jobs){if(session===a&&a.state==='playing')j.fn();}if(session===a&&a.state==='playing')a.raf=requestAnimationFrame(tick);}
function pause(){const a=session;if(!a||a.state!=='playing')return;a.state='paused';cancelAnimationFrame(a.raf);a.raf=0;clearInput(a);a.root.classList.add('sz-paused');if(a.id==='sequence'){a.jobs=[];light(a,-1);}
  cover(a,'Fais une pause.','Le jeu est arrêté. Reprends lorsque tu es prêt.','Reprendre',()=>{a.state='playing';a.root.classList.remove('sz-paused');hide(a);if(a.id==='sequence')playSequence(a);run(a);});}
function finish(a,title,text){a.state='result';cancelAnimationFrame(a.raf);a.raf=0;a.jobs=[];clearInput(a);saveRecord(a);cover(a,title,text,'Rejouer',()=>{reset(a);start(a);});}
function renderBoard(a,changes=[]){const grid=$('.sz-merge-board',a.root);grid.innerHTML=a.board.map((v,i)=>`<div class="sz-merge-cell${v?' sz-tile':''}${changes.includes(i)?' sz-tile-new':''}" data-value="${v}" style="--tile-level:${Math.min(11,Math.log2(v||1))}" aria-label="Ligne ${Math.floor(i/4)+1}, colonne ${i%4+1} : ${v||'vide'}">${v?`<span>${v}</span>`:''}</div>`).join('');$('[data-z="undo"]',a.root).disabled=!a.undo;hud(a);}
function mergeMove(a,direction){if(a.state!=='playing'||a.time<a.lockUntil)return;const change=slide2048(a.board,direction);if(!change.changed){status(a,'Essaie une autre direction.');return;}
  a.undo={board:[...a.board],score:a.score,won:a.won};a.score+=change.gained;const spawn=spawn2048(change.board);a.board=spawn.board;a.level=level2048(a.board);a.lockUntil=a.time+135;renderBoard(a,[...change.merged,spawn.index]);
  // Animate each destination from the source tile without changing the rules.
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){const cells=$('.sz-merge-board',a.root).children;for(const path of change.motion){if(path.from===path.to)continue;const el=cells[path.to],from=cells[path.from],rect=el.getBoundingClientRect(),start=from.getBoundingClientRect();el.animate([{transform:`translate(${start.x-rect.x}px,${start.y-rect.y}px)`},{transform:'translate(0,0)'}],{duration:130,easing:'ease-out'});}}
  status(a,change.gained?`+${change.gained} points. Continue !`:'Bien joué. Prépare ton prochain déplacement.');
  if(!a.won&&a.board.some(v=>v>=2048)){a.won=true;status(a,'2048 atteint ! Tu peux continuer vers 4096.');}
  if(!canMove2048(a.board)){
    a.state='result';cancelAnimationFrame(a.raf);a.raf=0;cover(a,'Belle réflexion !',`${a.score} points. Tu peux annuler ton dernier coup ou recommencer.`,'Annuler le dernier coup',()=>{a.state='playing';hide(a);undo(a);run(a);});
    const c=$('.sz-cover-card',a.root),replay=document.createElement('button');replay.type='button';replay.dataset.z='restart';replay.textContent='Nouvelle partie';c.insertBefore(replay,c.lastElementChild);
  }
}
function undo(a){if(a.id!=='merge'||!a.undo)return;Object.assign(a,{board:[...a.undo.board],score:a.undo.score,won:a.undo.won,undo:null,lockUntil:0});a.level=level2048(a.board);renderBoard(a);$('.sz-brain-stage',a.root).focus({preventScroll:true});status(a,'Dernier coup annulé. Essaie une autre direction.');}
function light(a,index){a.root.querySelectorAll('.sz-sequence-pad').forEach((b,i)=>b.classList.toggle('sz-lit',i===index));}
function inputEnabled(a,enabled){a.root.querySelectorAll('.sz-sequence-pad').forEach(b=>b.setAttribute('aria-disabled',String(!enabled)));$('[data-z="replay"]',a.root).disabled=!enabled;}
function playSequence(a){a.jobs=[];a.input=0;a.phase='watch';light(a,-1);inputEnabled(a,false);status(a,'Observe…');hud(a);const {on,gap}=sequenceTiming(a.sequence.length);let at=a.time+500;
  for(const [i,value] of a.sequence.entries()){
    a.jobs.push({at,fn:()=>{light(a,value);status(a,`Observe : ${i+1} / ${a.sequence.length}`);}});at+=on;
    a.jobs.push({at,fn:()=>light(a,-1)});at+=gap;
  }
  a.jobs.push({at,fn:()=>{a.phase='input';inputEnabled(a,true);status(a,`À toi ! ${a.sequence.length} touche${a.sequence.length>1?'s':''} à retrouver.`);}});
}
function hit(a,index){if(a.state!=='playing'||a.phase!=='input'||index<0||index>3)return;
  if(index!==a.sequence[a.input]){
    a.phase='feedback';a.lives--;inputEnabled(a,false);light(a,-1);hud(a);status(a,a.lives?'Pas cette touche. Regarde la suite une nouvelle fois.':'Les 3 chances sont utilisées.');
    a.jobs=[{at:a.time+1100,fn:()=>a.lives?playSequence(a):finish(a,'Belle concentration !',`${a.score} suites réussies. Une nouvelle partie repart avec une seule lumière.`)}];return;
  }
  a.input++;light(a,index);const flash=++a.flashToken;
  a.jobs.push({at:a.time+180,fn:()=>{if(a.flashToken===flash)light(a,-1);}});hud(a);
  if(a.input===a.sequence.length){a.phase='feedback';a.score++;saveRecord(a);inputEnabled(a,false);status(a,'Suite réussie ! Une lumière de plus…');hud(a);
    a.jobs.push({at:a.time+1000,fn:()=>{if(a.sequence.length>=20)finish(a,'Mémoire lumineuse !','Les 20 niveaux sont terminés. Prends une pause bien méritée.');else{a.sequence=extendSequence(a.sequence);a.level=a.sequence.length;playSequence(a);}}});
  }else status(a,`Bien ! ${a.input} / ${a.sequence.length}`);
}
function action(a,name,target){if(name==='close'){close();return;}if(name==='fullscreen'){if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else fullscreen(a);return;}if(name==='pause'){if(a.state==='paused')a.continue?.();else pause();return;}if(name==='continue'){a.continue?.();return;}if(name==='restart'){reset(a);start(a);return;}if(a.state!=='playing')return;
  if(a.id==='merge'&&['up','down','left','right'].includes(name))mergeMove(a,name);
  if(name==='undo')undo(a);if(name==='replay'&&a.id==='sequence'&&a.phase==='input')playSequence(a);if(name==='pad')hit(a,Number(target.dataset.pad));
}
function click(e){const a=session,b=e.target.closest('[data-z]');if(!a||!b||b.disabled)return;if(a.skipClick===b&&performance.now()-a.skipAt<800&&e.detail!==0){a.skipClick=null;return;}action(a,b.dataset.z,b);}
function down(e){const a=session;if(!a||a.state!=='playing'||e.button>0)return;const b=e.target.closest('[data-z]');
  if(b&&(['up','down','left','right'].includes(b.dataset.z)||b.dataset.z==='pad')){
    e.preventDefault();if(b.getAttribute('aria-disabled')==='true')return;a.skipClick=b;a.skipAt=performance.now();a.pressed.set(e.pointerId,b);b.classList.add('sz-key-pressed');try{b.setPointerCapture(e.pointerId);}catch{}action(a,b.dataset.z,b);return;
  }
  if(a.id==='merge'&&e.target.closest('.sz-merge-board')&&!a.gesture){e.preventDefault();a.gesture={id:e.pointerId,x:e.clientX,y:e.clientY,done:false};try{$('.sz-merge-board',a.root).setPointerCapture(e.pointerId);}catch{}}
}
function move(e){const a=session,g=a?.gesture;if(!g||g.id!==e.pointerId||g.done||a.state!=='playing')return;const dx=e.clientX-g.x,dy=e.clientY-g.y;if(Math.max(Math.abs(dx),Math.abs(dy))<24)return;e.preventDefault();g.done=true;mergeMove(a,Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up');}
function up(e){const a=session;if(!a)return;clearPressed(a,e.pointerId);if(a.gesture?.id===e.pointerId)a.gesture=null;}
function cancel(e){up(e);}
function key(e){const a=session;if(!a)return;if(e.key.toLowerCase()==='p'){e.preventDefault();action(a,'pause');return;}if(a.state!=='playing'||e.repeat)return;
  const direction={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'}[e.key];
  if(a.id==='merge'&&direction){e.preventDefault();mergeMove(a,direction);}else if(a.id==='merge'&&e.key.toLowerCase()==='z'){e.preventDefault();undo(a);}else if(a.id==='sequence'&&/^[1-4]$/.test(e.key)){e.preventDefault();hit(a,Number(e.key)-1);}
}
export function initBrainGames(){if(installed)return;installed=true;document.addEventListener('click',e=>{if(session)return;const id=e.target.closest('[data-brain-game]')?.dataset.brainGame;if(id)launch(id);});}
