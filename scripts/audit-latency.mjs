/** Local browser timings on the public build. Fictitious demo data; no external traffic. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, extname, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const label=process.argv[2]||'current';
assert.match(label,/^[a-z-]+$/);
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=resolve(root,'dist','.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
    if(!file.startsWith(resolve(root,'dist')+'/')&&!file.startsWith(resolve(root,'dist')+'\\'))throw Error('Outside public build');
    res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');
    res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={label,generatedAt:new Date().toISOString(),cpuSlowdown:4,routes:[],interactions:[],stress:[],errors:[],externalRequests:[]};
try{
  for(const width of [390,1280]){
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',timezoneId:'Europe/Paris'});
    await context.route('**/*',route=>{
      if(new URL(route.request().url()).origin===origin)return route.continue();
      report.externalRequests.push(route.request().url());return route.abort();
    });
    const page=await context.newPage();
    page.on('pageerror',error=>report.errors.push(error.message));
    await page.addInitScript(()=>{
      Object.defineProperty(navigator,'onLine',{get:()=>false});
      window.__latency={formatters:0,longTasks:[]};
      const Original=Intl.DateTimeFormat;
      Intl.DateTimeFormat=new Proxy(Original,{construct(target,args){window.__latency.formatters++;return Reflect.construct(target,args);},apply(target,self,args){window.__latency.formatters++;return Reflect.apply(target,self,args);}});
      new PerformanceObserver(list=>window.__latency.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
    });
    await page.goto(origin);
    await page.locator('[data-action="demo"]').first().click();
    await page.waitForSelector('.dy-page');
    const session=await context.newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate',{rate:4});
    for(const destination of ['home','progress','health','journey','journal','agenda','games','community','profile','movement','progress']){
      const measurement=await page.evaluate(async destination=>{
        const start=performance.now(),before=window.__latency.formatters;
        const target=destination==='movement'?document.querySelector('[data-move="open"]'):document.querySelector(`#nav [data-page="${destination}"]`);
        if(!target)throw Error('Missing route '+destination);
        target.click();
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        return {destination,ms:performance.now()-start,formatters:window.__latency.formatters-before,nodes:document.querySelectorAll('#content *').length,overflow:document.documentElement.scrollWidth>innerWidth};
      },destination);
      report.routes.push({width,...measurement});
      assert.equal(measurement.overflow,false,`Horizontal overflow on ${destination}/${width}`);
    }
    if(label!=='baseline'){
      await page.getByRole('tab',{name:'Calendrier',exact:true}).click();
      const previousMonth=await page.locator('.dy-calendar-controls h3').textContent();
      await page.locator('#dy-calendar [data-daily-action="month-prev"]').click();
      assert.notEqual(await page.locator('.dy-calendar-controls h3').textContent(),previousMonth);
      await page.locator('#dy-calendar [data-daily-action="day"]').first().click();
      await page.locator('#dailyEntryForm [name="sober_today"][value="true"]').check();
      await page.locator('#dailyEntryForm [type="submit"]').click();
      await page.waitForSelector('#dailyEntryForm',{state:'hidden'});
      report.interactions.push({width,name:'calendar navigation and daily declaration',passed:true});
      await page.evaluate(()=>document.querySelector('#nav [data-page="home"]').click());
      await page.locator('#content [data-action="journal-new"]').click();
      await page.locator('#journalForm [name="title"]').fill('Note fictive de test performance');
      await page.locator('#journalForm [name="body"]').fill('Contenu fictif privé, sans appel à un service réel.');
      await page.locator('#journalForm [type="submit"]').click();
      await page.waitForSelector('#journalForm',{state:'hidden'});
      await page.evaluate(()=>document.querySelector('#nav [data-page="journal"]').click());
      await page.getByText('Note fictive de test performance',{exact:true}).waitFor();
      report.interactions.push({width,name:'private journal creation and display',passed:true});
      await page.evaluate(()=>document.querySelector('#nav [data-page="progress"]').click());
      await page.getByRole('tab',{name:'Mon bilan',exact:true}).waitFor();
    }
    // Measure the same chart controller with a sizeable legal history.
    report.stress.push({width,...await page.evaluate(async()=>{
      const {moveDay}=await import('/core.mjs');
      const {createTimelineUI}=await import('/timeline-ui.mjs');
      const today='2026-11-15',start='2021-01-01';
      const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
      const doc={schema_version:3,timezone:'Europe/Paris',baseline:{started_on:start,units_week:14,cost_week:35},
        events:Array.from({length:100},(_,i)=>({id:id(i+1),started_on:moveDay(start,i*20),state:i%2?'abstinent':'drinking',units_week:i%2?0:14,cost_week:i%2?0:35,note:'Historique fictif'})),
        ranges:[],occasions:Array.from({length:500},(_,i)=>({id:id(i+1001),date:moveDay(start,i*4),units:2,cost:5})),
        goal:{mode:'observe',weekly_limit:null,daily_limit:null,target_on:null,why:'',triggers:[],support_first:false,planned_action:''}};
      const data={document:doc,checks:[],today,ready:true};
      const content=document.getElementById('content');
      const ui=createTimelineUI({data:()=>data,render:()=>{content.innerHTML=ui.view();},programCount:()=>0});
      const before=window.__latency.formatters,startTime=performance.now();
      content.innerHTML=ui.view();
      const renderMs=performance.now()-startTime,renderFormatters=window.__latency.formatters-before;
      const chart=content.querySelector('.tl-chart'),svg=chart.querySelector('svg');
      const point=content.querySelector('.tl-chart-point');
      const beforePoint=window.__latency.formatters,pointStart=performance.now();
      point.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
      const pointMs=performance.now()-pointStart;
      const preservesSvg=chart.querySelector('svg')===svg&&svg.isConnected;
      // Separate settled interaction from the first forced layout after injecting
      // 600 declarations; a real user reaches the graph after that first paint.
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const warmStart=performance.now();
      point.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
      const warmPointMs=performance.now()-warmStart;
      const keyboardMovesSelection=chart.querySelector('.tl-chart-point[aria-pressed="true"]')!==point;
      return {renderMs,renderFormatters,pointMs,warmPointMs,pointFormatters:window.__latency.formatters-beforePoint,declarations:600,preservesSvg,keyboardMovesSelection};
    })});
    if(label!=='baseline'){
      assert.equal(report.stress.at(-1).preservesSvg,true);
      assert.equal(report.stress.at(-1).keyboardMovesSelection,true);
    }
    await context.close();
  }
  assert.deepEqual(report.errors,[]);
  assert.deepEqual(report.externalRequests,[]);
  await mkdir(resolve(root,'verification','latency'),{recursive:true});
  const output=resolve(root,'verification','latency',label+'.json');
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
