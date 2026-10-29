import {esc,parseDay} from './core.mjs';
import {prepareImage} from './community.mjs';
import {validImagePath,MAX_IMAGE_BYTES,imageSignature} from './community-core.mjs';
import {isMotivationEntry} from './journal-motivation.mjs';

export const JOURNAL_IMAGE_BUCKET='journal-images';
const KINDS=[['reflection','Réflexion'],['victory','Victoire'],['difficult','Moment difficile'],['plan','Plan personnel']];
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${name==='image'?'<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m3 16 5-5 4 4 3-3 6 6"/>':name==='share'?'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 10 6-3M9 14l6 3"/>':'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>'}</svg>`;

/** Private notes and images. Community sharing always opens a separate reviewed copy. */
export function createJournalNotes({S,getClient,checkResult,notify,message,modal,closeModal,render,sessionContext,sameSession,assertSession,privateWrite,healthConsentActive,today,onChanged=()=>{},openShare}){
  let draft=null,revision=0,observer=null;
  const images=new Map(),pendingImages=new Map(),demoImages=new Map(),removing=new Set();
  const valid=context=>sameSession(context)&&healthConsentActive();
  const current=d=>draft===d&&document.contains(d.form)&&valid(d.context);
  const assert=context=>{assertSession(context,true);if(!healthConsentActive())throw Error('Active ton suivi pour accéder au journal.');};
  const entryFor=id=>S.journal.find(entry=>entry.id===id);
  const hasImage=entry=>!!entry?.image_path||!!(S.demo&&demoImages.has(entry?.id));
  function releaseDraft(){if(draft){draft.sequence++;if(draft.previewURL)URL.revokeObjectURL(draft.previewURL);draft=null;}}
  function reset(){revision++;releaseDraft();observer?.disconnect();observer=null;for(const item of [...images.values(),...demoImages.values()])URL.revokeObjectURL(item.url);images.clear();pendingImages.clear();demoImages.clear();removing.clear();}
  function forgetImage(path){const image=images.get(path);if(image)URL.revokeObjectURL(image.url);images.delete(path);}
  function status(d,text,error=false){if(current(d)){const node=d.form.querySelector('[data-jn-status]');node.textContent=text;node.classList.toggle('jn-error',error);node.setAttribute('role',error?'alert':'status');}}
  function syncSubmit(d){if(!current(d))return;const button=d.form.querySelector('[type="submit"]');button.disabled=d.processing||d.busy;button.textContent=d.form.elements.visibility.value==='community'?'Enregistrer et préparer le partage':'Enregistrer pour moi';}
  function preview(d){
    if(!current(d))return;
    const image=d.form.querySelector('[data-jn-preview]'),present=!!d.blob||(!d.removeImage&&hasImage(d.original));
    const cached=d.context.demo?demoImages.get(d.id):images.get(d.original.image_path);
    const url=d.previewURL||(!d.removeImage?cached?.url:'')||'';
    image.hidden=!url;if(url)image.src=url;else image.removeAttribute('src');
    d.form.querySelector('[data-jn-remove]').hidden=!present;
    d.form.querySelector('[data-jn-description]').hidden=!present;
    d.form.querySelector('[data-jn-image-empty]').hidden=!!url;
  }
  async function readImage(entry,context=sessionContext()){
    assert(context);
    if(context.demo){const image=demoImages.get(entry.id);if(!image)throw Error('Cette image de démonstration n’est plus disponible.');return image;}
    const path=entry.image_path;if(!validImagePath(path,context.user.id))throw Error('Cette image n’est pas disponible.');
    if(images.has(path))return images.get(path);
    if(pendingImages.has(path))return pendingImages.get(path);
    const token=revision;
    const task=(async()=>{
      const db=await getClient();assert(context);
      const blob=checkResult(await db.storage.from(JOURNAL_IMAGE_BUCKET).download(path));assert(context);
      if(token!==revision)throw Error('Ton espace a changé.');
      if(!blob||!blob.size||blob.size>MAX_IMAGE_BYTES||imageSignature(new Uint8Array(await blob.slice(0,12).arrayBuffer()))!=='image/jpeg')throw Error('Cette image ne peut pas être affichée.');
      assert(context);if(token!==revision)throw Error('Ton espace a changé.');
      const item={blob,url:URL.createObjectURL(blob)};images.set(path,item);
      return item;
    })();
    pendingImages.set(path,task);
    try{return await task;}finally{if(pendingImages.get(path)===task)pendingImages.delete(path);}
  }
  function imageMarkup(entry){
    if(!hasImage(entry))return '';
    return `<button type="button" class="jn-photo-button" data-journal-image="${esc(entry.id)}" aria-label="Ouvrir l’image de la note ${esc(entry.title)}"><span data-jn-photo>${icon('image')}<span>Afficher mon image</span></span></button>`;
  }
  async function hydrate(button){
    if(button.dataset.loading==='true'||button.querySelector('img'))return;
    const entry=entryFor(button.dataset.journalImage),context=sessionContext();if(!entry||!valid(context))return;
    button.dataset.loading='true';
    try{
      const image=await readImage(entry,context);
      if(!valid(context)||!document.contains(button)||entryFor(entry.id)?.image_path!==entry.image_path)return;
      const img=document.createElement('img');img.src=image.url;img.alt=entry.image_alt||'Image jointe à ma note';img.loading='lazy';img.decoding='async';
      const text=document.createElement('span');text.className='jn-photo-caption';text.textContent='Voir l’image';button.replaceChildren(img,text);
    }catch{if(valid(context)&&document.contains(button)){const label=button.querySelector('[data-jn-photo] span');if(label)label.textContent='Réessayer l’image';}}
    finally{delete button.dataset.loading;}
  }
  function pageRendered(){
    observer?.disconnect();observer=null;
    if(S.page!=='journal'||!healthConsentActive())return;
    const buttons=[...document.querySelectorAll('[data-journal-image]')];
    if(typeof IntersectionObserver==='function'){
      observer=new IntersectionObserver(items=>{for(const item of items)if(item.isIntersecting){observer?.unobserve(item.target);void hydrate(item.target);}},{rootMargin:'200px'});
      buttons.forEach(button=>observer.observe(button));
    }else buttons.forEach(button=>void hydrate(button));
  }
  function reloaded(){
    const referenced=new Set(S.journal.map(entry=>entry.image_path).filter(Boolean));
    for(const path of images.keys())if(!referenced.has(path))forgetImage(path);
  }
  async function chooseImage(d,file){
    if(!current(d)||d.busy)return;
    const sequence=++d.sequence;d.processing=true;syncSubmit(d);status(d,'Préparation de ton image…');
    try{
      const blob=await prepareImage(file);if(!current(d)||sequence!==d.sequence)return;
      if(d.previewURL)URL.revokeObjectURL(d.previewURL);
      d.blob=blob;d.previewURL=URL.createObjectURL(blob);d.removeImage=false;d.uploadedPath='';preview(d);status(d,'Image prête. Elle sera enregistrée avec ta note.');
    }catch(error){if(current(d)&&sequence===d.sequence){d.form.elements.image.value='';status(d,message(error),true);}}
    finally{if(current(d)&&sequence===d.sequence){d.processing=false;syncSubmit(d);}}
  }
  function open(id,prefill={}){
    privateWrite();const context=sessionContext();assert(context);releaseDraft();
    const n=id?entryFor(id):prefill;if(!n)throw Error('Cette note n’est plus disponible. Actualise ton journal.');
    if(id&&isMotivationEntry(n))throw Error('Retrouve cette citation dans ton journal de motivation.');
    modal(id?'Ma note, à ma façon':n.kind==='plan'?'Préparer ma journée':'Un moment pour écrire',`<form id="journalForm" class="jn-composer">
      <p class="jn-intro">Quelques mots, une image, un petit pas. Choisis ce que tu gardes pour toi et ce que tu souhaites partager.</p>
      <input type="hidden" name="id" value="${esc(n.id||'')}">
      <div class="two-fields"><label>Date<input name="entry_date" type="date" required min="1900-01-01" max="${today()}" value="${esc(n.entry_date||today())}"></label><label>Type<select name="kind">${KINDS.map(([key,label])=>`<option value="${key}" ${(n.kind||'reflection')===key?'selected':''}>${label}</option>`).join('')}</select></label></div>
      <label>Titre<input name="title" maxlength="120" required placeholder="Ce que je veux retenir…" value="${esc(n.title||'')}"></label>
      ${n.kind==='plan'?'<p class="small">« Si cette situation arrive…, alors mon premier pas sera… »</p>':''}
      <label>${n.kind==='plan'?'Mon plan pour cette journée':'Ma note'}<textarea name="body" rows="4" maxlength="5000" required placeholder="Aujourd’hui, j’ai envie de poser ces mots…">${esc(n.body||'')}</textarea></label>
      <section class="jn-image-panel" aria-labelledby="jnImageTitle"><div class="jn-image-heading">${icon('image')}<div><h3 id="jnImageTitle">Une image pour ce moment</h3><p>Facultatif · JPEG, PNG ou WebP · 10 Mo maximum</p></div></div>
      <div class="jn-image-empty" data-jn-image-empty>Un souvenir, une inspiration, une petite victoire.</div>
      <img class="jn-preview" data-jn-preview alt="Aperçu de l’image jointe à ma note" hidden>
      <div class="jn-image-controls"><label class="jn-file-button">Choisir une image<input name="image" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choisir une image pour ma note"></label><button class="text" type="button" data-jn-remove hidden>Retirer l’image</button></div>
      <label data-jn-description hidden>Décrire l’image · facultatif<input name="image_alt" maxlength="180" value="${esc(n.image_alt||'')}" placeholder="Une courte description accessible"></label></section>
      <fieldset class="jn-visibility"><legend>Que souhaites-tu faire ?</legend>
      <label><input name="visibility" type="radio" value="private" checked><span>${icon('lock')}<span><strong>Garder pour moi</strong><small>Enregistrer dans mon journal personnel.</small></span></span></label>
      <label><input name="visibility" type="radio" value="community"><span>${icon('share')}<span><strong>Partager avec la communauté</strong><small>Relire et valider une copie avant de publier.</small></span></span></label></fieldset>
      <p class="jn-privacy-hint">Ton original et son image restent dans ton journal. ${n.shared_post_id?'Une copie a déjà été partagée. Les modifications ici ne changent pas cette publication.':'Rien n’est publié sans ta validation.'}</p>
      ${context.demo?'<p class="jm-demo">Mode démo · Tes notes et images restent fictives, uniquement pendant cette démonstration.</p>':''}
      <p class="jn-status" data-jn-status role="status" aria-live="polite"></p>
      <div class="jn-submit"><button type="submit" class="primary full">Enregistrer pour moi</button></div></form>`);
    const form=document.getElementById('journalForm');
    const d=draft={form,context,id:n.id||crypto.randomUUID(),editing:!!id,original:{...n},blob:null,previewURL:'',uploadedPath:'',removeImage:false,sequence:0,processing:false,busy:false};
    preview(d);
    if(hasImage(n))void readImage(n,context).then(()=>preview(d)).catch(()=>{if(current(d))status(d,'L’aperçu est indisponible. Ton image reste jointe à la note.');});
    form.elements.image.addEventListener('change',event=>{const file=event.target.files?.[0];if(file)void chooseImage(d,file);});
    form.querySelector('[data-jn-remove]').addEventListener('click',()=>{
      if(!current(d)||d.busy)return;d.sequence++;d.processing=false;d.blob=null;d.removeImage=true;d.uploadedPath='';
      if(d.previewURL)URL.revokeObjectURL(d.previewURL);d.previewURL='';form.elements.image.value='';form.elements.image_alt.value='';preview(d);syncSubmit(d);status(d,'L’image sera retirée lorsque tu enregistreras la note.');
    });
    form.querySelectorAll('[name="visibility"]').forEach(input=>input.addEventListener('change',()=>syncSubmit(d)));
    form.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();void save(d);},true);
  }
  async function removeUnusedImage(db,path,context){
    if(!validImagePath(path,context.user.id)||!valid(context))return false;
    try{
      const refs=checkResult(await db.from('journal_entries').select('id').eq('user_id',context.user.id).eq('image_path',path).limit(1));
      if(!valid(context)||refs.length)return false;
      checkResult(await db.storage.from(JOURNAL_IMAGE_BUCKET).remove([path]));if(valid(context))forgetImage(path);return true;
    }catch{return false;}
  }
  async function save(d){
    if(!current(d)||d.busy||d.processing||!d.form.reportValidity())return;
    const values=new FormData(d.form),v=name=>String(values.get(name)||'').trim(),context=d.context;
    const sharing=v('visibility')==='community';let db,saved=null,writeStarted=false,definiteRejection=false,cleanupFailed=false;
    d.busy=true;const controls=[...d.form.querySelectorAll('input,textarea,select,button')];controls.forEach(control=>control.disabled=true);status(d,'Enregistrement de ta note…');
    try{
      privateWrite();assert(context);
      const date=v('entry_date');parseDay(date);if(date<'1900-01-01'||date>today())throw Error('Choisis une date passée ou aujourd’hui.');
      if(!v('title')||[...v('title')].length>120)throw Error('Choisis un titre de 1 à 120 caractères.');
      if(!v('body')||[...v('body')].length>5000)throw Error('Écris une note de 1 à 5 000 caractères.');
      if(!KINDS.some(([kind])=>kind===v('kind')))throw Error('Choisis un type de note.');
      if([...v('image_alt')].length>180)throw Error('La description de l’image est limitée à 180 caractères.');
      const row={id:d.id,user_id:context.user.id,entry_date:date,title:v('title'),body:v('body'),kind:v('kind'),image_path:d.removeImage?null:d.original.image_path||null,image_alt:v('image_alt')||null};
      if(!row.image_path&&!d.blob&&!context.demo)row.image_alt=null;
      if(context.demo){
        const old=demoImages.get(d.id);
        if(d.blob){const item={blob:d.blob,url:URL.createObjectURL(d.blob)};demoImages.set(d.id,item);if(old)URL.revokeObjectURL(old.url);}
        else if(d.removeImage&&old){URL.revokeObjectURL(old.url);demoImages.delete(d.id);}
        if(!demoImages.has(d.id))row.image_alt=null;
        saved={...d.original,...row,created_at:d.original.created_at||new Date().toISOString(),updated_at:new Date().toISOString()};
      }else{
        db=await getClient();assert(context);
        if(d.blob){
          if(!d.uploadedPath){
            const path=context.user.id+'/'+crypto.randomUUID()+'.jpg';status(d,'Enregistrement de ton image privée…');
            checkResult(await db.storage.from(JOURNAL_IMAGE_BUCKET).upload(path,d.blob,{contentType:'image/jpeg',cacheControl:'0',upsert:false}));
            assert(context);d.uploadedPath=path;
          }
          row.image_path=d.uploadedPath;
        }
        assert(context);status(d,'Enregistrement de ta note…');
        try{
          writeStarted=true;
          // A fixed UUID makes an uncertain response safe to retry; ownership is also enforced by RLS.
          saved=checkResult(await (d.editing?db.from('journal_entries').update(row).eq('id',d.id).eq('user_id',context.user.id):db.from('journal_entries').upsert(row,{onConflict:'id'})).select().single());
          if(!saved)throw Error('Cette note n’est plus disponible. Actualise ton journal.');
        }catch(error){
          definiteRejection=typeof error?.code==='string'&&/^(?:22|23|42|PGRST)/.test(error.code);
          assert(context);
          try{
            const recovered=checkResult(await db.from('journal_entries').select('*').eq('id',d.id).eq('user_id',context.user.id).maybeSingle());assert(context);
            if(recovered&&Object.entries(row).every(([key,value])=>(recovered[key]??null)===(value??null)))saved=recovered;
          }catch{/* Keep the private draft and its pending upload if confirmation is unavailable. */}
          if(!saved)throw error;
        }
        assert(context);
        if(d.blob&&saved.image_path){forgetImage(saved.image_path);images.set(saved.image_path,{blob:d.blob,url:URL.createObjectURL(d.blob)});}
      }
    }catch(error){
      if(d.uploadedPath&&db&&!saved&&(!writeStarted||definiteRejection)){if(await removeUnusedImage(db,d.uploadedPath,context))d.uploadedPath='';}
      if(current(d)){status(d,message(error)+' Ton brouillon reste ouvert.',true);d.busy=false;controls.forEach(control=>control.disabled=false);syncSubmit(d);}return;
    }
    if(!valid(context))return;
    S.journal=[saved,...S.journal.filter(entry=>entry.id!==saved.id)].sort((a,b)=>String(b.entry_date).localeCompare(String(a.entry_date))||String(b.created_at||'').localeCompare(String(a.created_at||'')));
    onChanged();
    if(!context.demo&&d.original.image_path&&d.original.image_path!==saved.image_path)cleanupFailed=!await removeUnusedImage(db,d.original.image_path,context);
    if(!valid(context))return;
    // Closing or replacing the editor while saving never causes an unexpected share dialog.
    const stillOpen=current(d);if(stillOpen)closeModal();if(S.page==='journal'||S.page==='home'||S.page==='journey')render();
    notify(context.demo?'Note enregistrée dans la démonstration. Aucune donnée envoyée en ligne.':cleanupFailed?'Note enregistrée. Le retrait de l’ancienne image du stockage reste à confirmer.':'Note enregistrée dans ton journal.');
    if(sharing&&stillOpen){try{await share(saved.id,d.blob);}catch(error){if(valid(context))notify('Ta note est bien enregistrée. Le partage n’a pas pu être ouvert : '+message(error));}}
  }
  async function rememberShare(entry,post,context){
    if(!valid(context)||!entryFor(entry.id))return;
    let saved;
    if(context.demo)saved={...entryFor(entry.id),shared_post_id:post.id};
    else{
      const db=await getClient();assert(context);
      saved=checkResult(await db.from('journal_entries').update({shared_post_id:post.id}).eq('id',entry.id).eq('user_id',context.user.id).select().maybeSingle());assert(context);
    }
    if(saved&&valid(context)){S.journal=S.journal.map(note=>note.id===entry.id?{...note,shared_post_id:saved.shared_post_id}:note);onChanged();if(S.page==='journal')render();}
  }
  async function share(id,preparedBlob=null){
    privateWrite();const context=sessionContext();assert(context);const entry=entryFor(id);
    if(!entry||isMotivationEntry(entry))throw Error('Cette note n’est plus disponible.');
    if(typeof openShare!=='function')throw Error('Le partage est momentanément indisponible. Réessaie après avoir actualisé.');
    return openShare({entry:{...entry},imageBlob:hasImage(entry)?preparedBlob:null,loadImage:hasImage(entry)?async()=>{const item=await readImage(entry,context);assert(context);return item.blob;}:null,valid:()=>valid(context),onPublished:post=>rememberShare(entry,post,context)});
  }
  async function remove(id){
    if(removing.has(id))return;
    const entry=entryFor(id),quote=isMotivationEntry(entry);if(!entry)return;
    if(!confirm(quote?'Retirer cette citation de ton journal de motivation ?':'Supprimer définitivement cette note et son image ?'+(entry.shared_post_id?' La copie partagée dans la communauté restera visible.':'')))return;
    privateWrite();const context=sessionContext();assert(context);removing.add(id);let cleanupFailed=false;
    try{
      if(!context.demo){
        const db=await getClient();assert(context);
        const rows=checkResult(await db.from('journal_entries').delete().eq('id',id).eq('user_id',context.user.id).select('id,image_path'));assert(context);
        if(!rows.length)throw Error('Cette note n’est plus disponible. Actualise ton journal.');
        if(rows[0].image_path)cleanupFailed=!await removeUnusedImage(db,rows[0].image_path,context);
      }else{const image=demoImages.get(id);if(image){URL.revokeObjectURL(image.url);demoImages.delete(id);}}
      assert(context);S.journal=S.journal.filter(note=>note.id!==id);onChanged();if(S.page==='journal')render();
      notify(quote?'Citation retirée de ton journal de motivation.':cleanupFailed?'Note supprimée. Le retrait du fichier image du stockage reste à confirmer.':'Note et image supprimées de ton journal.');
    }finally{removing.delete(id);}
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest?.('[data-journal-image]');if(!button||button.disabled||S.page!=='journal')return;
    event.preventDefault();const context=sessionContext(),entry=entryFor(button.dataset.journalImage);if(!entry)return;button.disabled=true;
    try{
      const image=await readImage(entry,context);assert(context);if(!document.contains(button))return;
      modal('L’image de ma note',`<div class="jn-image-view"><img src="${esc(image.url)}" alt="${esc(entry.image_alt||'Image jointe à ma note')}">${entry.image_alt?`<p>${esc(entry.image_alt)}</p>`:''}<button type="button" class="secondary" data-jn-download>Télécharger mon image</button><p class="small">Cette image appartient à ton journal personnel.</p></div>`);
      document.querySelector('[data-jn-download]').addEventListener('click',()=>{if(!valid(context))return;const link=document.createElement('a');link.href=image.url;link.download='sobrizen-mon-image-'+entry.entry_date+'.jpg';link.click();});
    }catch(error){if(valid(context))notify(message(error));}finally{button.disabled=false;}
  });
  document.getElementById('modal')?.addEventListener('close',()=>{if(!document.getElementById('modal').open)releaseDraft();});
  const root=document.getElementById('modalContent');if(root)new MutationObserver(()=>{if(draft&&!document.contains(draft.form))releaseDraft();}).observe(root,{childList:true});
  return {open,remove,share,imageMarkup,pageRendered,reset,reloaded};
}
