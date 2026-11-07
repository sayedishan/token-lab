/**
 * app.js - the shell: hash routing, sidebar, top bar, theme, instructor mode,
 * XP chip, progress and the previous/next pager.
 *
 * Routing is hash-based (#/lab-1) so refresh and back/forward work, and it
 * works from file:// with no server.
 */
(function (g) {
  'use strict';
  const TL = g.TokenLab;
  const { h, icon, Tip } = TL.dom;
  const L = TL.lesson;
  const store = TL.store;
  const doc = document;

  const $ = (id) => doc.getElementById(id);
  const view = $('view');
  const nav = $('nav');
  const sidebar = $('sidebar');
  const scrim = $('scrim');
  const pager = $('pager');
  const progressBar = $('topbar-progress');
  const timeLeft = $('time-left');
  const menuBtn = $('menu-btn');
  const themeBtn = $('theme-btn');
  const instBtn = $('inst-btn');
  const xpChip = $('xp-chip');
  const timebox = $('timebox');

  /** The progress page is a route but not a timed lesson section. */
  const PROGRESS = { id: 'progress', title: 'Progress and badges', short: 'Progress and badges', minutes: 0, type: 'Dashboard', learn: '', why: '', where: '', teacher: null };

  // -------------------------------------------------------------------- routing
  function currentId() {
    const m = (g.location.hash || '').match(/^#\/([\w-]+)/);
    if (m && m[1] === 'progress') return 'progress';
    return m && L.SECTIONS.some((s) => s.id === m[1]) ? m[1] : 'start';
  }
  const go = (id) => {
    g.location.hash = '#/' + id;
  };

  // -------------------------------------------------------------------- theme (dark navy is the default)
  const effectiveTheme = () => store.get().theme || 'dark';
  function applyTheme() {
    const t = store.get().theme;
    if (t) doc.documentElement.setAttribute('data-theme', t);
    else doc.documentElement.removeAttribute('data-theme');
    const dark = effectiveTheme() === 'dark';
    themeBtn.replaceChildren(icon(dark ? 'sun' : 'moon'));
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    themeBtn.setAttribute('title', dark ? 'Switch to light theme' : 'Switch to dark theme');
  }
  themeBtn.addEventListener('click', () => {
    store.set({ theme: effectiveTheme() === 'dark' ? 'light' : 'dark' });
    applyTheme();
  });

  // -------------------------------------------------------------------- instructor mode
  function applyInstructor() {
    const on = store.get().instructor;
    doc.body.classList.toggle('instructor-on', on);
    instBtn.setAttribute('aria-pressed', String(on));
    instBtn.setAttribute('aria-label', on ? 'Instructor view is on. Turn off' : 'Turn on instructor view (facilitation notes, unlocks every level)');
    instBtn.setAttribute('title', on ? 'Instructor view: on' : 'Instructor view: off');
  }
  instBtn.addEventListener('click', () => {
    store.set({ instructor: !store.get().instructor });
    applyInstructor();
    // The completion screen is locked for learners and previewable in Instructor view, so redraw it when toggled.
    if (currentId() === 'summary') renderSection();
  });

  // -------------------------------------------------------------------- drawer (mobile)
  function setDrawer(open) {
    sidebar.setAttribute('data-open', String(open));
    scrim.setAttribute('data-open', String(open));
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      const first = sidebar.querySelector('a');
      first && first.focus();
    }
  }
  menuBtn.addEventListener('click', () => setDrawer(sidebar.getAttribute('data-open') !== 'true'));
  scrim.addEventListener('click', () => setDrawer(false));
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.getAttribute('data-open') === 'true') {
      setDrawer(false);
      menuBtn.focus();
    }
  });

  // -------------------------------------------------------------------- nav + progress
  function renderNav(activeId) {
    const visited = store.get().visited;
    const items = L.SECTIONS.map((s, i) => {
      const done = !!visited[s.id] && s.id !== activeId;
      const a = h(
        'a',
        { class: 'nav__link', href: '#/' + s.id, 'aria-current': s.id === activeId ? 'page' : null, 'data-done': String(done) },
        h('span', { class: 'nav__num', 'aria-hidden': 'true' }, done ? icon('check') : s.optional ? '+' : String(i + 1)),
        h('span', null, s.short, done ? h('span', { class: 'sr-only' }, ' (visited)') : null),
        h('span', { class: 'nav__min' }, s.optional ? 'optional' : s.minutes + ' min')
      );
      a.addEventListener('click', () => setDrawer(false));
      return h('li', null, a);
    });
    const pa = h(
      'a',
      { class: 'nav__link nav__link--extra', href: '#/progress', 'aria-current': activeId === 'progress' ? 'page' : null },
      h('span', { class: 'nav__num', 'aria-hidden': 'true' }, icon('star')),
      h('span', null, 'Progress and badges'),
      h('span', { class: 'nav__min' }, 'not timed')
    );
    pa.addEventListener('click', () => setDrawer(false));
    // The divider is a border on this item (a separator <li> is not valid list content).
    nav.replaceChildren(...items, h('li', { class: 'nav__extra' }, pa));
  }

  function renderProgress(activeId) {
    const visited = store.get().visited;
    const total = L.totalMinutes();
    const doneMin = L.SECTIONS.filter((s) => visited[s.id] && s.id !== activeId).reduce((n, s) => n + s.minutes, 0);
    const left = total - doneMin;
    const pct = Math.round((doneMin / total) * 100);
    progressBar.style.width = pct + '%';
    timeLeft.replaceChildren(icon('clock', { width: 14, height: 14 }), `~${left} min left`);
    timebox.replaceChildren(
      h('strong', null, `${total} min`),
      h('span', { class: 'muted' }, `of the 45-minute limit · ${doneMin} min completed`),
      h('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Lesson progress', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, h('span', { style: { width: pct + '%' } })),
      h('span', { class: 'small muted' }, 'Progress is kept on this device only.')
    );
    TL.ui.gamify.renderChip(xpChip);
  }

  function renderPager(idx) {
    if (idx < 0) {
      pager.replaceChildren(h('span'), h('a', { class: 'btn', href: '#/start' }, icon('left'), 'Back to the lesson'));
      return;
    }
    const prev = L.SECTIONS[idx - 1];
    const next = L.SECTIONS[idx + 1];
    pager.replaceChildren(
      prev ? h('a', { class: 'btn', href: '#/' + prev.id }, icon('left'), h('span', null, prev.short)) : h('span'),
      next
        ? h('a', { class: 'btn btn--primary', href: '#/' + next.id }, h('span', null, 'Next: ' + next.short), icon('right'))
        : h('a', { class: 'btn', href: '#/start' }, icon('reset'), 'Back to the start')
    );
  }

  // -------------------------------------------------------------------- render a section
  let cleanups = [];
  function runCleanups() {
    const fns = cleanups;
    cleanups = [];
    fns.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        /* a cleanup must never block navigation */
      }
    });
  }

  function renderSection() {
    runCleanups(); // stop timers and animations started by the page we are leaving
    const id = currentId();
    const idx = L.SECTIONS.findIndex((s) => s.id === id);
    const meta = id === 'progress' ? PROGRESS : L.SECTIONS[idx];
    Tip.hide();
    view.classList.remove('enter');
    view.replaceChildren();

    let body;
    try {
      body = TL.sections[id]({ go, meta, store, onCleanup: (fn) => cleanups.push(fn) });
    } catch (err) {
      console.error('Section failed to render:', id, err);
      body = TL.ui.callout('bad', `Sorry, the section "${meta.title}" failed to load. Try reloading the page.`);
    }
    if (id === 'start') view.append(TL.ui.teacherPanel(meta), body);
    else if (id === 'progress') view.append(body);
    else view.append(TL.ui.sectionHeader(meta, idx, L.required().length), TL.ui.teacherPanel(meta), body);

    doc.title = `${meta.title} · Token Lab`;
    void view.offsetWidth; // restart the entrance animation
    view.classList.add('enter');
    g.scrollTo(0, 0);
    const heading = $('section-title');
    if (heading) heading.focus({ preventScroll: true });

    if (id !== 'progress') store.markVisited(id);
    renderNav(id);
    renderProgress(id);
    renderPager(idx);
  }

  g.addEventListener('hashchange', renderSection);
  store.subscribe(() => {
    const id = currentId();
    renderNav(id);
    renderProgress(id);
  });
  store.onGamify((d) => TL.ui.gamify.announce(d));
  xpChip.addEventListener('click', () => go('progress'));

  applyTheme();
  applyInstructor();
  renderSection();
})(typeof window !== 'undefined' ? window : globalThis);
