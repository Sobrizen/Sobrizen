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
import {integrateSalesSubscriptionHtml} from '../scripts/sales-launch.mjs';

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
test('sales HTML preserves one current-account section and refuses missing or ambiguous insertion anchors',()=>{
  const account='<section><h2>Mon accès actuel</h2><p>Gestion de mon abonnement</p></section>';
  const anchor='<article class="card"><span class="eyebrow">Le socle';
  const valid=`<main>${anchor}</span></article>${account}</main>`;
  const transformed=integrateSalesSubscriptionHtml(valid);
  assert.equal(transformed.split(account).length,2);
  assert.ok(transformed.indexOf(account)<transformed.indexOf(anchor));
  assert.throws(()=>integrateSalesSubscriptionHtml(valid.replace(anchor,'<article>')),/missing: current-account placement/);
  assert.throws(()=>integrateSalesSubscriptionHtml(valid+anchor),/ambiguous: current-account placement/);
  assert.throws(()=>integrateSalesSubscriptionHtml(valid.replace(account,'')),/missing or ambiguous current-account section/);
  assert.throws(()=>integrateSalesSubscriptionHtml(valid+account),/missing or ambiguous current-account section/);
});
test('asset insertion never rolls a later service-worker version backwards',()=>{
  const source="const CACHE='sobrizen-v99-release';\nconst ASSETS=['/app.mjs'];";
  const bridged=integratePhotosWorker(integrateWorker(source));
  assert.match(bridged,/sobrizen-v99-release/);assert.match(bridged,/profile-photo-ui.mjs/);assert.match(bridged,/community.mjs/);
  assert.equal(integratePhotosWorker(integrateWorker(bridged)),bridged);
});

test('Mon Plan build preserves one account centre and exactly two purchase offers',()=>{
 const source=readFileSync(join(root,'abonnement.html'),'utf8');assert.equal(integrateSalesSubscriptionHtml(source),source);
 assert.throws(()=>integrateSalesSubscriptionHtml(source.replace('id="myPlan"','id="removed"')),/missing or ambiguous/);
 assert.throws(()=>integrateSalesSubscriptionHtml(source+'<div id="currentPrice"></div>'),/missing or ambiguous/);
 assert.throws(()=>integrateSalesSubscriptionHtml(source+'<input name="plan" value="launch">'),/exactly two plans/);
 assert.doesNotMatch(source,/launchCounter|places restantes|places attribuées|29,99 €|19,99 €/);
});
test('precache rejects duplicate URLs including exact literals, path aliases and ignored fragments',()=>{
  const {files}=planPublic(root),worker=files.get('sw.js').toString();
  for(const entry of ["'/app.mjs'",'"/app.mjs"',"'/./app.mjs'","'/app.mjs#duplicate'"]){
    const candidate=new Map(files);candidate.set('sw.js',Buffer.from(worker.replace('const ASSETS=[','const ASSETS=['+entry+',')));
    assert.throws(()=>validatePublic(candidate,config),/duplicate service-worker URL/,entry);
  }
});
test('precache parsing accepts formatting changes but refuses unknown or unpublished asset entries',()=>{
  const {files}=planPublic(root),worker=files.get('sw.js').toString();
  const formatted=new Map(files);formatted.set('sw.js',Buffer.from(worker.replace('const ASSETS=[','const ASSETS = [ /* public assets */')));
  assert.doesNotThrow(()=>validatePublic(formatted,config));
  for(const entry of ['...[]','unknownAsset',',',"'/not-published.mjs'"]){
    const candidate=new Map(files);candidate.set('sw.js',Buffer.from(worker.replace('const ASSETS=[','const ASSETS=['+entry+',')));
    assert.throws(()=>validatePublic(candidate,config),/literal URLs|unpublished/);
  }
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
test('JavaScript dependency validation ignores HTML from fields, comments and quoted import examples',()=>{
  const {files}=planPublic(root),candidate=new Map(files);
  candidate.set('app.mjs',Buffer.from([
    'const html = `<input name="from" min="1900-01-01"><span>from "a label"</span>`;',
    'const example = "import \'./not-shipped.mjs\'; eval(\'example\')";',
    'const pattern = /from ["\']|import\\(/u;',
    '// import "./not-shipped.mjs"; export * from "./not-shipped.mjs";',
    '/* import("./not-shipped.mjs"); new Function("example"); */',
    'const loader = {import(value) {return value;}}; loader.import("not-a-module");',
  ].join('\n')));
  assert.doesNotThrow(()=>validatePublic(candidate,config));
});
test('real import and re-export syntax resolves published files, including comments and escaped paths',()=>{
  const {files}=planPublic(root),candidate=new Map(files);
  candidate.set('app.mjs',Buffer.from([
    "import /* before binding */ {dayKey as currentDay} from /* before source */ './core.mjs';",
    "import './core\\u002emjs';",
    "export {dayKey as dateKey} from './core.mjs';",
    "export * from './core.mjs';",
    "export * as dates from './core.mjs';",
    "async function load(){await import(/* source comment */ './core.mjs'); await import(`./core.mjs`);}",
  ].join('\n')));
  assert.doesNotThrow(()=>validatePublic(candidate,config));
});
test('static imports, re-exports and nested dynamic imports fail for unpublished or unbundled dependencies',()=>{
  const {files}=planPublic(root);
  for(const source of [
    "import /* source */ './missing-sensitive-module.mjs';",
    "export {missing} from /* source */ './missing-sensitive-module.mjs';",
    "export * from './missing-sensitive-module.mjs';",
    "async function load(){return import(/* source */ './missing-sensitive-module.mjs');}",
    "async function load(){return import(`./missing-sensitive-module.mjs`);}",
    'const html = `<span>${import("./missing-sensitive-module.mjs")}</span>`;',
    "import 'node:fs';",
    "import('unbundled-library');",
    "import('https://not-allowed.example/module.mjs');",
  ]){
    const candidate=new Map(files);candidate.set('app.mjs',Buffer.from(source));
    assert.throws(()=>validatePublic(candidate,config),/unpublished|unbundled|not allowed by CSP/,source);
  }
});
test('computed or invalid dynamic module paths fail closed instead of escaping dependency validation',()=>{
  const {files}=planPublic(root);
  for(const source of [
    'export const load = path => import(path);',
    'export const load = name => import(`./${name}.mjs`);',
    "export const load = () => import('./' + 'core.mjs');",
    'export const load = () => import(null);',
  ]){
    const candidate=new Map(files);candidate.set('app.mjs',Buffer.from(source));
    assert.throws(()=>validatePublic(candidate,config),/computed import cannot be verified/);
  }
  const invalid=new Map(files);invalid.set('app.mjs',Buffer.from('const invalid = ;'));
  assert.throws(()=>validatePublic(invalid,config),/invalid JavaScript in app\.mjs/);
});
test('real eval-like execution and classic worker imports remain checked after syntax-based validation',()=>{
  const {files}=planPublic(root);
  for(const source of ["eval /* gap */ ('example');","new /* gap */ Function('example');","Function('example');"]){
    const candidate=new Map(files);candidate.set('app.mjs',Buffer.from(source));
    assert.throws(()=>validatePublic(candidate,config),/eval-like execution/);
  }
  const worker=new Map(files);
  worker.set('sw.js',Buffer.from(files.get('sw.js').toString()+"\nasync function hiddenImport(){return import('./missing-worker-module.mjs');}"));
  assert.throws(()=>validatePublic(worker,config),/sw\.js references unpublished/);
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
