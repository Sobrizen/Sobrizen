/** Small, fail-closed build bridge. Existing tracking and form behavior stay untouched. */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
export const MARKER='// SOBRIZEN PROFILE PHOTOS 2026-10-29';
export function once(source,before,after){
  if(source.split(before).length!==2)throw Error('Profile photo integration: missing or ambiguous anchor '+before.slice(0,100));
  return source.replace(before,after);
}
export function integratePhotosApp(source){
  if(source.includes(MARKER))return source;
  source=once(source,'<form id="profileForm">','${profilePhotos.panel()}<form id="profileForm">');
  source=once(source,'profiles!posts_author_id_fkey(display_name,username)','profiles!posts_author_id_fkey(display_name,username,avatar_path)');
  source=once(source,'profiles!comments_author_id_fkey(display_name)','profiles!comments_author_id_fkey(display_name,username,avatar_path)');
  source=once(source,`<span class="avatar">\${esc((p.profiles?.display_name||'M').slice(0,1))}</span>`, '${photoMarkup(p.author_id===S.user.id?S.profile:p.profiles,p.author_id)}');
  source=once(source,`<div class="comment"><b>\${esc(c.profiles?.display_name||'Membre')}</b>`,`<div class="comment"><div class="sz-comment-author">\${photoMarkup(c.author_id===S.user.id?S.profile:c.profiles,c.author_id)}<b>\${esc(c.profiles?.display_name||'Membre')}</b></div>`);
  const bridge=`\n${MARKER}\nconst profilePhotos=createProfilePhotos({S,getClient,sessionContext,sameSession,assertSession,modal,closeModal,notify});\nconst renderBeforePhotos=render;\nrender=()=>{renderBeforePhotos();if(S.user)profilePhotos.header();};\nconst invalidateBeforePhotos=invalidateSession;\ninvalidateSession=()=>{profilePhotos.reset();invalidateBeforePhotos();};\n`;
  source=once(source,'\ninitGames();',bridge+'\ninitGames();');
  return "import {photoMarkup} from './profile-photo-core.mjs';\nimport {createProfilePhotos} from './profile-photo-ui.mjs';\n"+source;
}
export function integratePhotosCommunity(source){
  if(source.includes(MARKER))return source;
  source=once(source,'profiles!posts_author_id_fkey(display_name,username)','profiles!posts_author_id_fkey(display_name,username,avatar_path)');
  source=once(source,`<span class="avatar" aria-hidden="true">\${esc((p.profiles?.display_name||'M').slice(0,1))}</span>`, '${photoMarkup(p.author_id===S.user.id?S.profile:p.profiles,p.author_id)}');
  return MARKER+"\nimport {photoMarkup} from './profile-photo-core.mjs';\n"+source;
}
export function integratePhotosWorker(source){
  if(!/const CACHE='sobrizen-[^']+';/.test(source))throw Error('Profile photo integration: missing worker cache.');
  if(!source.includes("'/profile-photo-ui.mjs'"))source=source.replace(/const CACHE='sobrizen-[^']+';/,"const CACHE='sobrizen-v10-20261029-profile-photos-1';");
  for(const path of ['/profile-photo-core.mjs','/profile-photo-ui.mjs','/profile-photo.css'])if(!source.includes("'"+path+"'"))source=once(source,'const ASSETS=[',"const ASSETS=['"+path+"',");
  return source;
}
export function buildPhotos(root){
  for(const file of ['profile-photo-core.mjs','profile-photo-ui.mjs'])execFileSync(process.execPath,['--check',resolve(root,file)],{stdio:'inherit'});
  execFileSync(process.execPath,['--test',resolve(root,'tests/profile-photos.test.mjs')],{stdio:'inherit'});
  const read=file=>readFileSync(resolve(root,file),'utf8'),write=(file,text)=>writeFileSync(resolve(root,file),text);
  // Compute all transformations before writing any output.
  const app=integratePhotosApp(read('app.mjs')),community=integratePhotosCommunity(read('community.mjs')),worker=integratePhotosWorker(read('sw.js'));
  let index=read('index.html');if(!index.includes('href="/profile-photo.css"'))index=once(index,'</head>','<link rel="stylesheet" href="/profile-photo.css"></head>');
  let legal=read('legal.html');if(!legal.includes('id="profile-photos-privacy"'))legal=once(legal,'<h3>Notes, images et partage volontaire</h3>','<h3 id="profile-photos-privacy">Photo de profil facultative</h3><p>Vous pouvez ajouter, remplacer ou retirer une photo de profil. Après votre validation, elle est visible par les membres connectés dans la communauté et les commentaires, y compris sur vos anciens messages. Sans photo, votre initiale est affichée. L’image est centrée, redimensionnée et réencodée avant envoi ; son nom original et ses métadonnées photographiques ne sont pas transmis. Les photos sont stockées séparément des images du journal, dans un espace dont la lecture nécessite un compte connecté. Un retrait ne peut pas effacer les copies déjà vues ou conservées par un autre membre. L’effacement d’un compte doit également inclure les fichiers de son dossier de photos de profil.</p><h3>Notes, images et partage volontaire</h3>');
  for(const [file,text]of Object.entries({'app.mjs':app,'community.mjs':community,'sw.js':worker,'index.html':index,'legal.html':legal}))write(file,text);
  for(const file of ['app.mjs','community.mjs','sw.js'])execFileSync(process.execPath,['--check',resolve(root,file)],{stdio:'inherit'});
  console.log('Optional member-visible profile photos integrated.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))buildPhotos(resolve(dirname(fileURLToPath(import.meta.url)),'..'));
