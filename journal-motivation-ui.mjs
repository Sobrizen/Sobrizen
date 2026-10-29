import {esc,dateLabel} from './core.mjs';
import {MOTIVATION_QUOTES,MOTIVATION_TITLE,MOTIVATION_KIND,createQuoteRotation,isMotivationEntry,motivationEntryId,motivationEntryBody,motivationQuoteForEntry} from './journal-motivation.mjs';

const $=selector=>document.querySelector(selector);
const labels={reflection:'Réflexion',victory:'Victoire',difficult:'Moment difficile',plan:'Plan personnel'};
const icon=(name)=>name==='quote'?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M10 6H5v7h5v-7ZM19 6h-5v7h5v-7ZM10 13c0 4-2 5-5 5M19 13c0 4-2 5-5 5" stroke-linecap="round" stroke-linejoin="round"/></svg>':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function quoteCredit(quote,{original=false}={}){
  const translation=quote.translationCredit||(quote.translation?'Traduction française SobriZen':'');
  return `<div class="jm-quote-credit"><strong class="jm-quote-author">${esc(quote.author)}</strong><cite>${esc(quote.work)}</cite><span class="jm-quote-location">${esc(quote.shortLocator||quote.locator)}</span>${quote.context?`<span class="jm-quote-context">${esc(quote.context)}</span>`:''}<a class="jm-source-link" href="${esc(quote.url)}" target="_blank" rel="noopener noreferrer" aria-label="Lire la source de cette citation de ${esc(quote.author)} (nouvel onglet)">Lire la source <span aria-hidden="true">↗</span></a>${translation?`<span class="jm-translation-label">${esc(translation)}</span>`:''}${original&&quote.translation&&quote.original?`<details class="jm-original"><summary>Lire le texte source</summary><p lang="${esc(quote.language)}">${esc(quote.original)}</p>${quote.edition?`<small>${esc(quote.edition)}</small>`:''}</details>`:''}</div>`;
}

