/** Small, event-driven feedback layer. No loop, network or private-data storage. */
export function createExperience(win=window,doc=win.document){
 const motion=win.matchMedia('(prefers-reduced-motion: reduce)');
 let page=null,routeAnimation=null,dialogAnimation=null;
 function cancel(){routeAnimation?.cancel();dialogAnimation?.cancel();routeAnimation=dialogAnimation=null;}
 function animate(node,frames,duration){
  if(!node||doc.hidden||motion.matches||typeof node.animate!=='function')return null;
  const animation=node.animate(frames,{duration,easing:'cubic-bezier(.2,.7,.2,1)'});
  // No fill mode or permanent compositing layer remains after the transition.
  animation.finished?.catch(()=>{});return animation;
 }
 function rendered(next){
  if(next===page)return;
  page=next;routeAnimation?.cancel();
  routeAnimation=animate(doc.getElementById('content'),[{opacity:.8,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],160);
 }
 function dialogOpened(){dialogAnimation?.cancel();dialogAnimation=animate(doc.getElementById('modalContent'),[{opacity:.8,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],130);}
 function pending(form,busy){
  if(!form?.isConnected)return;
  if(busy){
   form.setAttribute('aria-busy','true');
   let status=form.querySelector('[data-experience-pending]');
   if(!status){status=doc.createElement('p');status.dataset.experiencePending='';status.className='exp-form-state';status.setAttribute('role','status');form.append(status);}
   status.textContent=form.id==='authForm'?'Connexion en cours…':'Enregistrement en cours…';status.hidden=false;
  }else{form.removeAttribute('aria-busy');const status=form.querySelector('[data-experience-pending]');if(status){status.textContent='';status.hidden=true;}}
 }
 function hidden(){if(doc.hidden)cancel();}
 function changed(){if(motion.matches)cancel();}
 doc.addEventListener('visibilitychange',hidden);motion.addEventListener('change',changed);
 return {rendered,dialogOpened,pending,reset(){cancel();page=null;},destroy(){cancel();doc.removeEventListener('visibilitychange',hidden);motion.removeEventListener('change',changed);}};
}
