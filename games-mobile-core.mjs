/* Input and layout helpers, independent of the DOM. */
export class HeldControls {
  constructor(){this.keys=new Map();this.order=0;}
  press(id,action,time){this.keys.set(id,{action,next:time+220,order:++this.order});}
  release(id){this.keys.delete(id);}
  clear(){this.keys.clear();}
  due(time){
    const active=[...this.keys.values()];
    const horizontal=active.filter(x=>x.action==='left'||x.action==='right').sort((a,b)=>b.order-a.order)[0];
    const vertical=active.filter(x=>x.action==='down').sort((a,b)=>b.order-a.order)[0];
    return [horizontal,vertical].filter(x=>x&&time>=x.next).map(x=>{x.next=time+(x.action==='down'?55:85);return x.action;});
  }
}
export function fitBoard(width,height,ratio,max=900){
  const h=Math.max(1,Math.min(height,width/ratio,max));return {width:h*ratio,height:h};
}
export function memoryGrid(count,width,height){
  let best={columns:2,rows:Math.ceil(count/2),score:0};
  for(let columns=2;columns<=Math.min(8,count);columns++){
    const rows=Math.ceil(count/columns),w=(width-(columns-1)*8)/columns,h=(height-(rows-1)*8)/rows;
    const score=Math.min(w,h)*(count/(columns*rows));
    if(score>best.score)best={columns,rows,score};
  }return best;
}
export function boundedTarget(width,height,size,rx=Math.random(),ry=Math.random()){
  const box=Math.max(1,Math.min(size,width-12,height-12));
  return {size:box,x:6+Math.max(0,width-box-12)*Math.min(1,Math.max(0,rx)),y:6+Math.max(0,height-box-12)*Math.min(1,Math.max(0,ry))};
}
