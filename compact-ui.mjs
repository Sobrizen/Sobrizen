import {pageSlice, textPages, preview} from './compact-core.mjs';
/** Compact entrances over the existing controllers. No request, private-data
 * storage, new calculations, entitlement changes, or cloned editable forms. */
const $ = (s, root = document) => root?.querySelector(s);
const $$ = (s, root = document) => [...(root?.querySelectorAll(s) || [])];
const el = (tag, cls = '', text) => {
  const node = document.createElement(tag); if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text; return node;
};
const text = (s, root) => $(s, root)?.textContent.trim() || '';
const titles = {home: 'Mon essentiel', progress: 'Mon suivi', health: 'Santé & bienfaits', journey: 'Mon parcours', journal: 'Mon journal', games: 'Mes jeux', movement: 'Bouger', community: 'Communauté', profile: 'Mon profil'};
const subtitles = {home: 'Ton avancée, en un regard.', progress: 'Tes chiffres et tout ton historique.', health: 'Comprendre, observer, continuer.', journey: 'Tes étapes, à ton rythme.', journal: 'Tes notes, faciles à retrouver.', games: 'Choisis ta pause.', movement: 'Un niveau, puis un exercice.', community: 'Lire, partager et se soutenir.', profile: 'Chaque réglage à sa place.'};
let initialized = false;
export function initCompact() {
  if (initialized) return; initialized = true;
  const content = $('#content'), workspace = $('#workspace');
  if (!content || !workspace || !('showModal' in document.createElement('dialog'))) return;
  let source = null, overview = null, route = '', frame = 0, observing = null, activeDetail = null;
  let state = {tab: '', page: 0, query: ''}, pending = null, returnKey = '';
  const listSize = () => innerHeight < 740 ? 2 : 3;
  const q = selector => $(selector, source);
  const qa = selector => $$(selector, source);
  const t = selector => text(selector, source);
  function button(label, callback, cls = 'cp-button', key = label) {
    const b = el('button', cls, label); b.type = 'button'; b.dataset.cpKey = key;
    if (callback) b.addEventListener('click', callback); return b;
  }
  // Delegate exactly the existing action. Preserve disabled/Premium checks.
  function native(original, label, cls = 'cp-button', key = label) {
    if (!original) return null;
    const n = el(original.tagName === 'A' ? 'a' : 'button', cls, label || original.textContent.trim());
    if (n.tagName === 'BUTTON') {n.type = 'button'; n.disabled = original.disabled;}
    for (const attr of original.attributes) {
      if (attr.name.startsWith('data-') && !attr.name.startsWith('data-ux-') || ['href','target','rel','aria-pressed','aria-label'].includes(attr.name)) n.setAttribute(attr.name, attr.value);
    }
    n.dataset.cpKey = key || label; return n;
  }
  const append = (parent, ...nodes) => { parent.append(...nodes.filter(Boolean)); return parent; };
  function action(selector, label, cls = 'cp-button') {return native(q(selector), label, cls);}
  function go(page, label, detail = '') {
    const original = $(`#nav [data-page="${page}"]`);
    const b = native(original, label, 'cp-tile');
    if (b) {b.replaceChildren(el('strong','',label)); if (detail) b.append(el('small','',detail)); b.append(el('span','cp-chevron','↗'));}
    return b;
  }
  function tile(label, detail, callback, key = label) {
    const b = button('', callback, 'cp-tile', key);
    append(b, el('strong','',label), detail ? el('small','',detail) : null, el('span','cp-chevron','↗')); return b;
  }
  function openTile(node, label, detail = '') {
    return node ? tile(label, detail, event => openDetail([node], label, event.currentTarget), 'open:'+label) : null;
  }
  function grid(...nodes) {return append(el('div','cp-grid'), ...nodes);}
  function rememberFocus() {const f = document.activeElement; return overview?.contains(f) ? {key:f.dataset.cpKey, start:f.selectionStart,end:f.selectionEnd} : null;}
  function restoreFocus(f) {
    if (!f?.key) return;
    const target = $$('[data-cp-key]', overview).find(n => n.dataset.cpKey === f.key);
    target?.focus({preventScroll:true});
    if (target?.setSelectionRange && f.start !== null) {try {target.setSelectionRange(f.start, f.end);} catch {}}
  }
  function formSnapshot(root) {
    return JSON.stringify($$('input,textarea,select', root).filter(n => n.type !== 'password' && n.type !== 'file').map(n => [n.name,n.value,n.checked]));
  }
  function cleanupDetail(restore = true) {
    const d = activeDetail; if (!d) return; activeDetail = null;
    for (const [node, marker] of d.nodes) {if (marker.isConnected) marker.replaceWith(node);}
    for (const fn of d.cleanups) fn();
    if (d.dialog.isConnected) d.dialog.remove();
    if (restore) {draw(); restoreFocus({key:d.key});}
  }
  // Native dialogs retain real node identity, listeners and FormData ownership.
  function openDetail(nodes, title, trigger) {
    nodes = nodes.filter(n => n?.isConnected);
    if (!nodes.length || activeDetail) return;
    const dialog = el('dialog','cp-dialog'), head = el('div','cp-dialog-head');
    const heading = el('h2','',title); heading.id = 'cp-detail-title';
    dialog.setAttribute('aria-labelledby','cp-detail-title');
    const close = button('Fermer', () => {if (canClose()) dialog.close();}, 'cp-close');
    append(head, heading, close);
    const body = el('div','cp-detail-body'); dialog.append(head,body);
    const moved = nodes.map(node => {const marker = document.createComment('compact position');node.before(marker);body.append(node);return [node,marker];});
    const saved = formSnapshot(body);
    activeDetail = {dialog,nodes:moved,key:trigger?.dataset.cpKey||returnKey,cleanups:[]};
    function canClose() {return formSnapshot(body) === saved || confirm('Tes modifications ne sont pas encore enregistrées. Fermer sans les enregistrer ?');}
    for (const d of $$('details', body)) {const open=d.open;d.open=true;activeDetail.cleanups.push(()=>{d.open=open;});}
    for (const p of $$('.entry-body', body)) paginateReading(p, activeDetail.cleanups);
    for (const list of $$('.tl-history-list,.hz-history',body)) paginateList(list, activeDetail.cleanups);
    content.append(dialog);
    dialog.addEventListener('cancel', e => {if(!canClose()) e.preventDefault();});
    dialog.addEventListener('close', () => {if(activeDetail?.dialog===dialog)cleanupDetail();});
    dialog.showModal();close.focus({preventScroll:true});
  }
  function openSectionIndex(trigger) {
    const wrappers=['.hz-page','.dy-page','#movement-root','.ga-library','.grid.equal','.dy-primary-grid'];
    function entries(node){
      if(node.matches(wrappers.join(',')))return [...node.children].flatMap(entries);
      if(node.matches('.greeting,.dy-heading,h1,script,style'))return [];
      return [node];
    }
    const candidates=[...source.children].flatMap(entries).filter(n=>n.matches('section,article,details,form,div,ul,footer')&&n.textContent.trim());
    if(!candidates.length)return;
    const menu=el('div','cp-detail-index'),list=el('div','cp-index-list'),nav=el('nav','cp-pager');
    let index=0;const count=el('span');
    const prev=button('←',()=>{index--;show();},'cp-arrow'),next=button('→',()=>{index++;show();},'cp-arrow');
    prev.setAttribute('aria-label','Rubriques précédentes');next.setAttribute('aria-label','Rubriques suivantes');
    function show(){
      const result=pageSlice(candidates,index,5);index=result.page;list.replaceChildren();
      for(const node of result.items){
        const label=text('h2,h3,summary,legend',node)||preview(node.textContent,45);
        list.append(button(label,()=>{
          const old=activeDetail;old?.dialog.close();cleanupDetail();
          openDetail([node],label,{dataset:{cpKey:'all-options'}});
        },'cp-button'));
      }
      count.textContent=`${result.page+1} / ${result.pages}`;prev.disabled=index===0;next.disabled=index===result.pages-1;
    }
    append(nav,prev,count,next);menu.append(list,nav);show();source.append(menu);
    openDetail([menu],'Détails de la rubrique',trigger);activeDetail?.cleanups.push(()=>menu.remove());
  }
  function paginateReading(node, cleanup) {
    if (node.textContent.length < 800) return;
    const pages = textPages(node.textContent, matchMedia('(max-height:650px)').matches ? 450 : 750);
    const hidden = node.hidden, reader = el('div','cp-reader'), paragraph=el('p','cp-reading-text');
    let index=0; const controls=el('div','cp-pager'), count=el('span');
    const previous=button('←',()=>{index--;show();},'cp-arrow');previous.setAttribute('aria-label','Texte précédent');
    const next=button('→',()=>{index++;show();},'cp-arrow');next.setAttribute('aria-label','Suite du texte');
    function show(){paragraph.textContent=pages[index];count.textContent=`${index+1} / ${pages.length}`;previous.disabled=index===0;next.disabled=index===pages.length-1;}
    append(controls,previous,count,next);reader.append(paragraph,controls);node.hidden=true;node.after(reader);show();
    cleanup.push(()=>{node.hidden=hidden;reader.remove();});
  }
  function paginateList(list, cleanup) {
    const items=$$(':scope > li,:scope > .hz-history-row',list);if(items.length<=3)return;
    const old=items.map(n=>n.hidden);let index=0;
    const controls=el('div','cp-pager'),count=el('span');
    const prev=button('←',()=>{index--;show();},'cp-arrow'),next=button('→',()=>{index++;show();},'cp-arrow');
    prev.setAttribute('aria-label','Éléments précédents');next.setAttribute('aria-label','Éléments suivants');
    function show(){const p=pageSlice(items,index,3);index=p.page;items.forEach(n=>n.hidden=!p.items.includes(n));count.textContent=`${p.page+1} / ${p.pages}`;prev.disabled=p.page===0;next.disabled=p.page===p.pages-1;}
    append(controls,prev,count,next);list.after(controls);show();cleanup.push(()=>{items.forEach((n,i)=>n.hidden=old[i]);controls.remove();});
  }
  function tabs(options, fallback) {
    if(!options.some(([id])=>id===state.tab))state.tab=fallback||options[0][0];
    const nav=el('div','cp-tabs');nav.setAttribute('role','tablist');nav.setAttribute('aria-label',titles[route]);
    options.forEach(([id,label])=>{
      const b=button(label,()=>{state.tab=id;state.page=0;draw();restoreFocus({key:'tab:'+id});},'cp-tab','tab:'+id);
      b.id='cp-tab-'+id;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(state.tab===id));b.setAttribute('aria-controls','cp-panel');b.tabIndex=state.tab===id?0:-1;
      b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const index=options.findIndex(([v])=>v===id);const n=e.key==='Home'?0:e.key==='End'?options.length-1:(index+(e.key==='ArrowRight'?1:-1)+options.length)%options.length;state.tab=options[n][0];state.page=0;draw();restoreFocus({key:'tab:'+state.tab});});nav.append(b);
    });return nav;
  }
  function pager(items, size, renderItem, loadMore) {
    const result=pageSlice(items,state.page,size);state.page=result.page;
    const list=el('div','cp-collection');list.append(...result.items.map(renderItem).filter(Boolean));
    if(!items.length)list.append(el('p','cp-empty','Aucun élément à afficher pour cette sélection.'));
    const controls=el('nav','cp-pager');controls.setAttribute('aria-label','Pages de la liste');
    const prev=button('←',()=>{state.page--;draw();restoreFocus({key:state.page>0?'list-prev':'list-next'});},'cp-arrow','list-prev');prev.setAttribute('aria-label','Page précédente');prev.disabled=result.page===0;
    const next=button('→',()=>{state.page++;draw();restoreFocus({key:'list-prev'});},'cp-arrow','list-next');next.setAttribute('aria-label','Page suivante');next.disabled=result.page===result.pages-1;
    append(controls,prev,el('span','',`${result.page+1} / ${result.pages} · ${result.total} éléments`),next);
    const wrap=el('div','cp-list-view');wrap.append(list,controls);
    if(loadMore && result.page===result.pages-1)wrap.append(native(loadMore,'Charger la suite','cp-button cp-more'));
    return wrap;
  }
  function stat(label,value,detail='') {const n=el('div','cp-stat');append(n,el('span','',label),el('strong','',value||'—'),detail?el('small','',detail):null);return n;}
  function contextStrip() {
    const strip=el('div','cp-context');
    append(strip,action('[data-health-action="sources"]','Sources','cp-link'),native($('header [data-action="help"]'),'Aide & sécurité','cp-link'));
    return strip;
  }
  function homePanel(panel) {
    const focus=q('.dy-focus');if(!focus)return false;
    const hero=el('section','cp-hero');
    if(q('[data-daily-clock-value]')){
      append(hero,el('span','cp-label','MON ARRÊT'),append(el('strong','cp-counter'),el('span','cp-counter-value',t('[data-daily-clock-value]')),el('span','cp-counter-unit',t('[data-daily-clock-unit]'))),el('p','cp-muted',t('[data-daily-clock-detail]').split(' · ')[0]));
      append(hero,el('p','cp-next',t('[data-daily-cap-title]')),action('[data-tl-action="stop-time"]','Modifier la date et l’heure','cp-link'));
    }else{append(hero,el('h2','',text('h2',focus)||'Mon objectif'),el('p','cp-muted',text('p',focus)),native($('button',focus),'Renseigner mon parcours','cp-button'));}
    const benefit=q('.dy-benefit');
    const health=benefit?tile('Mes bienfaits',preview(text('.dy-benefit-scope',benefit),80),e=>{const b=$('[data-page="health"]',benefit);b?.click();},'home-benefits'):null;
    const add=action('.dy-entry-link','Ajouter une déclaration','cp-primary');
    append(panel,hero,grid(go('progress','Mon suivi','Consommation et budget'),health),add);
    
    return true;
  }
  function progressPanel(panel,root) {
    if(!q('.tl-simple-summary,.tl-chart,#dy-calendar'))return false;
    root.append(tabs([['summary','Résumé'],['calendar','Calendrier'],['options','Parcours']], 'summary'));
    if(state.tab==='calendar'){
      const calendar=q('#dy-calendar');if(!calendar)return false;
      const cloned=calendar.cloneNode(true); // Read-only calendar; buttons use existing delegated actions.
      cloned.id='cp-calendar';$$('[id]',cloned).forEach(n=>n.removeAttribute('id'));
      const ctrl=$('.dy-calendar-controls',cloned);const todayButton=$('[data-daily-action="month-today"]',ctrl);if(todayButton){todayButton.textContent='↺';todayButton.setAttribute('aria-label','Revenir au mois en cours');}if(ctrl){ctrl.classList.add('cp-calendar-controls');$$('button',ctrl).forEach(b=>{const action=b.dataset.dailyAction;b.removeAttribute('data-daily-action');b.addEventListener('click',()=>q(`#dy-calendar [data-daily-action="${action}"]`)?.click());});}
      const days=$('.dy-month-grid',cloned);const summary=$('.dy-calendar-summary',cloned);
      let datesPager=null;
      if(days && innerHeight < 850){
        const cells=[...days.children].slice(7), all=[...cells];
        const month=text('h3',ctrl), current=cells.findIndex(n=>n.getAttribute('aria-current')==='date');
        if(state.month!==month){state.month=month;state.datesPage=Math.max(0,Math.floor(current/14));}
        const range=pageSlice(cells,state.datesPage||0,14);state.datesPage=range.page;
        cells.forEach(n=>n.hidden=!range.items.includes(n));
        datesPager=el('nav','cp-pager');datesPager.setAttribute('aria-label','Dates du mois');
        const prev=button('←',()=>{state.datesPage--;draw();restoreFocus({key:'dates-next'});},'cp-arrow','dates-prev');prev.disabled=range.page===0;prev.setAttribute('aria-label','Dates précédentes');
        const next=button('→',()=>{state.datesPage++;draw();restoreFocus({key:'dates-prev'});},'cp-arrow','dates-next');next.disabled=range.page===range.pages-1;next.setAttribute('aria-label','Dates suivantes');
        const dates=range.items.filter(n=>n.dataset.date).map(n=>Number(n.dataset.date.slice(-2)));
        append(datesPager,prev,el('span','',dates.length?`Du ${dates[0]} au ${dates.at(-1)}`:`${range.page+1} / ${range.pages}`),next);
      }
      append(panel,ctrl,days,datesPager,el('p','cp-assurance',text('strong',summary)));
      append(panel,grid(action('#dy-calendar .dy-calendar-header [data-daily-action="day"]','Ajouter','cp-button'),button('Légende',e=>openDetail([calendar],'Mon calendrier',e.currentTarget),'cp-button','calendar-details')));
    }else if(state.tab==='options'){
      append(panel,grid(action('[data-tl-action="change"]','Arrêt / reprise'),action('[data-tl-action="history"]','Historique complet'),action('[data-tl-action="settings"]','Mes repères'),openTile(q('.tl-achievements'),'Mes réussites','Les jours cumulés et mon meilleur arrêt')));
      const offer=q('a[href="/abonnement.html"]');append(panel,native(offer,'Mon offre & mes rapports','cp-button'));
    }else{
      const cards=qa('.tl-simple-metric');const stats=el('div','cp-stat-grid');
      if(cards.length)cards.forEach(card=>{const b=openTile(card,text('.tl-simple-metric-title',card)||'Mon chiffre',text('strong',card)+' '+text('.tl-simple-unit',card));if(b)stats.append(b);});
      else qa('.tl-chart-stat').slice(0,2).forEach(card=>{stats.append(openTile(q('.tl-chart'),text('span',card)||'Mon évolution',text('strong',card)));});
      append(panel,stats,openTile(q('.tl-simple-summary,.tl-chart'),'Évolution & calculs','Semaine, mois et année'),grid(action('[data-tl-action="occasion"]','Ajouter une consommation','cp-primary'),action('[data-tl-action="history"]','Historique')));
    }
    return true;
  }
  function healthPanel(panel,root) {
    if(!q('.hz-page'))return false;
    root.append(tabs([['benefits','Bienfaits'],['feelings','Ressentis'],['cravings','Envies']], 'benefits'));
    if(state.tab==='benefits'){
      const row=el('div','cp-health-clock');append(row,el('strong','',t('[data-health-clock-value]')),el('span','',t('[data-health-clock-unit]')),action('[data-health-action="stop-time"]','Modifier','cp-link'));
      const stages=qa('.hz-stage');if(stages.length){const label=el('label','cp-select','Repères scientifiques');const select=el('select');select.dataset.cpKey='health-stage';stages.forEach(b=>{const option=el('option','',text('strong',b)+' · '+text('small',b));option.value=b.dataset.index;option.selected=b.classList.contains('selected');select.append(option);});select.addEventListener('change',()=>{returnKey='health-stage';q(`.hz-stage[data-index="${select.value}"]`)?.click();});label.append(select);panel.append(label);}
      const cards=qa('.hz-evidence');append(panel,grid(...cards.map(card=>openTile(card,text('h3',card),preview(text('h4',card),innerWidth<360?38:55)))));
      const links=el('div','cp-context');append(links,action('[data-health-action="sources"]','Sources','cp-link'),button('Mon arrêt',e=>openDetail([q('.hz-hero')],'Mon arrêt',e.currentTarget),'cp-link'),button('La suite',e=>openDetail([q('.hz-outlook')],'Pour la suite',e.currentTarget),'cp-link'),native($('header [data-action="help"]'),'Aide','cp-link'));panel.append(links);
      if(q('.hz-early-help'))panel.append(button('Signes de manque : avis médical',e=>openDetail([q('.hz-early-help'),q('.hz-safety')],'Sécuriser les premiers jours',e.currentTarget),'cp-safety-note','early-safety'));
    }else if(state.tab==='feelings'){
      const metrics=qa('.hz-metric');if(!metrics.length){append(panel,action('[data-action="health-consent"]','Activer mon suivi','cp-primary'),action('[data-health-action="reload"]','Recharger mes ressentis'));}
      else{
        const gridNode=el('div','cp-metrics');metrics.forEach(m=>{const key=m.dataset.metric;gridNode.append(tile(text('span',m),text('strong',m),()=>{pending={route,selector:'.hz-chart',title:text('span',m),key:'metric:'+key};m.click();},'metric:'+key));});panel.append(gridNode);
        append(panel,action('[data-health-action="checkin"]','Noter mon ressenti','cp-primary'),grid(openTile(q('.hz-wins'),'Mes progrès'),openTile(q('.hz-history'),'Historique')));
      }
    }else{
      const intro=q('.hz-addiction-intro');append(panel,openTile(intro,'Comprendre les envies','Les repères scientifiques'),grid(action('[data-action="urge"]','Passer une envie','cp-primary'),native($('header [data-action="help"]'),'Du soutien')));
      append(panel,grid(openTile(q('.hz-addiction-practice'),'Mes appuis','Quatre repères'),openTile(q('.hz-craving-observed'),'Mon évolution','Mes notes d’envie')),contextStrip());
    }
    return true;
  }
  function journeyPanel(panel,root) {
    const form=q('#programForm');if(!form)return false;
    root.append(tabs([['steps','Mes étapes'],['history','Mon historique']], 'steps'));
    if(state.tab==='history'){
      const events=qa('.tl-history-event');append(panel,pager(events,listSize(),node=>openTile(node,text('h3',node)||'Période',preview(node.textContent,85))),action('[data-tl-action="change"]','Déclarer un arrêt / une reprise','cp-primary'));
      if(!events.length)append(panel,openTile(q('.tl-history-list')?.parentElement,'Mon historique','Toutes mes périodes'));
    }else{
      const section=form.closest('section'),steps=qa('.step-grid button');const label=el('label','cp-select','Choisir une étape');const select=el('select');select.dataset.cpKey='program-step';
      steps.forEach(b=>{const option=el('option','',b.getAttribute('aria-label'));option.value=b.dataset.step;option.selected=b.classList.contains('current');select.append(option);});select.addEventListener('change',()=>{returnKey='program-step';q(`.step-grid [data-step="${select.value}"]`)?.click();});label.append(select);
      const headings=$$(':scope > h2',section);append(panel,label,el('h2','',headings.at(-1)?.textContent||'Mon étape'),el('p','cp-muted',preview(text(':scope > p',section),250)),openTile(section,'Ouvrir cette étape','Lire et conserver ma réflexion'));
    }
    return true;
  }
  function collectionPanel(panel,kind) {
    const journal=kind==='journal',list=q(journal?'#journalList':'.posts');if(!list)return false;
    const controls=el('div','cp-actions');append(controls,action(journal?'[data-action="journal-new"]':'[data-action="post-new"]',journal?'Écrire une note':'Partager','cp-primary'));
    if(journal){const label=el('label','cp-search');label.append(el('span','cp-sr','Rechercher dans mes notes'));const input=el('input');input.type='search';input.value=state.query;input.placeholder='Rechercher une note';input.dataset.cpKey='journal-search';input.addEventListener('input',()=>{state.query=input.value;state.page=0;const native=q('#journalSearch');if(native){native.value=input.value;native.dispatchEvent(new Event('input',{bubbles:true}));}else draw();});label.append(input);controls.append(label);}
    else controls.append(tile('Rechercher / filtrer','',e=>openDetail([q('#feedSearchForm'),q('.filters')],'Trouver un partage',e.currentTarget)));
    panel.append(controls);
    const rows=$$(':scope > article',list).filter(n=>!n.hidden&&!n.classList.contains('empty'));
    const renderRow=node=>openTile(node,journal?text('h3',node):text('.post-top b',node)||'Partage',preview(text('.entry-body',node),innerHeight<740?48:95));
    append(panel,pager(rows,listSize(),renderRow,q('[data-action="feed-more"]')));
    if(journal){const filter=q('.ux-filter-tools');append(panel,filter?button('Filtrer mes notes',e=>openDetail([filter],'Filtrer mes notes',e.currentTarget),'cp-link','journal-filter'):null);}
    return true;
  }
  function gamesPanel(panel) {
    const buttons=qa('#gameZone [data-game],#gameZone [data-game-upgrade],.ga-card[data-game],.ga-card[data-game-upgrade],.ga-card[data-brain-game],.sz-game-card');
    const unique=[...new Set(buttons)];if(!unique.length)return false;
    append(panel,pager(unique,6,original=>{const title=text('b',original)||text('strong',original)||preview(original.textContent,45);const b=native(original,title,'cp-game');const lock=original.hasAttribute('data-game-upgrade');b.append(el('small','',lock?'Premium':'Jouer'));return b;}));return true;
  }
  function movementPanel(panel) {
    const levels=qa('[data-move="level"]'),cards=qa('.mv-card');if(!levels.length)return false;
    const options=el('div','cp-tabs');options.setAttribute('aria-label','Difficulté');options.setAttribute('role','group');
    levels.forEach(n=>{const b=native(n,preview(n.textContent,28),'cp-tab');b.setAttribute('aria-pressed',String(n.getAttribute('aria-selected')==='true'||n.classList.contains('active')));options.append(b);});panel.append(options);
    const rows=el('div','cp-exercises');cards.forEach(card=>{const action=$('[data-move="exercise"]',card);if(action){const b=native(action,text('h3',card)||'Voir l’exercice','cp-tile');rows.append(b);}});panel.append(rows);
    append(panel,grid(openTile(q('.mv-guided'),'Séance guidée'),openTile(q('.mv-safety'),'Conseils & sécurité')));
    return true;
  }
  function profilePanel(panel) {
    const profile=q('#profileForm');if(!profile)return false;
    const sections=qa('.ux-settings-group');const name=profile.elements.namedItem('display_name')?.value;
    if(name&&innerHeight>=740)panel.append(el('p','cp-profile-name',name));
    const tiles=grid(openTile(profile.closest('section'),'Identité',innerHeight>=740?'Nom et présentation':''));
    const cap=q('.ux-profile-grid .peach,.grid.equal .peach');if(cap)tiles.append(openTile(cap,'Mon objectif',innerHeight>=740?'Mes dates et mes raisons':''));
    if(sections.length)sections.forEach(s=>tiles.append(openTile(s,text('summary',s).replace(/^Suivi sensible.*$/,'Confidentialité').replace(/^Mon abonnement.*$/,'Abonnement').replace(/^Mes données.*$/,'Mes données').replace(/^Mon plan.*$/,'Mon plan'))));
    else qa(':scope > section.card').forEach(s=>tiles.append(openTile(s,text('h2',s)||text('.eyebrow',s)||'Réglages')));
    const comfort=q('.ux-comfort');if(comfort)tiles.append(openTile(comfort,'Affichage',innerHeight>=740?'Texte et thème':''));
    panel.append(tiles);return true;
  }
  function draw() {
    if(!source?.isConnected||workspace.hidden||document.querySelector('dialog[open]'))return;
    const f=rememberFocus();const root=el('div','cp-overview');root.id='cpOverview';
    const head=el('div','cp-heading');append(head,el('h1','',titles[route]),el('p','',subtitles[route]));root.append(head);
    const panel=el('section','cp-panel');panel.id='cp-panel';panel.setAttribute('aria-label',titles[route]);
    let supported=false;
    if(route==='home')supported=homePanel(panel);
    if(route==='progress')supported=progressPanel(panel,root);
    if(route==='health')supported=healthPanel(panel,root);
    if(route==='journey')supported=journeyPanel(panel,root);
    if(['journal','community'].includes(route))supported=collectionPanel(panel,route);
    if(route==='games')supported=gamesPanel(panel);
    if(route==='movement')supported=movementPanel(panel);
    if(route==='profile')supported=profilePanel(panel);
    if(!supported){if(source.hidden)source.hidden=false;overview?.remove();overview=null;document.body.classList.remove('cp-active');return;}
    if($('.cp-tabs[role="tablist"]',root)){panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','cp-tab-'+state.tab);}
    root.append(panel);
    const foot=el('div','cp-bottom');
    append(foot,button('Tous les détails',e=>openSectionIndex(e.currentTarget),'cp-link','all-options'),button('Infos & données',e=>openDetail([$('.main > footer')],'Informations & données',e.currentTarget),'cp-link','legal'));
    if(route==='profile')append(foot,action('[data-action="logout"]','Quitter','cp-link'));
    root.append(foot);
    if(overview?.isConnected)overview.replaceWith(root);else content.prepend(root);
    overview=root;if(!source.hidden)source.hidden=true;document.body.classList.add('cp-active');restoreFocus(f||{key:returnKey});returnKey='';
  }
  function mount() {
    frame=0;
    if(workspace.hidden){cleanupDetail(false);observing?.disconnect();source=null;overview=null;state={tab:'',page:0,query:''};pending=null;route='';document.body.classList.remove('cp-active');return;}
    const banner=$('#demoBanner');if(banner&&!banner.dataset.cpShort){for(const node of banner.childNodes)if(node.nodeType===3&&node.textContent.trim())node.textContent='Démo fictive, non sauvegardée. ';banner.setAttribute('aria-label','Mode démonstration : données fictives, modifications non sauvegardées.');banner.dataset.cpShort='true';}
    const page=document.body.dataset.page;
    if(!titles[page])return;
    if(!source?.isConnected){
      cleanupDetail(false);observing?.disconnect();
      const nodes=[...content.childNodes];if(!nodes.length)return;
      if(route!==page)state={tab:'',page:0,query:''};route=page;
      source=el('div','cp-source');source.id='cpSource';source.append(...nodes);content.append(source);overview=null;
      observing=new MutationObserver(()=>{if(!activeDetail)queue();});
      observing.observe(source,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden','aria-selected','aria-pressed']});
    }else if(route!==page){return;}
    draw();
    if(pending){const p=pending;pending=null;if(p.route===route&&q(p.selector))openDetail([q(p.selector)],p.title,$$('[data-cp-key]',overview).find(n=>n.dataset.cpKey===p.key));}
  }
  function queue(){if(!frame)frame=requestAnimationFrame(mount);}
  new MutationObserver(()=>{if(!source?.isConnected||workspace.hidden)queue();}).observe(content,{childList:true});
  new MutationObserver(queue).observe(workspace,{attributes:true,attributeFilter:['hidden']});
  new MutationObserver(queue).observe(document.body,{attributes:true,attributeFilter:['data-page']});
  window.addEventListener('resize',()=>{if(!activeDetail)queue();});
  document.addEventListener('close',queue,true);
  new MutationObserver(records=>{if(records.some(r=>[...r.removedNodes].some(n=>n.nodeType===1&&n.matches('dialog'))))queue();}).observe(document.body,{childList:true});
  // Billing refreshes must not close a draft. Native controllers enforce access;
  // replacement of content or sign-out handles disposal of private views.
  document.addEventListener('sobrizen-access-change',()=>{pending=null;queue();});
  // Keep an explicit history request on the matching compact view after navigation.
  window.addEventListener('click',e=>{
    const b=e.target.closest?.('button');if(!b)return;
    if(b.closest('.cp-overview'))returnKey=b.dataset.cpKey||'';
    if(b.dataset.tlAction==='history')pending={route:'journey',selector:'.tl-history-list',title:'Mon historique'};
  },true);
  // Native source dialogs: one scientific reference at a time, not seventeen stacked.
  const modal=$('#modalContent');
  if(modal)new MutationObserver(()=>{
    const sources=$('.hz-sources',modal);if(!sources||sources.dataset.cpPaged)return;
    sources.dataset.cpPaged='true';const articles=$$(':scope > article',sources);if(articles.length<2)return;
    const label=el('label','cp-select','Choisir une source');const select=el('select');
    articles.forEach((a,i)=>{const opt=el('option','',text('h3',a));opt.value=String(i);select.append(opt);a.hidden=i!==0;});
    select.addEventListener('change',()=>articles.forEach((a,i)=>a.hidden=i!==Number(select.value)));
    label.append(select);sources.before(label);
  }).observe(modal,{childList:true});
  queue();
}
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initCompact,{once:true});else initCompact();
}
