/* SobriZen arcade: original maze chase and Klondike. No remote assets. */
import {gamePremiumAllowed,gameSession,sameGameSession} from './games-runtime.mjs';
const $=(q,r=document)=>r.querySelector(q);
let active=null,installed=false;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MAZE=[
'###################',
'#........#........#',
'#.##.###.#.###.##.#',
'#o##.###.#.###.##o#',
'#.................#',
'#.##.#.#####.#.##.#',
'#....#...#...#....#',
'####.### # ###.####',
'   #.#       #.#   ',
'####.# ## ## #.####',
'    .  #   #  .    ',
'####.# ##### #.####',
'   #.#       #.#   ',
'####.# ##### #.####',
'#........#........#',
'#.##.###.#.###.##.#',
'#o.#..... .....#.o#',
'##.#.#.#####.#.#.##',
'#....#...#...#....#',
'#.######.#.######.#',
'#.................#',
'###################'];
const dirs={left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]};
const suits=['♠','♥','♣','♦'];
const red=s=>s===1||s===3;
function style(){if($('#arcadeStyles'))return;const el=document.createElement('style');el.id='arcadeStyles';el.textContent=`
.arc-play{position:fixed;inset:0;border:0;margin:0;padding:env(safe-area-inset-top) max(10px,env(safe-area-inset-right)) env(safe-area-inset-bottom) max(10px,env(safe-area-inset-left));width:100%;height:100%;max-width:none;max-height:none;box-sizing:border-box;background:linear-gradient(155deg,#e8f7fb,#f5f9ff);color:#17334b;overflow:auto;font-family:inherit}
.arc-play::backdrop{background:#0a1b2e}.arc-wrap{max-width:1000px;margin:0 auto;min-height:100%;display:flex;flex-direction:column;gap:10px}
.arc-top,.arc-stats,.arc-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.arc-top h2{font-size:clamp(19px,4vw,26px);margin:8px 0}.arc-play button{cursor:pointer;font:inherit;touch-action:manipulation}
.arc-top button,.arc-actions button,.arc-control button,.arc-sol-tools button,.arc-overlay button{border:1px solid #bed8e5;background:white;border-radius:13px;padding:10px 13px;color:#17334b;font-weight:700;min-height:44px}
.arc-stats{background:#fff9;padding:9px 14px;border-radius:14px;font-weight:700}.arc-stats span{white-space:nowrap}
.arc-maze{display:block;aspect-ratio:19/22;max-width:min(100%,450px);max-height:calc(100dvh - 260px);width:auto;margin:auto;background:#081626;border-radius:14px;touch-action:none}
.arc-maze-zone{position:relative;display:flex;justify-content:center;flex:1;min-height:0}
.arc-control{display:grid;grid-template-columns:repeat(3,58px);gap:4px;align-self:center;justify-content:center;margin:4px auto 10px;touch-action:none}
.arc-control [data-dir=up]{grid-column:2}.arc-control [data-dir=left]{grid-column:1;grid-row:2}.arc-control [data-dir=down]{grid-column:2;grid-row:2}.arc-control [data-dir=right]{grid-column:3;grid-row:2}
.arc-control button{font-size:23px;border-radius:15px;background:#d9f2fb}
.arc-overlay{position:absolute;inset:0;display:grid;place-content:center;text-align:center;background:#e8f7fbef;z-index:4;border-radius:15px;padding:20px}
.arc-overlay[hidden]{display:none}.arc-overlay h3{font-size:25px;margin:0 0 8px}.arc-overlay p{max-width:340px}
.arc-sol{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:clamp(3px,1.2vw,12px);padding:clamp(5px,1.5vw,18px);border-radius:19px;background:linear-gradient(135deg,#087a72,#145f68);min-height:400px;align-content:start;flex:1}
.arc-sol .arc-pile{position:relative;min-width:0;min-height:clamp(82px,14vw,123px);border:1px dashed #ffffff8a;border-radius:8px;cursor:pointer;touch-action:manipulation}
.arc-sol .arc-pile[data-zone=tableau]{min-height:calc(280px + 7vw)}
.arc-card{position:absolute;top:var(--top,0px);left:0;width:100%;aspect-ratio:0.695;border-radius:7px;background:#fdfdfd;border:1px solid #bac9cb;box-shadow:0 2px 4px #0003;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:clamp(12px,2.8vw,24px);font-weight:800;user-select:none;-webkit-user-select:none}
.arc-card small{font-size:.72em}.arc-card.red{color:#bc2b45}.arc-card.black{color:#172a46}
.arc-card.back{background:repeating-linear-gradient(45deg,#1a6fac 0 7px,#125080 7px 14px);border:3px solid #fff;color:transparent}
.arc-card.selected{outline:3px solid #ffe986;z-index:8;transform:translateY(-4px)}.arc-sol .arc-pile.hint{outline:3px solid #ffcf61}
.arc-sol-tools{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.arc-notice{min-height:24px;text-align:center;font-size:13px;margin:2px;color:#214760}
@media(min-width:650px){.arc-sol .arc-pile[data-zone=tableau]{min-height:480px}}
@media(max-height:670px){.arc-maze{max-height:calc(100dvh - 200px)}.arc-top h2{margin:2px}.arc-stats{padding:5px}}
@media(prefers-reduced-motion:reduce){.arc-card{transition:none!important}}
`;document.head.append(el);}
export function arcadeCards(premium=false){style();return [['maze','🟡','Labyrinthe Zen','Évite les fantômes, collecte les points et passe les niveaux.'],['solitaire','🃏','Solitaire Zen','Klondike classique : stratégie, indices et annulation.']].map(([id,emoji,title,desc])=>`<button type="button" class="ga-card ga-theme-${id}" ${premium?`data-arcade="${id}"`:`data-game-upgrade="${id}"`} aria-label="${title} — ${premium?'jouer':'Premium'}"><span class="ga-card-icon" aria-hidden="true">${emoji}</span><small>NOUVEAU · ${premium?'PREMIUM':'🔒 PREMIUM'}</small><b>${title}</b><span>${desc}</span><strong>${premium?'Jouer':'Découvrir'} ↗</strong></button>`).join('');}
function launch(id){
 if(active||!['maze','solitaire'].includes(id))return;
 if(!gamePremiumAllowed()){location.href='/abonnement.html';return;}
 style();const dialog=document.createElement('dialog');dialog.id='arcadePlay';dialog.className='arc-play';dialog.innerHTML=`<div class="arc-wrap"><header class="arc-top"><h2>${id==='maze'?'🟡 Labyrinthe Zen':'🃏 Solitaire Zen'}</h2><div><button data-act="help" aria-label="Règles">ⓘ Règles</button><button data-act="pause">Ⅱ Pause</button><button data-act="close">✕ Quitter</button></div></header><div class="arc-stats" aria-live="polite"></div><div class="arc-body"></div><p class="arc-notice" role="status" aria-live="polite"></p></div>`;
 const a={id,dialog,session:gameSession(),source:$('#gameZone'),controller:new AbortController(),origin:document.activeElement,previousOverflow:document.body.style.overflow,state:'playing',raf:0,last:0};active=a;document.body.append(dialog);document.body.style.overflow='hidden';dialog.showModal();const sig=a.controller.signal;
 dialog.addEventListener('click',e=>click(a,e),{signal:sig});dialog.addEventListener('dblclick',e=>{if(a.id==='solitaire')solDouble(a,e);},{signal:sig});
 dialog.addEventListener('pointerdown',e=>{if(a.id!=='solitaire'||a.state!=='playing')return;const n=e.target.closest('.arc-pile');if(!n||n.dataset.zone==='stock')return;const zone=n.dataset.zone,i=Number(n.dataset.i),arr=pile(a,zone,i),idx=zone==='tableau'?Number(e.target.closest('[data-idx]')?.dataset.idx??-1):arr.length-1;if(idx>=0&&arr[idx]?.up&&solValidSequence(arr.slice(idx)))a.drag={zone,i,idx,x:e.clientX,y:e.clientY};},{signal:sig});
 dialog.addEventListener('pointerup',e=>{if(!a.drag)return;const from=a.drag;a.drag=null;if(Math.hypot(e.clientX-from.x,e.clientY-from.y)<18)return;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.arc-pile');if(!target)return;const zone=target.dataset.zone,i=Number(target.dataset.i);if(solTransfer(a,{zone:from.zone,i:from.i,idx:from.idx},{zone,i})){a.selected=null;solRender(a);a.suppressClick=performance.now()+350;}else notice(a,'Déplacement impossible : vérifie la valeur et la couleur.');},{signal:sig});
 dialog.addEventListener('keydown',e=>key(a,e),{signal:sig});dialog.addEventListener('cancel',e=>{e.preventDefault();pause(a);},{signal:sig});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause(a);},{signal:sig});window.addEventListener('blur',()=>pause(a),{signal:sig});window.addEventListener('pagehide',close,{signal:sig});
 document.addEventListener('sobrizen-access-change',()=>{if(!sameGameSession(a.session)||!gamePremiumAllowed())close();},{signal:sig});
 const mo=new MutationObserver(()=>{if(!a.source?.isConnected)close();});mo.observe(a.source?.parentNode||document.body,{childList:true});a.observer=mo;
 if(id==='maze')mazeReset(a);else solReset(a);dialog.querySelector('button').focus({preventScroll:true});
}
function close(){const a=active;if(!a)return;active=null;cancelAnimationFrame(a.raf);a.controller.abort();a.observer.disconnect();a.dialog.close();a.dialog.remove();document.body.style.overflow=a.previousOverflow;a.origin?.isConnected&&a.origin.focus({preventScroll:true});}
function cover(a,title,detail){let c=$('.arc-overlay',a.dialog);if(!c){c=document.createElement('div');c.className='arc-overlay';$('.arc-body',a.dialog).append(c);}c.hidden=false;c.innerHTML=`<h3>${escape(title)}</h3><p>${escape(detail)}</p><div class="arc-actions"><button data-act="resume">Reprendre</button><button data-act="restart">Nouvelle partie</button><button data-act="close">Quitter</button></div>`;}
function uncover(a){const c=$('.arc-overlay',a.dialog);if(c)c.hidden=true;}
function pause(a,help=false){if(a.state==='won'||a.state==='lost')return;if(a.state==='playing')a.state='paused';cover(a,help?'Comment jouer ?':'Partie en pause',help?(a.id==='maze'?'Flèches, balayage ou commandes tactiles. Attrape les points, évite les fantômes. Les grosses pastilles les rendent vulnérables.':'Classe de l’As au Roi par couleur alternée. Déplace les suites de cartes vers les colonnes, et les cartes vers les fondations. Pioche une carte à la fois.'):'Ton avancement reste intact tant que tu gardes cette partie ouverte.');}
function notice(a,s){$('.arc-notice',a.dialog).textContent=s;}
function click(a,e){if(!sameGameSession(a.session)||!gamePremiumAllowed()){close();return;}const control=e.target.closest('[data-act]');if(control){const act=control.dataset.act;if(act==='close')return close();if(act==='pause'||act==='help')return pause(a,act==='help');if(act==='resume'){a.state='playing';uncover(a);a.last=0;if(a.id==='maze')runMaze(a);return;}if(act==='restart'){uncover(a);a.id==='maze'?mazeReset(a):solReset(a);return;}if(a.id==='solitaire')return solAction(a,act);if(dirs[act]){a.next=act;return;}return;}if(a.id==='solitaire')solClick(a,e);}
function key(a,e){if(e.key==='Escape'){e.preventDefault();pause(a);return;}if(a.state!=='playing')return;if(a.id==='maze'){const d={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',a:'left',s:'down',d:'right'}[e.key];if(d){e.preventDefault();a.next=d;}}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();solUndo(a);}}
function mazeReset(a){a.state='playing';a.level=1;a.score=0;a.lives=3;mazeLevel(a);}
function mazeLevel(a){a.tiles=MAZE.map(row=>row.split(''));a.player={x:9,y:16,d:'left'};a.next='left';a.ghosts=[{x:8,y:10,d:'left',color:'#ff6983'},{x:9,y:10,d:'up',color:'#78dfff'},{x:10,y:10,d:'right',color:'#ffb773'}];a.power=0;a.tick=0;a.stepTime=0;a.remaining=a.tiles.flat().filter(x=>x==='.'||x==='o').length;const body=$('.arc-body',a.dialog);body.innerHTML='<div class="arc-maze-zone"><canvas class="arc-maze" width="570" height="660" aria-label="Labyrinthe de jeu" tabindex="0"></canvas></div><div class="arc-control" aria-label="Déplacement"><button data-act="up" data-dir="up">↑</button><button data-act="left" data-dir="left">←</button><button data-act="down" data-dir="down">↓</button><button data-act="right" data-dir="right">→</button></div>';const canvas=$('canvas',body);let start=null;canvas.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};},{signal:a.controller.signal});canvas.addEventListener('pointerup',e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.hypot(dx,dy)>16)a.next=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';start=null;},{signal:a.controller.signal});mazeDraw(a);runMaze(a);}
function mazeOpen(a,x,y){return y>=0&&y<a.tiles.length&&x>=0&&x<19&&a.tiles[y][x]!=='#';}
function mazeMove(a,obj,dir){const [dx,dy]=dirs[dir];let x=obj.x+dx,y=obj.y+dy;if(x<0)x=18;if(x>18)x=0;if(mazeOpen(a,x,y)){obj.x=x;obj.y=y;obj.d=dir;return true;}return false;}
function ghostDirection(a,g){const opts=Object.keys(dirs).filter(d=>{const [dx,dy]=dirs[d];return mazeOpen(a,(g.x+dx+19)%19,g.y+dy);});if(!opts.length)return g.d;const inverse={left:'right',right:'left',up:'down',down:'up'}[g.d];const choices=opts.filter(d=>d!==inverse);const allowed=choices.length?choices:opts;const target=a.power>0?{x:9,y:10}:a.player;allowed.sort((u,v)=>{const distance=d=>{const [dx,dy]=dirs[d];return Math.abs(g.x+dx-target.x)+Math.abs(g.y+dy-target.y);};return (a.power>0?distance(v)-distance(u):distance(u)-distance(v));});return Math.random()<.22?allowed[Math.floor(Math.random()*allowed.length)]:allowed[0];}
function collide(a){for(const g of a.ghosts){if(g.x!==a.player.x||g.y!==a.player.y)continue;if(a.power>0){a.score+=200;g.x=9;g.y=10;notice(a,'Fantôme attrapé ! +200');}else{a.lives--;a.player={x:9,y:16,d:'left'};a.ghosts.forEach((v,i)=>{v.x=8+i;v.y=10;});a.next='left';if(a.lives<=0){a.state='lost';cover(a,'Partie terminée',`Score : ${a.score} points. Rejoue quand tu veux.`);}else notice(a,'Un essai de moins : tu peux continuer.');break;}}}
function mazeStep(a){a.tick++;if(a.power>0)a.power--;if(!mazeMove(a,a.player,a.next))mazeMove(a,a.player,a.player.d);collide(a);if(a.state!=='playing')return;const {x,y}=a.player;const t=a.tiles[y][x];if(t==='.'||t==='o'){a.score+=t==='o'?50:10;if(t==='o')a.power=65;a.tiles[y][x]='';a.remaining--;}if(!a.remaining){a.level++;a.score+=500;mazeLevel(a);notice(a,'Niveau suivant !');return;}if(a.tick%2===0)for(const g of a.ghosts){mazeMove(a,g,ghostDirection(a,g));collide(a);if(a.state!=='playing')break;}}
function mazeDraw(a){const canvas=$('.arc-maze',a.dialog);if(!canvas)return;const c=canvas.getContext('2d'),z=30;c.clearRect(0,0,570,660);c.fillStyle='#081626';c.fillRect(0,0,570,660);
 for(let y=0;y<a.tiles.length;y++)for(let x=0;x<19;x++){const t=a.tiles[y][x];if(t==='#'){c.fillStyle='#1956bb';c.fillRect(x*z+2,y*z+2,26,26);c.fillStyle='#173b85';c.fillRect(x*z+6,y*z+6,18,18);}else if(t==='.'||t==='o'){c.fillStyle=t==='o'?'#ffc966':'#dce9f4';c.beginPath();c.arc(x*z+15,y*z+15,t==='o'?7:2.8,0,Math.PI*2);c.fill();}}
 const mouth=.25+.2*Math.sin(a.tick*1.8),angle={right:0,down:Math.PI/2,left:Math.PI,up:-Math.PI/2}[a.player.d];c.fillStyle='#ffe165';c.beginPath();c.moveTo(a.player.x*z+15,a.player.y*z+15);c.arc(a.player.x*z+15,a.player.y*z+15,12,angle+mouth,angle+Math.PI*2-mouth);c.fill();
 for(const g of a.ghosts){const x=g.x*z+15,y=g.y*z+15;c.fillStyle=a.power>0?'#5688ff':g.color;c.beginPath();c.arc(x,y-2,11,Math.PI,0);c.lineTo(x+11,y+11);c.lineTo(x-11,y+11);c.closePath();c.fill();c.fillStyle='white';c.beginPath();c.arc(x-4,y-2,3,0,7);c.arc(x+4,y-2,3,0,7);c.fill();}
 $('.arc-stats',a.dialog).innerHTML=`<span>Score : ${a.score}</span><span>Niveau : ${a.level}</span><span>Vies : ${'♥'.repeat(a.lives)}</span>`;}
function runMaze(a){if(active!==a||a.id!=='maze'||a.raf)return;const frame=t=>{a.raf=0;if(active!==a||a.state!=='playing')return;const delta=a.last?Math.min(80,t-a.last):0;a.last=t;a.stepTime+=delta;const speed=Math.max(95,170-a.level*7);if(a.stepTime>=speed){a.stepTime%=speed;mazeStep(a);}mazeDraw(a);if(a.state==='playing')a.raf=requestAnimationFrame(frame);};a.raf=requestAnimationFrame(frame);}
function deck(){const d=[];for(let s=0;s<4;s++)for(let r=1;r<=13;r++)d.push({s,r,up:false});for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}return d;}
function solReset(a){a.state='playing';const d=deck();a.table=Array.from({length:7},()=>[]);for(let i=0;i<7;i++)for(let j=0;j<=i;j++){const c=d.pop();c.up=j===i;a.table[i].push(c);}a.stock=d;a.waste=[];a.found=[[],[],[],[]];a.moves=0;a.undo=[];a.selected=null;a.hints=0;$('.arc-body',a.dialog).innerHTML='<div class="arc-sol" aria-label="Solitaire Klondike"></div><div class="arc-sol-tools"><button data-act="hint">💡 Indice</button><button data-act="undo">↶ Annuler</button><button data-act="auto">✦ Fondation auto</button><button data-act="restart">↻ Recommencer</button></div>';notice(a,'Touche une carte, puis son emplacement. Double-touche une carte pour tenter la fondation.');solRender(a);}
const cloneSol=a=>JSON.stringify({table:a.table,stock:a.stock,waste:a.waste,found:a.found,moves:a.moves});
function snapshot(a){a.undo.push(cloneSol(a));if(a.undo.length>150)a.undo.shift();}
function solUndo(a){const x=a.undo.pop();if(!x){notice(a,'Aucun coup à annuler.');return;}Object.assign(a,JSON.parse(x));a.selected=null;a.state='playing';uncover(a);solRender(a);}
function solValidSequence(seq){return seq.every((c,i)=>c.up&&(i===0||seq[i-1].r===c.r+1&&red(seq[i-1].s)!==red(c.s)));}
function solCanPlace(seq,to,zone){if(zone==='foundation')return seq.length===1&&to.length===seq[0].r-1&&(to.length===0||to.at(-1).s===seq[0].s);return zone==='tableau'&&(to.length===0?seq[0].r===13:to.at(-1).up&&to.at(-1).r===seq[0].r+1&&red(to.at(-1).s)!==red(seq[0].s));}
function pile(a,zone,i){return zone==='tableau'?a.table[i]:zone==='foundation'?a.found[i]:zone==='waste'?a.waste:a.stock;}
function solSelect(a,zone,i,idx){const arr=pile(a,zone,i);if(zone==='stock'){solDraw(a);return;}if(zone==='foundation'){if(arr.length)idx=arr.length-1;else idx=0;}if(zone==='waste')idx=arr.length-1;if(idx<0||idx>=arr.length||!arr[idx].up)return;
 if(a.selected){const s=a.selected;if(s.zone===zone&&s.i===i&&s.idx===idx){a.selected=null;solRender(a);return;}if(solTransfer(a,s,{zone,i})){a.selected=null;solRender(a);return;}}
 if(zone==='waste'||zone==='foundation'||zone==='tableau'&&solValidSequence(arr.slice(idx)))a.selected={zone,i,idx};else notice(a,'Cette suite de cartes ne peut pas être déplacée.');solRender(a);}
