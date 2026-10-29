/**
 * Exercise the actual section navigation through the application controllers.
 * Run: node tests/section-navigation-dom.test.mjs
 * Requires the same test-only jsdom dependency as ux-dom.test.mjs; no network.
 */
import assert from 'node:assert/strict';
import {
  environment, boot, mockService, UID, $, $$, txt, click, value, key,
  closeModal, route, settle,
} from './ux-dom-support.mjs';

const env = await environment({online: true});
const mock = await mockService({premium: true});
const results = [];
const active = () => $('.sz-section-tab[aria-selected="true"]')?.dataset.section;
const panel = key => $(`.sz-section-panel[data-section="${key}"]`);
const tab = key => $(`.sz-section-tab[data-section="${key}"]`);
const writes = () => mock.calls.filter(call => call.rpc || ['insert', 'upsert', 'update', 'delete'].includes(call.op)).length;

async function choose(keyName) {
  const target = tab(keyName);
  assert.ok(target, `Missing section ${keyName}`);
  assert.equal(target.closest('[hidden]'), null, `Section ${keyName} must be reachable`);
  await click(target);
  assert.equal(active(), keyName);
  assert.equal(panel(keyName)?.hidden, false);
}

function exclusive(expected) {
  assert.deepEqual($$('.sz-section-tab').map(node => node.dataset.section), expected);
  assert.equal($$('.sz-section-tab[aria-selected="true"]').length, 1);
  assert.equal($$('.sz-section-panel').filter(node => !node.hidden).length, 1);
  for (const item of $$('.sz-section-tab')) {
    const target = document.getElementById(item.getAttribute('aria-controls'));
    assert.ok(target, `Missing panel for ${item.id}`);
    assert.equal(target.getAttribute('aria-labelledby'), item.id);
    assert.equal(target.getAttribute('role'), 'tabpanel');
    assert.equal(item.tabIndex, item.getAttribute('aria-selected') === 'true' ? 0 : -1);
  }
}

async function check(name, run) {
  try { await run(); results.push(true); console.log(`PASS [sections] ${name}`); }
  catch (error) {
    results.push(false); console.error(`FAIL [sections] ${name}\n${error.stack}`);
    env.answer(true); await closeModal().catch(() => {});
  }
}

