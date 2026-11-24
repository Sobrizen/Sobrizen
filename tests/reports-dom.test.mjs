import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import {createSimpleSummary} from '../timeline-summary.mjs';
import {createTimelineChart} from '../timeline-chart.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function journey(start = '2026-09-01') {
  return {schema_version: 3, timezone: 'Pacific/Honolulu',
    baseline: {started_on: start, units_week: 14, cost_week: 70},
    events: [{id: id(1), started_on: start, state: 'drinking', units_week: 14, cost_week: 70, note: ''}],
    ranges: [], occasions: [],
    goal: {mode: 'observe', weekly_limit: null, daily_limit: null, target_on: null, why: '', triggers: [], support_first: false, planned_action: ''}};
}

function environment({today = '2026-09-14', document = journey(), checks = [], kind = 'summary'} = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main id="content"></main></body></html>', {pretendToBeVisual: true});
  const previous = {document: globalThis.document, window: globalThis.window};
  globalThis.document = dom.window.document; globalThis.window = dom.window;
  const data = {document, checks, today}, downloads = [];
  let feature, renders = 0;
  const api = {data: () => data, render: () => {renders++; dom.window.document.getElementById('content').innerHTML = feature.view();}, download: (...args) => downloads.push(args)};
  feature = kind === 'chart' ? createTimelineChart(api) : createSimpleSummary(api);
  if (kind === 'summary') dom.window.document.addEventListener('click', event => feature.handleClick(event.target));
  api.render();
  const $ = selector => dom.window.document.querySelector(selector);
  return {dom, data, feature, api, downloads, $, get renders() {return renders;},
    click(action, period) {
      const button = $(`[data-tl-${kind === 'chart' ? 'chart' : 'summary'}-action="${action}"]${period ? `[data-tl-summary-period="${period}"]` : ''}`);
      assert.ok(button, `Missing ${action}/${period || ''}`); button.click(); return button;
    },
    close() {dom.window.close(); for (const [key, value] of Object.entries(previous)) {if (value === undefined) delete globalThis[key]; else globalThis[key] = value;}}
  };
}

test('report history navigates adjacent complete seven-day windows and returns to today without writes', () => {
  const h = environment(), original = JSON.stringify(h.data);
  try {
    assert.match(h.$('.tl-simple-dates').textContent, /8 sept.*14 sept/s);
    assert.equal(h.$('[data-tl-summary-action="next"]').disabled, true);
    h.click('previous');
    assert.match(h.$('.tl-simple-dates').textContent, /1 sept.*7 sept/s);
    assert.equal(h.$('[data-tl-summary-action="previous"]').disabled, true);
    assert.match(h.$('.tl-simple-consumption strong').textContent, /^14$/);
    assert.match(h.$('.tl-simple-consumption .tl-simple-coverage').textContent, /7\/7 jours clos connus/);
    assert.equal(h.$('.tl-simple-dates span'), null);
    h.click('next');
    assert.equal(h.$('[data-tl-summary-action="next"]').disabled, true);
    assert.equal(h.dom.window.document.activeElement.dataset.tlSummaryPeriod, 'week');
    assert.match(h.$('.tl-simple-dates span').textContent, /en cours/);
    h.click('previous'); h.click('current');
    assert.match(h.$('.tl-simple-dates').textContent, /8 sept.*14 sept/s);
    assert.equal(JSON.stringify(h.data), original);
  } finally {h.close();}
});

test('changing report scale resets history and twelve-month windows partition leap years without overlap', () => {
  const h = environment({today: '2024-02-29', document: journey('2021-01-01')});
  try {
    h.click('previous'); h.click('period', 'year');
    assert.match(h.$('.tl-simple-dates').textContent, /1 mars 2023.*29 févr.*2024/s);
    h.click('previous');
    assert.match(h.$('.tl-simple-dates').textContent, /1 mars 2022.*28 févr.*2023/s);
    h.click('period', 'month');
    assert.match(h.$('.tl-simple-dates').textContent, /31 janv.*29 févr/s);
    assert.equal(h.$('[data-tl-summary-action="next"]').disabled, true);
  } finally {h.close();}
});