function solTransfer(a,from,to){if(to.zone!=='tableau'&&to.zone!=='foundation'||from.zone===to.zone&&from.i===to.i)return false;const src=pile(a,from.zone,from.i),dst=pile(a,to.zone,to.i),seq=src.slice(from.idx);if(!seq.length||!solValidSequence(seq)||!solCanPlace(seq,dst,to.zone))return false;snapshot(a);src.splice(from.idx);dst.push(...seq);if(from.zone==='tableau'&&src.length)src.at(-1).up=true;a.moves++;notice(a,'Bien joué !');solWin(a);return true;}
function solDraw(a){snapshot(a);if(a.stock.length){const c=a.stock.pop();c.up=true;a.waste.push(c);}else if(a.waste.length){a.stock=a.waste.reverse().map(c=>({...c,up:false}));a.waste=[];}else{a.undo.pop();notice(a,'La pioche est vide.');return;}a.moves++;a.selected=null;solRender(a);}
function solRender(a){const board=$('.arc-sol',a.dialog);if(!board)return;const card=(c,top,selected=false)=>`<div class="arc-card ${c.up?(red(c.s)?'red':'black'):'back'} ${selected?'selected':''}" style="--top:${top}px" aria-label="${c.up?escape((c.r===1?'As':c.r===11?'Valet':c.r===12?'Dame':c.r===13?'Roi':c.r)+' '+suits[c.s]):'Carte cachée'}">${c.up?`<span>${c.r===1?'A':c.r===11?'V':c.r===12?'D':c.r===13?'R':c.r}</span><small>${suits[c.s]}</small>`:''}</div>`;
 let html='';const box=(zone,i,arr,contents)=>`<div class="arc-pile" data-zone="${zone}" data-i="${i}" aria-label="${zone} ${i+1}">${contents}</div>`;
 html+=box('stock',0,a.stock,a.stock.length?'<div class="arc-card back"></div>':'<div class="arc-card" style="color:#167e7d">↻</div>');
 html+=box('waste',0,a.waste,a.waste.length?card(a.waste.at(-1),0,a.selected?.zone==='waste'):'');
 html+='<div></div>';
 for(let i=0;i<4;i++)html+=box('foundation',i,a.found[i],a.found[i].length?card(a.found[i].at(-1),0,a.selected?.zone==='foundation'&&a.selected.i===i):`<span style="color:white;display:block;text-align:center;padding-top:12px">A${i+1}</span>`);
 for(let i=0;i<7;i++){const a0=a.table[i];html+=box('tableau',i,a0,a0.map((c,j)=>`<div data-idx="${j}">${card(c,j*23,a.selected?.zone==='tableau'&&a.selected.i===i&&j>=a.selected.idx)}</div>`).join(''));}
 board.innerHTML=html;$('.arc-stats',a.dialog).innerHTML=`<span>Coups : ${a.moves}</span><span>Fondations : ${a.found.reduce((s,p)=>s+p.length,0)}/52</span><span>Annulations : ${a.undo.length}</span>`;}
