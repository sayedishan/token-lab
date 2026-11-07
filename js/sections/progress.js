/**
 * progress.js - "Progress and badges": level, XP ledger, badges with their criteria,
 * section completion and Token Master scores. Not part of the timed lesson.
 */
(function (g) {
  'use strict';
  const TL = g.TokenLab;
  TL.sections = TL.sections || {};

  TL.sections.progress = function render(ctx) {
    const { h, p, icon } = TL.dom;
    const G = TL.gam;
    const M = TL.master;
    const store = TL.store;
    const st = store.get();
    const B = M.build();
    const badges = G.badges(st.progress);
    const events = Object.keys(st.progress.xp).sort((a, b) => st.progress.xp[b] - st.progress.xp[a]);

    const ledger = events.length
      ? h('div', { class: 'tablewrap' }, h('table', null, h('thead', null, h('tr', null, [h('th', { scope: 'col' }, 'Activity'), h('th', { class: 'num', scope: 'col' }, 'XP')])), h('tbody', null, events.map((id) => h('tr', null, h('th', { scope: 'row' }, G.labelFor(id)), h('td', { class: 'num' }, String(st.progress.xp[id])))))))
      : h('p', { class: 'muted' }, 'No XP yet. Make a prediction on the Start page or try Lab 1: XP comes from doing, not from visiting.');

    const levels = h('div', { class: 'sumgrid' }, B.levels.map((l) => {
      const pr = M.levelProgress(st.master, l.n);
      return h('div', { class: 'stat' }, h('div', { class: 'stat__label' }, `Level ${l.n}: ${l.name}`), h('div', { class: 'stat__value' }, pr.complete ? `${pr.points}/${pr.max}` : `${pr.done}/${pr.total} answered`), h('div', { class: 'stat__note' }, pr.complete ? 'complete' : 'in progress'));
    }));

    const visited = TL.lesson.SECTIONS.map((s) => h('li', { 'data-done': String(!!st.visited[s.id]) }, icon(st.visited[s.id] ? 'check' : 'x'), h('span', null, s.title), h('span', { class: 'detail' }, s.optional ? 'optional' : s.minutes + ' min')));

    // Reset lives here (not only on the completion screen, which is locked until Token Master is finished), so
    // anyone partway through can start again: a facilitator between sessions, or a learner who wants a fresh run.
    const resetBtn = h('button', { type: 'button', class: 'btn', id: 'reset-progress' }, icon('reset'), 'Reset my progress');
    resetBtn.addEventListener('click', () => {
      if (window.confirm('Clear your saved progress, XP, badges and scores on this device?')) {
        store.reset();
        ctx.go('start');
      }
    });

    return h(
      'div',
      { class: 'stack' },
      h('header', { class: 'section-head' }, h('div', { class: 'eyebrow-row' }, h('span', { class: 'tag tag--accent' }, 'Dashboard'), h('span', { class: 'tag' }, 'not part of the timed lesson')), h('h1', { tabindex: '-1', id: 'section-title' }, 'Progress and badges')),
      h('div', { class: 'dash' }, TL.ui.gamify.levelCard(), TL.ui.gamify.badgesCard(), TL.ui.gamify.nextCard(ctx.go)),
      h('h2', null, 'Badges'),
      h('div', { class: 'grid-3' }, badges.map(TL.ui.gamify.badgeDetail)),
      h('h2', null, 'Token Master'),
      levels,
      h('h2', null, 'XP ledger'),
      ledger,
      p(`Level thresholds: ${G.LEVELS.map((l) => `${l.name} at ${l.at} XP`).join(', ')}. The timed lesson awards up to ${G.MAX_REQUIRED_XP} XP; the optional extension adds up to ${G.MAX_XP - G.MAX_REQUIRED_XP} bonus XP.`, 'muted small'),
      h('h2', null, 'Lesson sections'),
      h('ul', { class: 'checklist' }, visited),
      h('h2', null, 'Start again'),
      p('Clears XP, badges, scores and visited sections on this device only. Your theme and Instructor view setting are kept.', 'muted small'),
      h('div', { class: 'row' }, resetBtn)
    );
  };
})(typeof window !== 'undefined' ? window : globalThis);
