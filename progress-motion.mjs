/** Presentation only: exact values and estimate provenance are never rewritten. */
const SURFACES='.dy-focus,.dy-benefit,.dy-week,.dy-earned,.tl-achievements,.tl-all-progress,.tl-simple-metric,.tl-chart-stat,.tl-chart-savings,.hz-counter,.hz-wins';
const NUMBERS='.dy-counter strong,[data-health-clock-value],.tl-achievement-grid strong,.tl-chart-stat strong,.tl-chart-savings strong,.tl-simple-value';
const BARS='.dy-cap-fill,.tl-progress-track>div,.progress-track>div';
export function createProgressMotion(root, win=window){
 if(!root)return {destroy(){}};
 const doc=root.ownerDocument,reduce=win.matchMedia?.('(prefers-reduced-motion: reduce)');
 const seen=new WeakSet(),waiting=new Map(),running=new Set(),recent=new Map();
 const controller=new win.AbortController(),signal=controller.signal;
 let frame=0,stopped=false,page=doc.body.dataset.page||'';
 const allowed=()=>!stopped&&!reduce?.matches&&doc.visibilityState!=='hidden';
 function animate(el,frames,options){
  if(!allowed()||!el.isConnected||typeof el.animate!=='function')return;
  try{const a=el.animate(frames,{duration:440,easing:'cubic-bezier(.2,.75,.25,1)',...options});running.add(a);a.finished.then(()=>running.delete(a),()=>running.delete(a));}catch{/* static view stays fully readable */}
 }
 function stopAnimations(){for(const a of running){try{a.cancel();}catch{}}running.clear();}
 function remember(key,value){const previous=recent.get(key);recent.set(key,value);if(recent.size>100)recent.delete(recent.keys().next().value);return previous!==value;}
 const enter=(el,delay=0)=>animate(el,[{opacity:.35,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:460,delay});
 function signature(el){return [el.className,el.textContent?.trim().replace(/\s+/g,' ').slice(0,600)].join('|');}
 function chart(svg){
  const section=svg.closest('.tl-chart');
  const key='chart:'+(section?.id||'main');
  const paths=[...svg.querySelectorAll('.tl-chart-line')];
  const value=(svg.querySelector('title')?.textContent||'')+'|'+paths.map(p=>p.getAttribute('d')+'|'+p.classList.contains('is-estimate')).join(';');
  if(!remember(key,value))return;
  // Reveal solid and dashed paths by clipping; never replace their dash patterns.
  for(const line of svg.querySelectorAll('.tl-chart-line,.tl-chart-line-outline')){
   animate(line,[{clipPath:'inset(-6px 100% -6px -6px)'},{clipPath:'inset(-6px -6px -6px -6px)'}],{duration:680});
  }
  const dots=[...svg.querySelectorAll('.tl-chart-dot')];
  if(dots.length<=60)dots.forEach((dot,i)=>animate(dot,[{opacity:0},{opacity:1}],{duration:260,delay:Math.min(i*10,160)+100}));
  for(const band of svg.querySelectorAll('.tl-chart-stop-band'))animate(band,[{opacity:0},{opacity:1}],{duration:560});
 }
 function reveal(el,kind,index){
  if(!allowed()||!el.isConnected)return;
  seen.add(el);
  const key=page+':'+kind+':'+index;
  if(kind==='chart'){chart(el);return;}
  if(!remember(key,signature(el)))return;
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
  for(const [selector,kind] of [[SURFACES,'surface'],[NUMBERS,'number'],[BARS,'bar'],['.tl-chart-canvas svg','chart'],['.tl-chart-readout','readout']]){
   [...root.querySelectorAll(selector)].slice(0,70).forEach((el,index)=>{
    if(seen.has(el)||waiting.has(el)||el.closest('[hidden]'))return;
    if(intersection){waiting.set(el,[kind,index]);intersection.observe(el);}else reveal(el,kind,index);
   });
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
