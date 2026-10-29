import {PHOTO_BUCKET,MAX_PHOTO_BYTES,validPhotoPath,photoMarkup,photoSignature,prepareProfilePhoto,persistProfilePhoto,removeUnusedProfilePhoto} from './profile-photo-core.mjs';

/** Profile pictures are member-visible, unlike private journal attachments. */
export function createProfilePhotos({S,getClient,sessionContext,sameSession,assertSession,modal,closeModal,notify}){
  const cache=new Map(),pending=new Map();let draft=null,demoPhoto=null,epoch=0;
  const $=selector=>document.querySelector(selector);
  const checked=result=>{if(result.error)throw result.error;return result.data;};
  const valid=context=>!!S.user&&sameSession(context);
  const active=d=>draft===d&&valid(d.context)&&d.form.isConnected;
  function releaseDraft(){if(draft){draft.sequence++;if(draft.url)URL.revokeObjectURL(draft.url);draft=null;}}
  function reset(){
    epoch++;releaseDraft();for(const item of cache.values())URL.revokeObjectURL(item.url);cache.clear();pending.clear();
    if(demoPhoto)URL.revokeObjectURL(demoPhoto.url);demoPhoto=null;
    for(const slot of document.querySelectorAll('.sz-profile-photo')){slot.querySelector('img')?.remove();slot.classList.remove('has-photo');}
  }
  function cachePhoto(path,blob){
    const old=cache.get(path);if(old)URL.revokeObjectURL(old.url);
    const item={blob,url:URL.createObjectURL(blob)};cache.set(path,item);return item;
  }
  async function loadPhoto(path,owner,context){
    assertSession(context);if(!validPhotoPath(path,owner))return null;
    if(cache.has(path))return cache.get(path);if(pending.has(path))return pending.get(path);
    const version=epoch;
    const request=(async()=>{
      const db=await getClient();assertSession(context);
      const blob=checked(await db.storage.from(PHOTO_BUCKET).download(path));assertSession(context);
      if(epoch!==version)return null;
      if(!blob?.size||blob.size>MAX_PHOTO_BYTES||photoSignature(new Uint8Array(await blob.slice(0,12).arrayBuffer()))!=='image/jpeg')return null;
      assertSession(context);if(epoch!==version)return null;return cachePhoto(path,blob);
    })();pending.set(path,request);
    try{return await request;}finally{if(pending.get(path)===request)pending.delete(path);}
  }
  async function fillSlot(slot){
    if(!S.user||!slot.isConnected)return;
    const context=sessionContext(),owner=slot.dataset.photoOwner;
    const own=owner===context.user.id,path=own?(S.profile.avatar_path||''):slot.dataset.photoPath;
    const key=context.demo&&own&&demoPhoto?'demo-photo':path;
    if(slot.dataset.photoLoaded===key&&slot.querySelector('img'))return;
    if(slot.dataset.photoLoading===key&&key)return;
    slot.dataset.photoLoading=key;
    try{
      const item=context.demo?(own?demoPhoto:null):await loadPhoto(path,owner,context);
      if(!item||!valid(context)||!slot.isConnected||slot.dataset.photoLoading!==key)return;
      if(own&&(context.demo?demoPhoto!==item:(S.profile.avatar_path||'')!==path))return;
      const img=document.createElement('img');img.alt='';img.decoding='async';img.src=item.url;
      img.addEventListener('error',()=>{img.remove();slot.classList.remove('has-photo');},{once:true});
      slot.querySelector('img')?.remove();slot.append(img);slot.classList.add('has-photo');slot.dataset.photoLoaded=key;
    }catch{/* Keep the initial if an avatar cannot be read. No post is hidden. */}
    finally{if(slot.dataset.photoLoading===key)delete slot.dataset.photoLoading;}
  }
  function hydrate(root=document){
    if(root.matches?.('[data-photo-owner]'))void fillSlot(root);
    root.querySelectorAll?.('[data-photo-owner]').forEach(slot=>void fillSlot(slot));
  }
  const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)hydrate(node);});
  for(const root of [$('#content'),$('#modalContent')])if(root)observer.observe(root,{childList:true,subtree:true});
  function header(){
    const target=$('#avatar');if(!target||!S.user)return;
    target.classList.add('sz-photo-header');target.innerHTML=photoMarkup(S.profile,S.user.id);hydrate(target);
  }
  function panel(){
    const has=!!S.profile.avatar_path||!!demoPhoto;
    return `<section class="sz-photo-panel" data-profile-photo-panel aria-label="Ma photo de profil"><div class="sz-photo-panel-avatar">${photoMarkup(S.profile,S.user.id)}</div><div class="sz-photo-panel-copy"><strong>Ma photo de profil</strong><p>Facultative · visible par les membres</p><button type="button" class="secondary" data-photo-edit>${has?'Changer ma photo':'Ajouter une photo'}</button></div></section>`;
  }
  function sync(){
    const container=$('[data-profile-photo-panel]');if(container){const template=document.createElement('template');template.innerHTML=panel();container.replaceWith(template.content);}
    for(const post of S.posts||[])if(post.author_id===S.user.id&&post.profiles)post.profiles.avatar_path=S.profile.avatar_path||null;
    for(const comments of Object.values(S.comments||{}))for(const comment of comments)if(comment.author_id===S.user.id&&comment.profiles)comment.profiles.avatar_path=S.profile.avatar_path||null;
    // Refresh only avatar slots: do not discard unsaved profile text or another form.
    for(const slot of document.querySelectorAll('[data-photo-owner]'))if(slot.dataset.photoOwner===S.user.id){slot.querySelector('img')?.remove();slot.classList.remove('has-photo');delete slot.dataset.photoLoaded;delete slot.dataset.photoLoading;}
    header();hydrate();
  }
  function status(d,text,error=false){
    if(!active(d))return;const output=d.form.querySelector('[data-photo-status]');
    output.textContent=text;output.classList.toggle('is-error',error);output.setAttribute('role',error?'alert':'status');
    d.form.elements.photo.setAttribute('aria-invalid',String(error));
  }
  function buttons(d){
    if(!active(d))return;
    d.form.elements.photo.disabled=d.busy||!!d.attempt.writeStarted;
    d.form.querySelector('[data-photo-remove]').disabled=d.busy||!!d.attempt.writeStarted;
    const save=d.form.querySelector('[type="submit"]');save.disabled=d.busy||d.processing||d.invalid||!d.changed;
    save.textContent=d.busy?'Enregistrement…':d.attempt.writeStarted?'Vérifier l’enregistrement':d.remove?'Enregistrer le retrait':'Enregistrer la photo';
    save.setAttribute('aria-busy',String(d.busy));
  }
  function preview(d){
    if(!active(d))return;const target=d.form.querySelector('[data-photo-preview]');target.replaceChildren();
    if(d.url&&!d.remove){const img=document.createElement('img');img.src=d.url;img.alt='Aperçu de ma photo de profil';target.append(img);}
    else {target.innerHTML=photoMarkup(d.remove?{display_name:S.profile.display_name}:S.profile,d.remove?'':S.user.id);if(!d.remove)hydrate(target);}
  }
  async function choose(d,file){
    if(!active(d)||d.busy||d.attempt.writeStarted)return;
    const seq=++d.sequence;d.processing=true;buttons(d);status(d,'Préparation de la photo…');
    try{
      const blob=await prepareProfilePhoto(file);if(!active(d)||seq!==d.sequence)return;
      if(d.url)URL.revokeObjectURL(d.url);
      d.blob=blob;d.url=URL.createObjectURL(blob);d.remove=false;d.changed=true;d.invalid=false;d.attempt={};preview(d);
      status(d,'Photo prête. Vérifie l’aperçu puis enregistre.');
    }catch(error){if(active(d)&&seq===d.sequence){d.form.elements.photo.value='';d.invalid=true;status(d,error.message,true);}}
    finally{if(active(d)&&seq===d.sequence){d.processing=false;buttons(d);}}
  }
  function open(){
    if(!S.user)return;const context=sessionContext();assertSession(context);releaseDraft();
    const has=!!S.profile.avatar_path||!!demoPhoto;
    modal('Ma photo de profil',`<form id="profilePhotoForm" class="sz-photo-form" novalidate>
      <p>Ta photo sera visible dans la communauté et les commentaires. Tu peux garder ton initiale à la place.</p>
      <div class="sz-photo-preview" data-photo-preview></div>
      <label class="sz-photo-picker">Choisir une photo<input type="file" name="photo" accept="image/jpeg,image/png,image/webp" aria-label="Choisir une photo de profil" aria-describedby="profilePhotoHelp profilePhotoStatus"></label>
      <p id="profilePhotoHelp" class="small">JPG, PNG ou WebP · 10 Mo maximum.<br>L’image est centrée et allégée automatiquement.</p>
      <button type="button" class="text" data-photo-remove ${has?'':'hidden'}>Retirer ma photo</button>
      ${context.demo?'<p class="sz-photo-demo">Mode démo : aucune photo n’est envoyée en ligne.</p>':''}
      <p id="profilePhotoStatus" data-photo-status role="status" aria-live="polite"></p>
      <button type="submit" class="primary full" disabled>Enregistrer la photo</button>
      <button type="button" class="text full" data-action="close">Annuler</button>
    </form>`);
    const form=$('#profilePhotoForm');
    const d=draft={form,context,originalPath:S.profile.avatar_path||null,blob:null,url:'',remove:false,changed:false,processing:false,busy:false,sequence:0,attempt:{}};
    preview(d);
    form.elements.photo.addEventListener('change',event=>{const file=event.target.files?.[0];if(file)void choose(d,file);});
    form.querySelector('[data-photo-remove]').addEventListener('click',()=>{
      if(!active(d)||d.busy||d.attempt.writeStarted)return;
      d.sequence++;d.processing=false;d.remove=true;d.changed=true;d.invalid=false;d.blob=null;d.attempt={};
      if(d.url)URL.revokeObjectURL(d.url);d.url='';form.elements.photo.value='';preview(d);buttons(d);
      status(d,'Ton initiale remplacera la photo après enregistrement.');
    });
    form.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();void save(d);},true);
  }
  async function save(d){
    if(!active(d)||d.busy||d.processing||d.invalid||!d.changed)return;
    d.busy=true;buttons(d);status(d,'Enregistrement de ta photo…');
    const context=d.context;let db,result,cleanup=true;
    const assertActive=()=>{assertSession(context);};
    try{
      assertActive();
      if(context.demo){
        if(demoPhoto)URL.revokeObjectURL(demoPhoto.url);demoPhoto=d.remove?null:{blob:d.blob,url:URL.createObjectURL(d.blob)};
        result={path:null};
      }else{
        if(!navigator.onLine)throw Error('Hors connexion. Reconnecte-toi puis réessaie ; ton aperçu est conservé.');
        db=await getClient();assertActive();
        result=await persistProfilePhoto({db,uid:context.user.id,originalPath:d.originalPath,blob:d.remove?null:d.blob,attempt:d.attempt,assertActive});assertActive();
        if(d.blob&&result.path)cachePhoto(result.path,d.blob);
      }
      assertActive();S.profile={...S.profile,avatar_path:result.path};sync();
      if(active(d))closeModal();
      if(db&&d.originalPath&&d.originalPath!==result.path)cleanup=await removeUnusedProfilePhoto({db,path:d.originalPath,uid:context.user.id,assertActive});
      if(!valid(context))return;
      if(d.originalPath&&d.originalPath!==result.path){const old=cache.get(d.originalPath);if(old)URL.revokeObjectURL(old.url);cache.delete(d.originalPath);}
      notify(context.demo?'Photo mise à jour dans la démonstration, sans envoi en ligne.':!cleanup?'Photo mise à jour. Le nettoyage de l’ancien fichier reste à confirmer.':d.remove?'Photo retirée. Ton initiale est de nouveau affichée.':'Photo de profil enregistrée.');
    }catch(error){
      if(!active(d))return;
      status(d,error.message||'La photo n’a pas pu être enregistrée. Ton aperçu est conservé : réessaie.',true);
      d.busy=false;buttons(d);
    }
  }
  document.addEventListener('click',event=>{if(event.target.closest?.('[data-photo-edit]')){event.preventDefault();try{open();}catch{notify('Rouvre ton profil pour modifier ta photo.');}}});
  $('#modal')?.addEventListener('close',()=>{if(!$('#modal').open)releaseDraft();});
  const modalContent=$('#modalContent');if(modalContent)new MutationObserver(()=>{if(draft&&!draft.form.isConnected)releaseDraft();}).observe(modalContent,{childList:true});
  return {panel,header,hydrate,reset,open};
}
