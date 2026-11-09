/** Exercise the real application, navigation and draft guard with fictitious data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {environment,boot,$,$$,click,value,submit,route} from './ux-dom-support.mjs';

test('Agenda integrates with the real mobile shell, draft guard and session lifecycle',async t=>{
  const env=await environment({mobile:true});
  try{
    await boot();await click('[data-action="demo"]');await route('agenda');
    await t.test('navigation exposes the new rubric without inheriting global header/aside geometry',async()=>{
      assert.equal(document.body.dataset.page,'agenda');assert.equal($('#content h1').textContent,'Agenda & objectifs');
      assert.equal($('#nav [data-page="agenda"]').getAttribute('aria-current'),'page');
      assert.equal($('.ux-page-title').textContent,'Agenda & objectifs');
      assert.equal($$('#workspace header').length,1);assert.equal($$('#workspace aside').length,1);
      // The six examples may cross the Sunday boundary; future goals also live
      // in the sidebar, independent from the selected calendar week.
      assert.equal(new Set($$('.ag-page [data-ag-item]').map(node=>node.dataset.agItem)).size,6);assert.match($('.ag-banner').textContent,/fictifs/);
    });
    await t.test('cancel respects the shared unsaved-draft guard',async()=>{
      await click('#ag-new');const form=$('#agendaItemForm');await value(form,'kind','task');await value(form,'title','Mon brouillon');
      env.answer(false);await click('#agendaItemForm [data-ag-action="cancel"]');assert.equal($('#modal').open,true);assert.equal(form.elements.title.value,'Mon brouillon');
      assert.match(env.confirms.at(-1),/modifications/);
      env.answer(true);await click('#agendaItemForm [data-ag-action="cancel"]');assert.equal($('#modal').open,false);
    });
    await t.test('demo CRUD reaches the rendered list and logout clears the open private form',async()=>{
      await click('#ag-new');const form=$('#agendaItemForm');await value(form,'kind','task');await value(form,'title','Ma tâche intégrée');await submit(form);
      assert.equal($('#modal').open,false);assert.ok($$('.ag-planner h3').some(node=>node.textContent==='Ma tâche intégrée'));
      const edit=$$('.ag-planner .ag-item').find(node=>node.querySelector('h3')?.textContent==='Ma tâche intégrée').querySelector('[data-ag-action="edit"]');
      await click(edit);assert.ok($('#agendaItemForm'));await click('[data-action="logout"]');
      assert.equal($('#workspace').hidden,true);assert.equal($('#modal').open,false);assert.equal($('#agendaItemForm'),null);
    });
    assert.deepEqual(env.errors,[]);
  }finally{env.close();}
});
