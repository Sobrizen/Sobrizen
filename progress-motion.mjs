/* Progressive enhancement: respectful, view-scoped motion on exact progress measurements. */
const root=document.getElementById('content');
const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
const seen=new WeakSet();
let observer;
function decorate(node){
 if(reduce.matches||seen.has(node)||!node.isConnected)return;
 seen.add(node);
 node.classList.add('is-motion-ready');
 if(node.classList.contains('tl-chart')){
  const points=node.querySelectorAll('.tl-chart-point');
  points.forEach((point,i)=>point.style.setProperty('--sz-delay',Math.min(i*24,240)+'ms'));
  // SVG path animation is deliberately limited to measured, solid paths;
  // estimated dashed lines must retain their dashed provenance styling.
  const lines=node.querySelectorAll('.tl-chart-line:not(.is-estimate)');
  if(lines.length<=36)for(const line of lines){
   try{
    const length=line.getTotalLength();
    if(!Number.isFinite(length)||length<1)continue;
    line.animate([{strokeDasharray:length+' '+length,strokeDashoffset:length},{strokeDasharray:length+' '+length,strokeDashoffset:0}],{duration:620,easing:'ease-out'});
   }catch{/* unsupported SVG animation: the static chart remains correct */}
  }
 }else{
  node.querySelectorAll('.tl-achievement-grid>div').forEach((el,i)=>el.style.setProperty('--sz-delay',Math.min(i*75,225)+'ms'));
 }
}
function scan(){
 if(!root||reduce.matches)return;
 for(const el of root.querySelectorAll('.tl-chart,.tl-achievements')){
  if(seen.has(el))continue;
  if('IntersectionObserver' in window){observer.observe(el);}
  else decorate(el);
 }
}
if(root){
 if('IntersectionObserver' in window)observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);decorate(entry.target);}}, {threshold:.08});
 const mutations=new MutationObserver(()=>scan());
 mutations.observe(root,{childList:true,subtree:true});
 reduce.addEventListener?.('change',()=>{if(reduce.matches){observer?.disconnect();root.querySelectorAll('.is-motion-ready').forEach(el=>el.classList.remove('is-motion-ready'));}else scan();});
 scan();
}