export function createJournalMotivation({S,modal,closeModal,notify,privateWrite,healthConsentActive,accountRequest,message,sessionContext,sameSession,today}){
  const rotation=createQuoteRotation();
  let lastPage=null,tab='notes',query='',popup=null,loadToken=0,dataRevision=0,loaded=false,loading=false,loadError='';
  let inflight=new Map();
  const notes=()=>S.journal.filter(entry=>!isMotivationEntry(entry));
  const savedQuotes=()=>S.journal.filter(isMotivationEntry).sort((a,b)=>String(b.entry_date).localeCompare(String(a.entry_date))||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const currentPopup=state=>popup===state&&sameSession(state.context)&&$('#modal')?.open&&$('[data-journal-quote]')?.dataset.journalQuote===state.quote.id;
  const validContext=context=>sameSession(context)&&healthConsentActive();

  function reset(){lastPage=null;tab='notes';query='';popup=null;loadToken++;dataRevision++;loaded=false;loading=false;loadError='';inflight=new Map();rotation.reset();}

  function list(search=query){
    const filtered=notes().filter(entry=>(entry.title+' '+entry.body).toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    return filtered.length?filtered.map(entry=>`<article class="card jm-note"><div class="row between"><span class="tag">${labels[entry.kind]||'Réflexion'}</span><small>${dateLabel(entry.entry_date)}</small></div><h3>${esc(entry.title)}</h3><p class="entry-body">${esc(entry.body)}</p><div class="row"><button class="text" data-action="journal-edit" data-id="${esc(entry.id)}">Modifier</button><button class="text" data-action="journal-delete" data-id="${esc(entry.id)}">Supprimer</button></div></article>`).join(''):`<div class="card empty jm-empty">${search?'Aucune note ne correspond à ta recherche.':'Ton journal commence avec tes mots. Une phrase peut suffire.'}</div>`;
  }

  function savedQuoteCard(entry){
    const quote=motivationQuoteForEntry(entry);
    return `<article class="card jm-saved-quote"><div class="jm-saved-top"><span class="jm-small-mark">${icon('quote')}<span>${quote?'Citation sourcée':'Pensée gardée'}</span></span><time datetime="${esc(entry.entry_date)}">${dateLabel(entry.entry_date)}</time></div><blockquote>${esc(quote?.text||entry.body)}</blockquote>${quote?quoteCredit(quote):''}<div class="jm-saved-bottom"><span>Gardée pour toi</span><button type="button" class="text" data-action="journal-delete" data-id="${esc(entry.id)}" aria-label="Retirer cette citation de mon journal de motivation">Retirer</button></div></article>`;
  }

  function motivationList(){
    const entries=savedQuotes();
    return `${loadError?`<div class="jm-load-error" role="alert"><p>${esc(loadError)}</p><button type="button" class="text" data-action="journal-motivation-retry">Réessayer</button></div>`:''}${loading?'<p class="small jm-loading" role="status">Chargement de tes citations…</p>':''}${entries.length?`<div class="jm-quote-grid">${entries.map(savedQuoteCard).join('')}</div>`:!loading&&!loadError?'<div class="card empty jm-empty"><span class="jm-empty-icon" aria-hidden="true">'+icon('quote')+'</span><h2>Des mots à retrouver.</h2><p>Garde les citations qui te parlent. Elles t’attendront ici, quand tu en auras besoin.</p><button type="button" class="secondary" data-action="journal-quote-open">Découvrir une citation</button></div>':''}`;
  }

  function view(){
    return `<div class="jm-journal"><div class="jm-tabs" role="tablist" aria-label="Mon journal"><button type="button" id="jmNotesTab" role="tab" aria-controls="jmNotesPanel" aria-selected="${tab==='notes'}" tabindex="${tab==='notes'?0:-1}" data-action="journal-tab" data-tab="notes">${icon('notes')}<span>Mes notes</span><span class="jm-tab-count" data-jm-notes-count>${notes().length}</span></button><button type="button" id="jmMotivationTab" role="tab" aria-controls="jmMotivationPanel" aria-selected="${tab==='motivation'}" tabindex="${tab==='motivation'?0:-1}" data-action="journal-tab" data-tab="motivation">${icon('quote')}<span>Journal de motivation</span><span class="jm-tab-count" data-jm-quote-count>${savedQuotes().length}</span></button></div><section id="jmNotesPanel" role="tabpanel" aria-labelledby="jmNotesTab" tabindex="0" ${tab==='notes'?'':'hidden'}><div class="jm-toolbar"><button type="button" class="primary" data-action="journal-new">+ Écrire une note</button><label class="search">Rechercher<input id="journalSearch" type="search" placeholder="Un mot, un souvenir…" value="${esc(query)}"></label></div><div id="journalList" class="posts jm-notes">${list()}</div></section><section id="jmMotivationPanel" role="tabpanel" aria-labelledby="jmMotivationTab" tabindex="0" ${tab==='motivation'?'':'hidden'}><div class="jm-motivation-intro"><div><span class="eyebrow">TES MOTS POUR AVANCER</span><h2>À relire, à ton rythme.</h2><p>${MOTIVATION_QUOTES.length} citations d’auteurs, avec leurs sources. Retrouve ici celles que tu gardes.</p></div><button type="button" class="secondary" data-action="journal-quote-open">Une nouvelle citation</button></div>${S.demo?'<p class="jm-demo">Mode démo · Ces ajouts sont fictifs et disparaissent en quittant la démonstration.</p>':''}<div id="journalMotivationList">${motivationList()}</div></section></div>`;
  }

  function refreshPanels(){
    if(S.page!=='journal'||!healthConsentActive())return;
    const list=$('#journalMotivationList');if(list)list.innerHTML=motivationList();
    const noteCount=$('[data-jm-notes-count]'),quoteCount=$('[data-jm-quote-count]');
    if(noteCount)noteCount.textContent=notes().length;if(quoteCount)quoteCount.textContent=savedQuotes().length;
  }

  async function loadQuotes(force=false){
    if(S.demo){loaded=true;return;}if(loading||loaded&&!force)return;
    const context=sessionContext(),token=++loadToken,revision=dataRevision;
    if(!context.user||!healthConsentActive())return;
    loading=true;loadError='';refreshPanels();
    try{
      const rows=await accountRequest((db,uid)=>db.from('journal_entries').select('*').eq('user_id',uid).eq('kind',MOTIVATION_KIND).eq('title',MOTIVATION_TITLE).order('entry_date',{ascending:false}).order('created_at',{ascending:false}),{sensitive:true});
      if(!validContext(context)||token!==loadToken)return;
      if(revision!==dataRevision){loading=false;return loadQuotes(true);}
      S.journal=[...notes(),...rows];loaded=true;
    }catch(error){if(validContext(context)&&token===loadToken)loadError=message(error);}
    finally{if(validContext(context)&&token===loadToken){loading=false;refreshPanels();}}
  }

  function selectTab(value,{focus=false}={}){
    tab=value==='motivation'?'motivation':'notes';
    for(const name of ['notes','motivation']){
      const button=$(`[data-action="journal-tab"][data-tab="${name}"]`),panel=$(`#${name==='notes'?'jmNotesPanel':'jmMotivationPanel'}`);
      if(button){button.setAttribute('aria-selected',String(tab===name));button.tabIndex=tab===name?0:-1;if(focus&&tab===name)button.focus({preventScroll:true});}
      if(panel)panel.hidden=tab!==name;
    }
    if(tab==='motivation')void loadQuotes();
  }

  function openQuote(){
    if(!S.user||!healthConsentActive()||S.page!=='journal')return;
    // Never replace a note or another form already open in the shared dialog.
    if($('#modal')?.open&&!$('[data-journal-quote]'))return;
    const quote=rotation.next(),context=sessionContext();popup={quote,context};
    modal('Une pensée pour avancer',`<div class="jm-quote${quote.text.length>200?' jm-quote-long':''}" data-journal-quote="${quote.id}"><div class="jm-quote-symbol">${icon('quote')}</div><span class="eyebrow">${esc(quote.theme||'UN INSTANT POUR TOI')}</span><blockquote id="jmQuoteText" tabindex="-1">${esc(quote.text)}</blockquote>${quoteCredit(quote,{original:true})}<p class="jm-quote-hint">Si ces mots te parlent, garde-les dans ton journal de motivation.</p>${S.demo?'<p class="jm-demo">Mode démo · Ajout fictif, conservé uniquement pendant cette démonstration.</p>':''}<p id="jmQuoteError" class="jm-quote-error" role="alert" hidden></p><div class="jm-quote-actions"><button type="button" class="primary full" data-action="journal-quote-save">${icon('notes')}<span>Garder cette citation</span></button><button type="button" class="text full" data-action="close">Continuer vers mon journal</button></div></div>`);
    $('#modal').setAttribute('aria-describedby','jmQuoteText');$('#jmQuoteText')?.focus({preventScroll:true});
    // The mobile drawer restores its trigger after navigation. Let that finish
    // before moving focus into the newly opened native modal.
    const state=popup;setTimeout(()=>{if(currentPopup(state))$('#jmQuoteText')?.focus({preventScroll:true});},0);
  }

  function pageRendered(){
    const entering=S.page==='journal'&&lastPage!=='journal';lastPage=S.page;
    if(S.page!=='journal'){if($('[data-journal-quote]')&&$('#modal')?.open)closeModal();return;}
    if(!healthConsentActive())return;
    if(tab==='motivation')void loadQuotes();
    if(entering)openQuote();
  }

  async function saveQuote(){
    const state=popup;if(!state||!currentPopup(state)||inflight.has(state.quote.id))return;
    const {context,quote}=state,requests=inflight,request={};requests.set(quote.id,request);
    const button=$('[data-action="journal-quote-save"]'),errorNode=$('#jmQuoteError');
    if(button){button.disabled=true;button.setAttribute('aria-busy','true');button.querySelector('span').textContent='Enregistrement…';}if(errorNode)errorNode.hidden=true;
    try{
      privateWrite();const id=await motivationEntryId(context.user.id,quote.id);
      if(!validContext(context))return;
      const row={id,user_id:context.user.id,entry_date:today(),title:MOTIVATION_TITLE,body:motivationEntryBody(quote),kind:MOTIVATION_KIND};
      let saved,already=false;
      if(context.demo){saved=S.journal.find(entry=>entry.id===id);already=!!saved;saved||={...row,created_at:new Date().toISOString()};}
      else{
        saved=await accountRequest((db,uid)=>db.from('journal_entries').select('*').eq('user_id',uid).eq('id',id).maybeSingle(),{sensitive:true});already=!!saved;
        if(!saved){
          try{saved=await accountRequest((db,uid)=>db.from('journal_entries').insert({...row,user_id:uid}).select().single(),{sensitive:true});}
          catch(error){
            if(error?.code!=='23505')throw error;
            saved=await accountRequest((db,uid)=>db.from('journal_entries').select('*').eq('user_id',uid).eq('id',id).maybeSingle(),{sensitive:true});
            if(!saved)throw error;already=true;
          }
        }
      }
      if(!validContext(context))return;
      if(!saved?.id)throw Error('La sauvegarde n’a pas été confirmée. Réessaie.');
      dataRevision++;S.journal=[saved,...S.journal.filter(entry=>entry.id!==saved.id)];
      const active=currentPopup(state);
      if(active){state.restoreFocus=false;closeModal();selectTab('motivation');$('#jmMotivationTab')?.focus({preventScroll:true});}
      refreshPanels();
      notify(context.demo?(already?'Cette citation est déjà dans ton journal de démonstration.':'Citation ajoutée à la démonstration. Aucune donnée n’a été enregistrée en ligne.'):already?'Cette citation est déjà dans ton journal de motivation.':'Citation ajoutée à ton journal de motivation.');
    }catch(error){
      if(!validContext(context))return;
      if(currentPopup(state)){const node=$('#jmQuoteError');if(node){node.textContent=message(error);node.hidden=false;}}else notify(message(error));
    }finally{
      if(requests.get(quote.id)===request)requests.delete(quote.id);
      if(currentPopup(state)&&button?.isConnected){button.disabled=false;button.removeAttribute('aria-busy');button.querySelector('span').textContent='Garder cette citation';}
    }
  }

  function changed(){dataRevision++;refreshPanels();}
  // loadPrivate replaces the latest 50 notes. Older saved quotes must be fetched
  // again without treating a refresh as a new journal visit.
  function reloaded(){loadToken++;dataRevision++;loaded=false;loading=false;loadError='';}
  function search(value){query=value;const listNode=$('#journalList');if(listNode)listNode.innerHTML=list(value);}

  document.addEventListener('keydown',event=>{
    const button=event.target.closest?.('[data-action="journal-tab"]');
    if(!button||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const next=event.key==='Home'?'notes':event.key==='End'?'motivation':button.dataset.tab==='notes'?'motivation':'notes';selectTab(next,{focus:true});
  });
  $('#modal')?.addEventListener('close',()=>{
    if($('#modal').open)return;
    const closed=popup;popup=null;$('#modal').removeAttribute('aria-describedby');
    if(closed&&closed.restoreFocus!==false&&validContext(closed.context)&&S.page==='journal'){
      // The original trigger may now be in the inert mobile drawer. Return to
      // the visible journal instead of allowing focus to disappear behind it.
      const heading=$('#content h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
    }
  });
  $('#modal')?.addEventListener('click',event=>{
    const dialog=$('#modal');if(event.target!==dialog||!$('[data-journal-quote]'))return;
    const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)closeModal();
  });
  const content=$('#modalContent');if(content)new MutationObserver(()=>{if(!$('[data-journal-quote]')){popup=null;$('#modal')?.removeAttribute('aria-describedby');}}).observe(content,{childList:true});

  return {view,list,search,reset,pageRendered,openQuote,saveQuote,selectTab,changed,reloaded,retry:()=>loadQuotes(true)};
}
