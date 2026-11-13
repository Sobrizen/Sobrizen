/** Generate blue-green Sobrizen landscape PNG icons for the PWA. Pure Node, no external packages. */
import {deflateSync} from 'node:zlib';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const rgbmix=(a,b,t)=>a.map((v,i)=>mix(v,b[i],t));
function point(px,py,{maskable=false}={}){
 const fx=px-256,fy=py-256,side=Math.max(0,Math.abs(fx)-142),vside=Math.max(0,Math.abs(fy)-142);
 if(!maskable&&Math.hypot(side,vside)>110)return [0,0,0,0];
 let c=rgbmix([249,252,255],[229,244,249],clamp((px+py)/1024));
 const scale=maskable?.66:.83,x=(px-256)/scale+256,y=(py-256)/scale+256;
 const radius=Math.hypot(x-256,y-256);
 if(radius<231){
   const sr=Math.hypot(x-354,y-244);
   if(sr<78)c=rgbmix(c,[255,227,186],Math.pow(clamp((78-sr)/65),1.65)*.94);
   const farY=317+19*Math.sin((x-82)*Math.PI/218)+14*Math.sin((x-280)*Math.PI/240);
   if(y>=farY)c=rgbmix([182,226,239],[165,220,224],clamp(x/480));
   const nearY=315+.00098*(x-342)*(x-342)+.5*Math.sin(x/75);
   if(y>=nearY)c=rgbmix([46,169,207],[137,202,94],Math.pow(clamp((x-38)/434),1.15));
   if(y>326){
     const yy=y-328,center=357-.94*yy-.0016*yy*yy,width=5+.104*yy;
     if(x>=center-width&&x<=center+width)c=[255,255,255];
   }
 }
 const a=Math.atan2(y-256,x-256)*180/Math.PI;
 if(radius>=220&&radius<=240&&(a>=135||a<=31))
   c=rgbmix([9,133,190],[105,197,94],Math.pow(clamp((x-26)/460),1.1));
 return [c[0],c[1],c[2],255];
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
