/** Test-only DOM/runtime adapters. Production modules stay unchanged; the external service is mocked. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import {webcrypto} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

export const REPO = fileURLToPath(new URL('../', import.meta.url));
const NativeDate=Date, nativeTimeout=setTimeout, nativeClearTimeout=clearTimeout;
let clock=NativeDate.parse('2026-10-27T12:30:00Z');
class FixedDate extends NativeDate {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
export const setNow=value=>{clock=typeof value==='number'?value:NativeDate.parse(value);};
export const now=()=>clock;
export const settle=async(ms=8)=>{await Promise.resolve();await new Promise(resolve=>nativeTimeout(resolve,ms));await Promise.resolve();};
export const $=(selector,root=document)=>root.querySelector(selector);
export const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
export const txt=(selector,root=document)=>$(selector,root)?.textContent.trim()||'';

export async function environment({online=false,mobile=false}={}){
  let library;
  const location=process.env.SOBRIZEN_QA_JSDOM||'/tmp/sobrizen-audit-qa/node_modules/jsdom/lib/api.js';
  try{library=await import(pathToFileURL(location).href);}catch(error){throw Error(`Install the test-only dependency first: npm install --prefix /tmp/sobrizen-audit-qa --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org jsdom@30.1.3\n${error.message}`);}
  const {JSDOM,VirtualConsole}=library, errors=[],navigations=[],confirms=[],intervals=new Map(),rafs=new Map(),downloads=[];
  let intervalId=1,rafId=1,frameClock=1000,confirmAnswer=true;
  const vc=new VirtualConsole();vc.on('jsdomError',error=>{if(/navigation to another Document|Not implemented: navigation/i.test(error.message))navigations.push(error.message);else errors.push(error.stack||error.message);});
  const dom=new JSDOM(await readFile(`${REPO}/index.html`,'utf8'),{url:'https://sobrizen.test/',pretendToBeVisual:true,runScripts:'outside-only',virtualConsole:vc}),w=dom.window;
  process.env.TZ='Europe/Paris';globalThis.Date=FixedDate;w.Date=FixedDate;
  for(const key of ['window','document','navigator','location','history','localStorage','sessionStorage','MutationObserver','HTMLElement','HTMLDialogElement','HTMLFormElement','Element','Node','Event','CustomEvent','SubmitEvent','FormData','DOMException','AbortController','AbortSignal','KeyboardEvent','PointerEvent'])Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='window'?w:w[key]});
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:webcrypto});
  Object.defineProperty(w.navigator,'onLine',{configurable:true,get:()=>online});
  Object.defineProperty(w,'innerWidth',{configurable:true,value:mobile?390:1280});
  Object.defineProperty(w,'innerHeight',{configurable:true,value:844});
  const matchMedia=query=>({media:query,matches:/max-width/.test(query)?mobile:false,onchange:null,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
  globalThis.matchMedia=w.matchMedia=matchMedia;globalThis.getComputedStyle=w.getComputedStyle.bind(w);
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.HTMLElement.prototype.getClientRects=function(){return this.closest('[hidden],[inert]')?[]:[this.getBoundingClientRect()];};
  w.HTMLElement.prototype.getBoundingClientRect=function(){const width=this.matches('.ga-stage,.ga-arena')?320:100,height=this.matches('.ga-stage,.ga-arena')?400:40;return{x:0,y:0,left:0,top:0,right:width,bottom:height,width,height,toJSON(){return this;}};};
  w.HTMLElement.prototype.setPointerCapture=()=>{};w.HTMLElement.prototype.releasePointerCapture=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const context=new Proxy({canvas:{},measureText:()=>({width:30}),createLinearGradient:()=>({addColorStop(){}})},{get:(target,key)=>key in target?target[key]:()=>{}});
  w.HTMLCanvasElement.prototype.getContext=()=>context;
  globalThis.ResizeObserver=w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
  globalThis.requestAnimationFrame=w.requestAnimationFrame=fn=>{const id=rafId++;rafs.set(id,fn);return id;};
  globalThis.cancelAnimationFrame=w.cancelAnimationFrame=id=>rafs.delete(id);
  Object.defineProperty(w.performance,'now',{value:()=>frameClock});
  globalThis.performance={now:()=>frameClock};
  globalThis.setTimeout=(fn,delay,...args)=>{const handle=nativeTimeout(fn,delay,...args);handle.unref?.();return handle;};
  globalThis.clearTimeout=nativeClearTimeout;
  globalThis.setInterval=w.setInterval=(fn,delay)=>{const id=intervalId++;intervals.set(id,{fn,delay});return id;};
  globalThis.clearInterval=w.clearInterval=id=>intervals.delete(id);
  globalThis.confirm=w.confirm=message=>{confirms.push(message);return confirmAnswer;};
  globalThis.alert=w.alert=()=>{};
  globalThis.fetch=async()=>{throw Error('Unexpected real network call in UX audit');};
  w.addEventListener('error',event=>{errors.push(event.error?.stack||event.message);event.preventDefault();});
  process.on('unhandledRejection',error=>errors.push(error?.stack||String(error)));
  const objectURL=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{downloads.push(blob);return objectURL(blob);};
  return{dom,w,errors,navigations,confirms,downloads,intervals,rafs,
    answer:value=>{confirmAnswer=value;},
    async tick(){for(const{fn}of[...intervals.values()])fn();await settle();},
    async frames(count=1,step=32){for(let i=0;i<count;i++){frameClock+=step;const callbacks=[...rafs.values()];rafs.clear();for(const fn of callbacks)fn(frameClock);}await settle();},
    close(){dom.window.close();intervals.clear();rafs.clear();},
  };
}

export async function click(selector){const el=typeof selector==='string'?$(selector):selector;assert.ok(el,`Missing click target ${selector}`);assert.notEqual(el.disabled,true,`Disabled target ${selector}`);el.click();await settle();return el;}
export async function value(form,name,val){assert.ok(form,`Missing form for ${name}`);const input=form.elements.namedItem(name);assert.ok(input,`Missing field ${name}`);if(input.type==='checkbox')input.checked=!!val;else input.value=val;const target=input instanceof Element?input:form.querySelector(`[name="${name}"][value="${val}"]`);assert.ok(target);target.dispatchEvent(new Event('input',{bubbles:true}));target.dispatchEvent(new Event('change',{bubbles:true}));await settle();}
export async function submit(form){assert.ok(form?.isConnected,'Form must be connected');const submitter=form.querySelector('button[type="submit"],button:not([type]),input[type="submit"]');assert.ok(submitter,'Missing submit button');form.dispatchEvent(new SubmitEvent('submit',{bubbles:true,cancelable:true,submitter}));await settle();}
export async function key(el,key,code=key){const event=new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key,code});el.dispatchEvent(event);await settle();return event;}
export async function closeModal(){if($('#modal')?.open)await click('#modal [data-action="close"]');}
export async function route(page){await closeModal();if($('#appNav')?.getAttribute('aria-hidden')==='true')await click('[data-action="menu-toggle"]');await click(`#nav [data-page="${page}"]`);}
export async function boot({mock=null}={}){
  if(mock){globalThis.__sobrizenQaClient=mock.client;registerHooks({resolve(specifier,context,next){if(/^https:\/\/esm\.sh\/@supabase\/supabase-js@/.test(specifier))return{url:'sobrizen-qa:supabase',shortCircuit:true};return next(specifier,context);},load(url,context,next){if(url==='sobrizen-qa:supabase')return{format:'module',source:'export function createClient(){return globalThis.__sobrizenQaClient;}',shortCircuit:true};return next(url,context);}});}
  for(const name of ['app.mjs','movement.mjs','ergonomics.mjs'])await import(pathToFileURL(`${REPO}/${name}`).href);
  document.dispatchEvent(new Event('DOMContentLoaded'));await settle(35);
}

export const UID='11111111-1111-4111-8111-111111111111';
export const UID2='22222222-2222-4222-8222-222222222222';
const id=n=>`00000000-0000-4000-8000-${n.toString(16).padStart(12,'0')}`;
const clone=value=>structuredClone(value);

export async function mockService({consent=true,premium=false}={}){
  const {timelineStopBasis}=await import('../timeline-core.mjs');
  const stamp='2026-10-27T10:00:00.000Z';
  const goal={mode:'abstain',weekly_limit:null,daily_limit:null,target_on:null,why:'Motivation fictive QA',triggers:[],support_first:false,planned_action:''};
  const doc={schema_version:3,timezone:'Europe/Paris',baseline:{started_on:'2026-01-01',units_week:14,cost_week:35},events:[{id:id(1),started_on:'2026-10-25',state:'abstinent',units_week:0,cost_week:0,note:'',stopped_at:'2026-10-25T12:30:00.000Z'}],occasions:[],ranges:[],goal};
  doc.events[0].stop_basis=timelineStopBasis(doc,[],doc.events[0].started_on);
  const settings={user_id:UID,privacy_ack_at:stamp,health_data_consent_at:consent?stamp:null,health_data_consent_revoked_at:null,health_data_consent_version:consent?'2026-10-02-v1':null,support_name:'Contact fictif QA',support_phone:'0100000000',response_plan:'QA PLAN SENSIBLE À NE PAS CHARGER SANS ACCORD',risky_situation:'Situation fictive QA',hidden_authors:[],reminder_time:'20:00',updated_at:stamp};
  const tables={
    profiles:[{id:UID,display_name:'Compte QA',username:'compte_qa',bio:'Profil fictif',created_at:stamp},{id:UID2,display_name:'Autre compte QA',username:'autre_qa',bio:''}],
    user_settings:[settings,{user_id:UID2,privacy_ack_at:stamp,health_data_consent_at:null,health_data_consent_revoked_at:null,hidden_authors:[]}],
    billing_subscriptions:premium?[{user_id:UID,status:'active',paid_until:'2027-01-01T00:00:00Z',cancel_at_period_end:false}]:[],premium_test_grants:[],
    sobriety_journeys:[{user_id:UID,started_at:doc.events[0].stopped_at,weekly_spend_estimate:35,why_text:'Motivation fictive QA',goal_note:'Objectif QA',updated_at:stamp}],
    progress_settings:[{user_id:UID,baseline_units_week:14,baseline_cost_week:35,subscription_started_on:'2026-01-01',updated_at:stamp}],
    progress_chapters:[{id:id(2),user_id:UID,effective_on:'2026-10-25',...goal,origin:'chosen',created_at:stamp}],subscription_anchors:[],
    journey_timelines:[{user_id:UID,document:doc,revision:1,created_at:stamp,updated_at:stamp}],
    daily_checkins:[{id:id(3),user_id:UID,checkin_date:'2026-10-26',sober_today:true,mood:3,energy:4,craving:0,note:'Bilan fictif QA',updated_at:stamp}],
    journal_entries:[{id:id(4),user_id:UID,entry_date:'2026-10-26',title:'Note privée QA',body:'Corps privé QA',kind:'reflection',created_at:stamp}],program_progress:[],urge_events:[],reasons:[],
    health_checkins:[{id:id(5),user_id:UID,checkin_date:'2026-10-26',mood:3,energy:4,sleep_quality:3,anxiety:2,concentration:3,physical_comfort:4,note:'Ressenti fictif QA',created_at:stamp,updated_at:stamp}],
    posts:[{id:id(6),author_id:UID2,body:'Publication fictive QA',kind:'victory',created_at:stamp,profiles:{display_name:'Autre compte QA'},post_likes:[{count:0}],comments:[{count:0}]}],post_likes:[],comments:[],content_reports:[],
  };
  const calls=[],gates=[];let authCallback=()=>{},currentUser={id:UID},serial=20;
  const faults={health:null,timeline:null};
  const ownerTables=new Set(['user_settings','billing_subscriptions','premium_test_grants','sobriety_journeys','progress_settings','progress_chapters','subscription_anchors','journey_timelines','daily_checkins','journal_entries','program_progress','urge_events','reasons','health_checkins']);
  function defer(match){let release;const promise=new Promise(resolve=>{release=resolve;});const gate={match,promise,release,used:false,call:null};gates.push(gate);return gate;}
  async function pause(call,result){const gate=gates.find(g=>!g.used&&g.match(call));if(gate){gate.used=true;gate.call=call;await gate.promise;}return result;}
  class Query{
    constructor(table){assert.ok(Object.hasOwn(tables,table),`Unexpected table ${table}`);Object.assign(this,{table,op:'select',columns:'*',filters:[],orders:[],singleMode:false,limitCount:null,rangeBounds:null,payload:null,conflict:null});}
    select(columns='*'){this.columns=columns;return this;}eq(key,val){this.filters.push([key,val]);return this;}is(key,val){this.filters.push([key,{is:val}]);return this;}order(key,options={}){this.orders.push([key,options]);return this;}limit(n){this.limitCount=n;return this;}range(a,b){this.rangeBounds=[a,b];return this;}maybeSingle(){this.singleMode=true;return this;}single(){this.singleMode=true;return this;}in(key,values){this.filters.push([key,{in:values}]);return this;}ilike(key,pattern){this.filters.push([key,{ilike:pattern.replaceAll('%','').toLocaleLowerCase()}]);return this;}
    upsert(payload,options={}){this.op='upsert';this.payload=clone(payload);this.conflict=options.onConflict;return this;}insert(payload){this.op='insert';this.payload=clone(payload);return this;}update(payload){this.op='update';this.payload=clone(payload);return this;}delete(){this.op='delete';return this;}
    then(resolve,reject){return this.run().then(resolve,reject);}
    async run(){
      const call={table:this.table,op:this.op,columns:this.columns,filters:clone(this.filters),payload:clone(this.payload),range:clone(this.rangeBounds)};calls.push(call);
      if(ownerTables.has(this.table)){const owner=this.filters.some(([k,v])=>k==='user_id'&&typeof v==='string')||this.payload?.user_id;assert.ok(owner,`Private query lacks owner scope: ${this.table}/${this.op}`);}
      const matches=row=>this.filters.every(([key,val])=>{
        if(val&&typeof val==='object'&&Object.hasOwn(val,'is'))return(row[key]??null)===val.is;
        if(val?.in)return val.in.includes(row[key]);
        if(val?.ilike!==undefined)return String(row[key]||'').toLocaleLowerCase().includes(val.ilike);
        // PostgREST accepts serialized JSON equality filters for JSONB CAS values.
        if(row[key]&&typeof row[key]==='object'&&typeof val==='string'){
          try{return isDeepStrictEqual(row[key],JSON.parse(val));}catch{return false;}
        }
        return row[key]===val;
      });
      let rows=tables[this.table].filter(matches);
      if(this.op==='update'){for(const row of rows)Object.assign(row,this.payload);}
      if(this.op==='delete'){tables[this.table]=tables[this.table].filter(row=>!matches(row));}
      if(['upsert','insert'].includes(this.op)){
        // Model the unique daily constraint so a concurrent insert cannot silently win.
        if(this.op==='insert'&&this.table==='daily_checkins'&&tables[this.table].some(row=>row.user_id===this.payload.user_id&&row.checkin_date===this.payload.checkin_date)){
          return pause(call,{data:null,error:{code:'23505',message:'Duplicate daily declaration in QA'}});
        }
        const keys=(this.conflict||'id').split(','),existing=this.op==='upsert'&&tables[this.table].find(row=>keys.every(key=>this.payload[key]!==undefined&&row[key]===this.payload[key]));
        const saved={...existing,...this.payload,id:existing?.id||this.payload.id||id(++serial),created_at:existing?.created_at||new Date().toISOString(),updated_at:new NativeDate(clock+serial).toISOString()};
        if(existing)Object.assign(existing,saved);else tables[this.table].push(saved);rows=[saved];
      }
      for(const[key,options]of[...this.orders].reverse())rows.sort((a,b)=>String(a[key]||'').localeCompare(String(b[key]||''))*(options.ascending===false?-1:1));
      if(this.rangeBounds)rows=rows.slice(this.rangeBounds[0],this.rangeBounds[1]+1);if(this.limitCount!==null)rows=rows.slice(0,this.limitCount);
      if(this.columns!=='*'&&!this.columns.includes('(')){const keys=this.columns.split(',').map(k=>k.trim());rows=rows.map(row=>Object.fromEntries(keys.filter(key=>key in row).map(key=>[key,row[key]])));}
      const result={data:clone(this.singleMode?rows[0]||null:rows),error:null};return pause(call,result);
    }
  }
  const client={from:table=>new Query(table),auth:{onAuthStateChange:callback=>{authCallback=callback;return{data:{subscription:{unsubscribe(){}}}};},getSession:async()=>({data:{session:currentUser?{user:currentUser}:null},error:null}),signOut:async()=>{currentUser=null;authCallback('SIGNED_OUT',null);return{data:{},error:null};}},
    async rpc(name,args){const call={rpc:name,args:clone(args)};calls.push(call);let result;
      if(name==='save_health_checkin'){
        if(faults.health){result={data:null,error:faults.health};faults.health=null;}
        else{const record=args.p_record,old=tables.health_checkins.find(row=>row.user_id===currentUser.id&&row.checkin_date===record.checkin_date);if((old?.updated_at||null)!==args.p_expected_updated_at)result={data:null,error:{code:'PT409',message:'Conflit fictif QA'}};else{const saved={...old,...record,id:old?.id||id(++serial),user_id:currentUser.id,created_at:old?.created_at||new Date().toISOString(),updated_at:new NativeDate(clock+(++serial)).toISOString()};tables.health_checkins=tables.health_checkins.filter(row=>row.id!==saved.id);tables.health_checkins.push(saved);result={data:[clone(saved)],error:null};}}
      }else if(name==='save_journey_timeline'){
        if(faults.timeline){result={data:null,error:faults.timeline};faults.timeline=null;}
        else{const current=tables.journey_timelines.find(row=>row.user_id===currentUser.id);assert.equal(args.p_expected_revision,current.revision);const document=clone(args.p_document),last=document.events.at(-1),updated_at=new NativeDate(clock+(++serial)).toISOString();current.document=document;current.revision++;current.updated_at=updated_at;const journey=tables.sobriety_journeys.find(row=>row.user_id===currentUser.id),settings=tables.progress_settings.find(row=>row.user_id===currentUser.id);Object.assign(journey,{started_at:last.stopped_at||last.started_on+'T12:00:00Z',updated_at});Object.assign(settings,{updated_at});result={data:{journey:clone(journey),progress_settings:clone(settings),timeline:clone(current),chapters:clone(tables.progress_chapters.filter(row=>row.user_id===currentUser.id))},error:null};}
      }else throw Error(`Unexpected RPC ${name}`);
      return pause(call,result);
    },
  };
  return{client,calls,tables,faults,defer,
    async signOut(){await client.auth.signOut();await settle();},
    async signIn(user={id:UID2}){currentUser=user;authCallback('SIGNED_IN',{user});await settle(35);},
  };
}
