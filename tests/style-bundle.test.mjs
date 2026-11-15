import test from 'node:test';
import assert from 'node:assert/strict';
import {bundleEntryStyles} from '../scripts/bundle-entry-styles.mjs';
import {planPublic} from '../scripts/build.mjs';

test('the public entry has one blocking stylesheet while preserving the original cascade',()=>{
  const {files}=planPublic();
  const html=files.get('index.html').toString(),css=files.get('experience.css').toString();
  assert.equal([...html.matchAll(/rel="stylesheet"/gu)].length,1);
  assert.ok(css.indexOf('/* v2.css */')<css.indexOf('/* section-colors.css */'));
  assert.ok(css.indexOf('/* section-colors.css */')<css.indexOf('/* calm.css */'));
  assert.ok(css.includes('/* profile-photo.css */'));
  const before=css;bundleEntryStyles(files);
  assert.equal(files.get('experience.css').toString(),before);
});

test('stylesheet order, deduplication and nonstyle links survive bundling',()=>{
  const files=new Map([
    ['index.html',Buffer.from('<link rel="icon" href="/icon.svg"><link rel="stylesheet" href="/base.css"><meta name="description" content="test"><link rel="stylesheet" href="/experience.css"><link rel="stylesheet" href="/base.css">')],
    ['base.css',Buffer.from('body{color:red}')],['experience.css',Buffer.from('body{color:green}')],
  ]);
  assert.deepEqual(bundleEntryStyles(files),{requestsBefore:3,requestsAfter:1});
  assert.match(files.get('index.html').toString(),/rel="icon"/);
  assert.match(files.get('index.html').toString(),/name="description"/);
  assert.equal(files.get('experience.css').toString().split('color:red').length,2);
  assert.ok(files.get('experience.css').toString().indexOf('color:red')<files.get('experience.css').toString().indexOf('color:green'));
});

test('dependencies that would change meaning on relocation fail the build',()=>{
  for(const source of ['@import "other.css";','body{background:url(../asset.svg)}']){
    const files=new Map([['index.html',Buffer.from('<link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/experience.css">')],['base.css',Buffer.from(source)],['experience.css',Buffer.from('')]]);
    assert.throws(()=>bundleEntryStyles(files),/relative dependencies/);
  }
});
