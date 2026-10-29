/* Brief, local form feedback. No user values are stored or sent anywhere. */
const fieldStates=new WeakMap(),formStates=new WeakMap(),runtimes=new WeakMap();
let nextId=0;
const fields=form=>[...form.elements].filter(node=>node.matches?.('input,textarea,select'));
const isField=node=>node?.matches?.('input,textarea,select')&&typeof node.setCustomValidity==='function';
const messageText=value=>String(value||'Vérifie ce champ.').trim().slice(0,400)||'Vérifie ce champ.';
const tokens=value=>String(value||'').split(/\s+/).filter(Boolean);
function addToken(field,name,id){const values=tokens(field.getAttribute(name));if(!values.includes(id))values.push(id);field.setAttribute(name,values.join(' '));}
function removeToken(field,name,id){const values=tokens(field.getAttribute(name)).filter(value=>value!==id);if(values.length)field.setAttribute(name,values.join(' '));else field.removeAttribute(name);}
function canonical(field){
  if(field.type!=='radio'||!field.name||!field.form)return field;
  const existing=fields(field.form).find(node=>node.type==='radio'&&node.name===field.name&&fieldStates.has(node));if(existing)return existing;
  return fields(field.form).find(node=>node.type==='radio'&&node.name===field.name&&!node.disabled)||field;
}
function group(field){return field.type==='radio'&&field.name&&field.form?fields(field.form).filter(node=>node.type==='radio'&&node.name===field.name):[field];}
function available(node){return !!node?.isConnected&&!node.readOnly&&!node.closest('[hidden],[inert]')&&!node.matches?.(':disabled')&&!(node.closest('dialog')&&!node.closest('dialog').open);}
function focusTarget(node){
  if(!available(node))return false;
  for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
  try{node.focus({preventScroll:true});node.scrollIntoView?.({block:'nearest',behavior:'auto'});}catch{node.focus?.();}
  return true;
}
function requestFocus(node,summary=false){
  const runtime=install(node.ownerDocument.defaultView);
  if(summary)runtime.summaryFocus||=node;else runtime.fieldFocus||=node;
  if(runtime.focusQueued)return;runtime.focusQueued=true;
  Promise.resolve().then(()=>{
    runtime.focusQueued=false;const field=runtime.fieldFocus,form=runtime.summaryFocus;runtime.fieldFocus=null;runtime.summaryFocus=null;
    if(!focusTarget(field))focusTarget(form);
  });
}
function boundary(field,value){
  if(field.type==='date'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value.split('-').reverse().join('/');
  if(field.type==='datetime-local')return value.replace(/^(\d{4})-(\d{2})-(\d{2})T/,'$3/$2/$1 à ');
  return String(value).replace('.',',');
}
function nativeMessage(field){
  const validity=field.validity;
  if(validity.customError)return messageText(field.validationMessage);
  if(validity.valueMissing){
    if(field.dataset.errorRequired)return messageText(field.dataset.errorRequired);
    if(field.type==='checkbox')return 'Coche cette case pour continuer.';
    if(field.type==='radio'||field.tagName==='SELECT')return 'Choisis une option.';
    if(field.type==='file')return 'Choisis un fichier.';
    if(field.type==='email')return 'Saisis ton adresse email.';
    if(field.type==='password')return 'Saisis ton mot de passe.';
    if(field.type==='date')return 'Choisis une date.';
    if(field.type==='time')return 'Choisis une heure.';
    if(field.type==='datetime-local')return 'Choisis une date et une heure.';
    return 'Remplis ce champ.';
  }
  if(validity.typeMismatch){
    if(field.type==='email')return 'Saisis une adresse email complète, par exemple nom@exemple.fr.';
    if(field.type==='url')return 'Saisis une adresse complète, par exemple https://exemple.fr.';
    return 'Vérifie le format de ce champ.';
  }
  if(validity.badInput)return ['date','time','datetime-local'].includes(field.type)?'Choisis une date ou une heure valide.':'Saisis un nombre valide.';
  if(validity.tooShort)return `Saisis au moins ${field.minLength} caractères.`;
  if(validity.tooLong)return `Limite ce champ à ${field.maxLength} caractères.`;
  if(validity.rangeUnderflow||validity.rangeOverflow){
    const low=boundary(field,field.min),high=boundary(field,field.max);
    if(field.type==='date')return validity.rangeUnderflow?`Choisis une date à partir du ${low}.`:`Choisis une date au plus tard le ${high}.`;
    if(['time','datetime-local','month','week'].includes(field.type))return validity.rangeUnderflow?`Choisis une valeur à partir de ${low}.`:`Choisis une valeur au plus tard à ${high}.`;
    if(field.min!==''&&field.max!=='')return `Saisis un nombre entre ${low} et ${high}.`;
    return validity.rangeUnderflow?`Saisis ${low} ou plus.`:`Saisis ${high} ou moins.`;
  }
  if(validity.stepMismatch){
    if(['time','datetime-local'].includes(field.type))return !field.step||field.step==='60'?'Choisis une heure à la minute près.':'Choisis une heure correspondant à l’intervalle indiqué.';
    const step=field.step||'1',base=Number(field.min||field.getAttribute('value')||0),decimal=/^0\.(0*)1$/.exec(step),places=decimal?decimal[1].length+1:0;
    if(step==='1'&&Number.isInteger(base))return 'Saisis un nombre entier.';
    if(decimal&&Math.abs(base*10**places-Math.round(base*10**places))<1e-7)return `Utilise ${places} décimale${places>1?'s':''} maximum.`;
    return `Utilise des pas de ${boundary(field,step)}.`;
  }
  if(validity.patternMismatch)return messageText(field.dataset.errorPattern||field.title||'Ce format n’est pas accepté. Vérifie les caractères saisis.');
  return 'Vérifie ce champ avant de continuer.';
}
function wrapper(anchor){
  const parent=anchor.parentElement;if(parent?.hasAttribute('data-form-feedback-wrapper'))return parent;
  const node=anchor.ownerDocument.createElement('div');node.className='form-field-feedback';node.dataset.formFeedbackWrapper='';
  if(anchor.style.gridColumn)node.style.gridColumn=anchor.style.gridColumn;
  const active=anchor.ownerDocument.activeElement,restore=active&&anchor.contains(active),start=restore?active.selectionStart:null,end=restore?active.selectionEnd:null;
  anchor.before(node);
  if(typeof node.moveBefore==='function')node.moveBefore(anchor,null);else node.append(anchor);
  if(restore&&anchor.ownerDocument.activeElement!==active){active.focus({preventScroll:true});if(start!==null&&typeof active.setSelectionRange==='function')try{active.setSelectionRange(start,end);}catch{}}
  return node;
}
function placeMessage(field,node){
  const fieldset=field.type==='radio'?field.closest('fieldset'):null;
  if(fieldset){fieldset.append(node);return null;}
  const label=field.closest('label'),anchor=label||field;
  const box=wrapper(anchor);box.append(node);return box;
}
function renderField(field,message,kind='native'){
  field=canonical(field);const runtime=install(field.ownerDocument.defaultView);
  let state=fieldStates.get(field);
  if(!state){
    const node=field.ownerDocument.createElement('p');node.id='form-field-error-'+(++nextId);node.className='form-field-error';node.dataset.formFieldError='';node.setAttribute('role','status');node.setAttribute('aria-live','polite');node.setAttribute('aria-atomic','true');
    state={node,wrapper:null,members:new Map(),ownedMessage:'',kind};fieldStates.set(field,state);runtime.active.add(field);state.wrapper=placeMessage(field,node);
  }
  if(state.pendingClear){state.pendingClear=false;state.members.clear();if(!state.node.isConnected)state.wrapper=placeMessage(field,state.node);runtime.active.add(field);}
  state.kind=kind;
  if(state.node.textContent!==message)state.node.textContent=message;
  for(const member of group(field)){
    if(!state.members.has(member))state.members.set(member,{invalid:member.getAttribute('aria-invalid'),marker:member.getAttribute('data-form-invalid')});
    member.setAttribute('aria-invalid','true');member.dataset.formInvalid='true';addToken(member,'aria-describedby',state.node.id);addToken(member,'aria-errormessage',state.node.id);
  }
  return state;
}

/** Show a field-specific application/server error; editing releases only this error. */
export function showFieldError(input,message,{focus=true}={}){
  if(!isField(input))return false;
  const field=canonical(input),text=messageText(message),state=renderField(field,text,'owned');
  field.setCustomValidity(text);state.ownedMessage=text;
  if(focus)requestFocus(field);return false;
}
export function clearFieldError(input){
  if(!isField(input))return;
  const field=canonical(input),state=fieldStates.get(field);if(!state)return;
  const waiting=!!(state.ownedMessage&&field.validity.customError&&!field.validationMessage);
  if(state.ownedMessage&&field.validity.customError&&field.validationMessage===state.ownedMessage)field.setCustomValidity('');
  for(const [member,original]of state.members){
    removeToken(member,'aria-describedby',state.node.id);removeToken(member,'aria-errormessage',state.node.id);
    if(member.getAttribute('aria-invalid')==='true'){if(original.invalid===null)member.removeAttribute('aria-invalid');else member.setAttribute('aria-invalid',original.invalid);}
    if(member.getAttribute('data-form-invalid')==='true'){if(original.marker===null)member.removeAttribute('data-form-invalid');else member.setAttribute('data-form-invalid',original.marker);}
  }
  // Keep the transparent field wrapper so correction never reparents a focused input.
  state.node.remove();
  // Barred controls hide validationMessage. Keep ownership until it can be compared,
  // rather than leaving a stale custom error or clearing another controller's error.
  if(waiting){state.pendingClear=true;state.members.clear();if(!field.isConnected)runtimes.get(field.ownerDocument.defaultView)?.active.delete(field);return;}
  fieldStates.delete(field);runtimes.get(field.ownerDocument.defaultView)?.active.delete(field);
}

/** Persistent service feedback, separate from field validation and short-lived toasts. */
export function showFormError(form,message,{focus=true}={}){
  if(form?.tagName!=='FORM')return false;
  install(form.ownerDocument.defaultView);let node=formStates.get(form);
  if(!node||!node.isConnected){node=form.ownerDocument.createElement('p');node.className='form-error-summary';node.dataset.formError='';node.setAttribute('role','alert');node.setAttribute('aria-atomic','true');node.tabIndex=-1;form.prepend(node);formStates.set(form,node);}
  node.textContent=messageText(message);if(focus)requestFocus(node,true);return false;
}
export function clearFormError(form){const node=formStates.get(form);if(node)node.remove();formStates.delete(form);}
function requiredBlank(field){return field.required&&field.willValidate&&available(field)&&(field.tagName==='TEXTAREA'||['text','search','tel','url','email'].includes(field.type))&&!field.value.trim();}
function blankMessage(field){return field.dataset.errorRequired||'Remplis ce champ.';}
function onEdit(target){
  if(!isField(target))return;const field=canonical(target),state=fieldStates.get(field);if(!state)return;
  if(state.ownedMessage&&field.validity.customError&&field.validationMessage===state.ownedMessage){field.setCustomValidity('');state.ownedMessage='';}
  // Controllers may set their own custom validity later in the same event.
  Promise.resolve().then(()=>{
    if(!fieldStates.has(field))return;
    if(!available(field)){clearFieldError(field);return;}
    if(field.validity.valid){if(requiredBlank(field))showFieldError(field,blankMessage(field),{focus:false});else clearFieldError(field);}
    else renderField(field,nativeMessage(field));
  });
}
function install(win){
  if(runtimes.has(win))return runtimes.get(win);
  const runtime={active:new Set(),fieldFocus:null,summaryFocus:null,focusQueued:false};runtimes.set(win,runtime);
  win.addEventListener('invalid',event=>{
    const input=event.target;if(!isField(input))return;event.preventDefault();const field=canonical(input);
    clearFormError(field.form);renderField(field,nativeMessage(input));requestFocus(field);
  },true);
  for(const type of ['input','change'])win.addEventListener(type,event=>onEdit(event.target),true);
  win.addEventListener('submit',event=>{
    const form=event.target;if(form?.tagName!=='FORM')return;clearFormError(form);
    const blanks=fields(form).filter(requiredBlank);if(!blanks.length)return;
    event.preventDefault();event.stopImmediatePropagation();for(const field of blanks)showFieldError(field,blankMessage(field),{focus:false});requestFocus(blanks[0]);
  },true);
  win.addEventListener('reset',event=>{
    const form=event.target;if(form?.tagName!=='FORM')return;
    Promise.resolve().then(()=>{if(event.defaultPrevented)return;for(const field of fields(form))clearFieldError(field);clearFormError(form);});
  },true);
  const observer=new win.MutationObserver(records=>{
    for(const record of records)for(const node of record.addedNodes||[]){
      if(node.nodeType!==1)continue;
      for(const field of [node,...node.querySelectorAll('input,select,textarea')])if(isField(field)&&fieldStates.get(canonical(field))?.pendingClear)runtime.active.add(canonical(field));
    }
    for(const field of [...runtime.active]){
      const state=fieldStates.get(field);
      if(state?.pendingClear){if(field.validationMessage||!field.validity.customError)clearFieldError(field);else if(!field.isConnected)runtime.active.delete(field);continue;}
      if(!available(field)){clearFieldError(field);continue;}
      if(state?.kind==='native'){if(field.validity.valid)clearFieldError(field);else renderField(field,nativeMessage(field));}
    }
  });
  observer.observe(win.document,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','inert','disabled','readonly','required','min','max','step','minlength','maxlength','pattern','type','open']});
  return runtime;
}
/** Explicit, idempotent startup. Dynamic forms use the same capture listeners. */
export function initFormValidation(){if(typeof window!=='undefined'&&window.document)install(window);}
/** Validate the currently available fields; hidden wizard steps remain controller-owned. */
export function validateForm(form){
  if(form?.tagName!=='FORM')return false;initFormValidation();clearFormError(form);let valid=true;
  for(const field of fields(form)){
    if(!field.willValidate||!available(field))continue;
    if(requiredBlank(field)){showFieldError(field,blankMessage(field),{focus:false});requestFocus(field);valid=false;}
    else if(!field.checkValidity())valid=false;
  }
  return valid;
}
