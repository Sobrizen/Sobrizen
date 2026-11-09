import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,mkdirSync,readdirSync,rmSync,existsSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {planPublic,buildPublic,validatePublic} from '../scripts/build.mjs';
import {PUBLIC_ASSETS} from '../scripts/public-assets.mjs';
import {integrateApp,integrateWorker} from '../scripts/integrate-community.mjs';
import {integratePhotosApp,integratePhotosWorker} from '../scripts/integrate-profile-photos.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(readFileSync(join(root,'vercel.json'),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function inventory(dir,prefix=''){return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?inventory(join(dir,entry.name),prefix+entry.name+'/'):[prefix+entry.name]).sort();}

test('public plan contains all imports/resources and excludes SQL, tests, docs and billing handler',()=>{
  const before=new Map(PUBLIC_ASSETS.map(file=>[file,hash(readFileSync(join(root,file)))]));
  const {files,summary}=planPublic(root);
  assert.equal(summary.files,PUBLIC_ASSETS.length);assert.ok(summary.bytes>100000);
  for(const privatePath of ['billing/handler.mjs','db/20261109_sensitive_consent_and_journal.sql','schema/agenda.sql','game-records.sql','README.md','tests/agenda-core.test.mjs','package.json'])assert.equal(files.has(privatePath),false,privatePath);
  for(const file of ['agenda-ui.mjs','agenda.css','game-records.mjs','games-runtime.mjs','subscription.mjs','legal.mjs','billing/core.mjs'])assert.equal(files.has(file),true,file);
  for(const [file,digest] of before)assert.equal(hash(readFileSync(join(root,file))),digest,'Source mutated: '+file);
  assert.match(files.get('index.html').toString(),/data-page="agenda"/);
});
test('configured game initialization survives both bridges and repeated builds',()=>{
  const source=readFileSync(join(root,'app.mjs'),'utf8');
  assert.match(source,/\ninitGames\(\{/);
  const bridged=integratePhotosApp(integrateApp(source));
  assert.match(bridged,/initGames\(\{isPremium:/);
  assert.equal(integratePhotosApp(integrateApp(bridged)),bridged);
});
test('asset insertion never rolls a later service-worker version backwards',()=>{
  const source="const CACHE='sobrizen-v99-release';\nconst ASSETS=['/app.mjs'];";
  const bridged=integratePhotosWorker(integrateWorker(source));
  assert.match(bridged,/sobrizen-v99-release/);assert.match(bridged,/profile-photo-ui.mjs/);assert.match(bridged,/community.mjs/);
  assert.equal(integratePhotosWorker(integrateWorker(bridged)),bridged);
});
test('CSP is enforced with exact services and rejects reintroduced inline scripts or handlers',()=>{
  const {files}=planPublic(root),policy=config.headers[0].headers.find(h=>h.key==='Content-Security-Policy').value;
  assert.equal(config.outputDirectory,'dist');assert.ok(policy.includes("script-src-attr 'none'"));assert.ok(policy.includes("frame-ancestors 'none'"));
  assert.ok(policy.includes('https://lnvtowdbbagwfbewnchz.supabase.co'));assert.equal(policy.includes('https://*.supabase.co'),false);
  for(const snippet of ['<script>alert(1)</script>','<button onclick="alert(1)">x</button>']){
    const broken=new Map(files);broken.set('index.html',Buffer.from(files.get('index.html').toString()+snippet));assert.throws(()=>validatePublic(broken,config),/inline/);
  }
  const broken=new Map(files);broken.set('app.mjs',Buffer.from(files.get('app.mjs').toString()+"\nimport './missing-sensitive-module.mjs';"));assert.throws(()=>validatePublic(broken,config),/unpublished/);
});
test('actual build in an isolated copy produces only allowlisted files and preserves source',()=>{
  const dir=mkdtempSync(join(tmpdir(),'sobrizen-public-build-'));
  try{
    for(const file of PUBLIC_ASSETS){const path=join(dir,file);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,readFileSync(join(root,file)));}
    writeFileSync(join(dir,'vercel.json'),JSON.stringify(config));writeFileSync(join(dir,'INTERNAL.md'),'Do not publish');
    const before=hash(readFileSync(join(dir,'app.mjs'))),summary=buildPublic(dir);
    assert.equal(summary.files,PUBLIC_ASSETS.length);assert.deepEqual(inventory(join(dir,'dist')),PUBLIC_ASSETS.slice().sort());
    assert.equal(hash(readFileSync(join(dir,'app.mjs'))),before);assert.equal(existsSync(join(dir,'dist/INTERNAL.md')),false);
    assert.equal(existsSync(join(dir,'dist/vercel.json')),false);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
