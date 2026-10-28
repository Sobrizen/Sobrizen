/** Consumption estimates, not blood alcohol or medical advice.
 * Public-health convention: ethanol ~= 0.8 g/ml; France: 10 g/standard drink.
 * Sources: https://www.ofdt.fr/glossaire/alcool-pur
 * https://www.alcool-info-service.fr/sinformer-et-evaluer-sa-consommation/alcool-et-sante/les-reperes-de-consommation-quest-ce-que-cest
 * Preserve precision through the sum; round only when filling existing 2-decimal fields.
 */
export const ETHANOL_G_PER_ML = 0.8;
export const STANDARD_DRINK_G = 10;
export const BEVERAGES = Object.freeze({
  beer: {label: 'Bière', strength: '5', format: 'can', volume: '33'},
  wine: {label: 'Vin', strength: '12', format: 'glass', volume: '12.5'},
  sparkling: {label: 'Champagne / vin pétillant', strength: '12', format: 'glass', volume: '10'},
  cider: {label: 'Cidre', strength: '5', format: 'glass', volume: '25'},
  whisky: {label: 'Whisky', strength: '40', format: 'shot', volume: '3'},
  vodka: {label: 'Vodka', strength: '40', format: 'shot', volume: '3'},
  rum: {label: 'Rhum', strength: '40', format: 'shot', volume: '3'},
  gin: {label: 'Gin', strength: '40', format: 'shot', volume: '3'},
  tequila: {label: 'Tequila', strength: '40', format: 'shot', volume: '3'},
  pastis: {label: 'Pastis', strength: '45', format: 'shot', volume: '2.5'},
  aperitif: {label: 'Apéritif / liqueur', strength: '', format: 'glass', volume: '6'},
  cocktail: {label: 'Cocktail au degré connu', strength: '', format: 'glass', volume: ''},
  other: {label: 'Autre boisson', strength: '', format: 'custom', volume: ''},
});
export const FORMATS = Object.freeze({glass: 'Verre', can: 'Canette', bottle: 'Bouteille', pint: 'Pinte', shot: 'Dose / shot', custom: 'Volume libre'});
export function blankDrink() {return {type: '', format: 'glass', volume: '', volumeUnit: 'cl', strength: '', count: '1', portion: '1', people: '1', preparation: 'plain'};}
export function drinkPreset(type, format = null) {
  if (!Object.hasOwn(BEVERAGES, type)) throw Error('Choisis le type de boisson.');
  const preset = BEVERAGES[type], selected = format || preset.format;
  if (!Object.hasOwn(FORMATS, selected)) throw Error('Choisis un format valide.');
  const spirits = ['whisky', 'vodka', 'rum', 'gin', 'tequila', 'pastis'].includes(type);
  const volume = selected === preset.format ? preset.volume : selected === 'bottle' ? (spirits ? '70' : type === 'beer' ? '33' : '75')
    : selected === 'can' ? '33' : selected === 'pint' ? '50' : selected === 'shot' ? (type === 'pastis' ? '2.5' : '3')
      : selected === 'glass' ? (['beer', 'cider'].includes(type) ? '25' : '') : '';
  return {...blankDrink(), type, format: selected, volume, strength: preset.strength};
}
function decimal(value, label, min, max, integer = false) {
  if (!['string', 'number'].includes(typeof value)) throw Error(`${label} : indique un nombre.`);
  const text = String(value).trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/u.test(text)) throw Error(`${label} : indique un nombre valide.`);
  const n = Number(text);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    throw Error(`${label} : ${integer ? 'un entier' : 'une valeur'} entre ${min} et ${max}.`);
  }
  return n;
}
export function calculateDrink(drink) {
  if (!drink || !Object.hasOwn(BEVERAGES, drink.type)) throw Error('Choisis le type de boisson.');
  if (!Object.hasOwn(FORMATS, drink.format)) throw Error('Choisis un format valide.');
  const multipliers = {ml: 1, cl: 10, l: 1000};
  if (!Object.hasOwn(multipliers, drink.volumeUnit)) throw Error('Choisis ml, cl ou litre.');
  const capacityMl = decimal(drink.volume, 'Volume', 0.01, 100000) * multipliers[drink.volumeUnit];
  if (capacityMl > 100000) throw Error('Le volume par contenant ne peut pas dépasser 100 litres.');
  const strength = decimal(drink.strength, 'Degré (%)', 0, 100);
  const count = decimal(drink.count, 'Nombre de contenants', 0.01, 10000);
  const portion = decimal(drink.portion, 'Part consommée', 0.0001, 1);
  const people = decimal(drink.people, 'Nombre de personnes', 1, 1000, true);
  if (!['plain', 'diluted', 'mixed'].includes(drink.preparation)) throw Error('Choisis la préparation de la boisson.');
  const consumedMl = capacityMl * count * portion / people;
  const grams = consumedMl * strength / 100 * ETHANOL_G_PER_ML;
  if (!Number.isFinite(grams)) throw Error('La quantité dépasse la capacité du calculateur.');
  return {consumedMl, grams, units: grams / STANDARD_DRINK_G};
}
export function totalConsumption(drinks) {
  if (!Array.isArray(drinks) || drinks.length === 0 || drinks.length > 30) throw Error('Ajoute entre 1 et 30 boissons.');
  return drinks.map(calculateDrink).reduce((sum, item) => ({consumedMl: sum.consumedMl + item.consumedMl, grams: sum.grams + item.grams, units: sum.units + item.units}), {consumedMl: 0, grams: 0, units: 0});
}
export function inclusiveDays(start, end) {
  const parse = text => {
    if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) throw Error('Vérifie les dates de la période.');
    const date = new Date(`${text}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw Error('Vérifie les dates de la période.');
    return date.getTime();
  };
  const days = (parse(end) - parse(start)) / 86400000 + 1;
  if (days < 1) throw Error('La fin de la période doit suivre son début.');
  return days;
}
export function normalizeConsumption(total, {weekly = false, basis = 'week', days = null} = {}) {
  const factor = !weekly || basis === 'week' ? 1 : basis === 'day' ? 7 : basis === 'period' ? 7 / decimal(days, 'Durée de la période', 1, 100000, true) : NaN;
  if (!Number.isFinite(factor)) throw Error('Choisis la durée du calcul.');
  return {grams: total.grams * factor, units: total.units * factor, factor};
}
export const roundConsumption = value => Math.round((value + Number.EPSILON) * 100) / 100;
