/** Presentation only: exact values and estimate provenance are never rewritten. */
const SURFACES='.dy-focus,.dy-benefit,.dy-week,.dy-earned,.tl-achievements,.tl-all-progress,.tl-simple-metric,.tl-chart-stat,.tl-chart-savings,.hz-counter,.hz-wins';
const NUMBERS='.dy-counter strong,[data-health-clock-value],.tl-achievement-grid strong,.tl-chart-stat strong,.tl-chart-savings strong,.tl-simple-value';
const BARS='.dy-cap-fill,.tl-progress-track>div,.progress-track>div';
const MAX_ANIMATIONS=16,MAX_TARGETS=64;
export function createProgressMotion(root, win=window){
 if(!root)return {destroy(){}};
 const doc=root.ownerDocument,reduce=win.matchMedia?.('(prefers-reduced-motion: reduce)');
 const seen=new WeakSet(),waiting=new Map(),running=new Set(),recent=new Map();
 const controller=new win.AbortController(),signal=controller.signal;
 let frame=0,stopped=false,page=doc.body.dataset.page||'';
 const allowed=()=>!stopped&&!reduce?.matches&&doc.visibilityState!=='hidden'&&!root.closest('[hidden],[inert]');
 function animate(el,frames,options){
  // A dense dashboard stays readable immediately; extra items do not queue work.
  if(!allowed()||running.size>=MAX_ANIMATIONS||!el.isConnected||el.closest('[hidden],[inert]')||typeof el.animate!=='function')return;
  try{const a=el.animate(frames,{duration:440,easing:'cubic-bezier(.2,.75,.25,1)',...options});running.add(a);a.finished.then(()=>running.delete(a),()=>running.delete(a));}catch{/* static view stays fully readable */}
 }
 function stopAnimations(){for(const a of running){try{a.cancel();}catch{}}running.clear();}
 function remember(key,value){const previous=recent.get(key);recent.set(key,value);if(recent.size>100)recent.delete(recent.keys().next().value);return previous!==value;}
 const enter=(el,delay=0)=>animate(el,[{opacity:.35,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:460,delay});
 function chart(svg){
  const section=svg.closest('.tl-chart');
  const key='chart:'+(section?.id||'main');
  const paths=[...svg.querySelectorAll('.tl-chart-line')];
  const value=(svg.querySelector('title')?.textContent||'')+'|'+paths.map(p=>p.getAttribute('d')+'|'+p.classList.contains('is-estimate')).join(';');
  if(!remember(key,value))return;
  // One composited fade replaces per-path clipping and dozens of point effects.
  // SVG geometry, dash patterns and estimate provenance remain untouched.
  animate(svg,[{opacity:.45},{opacity:1}],{duration:440});
 }
 function reveal(el,kind,index){
  if(!allowed()||!el.isConnected)return;
  seen.add(el);
  const key=page+':'+kind+':'+index;
  if(kind==='chart'){chart(el);return;}
  // App screens can be rebuilt by a clock tick. Values must remain live without
  // replaying entrance effects on every new DOM node or counter increment.
  const signature=kind==='readout'?el.textContent:el.className;
  if(!remember(key,signature))return;
  if(kind==='bar'){
   // Real width/ARIA stay intact; scale is only a temporary visual entrance.
   animate(el,[{transform:'scaleX(0)',transformOrigin:'left center'},{transform:'scaleX(1)',transformOrigin:'left center'}],{duration:700});
  }else if(kind==='number')animate(el,[{opacity:.5,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:500,delay:70});
  else if(kind==='readout')animate(el,[{opacity:.5},{opacity:1}],{duration:180});
  else enter(el,Math.min(index*40,180));
 }
 const intersection=typeof win.IntersectionObserver==='function'?new win.IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.isIntersecting){const task=waiting.get(entry.target);waiting.delete(entry.target);intersection.unobserve(entry.target);if(task)reveal(entry.target,...task);}
 },{threshold:.06}):null;
 function scan(){
  frame=0;if(!allowed())return;
  const nextPage=doc.body.dataset.page||'';if(nextPage!==page){page=nextPage;recent.clear();stopAnimations();}
  for(const [el] of waiting)if(!el.isConnected){intersection?.unobserve(el);waiting.delete(el);}
  let targets=0;
  for(const [selector,kind] of [[SURFACES,'surface'],[NUMBERS,'number'],[BARS,'bar'],['.tl-chart-canvas svg','chart'],['.tl-chart-readout','readout']]){
   if(targets>=MAX_TARGETS)break;
   const elements=root.querySelectorAll(selector);
   for(let index=0;index<elements.length&&targets<MAX_TARGETS;index++){
    const el=elements[index];
    if(seen.has(el)||waiting.has(el)||el.closest('[hidden],[inert]'))continue;
    // A number inside a revealed card already moves with that card.
    if(kind==='number'&&el.closest(SURFACES))continue;
    targets++;
    if(intersection){waiting.set(el,[kind,index]);intersection.observe(el);}else reveal(el,kind,index);
   }
  }
 }
 function queue(){if(frame||!allowed())return;frame=win.requestAnimationFrame(scan);}
 const mutations=new win.MutationObserver(records=>{
  // Ignore clock text ticks and our own animation internals; react to rendered content.
  if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1)||[...r.removedNodes].some(n=>n.nodeType===1)))queue();
 });
 mutations.observe(root,{childList:true,subtree:true});
 root.addEventListener('toggle',queue,{capture:true,signal});
 reduce?.addEventListener?.('change',()=>{if(reduce.matches){stopAnimations();intersection?.disconnect();waiting.clear();if(frame)win.cancelAnimationFrame(frame);frame=0;}else queue();},{signal});
 doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='hidden'){stopAnimations();if(frame)win.cancelAnimationFrame(frame);frame=0;}else queue();},{signal});
 win.addEventListener('pagehide',stopAnimations,{signal});win.addEventListener('pageshow',queue,{signal});queue();
 return {destroy(){stopped=true;controller.abort();mutations.disconnect();intersection?.disconnect();waiting.clear();recent.clear();stopAnimations();if(frame)win.cancelAnimationFrame(frame);}};
}
if(typeof document!=='undefined'&&typeof window!=='undefined')createProgressMotion(document.getElementById('content'),window);
