/** Shared calculator for existing consumption forms. No account or storage access.
 * Writes only to the selected quantity input, after explicit confirmation.
 * Existing form validation, consent checks, saves and timeline recomputation remain authoritative.
 */
import {BEVERAGES, FORMATS, blankDrink, drinkPreset, calculateDrink, totalConsumption, inclusiveDays, normalizeConsumption, roundConsumption} from './consumption-core.mjs';
import {showFieldError, clearFieldError} from './form-validation.mjs';

const TARGETS = ['units', 'alcohol_units', 'baseline_units_week', 'current_units_week', 'range_units_week'];
const SELECTOR = TARGETS.map(name => `form input[name="${name}"]`).join(',');
const nf = new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 2});
const fmt = value => value > 0 && value < 0.01 ? '< 0,01' : nf.format(value);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy = value => structuredClone(value);
const option = (value, label, chosen) => `<option value="${escape(value)}"${String(value) === String(chosen) ? ' selected' : ''}>${escape(label)}</option>`;
const field = (name, label, value, extra = '') => `<label>${label}<input data-sc-field="${name}" value="${escape(value)}" type="text" inputmode="decimal" autocomplete="off" ${extra}></label>`;
const contextSignature = form => ['checkin_date','date','started_on','ended_on','consumption_kind','state','range_state','baseline_started_on'].map(name => `${name}:${form.elements.namedItem(name)?.value ?? ''}`).join('|');

