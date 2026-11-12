/** Static production build: transform in memory, publish only the explicit allowlist. */
import {readFileSync,writeFileSync,lstatSync,mkdirSync,mkdtempSync,rmSync,renameSync,existsSync} from 'node:fs';
import {dirname,resolve,posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {PUBLIC_ASSETS} from './public-assets.mjs';
import {catalogCopy} from './catalog-copy.mjs';
import {integrateSalesApp,integrateSalesSubscription,integrateSalesSubscriptionHtml,integrateSalesLegal} from './sales-launch.mjs';
import {integrateApp,integrateWorker} from './integrate-community.mjs';
import {integratePhotosApp,integratePhotosCommunity,integratePhotosWorker,integratePhotosIndex,integratePhotosLegal} from './integrate-profile-photos.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const PUBLIC_SET=new Set(PUBLIC_ASSETS);
const textFiles=/\.(mjs|js|css|html|webmanifest|xml|txt)$/u;

export function validatePublic(files,config){
  if(files.size!==PUBLIC_ASSETS.length||PUBLIC_ASSETS.some(file=>!files.has(file)))throw Error('Public build: incomplete or expanded allowlist.');
  for(const file of files.keys())if(!PUBLIC_SET.has(file)||/(^|\/)(tests|db|schema|scripts|node_modules)(\/|$)|\.(sql|md|map)$|\.test\./u.test(file))throw Error('Public build: private source artifact '+file);
  const csp=config.headers?.flatMap(rule=>rule.headers||[]).find(header=>header.key==='Content-Security-Policy')?.value;
  if(!csp||!csp.includes("script-src-attr 'none'")||/script-src[^;]*'unsafe-(inline|eval)'/u.test(csp))throw Error('Public build: enforcing script CSP is missing or unsafe.');
  const reference=(ref,from,cleanUrl=false)=>{
    if(!ref||/^(?:#|data:|blob:|https?:|mailto:|tel:)/u.test(ref))return;
    const path=ref.split(/[?#]/u)[0];
    const file=path==='/'?'index.html':path.startsWith('/')?path.slice(1):posix.normalize(posix.join(posix.dirname(from),path));
    if(!files.has(file)&&!(cleanUrl&&config.cleanUrls&&!posix.extname(file)&&files.has(file+'.html')))throw Error(`Public build: ${from} references unpublished ${ref}.`);
  };
  for(const [file,bytes] of files){
    if(!textFiles.test(file))continue;
    const source=bytes.toString('utf8');
    if(/\b(?:sb_secret_|sk_live_)[A-Za-z0-9_-]{12,}/u.test(source))throw Error('Public build: secret-like value in '+file);
    if(file.endsWith('.html')){
      for(const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu)){
        const src=/\bsrc\s*=\s*["']([^"']+)["']/iu.exec(match[1]);
        if(!src||match[2].trim())throw Error('Public build: inline script is incompatible with CSP in '+file);
        reference(src[1],file);
      }
      if(/\son[a-z]+\s*=/iu.test(source)||/(?:href|src)\s*=\s*["']\s*javascript:/iu.test(source))throw Error('Public build: inline event handler in '+file);
      for(const match of source.matchAll(/\b(href|src)\s*=\s*["']([^"']+)["']/giu))reference(match[2],file,match[1].toLowerCase()==='href');
    }
    if(file.endsWith('.mjs')){
      if(/\beval\s*\(|\bnew\s+Function\s*\(/u.test(source))throw Error('Public build: eval-like execution is incompatible with CSP in '+file);
      for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"]([^'"]+)['"]/gu)){
        const specifier=match[1];
        if(specifier.startsWith('https:')){
          if(new URL(specifier).origin!=='https://esm.sh'||!csp.includes('https://esm.sh'))throw Error('Public build: external module not allowed by CSP: '+specifier);
        }else if(specifier.startsWith('.')||specifier.startsWith('/'))reference(specifier,file);
        else throw Error(`Public build: unbundled import ${specifier} in ${file}.`);
      }
    }
    if(file.endsWith('.css'))for(const match of source.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/giu))reference(match[1],file);
  }
  const worker=files.get('sw.js').toString('utf8'),assetList=/const ASSETS=\[([\s\S]*?)\];/u.exec(worker);
  if(!assetList)throw Error('Public build: missing service-worker allowlist.');
  for(const match of assetList[1].matchAll(/'([^']+)'/gu))reference(match[1],'sw.js');
  const manifest=JSON.parse(files.get('manifest.webmanifest').toString('utf8'));
  for(const icon of manifest.icons||[])reference(icon.src,'manifest.webmanifest');
  return {files:files.size,bytes:[...files.values()].reduce((total,bytes)=>total+bytes.length,0),cache:/const CACHE='([^']+)';/u.exec(worker)?.[1],csp};
}

export function planPublic(sourceRoot=root){
  const files=new Map();
  for(const file of PUBLIC_ASSETS){
    const path=resolve(sourceRoot,file);
    if(!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink())throw Error('Public build: expected a regular file: '+file);
    files.set(file,readFileSync(path));
  }
  const transform=(file,fn)=>files.set(file,Buffer.from(fn(files.get(file).toString('utf8'))));
  transform('app.mjs',source=>integratePhotosApp(integrateApp(source)));
  transform('community.mjs',integratePhotosCommunity);
  transform('sw.js',source=>integratePhotosWorker(integrateWorker(source)));
  transform('index.html',integratePhotosIndex);
  transform('legal.html',integratePhotosLegal);
  for(const file of ['app.mjs','abonnement.html','legal.html'])transform(file,catalogCopy);
  transform('app.mjs',integrateSalesApp);
  transform('subscription.mjs',integrateSalesSubscription);
  transform('abonnement.html',integrateSalesSubscriptionHtml);
  transform('legal.html',integrateSalesLegal);
  const config=JSON.parse(readFileSync(resolve(sourceRoot,'vercel.json'),'utf8'));
  return {files,summary:validatePublic(files,config)};
}

export function buildPublic(sourceRoot=root){
  const {files,summary}=planPublic(sourceRoot),dist=resolve(sourceRoot,'dist');
  if(existsSync(dist)&&lstatSync(dist).isSymbolicLink())throw Error('Public build: dist must not be a symbolic link.');
  const staging=mkdtempSync(resolve(sourceRoot,'.public-build-'));
  try{
    for(const [file,bytes] of files){const output=resolve(staging,file);mkdirSync(dirname(output),{recursive:true});writeFileSync(output,bytes);}
    for(const file of files.keys())if(/\.(mjs|js)$/u.test(file))execFileSync(process.execPath,['--check',resolve(staging,file)],{stdio:'pipe'});
    rmSync(dist,{recursive:true,force:true});renameSync(staging,dist);
  }catch(error){rmSync(staging,{recursive:true,force:true});throw error;}
  console.log(`Public build: ${summary.files} files, ${summary.bytes} bytes; cache ${summary.cache}.`);
  return summary;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))buildPublic();

