import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {civilDate,elapsedDays,savings,monthGrid,calendarTotals,standardDrinks} from '../blog/tools-core.mjs';
import {mountTools} from '../blog/tools.mjs';
import {planPublic} from '../scripts/build.mjs';

const root=new URL('../',import.meta.url);
const html=name=>readFileSync(new URL(name,root),'utf8');
const fixture=name=>new JSDOM(html('blog/'+name+'.html'),{url:'https://www.sobrizen.com/blog/'+name}).window;
const submit=(win,form)=>form.dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));

test('civil-date counter rejects impossible/future dates and is independent of DST hours',()=>{
  assert.equal(civilDate('2025-02-29'),null);
  assert.equal(civilDate('2024-02-29').day,29);
  assert.equal(civilDate('2026-13-01'),null);
  assert.equal(elapsedDays('2026-03-28','2026-03-31'),3);
  assert.equal(elapsedDays('2026-10-24','2026-10-27'),3);
  assert.equal(elapsedDays('2026-11-18','2026-11-18'),0);
  assert.throws(()=>elapsedDays('2026-11-19','2026-11-18'),/futur/);
});
test('budget projects fixed-day periods, supports French decimals and reports additional cost',()=>{
  assert.deepEqual(savings('35','0'),{weekly:35,month:150,year:1825});
  assert.equal(savings('35,50','7,50').month,120);
  assert.equal(savings('0','7').year,-365);
  for(const value of ['-2','NaN','Infinity','35 €','1e4','1.123','10001',''])assert.throws(()=>savings(value,'0'));
});
test('month grids respect Monday-first offsets and Gregorian leap years',()=>{
  assert.equal(monthGrid('2024-02').days.length,29);
  assert.equal(monthGrid('2025-02').days.length,28);
  assert.equal(monthGrid('2100-02').days.length,28);
  assert.equal(monthGrid('2027-01').offset,4);
  assert.equal(monthGrid('2027-01').days.length,31);
  assert.deepEqual(calendarTotals({a:'without',b:'with',c:'unknown'}),{without:1,with:1});
});
test('counter form renders known days and removes stale results after invalid input',()=>{
  const w=fixture('compteur-jours-sans-alcool'),d=w.document;
  mountTools(d,'2026-11-18',()=>{});
  d.querySelector('[name=start]').value='2026-11-01';submit(w,d.querySelector('form'));
  assert.equal(d.querySelector('[data-count]').textContent,'17');
  assert.equal(d.querySelector('[data-result]').hidden,false);
  d.querySelector('[name=start]').value='2026-11-19';submit(w,d.querySelector('form'));
  assert.match(d.querySelector('[data-error]').textContent,/futur/);
  assert.equal(d.querySelector('[data-result]').hidden,true);
  w.close();
});
test('calculator form renders live results, French decimals and validation feedback',()=>{
  const w=fixture('calcul-economies-arret-alcool'),d=w.document;
  mountTools(d,'2026-11-18',()=>{});
  assert.match(d.querySelector('[data-money=month]').textContent,/150/);
  d.querySelector('[name=before]').value='35,50';d.querySelector('[name=after]').value='7,50';submit(w,d.querySelector('form'));
  assert.match(d.querySelector('[data-money=year]').textContent,/1\s?460/);
  d.querySelector('[name=before]').value='invalide';submit(w,d.querySelector('form'));
  assert.equal(d.querySelector('[data-result]').hidden,true);
  assert.ok(d.querySelector('[data-error]').textContent.length);
  w.close();
});
test('calendar distinguishes unknown from zero consumption, permits corrections and preserves in-page months',()=>{
  const w=fixture('calendrier-sans-alcool-a-imprimer'),d=w.document;let printed=0;
  mountTools(d,'2026-11-18',()=>printed++);
  assert.equal(d.querySelector('[data-observed]').textContent,'0');
  assert.equal(d.querySelector('[data-day="2026-11-19"]').disabled,true);
  const input=d.querySelector('[name=month]');input.value='2024-02';input.dispatchEvent(new w.Event('change'));
  assert.equal(d.querySelectorAll('[data-day]').length,29);
  d.querySelector('[data-day="2024-02-29"]').click();assert.equal(d.querySelector('[data-without]').textContent,'1');
  input.value='2024-03';input.dispatchEvent(new w.Event('change'));assert.equal(d.querySelector('[data-observed]').textContent,'0');
  input.value='2024-02';input.dispatchEvent(new w.Event('change'));assert.equal(d.querySelector('[data-without]').textContent,'1');
  d.querySelector('[data-day="2024-02-29"]').click();assert.equal(d.querySelector('[data-with]').textContent,'1');
  d.querySelector('[data-day="2024-02-29"]').click();assert.equal(d.querySelector('[data-observed]').textContent,'0');
  d.querySelector('[data-print]').click();assert.equal(printed,1);
  w.close();
});
test('evening-plan exercise outputs untrusted text as text and never markup',()=>{
  const w=fixture('ne-plus-boire-alcool-le-soir'),d=w.document;
  mountTools(d,'2026-11-18',()=>{});
  const form=d.querySelector('[data-evening-plan]');submit(w,form);assert.ok(d.querySelector('[data-error]').textContent);
  for(const name of ['moment','alternative','support'])d.querySelector(`[name=${name}]`).value='<img src=x onerror=alert(1)>';
  submit(w,form);
  assert.match(d.querySelector('[data-plan-text]').textContent,/<img/);
  assert.equal(d.querySelectorAll('[data-plan-text] img').length,0);
  w.close();
});
test('without JavaScript, forms stay disabled and cannot send personal fields through a native GET',()=>{
  for(const name of ['compteur-jours-sans-alcool','calcul-economies-arret-alcool','ne-plus-boire-alcool-le-soir']){
    const w=fixture(name),d=w.document;
    assert.equal(d.querySelector('form fieldset[data-controls]').disabled,true);
    assert.ok(d.querySelector('noscript'));
    mountTools(d,'2026-11-18',()=>{});
    assert.equal(d.querySelector('form fieldset[data-controls]').disabled,false);
    w.close();
  }
});
test('all fourteen articles are crawlable without JS, uniquely identified and internally linked',()=>{
  const {files}=planPublic(),pages=[...files.keys()].filter(name=>name.startsWith('blog/')&&name.endsWith('.html'));
  assert.equal(pages.length,14);
  const titles=new Set(),descriptions=new Set(),sitemap=files.get('sitemap.xml').toString();
  for(const name of ['blog.html',...pages]){
    const source=files.get(name).toString(),d=new JSDOM(source).window.document;
    const title=d.title,description=d.querySelector('meta[name=description]').content,canonical=d.querySelector('link[rel=canonical]').href;
    assert.equal(d.querySelectorAll('h1').length,1,name);
    assert.ok(!titles.has(title),name);titles.add(title);
    assert.ok(!descriptions.has(description),name);descriptions.add(description);
    assert.ok(description.length>80&&description.length<180,name);
    assert.equal(canonical,'https://www.sobrizen.com/'+name.replace(/\.html$/u,''));
    assert.ok(sitemap.includes('<loc>'+canonical+'</loc>'),name);
    assert.ok(source.length<38000,name+' HTML budget');
    assert.equal(d.querySelectorAll('script:not([src="/blog/tools.mjs"])').length,0,name);
    assert.equal(d.querySelectorAll('script:not([src])').length,0,name);
    assert.equal(d.querySelectorAll('link[rel=manifest]').length,0,name);
    if(name!=='blog.html'){
      assert.ok(d.querySelector('[itemtype="https://schema.org/BlogPosting"]'),name);
      assert.equal(d.querySelector('[itemprop=author] [itemprop=name]').textContent,'Rédaction Sobrizen');
      assert.ok(d.querySelectorAll('.article-body h2').length>=6,name);
      assert.ok(d.querySelectorAll('.sources a').length>=3,name);
    }
  }
  assert.ok(files.get('blog/blog.css').length<20000);
  assert.ok(files.get('blog/tools.mjs').length+files.get('blog/tools-core.mjs').length<20000);
  assert.ok(files.get('blog/calendrier-sans-alcool-vierge.pdf').subarray(0,5).equals(Buffer.from('%PDF-')));
});

