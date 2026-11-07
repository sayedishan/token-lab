/**
 * gamify.js - the visible side of XP, levels and badges.
 *
 * The rules live in core/gamification.js and are enforced by the store; this file
 * only DRAWS them: toasts, the top-bar XP chip, the level card, badges and the
 * "next step" suggestion. Toasts are announced politely to screen readers and
 * never block clicks (pointer-events: none).
 */
(function (g) {
  'use strict';
  const TL = (g.TokenLab = g.TokenLab || {});
  const { h, icon, fmt } = TL.dom;
  const G = TL.gam;

  // ---------------------------------------------------------------- toasts
  const MAX_TOASTS = 3;
  function toast(kind, title, text) {
    const host = document.getElementById('toasts');
    if (!host) return;
    const el = h('div', { class: 'toast toast--' + kind }, icon(kind === 'badge' ? 'star' : kind === 'level' ? 'bolt' : 'sparkle'), h('div', null, h('strong', null, title), text ? h('span', null, text) : null));
    host.appendChild(el);
    while (host.children.length > MAX_TOASTS) host.removeChild(host.firstChild);
    setTimeout(() => el.parentNode && el.parentNode.removeChild(el), kind === 'xp' ? 3800 : 6500);
  }

  /** Turn a progress diff into toasts (XP first, then level-ups, then badges). */
  function announce(d) {
    if (d.xpGained > 0) {
      const first = d.newEvents[0];
      const more = d.newEvents.length - 1;
      toast('xp', '+' + d.xpGained + ' XP', first ? first.label + (more > 0 ? ' (+' + more + ' more)' : '') : '');
    }
    if (d.levelUp) toast('level', 'Level up: ' + d.levelUp.name, 'You reached level ' + d.levelUp.to + '.');
    d.newBadges.forEach((b) => toast('badge', 'Badge unlocked: ' + b.name, b.desc));
  }

  // ---------------------------------------------------------------- top-bar chip
  function renderChip(chip) {
    const p = TL.store.get().progress;
    const xp = G.totalXP(p);
    const lv = G.level(xp);
    const got = G.badges(p).filter((b) => b.unlocked).length;
    // No aria-label: the visible text ("Lv 2" and "120 XP") is the start of the accessible name, so
    // speech-control users can say what they see; the extra detail is screen-reader-only text after it.
    chip.removeAttribute('aria-label');
    chip.replaceChildren(
      h('span', { class: 'xpchip__lv' }, 'Lv ' + lv.n),
      ' ',
      h('span', { class: 'xpchip__bar', 'aria-hidden': 'true' }, h('span', { style: { width: Math.round(lv.ratio * 100) + '%' } })),
      ' ',
      h('span', { class: 'xpchip__xp' }, xp + ' XP'),
      h('span', { class: 'sr-only' }, `. ${lv.name}, ${got} of ${G.BADGES.length} badges. Open progress and badges`)
    );
  }

  // ---------------------------------------------------------------- cards
  function levelCard() {
    const xp = G.totalXP(TL.store.get().progress);
    const lv = G.level(xp);
    return h(
      'article',
      { class: 'card dash-card' },
      h('div', { class: 'eyebrow' }, 'Your level'),
      h('div', { class: 'dash-card__big' }, `Level ${lv.n} · ${lv.name}`),
      h('div', { class: 'meter', role: 'progressbar', 'aria-label': 'Progress to the next level', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(lv.ratio * 100)) }, h('span', { style: { width: Math.round(lv.ratio * 100) + '%' } })),
      h('p', { class: 'small muted', style: { margin: 0 } }, lv.next ? `${xp} XP · ${lv.toNext} XP to ${lv.next.name}` : `${xp} XP · top level reached`)
    );
  }

  function badgeChip(b) {
    return h(
      'li',
      { class: 'badge-pill', 'data-unlocked': String(b.unlocked) },
      icon(b.unlocked ? b.icon : 'lock'),
      h('span', null, b.name),
      h('span', { class: 'sr-only' }, b.unlocked ? ' (unlocked)' : ' (locked)')
    );
  }

  function badgeRow() {
    const list = G.badges(TL.store.get().progress);
    return h('ul', { class: 'badge-row', 'aria-label': 'Badges' }, list.map(badgeChip));
  }

  function badgesCard() {
    const list = G.badges(TL.store.get().progress);
    return h('article', { class: 'card dash-card' }, h('div', { class: 'eyebrow' }, 'Badges · ' + list.filter((b) => b.unlocked).length + ' of ' + list.length), badgeRow(), h('p', { class: 'small muted', style: { margin: 0 } }, 'Each badge needs real activity in a lab, not just a visit.'));
  }

  /** The first timed section (in lesson order) not yet visited, or null. Optional extensions are never "next". */
  function nextSection() {
    const visited = TL.store.get().visited;
    return TL.lesson.required().find((s) => !visited[s.id]) || null;
  }

  function nextCard(go) {
    const n = nextSection();
    const visited = TL.store.get().visited;
    const timed = TL.lesson.required();
    const done = timed.filter((s) => visited[s.id]).length;
    const btn = n ? h('button', { type: 'button', class: 'btn btn--primary btn--sm' }, 'Continue: ' + n.short, icon('right')) : h('button', { type: 'button', class: 'btn btn--sm' }, 'Review the lesson', icon('right'));
    btn.addEventListener('click', () => go(n ? n.id : 'summary'));
    return h(
      'article',
      { class: 'card dash-card' },
      h('div', { class: 'eyebrow' }, 'Next step'),
      h('div', { class: 'dash-card__big' }, n ? n.title : 'Lesson complete'),
      h('p', { class: 'small muted', style: { margin: 0 } }, `${done} of ${timed.length} sections visited`),
      btn
    );
  }

  /** The three dashboard cards shown on the Start page. */
  function dashboard(go) {
    return h('section', { class: 'dash', 'aria-label': 'Your dashboard' }, levelCard(), badgesCard(), nextCard(go));
  }

  /** A full badge card with its criteria (used on the progress page). */
  function badgeDetail(b) {
    return h(
      'article',
      { class: 'card badge-card', 'data-unlocked': String(b.unlocked) },
      h('div', { class: 'badge-card__ico' }, icon(b.unlocked ? b.icon : 'lock')),
      h('h3', null, b.name),
      h('p', { class: 'small muted', style: { margin: 0 } }, b.desc + ' (' + b.lab + ')'),
      h('ul', { class: 'criteria' }, b.criteria.map((c) => h('li', { 'data-done': String(c.done) }, icon(c.done ? 'check' : 'x'), c.label)))
    );
  }

  TL.ui = TL.ui || {};
  TL.ui.gamify = { toast, announce, renderChip, levelCard, badgeRow, badgesCard, nextCard, dashboard, badgeDetail, nextSection };
  if (typeof module !== 'undefined' && module.exports) module.exports = TL.ui.gamify;
})(typeof window !== 'undefined' ? window : globalThis);
