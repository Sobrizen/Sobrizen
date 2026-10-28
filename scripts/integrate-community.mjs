/** Build-time native bridge for the existing, dependency-free app. Fail closed on drift. */
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
export const MARKER='// SOBRIZEN COMMUNITY INTEGRATION 2026-10-28';
export function integrateApp(source){
  if(source.includes(MARKER))return source;
  for(const anchor of ['function communityView(', 'function postList(', 'function postModal(', 'async function loadFeed(', 'function invalidateSession(', 'const actionHandlers=']){
    if(!source.includes(anchor))throw Error('Community integration: missing anchor '+anchor);
  }
  if(source.split('\ninitGames();').length!==2)throw Error('Community integration: ambiguous boot anchor.');
  const bridge=`\n${MARKER}\nconst community=createCommunity({S,getClient,checkResult,notify,message,modal,closeModal,render,greeting,sessionContext,sameSession,assertSession});\ncommunityView=community.view;\npostList=community.postList;\npostModal=community.openPost;\nloadFeed=community.loadFeed;\nactionHandlers['post-delete']=community.removePost;\nconst invalidateBeforeCommunity=invalidateSession;\ninvalidateSession=()=>{invalidateBeforeCommunity();community.reset();};\n`;
  return "import {createCommunity} from './community.mjs';\n"+source.replace('\ninitGames();',bridge+'\ninitGames();');
}
export function integrateWorker(source){
  if(!/const CACHE='sobrizen-[^']+';/.test(source)||!source.includes('const ASSETS=['))throw Error('Community integration: unexpected service worker.');
  source=source.replace(/const CACHE='sobrizen-[^']+';/,"const CACHE='sobrizen-v4-20261028-community-1';");
  for(const path of ['/community.mjs','/community-core.mjs','/community.css']){
    if(!source.includes("'"+path+"'"))source=source.replace('const ASSETS=[',"const ASSETS=['"+path+"',");
  }
  return source;
}
function build(){
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  // No network dependencies or secrets are used by this build.
  for(const file of ['community-core.mjs','community.mjs'])execFileSync(process.execPath,['--check',resolve(root,file)],{stdio:'inherit'});
  execFileSync(process.execPath,['--test',resolve(root,'community-core.test.mjs')],{stdio:'inherit'});
  const app=integrateApp(readFileSync(resolve(root,'app.mjs'),'utf8'));
  const worker=integrateWorker(readFileSync(resolve(root,'sw.js'),'utf8'));
  writeFileSync(resolve(root,'app.mjs'),app);writeFileSync(resolve(root,'sw.js'),worker);
  execFileSync(process.execPath,['--check',resolve(root,'app.mjs')],{stdio:'inherit'});
  execFileSync(process.execPath,['--check',resolve(root,'sw.js')],{stdio:'inherit'});
  console.log('Community filters, emotions and optional private images integrated.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))build();
