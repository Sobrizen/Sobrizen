/** Compare the real distributed application before/after a public blog release. */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const sourceFlag=process.argv.indexOf('--source');
const build=sourceFlag>=0?pathToFileURL(resolve(process.argv[sourceFlag+1],'scripts/build.mjs')):new URL('./build.mjs',import.meta.url);
const {planPublic}=await import(build);
const {files}=planPublic();
const snapshot=Object.fromEntries([...files].map(([name,bytes])=>[name,{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]));
const target=new URL('../artifacts/blog-baseline.json',import.meta.url);
if(process.argv.includes('--capture')){
  mkdirSync(new URL('../artifacts/',import.meta.url),{recursive:true});
  writeFileSync(target,JSON.stringify(snapshot,null,2)+'\n');
  console.log(`Baseline recorded: ${files.size} public resources.`);
}else{
  const before=JSON.parse(readFileSync(target,'utf8'));
  const allowed=new Set(['index.html','sitemap.xml','blog.html']);
  for(const [name,original] of Object.entries(before)){
    if(allowed.has(name)||name.startsWith('blog/'))continue;
    if(snapshot[name]?.sha256!==original.sha256)throw Error(`Existing app resource changed: ${name}`);
  }
  const html=files.get('index.html').toString();
  if(/(?:src|rel="stylesheet" href)="\/blog\//u.test(html))throw Error('Blog resources loaded by the app.');
  const worker=files.get('sw.js').toString();
  if(/['"]\/blog(?:\/|['"])/u.test(worker))throw Error('Blog added to the application service worker.');
  const htmlDelta=files.get('index.html').length-before['index.html'].bytes;
  if(htmlDelta>350)throw Error('App entry grew by more than one small navigation link.');
  const appNames=Object.keys(before).filter(name=>!allowed.has(name)&&!name.startsWith('blog/'));
  console.log(JSON.stringify({unchangedAppResources:appNames.length,addedEntryBytes:htmlDelta,blogPreloads:0,applicationCacheUnchanged:true},null,2));
}
