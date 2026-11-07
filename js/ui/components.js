/**
 * components.js - shared UI building blocks used by every section.
 */
(function (g) {
  'use strict';
  const TL = (g.TokenLab = g.TokenLab || {});
  const { h, rich, p, icon, fmt, debounce } = TL.dom;

  const KIND_ICON = { info: 'info', ok: 'check', warn: 'alert', bad: 'x' };

  /** Highlighted note. kind: info | ok | warn | bad. Content = strings/nodes. */
  function callout(kind, ...content) {
    const kids = content.map((c) => (typeof c === 'string' ? p(c) : c));
    return h('div', { class: 'callout callout--' + kind, role: kind === 'bad' || kind === 'warn' ? 'note' : null }, icon(KIND_ICON[kind] || 'info'), h('div', null, kids));
  }

  /**
   * Section title block: type tag, time, title, and the Learn/Why/Real-use brief.
   * "You will learn" is always visible; "why it matters" and "where it is used" sit one click away so the
   * required reading stays short (they are still part of every section, and the instructor view lists them).
   * `total` is the number of timed sections; optional extensions are labelled instead of numbered.
   */
  function sectionHeader(meta, index, total) {
    const title = h('h1', { tabindex: '-1', id: 'section-title' }, meta.title);
    return h(
      'header',
      { class: 'section-head' },
      h(
        'div',
        { class: 'eyebrow-row' },
        h('span', { class: 'tag tag--accent' }, meta.type),
        h('span', { class: 'tag' }, icon('clock'), meta.optional ? 'Optional · not counted' : meta.minutes + ' min'),
        h('span', { class: 'eyebrow' }, meta.optional ? 'After the lesson' : `Section ${index + 1} of ${total}`)
      ),
      title,
      h(
        'div',
        { class: 'brief' },
        h('div', { class: 'brief__item' }, h('span', { class: 'brief__label' }, 'You will learn'), meta.learn),
        h(
          'details',
          { class: 'brief__more' },
          h('summary', null, 'Why it matters, and where it is used'),
          h('div', { class: 'brief__item' }, h('span', { class: 'brief__label' }, 'Why it matters'), meta.why),
          h('div', { class: 'brief__item' }, h('span', { class: 'brief__label' }, 'Where it is used'), meta.where)
        )
      )
    );
  }

  /** Facilitator notes: shown only when Instructor view is switched on. */
  function teacherPanel(meta) {
    const t = meta.teacher;
    return h(
      'aside',
      { class: 'teacher', 'aria-label': 'Instructor notes' },
      h('h2', { class: 'teacher__title' }, icon('teacher'), 'Instructor notes · ' + (meta.optional ? 'optional, not counted' : meta.minutes + ' min')),
      h('p', null, h('strong', null, 'Talking points')),
      h('ul', null, t.talk.map((x) => h('li', null, rich(x)))),
      h('p', null, h('strong', null, 'Ask the room: '), t.ask),
      h('p', null, h('strong', null, 'Watch for this misconception: '), t.misconception)
    );
  }

  /** Lab container with a badge header. */
  function lab(opts, ...body) {
    return h(
      'section',
      { class: 'lab', 'aria-labelledby': opts.id + '-title' },
      h(
        'div',
        { class: 'lab__head' },
        h('span', { class: 'lab__badge' }, opts.badge),
        h('h2', { class: 'lab__title', id: opts.id + '-title' }, opts.title),
        opts.sub ? h('span', { class: 'lab__sub' }, opts.sub) : null
      ),
      h('div', { class: 'lab__body' }, body)
    );
  }

  /** Segmented radio control. onChange(value). Returns {el, value()}. */
  function segmented({ name, label, options, value, onChange }) {
    let current = value;
    const group = h('div', { class: 'seg-group', role: 'radiogroup', 'aria-label': label });
    options.forEach((o) => {
      const input = h('input', { type: 'radio', name, value: o.value, checked: o.value === value ? true : null });
      input.addEventListener('change', () => {
        current = o.value;
        onChange(o.value);
      });
      group.appendChild(h('label', null, input, h('span', null, o.label)));
    });
    return { el: group, value: () => current };
  }

  function disclosure(summary, ...body) {
    return h('details', { class: 'disclosure' }, h('summary', null, summary), h('div', { class: 'disclosure__body' }, body));
  }

  function statTile({ label, value, note, tone }) {
    const valueEl = h('div', { class: 'stat__value' }, value);
    const noteEl = note ? h('div', { class: 'stat__note' }, note) : null;
    const el = h('div', { class: 'stat' + (tone ? ' stat--' + tone : '') }, h('div', { class: 'stat__label' }, label), valueEl, noteEl);
    return {
      el,
      set(v, n, t) {
        valueEl.textContent = v;
        if (noteEl && n != null) noteEl.textContent = n;
        el.className = 'stat' + (t ? ' stat--' + t : '');
      },
    };
  }

  /** Collapsible accessible table version of a chart. */
  function tableView(summary, headers, rows, numericFrom) {
    const nf = numericFrom == null ? 1 : numericFrom;
    const table = h(
      'table',
      null,
      h('thead', null, h('tr', null, headers.map((t, i) => h('th', { class: i >= nf ? 'num' : null, scope: 'col' }, t)))),
      h('tbody', null, rows.map((r) => h('tr', null, r.map((c, i) => h(i === 0 ? 'th' : 'td', { class: i >= nf ? 'num' : null, scope: i === 0 ? 'row' : null }, c)))))
    );
    const wrap = h('div', { class: 'tablewrap' }, table);
    const box = disclosure(summary, wrap);
    return {
      el: box,
      setRows(newRows) {
        const tb = table.querySelector('tbody');
        while (tb.firstChild) tb.removeChild(tb.firstChild);
        newRows.forEach((r) => tb.appendChild(h('tr', null, r.map((c, i) => h(i === 0 ? 'th' : 'td', { class: i >= nf ? 'num' : null, scope: i === 0 ? 'row' : null }, c)))));
      },
    };
  }

  let uid = 0;
  const nextId = (p0) => (p0 || 'id') + '-' + ++uid;

  /**
   * Whole-number input synced with a range slider, with validation.
   * - Invalid text shows an inline message and does NOT change state.
   * - On blur an invalid entry is reverted to the last valid value.
   */
  function numberField({ label, hint, value, min, max, step, sliderMax, onChange, suffix }) {
    const E = TL.estimate;
    const id = nextId('nf');
    let last = value;
    let max_ = max;
    let sliderMax_ = sliderMax || max;
    const range = h('input', { type: 'range', min, max: sliderMax_, step: step || 1, value: Math.min(value, sliderMax_), 'aria-label': label + ' (slider)', tabindex: '-1' });
    const input = h('input', { type: 'text', inputmode: 'numeric', class: 'input input--num', id, value: fmt.int(value), 'aria-describedby': id + '-err', autocomplete: 'off' });
    const err = h('div', { class: 'field__err', id: id + '-err', role: 'status', 'aria-live': 'polite' });
    let timer;
    const flash = (msg) => {
      err.textContent = msg;
      clearTimeout(timer);
      if (msg) timer = setTimeout(() => (err.textContent = ''), 3000);
    };

    function commit(v) {
      last = v;
      onChange(v);
    }
    range.addEventListener('input', () => {
      const v = Number(range.value);
      input.value = fmt.int(v);
      input.removeAttribute('aria-invalid');
      flash('');
      commit(v);
    });
    input.addEventListener('input', () => {
      const r = E.parseWholeNumber(input.value, min, max_);
      if (r.ok) {
        input.removeAttribute('aria-invalid');
        flash('');
        range.value = Math.min(r.value, sliderMax_);
        commit(r.value);
      } else {
        input.setAttribute('aria-invalid', 'true');
        err.textContent = r.error;
      }
    });
    input.addEventListener('blur', () => {
      const r = E.parseWholeNumber(input.value, min, max_);
      if (r.ok) input.value = fmt.int(r.value);
      else {
        input.value = fmt.int(last);
        input.removeAttribute('aria-invalid');
        flash('Reverted to ' + fmt.int(last) + ' (the last valid value).');
      }
    });
    const el = h(
      'div',
      { class: 'field' },
      h('label', { class: 'field__label', for: id }, label),
      h('div', { class: 'numrow' }, range, h('div', null, input)),
      hint ? h('div', { class: 'field__hint' }, hint + (suffix ? ' ' + suffix : '')) : null,
      err
    );
    return {
      el,
      value: () => last,
      set(v) {
        last = v;
        input.value = fmt.int(v);
        range.value = Math.min(v, sliderMax_);
        input.removeAttribute('aria-invalid');
        err.textContent = '';
      },
      setLimits(newMax, newSliderMax, newStep) {
        max_ = newMax;
        sliderMax_ = newSliderMax;
        range.max = newSliderMax;
        if (newStep) range.step = newStep;
        range.value = Math.min(last, newSliderMax);
      },
    };
  }

  /** Decimal (price) input with validation. onChange(number). */
  function decimalField({ label, hint, value, min, max, onChange }) {
    const E = TL.estimate;
    const id = nextId('df');
    let last = value;
    const input = h('input', { type: 'text', inputmode: 'decimal', class: 'input input--num', id, value: String(value), 'aria-describedby': id + '-err', autocomplete: 'off' });
    const err = h('div', { class: 'field__err', id: id + '-err', role: 'status', 'aria-live': 'polite' });
    input.addEventListener('input', () => {
      const r = E.parseDecimal(input.value, min, max);
      if (r.ok) {
        input.removeAttribute('aria-invalid');
        err.textContent = '';
        last = r.value;
        onChange(r.value);
      } else {
        input.setAttribute('aria-invalid', 'true');
        err.textContent = r.error;
      }
    });
    input.addEventListener('blur', () => {
      if (!E.parseDecimal(input.value, min, max).ok) {
        input.value = String(last);
        input.removeAttribute('aria-invalid');
        err.textContent = 'Reverted to ' + last + '.';
        setTimeout(() => (err.textContent = ''), 2500);
      }
    });
    return { el: h('div', { class: 'field' }, h('label', { class: 'field__label', for: id }, label), input, hint ? h('div', { class: 'field__hint' }, hint) : null, err), value: () => last };
  }

  TL.ui = { callout, sectionHeader, teacherPanel, lab, segmented, disclosure, statTile, tableView, numberField, decimalField, nextId };
  if (typeof module !== 'undefined' && module.exports) module.exports = TL.ui;
})(typeof window !== 'undefined' ? window : globalThis);