export function installConsumptionCalculators(root = document) {
  const widgets = new WeakMap();
  let active = null, dialog = null, scheduled = false;
  const visible = node => node.isConnected && !node.disabled && !node.closest('[hidden]');
  const targetTitle = input => input.name === 'baseline_units_week' ? 'Mes habitudes de départ' : input.name.endsWith('_week') ? 'Ma consommation par semaine' : 'Ma consommation de la journée';
  const errorField = error => {
    const text = String(error?.message || '');
    return /^Choisis le type/.test(text) ? 'type' : /^Choisis un format/.test(text) ? 'format'
      : /^Choisis ml/.test(text) ? 'volumeUnit' : /^(Volume\s*:|Le volume par contenant)/.test(text) ? 'volume'
      : /^Degré/.test(text) ? 'strength' : /^Nombre de contenants/.test(text) ? 'count'
      : /^Part consommée/.test(text) ? 'portionPercent' : /^Nombre de personnes/.test(text) ? 'people'
      : /^Choisis la préparation/.test(text) ? 'preparation' : '';
  };
  function touched(entry = active.entries[active.index]) {
    if (!active.touched.has(entry)) active.touched.set(entry, new Set());
    return active.touched.get(entry);
  }
  function explainField(error, key, focus = false) {
    const control = dialog.querySelector(`[data-sc-field="${key}"]`);
    if (!control) return;
    const text = key === 'portionPercent' ? 'Indique un pourcentage entre 0,01 et 100 %.'
      : key === 'people' ? 'Indique un nombre entier entre 1 et 1 000.'
      : error.message;
    showFieldError(control, text, {focus});
  }
  function updateFieldFeedback() {
    let issue = null;
    try {calculateDrink(active.entries[active.index]);}
    catch (error) {issue = error;}
    const key = issue && errorField(issue), show = key && touched().has(key);
    for (const control of dialog.querySelectorAll('[data-sc-field]')) if (!show || control.dataset.scField !== key) clearFieldError(control);
    if (show) explainField(issue, key);
  }
  function fail(error) {
    if (!dialog?.open) return;
    const box = dialog.querySelector('[data-sc-error]');
    box.textContent = error?.message || 'Vérifie les quantités indiquées.'; box.hidden = false;
    const key = errorField(error);
    if (key) {
      const index = active.entries.findIndex(entry => {try {calculateDrink(entry); return false;} catch (issue) {return issue.message === error.message;}});
      if (index >= 0) {
        if (index !== active.index) {active.index = index; renderEditor();}
        touched().add(key); explainField(error, key, true);
      }
    }
  }
  function hideError() {if (dialog) dialog.querySelector('[data-sc-error]').hidden = true;}
  function close() {if (dialog?.open) dialog.close(); active = null;}
  function currentDrinks() {return active.entries.filter(entry => entry.type !== '');}
  function calculation() {
    const drinks = currentDrinks();
    const total = totalConsumption(drinks);
    const normalized = normalizeConsumption(total, {weekly: active.weekly, basis: active.basis, days: active.days});
    const rounded = roundConsumption(normalized.units);
    const min = active.input.min === '' ? 0 : Number(active.input.min);
    const max = active.input.max === '' ? Infinity : Number(active.input.max);
    if (rounded < min || rounded > max) throw Error(`Le total doit être compris entre ${fmt(min)} et ${Number.isFinite(max) ? fmt(max) : 'la limite du formulaire'} verres standards${active.weekly ? ' par semaine' : ''}.`);
    return {...total, normalized, rounded};
  }
  function drinkSummary(entry) {
    const result = calculateDrink(entry);
    return `${BEVERAGES[entry.type].label} · ${fmt(Number(String(entry.count).replace(',', '.')))} × ${entry.volume} ${entry.volumeUnit} · ${entry.strength} %${Number(entry.portion) !== 1 ? ` · ${fmt(Number(entry.portion) * 100)} % bu` : ''}${Number(entry.people) > 1 ? ` · partagé à ${entry.people}` : ''} → ${fmt(result.units)} verres standards`;
  }
  function renderList() {
    const list = dialog.querySelector('[data-sc-list]');
    list.innerHTML = active.entries.map((entry, i) => {
      if (i === active.index || !entry.type) return '';
      let description;
      try {description = drinkSummary(entry);} catch {description = `${BEVERAGES[entry.type]?.label || 'Boisson'} · à compléter`;}
      return `<li><span>${escape(description)}</span><div><button type="button" data-sc-edit="${i}" aria-label="Modifier la boisson ${i + 1}">Modifier</button><button type="button" data-sc-remove="${i}" aria-label="Retirer la boisson ${i + 1}">Retirer</button></div></li>`;
    }).join('');
    list.hidden = !list.children.length;
  }
  function renderEditor() {
    const entry = active.entries[active.index];
    const extra = Number(entry.portion) !== 1 || Number(entry.people) !== 1;
    dialog.querySelector('[data-sc-editor]').innerHTML = `
      <div class="sc-editor-heading"><h3>Boisson ${active.index + 1}</h3>${active.entries.length > 1 ? `<button type="button" class="sc-link" data-sc-remove="${active.index}">Retirer</button>` : ''}</div>
      <label>Type d’alcool<select data-sc-field="type">${option('', 'Choisir la boisson', entry.type)}${Object.entries(BEVERAGES).map(([key, value]) => option(key, value.label, entry.type)).join('')}</select></label>
      <div data-sc-fields${entry.type ? '' : ' hidden'}>
        <div class="sc-grid"><label>Format<select data-sc-field="format">${Object.entries(FORMATS).map(([key, value]) => option(key, value, entry.format)).join('')}</select></label>${field('count', 'Nombre de contenants', entry.count, 'aria-describedby="sc-count-help"')}</div>
        <p id="sc-count-help" class="sc-help">Ex. 2 canettes, 1 bouteille ou 0,5 bouteille. Compte seulement les contenants concernés.</p>
        <div class="sc-grid"><label>${entry.preparation === 'plain' ? 'Volume par contenant' : 'Volume d’alcool par dose / verre'}<span class="sc-volume"><input data-sc-field="volume" value="${escape(entry.volume)}" type="text" inputmode="decimal" autocomplete="off" aria-label="Volume par contenant"><select data-sc-field="volumeUnit" aria-label="Unité de volume">${[['ml','ml'],['cl','cl'],['l','L']].map(([key, text]) => option(key, text, entry.volumeUnit)).join('')}</select></span></label>${field('strength', 'Degré indiqué (%)', entry.strength)}</div>
        <p class="sc-help">Les valeurs proposées sont modifiables : vérifie l’étiquette et le volume réellement servi.${entry.type === 'cocktail' ? ' Degré final inconnu ? Choisis chaque alcool ajouté plutôt qu’un degré au hasard.' : ''}</p>
        <label>Comment l’as-tu bu ?<select data-sc-field="preparation">${[['plain','Tel quel'],['diluted','Avec eau, soda ou jus'],['mixed','Dans un mélange de plusieurs alcools']].map(([key, text]) => option(key, text, entry.preparation)).join('')}</select></label>
        <p class="sc-help" data-sc-mix-help${entry.preparation === 'plain' ? ' hidden' : ''}>${entry.preparation === 'mixed' ? 'Ajoute chaque alcool séparément avec « Ajouter une autre boisson ». ' : ''}Indique uniquement le volume de l’alcool versé, sans l’eau, le jus, le soda ni les glaçons. La dilution ne diminue pas la quantité d’alcool pur.</p>
        <details class="sc-extra"${extra ? ' open' : ''}><summary>Une partie seulement ou un partage ?</summary><div class="sc-grid">${field('portionPercent', 'Part bue au total (%)', roundConsumption(Number(entry.portion) * 100))}${field('people', 'Partagée à parts égales entre', entry.people, 'inputmode="numeric"')}</div><div class="sc-portions"><button type="button" data-sc-portion="100">Tout</button><button type="button" data-sc-portion="50">Moitié</button><button type="button" data-sc-portion="25">Quart</button></div><p class="sc-help">Le pourcentage s’applique au volume indiqué, puis il est divisé entre les personnes. Exemple : 1 bouteille entière, partagée à 2 = une demi-bouteille pour toi. Parts inégales : indique seulement ta part et laisse 1 personne. N’applique pas deux fois la même réduction.</p></details>
      </div>`;
    dialog.querySelector('[data-sc-editor]').dataset.index = String(active.index);
    renderList(); updateTotal();
  }
  function updateTotal() {
    if (!active) return;
    const number = dialog.querySelector('[data-sc-total]'), detail = dialog.querySelector('[data-sc-total-detail]');
    const apply = dialog.querySelector('[data-sc-apply]'), add = dialog.querySelector('[data-sc-add]');
    try {
      const result = calculation();
      number.textContent = `${fmt(result.normalized.units)} verre${result.normalized.units === 1 ? '' : 's'} standard${result.normalized.units === 1 ? '' : 's'}${active.weekly ? ' / semaine' : ''}`;
      detail.textContent = `${fmt(result.normalized.grams)} g d’alcool pur${active.weekly ? ' / semaine' : ''}${active.weekly && active.basis !== 'week' ? ` · ${fmt(result.units)} verres pour ${active.basis === 'day' ? 'un jour moyen (× 7)' : `${active.days} jours (× 7 ÷ ${active.days})`}` : ''}`;
      apply.disabled = false;
    } catch (error) {
      number.textContent = 'Total à compléter';
      detail.textContent = currentDrinks().length ? error.message : 'Choisis une boisson pour commencer.';
      apply.disabled = true;
    }
    try {calculateDrink(active.entries[active.index]); add.disabled = active.entries.length >= 30;} catch {add.disabled = true;}
    updateFieldFeedback();
  }
  function ensureDialog() {
    if (dialog) return;
    dialog = document.createElement('dialog'); dialog.id = 'consumptionCalculator'; dialog.className = 'sc-dialog';
    dialog.setAttribute('aria-labelledby', 'sc-title');
    document.body.append(dialog);
    dialog.addEventListener('close', () => {active = null; dialog.replaceChildren();});
    dialog.addEventListener('cancel', event => {event.preventDefault(); close();});
    // Do not let global app shortcuts close the parent form while this dialog is open.
    window.addEventListener('keydown', event => {
      if (!dialog.open || event.key !== 'Escape') return;
      event.preventDefault(); event.stopImmediatePropagation(); close();
    }, true);
    dialog.addEventListener('submit', event => {event.preventDefault(); event.stopImmediatePropagation(); apply();});
    dialog.addEventListener('input', event => {
      const control = event.target.closest('[data-sc-field]'); if (!control || !active) return;
      const key = control.dataset.scField;
      if (['type', 'format', 'volumeUnit', 'preparation'].includes(key)) return;
      const entry = active.entries[active.index];
      entry[key === 'portionPercent' ? 'portion' : key] = key === 'portionPercent' ? String(Number(control.value.trim().replace(',', '.')) / 100) : control.value;
      touched().add(key);
      hideError(); updateTotal();
    });
    dialog.addEventListener('focusout', event => {
      const control = event.target.closest?.('[data-sc-field]');
      if (!active || !control?.isConnected || !dialog.contains(control)) return;
      touched().add(control.dataset.scField); updateFieldFeedback();
    });
    dialog.addEventListener('change', event => {
      if (!active) return;
      if (event.target.matches('[data-sc-basis]')) {active.basis = event.target.value; hideError(); updateTotal(); return;}
      const control = event.target.closest('[data-sc-field]'); if (!control) return;
      const key = control.dataset.scField, entry = active.entries[active.index];
      if (key === 'type') {
        active.entries[active.index] = control.value ? drinkPreset(control.value) : blankDrink(); touched().add(key); renderEditor();
      } else if (key === 'format') {
        const preset = drinkPreset(entry.type, control.value);
        Object.assign(entry, {format: preset.format, volume: preset.volume, volumeUnit: 'cl'}); touched().add(key); renderEditor();
      } else if (key === 'volumeUnit') {
        const factor = {ml: 1, cl: 10, l: 1000}, n = Number(String(entry.volume).replace(',', '.'));
        if (entry.volume.trim() && Number.isFinite(n)) entry.volume = String(Number((n * factor[entry.volumeUnit] / factor[control.value]).toFixed(8)));
        entry.volumeUnit = control.value; touched().add(key); renderEditor();
      } else if (key === 'preparation') {entry.preparation = control.value; touched().add(key); renderEditor();}
      else {touched().add(key); updateTotal();}
      hideError();
    });
    dialog.addEventListener('click', event => {
      const button = event.target.closest('button'); if (!button || !active) return;
      if (button.hasAttribute('data-sc-close')) {close(); return;}
      if (button.hasAttribute('data-sc-add')) {
        try {calculateDrink(active.entries[active.index]); if (active.entries.length >= 30) return; active.entries.push(blankDrink()); active.index = active.entries.length - 1; renderEditor(); dialog.querySelector('[data-sc-field="type"]').focus();} catch (error) {fail(error);}
      } else if (button.hasAttribute('data-sc-edit')) {active.index = Number(button.dataset.scEdit); renderEditor(); dialog.querySelector('[data-sc-field="type"]').focus();}
      else if (button.hasAttribute('data-sc-remove')) {
        const index = Number(button.dataset.scRemove);
        active.entries.splice(index, 1);
        if (!active.entries.length) active.entries.push(blankDrink());
        active.index = Math.max(0, Math.min(index < active.index ? active.index - 1 : active.index, active.entries.length - 1));
        renderEditor();
      } else if (button.hasAttribute('data-sc-portion')) {
        const input = dialog.querySelector('[data-sc-field="portionPercent"]');
        input.value = button.dataset.scPortion; input.dispatchEvent(new Event('input', {bubbles: true}));
      }
    });
  }
  function open(input) {
    if (!visible(input) || !input.form || dialog?.open) return;
    ensureDialog();
    const widget = widgets.get(input), saved = widget?.saved;
    const reusable = saved && saved.value === input.value && saved.signature === contextSignature(input.form);
    let days = null;
    if (input.name === 'range_units_week') {
      try {days = inclusiveDays(input.form.elements.started_on.value, input.form.elements.ended_on.value);} catch { /* Only offer whole-period conversion when dates are valid. */ }
    }
    active = {input, form: input.form, originalValue: input.value, signature: contextSignature(input.form), weekly: input.name.endsWith('_week'), days, basis: reusable ? saved.basis : 'week', entries: reusable ? copy(saved.entries) : [blankDrink()], index: 0, touched: new WeakMap()};
    dialog.innerHTML = `<form class="sc-form" novalidate><header class="sc-header"><div><p class="sc-eyebrow">${escape(targetTitle(input))}</p><h2 id="sc-title">Calculer avec mes boissons</h2></div><button type="button" data-sc-close aria-label="Fermer le calculateur">×</button></header><div class="sc-body">
      ${active.weekly ? `<label>Les quantités ci-dessous correspondent à<select data-sc-basis>${option('week','Une semaine habituelle',active.basis)}${option('day','Un jour moyen, tous les jours compris',active.basis)}${days ? option('period',`Toute la période : ${days} jours`,active.basis) : ''}</select></label>` : '<p class="sc-intro">Ajoute ce que tu as réellement bu pendant cette journée.</p>'}
      ${input.value !== '' && !reusable ? `<p class="sc-existing">Le formulaire contient déjà ${escape(input.value)} verres standards${active.weekly ? ' / semaine' : ''}. Ce calcul remplacera ce total, il ne s’y ajoutera pas. Le détail antérieur n’est pas reconstitué.</p>` : ''}
      <ul class="sc-list" data-sc-list hidden></ul><section data-sc-editor></section>
      <button type="button" class="sc-add" data-sc-add>+ Ajouter une autre boisson</button>
      <p class="sc-help">1 verre standard = 10 g d’alcool pur. Estimation selon les volumes et degrés saisis, avec 0,8 g/ml. <a href="https://www.alcool-info-service.fr/sinformer-et-evaluer-sa-consommation/alcool-et-sante/les-reperes-de-consommation-quest-ce-que-cest" target="_blank" rel="noopener noreferrer">Comprendre le repère</a>.</p>
      <p class="sc-help">Ce n’est pas un calcul d’alcoolémie ni une autorisation de conduire. Seul le total sera enregistré dans ton suivi, pas le détail des boissons.</p>
      <p class="sc-error" data-sc-error role="alert" hidden></p>
      </div><footer class="sc-footer"><div class="sc-result" aria-live="polite" aria-atomic="true"><strong data-sc-total></strong><span data-sc-total-detail></span></div><button type="submit" class="sc-apply" data-sc-apply>Utiliser ce total</button><p>Valide ensuite ton formulaire pour sauvegarder.</p></footer></form>`;
    renderEditor(); dialog.showModal();
  }
  function apply() {
    try {
      if (!active) return;
      const {input, form, originalValue, signature} = active;
      if (!visible(input) || !form.isConnected || input.form !== form || input.value !== originalValue || contextSignature(form) !== signature) throw Error('Le formulaire a changé. Ferme le calculateur et rouvre-le avant de reporter ce total.');
      const result = calculation(), widget = widgets.get(input);
      const saved = {entries: copy(active.entries), basis: active.basis, value: String(result.rounded), signature};
      input.value = saved.value;
      widget.saved = saved;
      input.dispatchEvent(new Event('input', {bubbles: true}));
      input.dispatchEvent(new Event('change', {bubbles: true}));
      widget.status.textContent = `Calculé : ${fmt(result.normalized.grams)} g d’alcool pur${active.weekly ? ' / semaine' : ''}. Valide le formulaire pour sauvegarder.`;
      widget.status.hidden = false;
      close(); input.focus({preventScroll: true});
    } catch (error) {fail(error);}
  }
  function attach(input) {
    if (widgets.has(input) || input.closest('.sc-dialog') || !input.form) return;
    const label = input.closest('label'); if (!label) return;
    const wrapper = document.createElement('div'); wrapper.className = 'sc-quantity-field';
    label.before(wrapper); wrapper.append(label);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'sc-launch';
    button.textContent = 'Calculer avec mes boissons'; button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-label', `Calculer avec mes boissons — ${targetTitle(input)}`);
    button.disabled = input.disabled;
    const status = document.createElement('p'); status.className = 'sc-applied'; status.hidden = true; status.setAttribute('role', 'status');
    wrapper.append(button, status); widgets.set(input, {button, status, saved: null});
    button.addEventListener('click', () => open(input));
    const changed = () => {const widget = widgets.get(input); if (widget.saved?.value !== input.value) {widget.saved = null; widget.status.hidden = true;}};
    input.addEventListener('input', changed); input.addEventListener('change', changed);
  }
  function scan() {
    scheduled = false;
    for (const input of root.querySelectorAll(SELECTOR)) {attach(input); const widget = widgets.get(input); if (widget && widget.button.disabled !== input.disabled) widget.button.disabled = input.disabled;}
    if (active && (!active.input.isConnected || !visible(active.input))) close();
  }
  const observer = new MutationObserver(records => {
    if (scheduled || records.every(record => record.target.closest?.('.sc-dialog'))) return;
    scheduled = true; queueMicrotask(scan);
  });
  observer.observe(root === document ? document.body : root, {subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'hidden']});
  scan();
  return {disconnect() {observer.disconnect(); close();}, scan};
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => installConsumptionCalculators(), {once: true});
  else installConsumptionCalculators();
}