function solClick(a,e){if(a.state!=='playing'||performance.now()<(a.suppressClick||0))return;const node=e.target.closest('.arc-pile');if(!node)return;const zone=node.dataset.zone,i=Number(node.dataset.i),idx=Number(e.target.closest('[data-idx]')?.dataset.idx??-1);if(a.selected&&(zone==='tableau'||zone==='foundation')&&solTransfer(a,a.selected,{zone,i})){a.selected=null;solRender(a);return;}solSelect(a,zone,i,idx);}
function solDouble(a,e){if(a.state!=='playing')return;const node=e.target.closest('.arc-pile');if(!node||!['tableau','waste'].includes(node.dataset.zone))return;const zone=node.dataset.zone,i=Number(node.dataset.i),arr=pile(a,zone,i),idx=arr.length-1;for(let j=0;j<4;j++)if(solTransfer(a,{zone,i,idx},{zone:'foundation',i:j})){a.selected=null;solRender(a);break;}}
function solWin(a){if(a.found.every(p=>p.length===13)){a.state='won';cover(a,'Solitaire réussi !',`52 cartes rangées en ${a.moves} coups. Bravo pour cette partie !`);}}
function solAction(a,act){if(act==='undo')return solUndo(a);if(a.state!=='playing')return;if(act==='hint'){for(const [zone,collections] of [['waste',[a.waste]],['tableau',a.table]])for(let i=0;i<collections.length;i++){const arr=collections[i];if(!arr.length)continue;for(let idx=zone==='waste'?arr.length-1:0;idx<arr.length;idx++){if(!arr[idx].up||!solValidSequence(arr.slice(idx)))continue;for(const target of ['foundation','tableau'])for(let j=0;j<(target==='foundation'?4:7);j++){if(zone===target&&i===j)continue;if(solCanPlace(arr.slice(idx),pile(a,target,j),target)){notice(a,`Indice : déplace ${suits[arr[idx].s]} ${arr[idx].r} vers ${target==='foundation'?'une fondation':'la colonne '+(j+1)}.`);return;}}}}notice(a,'Essaie la pioche ou retourne une autre carte.');}else if(act==='auto'){let done=0;for(let loop=0;loop<52;loop++){let changed=false;for(const zone of ['waste','tableau']){const collections=zone==='waste'?[a.waste]:a.table;for(let i=0;i<collections.length;i++){const arr=collections[i];if(!arr.length||!arr.at(-1).up)continue;for(let j=0;j<4;j++)if(solTransfer(a,{zone,i,idx:arr.length-1},{zone:'foundation',i:j})){done++;changed=true;break;}}}if(!changed)break;}a.selected=null;solRender(a);if(!done)notice(a,'Aucune carte disponible pour les fondations.');}}
export function initArcade(){if(installed)return;installed=true;document.addEventListener('click',e=>{const b=e.target.closest('[data-arcade]');if(b){e.preventDefault();launch(b.dataset.arcade);}});}
