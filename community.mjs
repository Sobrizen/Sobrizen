import {EMOTIONS,DURATIONS,KINDS,SORTS,PAGE_SIZE,BUCKET,MAX_SOURCE_BYTES,MAX_IMAGE_BYTES,esc,label,emptyFilters,normalizeFilters,validatePost,matchesPost,comparePosts,feedQuery,validImagePath,imageSignature} from './community-core.mjs';

const COLUMNS='id,author_id,kind,body,emotion,abstinence_days,image_path,image_alt,created_at,updated_at,profiles!posts_author_id_fkey(display_name,username),post_likes(count),comments(count)';
const select=(name,title,options,value,extra='')=>`<label>${esc(title)}<select name="${esc(name)}" ${extra}>${options.map(([v,t])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
const displayDate=value=>{const date=new Date(value);return Number.isFinite(date.valueOf())?date.toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}):'';};
const safeSignedURL=value=>{try{const u=new URL(value);return u.protocol==='https:'&&u.host==='lnvtowdbbagwfbewnchz.supabase.co'&&u.pathname.startsWith('/storage/v1/object/sign/community-images/')?u.href:'';}catch{return '';}};

/** Re-encode locally: no original filename, EXIF or GPS metadata is uploaded. */
export async function prepareImage(file){
  if(!file || !file.size)throw Error('Choisis une image non vide.');
  if(file.size>MAX_SOURCE_BYTES)throw Error('Choisis une image de 10 Mo maximum.');
  const signature=imageSignature(new Uint8Array(await file.slice(0,12).arrayBuffer()));
  if(!signature)throw Error('Formats acceptés : JPEG, PNG ou WebP.');
  const url=URL.createObjectURL(file), image=new Image();
  try{
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{image.onload=null;image.onerror=null;image.src='';reject(Error('Lecture de l’image trop lente. Essaie une image plus petite.'));},15000);
      image.onload=()=>{clearTimeout(timer);resolve();};
      image.onerror=()=>{clearTimeout(timer);reject(Error('Cette image est illisible. Essaie une autre photo.'));};
      image.src=url;
    });
    const w=image.naturalWidth,h=image.naturalHeight;
    if(!w||!h||w*h>40000000)throw Error('Cette image est trop grande. Choisis une version de moins de 40 mégapixels.');
    const ratio=Math.min(1,1600/Math.max(w,h));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*ratio));canvas.height=Math.max(1,Math.round(h*ratio));
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Ton navigateur ne peut pas préparer cette image.');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    for(const quality of [0.86,0.74,0.60]){
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      if(blob&&blob.type==='image/jpeg'&&blob.size>0&&blob.size<=MAX_IMAGE_BYTES)return blob;
    }
    throw Error('L’image reste trop lourde. Essaie une photo plus petite.');
  }finally{URL.revokeObjectURL(url);image.onload=null;image.onerror=null;}
}

/** Native app integration; no second auth client and no access to private tracking. */
export function createCommunity({S,getClient,checkResult,notify,message,modal,closeModal,render,greeting,sessionContext,sameSession,assertSession}){
  let filters=emptyFilters(),contextSeen=null,revision=0,loading=false,feedError='',draft=null,demoPool=[];
  const demoURLs=new Set();
  if(!document.querySelector('link[data-community-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/community.css';link.dataset.communityStyle='';document.head.append(link);}
  function releaseDraft(){if(draft){draft.sequence++;if(draft.previewURL)URL.revokeObjectURL(draft.previewURL);draft=null;}}
  function reset(){revision++;filters=emptyFilters();loading=false;feedError='';releaseDraft();demoURLs.forEach(url=>URL.revokeObjectURL(url));demoURLs.clear();demoPool=[];contextSeen=null;}
  function ensure(){const context=sessionContext();if(!contextSeen||!sameSession(contextSeen)){reset();contextSeen=context;}return context;}
  function active(context,token){return sameSession(context)&&revision===token;}
  const inCommunity=()=>S.user&&S.page==='community';
  function seedDemo(){
    if(demoPool.length||S.demoFeedSeeded)return;
    const now=Date.now();
    demoPool=[
      ['camille','Camille',45,'pride','victory','Exemple fictif : 45 jours sans alcool. Je retrouve du temps pour mes balades.'],
      ['sam','Sam',4,'hope','share','Exemple fictif : je débute et je prends les choses un jour à la fois.'],
      ['lou','Lou',180,'calm','share','Exemple fictif : une soirée tranquille et un peu de lecture.'],
      ['alex','Alex',null,'stress','question','Exemple fictif : comment préparez-vous une soirée difficile ?']
    ].map(([id,name,days,emotion,kind,body],i)=>({id:'demo-community-'+id,author_id:'demo-'+id,body,kind,emotion,abstinence_days:days,image_path:null,image_alt:null,created_at:new Date(now-i*3600000).toISOString(),profiles:{display_name:name+' · Démo',username:id+'_demo'},post_likes:[{count:i}],comments:[{count:0}]}));
    S.demoFeedSeeded=true;
  }
  async function loadFeed(append=false){
    const context=ensure();assertSession(context);const token=++revision,page=S.feedPage||0;
    const snapshot={filters:{...filters},kind:S.feedKind,search:S.feedSearch,hidden:[...(S.settings.hidden_authors||[])],page};
    loading=true;feedError='';
    try{
      if(context.demo){seedDemo();S.posts=demoPool;S.morePosts=false;return true;}
      const db=await getClient();if(!active(context,token))return false;
      const rows=checkResult(await feedQuery(db.from('posts').select(COLUMNS),snapshot))||[];
      if(!active(context,token))return false;
      const liked=rows.length?checkResult(await db.from('post_likes').select('post_id').eq('user_id',context.user.id).in('post_id',rows.map(p=>p.id))):[];
      if(!active(context,token))return false;
      const paths=[...new Set(rows.filter(p=>validImagePath(p.image_path,p.author_id)).map(p=>p.image_path))];
      let urls=new Map();
      if(paths.length){
        try{
          const signed=checkResult(await db.storage.from(BUCKET).createSignedUrls(paths,600));
          urls=new Map((signed||[]).map(item=>[item.path,safeSignedURL(item.signedUrl)]));
        }catch{/* Text remains available when an image cannot be retrieved. */}
      }
      if(!active(context,token))return false;
      rows.forEach(p=>{p.image_url=urls.get(p.image_path)||'';});
      if(!append)S.likes=new Set();(liked||[]).forEach(row=>S.likes.add(row.post_id));
      S.posts=append?[...new Map([...S.posts,...rows].map(p=>[p.id,p])).values()]:rows;
      S.morePosts=rows.length===PAGE_SIZE;
      return true;
    }catch(error){
      if(active(context,token)){feedError='Le fil n’a pas pu être chargé. '+message(error);if(!append){S.posts=[];S.morePosts=false;}else{S.feedPage=Math.max(0,page-1);}loading=false;if(inCommunity())render();}
      throw error;
    }finally{if(active(context,token))loading=false;}
  }
  function filteredRows(){return S.posts.filter(p=>matchesPost(p,filters,S.feedKind,S.feedSearch,S.settings.hidden_authors||[])).sort((a,b)=>comparePosts(a,b,filters.sort));}
  function postList(){
    ensure();const rows=filteredRows();
    if(!rows.length)return `<article class="card community-empty">${loading?'Chargement des publications…':'Aucune publication avec ces filtres.'}<br><button class="text" type="button" data-community-reset>Afficher tous les messages</button></article>`;
    return rows.map(p=>{
      const own=p.author_id===S.user.id,hasImage=!!p.image_path||!!(S.demo&&p.image_url),days=p.abstinence_days;
      const photo=hasImage?`<button type="button" class="community-image-button" data-community-image="${esc(p.id)}" aria-label="Ouvrir l’image jointe">${p.image_url?`<img class="community-image" src="${esc(p.image_url)}" alt="${esc(p.image_alt||'Image partagée par '+(p.profiles?.display_name||'un membre'))}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:'<span class="small">Afficher l’image</span>'}</button>`:'';
      return `<article class="card community-post"><div class="post-top"><div class="row"><span class="avatar" aria-hidden="true">${esc((p.profiles?.display_name||'M').slice(0,1))}</span><div><b>${esc(p.profiles?.display_name||'Membre')}</b><div class="small">@${esc(p.profiles?.username||'membre')} · ${esc(displayDate(p.created_at))}</div></div></div><span class="tag">${esc(label(KINDS,p.kind,'Partage'))}</span></div>
      <div class="community-tags">${p.emotion?`<span class="tag">${esc(label(EMOTIONS,p.emotion))}</span>`:''}${days!=null?`<span class="tag">${days===0?'Moins d’un jour':esc(days)+' jour'+(days>1?'s':'')} sans alcool · au partage</span>`:''}</div>
      <div class="community-body ${hasImage?'has-image':''}"><p class="entry-body">${esc(p.body)}</p>${photo}</div>
      <div class="post-actions"><button class="secondary" data-action="like" data-id="${esc(p.id)}" aria-pressed="${S.likes.has(p.id)}" aria-label="Soutenir cette publication">${S.likes.has(p.id)?'♥':'♡'} ${Number(p.post_likes?.[0]?.count)||0}</button><button class="secondary" data-action="comments" data-id="${esc(p.id)}">Commentaires (${Number(p.comments?.[0]?.count)||0})</button>${own?`<button class="text" data-action="post-edit" data-id="${esc(p.id)}">Modifier</button><button class="text" data-action="post-delete" data-id="${esc(p.id)}">Supprimer</button>`:`<button class="text" data-action="report" data-id="${esc(p.id)}">Signaler</button><button class="text" data-action="hide-author" data-id="${esc(p.author_id)}">Masquer pour moi</button>`}</div></article>`;
    }).join('');
  }
  function view(){
    ensure();return greeting('Les échanges qui te parlent.','Trouve du soutien selon ton ressenti et ton étape du parcours.')+`<div class="row between"><button class="primary" data-action="post-new">+ Partager</button><button class="text" data-action="feed-refresh">Actualiser</button></div>
    <section class="community-controls" aria-label="Filtrer les publications"><div class="community-selects">
    ${select('duration','Durée sans alcool',DURATIONS,filters.duration,'data-community-filter="duration"')}
    ${select('emotion','Émotion',[['all','Toutes les émotions'],...EMOTIONS,['unset','Émotion non partagée']],filters.emotion,'data-community-filter="emotion"')}
    ${select('sort','Trier par',SORTS,filters.sort,'data-community-filter="sort"')}</div>
    <form id="feedSearchForm" class="community-search"><label>Rechercher<input name="search" value="${esc(S.feedSearch)}" maxlength="80" type="search" placeholder="Un mot dans le message…"></label><button class="secondary">Chercher</button><button class="text" type="button" data-community-reset>Réinitialiser</button></form>
    <p class="small community-hint">Durée déclarée au moment du partage, pas un classement des personnes. Les filtres se combinent.</p></section>
    <div class="filters" aria-label="Type de publication">${[['all','Tout'],...KINDS].map(([key,title])=>`<button class="${S.feedKind===key?'selected':''}" data-action="feed-kind" data-kind="${key}" aria-pressed="${S.feedKind===key}">${esc(title)}</button>`).join('')}</div>
    ${feedError?`<p class="error-box" role="alert">${esc(feedError)}</p>`:''}<div class="posts" aria-busy="${loading}">${postList()}</div>
    ${S.morePosts?'<button class="secondary full" data-action="feed-more">Afficher la suite</button>':''}
    <p class="small community-hint">Échanges entre membres, sans suivi médical ni surveillance d’urgence. Les signalements concernent aussi les images et sont examinés manuellement.</p>`;
  }
  function draftCurrent(d){return draft===d&&document.contains(d.form)&&sameSession(d.context);}
  function status(d,text){if(draftCurrent(d))d.form.querySelector('[data-community-status]').textContent=text;}
  function updatePreview(d){
    if(!draftCurrent(d))return;
    const image=d.form.querySelector('[data-community-preview]'),url=d.previewURL||(!d.removeImage?d.original.image_url:'')||'';
    image.hidden=!url;if(url)image.src=url;else image.removeAttribute('src');
    d.form.querySelector('[data-community-remove]').hidden=!(url||(!d.removeImage&&d.original.image_path));
    d.form.querySelector('[name="image_alt"]').closest('label').hidden=!(url||(!d.removeImage&&d.original.image_path));
  }
  async function chooseImage(d,file){
    if(!draftCurrent(d))return;
    const token=++d.sequence;d.processing=true;d.form.querySelector('[type="submit"]').disabled=true;status(d,'Préparation de l’image…');
    try{
      const blob=await prepareImage(file);
      if(!draftCurrent(d)||d.sequence!==token)return;
      if(d.previewURL)URL.revokeObjectURL(d.previewURL);
      d.blob=blob;d.previewURL=URL.createObjectURL(blob);d.removeImage=false;updatePreview(d);status(d,'Image prête. Elle sera envoyée uniquement avec la publication.');
    }catch(error){if(draftCurrent(d)&&d.sequence===token){d.form.querySelector('[name="image"]').value='';status(d,message(error));}}
    finally{if(draftCurrent(d)&&d.sequence===token){d.processing=false;d.form.querySelector('[type="submit"]').disabled=false;}}
  }
  function openPost(id){
    const context=ensure();assertSession(context);releaseDraft();
    const p=id?S.posts.find(x=>x.id===id):{};
    if(!p||(id&&p.author_id!==context.user.id))throw Error('Cette publication ne peut pas être modifiée.');
    modal(id?'Modifier ma publication':'Partager avec les membres',`<p class="small">Ton message et les options choisies seront visibles par les membres. Ton suivi privé reste séparé.</p>
    <form id="communityPostForm" class="community-composer">
    <div class="two-fields">${select('kind','Type',KINDS,p.kind||'share')}${select('emotion','Mon émotion · facultatif',[['','Ne pas préciser'],...EMOTIONS],p.emotion||'')}</div>
    <label>Mon message<textarea name="body" rows="4" maxlength="2000" required placeholder="Un ressenti, une victoire, une question…">${esc(p.body||'')}</textarea></label>
    <label>Jours consécutifs sans alcool au partage · facultatif<input name="abstinence_days" type="number" inputmode="numeric" min="0" max="50000" step="1" value="${esc(p.abstinence_days??'')}" placeholder="Laisser vide pour ne pas partager" aria-describedby="communityDurationHelp"></label>
    <p id="communityDurationHelp" class="small">Durée que tu choisis de déclarer${id?' pour la date du message d’origine':''}. Aucun chiffre n’est repris automatiquement de ton suivi privé.</p>
    <div class="community-image-panel"><label>Ajouter une image · facultatif<input name="image" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="communityImageHelp"></label><p id="communityImageHelp" class="small">1 image, JPEG / PNG / WebP, 10 Mo maximum. Évite les informations personnelles et les photos d’autrui sans leur accord.</p>
    <img class="community-preview" data-community-preview alt="Aperçu de l’image jointe" hidden><button class="text" type="button" data-community-remove hidden>Retirer l’image</button>
    <label hidden>Décrire l’image · facultatif<input name="image_alt" maxlength="180" value="${esc(p.image_alt||'')}" placeholder="Une courte description accessible"></label></div>
    <label class="checklabel"><input name="share_consent" type="checkbox" required> Je choisis de partager ce message, ainsi que l’émotion, la durée et l’image que j’ai ajoutées, avec les membres.</label>
    <p class="community-inline-status small" data-community-status role="status" aria-live="polite"></p>
    <button type="submit" class="primary full">${id?'Enregistrer les modifications':'Publier'}</button></form>`);
    const form=document.getElementById('communityPostForm');
    const d=draft={form,context,id:id||crypto.randomUUID(),editing:!!id,original:{...p},blob:null,previewURL:'',removeImage:false,sequence:0,processing:false,busy:false};
    updatePreview(d);
    form.querySelector('[name="image"]').addEventListener('change',event=>{const file=event.target.files?.[0];if(file)void chooseImage(d,file);});
    form.querySelector('[data-community-remove]').addEventListener('click',()=>{if(!draftCurrent(d)||d.busy)return;d.sequence++;d.processing=false;d.blob=null;d.removeImage=true;if(d.previewURL)URL.revokeObjectURL(d.previewURL);d.previewURL='';form.querySelector('[name="image"]').value='';form.querySelector('[name="image_alt"]').value='';form.querySelector('[type="submit"]').disabled=false;updatePreview(d);status(d,'Image retirée du brouillon.');});
    form.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();void savePost(d);},true);
  }
  async function removeUnusedImage(db,path,context){
    if(!validImagePath(path,context.user.id)||!sameSession(context))return false;
    try{
      // Never remove an image while a confirmed or uncertain write may still reference it.
      const refs=checkResult(await db.from('posts').select('id').eq('image_path',path).limit(1));
      if(!sameSession(context)||refs.length)return false;
      checkResult(await db.storage.from(BUCKET).remove([path]));return true;
    }catch{return false;}
  }
  async function savePost(d){
    if(!draftCurrent(d)||d.busy||d.processing)return;
    if(!d.form.reportValidity())return;
    const context=d.context;let db,uploadedPath='',saved=null,writeStarted=false,definiteRejection=false;
    d.busy=true;const controls=[...d.form.querySelectorAll('input,textarea,select,button')];
    const values=new FormData(d.form);controls.forEach(x=>x.disabled=true);status(d,'Publication en cours…');
    try{
      assertSession(context);
      if(!values.has('share_consent'))throw Error('Confirme les informations que tu souhaites partager.');
      const row=validatePost(Object.fromEntries(values));
      row.image_path=d.removeImage?null:(d.original.image_path||null);
      if(!row.image_path&&!d.blob)row.image_alt=null;
      if(context.demo){
        let imageURL=d.removeImage?'':d.original.image_url||'';
        if(d.blob){imageURL=URL.createObjectURL(d.blob);demoURLs.add(imageURL);}
        saved={...d.original,...row,id:d.id,author_id:context.user.id,image_url:imageURL,created_at:d.original.created_at||new Date().toISOString(),profiles:{display_name:S.profile.display_name,username:S.profile.username},post_likes:d.original.post_likes||[{count:0}],comments:d.original.comments||[{count:0}]};
        demoPool=d.editing?demoPool.map(p=>p.id===d.id?saved:p):[saved,...demoPool];S.posts=demoPool;
      }else{
        if(!navigator.onLine)throw Error('Hors connexion. Ton brouillon n’a pas été publié.');
        db=await getClient();assertSession(context);
        if(d.blob){
          uploadedPath=context.user.id+'/'+crypto.randomUUID()+'.jpg';status(d,'Envoi de l’image…');
          checkResult(await db.storage.from(BUCKET).upload(uploadedPath,d.blob,{contentType:'image/jpeg',cacheControl:'60',upsert:false}));
          assertSession(context);row.image_path=uploadedPath;
        }
        status(d,'Enregistrement du message…');
        try{
          writeStarted=true;
          saved=checkResult(await (d.editing?db.from('posts').update({...row,updated_at:new Date().toISOString()}).eq('id',d.id).eq('author_id',context.user.id):db.from('posts').insert({...row,id:d.id,author_id:context.user.id})).select(COLUMNS).single());
        }catch(error){
          definiteRejection=typeof error?.code==='string'&&/^(?:22|23|42|PGRST)/.test(error.code);
          // A timeout can happen after the write. Confirm the exact payload before retrying.
          try{
            const recovered=checkResult(await db.from('posts').select(COLUMNS).eq('id',d.id).eq('author_id',context.user.id).maybeSingle());
            if(recovered&&Object.entries(row).every(([key,value])=>(recovered[key]??null)===(value??null)))saved=recovered;
          }catch{/* Keep the draft when confirmation is impossible. */}
          if(!saved)throw error;
        }
        assertSession(context);
      }
    }catch(error){
      if(uploadedPath&&db&&!saved&&(!writeStarted||definiteRejection))await removeUnusedImage(db,uploadedPath,context);
      if(draftCurrent(d))status(d,message(error)+' Ton brouillon reste ouvert.');
      d.busy=false;controls.forEach(x=>x.disabled=false);return;
    }
    if(!sameSession(context))return;
    if(draftCurrent(d))closeModal();
    let cleanupFailed=false;
    if(!context.demo&&d.original.image_path&&d.original.image_path!==saved.image_path){cleanupFailed=!await removeUnusedImage(db,d.original.image_path,context);}
    if(!sameSession(context))return;
    S.feedPage=0;
    try{await loadFeed();if(inCommunity())render();}catch{/* Saved successfully; the feed already displays its loading error. */}
    if(!sameSession(context))return;
    notify(context.demo?'Publication de démonstration : rien n’a été envoyé en ligne.':cleanupFailed?'Message enregistré. Le nettoyage de l’ancienne image n’a pas pu être confirmé.':'Publication enregistrée.');
  }
  async function removePost(button){
    const context=ensure();assertSession(context);const id=button.dataset.id,p=S.posts.find(x=>x.id===id);
    if(!p||p.author_id!==context.user.id)throw Error('Cette publication ne peut pas être supprimée.');
    if(!confirm('Supprimer ta publication, son image et les commentaires associés ?'))return;
    let cleanupFailed=false;
    if(!context.demo){const db=await getClient();assertSession(context);const rows=checkResult(await db.from('posts').delete().eq('id',id).eq('author_id',context.user.id).select('id,image_path'));assertSession(context);if(!rows.length)throw Error('Cette publication n’est plus disponible. Actualise le fil.');if(rows[0].image_path)cleanupFailed=!await removeUnusedImage(db,rows[0].image_path,context);}
    assertSession(context);S.posts=S.posts.filter(x=>x.id!==id);demoPool=demoPool.filter(x=>x.id!==id);if(context.demo&&demoURLs.has(p.image_url)){URL.revokeObjectURL(p.image_url);demoURLs.delete(p.image_url);}if(inCommunity())render();notify(cleanupFailed?'Publication supprimée. Le nettoyage du fichier image n’a pas pu être confirmé.':'Publication supprimée.');
  }
  async function reload(){const context=ensure();S.feedPage=0;const task=loadFeed();if(inCommunity())render();try{if(await task&&sameSession(context)&&inCommunity())render();}catch(error){if(sameSession(context))notify(message(error));}}
  document.addEventListener('change',event=>{const key=event.target?.dataset?.communityFilter;if(!key||!inCommunity())return;ensure();filters=normalizeFilters({...filters,[key]:event.target.value});void reload();});
  document.addEventListener('click',async event=>{
    const resetButton=event.target.closest?.('[data-community-reset]');
    if(resetButton&&inCommunity()){event.preventDefault();ensure();filters=emptyFilters();S.feedKind='all';S.feedSearch='';void reload();return;}
    const button=event.target.closest?.('[data-community-image]');if(!button||!inCommunity())return;
    event.preventDefault();const context=ensure(),post=S.posts.find(p=>p.id===button.dataset.communityImage);if(!post)return;button.disabled=true;
    try{
      let url=post.image_url;
      if(!context.demo){if(!validImagePath(post.image_path,post.author_id))throw Error('Image indisponible.');const db=await getClient();assertSession(context);url=safeSignedURL(checkResult(await db.storage.from(BUCKET).createSignedUrl(post.image_path,600)).signedUrl);assertSession(context);}
      if(!url)throw Error('Cette image est indisponible. Actualise le fil.');
      if(!sameSession(context)||!inCommunity())return;
      releaseDraft();modal('Image partagée',`<img class="community-image-large" src="${esc(url)}" alt="${esc(post.image_alt||'Image jointe au message')}" referrerpolicy="no-referrer">${post.image_alt?`<p>${esc(post.image_alt)}</p>`:''}`);
    }catch(error){if(sameSession(context))notify(message(error));}finally{button.disabled=false;}
  });
  document.addEventListener('error',event=>{const image=event.target;if(image?.matches?.('img.community-image')){image.hidden=true;const button=image.closest('button');if(button&&!button.querySelector('span')){const span=document.createElement('span');span.textContent='Recharger l’image';span.className='small';button.append(span);}}},true);
  document.getElementById('modal')?.addEventListener('close',()=>{if(!document.getElementById('modal').open)releaseDraft();});
  const root=document.getElementById('modalContent');if(root)new MutationObserver(()=>{if(draft&&!document.contains(draft.form))releaseDraft();}).observe(root,{childList:true});
  return {loadFeed,view,postList,openPost,removePost,reset};
}
