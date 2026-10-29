import {PAGE_LABELS,PAGE_HINTS,filterItems,gameCategory,formFingerprint} from './ergonomics-core.mjs';
import {createSectionNavigation} from './section-navigation.mjs';
/* Additive interface layer. Existing controllers alone own auth, payments and writes.
   No fetch, analytics, private-data persistence or automatic health progression. */
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const element=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;};
const button=(text,action,value)=>{const e=element('button','',text);e.type='button';e.dataset.uxAction=action;if(value)e.dataset.uxValue=value;return e;};
const paths={home:'M3 10 12 3l9 7M5 9v12h14V9M9 21v-7h6v7',progress:'M4 3v18h17M7 15l4-5 4 3 5-7',health:'M12 21S3 16 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 7-9 12-9 12ZM4 12h4l2-4 3 7 2-3h5',help:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16v.01M9.5 9a2.5 2.5 0 1 1 4.1 1.9c-1 .7-1.6 1-1.6 2.1',journey:'M6 3v13a4 4 0 0 0 8 0V8a4 4 0 0 1 8 0M3 3h6M19 8h5',journal:'M5 3h14v18H5V3ZM8 7h8M8 11h8M8 15h5',movement:'M14 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM7 11l3-4 4 1 3 5h4M5 21l5-7 3 2v6M10 14l2-6M3 8l4 3',games:'M7 6h10a4 4 0 0 1 4 4l1 7a2 2 0 0 1-3 2l-4-3H9l-4 3a2 2 0 0 1-3-2l1-7a4 4 0 0 1 4-4ZM7 9v5M4.5 11.5h5M16 10v.01M19 13v.01',community:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.9M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',profile:'M20 21v-2a7 7 0 0 0-14 0v2M17 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',menu:'M4 6h16M4 12h16M4 18h16'};
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(svg.namespaceURI,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');path.setAttribute('d',paths[name]||paths.menu);svg.append(path);return svg;}
let started=false;
export function initErgonomics(){
 if(started)return;started=true;
 const workspace=$('#workspace'),content=$('#content'),drawer=$('#appNav'),modal=$('#modal'),modalContent=$('#modalContent');
 const sections=createSectionNavigation(content);
 const small=matchMedia('(max-width:800px)');
 let pageRoot=null,queued=false,lastPage='',lastOpen=false,returnFocus=null,filterObserver=null,filterView=null,pendingStepFocus=false;
 const forms=new WeakMap(),enhanced=new WeakSet(),sectionOpen=new Map();
 let textSize='normal';try{textSize=localStorage.getItem('sobrizen-ui-text')==='large'?'large':'normal';}catch{}
 document.body.classList.toggle('ux-large-text',textSize==='large');
 document.body.classList.add('ux-ready');
 const welcomeHeading=$('.welcome-hero h1');if(welcomeHeading)welcomeHeading.replaceChildren(document.createTextNode('Moins d’alcool.'),document.createElement('br'),element('em','','Plus de place pour ta vie.'));
 const status=element('div','ux-announcer');status.setAttribute('role','status');status.setAttribute('aria-live','polite');document.body.append(status);
 const announce=text=>{status.textContent=text;};
 function clickNative(selector){const target=$(selector);if(target&&!target.disabled)target.click();}
 function route(page){if(page==='movement')clickNative('#nav [data-move="open"]');else if(Object.hasOwn(PAGE_LABELS,page))clickNative(`#nav [data-page="${page}"]`);}
 function nativeButton(text,key,value,className='secondary'){const b=element('button',className,text);b.type='button';b.dataset[key]=value;return b;}
 const bottom=element('nav','ux-bottom-nav');bottom.setAttribute('aria-label','Accès rapides');
 for(const [name,label] of [['home','Accueil'],['progress','Suivi'],['health','Santé'],['help','Aide'],['menu','Menu']]){const b=button(label,'navigate',name);b.replaceChildren(icon(name),element('span','',label));if(name==='menu'){b.setAttribute('aria-controls','appNav');b.setAttribute('aria-expanded','false');}bottom.append(b);}
 if(workspace)workspace.append(bottom);
 const title=element('span','ux-page-title');$('.header-identity')?.append(title);
 function groupMenu(){
  const nav=$('#nav');if(!nav)return;
  if(!nav.dataset.uxGrouped){nav.dataset.uxGrouped='true';for(const [page,label] of [['home','L’essentiel'],['journal','Mes ressources'],['profile','Mon compte']]){const item=$(`[data-page="${page}"]`,nav);if(item){const h=element('span','ux-nav-group',label);h.setAttribute('aria-hidden','true');item.before(h);}}}
  for(const item of $$('button[data-page],button[data-move="open"]',nav)){
   if(item.dataset.uxNavDecorated)continue;
   const page=item.dataset.page||'movement',label=page==='health'?'Santé':PAGE_LABELS[page];if(!label)continue;const copy=element('span','ux-nav-copy');copy.append(element('span','ux-nav-label',label),element('small','ux-nav-hint',PAGE_HINTS[page]));item.replaceChildren(icon(page),copy);item.setAttribute('aria-label',label);item.dataset.uxNavDecorated='true';
  }
 }
 function visibleFocus(root){return $$('button:not(:disabled),a[href],input:not([type="hidden"]):not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]',root).filter(e=>!e.closest('[hidden],[inert]')&&e.getClientRects().length);}
 function syncShell(){
  if(!workspace)return;
  const active=!workspace.hidden,page=document.body.dataset.page||'home',open=active&&small.matches&&document.body.classList.contains('menu-open');
  bottom.hidden=!active;title.textContent=PAGE_LABELS[page]||'Sobrizen';
  for(const b of $$('[data-ux-action="navigate"]',bottom)){const name=b.dataset.uxValue,current=page===name||name==='menu'&&!['home','progress','health'].includes(page);b.classList.toggle('selected',current);if(current&&name!=='help')b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');if(name==='menu')b.setAttribute('aria-expanded',String(open));}
  if(drawer){drawer.inert=small.matches&&!open;if(small.matches&&!open)drawer.setAttribute('aria-hidden','true');else drawer.removeAttribute('aria-hidden');if(open){drawer.setAttribute('role','dialog');drawer.setAttribute('aria-modal','true');}else{drawer.removeAttribute('role');drawer.removeAttribute('aria-modal');}}
  const main=$('.main',workspace);if(main)main.inert=open;bottom.inert=open;
  if(!lastOpen&&open)($('#nav [aria-current="page"]',drawer)||visibleFocus(drawer)[0])?.focus({preventScroll:true});
  if(lastOpen&&!open&&active&&returnFocus?.isConnected&&small.matches)returnFocus.focus({preventScroll:true});lastOpen=open;
  if(!active){filterObserver?.disconnect();filterView=null;pageRoot=null;sectionOpen.clear();sections.reset();lastPage='';}
  groupMenu();
 }
 function formFields(f){return [...f.elements].filter(e=>e.matches('input,textarea,select')).map(e=>({name:e.name,type:e.type,value:['password','file'].includes(e.type)?'':e.value,checked:e.checked}));}
 const formHash=f=>formFingerprint(formFields(f));
 const editable=f=>f.matches('form[data-tl-form],#journalForm,#profileForm,#settingsForm,#programForm,#journeyForm,#reasonForm,#postForm,#commentForm,#checkForm,#healthCheckinForm,form[data-health-form]');
 function isDirty(f){return forms.has(f)&&forms.get(f)!==formHash(f);}
 function dirtyForms(root=document){return $$('form',root).filter(f=>f.isConnected&&editable(f)&&!f.closest('#workspace[hidden]')&&(!f.closest('dialog')||f.closest('dialog').open)&&isDirty(f));}
 function guard(root=document){if(!dirtyForms(root).length)return true;return confirm('Tes modifications ne sont pas encore enregistrées. Continuer sans les enregistrer ?');}
 function trackForms(root){for(const f of $$('form',root)){if(editable(f)&&!forms.has(f))forms.set(f,formHash(f));}
  for(const area of $$('textarea[maxlength]',root)){if(enhanced.has(area))continue;enhanced.add(area);const counter=element('span','ux-character-count');counter.dataset.uxCounter='true';area.after(counter);updateCounter(area);}
  for(const input of $$('input[type="email"]',root)){input.setAttribute('inputmode','email');input.setAttribute('autocapitalize','none');input.spellcheck=false;}
  for(const input of $$('input[type="password"]',root)){if(enhanced.has(input))continue;enhanced.add(input);const label=input.closest('label');if(!label)continue;const wrap=element('div','ux-password');label.before(wrap);wrap.append(label);if(!input.id)input.id='ux-password-'+crypto.randomUUID();const toggle=button('Afficher','password',input.id);toggle.className='ux-password-toggle';toggle.setAttribute('aria-controls',input.id);toggle.setAttribute('aria-label','Afficher le mot de passe');toggle.setAttribute('aria-pressed','false');wrap.append(toggle);}
 }
 function updateCounter(area){const out=area.nextElementSibling;if(out?.dataset.uxCounter)out.textContent=`${area.value.length} / ${area.maxLength} caractères`;}
 function updateDirty(f){if(!f||!editable(f))return;let note=$('[data-ux-unsaved]',f);if(isDirty(f)){if(!note){note=element('p','ux-unsaved','Modifications non enregistrées');note.dataset.uxUnsaved='true';f.append(note);}note.hidden=false;}else if(note)note.hidden=true;}
 function longText(root){for(const p of $$('.entry-body',root)){if(p.textContent.length<420||enhanced.has(p))continue;enhanced.add(p);p.classList.add('ux-folded-text');if(!p.id)p.id='ux-text-'+crypto.randomUUID();const b=button('Lire la suite','expand',p.id);b.className='text ux-read-more';b.setAttribute('aria-expanded','false');b.setAttribute('aria-controls',p.id);p.after(b);}}
 function filters(container,items,options,{limit=12,search=false,label='Filtrer',insertBefore=container}={}){
  if(!container||!items.length)return null;
  const controls=element('div','ux-filter-tools'),chips=element('div','ux-chips');chips.setAttribute('role','group');chips.setAttribute('aria-label',label);
  const result=element('p','ux-filter-count');result.setAttribute('role','status');
  const more=button('Afficher la suite','more');more.className='secondary ux-show-more';
  const empty=element('p','ux-filter-empty','Aucun résultat dans cette sélection.');empty.hidden=true;
  let input=null;
  if(search){const l=element('label','ux-search-label','Rechercher dans mon historique');input=element('input');input.type='search';input.placeholder='Une date, une note…';l.append(input);controls.append(l);}
  for(const [id,text] of options){const b=button(text,'filter',id);b.setAttribute('aria-pressed',String(id==='all'));chips.append(b);}
  controls.append(chips,result);insertBefore.before(controls);container.after(empty,more);
  const view={container,controls,items,category:'all',query:'',limit,base:limit,more,empty,result,input,run(){const r=filterItems(this.items,{category:this.category,query:this.query,limit:this.limit}),allowed=new Set(r.visible.map(i=>i.node));for(const item of this.items)item.node.hidden=!allowed.has(item.node);for(const b of $$('[data-ux-action="filter"]',this.controls))b.setAttribute('aria-pressed',String(b.dataset.uxValue===this.category));this.more.hidden=!r.remaining;this.more.textContent=`Afficher ${Math.min(this.base,r.remaining)} de plus`;this.empty.hidden=r.total!==0;this.result.textContent=`${r.visible.length} sur ${r.total} ${label==='Jeux'?'jeux':label==='Notes'?'notes':'déclarations'} affichés`;}};
  controls.addEventListener('click',e=>{const b=e.target.closest('[data-ux-action="filter"]');if(!b)return;view.category=b.dataset.uxValue;view.limit=view.base;view.run();});
  input?.addEventListener('input',()=>{view.query=input.value;view.limit=view.base;view.run();});
  more.addEventListener('click',()=>{const previous=filterItems(view.items,{category:view.category,query:view.query,limit:view.limit}).visible.length;view.limit+=view.base;view.run();const next=filterItems(view.items,{category:view.category,query:view.query,limit:view.limit}).visible[previous]?.node;const focus=next&&$('button,a[href]',next);focus?.focus({preventScroll:true});});
  view.run();return view;
 }
 function enhanceHistory(){const list=$('.tl-history-list',content);if(!list)return;filters(list,$$(':scope > li',list).map(node=>({node,category:$('.is-abstinent',node)?'sober':'drinking',text:node.textContent})),[['all','Tout'],['sober','Sans alcool'],['drinking','Consommations']],{search:true,label:'Historique'});}
 function enhanceJournal(){
  const list=$('#journalList',content);if(!list)return;
  const types={'Victoire':'victory','Moment difficile':'difficult','Réflexion':'reflection','Plan personnel':'plan'};
  const items=()=>$$(':scope > article',list).map(node=>({node,category:types[$('.tag',node)?.textContent.trim()]||'reflection',text:node.textContent}));
  filterView=filters(list,items(),[['all','Tout'],['victory','Victoires'],['difficult','Difficultés'],['reflection','Réflexions'],['plan','Plans']],{limit:12,label:'Notes'});
  longText(list);
  filterObserver=new MutationObserver(()=>{if(!list.isConnected)return;longText(list);if(filterView){filterView.items=items();filterView.limit=filterView.base;filterView.run();}});
  filterObserver.observe(list,{childList:true});
  const search=$('#journalSearch',content);if(search){search.placeholder='Chercher dans mes notes chargées…';search.setAttribute('aria-label','Rechercher dans les notes chargées');}
 }
 function enhanceGames(){
  const grid=$('.sz-library-grid',content);if(!grid)return;
  const items=$$(':scope > button',grid).map(node=>({node,category:gameCategory(node.dataset.game||node.dataset.brainGame||node.dataset.gameUpgrade),text:node.textContent}));
  filters(grid,items,[['all','Tous'],['calm','Calmes'],['reflex','Réflexes']],{limit:50,label:'Jeux'});
  const p=$('.sz-library .greeting .muted',content);if(p)p.textContent='Choisis une pause. Les jeux commencent doucement, à ton rythme.';
 }
 function enhanceCommunity(){
  for(const b of $$('.filters button',content))b.setAttribute('aria-pressed',String(b.classList.contains('selected')));
  longText(content);
  for(const row of $$('.post-actions',content)){
   const options=$$('button',row).filter(b=>['post-edit','post-delete','report','hide-author'].includes(b.dataset.action));if(!options.length)continue;
   const details=element('details','ux-post-options');details.append(element('summary','','Options'));const menu=element('div','ux-post-options-list');menu.append(...options);details.append(menu);row.append(details);
  }
 }
 function enhanceJourney(){
  const grid=$('.step-grid',content);if(grid){const details=element('details','ux-step-picker'),current=$('.current',grid);const label=current?.getAttribute('aria-label')||'Mon programme';details.append(element('summary','',`${label} · choisir une étape`));grid.before(details);details.append(grid);}
  const form=$('#programForm',content),step=Number($('[name="step"]',form||content)?.value);
  const destinations={2:['Mes raisons','page','profile'],7:['Ouvrir mon suivi','page','progress'],8:['Trouver du soutien','action','help'],9:['Noter mon ressenti','page','health'],13:['Ouvrir mon journal','page','journal'],14:['Relire mon journal','page','journal'],15:['Mon plan personnel','page','profile'],18:['Vérifier mon profil','page','profile'],21:['Noter une consommation','tlAction','occasion'],22:['Mes outils de soutien','action','help'],26:['Ouvrir la communauté','page','community'],28:['Voir mon bilan','page','progress']};
  if(form&&destinations[step]){const [label,key,value]=destinations[step],links=element('div','ux-program-link'),link=nativeButton(label+' →',key,value);if([2,15].includes(step))link.dataset.szSection='motivation';if(step===9)link.dataset.szSection='feelings';links.append(link);form.before(links);}
  enhanceHistory();
 }
 function enhanceHealth(){
  const hero=$('.hz-hero',content);if(!hero)return;
  const anchors=[['hz-hero','Mon arrêt'],['hz-wins','Mes progrès'],['hz-addiction','Mes envies'],['hz-timeline-title','Les bienfaits'],['ux-health-observations','Mes ressentis']];
  hero.id='hz-hero';const metrics=$('.hz-metrics',content);if(metrics)metrics.id='ux-health-observations';
  const nav=element('nav','ux-section-links');nav.setAttribute('aria-label','Dans Santé & bienfaits');
  for(const [id,label] of anchors){if(!document.getElementById(id))continue;const a=element('a','',label);a.href='#'+id;nav.append(a);}
  hero.before(nav);
  const selected=$('.hz-stage.selected',content);if(selected){const rail=selected.parentElement;rail.scrollLeft=Math.max(0,selected.offsetLeft-rail.offsetLeft-rail.clientWidth/2+selected.clientWidth/2);}
 }
 function enhanceHome(){
  if($('.dy-page',content))return;
  const hero=$('.tl-current',content);if(!hero)return;
  const hint=element('p','ux-home-hint','Ton historique reste intact, même après une reprise.');hero.after(hint);
  const pause=element('section','card ux-pause-card');pause.append(element('span','eyebrow','UNE PAUSE POUR TOI'),element('h2','','De quoi as-tu besoin ?'));
  const row=element('div','ux-pause-actions');row.append(nativeButton('Respirer','action','breath'),nativeButton('Me changer les idées','page','games'),nativeButton('Bouger un peu','move','open'));
  pause.append(row);const summary=$('.tl-simple-summary',content);if(summary)summary.after(pause);else content.append(pause);
  const primary=$('.tl-action-primary',content);if(primary){$('b',primary).textContent='Noter une consommation';primary.classList.add('ux-tracking-action');}
 }
 function enhanceMovement(){
  const intro=$('.mv-intro',content),guided=$('.mv-guided',content),panel=$('#mv-panel',content);if(guided&&panel)panel.before(guided);
  if(intro)intro.classList.add('ux-movement-intro');
 }
 function enhanceProfile(){
  const firstGrid=$(':scope > .grid.equal',content);if(firstGrid)firstGrid.classList.add('ux-profile-grid');
  const cards=$$(':scope > section.card',content).filter(card=>!card.querySelector('[data-ux-action]'));
  for(const card of cards){const h=$('h2',card);if(!h)continue;const title=h.textContent.trim();if(title.includes('Premium de test'))continue;const wrap=element('details','ux-settings-group');const summary=element('summary','',['Gratuit','Premium'].includes(title)?'Mon abonnement · '+title:title);wrap.append(summary);card.before(wrap);wrap.append(card);const key='profile:'+title;wrap.open=sectionOpen.get(key)===true;wrap.addEventListener('toggle',()=>sectionOpen.set(key,wrap.open));h.classList.add('ux-visually-hidden');}
  const comfort=element('section','card ux-comfort');comfort.append(element('h2','','Confort de lecture'),element('p','muted','Ces préférences restent sur cet appareil.'));
  const group=element('div','ux-chips');group.setAttribute('role','group');group.setAttribute('aria-label','Taille du texte');for(const [value,label] of [['normal','Texte standard'],['large','Texte plus grand']]){const b=button(label,'text-size',value);b.setAttribute('aria-pressed',String(value===textSize));group.append(b);}comfort.append(group,nativeButton('Changer le thème','action','theme','text'));content.append(comfort);
 }
 function enhancePage(){
  queued=false;if(!content||workspace?.hidden)return;
  const root=$('.greeting',content)||content.firstElementChild;if(!root||root===pageRoot)return;
  pageRoot=root;filterObserver?.disconnect();filterView=null;
  const page=document.body.dataset.page||'home';
  ({home:enhanceHome,journey:enhanceJourney,progress:enhanceHistory,journal:enhanceJournal,games:enhanceGames,community:enhanceCommunity,health:enhanceHealth,profile:enhanceProfile,movement:enhanceMovement}[page]||(()=>{}))();
  sections.enhance(page);
  if(['journal','community','profile','games'].includes(page)){const heading=$('h1',content);if(heading)heading.textContent=PAGE_LABELS[page];}
  trackForms(content);syncShell();
  if(lastPage&&lastPage!==page&&!$('dialog[open]')){const heading=$('h1',content);if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}}lastPage=page;
  if(pendingStepFocus){const form=$('#programForm',content),heading=form&&$$(':scope > h2',form.closest('section')).at(-1);if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}pendingStepFocus=false;}
 }
 function queue(){if(!queued){queued=true;queueMicrotask(enhancePage);}}
 function enhanceModal(){
  if(!modalContent)return;trackForms(modalContent);
  const heading=$('.modal-top h2',modalContent);if(heading){heading.id='ux-modal-title';modal.setAttribute('aria-labelledby',heading.id);}
  if(!$('[data-ux-feedback]',modalContent)){const live=element('p','ux-dialog-feedback');live.dataset.uxFeedback='true';live.setAttribute('role','status');live.setAttribute('aria-live','polite');modalContent.append(live);}
 }
 // Capture on window: existing timeline/health controllers stop document events.
 window.addEventListener('click',e=>{
  const target=e.target.closest?.('button,a,summary');if(!target)return;
  if(target.matches('[data-action="menu-toggle"]'))returnFocus=target;
  const modalTransition=modal?.open&&modal.contains(target)&&target.matches('[data-tl-action="edit-event"],[data-tl-action="edit-range"],[data-tl-action="edit-occasion"],[data-tl-action="new-range"],[data-tl-action="remove-open"],[data-tl-action="settings"],[data-tl-action="date"]');
  // These actions can save and redraw the page behind their dialog. Protect
  // inline reflections/settings before opening them, not after data is lost.
  const pageTransition=!modal?.open&&!target.closest('form')&&target.matches('[data-tl-action],[data-tl-chart-action],[data-tl-summary-action],[data-health-action="checkin"],[data-action="journey-settings"],[data-action="journey-date"],[data-action="reason-new"],[data-action="journal-new"],[data-action="journal-edit"],[data-action="post-new"],[data-action="post-edit"],[data-action="comments"],[data-action="help"]');
  const leaving=modalTransition||pageTransition||target.matches('[data-action="close"],[data-action="logout"],[data-action="step"],[data-page],[data-move="open"],[data-tl-action="history"],[data-tl-action="progress"]')||target.matches('a[href]')&&!target.getAttribute('href').startsWith('#')&&!/^(tel:|mailto:)/.test(target.getAttribute('href'));
  if(leaving&&!target.disabled&&!guard((target.dataset.action==='close'||modalTransition)&&modal?modal:document)){e.preventDefault();e.stopImmediatePropagation();return;}
  if(target.dataset.page&&target.dataset.szSection)sections.remember(target.dataset.page,target.dataset.szSection);
  if(target.dataset.tlAction==='history')sections.remember('journey','history');
  if(target.dataset.action==='step')sections.remember('journey','steps');
  if(['stage','current-stage'].includes(target.dataset.healthAction))sections.remember('health','benefits');
  if(target.dataset.healthAction==='gain')sections.remember('health','feelings');
  if(target.matches('a[href^="#"]')){let id;try{id=decodeURIComponent(target.getAttribute('href').slice(1));}catch{}const destination=id&&document.getElementById(id);if(destination&&sections.reveal(destination,{scroll:true})){e.preventDefault();return;}}
  if(target.dataset.action==='step')pendingStepFocus=true;
  const action=target.dataset.uxAction,value=target.dataset.uxValue;
  if(action==='navigate'){
   e.preventDefault();if(value==='menu'){returnFocus=target;clickNative('[data-action="menu-toggle"]');returnFocus=target;}else if(value==='help')clickNative('header [data-action="help"]');else route(value);return;
  }
  if(action==='password'){const input=document.getElementById(value);if(!input)return;const show=input.type==='password';input.type=show?'text':'password';target.textContent=show?'Masquer':'Afficher';target.setAttribute('aria-pressed',String(show));target.setAttribute('aria-label',show?'Masquer le mot de passe':'Afficher le mot de passe');return;}
  if(action==='expand'){const text=document.getElementById(value);if(!text)return;const folded=text.classList.toggle('ux-folded-text');target.textContent=folded?'Lire la suite':'Réduire';target.setAttribute('aria-expanded',String(!folded));return;}
  if(action==='text-size'){textSize=value==='large'?'large':'normal';document.body.classList.toggle('ux-large-text',textSize==='large');try{localStorage.setItem('sobrizen-ui-text',textSize);}catch{}for(const b of $$('[data-ux-action="text-size"]'))b.setAttribute('aria-pressed',String(b.dataset.uxValue===textSize));announce(textSize==='large'?'Texte agrandi.':'Taille de texte standard.');return;}
  const form=target.closest('form');if(form)queueMicrotask(()=>updateDirty(form));
 },true);
 window.addEventListener('input',e=>{if(e.target.matches('textarea'))updateCounter(e.target);queueMicrotask(()=>updateDirty(e.target.closest('form')));},true);
 window.addEventListener('change',e=>queueMicrotask(()=>updateDirty(e.target.closest('form'))),true);
 window.addEventListener('beforeunload',e=>{if(!dirtyForms().length)return;e.preventDefault();e.returnValue='';});
 modal?.addEventListener('cancel',e=>{if(!guard(modal))e.preventDefault();});
 window.addEventListener('keydown',e=>{
  if(!lastOpen||$('dialog[open]'))return;
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();clickNative('[data-action="menu-close"]');return;}
  if(e.key!=='Tab')return;const list=visibleFocus(drawer);if(!list.length)return;const first=list[0],last=list.at(-1);if(e.shiftKey&&(document.activeElement===first||!drawer.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!drawer.contains(document.activeElement))){e.preventDefault();first.focus();}
 },true);
 if(content)new MutationObserver(queue).observe(content,{childList:true});
 if(workspace)new MutationObserver(()=>{syncShell();queue();}).observe(workspace,{attributes:true,attributeFilter:['hidden']});
 new MutationObserver(syncShell).observe(document.body,{attributes:true,attributeFilter:['class','data-page']});
 if(modalContent)new MutationObserver(enhanceModal).observe(modalContent,{childList:true});
 const notice=$('#notice');if(notice)new MutationObserver(()=>{const live=modal?.open?$('[data-ux-feedback]',modalContent):null;if(live&&notice.classList.contains('on'))live.textContent=notice.textContent;}).observe(notice,{childList:true,attributes:true,attributeFilter:['class']});
 small.addEventListener('change',syncShell);
 trackForms(document);syncShell();enhanceModal();queue();
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initErgonomics,{once:true});else initErgonomics();}