test('reported days follow the supplied journey date across device timezone and midnight changes', () => {
  const h = environment({today: '2026-09-13'});
  try {
    assert.match(h.$('.tl-simple-dates').textContent, /7 sept.*13 sept/s);
    h.data.today = '2026-09-14'; h.api.render();
    assert.match(h.$('.tl-simple-dates').textContent, /8 sept.*14 sept/s);
    assert.match(h.$('.tl-simple-consumption .tl-simple-coverage').textContent, /6\/6 jours clos connus/);
  } finally {h.close();}
});

test('partial quantity, known costs and actual today keep independent coverage without invented zeros', () => {
  const h = environment({checks: [
    {checkin_date: '2026-09-09', sober_today: false, alcohol_units: null, alcohol_cost_eur: null},
    {checkin_date: '2026-09-14', sober_today: false, alcohol_units: null, alcohol_cost_eur: 0},
  ]});
  try {
    assert.equal(h.$('.tl-simple-consumption strong').textContent, '10');
    assert.match(h.$('.tl-simple-consumption .tl-simple-coverage').textContent, /5\/6 jours clos connus/);
    assert.doesNotMatch(h.$('.tl-simple-consumption .tl-simple-coverage').textContent, /aujourd’hui/);
    assert.match(h.$('.tl-simple-consumption .tl-simple-source').textContent, /Partiel/);
    assert.match(h.$('.tl-simple-spending .tl-simple-coverage').textContent, /6\/6 jours clos connus.*saisie d’aujourd’hui/);
    assert.match(h.$('.tl-simple-spending .tl-simple-source').textContent, /Noté \+ estimé/);
    assert.match(h.$('.tl-quantity-coverage').textContent,/0 jour saisi.*5 jours estimés.*2 jours sans quantité/s);
    assert.equal(h.$('.tl-rhythm-comparison'),null);
  } finally {h.close();}
});

test('unknown first-day values stay unavailable while explicit zero today remains a real zero', () => {
  const h = environment({document: journey('2026-09-14')});
  try {
    assert.equal(h.$('.tl-simple-consumption strong').textContent, '—');
    assert.equal(h.$('.tl-simple-spending strong').textContent, '—');
    assert.equal(h.$('.tl-simple-savings strong').textContent, '—');
    assert.match(h.$('.tl-simple-consumption .tl-simple-coverage').textContent, /0\/6/);
    h.data.checks = [{checkin_date: h.data.today, sober_today: true, alcohol_cost_eur: 0}]; h.api.render();
    assert.equal(h.$('.tl-simple-consumption strong').textContent, '0');
    assert.match(h.$('.tl-quantity-coverage').textContent,/1 jour saisi.*6 jours sans quantité/s);
    assert.match(h.$('.tl-simple-spending strong').textContent, /^0/);
    assert.match(h.$('.tl-simple-savings strong').textContent, /^0/);
  } finally {h.close();}
});

test('summary instance ownership and reset prevent one account or component retaining another selection', () => {
  const h = environment();
  try {
    const other = createSimpleSummary(h.api);
    assert.equal(other.handleClick(h.$('[data-tl-summary-action="previous"]')), false);
    h.click('previous'); h.feature.reset(); h.api.render();
    assert.equal(h.$('[data-tl-summary-action="next"]').disabled, true);
    h.data.document = journey(h.data.today); h.api.render();
    assert.equal(h.$('[data-tl-summary-action="previous"]').disabled, true);
    assert.equal(h.$('.tl-simple-savings strong').textContent, '—');
  } finally {h.close();}
});

test('an actual occasion before the baseline remains reachable without inventing historical savings', () => {
  const document = journey('2026-09-14');
  document.occasions = [{id: id(2), date: '2026-09-01', units: 3, cost: 12}];
  const h = environment({document});
  try {
    assert.equal(h.$('[data-tl-summary-action="previous"]').disabled, false);
    h.click('previous');
    assert.equal(h.$('.tl-simple-consumption strong').textContent, '3');
    assert.match(h.$('.tl-simple-spending strong').textContent, /^12/);
    assert.match(h.$('.tl-simple-spending .tl-simple-coverage').textContent, /1\/7 jours clos connus/);
    assert.equal(h.$('.tl-simple-savings strong').textContent, '—');
  } finally {h.close();}
});

