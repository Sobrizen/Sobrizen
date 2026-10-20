/* Pure game rules: no DOM, storage, timers, network, or health data. */
export const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
export function shuffle(values,random=Math.random){const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
export const snakeLevel=fruits=>Math.min(10,1+Math.floor(fruits/4));
export const snakeDelay=level=>Math.max(85,Math.round(260*Math.pow(.88,level-1)));
export const blocksLevel=lines=>Math.min(10,1+Math.floor(lines/4));
export const blocksDelay=level=>Math.max(120,Math.round(1000*Math.pow(.8,level-1)));
export function emptyCell(body,size,random=Math.random,height=size){const occupied=new Set(body.map(([x,y])=>y*size+x)),free=[];for(let i=0;i<size*height;i++)if(!occupied.has(i))free.push(i);if(!free.length)return null;const p=free[Math.floor(random()*free.length)];return [p%size,Math.floor(p/size)]}
export function createSnake(size=18,height=size){const y=Math.floor(height/2);return {size,height,body:[[5,y],[4,y],[3,y]],previous:[[5,y],[4,y],[3,y]],direction:[1,0],queue:[],food:[9,y],fruits:0,level:1,over:false,won:false}}
const DIRECTIONS={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
export function turnSnake(s,name){const d=DIRECTIONS[name],old=s.queue.at(-1)||s.direction;if(s.over||!d||s.queue.length>=2||d[0]===-old[0]&&d[1]===-old[1]||d[0]===old[0]&&d[1]===old[1])return false;s.queue.push([...d]);return true}
export function stepSnake(s,random=Math.random){if(s.over)return {over:true};s.direction=s.queue.shift()||s.direction;const next=[s.body[0][0]+s.direction[0],s.body[0][1]+s.direction[1]],ate=s.food&&next[0]===s.food[0]&&next[1]===s.food[1];const colliders=ate?s.body:s.body.slice(0,-1);if(next[0]<0||next[0]>=s.size||next[1]<0||next[1]>=s.height||colliders.some(p=>p[0]===next[0]&&p[1]===next[1])){s.over=true;return {over:true}}s.previous=s.body.map(p=>[...p]);s.body.unshift(next);if(ate){s.fruits++;s.level=snakeLevel(s.fruits);s.previous.push([...s.previous.at(-1)]);s.food=emptyCell(s.body,s.size,random,s.height);if(!s.food){s.won=true;s.over=true}}else s.body.pop();return {ate:!!ate,over:s.over,won:s.won}}
export const SHAPES=[[[1,1,1,1]],[[1,1],[1,1]],[[0,1,0],[1,1,1]],[[1,0,0],[1,1,1]],[[0,0,1],[1,1,1]],[[0,1,1],[1,1,0]],[[1,1,0],[0,1,1]]];
export const BLOCK_COLORS=['#42d9ff','#ffce57','#b18aff','#5b96ff','#ff9b5e','#59e4ae','#ff739c'];
export function createBlocks(random=Math.random){const b={w:10,h:20,board:Array.from({length:20},()=>Array(10).fill(0)),bag:[],next:[1,0,2],piece:null,x:0,y:0,color:1,lines:0,score:0,level:1,over:false,lock:0,resets:0};spawnBlock(b,random);return b}
export function collides(b,x=b.x,y=b.y,p=b.piece){return p.some((row,dy)=>row.some((v,dx)=>v&&(x+dx<0||x+dx>=b.w||y+dy>=b.h||y+dy>=0&&b.board[y+dy][x+dx])))}
export function spawnBlock(b,random=Math.random){while(b.next.length<4){if(!b.bag.length)b.bag=shuffle([0,1,2,3,4,5,6],random);b.next.push(b.bag.pop())}const id=b.next.shift();b.piece=SHAPES[id].map(r=>[...r]);b.color=id+1;b.x=Math.floor((b.w-b.piece[0].length)/2);b.y=0;b.lock=0;b.resets=0;if(collides(b))b.over=true}
export function moveBlock(b,dx){if(b.over||collides(b,b.x+dx,b.y))return false;const grounded=collides(b,b.x,b.y+1);b.x+=dx;if(grounded&&b.resets<15){b.lock=0;b.resets++}return true}
export function rotateBlock(b){if(b.over||b.color===2)return false;const rotated=b.piece[0].map((_,i)=>b.piece.map(row=>row[i]).reverse()),grounded=collides(b,b.x,b.y+1);for(const dx of [0,-1,1,-2,2])if(!collides(b,b.x+dx,b.y,rotated)){b.x+=dx;b.piece=rotated;if(grounded&&b.resets<15){b.lock=0;b.resets++}return true}return false}
export function ghostY(b){let y=b.y;while(!collides(b,b.x,y+1))y++;return y}
export function lockBlock(b,random=Math.random){if(b.over)return {lines:0,rows:[],over:true};for(let dy=0;dy<b.piece.length;dy++)for(let dx=0;dx<b.piece[dy].length;dx++)if(b.piece[dy][dx]){if(b.y+dy<0){b.over=true;return {lines:0,rows:[],over:true}}b.board[b.y+dy][b.x+dx]=b.color}const rows=[];b.board.forEach((r,i)=>{if(r.every(Boolean))rows.push(i)});b.board=b.board.filter(r=>!r.every(Boolean));while(b.board.length<b.h)b.board.unshift(Array(b.w).fill(0));b.score+=[0,100,300,500,800][rows.length]*b.level;b.lines+=rows.length;b.level=blocksLevel(b.lines);spawnBlock(b,random);return {lines:rows.length,rows,over:b.over}}
export function dropBlock(b,random=Math.random){if(b.over)return {lines:0,rows:[],over:true};const y=ghostY(b);b.score+=(y-b.y)*2;b.y=y;return lockBlock(b,random)}
export const memoryPairs=level=>Math.min(10,2+level*2);
export const targetSize=level=>Math.max(48,90-(level-1)*6);
export const targetWindow=level=>Math.max(650,2000-(level-1)*180);
export const reactionWindow=level=>Math.max(400,1400-(level-1)*160);
