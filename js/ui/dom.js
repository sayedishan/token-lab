/**
 * dom.js - tiny DOM toolkit (hyperscript-style) + icons + formatting + tooltip.
 *
 * Security note: the app NEVER uses innerHTML. Text is always inserted with
 * text nodes, so anything a learner types into the playground is displayed,
 * never executed. Authored inline formatting (**bold**, `code`, links) goes
 * through rich(), which builds real DOM nodes.
 */
(function (g) {
  'use strict';
  const TL = (g.TokenLab = g.TokenLab || {});
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function appendKids(el, kids) {
    for (const k of kids) {
      if (k == null || k === false) continue;
      if (Array.isArray(k)) appendKids(el, k);
      else if (k instanceof Node) el.appendChild(k);
      else el.appendChild(document.createTextNode(String(k)));
    }
  }

  function applyAttrs(el, attrs) {
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.setAttribute('class', v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }

  /** h('div', {class:'x'}, 'text', childNode, [more, kids]) */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    applyAttrs(el, attrs);
    appendKids(el, kids);
    return el;
  }

  /** SVG variant of h(). */
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVG_NS, tag);
    applyAttrs(el, attrs);
    appendKids(el, kids);
    return el;
  }

  /** Remove all children. */
  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  /**
   * Inline formatting for authored text:
   *   **bold**   *italic*   `code`   [label](https://link)
   * Returns a DocumentFragment (safe: built from nodes, not HTML).
   */
  function rich(text) {
    const frag = document.createDocumentFragment();
    const parts = String(text).split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
    for (const part of parts) {
      if (!part) continue;
      let m;
      if ((m = part.match(/^\*\*([^*]+)\*\*$/))) frag.appendChild(h('strong', null, m[1]));
      else if ((m = part.match(/^\*([^*]+)\*$/))) frag.appendChild(h('em', null, m[1]));
      else if ((m = part.match(/^`([^`]+)`$/))) frag.appendChild(h('code', null, m[1]));
      else if ((m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/))) {
        const url = m[2];
        if (/^https?:\/\//.test(url)) {
          frag.appendChild(h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, m[1]));
        } else {
          frag.appendChild(document.createTextNode(m[1]));
        }
      } else frag.appendChild(document.createTextNode(part));
    }
    return frag;
  }

  /** A paragraph from authored text. */
  const p = (text, cls) => h('p', cls ? { class: cls } : null, rich(text));

  // ---------------------------------------------------------------- icons
  const ICONS = {
    check: ['M20 6 9 17l-5-5'],
    x: ['M18 6 6 18', 'M6 6l12 12'],
    info: ['M12 16v-4', 'M12 8h.01', 'circle:12,12,10'],
    alert: ['M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
    menu: ['M3 6h18', 'M3 12h18', 'M3 18h18'],
    sun: ['circle:12,12,4', 'M12 2v2', 'M12 20v2', 'M4.93 4.93l1.41 1.41', 'M17.66 17.66l1.41 1.41', 'M2 12h2', 'M20 12h2', 'M4.93 19.07l1.41-1.41', 'M17.66 6.34l1.41-1.41'],
    moon: ['M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'],
    play: ['M6 4l14 8-14 8z'],
    undo: ['M3 7v6h6', 'M21 17a9 9 0 0 0-15-6.7L3 13'],
    reset: ['M1 4v6h6', 'M3.51 15a9 9 0 1 0 2.13-9.36L1 10'],
    left: ['M19 12H5', 'M12 19l-7-7 7-7'],
    right: ['M5 12h14', 'M12 5l7 7-7 7'],
    teacher: ['M3 4h18v12H3z', 'M12 16v5', 'M8 21h8'],
    flask: ['M9 3h6', 'M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3'],
    clock: ['circle:12,12,10', 'M12 6v6l4 2'],
    code: ['M16 18l6-6-6-6', 'M8 6l-6 6 6 6'],
    book: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z', 'M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5'],
    bolt: ['M13 2 3 14h9l-1 8 10-12h-9l1-8z'],
    coin: ['M12 1v22', 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'],
    globe: ['circle:12,12,10', 'M2 12h20', 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'],
    target: ['circle:12,12,10', 'circle:12,12,6', 'circle:12,12,2'],
    shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M9 12l2 2 4-4'],
    sparkle: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z'],
    lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
    star: ['M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z'],
    pause: ['M6 4h4v16H6z', 'M14 4h4v16h-4z'],
    step: ['M5 4l10 8-10 8z', 'M19 5v14'],
    trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'],
    save: ['M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z', 'M17 21v-8H7v8', 'M7 3v5h8'],
    layers: ['M12 2 2 7l10 5 10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
  };

  function icon(name, attrs) {
    const svg = s('svg', Object.assign({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' }, attrs));
    for (const d of ICONS[name] || []) {
      if (d.startsWith('circle:')) {
        const [cx, cy, r] = d.slice(7).split(',');
        svg.appendChild(s('circle', { cx, cy, r }));
      } else svg.appendChild(s('path', { d }));
    }
    return svg;
  }

  // ---------------------------------------------------------------- formatting
  const fmt = {
    int: (n) => Math.round(n).toLocaleString('en-US'),
    // Group thousands in the WHOLE part only: "0.0202" must not become "0.0,202".
    usd: (n, digits) => {
      const [whole, frac] = n.toFixed(digits == null ? (n < 1 ? 4 : 2) : digits).split('.');
      return '$' + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? '.' + frac : '');
    },
    pct: (n) => (n * 100).toFixed(n < 0.1 ? 1 : 0) + '%',
    ratio: (n) => (n >= 10 ? n.toFixed(0) : n.toFixed(1)) + '×',
    compact: (n) => (n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n % 1e3 ? 1 : 0) + 'K' : String(Math.round(n))),
  };

  // ---------------------------------------------------------------- live region
  function announce(msg) {
    const live = document.getElementById('live');
    if (!live) return;
    live.textContent = '';
    // Re-set on next frame so screen readers re-announce identical text.
    requestAnimationFrame(() => {
      live.textContent = msg;
    });
  }

  function debounce(fn, ms) {
    let t;
    return function (...a) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, a), ms);
    };
  }

  // ---------------------------------------------------------------- tooltip (shared)
  let tipEl = null;
  function getTip() {
    if (!tipEl) {
      // aria-hidden: the tooltip only repeats what each mark's aria-label already says, so screen readers skip it.
      tipEl = h('div', { class: 'chart-tip', 'aria-hidden': 'true', 'data-show': 'false' });
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }
  const Tip = {
    /** Show tooltip content (string or Node) near viewport point (x,y). */
    show(content, x, y) {
      const t = getTip();
      clear(t);
      t.appendChild(typeof content === 'string' ? document.createTextNode(content) : content);
      t.setAttribute('data-show', 'true');
      const r = t.getBoundingClientRect();
      const left = Math.min(Math.max(8, x + 14), window.innerWidth - r.width - 8);
      const top = y - r.height - 12 < 8 ? y + 18 : y - r.height - 12;
      t.style.left = left + 'px';
      t.style.top = top + 'px';
    },
    hide() {
      if (tipEl) tipEl.setAttribute('data-show', 'false');
    },
    /** Hover + keyboard-focus tooltip for any element. text can be a function. */
    attach(el, text) {
      const get = typeof text === 'function' ? text : () => text;
      el.addEventListener('pointerenter', (e) => Tip.show(get(), e.clientX, e.clientY));
      el.addEventListener('pointermove', (e) => Tip.show(get(), e.clientX, e.clientY));
      el.addEventListener('pointerleave', Tip.hide);
      el.addEventListener('focus', () => {
        const r = el.getBoundingClientRect();
        Tip.show(get(), r.left + r.width / 2, r.top);
      });
      el.addEventListener('blur', Tip.hide);
    },
  };

  TL.dom = { h, s, clear, rich, p, icon, fmt, announce, debounce, Tip };
  if (typeof module !== 'undefined' && module.exports) module.exports = TL.dom;
})(typeof window !== 'undefined' ? window : globalThis);