test('standard drinks use the French 10g convention and never round portions to integers',()=>{
  assert.deepEqual(standardDrinks('50','5'),{grams:20,units:2});
  assert.deepEqual(standardDrinks('12,5','12'),{grams:12,units:1.2});
  assert.ok(Math.abs(standardDrinks('3','40').units-0.96)<1e-12);
  assert.equal(standardDrinks('50','8','2').units,6.4);
  assert.equal(standardDrinks('33','0').units,0);
  for(const args of [['0','5'],['-2','5'],['50','101'],['50','5','1.5'],['50','5','0'],['Infinity','5'],['50','5','101'],['50','','1']])assert.throws(()=>standardDrinks(...args));
});

test('units calculator handles French decimals and hides stale results on invalid inputs',()=>{
  const w=fixture('calcul-verres-standard-alcool'),d=w.document,form=d.querySelector('form');
  assert.equal(form.querySelector('[data-controls]').disabled,true);
  mountTools(d,'2026-11-18',()=>{});
  assert.equal(d.querySelector('[data-units]').textContent,'2');
  d.querySelector('[name=volume]').value='12,5';d.querySelector('[name=strength]').value='12';submit(w,form);
  assert.equal(d.querySelector('[data-units]').textContent,'1,2');
  d.querySelector('[name=strength]').value='101';submit(w,form);
  assert.equal(d.querySelector('[data-result]').hidden,true);
  assert.ok(d.querySelector('[data-error]').textContent.length);
  w.close();
});

test('support plan produces a local text file without sending the entered content',()=>{
  const w=fixture('envie-de-boire-alcool-plan-soutien'),d=w.document,downloads=[];
  const original=w.HTMLAnchorElement.prototype.click;
  w.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download);};
  let revoked=false,created;
  w.URL.createObjectURL=blob=>{created=blob;return 'blob:local-support';};
  w.URL.revokeObjectURL=()=>{revoked=true;};w.setTimeout=callback=>callback();
  mountTools(d,'2026-11-18',()=>{});
  for(const name of ['moment','alternative','support'])d.querySelector(`[name=${name}]`).value='<img src=x>';
  submit(w,d.querySelector('form'));d.querySelector('[data-download-plan]').click();
  assert.deepEqual(downloads,['ma-fiche-soutien-sobrizen.txt']);
  assert.equal(created.type,'text/plain;charset=utf-8');assert.ok(created.size>100);assert.equal(revoked,true);
  assert.equal(d.querySelector('[data-plan-text] img'),null);
  w.HTMLAnchorElement.prototype.click=original;w.close();
});
test('blog assets never enter application precache, script imports or blocking styles',()=>{
  const {files}=planPublic();
  for(const name of ['sw.js','app.mjs','bootstrap.mjs','experience.css'])assert.doesNotMatch(files.get(name).toString(),/\/blog\/|\.\/blog\//u,name);
  const d=new JSDOM(files.get('index.html').toString()).window.document;
  assert.ok(d.querySelector('a[href="/blog"]'));
  assert.equal(d.querySelectorAll('script[src^="/blog/"],link[href^="/blog/"]').length,0);
});