test('Premium chart does not display fabricated first-day savings and does show explicit known zero', () => {
  const h = environment({document: journey('2026-09-14'), kind: 'chart'});
  try {
    assert.equal(h.$('.tl-chart-savings'), null);
    assert.match(h.$('.tl-chart > p.tl-chart-caption').textContent, /donnée manquante/);
    h.data.checks = [{checkin_date: h.data.today, sober_today: true, alcohol_cost_eur: 0}]; h.api.render();
    assert.match(h.$('.tl-chart-savings strong').textContent, /^0/);
    assert.match(h.$('.tl-chart-stat small').textContent, /aujourd’hui/);
    assert.match(h.$('.tl-chart-period-heading').textContent, /aujourd’hui inclus, en cours/);
  } finally {h.close();}
});

test('historical chart export covers only its visible dates, preserves missing values and never mutates records', () => {
  const h = environment({kind: 'chart', document: journey('2026-09-03')}), before = JSON.stringify(h.data);
  try {
    h.click('scale'); // first scale is the seven-day view
    h.click('previous'); h.click('export');
    assert.equal(h.downloads.length, 1);
    assert.match(h.downloads[0][0], /2026-09-01-2026-09-07\.csv$/);
    const lines = h.downloads[0][1].split('\r\n');
    assert.equal(lines.length, 8); assert.match(lines[1], /^2026-09-01;/); assert.match(lines.at(-1), /^2026-09-07;/);
    assert.equal(lines[1], '2026-09-01;;Inconnu;;Inconnu;Statut inconnu;Inconnu');
    assert.equal(JSON.stringify(h.data), before);
  } finally {h.close();}
});

test('selecting chart points preserves SVG, surrounding forms, history filters and keyboard focus', () => {
  const h=environment({kind:'chart'});
  try{
    const input=h.dom.window.document.createElement('input');input.value='Brouillon conservé';
    h.$('.tl-chart').before(input);
    const chart=h.$('.tl-chart'),svg=h.$('.tl-chart-canvas svg');
    const points=[...chart.querySelectorAll('.tl-chart-point')];
    assert.ok(points.length>=2);
    const point=points[0];
    point.dispatchEvent(new h.dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));
    assert.equal(h.$('.tl-chart'),chart);
    assert.equal(h.$('.tl-chart-canvas svg'),svg);
    assert.equal(input.isConnected,true);assert.equal(input.value,'Brouillon conservé');
    assert.equal(h.renders,1);
    assert.equal(chart.querySelectorAll('.tl-chart-point[aria-pressed="true"]').length,1);
    assert.equal(point.getAttribute('tabindex'),'0');
    assert.equal(h.dom.window.document.activeElement,point);
    point.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
    assert.equal(points[1].getAttribute('aria-pressed'),'true');
    assert.equal(h.dom.window.document.activeElement,points[1]);
    assert.equal(h.$('.tl-chart-canvas svg'),svg);
  }finally{h.close();}
});

test('changing chart period stays local and a subsequent data refresh uses corrected quantities', () => {
  const h=environment({kind:'chart'});
  try{
    const input=h.dom.window.document.createElement('input');input.value='Recherche conservée';
    h.$('.tl-chart').before(input);
    h.$('[data-tl-chart-action="scale"][data-scale="week"]').click();
    assert.equal(input.isConnected,true);assert.equal(input.value,'Recherche conservée');
    assert.equal(h.renders,1);
    assert.equal(h.$('[data-scale="week"]').getAttribute('aria-pressed'),'true');
    assert.equal(h.dom.window.document.activeElement,h.$('[data-scale="week"]'));
    h.data.document.occasions.push({id:id(99),date:'2026-09-13',units:9,cost:40});
    h.api.render();
    const recorded=h.$('.tl-chart-point[data-start="2026-09-13"]');
    recorded.dispatchEvent(new h.dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));
    assert.match(h.$('.tl-chart-readout').textContent,/9 verres standard/);
    assert.equal(recorded.getAttribute('aria-pressed'),'true');
  }finally{h.close();}
});

test('report navigation styles parse with visible focus targets and narrow-screen layout', async () => {
  const h = environment();
  try {
    const style = h.dom.window.document.createElement('style');
    style.textContent = await readFile(new URL('../timeline-summary.css', import.meta.url), 'utf8');
    h.dom.window.document.head.append(style);
    assert.ok(style.sheet.cssRules.length > 40);
    assert.match(style.textContent, /\.tl-simple-navigation button:focus-visible/);
    assert.match(style.textContent, /grid-template-columns:44px minmax\(0,1fr\) 44px/);
  } finally {h.close();}
});
