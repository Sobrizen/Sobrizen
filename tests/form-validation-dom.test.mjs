import assert from 'node:assert/strict';
import {environment,settle} from './ux-dom-support.mjs';
import {initFormValidation,showFieldError,clearFieldError,showFormError,clearFormError,validateForm} from '../form-validation.mjs';

const env=await environment({online:true});
const root=document.createElement('section');document.body.append(root);initFormValidation();initFormValidation();
const field=()=>root.querySelector('input,select,textarea');
const form=()=>root.querySelector('form');
const error=control=>{const id=control.getAttribute('aria-errormessage')?.split(' ').find(id=>document.getElementById(id)?.matches('[data-form-field-error]'));return id?document.getElementById(id):null;};
const edit=async(control,value)=>{control.value=value;control.dispatchEvent(new Event('input',{bubbles:true}));await settle();};
let passed=0;
async function check(name,markup,run){root.innerHTML=markup;await settle();await run();passed++;console.log('PASS '+name);}

try{
  await check('native required errors are local, explained, idempotent and focus the first invalid field','<form><label>Prénom<input name="name" required></label><label>Adresse email<input name="email" type="email" required></label><button>Continuer</button></form>',async()=>{
    assert.equal(root.querySelector('[aria-invalid]'),null);assert.equal(form().noValidate,false);
    assert.equal(form().reportValidity(),false);await settle();
    const first=field();assert.equal(error(first).textContent,'Remplis ce champ.');assert.equal(first.getAttribute('aria-invalid'),'true');assert.equal(document.activeElement,first);
    assert.equal(error(root.querySelector('[type=email]')).textContent,'Saisis ton adresse email.');
    assert.equal(first.closest('label').textContent,'Prénom','Error text must not become part of the native label');
    form().reportValidity();await settle();assert.equal(root.querySelectorAll('[data-form-field-error]').length,2);
    await edit(first,'Sarah');assert.equal(error(first),null);assert.equal(first.hasAttribute('aria-invalid'),false);
  });

  await check('invalid email explains the expected format without reflecting entered text','<form><label>Email<input type="email" required></label></form>',async()=>{
    const input=field();input.value='PRIVATE_INVALID_VALUE';input.reportValidity();await settle();
    assert.match(error(input).textContent,/nom@exemple.fr/);assert.doesNotMatch(root.textContent,/PRIVATE_INVALID_VALUE/);
    await edit(input,'sarah@example.test');assert.equal(error(input),null);assert.equal(input.validity.valid,true);
  });

  await check('bounds, decimal precision and date limits have brief French explanations','<form><label>Quantité<input type="number" min="0" max="100" step="0.01"></label><label>Date<input name="day" type="date" min="2026-10-01" max="2026-10-29"></label></form>',async()=>{
    const amount=field(),date=root.querySelector('[type=date]');amount.value='101';amount.reportValidity();await settle();assert.match(error(amount).textContent,/entre 0 et 100/);
    await edit(amount,'1.234');assert.equal(error(amount).textContent,'Utilise 2 décimales maximum.');await edit(amount,'1.23');assert.equal(error(amount),null);
    date.value='2026-11-01';date.reportValidity();await settle();assert.match(error(date).textContent,/29\/10\/2026/);assert.doesNotMatch(error(date).textContent,/2026-10-29/);
    await edit(date,'2026-09-30');assert.match(error(date).textContent,/01\/10\/2026/);await edit(date,'2026-10-15');assert.equal(error(date),null);
  });

  await check('offset decimal steps do not recommend an impossible rounding rule','<form><label>Mesure<input type="number" min="0.005" step="0.01"></label></form>',async()=>{
    const input=field();input.value='0.01';input.reportValidity();await settle();assert.equal(error(input).textContent,'Utilise des pas de 0,01.');
    await edit(input,'0.015');assert.equal(error(input),null);
  });

  await check('native pattern constraints explain the supplied human-readable rule','<form><label>Code<input pattern="[0-9]{4}" title="Saisis les 4 chiffres du code."></label></form>',async()=>{
    const input=field();input.value='abcd';input.reportValidity();await settle();assert.equal(error(input).textContent,'Saisis les 4 chiffres du code.');
    await edit(input,'1234');assert.equal(error(input),null);
  });

  await check('a required checkbox keeps its explanation outside its clickable label','<form><label class="checklabel"><input type="checkbox" required> Je confirme ce choix.</label></form>',async()=>{
    const input=field();input.reportValidity();await settle();assert.equal(error(input).textContent,'Coche cette case pour continuer.');assert.equal(input.closest('label').contains(error(input)),false);
    input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));await settle();assert.equal(error(input),null);
  });

  await check('radio groups have one explanation and clear together whichever option changes','<form><fieldset><legend>Mon choix</legend><label><input name="choice" type="radio" value="a" required>Oui</label><label><input name="choice" type="radio" value="b" required>Non</label></fieldset></form>',async()=>{
    const radios=[...root.querySelectorAll('input')];form().reportValidity();await settle();assert.equal(root.querySelectorAll('[data-form-field-error]').length,1);assert.equal(error(radios[0]),error(radios[1]));assert.equal(error(radios[0]).textContent,'Choisis une option.');
    radios[1].checked=true;radios[1].dispatchEvent(new Event('change',{bubbles:true}));await settle();assert.equal(root.querySelector('[aria-invalid]'),null);
    showFieldError(radios[0],'Choisis une réponse.',{focus:false});radios[0].disabled=true;await settle();radios[0].disabled=false;await settle();assert.equal(radios[0].validity.customError,false);
  });

  await check('existing accessibility references and controller invalid state survive cleanup','<form><p id="hint">Conseil existant</p><p id="external">Explication existante</p><label>Texte<input aria-describedby="hint" aria-errormessage="external" aria-invalid="false"></label></form>',async()=>{
    const input=field();showFieldError(input,'Ce choix est déjà utilisé.',{focus:false});assert.ok(input.getAttribute('aria-describedby').includes('hint'));assert.ok(input.getAttribute('aria-errormessage').includes('external'));
    input.setAttribute('aria-describedby',input.getAttribute('aria-describedby')+' extra-help');clearFieldError(input);
    assert.equal(input.getAttribute('aria-describedby'),'hint extra-help');assert.equal(input.getAttribute('aria-errormessage'),'external');assert.equal(input.getAttribute('aria-invalid'),'false');
    input.setAttribute('aria-invalid','true');input.setCustomValidity('Erreur conservée par le contrôleur.');input.reportValidity();await settle();clearFieldError(input);
    assert.equal(input.getAttribute('aria-invalid'),'true');assert.equal(input.validationMessage,'Erreur conservée par le contrôleur.');assert.equal(input.getAttribute('aria-describedby'),'hint extra-help');
  });

  await check('editing clears owned server errors without erasing a newer controller error','<form><label>Pseudo<input></label></form>',async()=>{
    const input=field();showFieldError(input,'Ce pseudo est déjà pris.',{focus:false});assert.equal(input.validity.customError,true);
    input.addEventListener('input',()=>input.setCustomValidity('Un autre format est nécessaire.'),{once:true});await edit(input,'nouveau');assert.equal(input.validationMessage,'Un autre format est nécessaire.');assert.equal(error(input).textContent,'Un autre format est nécessaire.');
    clearFieldError(input);assert.equal(input.validationMessage,'Un autre format est nécessaire.');input.setCustomValidity('');
    showFieldError(input,'Ce pseudo est déjà pris.',{focus:false});await edit(input,'encore');assert.equal(input.validity.valid,true);assert.equal(error(input),null);
  });

  await check('disabled and readonly controls cannot retain an orphaned owned custom validity','<form><label>Texte<input value="initial"></label></form>',async()=>{
    const input=field();
    for(const property of ['disabled','readOnly']){
      showFieldError(input,'Modifie ce champ.',{focus:false});input[property]=true;await settle();assert.equal(input.validationMessage,'');
      clearFieldError(input);input.value='corrigé';input[property]=false;await settle();assert.equal(input.validity.customError,false);assert.equal(error(input),null);
    }
    showFieldError(input,'Erreur propre.',{focus:false});input.disabled=true;await settle();input.setCustomValidity('Erreur du contrôleur.');input.disabled=false;await settle();assert.equal(input.validationMessage,'Erreur du contrôleur.');input.setCustomValidity('');
  });

  await check('focus is preserved during correction and closed details are revealed on failed validation','<form><details><summary>Complément</summary><label>Nom<input required></label></details></form>',async()=>{
    const input=field();input.reportValidity();await settle();assert.equal(root.querySelector('details').open,true);assert.equal(document.activeElement,input);
    input.value='Sarah';input.setSelectionRange(2,2);input.dispatchEvent(new Event('input',{bubbles:true}));await settle();assert.equal(document.activeElement,input);assert.equal(input.selectionStart,2);assert.equal(error(input),null);
  });

  await check('whitespace-only required text is blocked before controllers without validating hidden wizard steps','<form novalidate><label>Nom<input name="visible" required value="   "></label><section hidden><label>Étape suivante<input required></label></section><label>Mot de passe<input type="password" required value="   "></label></form>',async()=>{
    let submitted=0;form().addEventListener('submit',event=>{event.preventDefault();submitted++;});
    const event=new SubmitEvent('submit',{bubbles:true,cancelable:true});form().dispatchEvent(event);await settle();assert.equal(event.defaultPrevented,true);assert.equal(submitted,0);assert.equal(error(field()).textContent,'Remplis ce champ.');assert.equal(root.querySelector('section[hidden] [aria-invalid]'),null);assert.equal(root.querySelector('[type=password]').getAttribute('aria-invalid'),null);
    await edit(field(),'Sarah');form().dispatchEvent(new SubmitEvent('submit',{bubbles:true,cancelable:true}));await settle();assert.equal(submitted,1,'No full validation of the hidden next wizard step');
  });

  await check('dynamic forms, persistent service summaries, next attempts and reset are handled','<form><label>Texte<input required></label></form>',async()=>{
    const current=form(),input=field();showFormError(current,'Connexion indisponible. Réessaie.',{focus:false});assert.equal(current.querySelector('[data-form-error]').getAttribute('role'),'alert');
    showFormError(current,'Réessaie dans un instant.',{focus:false});assert.equal(current.querySelectorAll('[data-form-error]').length,1);assert.equal(validateForm(current),false);await settle();assert.equal(current.querySelector('[data-form-error]'),null);
    showFormError(current,'Une erreur est survenue.',{focus:false});current.reset();await settle();assert.equal(error(input),null);assert.equal(current.querySelector('[data-form-error]'),null);assert.equal(input.validity.customError,false);
    root.innerHTML='<form><label>Nouveau<input required></label></form>';field().reportValidity();await settle();assert.equal(error(field()).textContent,'Remplis ce champ.');
    showFormError(form(),'Erreur à effacer.',{focus:false});clearFormError(form());assert.equal(form().querySelector('[data-form-error]'),null);
  });

  await check('hidden or disabled fields are not validated or focused by the optional validation helper','<form><section hidden><label>Masqué<input name="hidden" required></label></section><label>Indisponible<input name="disabled" required disabled></label><label>Visible<input name="visible" required value="présent"></label></form>',async()=>{
    assert.equal(validateForm(form()),true);assert.equal(root.querySelector('[data-form-field-error]'),null);
    const input=root.querySelector('[name=visible]');showFieldError(input,'À corriger.',{focus:false});input.closest('label').hidden=true;await settle();assert.equal(input.validity.customError,false);assert.equal(root.querySelector('[data-form-field-error]'),null);
  });

  assert.deepEqual(env.errors,[]);
}finally{env.close();}
console.log(`${passed}/14 shared form validation checks passed`);
