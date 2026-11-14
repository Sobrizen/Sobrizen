/** Generate the unified circular SobriZen identity at build time. No external packages. */
import {deflateSync} from 'node:zlib';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const blend=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const letters={
 S:['01111','10000','10000','01110','00001','00001','11110'],
 o:['00000','00000','01110','10001','10001','10001','01110'],
 b:['10000','10000','11110','10001','10001','10001','11110'],
 r:['00000','00000','10110','11001','10000','10000','10000'],
 i:['00100','00000','01100','00100','00100','00100','01110'],
 Z:['11111','00001','00010','00100','01000','10000','11111'],
 e:['00000','00000','01110','10001','11111','10000','01111'],
 n:['00000','00000','11110','10001','10001','10001','10001']
};
const message='SobriZen';
function glyphAt(x,y){
 const scale=7.4,step=scale*6,total=message.length*step-scale,cx=256-total/2;
 const index=Math.floor((x-cx)/step);if(index<0||index>=message.length)return -1;
 const local=x-cx-index*step;
 const col=Math.floor(local/scale),row=Math.floor((y-239)/scale);
 if(col<0||col>=5||row<0||row>=7)return -1;
 return letters[message[index]][row][col]==='1'?index:-1;
}
function leaf(x,y,cx,cy,rx,ry,angle){
 const dx=x-cx,dy=y-cy,c=Math.cos(angle),s=Math.sin(angle);
 return ((dx*c+dy*s)/rx)**2+((-dx*s+dy*c)/ry)**2<1;
}
function point(px,py,{maskable=false}={}){
 const s=maskable?.72:1,x=(px-256)/s+256,y=(py-256)/s+256,r=Math.hypot(x-256,y-256);
 if(r>243)return maskable?[238,247,248,255]:[0,0,0,0];
 if(r>229){const t=clamp((x+y)/1024);const c=blend([7,155,169],[5,91,102],t);return [...c,255];}
 let c=[255,255,255,255];
 const idx=glyphAt(x,y);
 if(idx>=0)c=idx<5?[1,65,75,255]:[7,157,147,255];
 const t=(x-96)/327;
 if(x>=96&&x<=423&&Math.abs(y-(342-16*Math.pow(clamp(t),2)))<3.5)
  c=[Math.round(174-159*t),Math.round(220-65*t),Math.round(222-70*t),255];
 if(leaf(x,y,238,383,14,29,-.60)||leaf(x,y,275,383,14,29,.60))
  c=[7,164,151,255];
 return c;
}
function crc32(buf){
 let crc=0xFFFFFFFF;
 for(const v of buf){crc^=v;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xEDB88320:0);}
 return (crc^0xFFFFFFFF)>>>0;
}
function chunk(type,data){
 const n=Buffer.alloc(4);n.writeUInt32BE(data.length,0);
 const kind=Buffer.from(type,'ascii'),sum=Buffer.alloc(4);
 sum.writeUInt32BE(crc32(Buffer.concat([kind,data])),0);
 return Buffer.concat([n,kind,data,sum]);
}
export function iconPng(size,{maskable=false}={}){
 const rgba=Buffer.alloc(size*size*4);
 for(let iy=0;iy<size;iy++)for(let ix=0;ix<size;ix++){
  const col=[0,0,0,0];
  for(let sy=0;sy<2;sy++)for(let sx=0;sx<2;sx++){
   const p=point((ix+(sx+.5)/2)*512/size,(iy+(sy+.5)/2)*512/size,{maskable});
   for(let k=0;k<4;k++)col[k]+=p[k]/4;
  }
  const idx=(iy*size+ix)*4;
  for(let k=0;k<4;k++)rgba[idx+k]=Math.round(col[k]);
 }
 const lines=Buffer.alloc(size*(1+size*4));
 for(let y=0;y<size;y++)rgba.copy(lines,y*(size*4+1)+1,y*size*4,(y+1)*size*4);
 const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(lines,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
export function brandIconAssets(){
 return new Map([
 ['favicon-32.png',iconPng(32)],
 ['apple-touch-icon.png',iconPng(180)],
 ['icon-192.png',iconPng(192)],
 ['icon-512.png',iconPng(512)],
 ['icon-maskable-512.png',iconPng(512,{maskable:true})]
 ]);
}
