/**
 * charts.js - small, dependency-free SVG/HTML charts.
 *
 * Follows a consistent mark specification:
 *   - bars <= 24px thick, rounded data-end, square at the baseline
 *   - lines 2px with round joins; end dots r>=4 with a 2px surface ring
 *   - 2px surface-coloured gaps between touching marks (never strokes)
 *   - hairline recessive gridlines; text uses ink tokens, never series colour
 *   - every chart has: a legend (>=2 series), hover + keyboard tooltips,
 *     and a table view supplied by the caller (see components.tableView)
 * Series colours are CSS variables --s1..--s5 (a validated categorical palette).
 */
(function (g) {
  'use strict';
  const TL = (g.TokenLab = g.TokenLab || {});
  const { h, s, clear, fmt, Tip } = TL.dom;

  const color = (n) => `var(--s${n})`;

  /** Legend: items = [{label, color: 1..5, line?: boolean}], in the same order as the marks. */
  function legend(items) {
    return h(
      'div',
      { class: 'legend', role: 'list' },
      items.map((it) =>
        h(
          'span',
          { class: 'legend__item', role: 'listitem' },
          h('span', { class: 'legend__sw' + (it.line ? ' legend__sw--line' : ''), style: { background: it.free ? 'var(--track)' : color(it.color) } }),
          it.label
        )
      )
    );
  }

  // ===================================================================== stacked bar
  /**
   * A segmented bar showing how a context window is filled.
   * update(parts, windowSize): parts = [{key,label,short,tokens,color}]
   */
  function stackedBar(opts) {
    const root = h('div', { class: 'stackbar', role: 'group', 'aria-label': (opts && opts.ariaLabel) || 'Context window usage' });
    let fitters = [];

    function fit() {
      for (const f of fitters) {
        const span = f.seg.firstChild;
        if (!span) continue;
        span.textContent = f.full;
        if (span.offsetWidth + 16 > f.seg.clientWidth) span.textContent = f.val;
        if (span.offsetWidth + 16 > f.seg.clientWidth) span.textContent = '';
      }
    }

    function update(parts, windowSize) {
      clear(root);
      fitters = [];
      const total = parts.reduce((a, p) => a + p.tokens, 0);
      const scale = Math.max(windowSize, total, 1);
      const free = Math.max(0, windowSize - total);
      const over = Math.max(0, total - windowSize);
      const limitPct = (windowSize / scale) * 100;

      const track = h('div', { class: 'stackbar__track' });
      for (const p of parts) {
        if (p.tokens <= 0) continue; // a part at zero draws nothing
        const share = p.tokens / windowSize;
        const text = `${p.label}: ${fmt.int(p.tokens)} tokens (${fmt.pct(share)} of the window)`;
        const seg = h(
          'div',
          { class: 'stackbar__seg', style: { width: (p.tokens / scale) * 100 + '%', background: color(p.color), color: `var(--s${p.color}-ink)` }, tabindex: '0', role: 'img', 'aria-label': text },
          h('span', null, '')
        );
        Tip.attach(seg, text);
        fitters.push({ seg, full: `${p.short} ${fmt.int(p.tokens)}`, val: fmt.int(p.tokens) });
        track.appendChild(seg);
      }
      if (free > 0) {
        const text = `Free space: ${fmt.int(free)} tokens (${fmt.pct(free / windowSize)} of the window)`;
        const seg = h('div', { class: 'stackbar__seg stackbar__seg--free', style: { width: (free / scale) * 100 + '%' }, tabindex: '0', role: 'img', 'aria-label': text }, h('span', null, ''));
        Tip.attach(seg, text);
        fitters.push({ seg, full: `Free ${fmt.int(free)}`, val: fmt.int(free) });
        track.appendChild(seg);
      }
      if (over > 0) {
        track.appendChild(h('div', { class: 'stackbar__overflow', style: { left: limitPct + '%', right: '0' } }));
      }

      const limit = h(
        'div',
        { class: 'stackbar__limit', style: { left: limitPct + '%' } },
        h('span', { class: 'stackbar__limit-label' }, 'Window limit ' + fmt.int(windowSize))
      );
      root.append(limit, track);
      if (over > 0) root.appendChild(h('div', { class: 'stackbar__over' }, `Over by ${fmt.int(over)} tokens`));
      requestAnimationFrame(fit);
    }

    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => fit()).observe(root);
    return { el: root, update, refit: fit };
  }

  // ===================================================================== horizontal grouped bars
  /**
   * groups: [{label, values:[number,...]}]  (values align with series)
   * series: [{name, color:1..5}]
   */
  function hbars({ groups, series, max, unit, ariaLabel }) {
    const top = max || Math.max(...groups.flatMap((gr) => gr.values));
    const root = h('div', { class: 'hbars', role: 'group', 'aria-label': ariaLabel || 'Bar chart' });
    for (const gr of groups) {
      const bars = h('div', { class: 'hbars__bars' });
      gr.values.forEach((v, i) => {
        const text = `${gr.label}, ${series[i].name}: ${fmt.int(v)} ${unit || ''}`.trim();
        const line = h(
          'div',
          { class: 'hbars__line', tabindex: '0', role: 'img', 'aria-label': text },
          h('div', { class: 'hbars__bar', style: { width: 'calc((100% - 52px) * ' + v / top + ')', background: color(series[i].color) } }),
          h('span', { class: 'hbars__val' }, fmt.int(v))
        );
        Tip.attach(line, text);
        bars.appendChild(line);
      });
      root.appendChild(h('div', { class: 'hbars__row' }, h('div', { class: 'hbars__label' }, gr.label), bars));
    }
    return root;
  }

  // ===================================================================== line chart
  function niceCeil(v) {
    if (v <= 0) return 1;
    const exp = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / exp;
    const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return nf * exp;
  }

  /**
   * lineChart({xName, yName, height}) -> {el, setData(series, ariaLabel)}
   * series: [{name, color:1..5, points:[{x,y}], endLabel}]
   * Hover (pointer) and keyboard (arrows/Home/End) both show a crosshair + tooltip.
   */
  function lineChart(cfg) {
    const H = cfg.height || 300;
    const M = { l: 62, r: 96, t: 26, b: 40 };
    const root = h('div', { class: 'linechart', tabindex: '0', role: 'img', 'aria-label': 'Line chart' });
    let series = [];
    let W = 640;
    let geom = null;
    let hoverIdx = null;
    let cross = null;
    let dots = [];

    function draw() {
      clear(root);
      if (!series.length) return;
      W = Math.max(280, root.clientWidth || 640);
      const compact = W < 520;
      const mr = compact ? 20 : M.r;
      const ml = compact ? 52 : M.l;
      const pts = series[0].points;
      const xMin = pts[0].x;
      const xMax = pts[pts.length - 1].x;
      const yMax = niceCeil(Math.max(...series.flatMap((se) => se.points.map((p) => p.y))));
      const X = (x) => ml + ((x - xMin) / (xMax - xMin || 1)) * (W - ml - mr);
      const Y = (y) => H - M.b - (y / yMax) * (H - M.t - M.b);
      geom = { X, Y, ml, mr, xMin, xMax, pts };

      const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' });
      // y gridlines + tick labels
      for (let i = 0; i <= 4; i++) {
        const v = (yMax * i) / 4;
        const y = Y(v);
        svg.appendChild(s('line', { x1: ml, x2: W - mr, y1: y, y2: y, stroke: i === 0 ? 'var(--line-2)' : 'var(--line)', 'stroke-width': 1 }));
        svg.appendChild(s('text', { x: ml - 8, y: y + 4, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--ink-3)' }, fmt.compact(v)));
      }
      // x ticks
      const span = xMax - xMin;
      const step = span <= 8 ? 1 : span <= 16 ? 2 : span <= 40 ? 5 : 10;
      for (let x = Math.ceil(xMin / step) * step; x <= xMax; x += step) {
        svg.appendChild(s('text', { x: X(x), y: H - M.b + 18, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--ink-3)' }, String(x)));
      }
      svg.appendChild(s('text', { x: (ml + W - mr) / 2, y: H - 6, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--ink-2)' }, cfg.xName || ''));
      svg.appendChild(s('text', { x: ml, y: 12, 'font-size': 12, fill: 'var(--ink-2)' }, cfg.yName || ''));

      // series
      const endYs = [];
      for (const se of series) {
        const d = se.points.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
        svg.appendChild(s('path', { d, fill: 'none', stroke: color(se.color), 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
        const last = se.points[se.points.length - 1];
        svg.appendChild(s('circle', { cx: X(last.x), cy: Y(last.y), r: 4.5, fill: color(se.color), stroke: 'var(--surface)', 'stroke-width': 2 }));
        endYs.push(Y(last.y));
      }
      // direct end labels - only if they do not collide (otherwise legend + tooltip carry identity)
      const collide = endYs.some((y, i) => endYs.some((y2, j) => i < j && Math.abs(y - y2) < 16));
      if (!compact && !collide) {
        series.forEach((se, i) => {
          if (!se.endLabel) return;
          svg.appendChild(s('text', { x: W - mr + 10, y: endYs[i] + 4, 'font-size': 12, 'font-weight': 600, fill: 'var(--ink-2)' }, se.endLabel));
        });
      }
      // hover layer
      cross = s('line', { y1: M.t, y2: H - M.b, stroke: 'var(--ink-3)', 'stroke-width': 1, visibility: 'hidden' });
      svg.appendChild(cross);
      dots = series.map((se) => {
        const c = s('circle', { r: 5, fill: color(se.color), stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' });
        svg.appendChild(c);
        return c;
      });
      const hit = s('rect', { x: ml, y: M.t, width: W - ml - mr, height: H - M.t - M.b, fill: 'transparent' });
      hit.addEventListener('pointermove', (e) => {
        const r = svg.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * W;
        const xv = xMin + ((px - ml) / (W - ml - mr)) * (xMax - xMin);
        const idx = Math.min(pts.length - 1, Math.max(0, Math.round(xv - xMin)));
        setHover(idx, e.clientX, e.clientY);
      });
      hit.addEventListener('pointerleave', () => setHover(null));
      svg.appendChild(hit);
      root.appendChild(svg);
      if (hoverIdx != null) setHover(hoverIdx);
    }

    function setHover(idx, cx, cy) {
      hoverIdx = idx;
      if (idx == null || !geom) {
        if (cross) cross.setAttribute('visibility', 'hidden');
        dots.forEach((d) => d.setAttribute('visibility', 'hidden'));
        Tip.hide();
        return;
      }
      const x = geom.X(geom.pts[idx].x);
      cross.setAttribute('x1', x);
      cross.setAttribute('x2', x);
      cross.setAttribute('visibility', 'visible');
      series.forEach((se, i) => {
        dots[i].setAttribute('cx', x);
        dots[i].setAttribute('cy', geom.Y(se.points[idx].y));
        dots[i].setAttribute('visibility', 'visible');
      });
      const tip = h(
        'div',
        null,
        h('div', null, h('b', null, `${cfg.xName ? cfg.xName.replace(/ \(.*/, '') : 'x'} ${geom.pts[idx].x}`)),
        series.map((se) => h('div', null, `${se.name}: `, h('b', null, fmt.int(se.points[idx].y))))
      );
      if (cx == null) {
        const r = root.querySelector('svg').getBoundingClientRect();
        cx = r.left + (x / W) * r.width;
        cy = r.top + 40;
      }
      Tip.show(tip, cx, cy);
    }

    root.addEventListener('keydown', (e) => {
      if (!series.length) return;
      const n = series[0].points.length;
      let i = hoverIdx == null ? n - 1 : hoverIdx;
      if (e.key === 'ArrowRight') i = Math.min(n - 1, i + 1);
      else if (e.key === 'ArrowLeft') i = Math.max(0, i - 1);
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = n - 1;
      else return;
      e.preventDefault();
      setHover(i);
    });
    root.addEventListener('blur', () => setHover(null));

    if (typeof ResizeObserver !== 'undefined') {
      let t;
      new ResizeObserver(() => {
        clearTimeout(t);
        t = setTimeout(draw, 80);
      }).observe(root);
    }

    return {
      el: root,
      setData(next, ariaLabel) {
        series = next;
        if (ariaLabel) root.setAttribute('aria-label', ariaLabel);
        draw();
      },
    };
  }

  // ===================================================================== sparkline
  /** Minimal single-series trend (no axes). values: number[] */
  function sparkline(values, ariaLabel) {
    const W = 260;
    const Hh = 54;
    const pad = 6;
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const X = (i) => pad + (i / Math.max(1, values.length - 1)) * (W - pad * 2);
    const Y = (v) => pad + (1 - (v - lo) / (hi - lo || 1)) * (Hh - pad * 2);
    const d = values.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
    const last = values.length - 1;
    // The line stretches to the container width (preserveAspectRatio none), which would squash a circle
    // into an ellipse, so the end-dot is an HTML overlay positioned by percentage instead.
    return h(
      'div',
      { class: 'spark-wrap', role: 'img', 'aria-label': ariaLabel || 'Trend' },
      s(
        'svg',
        { class: 'spark', viewBox: `0 0 ${W} ${Hh}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' },
        s('path', { d, fill: 'none', stroke: color(1), 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' })
      ),
      h('span', { class: 'spark-dot', style: { left: (X(last) / W) * 100 + '%', top: (Y(values[last]) / Hh) * 100 + '%' } })
    );
  }

  TL.charts = { legend, stackedBar, hbars, lineChart, sparkline };
  if (typeof module !== 'undefined' && module.exports) module.exports = TL.charts;
})(typeof window !== 'undefined' ? window : globalThis);
