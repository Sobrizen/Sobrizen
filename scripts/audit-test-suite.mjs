/** Sequential audit with one test process at a time, suitable for constrained workstations. */
import assert from 'node:assert/strict';
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url);
const jsdom=require.resolve('jsdom'),pglite=require.resolve('@electric-sql/pglite');
const output=resolve(root,'verification','latency');mkdirSync(output,{recursive:true});
const available=[...readdirSync(root).filter(f=>f.endsWith('.test.mjs')),...readdirSync(resolve(root,'tests')).filter(f=>f.endsWith('.test.mjs')).map(f=>'tests/'+f)].sort();
const requested=process.argv.slice(2),files=requested.length?requested:available;
for(const file of files)assert.ok(available.includes(file),'Unknown test file: '+file);
const results=requested.length?JSON.parse(readFileSync(resolve(output,'tests.json'),'utf8')).filter(r=>!files.includes(r.file)):[];
for(const file of files){
  const started=Date.now();
  const result=spawnSync(process.execPath,['--max-old-space-size=256','--max-semi-space-size=2',file],{
    cwd:root,encoding:'utf8',maxBuffer:8*1024*1024,timeout:180000,
    env:{...process.env,SOBRIZEN_QA_JSDOM:jsdom,SOBRIZEN_JSDOM_PATH:jsdom,SOBRIZEN_QA_PGLITE:pglite,SOBRIZEN_PGLITE_PATH:pglite},
  });
  const log=(result.stdout||'')+(result.stderr||'')+(result.error?.stack||'');
  writeFileSync(resolve(output,basename(file)+'.log'),log);
  const count=label=>Number(new RegExp('ℹ '+label+' (\\d+)').exec(log)?.[1]||0);
  const entry={file,exitCode:result.status,signal:result.signal,durationMs:Date.now()-started,tests:count('tests'),passed:count('pass'),failed:count('fail'),resourceFailure:/out of memory|allocation failed|Failed to allocate|insuffisant/i.test(log)};
  results.push(entry);writeFileSync(resolve(output,'tests.json'),JSON.stringify(results,null,2)+'\n');
  console.log(`${entry.exitCode===0?'PASS':'FAIL'} ${file}${entry.resourceFailure?' (memory)':''}`);
}
const failures=results.filter(r=>r.exitCode!==0);
console.log(JSON.stringify({files:results.length,failures:failures.map(r=>r.file),resourceFailures:failures.filter(r=>r.resourceFailure).length,registeredTests:results.reduce((n,r)=>n+r.tests,0)}));
process.exitCode=failures.length?1:0;
