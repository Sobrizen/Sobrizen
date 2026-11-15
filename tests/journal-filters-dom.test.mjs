/** Controller + real PostgreSQL text/date/order semantics, without live services.
 * The small adapter accepts PostgREST logic grammar, not the UI's filter state.
 * This catches malformed escaping, injected operators and filtering after LIMIT.
 */
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createJournalMotivation,journalLiteralPattern,journalNotesQuery} from '../journal-motivation-ui.mjs';
import {MOTIVATION_TITLE,isMotivationEntry} from '../journal-motivation.mjs';
import {environment,UID,UID2,$,$$,settle,click} from './ux-dom-support.mjs';
const {PGlite}=await import(pathToFileURL(process.env.SOBRIZEN_QA_PGLITE).href);
// Initialize WASM in Node before jsdom installs browser globals.
const db=new PGlite(),calls=[],results=[];
await db.exec('create table journal_entries(id text primary key,user_id text,entry_date text,title text,body text,kind text,created_at text,updated_at text);');
const env=await environment({online:true,mobile:true});
$('#workspace').hidden=false;
const columns=new Set(['id','user_id','entry_date','title','body','kind','created_at','updated_at']);
const literal='100%_\\*,body.eq."danger" (x)+[a]{2}$|?';
const row=(i,extra={})=>({id:String(i).padStart(4,'0'),user_id:UID,entry_date:new Date(Date.UTC(2026,4,i)).toISOString().slice(0,10),title:`Souvenir ${i}`,body:i===1?literal:'Un moment à garder',kind:['plan','victory','reflection','difficult'][i%4],created_at:`2026-05-01T00:00:${String(i%60).padStart(2,'0')}.000Z`,updated_at:'2026-05-01T00:00:00Z',...extra});
const source=Array.from({length:96},(_,i)=>row(i+1));
source.push(row(500,{user_id:UID2,title:'Une note étrangère',kind:'victory',body:literal,entry_date:'2026-05-01'}));
source.push(row(501,{title:MOTIVATION_TITLE,kind:'reflection',body:'Une citation conservée',entry_date:'2026-08-01'}));
let gate=null,failure=false,revision=0,consent=true;
const S={user:{id:UID},demo:false,page:'journal',journal:[]};
const context=()=>({user:S.user,demo:S.demo,revision}),same=c=>c.user===S.user&&c.demo===S.demo&&c.revision===revision;
function defer(match){let release;const promise=new Promise(resolve=>{release=resolve;});gate={match,promise,release,used:false};return gate;}
async function respond(call,run){
  calls.push(call);const wait=gate&&!gate.used&&gate.match(call)?gate:null;if(wait)wait.used=true;
  if(failure){failure=false;throw Error('Chargement QA indisponible');}
  const rows=await run();if(wait)await wait.promise;return{data:rows,error:null};
}
function logic(input,args){
  let index=0;
  function term(){
    for(const [prefix,join]of[['and(',' and '],['or(',' or ']])if(input.startsWith(prefix,index)){
      index+=prefix.length;const parts=[term()];while(input[index]===','){index++;parts.push(term());}assert.equal(input[index++],')');return '('+parts.join(join)+')';
    }
    const match=/^(kind|title|body)\.(eq|neq|imatch)\./.exec(input.slice(index));assert.ok(match,'Valid PostgREST condition required');index+=match[0].length;
    let value='';if(input[index]==='"'){index++;let closed=false;while(index<input.length){const char=input[index++];if(char==='"'){closed=true;break;}if(char==='\\'){assert.ok(index<input.length);value+=input[index++];}else value+=char;}assert.ok(closed,'Quoted filter must terminate');}
    else{while(index<input.length&&![')',','].includes(input[index]))value+=input[index++];}
    args.push(value);return `${match[1]} ${match[2]==='eq'?'=':match[2]==='neq'?'<>':'~*'} $${args.length}`;
  }
  const sql=term();assert.equal(index,input.length,'No user content may become a second filter');return sql;
}
class Query{
  constructor(table){assert.equal(table,'journal_entries');this.conditions=[];this.orders=[];this.bounds=null;this.expression='';}
  select(columns='*'){assert.equal(columns,'*');return this;}
  eq(key,value){this.conditions.push([key,'=',value]);return this;}
  gte(key,value){this.conditions.push([key,'>=',value]);return this;}
  lte(key,value){this.conditions.push([key,'<=',value]);return this;}
  or(expression){assert.equal(this.expression,'');this.expression=expression;return this;}
  order(key,{ascending=true}={}){assert.ok(columns.has(key));this.orders.push(`${key} ${ascending?'asc':'desc'}`);return this;}
  range(from,to){assert.ok(Number.isInteger(from)&&from>=0&&to-from<=20);this.bounds=[from,to];return this;}
  then(resolve,reject){return this.run().then(resolve,reject);}
  async run(){
    assert.ok(this.conditions.some(([key,operator,value])=>key==='user_id'&&operator==='='&&value===UID));
    const args=[],where=this.conditions.map(([key,operator,value])=>{assert.ok(columns.has(key));args.push(value);return `${key} ${operator} $${args.length}`;});
    where.push(logic(`or(${this.expression})`,args));
    return respond({kind:'filtered',conditions:this.conditions,expression:this.expression,bounds:this.bounds},async()=>{
      const sql=`select * from journal_entries where ${where.join(' and ')} order by ${this.orders.join(',')} limit ${this.bounds[1]-this.bounds[0]+1} offset ${this.bounds[0]}`;
      return(await db.query(sql,args)).rows;
    });
  }
}
const client={from:table=>new Query(table),rpc(name,args){assert.equal(name,'list_journal_entries');return respond({kind:'rpc',args},async()=>{
  return(await db.query('select * from journal_entries where user_id=$1 and ((kind=\'reflection\' and title=$2)=$3) and (title||\' \'||body) ~* $4 order by entry_date desc,created_at desc,id desc limit $5 offset $6',[UID,MOTIVATION_TITLE,args.p_motivation,journalLiteralPattern(args.p_search),args.p_limit,args.p_offset])).rows;
});}};
const controller=createJournalMotivation({S,modal:()=>{},closeModal:()=>{},notify:()=>{},privateWrite:()=>{},healthConsentActive:()=>consent,accountRequest:async build=>{if(!S.user||!consent)throw Error('Consentement requis');const result=await build(client,UID);if(result.error)throw result.error;return result.data;},message:error=>String(error.message||error),sessionContext:context,sameSession:same,today:()=> '2026-10-27'});
async function reset(){
  controller.reset();revision++;S.user={id:UID};S.demo=false;S.page='journal';consent=true;gate=null;failure=false;
  await db.exec('truncate journal_entries');
  for(const note of source)await db.query('insert into journal_entries select * from json_populate_record(null::journal_entries,$1::json)',[JSON.stringify(note)]);
  const first=await client.rpc('list_journal_entries',{p_search:'',p_offset:0,p_limit:21,p_motivation:false});controller.reloaded(first.data);
  $('#content').innerHTML='<h1>Mon journal</h1>'+controller.view();calls.length=0;
}
async function change(name,value){const input=$(`[data-jm-filter="${name}"]`);input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));await settle(30);}
async function check(name,run){try{await reset();await run();assert.deepEqual(env.errors,[]);results.push(true);console.log('PASS '+name);}catch(error){results.push(false);console.error('FAIL '+name+'\n'+error.stack);}}
try{
  await check('category and deterministic oldest-first sorting query the whole journal before the 21-row bound',async()=>{
    await change('kind','victory');assert.equal($$('#journalList article').length,20);assert.equal(S.journal.every(row=>row.kind==='victory'&&row.user_id===UID),true);
    await change('sort','oldest');assert.equal(S.journal[0].id,'0001');assert.equal(S.journal.length,20);assert.match($('[data-jm-results]').textContent,/1–20 notes affichées/);
    await click('[data-jm-page="notes"][data-jm-offset="20"]');await settle(30);assert.equal(S.journal.length,4);assert.match($('[data-jm-results]').textContent,/21–24/);
    assert.ok(calls.filter(call=>call.kind==='filtered').every(call=>call.bounds[1]-call.bounds[0]===20));
  });
  await check('date endpoints are inclusive and invalid or future dates never send a query',async()=>{
    await change('from','2026-05-05');await change('to','2026-05-09');assert.equal(S.journal.length,5);assert.deepEqual(S.journal.map(row=>row.entry_date),['2026-05-09','2026-05-08','2026-05-07','2026-05-06','2026-05-05']);
    const count=calls.length;await change('from','2026-05-10');assert.equal(calls.length,count);assert.match($('#journalList [role="alert"]').textContent,/début.*fin/);assert.equal($$('#journalList article').length,0);
    controller.selectTab('notes');await settle();assert.equal(calls.length,count);assert.equal($$('#journalList [role="alert"]').length,1);
    await change('from','2027-01-01');assert.equal(calls.length,count);assert.match($('#journalList').textContent,/aujourd’hui/);
    await change('from','2026-05-05');assert.equal(S.journal.length,5);assert.equal($('#journalList [role="alert"]'),null);
  });
  await check('combined filters search literal punctuation and escaped operator-like text without leaking another owner',async()=>{
    await change('kind','victory');const input=$('#journalSearch');input.value=literal;input.focus();controller.search(literal);await settle(230);
    assert.equal(S.journal.length,1);assert.equal(S.journal[0].id,'0001');assert.equal(S.journal[0].body,literal);assert.equal(document.activeElement,input);assert.match($('[data-jm-results]').textContent,/1 note trouvée/);
    assert.equal(S.journal.some(isMotivationEntry),false);assert.equal(calls.at(-1).kind,'filtered');
    assert.throws(()=>journalNotesQuery(client,UID,{kind:'not-a-category'}),/invalide/);assert.throws(()=>journalNotesQuery(client,UID,{from:'2026-02-31'}),/invalide/);
  });
  await check('clearing an empty search restores all controls and keeps focus in the original search input',async()=>{
    await change('kind','plan');await change('sort','oldest');const input=$('#journalSearch');input.value='Mot absent';controller.search(input.value);await settle(220);
    assert.equal($$('#journalList article').length,0);assert.match($('#journalList').textContent,/Aucune note pour ces critères/);
    await click('#journalList [data-jm-clear]');await settle(30);assert.equal(document.activeElement,input);assert.equal(input.value,'');assert.equal($('[data-jm-filter="kind"]').value,'');assert.equal($('[data-jm-filter="sort"]').value,'newest');assert.equal($$('#journalList article').length,20);assert.equal(calls.at(-1).kind,'rpc');
  });
  await check('stale filter responses cannot replace a newer result or restore private content after logout',async()=>{
    const wait=defer(call=>call.kind==='filtered'&&call.conditions.some(([key,,value])=>key==='kind'&&value==='victory'));await change('kind','victory');assert.equal(wait.used,true);
    await change('kind','plan');assert.equal(S.journal.every(row=>row.kind==='plan'),true);wait.release();await settle(30);assert.equal(S.journal.every(row=>row.kind==='plan'),true);
    const logout=defer(call=>call.kind==='filtered');await change('kind','difficult');assert.equal(logout.used,true);revision++;S.user=null;S.journal=[];consent=false;controller.reset();$('#content').replaceChildren();logout.release();await settle(30);assert.deepEqual(S.journal,[]);assert.equal($('#content').textContent,'');
  });
  await check('a failed filtered load has an honest error state and retry retains the selected criteria',async()=>{
    failure=true;await change('kind','victory');assert.match($('#journalList [role="alert"]').textContent,/indisponible/);assert.doesNotMatch($('#journalList').textContent,/Aucune note pour ces critères/);assert.match($('[data-jm-results]').textContent,/pas pu être actualisés/);
    await click('#journalList [data-jm-page]');await settle(30);assert.equal($$('#journalList article').length,20);assert.equal(S.journal.every(row=>row.kind==='victory'),true);assert.equal($('#journalList').getAttribute('aria-busy'),'false');
  });
  await check('demo filters remain in memory and resetting the account removes the search and category',async()=>{
    S.demo=true;S.journal=structuredClone(source.filter(row=>row.user_id===UID));calls.length=0;await change('kind','victory');await change('sort','oldest');assert.equal($$('#journalList article').length,20);assert.equal(calls.length,0);
    controller.reset();$('#content').innerHTML=controller.view();assert.equal($('#journalSearch').value,'');assert.equal($('[data-jm-filter="kind"]').value,'');assert.equal([...Array(localStorage.length)].map((_,i)=>localStorage.key(i)).some(name=>/journal|draft|note/i.test(name)),false);
  });
}finally{controller.reset();await db.close();env.close();}
const failed=results.filter(value=>!value).length;console.log(`${results.length-failed}/${results.length} journal filtering checks passed`);if(failed)process.exitCode=1;