try {
  await boot({mock}); await closeModal();

  await check('all four long sections preserve their existing functions inside exclusive named panels', async () => {
    const cases = [
      ['health', ['overview', 'benefits', 'feelings', 'support'], ['.hz-hero', '.hz-wins', '.hz-milestones', '.hz-metrics', '.hz-history', '.hz-addiction', '.hz-safety', '.hz-evidence-footer']],
      ['progress', ['overview', 'calendar', 'history'], ['[data-tl-chart-instance]', '#dy-calendar', '.tl-history']],
      ['journey', ['steps', 'history'], ['#programForm', '.tl-history', '.tl-achievements']],
      ['profile', ['profile', 'motivation', 'settings'], ['#profileForm', '#settingsForm', '[data-action="health-consent-withdraw"]', '[data-action="export"]', '.ux-comfort']],
    ];
    const before = writes();
    for (const [pageName, keys, selectors] of cases) {
      await route(pageName); exclusive(keys);
      for (const selector of selectors) {
        const target = $(selector, $('#content'));
        assert.ok(target, `Missing ${selector} on ${pageName}`);
        assert.ok(target.closest('.sz-section-panel'), `${selector} is detached from the section navigation`);
      }
      for (const keyName of keys) { await choose(keyName); exclusive(keys); }
    }
    assert.equal(writes(), before, 'Reading a section must not write user data');
  });

  await check('tab keyboard controls move focus, wrap, and keep only one tab in the tab order', async () => {
    await route('health'); await choose('overview'); tab('overview').focus();
    assert.equal((await key(tab('overview'), 'End')).defaultPrevented, true);
    assert.equal(active(), 'support'); assert.equal(document.activeElement, tab('support'));
    await key(tab('support'), 'ArrowRight');
    assert.equal(active(), 'overview'); assert.equal(document.activeElement, tab('overview'));
    await key(tab('overview'), 'ArrowLeft'); assert.equal(active(), 'support');
    await key(tab('support'), 'Home'); assert.equal(active(), 'overview');
    exclusive(['overview', 'benefits', 'feelings', 'support']);
  });

  await check('health links reveal the hidden support and feelings panels before moving focus', async () => {
    await route('health'); await choose('overview');
    assert.equal(panel('support').hidden, true);
    await click('.hz-clarity a[href="#hz-safety-title"]');
    assert.equal(active(), 'support'); assert.equal(panel('support').hidden, false);
    assert.equal(document.activeElement.id, 'hz-safety-title');
    await choose('overview');
    await click('.hz-wins a[href="#hz-feelings-title"]');
    assert.equal(active(), 'feelings'); assert.equal(panel('feelings').hidden, false);
    assert.equal(document.activeElement.id, 'hz-feelings-title');
  });

  await check('health graph and stage redraws preserve the current panel and keyboard focus', async () => {
    await route('health'); await choose('feelings');
    const metric = $('[data-health-action="metric"][data-metric="anxiety"]'); metric.focus();
    await click(metric);
    assert.equal(active(), 'feelings'); assert.equal(panel('feelings').hidden, false);
    assert.equal(document.activeElement.dataset.metric, 'anxiety');
    await choose('benefits');
    const stage = $('[data-health-action="stage"][data-index="4"]'); stage.focus(); await click(stage);
    assert.equal(active(), 'benefits'); assert.equal(document.activeElement.dataset.index, '4');
    await route('home'); await route('health'); assert.equal(active(), 'benefits');
  });

  await check('program reflection drafts survive switching between steps and history without a confirmation or write', async () => {
    await route('journey'); await choose('steps');
    const form = $('#programForm'), original = form.elements.reflection.value;
    const before = writes(), confirmations = env.confirms.length;
    await value(form, 'reflection', 'Brouillon de réflexion QA conservé entre les rubriques.');
    await choose('history'); assert.equal(form.isConnected, true);
    await choose('steps');
    assert.equal($('#programForm'), form);
    assert.equal(form.elements.reflection.value, 'Brouillon de réflexion QA conservé entre les rubriques.');
    assert.equal(writes(), before); assert.equal(env.confirms.length, confirmations);
    await value(form, 'reflection', original);
  });

  await check('profile drafts survive reading settings and motivations without becoming public or being saved', async () => {
    await route('profile'); await choose('profile');
    const form = $('#profileForm'), original = form.elements.bio.value;
    const before = writes(), confirmations = env.confirms.length;
    await value(form, 'bio', 'Brouillon de bio QA non sauvegardé.');
    await choose('settings'); await choose('motivation'); await choose('profile');
    assert.equal($('#profileForm'), form);
    assert.equal(form.elements.bio.value, 'Brouillon de bio QA non sauvegardé.');
    assert.equal(writes(), before); assert.equal(env.confirms.length, confirmations);
    await value(form, 'bio', original);
  });

  await check('the existing history shortcut opens the journey history panel directly', async () => {
    await route('journey'); await choose('steps');
    await route('progress'); await choose('calendar');
    await click('#dy-calendar [data-tl-action="history"]');
    assert.equal(document.body.dataset.page, 'journey'); assert.equal(active(), 'history');
    assert.equal($('.tl-history').closest('.sz-section-panel').hidden, false);
  });

  await check('calendar navigation retains its panel while replacing the displayed month', async () => {
    await route('progress'); await choose('calendar');
    const oldCalendar = $('#dy-calendar'), label = txt('.dy-calendar-controls h3');
    await click('#dy-calendar [data-daily-action="month-prev"]');
    assert.notEqual($('#dy-calendar'), oldCalendar);
    assert.notEqual(txt('.dy-calendar-controls h3'), label);
    assert.equal(active(), 'calendar'); assert.equal($('#dy-calendar').closest('.sz-section-panel').hidden, false);
    assert.equal(document.activeElement.dataset.dailyAction, 'month-prev');
  });

  await check('logout clears remembered sections and a free account retains its complete available report', async () => {
    await route('health'); await choose('support'); await route('profile'); await choose('settings');
    await mock.signOut(); assert.equal($('#workspace').hidden, true);
    mock.tables.billing_subscriptions = [];
    await mock.signIn({id: UID}); await closeModal();
    await route('health'); assert.equal(active(), 'overview');
    await route('profile'); assert.equal(active(), 'profile');
    await route('progress'); exclusive(['overview', 'calendar']);
    assert.equal(active(), 'overview'); assert.ok($('.tl-achievements'));
    assert.ok($('[data-tl-action="occasion"]')); assert.ok($('#dy-calendar'));
    assert.equal($('[data-tl-chart-instance]'), null, 'Tabs must not grant Premium access');
  });

  await check('no uncaught runtime error was emitted', async () => assert.deepEqual(env.errors, []));
} finally {
  console.log(`SECTION NAVIGATION DOM: ${results.filter(Boolean).length}/${results.length} passed; real network disabled`);
  env.close(); process.exitCode = results.some(result => !result) ? 1 : 0;
}
