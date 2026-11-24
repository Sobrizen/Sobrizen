import test from 'node:test';
import assert from 'node:assert/strict';
import {environment, boot, $, click, submit, value, closeModal, txt} from './ux-dom-support.mjs';

const env = await environment({mobile: true});
await boot();
const help = () => click('#welcome [data-action="help"]');
const next = () => click('#modal [data-direction="next"]');

test('all three public exercises work at the visitor’s pace and suggest a different next step', async () => {
  for (const [name, length, feeling, nextActivity] of [
    ['breath', 3, 'lighter', 'ground'],
    ['ground', 5, 'same', 'hands'],
    ['hands', 3, 'stronger', 'breath'],
  ]) {
    await help();
    await click(`#modal [data-action="${name}"]`);
    const stage = $('.support-exercise');
    assert.equal(stage.dataset.stage, '0');
    assert.equal(document.activeElement, stage.querySelector('h3'));
    await next();
    await click('#modal [data-direction="back"]');
    assert.equal(stage.dataset.stage, '0');
    for (let i = 0; i < length; i++) await next();
    assert.equal(stage.querySelectorAll('[data-feeling]').length, 3);
    await click(`#modal [data-feeling="${feeling}"]`);
    assert.equal(stage.dataset.stage, 'done');
    if (feeling === 'stronger') assert.ok(stage.querySelector('a[href="tel:0980980930"]'));
    await click(`#modal [data-action="${nextActivity}"]`);
    assert.equal($('.support-exercise').dataset.exercise, nextActivity);
    assert.equal($('.support-exercise').dataset.stage, '0');
    await closeModal();
  }
  assert.deepEqual(env.errors, []);
});

test('visitor can finish a timer without recording health data or creating an account', async () => {
  await help();
  await click('#modal [data-action="urge"]');
  await submit($('#urgeStartForm'));
  assert.equal(txt('#timer'), '10:00');
  assert.equal($('#urgeEndForm').hidden, true);
  await click('#modal [data-action="urge-toggle"]');
  await click('#modal [data-action="urge-finish-local"]');
  assert.ok($('#modal a[href="tel:112"]'));
  await click('#modal [data-action="urge"]');
  assert.equal($('#modal [data-action="urge-toggle"]'), null);
  await closeModal();
  assert.deepEqual(env.errors, []);
});

test('a returning user can see both ratings from the last saved pause', async () => {
  await click('#welcome [data-action="demo"]');
  await click('header [data-action="help"]');
  await click('#modal [data-action="urge"]');
  await value($('#urgeStartForm'), 'before', '6');
  await value($('#urgeStartForm'), 'strategy', 'respiration');
  await submit($('#urgeStartForm'));
  await value($('#urgeEndForm'), 'after', '8');
  await submit($('#urgeEndForm'));
  await click('header [data-action="help"]');
  assert.match(txt('.support-options'), /respiration douce.*6\/10 avant.*8\/10 après/);
  await closeModal();
});

test.after(() => env.close());
