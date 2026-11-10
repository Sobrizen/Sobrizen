import {loadSemanticData} from './semantizen-data.mjs';
import {parisDay,dailyTarget,randomTarget,rankWords,newRound,submitGuess,revealHint,recordResult,shareSummary} from './semantizen-core.mjs';
import {gamePremiumAllowed,gameSession,sameGameSession,beginGameRecord,saveGameRecord,gameRecordMarkup,gameRecordStatusMarkup} from './games-runtime.mjs';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let installed=false,active=null,savedSession=null,rounds=new Map();
const allowed=()=>gamePremiumAllowed()||gameSession()?.demo===true;
function styles(){if(document.getElementById('smStyles'))return;const node=document.createElement('link');node.id='smStyles';node.rel='stylesheet';node.href=new URL('./semantizen.css',import.meta.url).href;document.head.append(node);}
export function semanticCard(){styles();const access=allowed(),demo=gameSession()?.demo===true;
 return `<button type="button" class="ga-card sm-card" ${access?'data-semantic-game':'data-game-upgrade="semantizen"'} aria-label="SémantiZen — ${access?'jouer':'Premium'}"><span class="ga-card-icon" aria-hidden="true">🧠</span><small>NOUVEAU · ${demo?'DÉMO':access?'PREMIUM':'🔒 PREMIUM'}</small><b>SémantiZen</b><span>Trouve le mot caché. Chaque idée te rapproche.</span>${gameRecordMarkup('semantizen')}<strong>${access?'Jouer':'Découvrir'} ↗</strong></button>`;
}
function message(a,text,error=false){if(active!==a)return;a.status.textContent=text;a.status.setAttribute('role',error?'alert':'status');}
function close(){const a=active;if(!a)return;active=null;a.controller.abort();a.observer?.disconnect();a.root.close();a.root.remove();document.body.style.overflow=a.overflow;if(a.origin?.isConnected)a.origin.focus({preventScroll:true});}
function valid(a){return active===a&&sameGameSession(a.session)&&allowed();}
function resetPrivate(){close();rounds.clear();savedSession=null;}
function viewport(a){if(valid(a)&&(!window.visualViewport||window.visualViewport.scale===1))a.root.style.setProperty('--sm-height',(window.visualViewport?.height||innerHeight)+'px');}
function helpMarkup(){return `<details class="sm-help"><summary>Comment jouer ?</summary><p>Propose un mot français. Sa température mesure sa proximité de <strong>sens ou de contexte</strong> avec le mot caché, pas les lettres en commun. Les associations du modèle peuvent surprendre : deux contraires peuvent être proches.</p><p>Le thermomètre va de −100 à 100 °C. Seul le mot exact atteint 100 °C. Le rang indique la position parmi les mots les plus proches : <strong>#1 est le plus proche</strong>. Les accents sont acceptés ; sans accent, seule une correspondance non ambiguë est adaptée.</p><p>Trois indices sont disponibles. Ton record est le plus petit nombre d’essais pour une victoire <strong>sans indice ni solution dévoilée</strong>, tous défis confondus. Les mots inconnus et doublons ne comptent pas. Les résultats sont personnels, sans classement public.</p><p>Le défi change à minuit, heure de Paris. Le mode libre est inclus dans Premium. Ta partie reste disponible en revenant aux jeux pendant cette session ; seuls les records sont synchronisés avec ton compte. Aucun mot saisi n’est transmis à un service d’IA.</p><p>Jeu original SobriZen, indépendant de Cémantix. Modèle français de <a href="https://fauconnier.github.io/#data" target="_blank" rel="noopener noreferrer">Jean-Philippe Fauconnier</a> (<a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer">CC BY 3.0</a>), extrait et quantifié pour SobriZen. <a href="/semantizen-credits.html" target="_blank" rel="noopener noreferrer">Sources et limites</a>.</p></details>`;}
async function start(a,mode='daily',fresh=false){
 if(!valid(a))return;const request=++a.request;a.ready=false;a.form.hidden=true;a.loading.hidden=false;a.loading.textContent='Chargement du dictionnaire…';a.retry.hidden=true;a.list.replaceChildren();a.result.hidden=true;
 try{
  const lexicon=await loadSemanticData();if(!valid(a)||request!==a.request)return;a.lexicon=lexicon;
  const day=parisDay(),key=mode==='daily'?day:'free';let round=rounds.get(key);
  if(!round||fresh){const target=mode==='daily'?dailyTarget(lexicon,day):randomTarget(lexicon,a.round?.target??dailyTarget(lexicon,day));round=newRound(target,{mode,day});round.token=beginGameRecord('semantizen');rounds.set(key,round);while(rounds.size>5)rounds.delete(rounds.keys().next().value);}
  a.loading.textContent='Préparation des proximités…';await new Promise(resolve=>setTimeout(resolve,0));if(!valid(a)||request!==a.request)return;
  a.ranking=rankWords(lexicon,round.target);a.round=round;a.ready=true;a.limit=30;a.pendingAction=null;a.loading.hidden=true;a.form.hidden=false;
  render(a);message(a,round.attempts.length?'Ta partie est conservée.':'Commence par un mot : nature, travail, maison…');a.input.focus({preventScroll:true});
 }catch(error){if(!valid(a)||request!==a.request)return;a.loading.textContent='Le jeu n’a pas pu être chargé.';a.retry.hidden=false;message(a,error.message||'Connexion interrompue. Réessaie.',true);}
}
function render(a){
 if(!valid(a)||!a.ready)return;const s=a.round,playing=s.status==='playing',best=[...s.attempts].sort((x,y)=>y.temperature-x.temperature)[0];
 a.root.querySelector('[data-sm-day]').textContent=s.mode==='daily'?`Défi du ${s.day.split('-').reverse().join('/')} · heure de Paris`:'Mode libre · à ton rythme';
 a.root.querySelector('[data-sm-attempts]').textContent=String(s.attempts.length);
 a.root.querySelector('[data-sm-best]').textContent=best?best.temperature.toFixed(2).replace('.',',')+' °C':'—';
 a.input.disabled=!playing;a.form.querySelector('button').disabled=!playing;
 a.root.querySelector('[data-sm=hint]').disabled=!playing||s.hints.length>=3;
 a.root.querySelector('[data-sm=hint]').textContent=`Indice ${s.hints.length}/3`;
 a.root.querySelector('[data-sm=reveal]').hidden=!playing;
 a.root.querySelector('[data-sm=daily]').setAttribute('aria-pressed',String(s.mode==='daily'));
 a.root.querySelector('[data-sm=free]').setAttribute('aria-pressed',String(s.mode==='free'));
 a.root.querySelector('[data-sm=free]').disabled=!gamePremiumAllowed();
 a.root.querySelector('[data-sm-demo]').hidden=gameSession()?.demo!==true;
 const meter=a.root.querySelector('meter');meter.value=best?.temperature??-100;meter.setAttribute('aria-valuetext',best?best.temperature+' degrés de proximité':'Aucune proposition');
 const entries=[...s.attempts].sort(a.sort==='latest'?(x,y)=>y.number-x.number:(x,y)=>y.temperature-x.temperature||x.number-y.number);
 a.list.innerHTML=entries.slice(0,a.limit).map(e=>`<tr><td>${e.number}</td><th scope="row">${esc(e.word)}</th><td><span class="sm-heat" data-heat="${e.rank===0?'won':e.rank<=50?'hot':e.rank<=1000?'warm':'cold'}">${e.temperature.toFixed(2).replace('.',',')} °C</span></td><td>${e.rank===0?'✓ Trouvé':e.rank<=1000?'#'+e.rank:'Hors top 1 000'}</td></tr>`).join('');
 a.root.querySelector('[data-sm-empty]').hidden=!!entries.length;
 a.root.querySelector('[data-sm=more]').hidden=entries.length<=a.limit;
 a.root.querySelector('[data-sm-hints]').innerHTML=s.hints.map((h,i)=>`<p>Indice ${i+1} : <strong>${esc(h.word)}</strong> · proximité #${h.rank}</p>`).join('');
 a.result.hidden=playing;
 if(!playing)a.result.innerHTML=`<h3>${s.status==='won'?'Bien joué !':'Solution dévoilée'}</h3><p>Le mot était <strong>${esc(a.lexicon.words[s.target])}</strong>.</p><p>${s.attempts.length} essai${s.attempts.length>1?'s':''}${s.hints.length?' · '+s.hints.length+' indice(s)':''}. ${s.status==='won'&&!s.hints.length?'Cette victoire compte pour ton record.':'Partie sans record : rejoue sans aide pour le battre.'}</p>${gameRecordMarkup('semantizen')}${gameRecordStatusMarkup()}${s.status==='won'?'<button type="button" data-sm="share">Copier mon résultat sans dévoiler le mot</button>':''}`;
 a.root.querySelector('[data-sm-confirm]').hidden=!a.pendingAction;
 if(a.pendingAction)a.root.querySelector('[data-sm-confirm-text]').textContent=a.pendingAction==='reveal'?'Afficher la solution ? Cette partie ne comptera pas pour ton record.':'Commencer un autre mot ? La partie libre actuelle sera remplacée.';
 if(s.status==='won'&&!s.recordSubmitted){const value=recordResult(s);s.recordSubmitted=true;if(value)saveGameRecord(s.token,value);}
}
async function launch(){
 if(!allowed()){location.href='/abonnement.html';return;}if(active||document.getElementById('gaPlay')||document.getElementById('pzPlay'))return;
 if(savedSession&&!sameGameSession(savedSession))rounds.clear();savedSession=gameSession();styles();
 const root=document.createElement('dialog');root.id='smPlay';root.className='sm-play';root.setAttribute('aria-labelledby','smTitle');
 root.innerHTML=`<header class="sm-top"><div><small>LE POUVOIR DES MOTS</small><h2 id="smTitle">SémantiZen</h2></div><button type="button" data-sm="close" aria-label="Quitter SémantiZen">✕</button></header><div class="sm-scroll"><div class="sm-modes"><button type="button" data-sm="daily" aria-pressed="true">Mot du jour</button><button type="button" data-sm="free" aria-pressed="false">Autre mot · Premium</button></div><p class="sm-day" data-sm-day></p><p class="sm-demo" data-sm-demo hidden>Démo : teste le mot du jour. Le mode libre et les records synchronisés sont inclus dans Premium.</p><div class="sm-stats"><div><span>Essais</span><b data-sm-attempts>0</b></div><div><span>Meilleure proximité</span><b data-sm-best>—</b></div></div><meter min="-100" max="100" value="-100" aria-label="Meilleure proximité sémantique"></meter><div class="sm-record">${gameRecordMarkup('semantizen')}</div><p class="sm-loading" data-sm-loading role="status"></p><button type="button" data-sm="retry" hidden>Réessayer le chargement</button><section class="sm-result" data-sm-result hidden aria-live="polite"></section><form id="smGuessForm" class="sm-form" hidden novalidate><label for="smWord">Ton idée</label><div><input id="smWord" name="word" type="text" maxlength="40" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="go" placeholder="Propose un mot…" aria-describedby="smStatus"><button type="submit">Tester →</button></div></form><p id="smStatus" class="sm-status" role="status" aria-live="polite"></p><div class="sm-actions"><button type="button" data-sm="hint">Indice 0/3</button><button type="button" data-sm="reveal">Voir la solution</button></div><div class="sm-hints" data-sm-hints></div><section class="sm-confirm" data-sm-confirm hidden><p data-sm-confirm-text></p><button type="button" data-sm="confirm">Confirmer</button><button type="button" data-sm="cancel">Annuler</button></section><div class="sm-history-head"><h3>Tes propositions</h3><label>Trier <select data-sm-sort aria-label="Trier les propositions"><option value="best">Proximité</option><option value="latest">Plus récentes</option></select></label></div><p class="sm-empty" data-sm-empty>Un mot, une piste. À toi de jouer.</p><div class="sm-table-wrap"><table><caption class="sm-sr">Propositions, température et rang de proximité</caption><thead><tr><th scope="col">Essai</th><th scope="col">Mot</th><th scope="col">Température</th><th scope="col">Proximité</th></tr></thead><tbody data-sm-list></tbody></table></div><button type="button" data-sm="more" hidden>Voir les propositions suivantes</button>${helpMarkup()}</div>`;
 const a={root,session:savedSession,origin:document.activeElement,source:document.getElementById('gameZone'),controller:new AbortController(),request:0,ready:false,sort:'best',limit:30,overflow:document.body.style.overflow};active=a;
 for(const [k,s] of Object.entries({form:'#smGuessForm',input:'#smWord',status:'#smStatus',list:'[data-sm-list]',result:'[data-sm-result]',loading:'[data-sm-loading]',retry:'[data-sm=retry]'}))a[k]=root.querySelector(s);
 document.body.append(root);document.body.style.overflow='hidden';root.showModal();const signal=a.controller.signal;
 root.addEventListener('cancel',event=>{event.preventDefault();close();},{signal});
 a.form.addEventListener('submit',event=>{event.preventDefault();event.stopPropagation();if(!valid(a)||!a.ready)return;try{const out=submitGuess(a.round,a.lexicon,a.ranking,a.input.value);a.input.setAttribute('aria-invalid','false');a.input.value='';render(a);message(a,out.duplicate?'Mot déjà proposé : il ne compte pas une deuxième fois.':out.won?'Mot trouvé !':`${out.adapted?'Mot reconnu : '+out.entry.word+'. ':''}${out.entry.temperature.toFixed(2).replace('.',',')} °C · ${out.entry.rank<=1000?'proximité #'+out.entry.rank:'hors des 1 000 plus proches'}.`);if(!out.won)a.input.focus({preventScroll:true});}catch(error){a.input.setAttribute('aria-invalid','true');message(a,error.message,true);a.input.focus({preventScroll:true});}},{signal});
 root.addEventListener('click',async event=>{const button=event.target.closest('[data-sm]');if(!button)return;const action=button.dataset.sm;if(action==='close'){close();return;}if(!valid(a))return;if(action==='retry'){void start(a);return;}if(!a.ready)return;
  try{
   if(action==='daily'){void start(a,'daily');return;}
   if(action==='free'){if(!gamePremiumAllowed())return;if(rounds.get('free')?.status==='playing'&&rounds.get('free').attempts.length){a.pendingAction='free';}else{void start(a,'free',true);return;}}
   if(action==='hint'){const h=revealHint(a.round,a.lexicon,a.ranking);message(a,'Indice : '+h.word+'. Cette partie ne comptera pas pour ton record.');}
   if(action==='reveal')a.pendingAction='reveal';
   if(action==='cancel')a.pendingAction=null;
   if(action==='confirm'){const wanted=a.pendingAction;a.pendingAction=null;if(wanted==='free'&&gamePremiumAllowed()){void start(a,'free',true);return;}if(wanted==='reveal'){a.round.status='revealed';message(a,'Solution affichée. Aucun record enregistré.');}}
   if(action==='more')a.limit+=30;
   if(action==='share'){const text=shareSummary(a.round);if(!navigator.clipboard?.writeText)throw Error('La copie n’est pas disponible dans ce navigateur.');await navigator.clipboard.writeText(text);if(valid(a))message(a,'Résultat copié, sans dévoiler le mot.');}
   render(a);
  }catch(error){message(a,error.message,true);}
 },{signal});
 root.querySelector('[data-sm-sort]').addEventListener('change',event=>{a.sort=event.target.value;render(a);},{signal});
 window.addEventListener('resize',()=>viewport(a),{signal});window.visualViewport?.addEventListener('resize',()=>viewport(a),{signal});
 a.observer=new MutationObserver(()=>{if(a.source&&!a.source.isConnected)close();});if(a.source?.parentNode)a.observer.observe(a.source.parentNode,{childList:true});
 viewport(a);await start(a);
}
export function initSemanticGame(){if(installed)return;installed=true;document.addEventListener('click',event=>{if(event.target.closest('[data-semantic-game]'))void launch();});document.addEventListener('sobrizen-access-change',()=>{if(savedSession&&!sameGameSession(savedSession))resetPrivate();else if(active&&!allowed())close();});window.addEventListener('pagehide',resetPrivate);}
