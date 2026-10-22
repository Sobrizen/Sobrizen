/* Ergonomic presentation adapter. The established game rules remain unchanged. */
export const CONTROL_LABELS={up:'Haut',left:'Gauche',right:'Droite',down:'Bas',rotate:'Tourner',drop:'Déposer',undo:'Annuler'};
const PATHS={up:'M12 21V3m-8 8 8-8 8 8',down:'M12 3v18m-8-8 8 8 8-8',left:'M21 12H3m8-8-8 8 8 8',right:'M3 12h18m-8-8 8 8-8 8',rotate:'M20 9a8 8 0 1 0 0 7M20 3v6h-6',drop:'M12 2v14m-6-6 6 6 6-6M4 21h16',undo:'M9 5 3 11l6 6M3 11h10a7 7 0 0 1 7 7'};
export function controlIcon(action) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${PATHS[action]||PATHS.up}" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
export function controlFace(action,label=CONTROL_LABELS[action]) {
  return controlIcon(action)+`<span class="sz-key-label">${label}</span>`;
}
let installed=false;
export function initTouchControls() {
  if(installed)return; installed=true;
  let current=null, local=null;
  function enhance(root) {
    const pad=root.querySelector('#szControls');
    if(!pad || !['snake','blocks'].includes(root.dataset.game) || pad.dataset.ergonomic==='true' && pad.querySelector('.sz-key-label'))return;
    const buttons=Object.fromEntries([...pad.querySelectorAll('button[data-sz]')].map(b=>[b.dataset.sz,b]));
    if(!buttons.left)return;
    pad.dataset.ergonomic='true';
    Object.entries(buttons).forEach(([action,b])=>{
      b.innerHTML=controlFace(action,root.dataset.game==='blocks'&&action==='down'?'Descendre':CONTROL_LABELS[action]);
      b.classList.add('sz-thumb-key');
    });
    if(root.dataset.game==='blocks') {
      const move=document.createElement('div'), actions=document.createElement('div');
      move.className='sz-thumb-move';actions.className='sz-thumb-actions';
      move.append(buttons.left,buttons.right,buttons.down);actions.append(buttons.rotate,buttons.drop);
      pad.replaceChildren(move,actions);
      root.querySelector('#szHint').textContent='Maintiens ←, → ou ↓ pour répéter. Tourner et déposer sont séparés.';
    } else {
      root.querySelector('#szHint').textContent='Glisse sur le plateau ou touche les grandes flèches.';
    }
  }
  function attach(root){
    if(current===root)return;
    local?.abort();current=root;
    if(!root)return;
    local=new AbortController();const signal=local.signal;
    // Track each pressed finger independently; one released finger must not
    // cancel another finger's held movement in Blocs Zen.
    const fingers=new Map();let repeatOwner=null;
    const releaseVisual=id=>{const b=fingers.get(id);fingers.delete(id);if(b&&![...fingers.values()].includes(b))b.classList.remove('sz-key-pressed');};
    const clear=()=>{for(const b of fingers.values())b.classList.remove('sz-key-pressed');fingers.clear();repeatOwner=null;};
    root.addEventListener('pointerdown',e=>{
      const b=e.target.closest('.sz-thumb-key');if(!b||b.disabled||!root.querySelector('#szCover')?.hidden)return;
      b.classList.add('sz-key-pressed');fingers.set(e.pointerId,b);
      if(root.dataset.game==='blocks'&&['left','right','down'].includes(b.dataset.sz))repeatOwner=e.pointerId;
    },{capture:true,signal});
    const end=e=>{
      const wasKey=fingers.has(e.pointerId);releaseVisual(e.pointerId);
      if(wasKey&&repeatOwner!==null&&repeatOwner!==e.pointerId&&fingers.has(repeatOwner))e.stopImmediatePropagation();
      else if(repeatOwner===e.pointerId)repeatOwner=null;
    };
    root.addEventListener('pointerup',end,{capture:true,signal});
    root.addEventListener('pointercancel',end,{capture:true,signal});
    root.addEventListener('lostpointercapture',e=>releaseVisual(e.pointerId),{signal});
    root.addEventListener('contextmenu',e=>{if(e.target.closest('#szControls'))e.preventDefault();},{signal});
    root.addEventListener('click',e=>{if(e.target.closest('[data-sz="pause"],[data-sz="close"]'))clear();},{capture:true,signal});
    window.addEventListener('blur',clear,{signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();},{signal});
    enhance(root);
  }
  // Observe only dialog creation/removal and that dialog's control container.
  // Scores and animation frames never trigger a whole-page scan.
  let controlObserver=null;
  function scan(){
    const root=document.getElementById('szPlay');
    if(root===current)return;
    controlObserver?.disconnect();attach(root);
    if(root){controlObserver=new MutationObserver(()=>enhance(root));controlObserver.observe(root.querySelector('#szControls'),{childList:true});}
  }
  new MutationObserver(scan).observe(document.body,{childList:true});scan();
}
