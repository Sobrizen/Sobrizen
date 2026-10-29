/** Only owner-scoped paths are accepted; never load arbitrary avatar URLs. */
export const PHOTO_BUCKET='profile-avatars';
export const MAX_PHOTO_SOURCE=10*1024*1024;
export const MAX_PHOTO_BYTES=512*1024;
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const pathPattern=new RegExp('^'+uuid+'/'+uuid+'\\.jpg$');
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function validPhotoPath(path,owner){return typeof path==='string'&&pathPattern.test(path)&&path.split('/')[0]===owner;}
export function photoMarkup(profile={},owner=''){
  const initial=Array.from(String(profile?.display_name||profile?.username||'M').trim())[0]||'M';
  const path=validPhotoPath(profile?.avatar_path,owner)?profile.avatar_path:'';
  return `<span class="avatar sz-profile-photo" data-photo-owner="${esc(owner)}" data-photo-path="${esc(path)}" aria-hidden="true"><span class="sz-photo-initial">${esc(initial.toUpperCase())}</span></span>`;
}
export function photoSignature(bytes){
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if([137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))return 'image/png';
  if(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
  return null;
}
/** Canvas creates a new square JPEG; the original name and EXIF/GPS are not sent. */
export async function prepareProfilePhoto(file){
  if(!file?.size)throw Error('Choisis une photo non vide.');
  if(file.size>MAX_PHOTO_SOURCE)throw Error('Cette photo est trop lourde. Choisis une image de 10 Mo maximum.');
  if(!photoSignature(new Uint8Array(await file.slice(0,12).arrayBuffer())))throw Error('Choisis une photo JPG, PNG ou WebP. Les autres formats ne sont pas acceptés.');
  const url=URL.createObjectURL(file),image=new Image();
  try{
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{image.onload=image.onerror=null;image.src='';reject(Error('La photo est trop longue à ouvrir. Essaie une image plus petite.'));},15000);
      image.onload=()=>{clearTimeout(timer);resolve();};
      image.onerror=()=>{clearTimeout(timer);reject(Error('Cette photo est illisible. Choisis une autre image.'));};
      image.src=url;
    });
    const width=image.naturalWidth,height=image.naturalHeight;
    if(!width||!height||width*height>40000000)throw Error('Cette photo est trop grande. Choisis une version de moins de 40 mégapixels.');
    const side=Math.min(width,height),canvas=document.createElement('canvas');
    canvas.width=canvas.height=Math.min(512,side);
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Ton navigateur ne peut pas préparer cette photo. Essaie avec un autre navigateur.');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,(width-side)/2,(height-side)/2,side,side,0,0,canvas.width,canvas.height);
    for(const quality of [.88,.75,.6]){
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      if(blob?.type==='image/jpeg'&&blob.size>0&&blob.size<=MAX_PHOTO_BYTES)return blob;
    }
    throw Error('La photo reste trop lourde. Essaie une image plus petite.');
  }finally{image.onload=image.onerror=null;URL.revokeObjectURL(url);}
}
const data=result=>{if(result.error)throw result.error;return result.data;};
const conflict=()=>Object.assign(Error('Ta photo a changé sur un autre écran. Ferme cette fenêtre puis rouvre-la pour réessayer.'),{code:'PHOTO_CONFLICT'});
const digest=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).join(',');
/** An attempt is kept by the editor across retries, including its immutable filename. */
export async function persistProfilePhoto({db,uid,originalPath=null,blob=null,attempt,assertActive=()=>{}}){
  assertActive();
  if(originalPath!==null&&!validPhotoPath(originalPath,uid))throw Error('Cette photo ne correspond pas à ton compte. Actualise ton profil.');
  if(blob&&(blob.type!=='image/jpeg'||!blob.size||blob.size>MAX_PHOTO_BYTES||photoSignature(new Uint8Array(await blob.slice(0,12).arrayBuffer()))!=='image/jpeg'))throw Error('La photo préparée est invalide. Choisis-la à nouveau.');
  assertActive();
  if(!attempt.started){attempt.started=true;attempt.path=blob?uid+'/'+crypto.randomUUID()+'.jpg':null;attempt.uploaded=false;attempt.writeStarted=false;}
  const path=attempt.path;
  const current=()=>db.from('profiles').select('id,avatar_path').eq('id',uid).single();
  if(attempt.writeStarted){
    const row=data(await current());assertActive();
    if(row.avatar_path===path)return {path};
    if((row.avatar_path??null)!==originalPath)throw conflict();
  }
  if(blob&&!attempt.uploaded){
    try{data(await db.storage.from(PHOTO_BUCKET).upload(path,blob,{contentType:'image/jpeg',cacheControl:'0',upsert:false}));assertActive();attempt.uploaded=true;}
    catch(error){
      assertActive();
      // A lost response or duplicate-path error can follow a successful upload.
      // Confirm the exact bytes before publishing that path, never overwrite it.
      try{
        const uploaded=data(await db.storage.from(PHOTO_BUCKET).download(path));assertActive();
        if(uploaded.size!==blob.size||await digest(uploaded)!==await digest(blob))throw Error('Photo différente.');
        assertActive();attempt.uploaded=true;
      }catch{assertActive();throw Error('L’envoi de la photo n’a pas été confirmé. Ton aperçu est conservé : réessaie.');}
    }
  }
  assertActive();attempt.writeStarted=true;
  try{
    let update=db.from('profiles').update({avatar_path:path}).eq('id',uid);
    update=originalPath===null?update.is('avatar_path',null):update.eq('avatar_path',originalPath);
    const saved=data(await update.select('id,avatar_path').maybeSingle());assertActive();
    if(!saved)throw conflict();
    return {path:saved.avatar_path};
  }catch(error){
    assertActive();
    try{const row=data(await current());assertActive();if(row.avatar_path===path)return {path};if((row.avatar_path??null)!==originalPath)throw conflict();}
    catch(readError){assertActive();if(readError.code==='PHOTO_CONFLICT')throw readError;}
    if(error.code==='PHOTO_CONFLICT')throw error;
    throw Error('L’enregistrement de la photo n’est pas confirmé. Réessaie pour vérifier, sans renvoyer une nouvelle photo.');
  }
}
/** Cleanup is best-effort and never removes a currently referenced avatar. */
export async function removeUnusedProfilePhoto({db,path,uid,assertActive=()=>{}}){
  if(!validPhotoPath(path,uid))return true;
  try{
    assertActive();const rows=data(await db.from('profiles').select('id').eq('avatar_path',path).limit(1));assertActive();
    if(rows.length)return false;
    data(await db.storage.from(PHOTO_BUCKET).remove([path]));assertActive();return true;
  }catch{return false;}
}
