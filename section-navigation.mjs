/* Presentation only: keep every existing control and form, with short local tabs.
   Selection lives in memory, and is cleared when the workspace closes. */
const $ = (selector, root = document) => root.querySelector(selector);
const children = root => [...root.children];
const node = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};

export function createSectionNavigation(content) {
  const selections = new Map();
  let current = null;

  function select(key, {focus = false} = {}) {
    if (!current?.tabs.isConnected) return false;
    const entry = current.entries.find(item => item.key === key);
    if (!entry) return false;
    selections.set(current.page, key);
    for (const item of current.entries) {
      const active = item === entry;
      item.button.setAttribute('aria-selected', String(active));
      item.button.tabIndex = active ? 0 : -1;
      item.panel.hidden = !active;
    }
    if (focus) entry.button.focus({preventScroll: true});
    return true;
  }

  function mount(page, root, groups) {
    const available = groups.filter(group => group.nodes.length);
    if (available.length < 2 || $('.sz-section-tabs', root)) return;
    const heading = $('.greeting', root);
    if (!heading) return;
    const focused = root.contains(document.activeElement) ? document.activeElement : null;
    const tabs = node('div', 'sz-section-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Rubriques de ' + ({progress: 'mon suivi', health: 'ma santé', journey: 'mon parcours', profile: 'mon profil'}[page] || page));
    tabs.style.setProperty('--section-count', String(available.length));
    heading.after(tabs);
    const entries = available.map(group => {
      const button = node('button', 'sz-section-tab', group.label);
      button.type = 'button';
      button.id = `sz-${page}-tab-${group.key}`;
      button.dataset.section = group.key;
      button.setAttribute('role', 'tab');
      const panel = node('section', 'sz-section-panel');
      panel.id = `sz-${page}-panel-${group.key}`;
      panel.dataset.section = group.key;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', button.id);
      panel.tabIndex = 0;
      button.setAttribute('aria-controls', panel.id);
      tabs.append(button);
      panel.append(...group.nodes);
      return {...group, button, panel};
    });
    tabs.after(...entries.map(item => item.panel));
    current = {page, tabs, entries};
    const activePanel = entries.find(item => focused && item.panel.contains(focused));
    const initial = activePanel?.key || selections.get(page) || available[0].key;
    if (!select(initial)) select(available[0].key);
    if (focused?.isConnected && !focused.closest('[hidden]')) focused.focus({preventScroll: true});
    tabs.addEventListener('click', event => {
      const button = event.target.closest('[role="tab"]');
      if (button) select(button.dataset.section);
    });
    tabs.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const index = entries.findIndex(item => item.button === event.target);
      if (index < 0) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + entries.length) % entries.length;
      select(entries[next].key, {focus: true});
    });
  }

  function enhance(page) {
    if (!content) return;
    if (page === 'health') {
      const root = $('.hz-page', content);
      if (!root || !$('.hz-hero', root)) return;
      const all = children(root).filter(el => !el.matches('.greeting,.ux-section-links'));
      const benefits = all.filter(el => el.matches('.hz-milestones,.hz-evidence-footer'));
      const feelings = all.filter(el => el.matches('.card.hz-section'));
      const support = all.filter(el => el.matches('.hz-addiction,.hz-safety'));
      const moved = new Set([...benefits, ...feelings, ...support]);
      mount(page, root, [
        {key: 'overview', label: 'Mon arrêt', nodes: all.filter(el => !moved.has(el))},
        {key: 'benefits', label: 'Bienfaits', nodes: benefits},
        {key: 'feelings', label: 'Ressentis', nodes: feelings},
        {key: 'support', label: 'Envies & aide', nodes: support},
      ]);
      $('.ux-section-links', root)?.remove();
    } else if (page === 'progress') {
      const all = children(content).filter(el => !el.matches('.greeting'));
      const calendar = all.filter(el => el.matches('#dy-calendar'));
      if (!calendar.length) return;
      const history = all.filter(el => el.matches('.tl-history'));
      for (const item of history) if (item.tagName === 'DETAILS') item.open = true;
      const moved = new Set([...calendar, ...history]);
      mount(page, content, [
        {key: 'overview', label: 'Mon bilan', nodes: all.filter(el => !moved.has(el))},
        {key: 'calendar', label: 'Calendrier', nodes: calendar},
        {key: 'history', label: 'Historique', nodes: history},
      ]);
    } else if (page === 'journey') {
      const program = $('#programForm', content)?.closest('section');
      if (!program || !$('.tl-history', content)) return;
      program.classList.add('sz-program-card');
      const all = children(content).filter(el => !el.matches('.greeting'));
      mount(page, content, [
        {key: 'steps', label: 'Mes étapes', nodes: [program]},
        {key: 'history', label: 'Mon historique', nodes: all.filter(el => el !== program)},
      ]);
    } else if (page === 'profile') {
      const profile = $('#profileForm', content)?.closest('section');
      const grid = profile?.parentElement;
      if (!profile || !grid?.matches('.ux-profile-grid')) return;
      const motivation = children(grid).filter(el => el !== profile);
      const plan = $('#settingsForm', content)?.closest('.ux-settings-group');
      if (plan) {plan.open = true; motivation.push(plan);}
      const settings = children(content).filter(el => !el.matches('.greeting') && el !== grid && el !== plan);
      mount(page, content, [
        {key: 'profile', label: 'Mon profil', nodes: [profile]},
        {key: 'motivation', label: 'Mes motivations', nodes: motivation},
        {key: 'settings', label: 'Réglages', nodes: settings},
      ]);
      if (!grid.children.length) grid.remove();
    }
  }

  function remember(page, key) {
    selections.set(page, key);
    if (current?.page === page) select(key);
  }
  function reveal(target, {scroll = false} = {}) {
    const panel = target?.closest('.sz-section-panel');
    if (!panel || !current?.entries.some(item => item.panel === panel)) return false;
    select(panel.dataset.section);
    for (let parent = target.parentElement; parent && parent !== panel; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
    if (scroll) {
      target.scrollIntoView({block: 'start', behavior: 'instant'});
      if (!target.matches('button,a,input,select,textarea,summary,[tabindex]')) target.tabIndex = -1;
      target.focus({preventScroll: true});
    }
    return true;
  }

  return {enhance, remember, reveal, reset() {selections.clear();current = null;}};
}
