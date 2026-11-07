/**
 * Section 6 - The context window + Lab 3: budget planner (6 min)
 *
 * What students do: fill a context window with the five things that compete
 * for space, see instantly whether the request fits, and what it costs.
 * Pure arithmetic - the same calculation production code does before it calls
 * a model.
 */
(function (g) {
  'use strict';
  const TL = g.TokenLab;
  TL.sections = TL.sections || {};

  TL.sections['lab-3'] = function render(ctx) {
    const { h, p, rich, icon, fmt } = TL.dom;
    const { callout, lab, numberField, decimalField, tableView } = TL.ui;
    const C = TL.context;

    const PRESETS = [
      { id: 'chat', label: 'Support chat', note: 'Short instructions, a fair amount of history, no documents.', v: { windowSize: 16000, system: 600, history: 2500, docs: 0, user: 150, output: 800 } },
      { id: 'rag', label: 'Document Q&A (RAG)', note: 'Retrieved chunks take most of the space.', v: { windowSize: 8000, system: 500, history: 1000, docs: 4500, user: 120, output: 1000 } },
      { id: 'report', label: 'Paste a whole report', note: 'Too much text for this window. Watch it fail.', v: { windowSize: 8000, system: 300, history: 0, docs: 9000, user: 200, output: 1500 } },
    ];
    const SIZES = [
      ['4K', 4000],
      ['8K', 8000],
      ['16K', 16000],
      ['32K', 32000],
      ['128K', 128000],
      ['200K', 200000],
    ];
    let sawOver = false;
    const vals = Object.assign({}, PRESETS[1].v);
    const price = { inP: 2, outP: 8, perDay: 1000 };
    const MAXV = 1000000;
    const stepFor = (w) => Math.max(1, Math.round(w / 400));

    // ---- fields ---------------------------------------------------------------
    const fields = {};
    const defs = [
      ['system', 'System prompt', 'Fixed instructions.'],
      ['history', 'Conversation history', 'Earlier turns.'],
      ['docs', 'Retrieved documents', 'e.g. 5 chunks × 600 = 3,000.'],
      ['user', 'New user message', 'What was just typed.'],
      ['output', 'Reserved for the reply (max tokens)', 'Room for the answer.'],
    ];
    const winField = numberField({
      label: 'Context window size (tokens)',
      hint: 'Pick a preset size or type your own.',
      value: vals.windowSize,
      min: 1,
      max: MAXV,
      step: 500,
      sliderMax: 200000,
      onChange: (v) => {
        vals.windowSize = v;
        syncLimits();
        render();
      },
    });
    function syncLimits() {
      const w = vals.windowSize;
      defs.forEach(([k]) => fields[k].setLimits(MAXV, Math.max(w, 1), stepFor(w)));
    }
    defs.forEach(([k, label, hint]) => {
      fields[k] = numberField({
        label,
        hint,
        value: vals[k],
        min: 0,
        max: MAXV,
        step: stepFor(vals.windowSize),
        sliderMax: vals.windowSize,
        onChange: (v) => {
          vals[k] = v;
          render();
        },
      });
    });

    const sizeBtns = h('div', { class: 'presets', role: 'group', 'aria-label': 'Common window sizes' }, h('span', { class: 'presets__label' }, 'Window:'));
    const sizePressed = [];
    SIZES.forEach(([label, v]) => {
      const b = h('button', { type: 'button', class: 'btn btn--chip', 'aria-pressed': 'false' }, label);
      b.addEventListener('click', () => {
        vals.windowSize = v;
        winField.set(v);
        syncLimits();
        render();
      });
      sizeBtns.appendChild(b);
      sizePressed.push([v, b]);
    });

    const presetBtns = h('div', { class: 'presets', role: 'group', 'aria-label': 'Example scenarios' }, h('span', { class: 'presets__label' }, 'Scenario:'));
    const presetPressed = [];
    PRESETS.forEach((pr) => {
      const b = h('button', { type: 'button', class: 'btn btn--chip', 'aria-pressed': 'false', title: pr.note }, pr.label);
      b.addEventListener('click', () => {
        Object.assign(vals, pr.v);
        winField.set(vals.windowSize);
        syncLimits();
        defs.forEach(([k]) => fields[k].set(vals[k]));
        render();
      });
      presetBtns.appendChild(b);
      presetPressed.push([pr, b]);
    });

    // ---- chart, status, cost, table ------------------------------------------
    const bar = TL.charts.stackedBar({ ariaLabel: 'How the context window is filled' });
    const COLORS = { system: 1, history: 2, docs: 3, user: 4, output: 5 };
    const SHORT = { system: 'System', history: 'History', docs: 'Docs', user: 'You', output: 'Reply' };
    const legendEl = h('div');
    const statusEl = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
    const costOut = h('div', { class: 'stats' });
    const tv = tableView('Show as a table', ['Part', 'Tokens', '% of window'], [], 1);

    const inField = decimalField({ label: 'Input price ($ per 1M tokens)', hint: 'Illustrative number. Use your model’s real price.', value: price.inP, min: 0, max: 1000, onChange: (v) => { price.inP = v; render(); } });
    const outField = decimalField({ label: 'Output price ($ per 1M tokens)', hint: 'Output usually costs more per token.', value: price.outP, min: 0, max: 1000, onChange: (v) => { price.outP = v; render(); } });
    const dayField = numberField({ label: 'Requests per day', hint: 'To scale the cost.', value: price.perDay, min: 0, max: 10000000, step: 100, sliderMax: 20000, onChange: (v) => { price.perDay = v; render(); } });

    function render() {
      const plan = C.planBudget(vals);
      // XP rule "fixed an overflow": the learner must SEE a request overflow first, then bring it back inside the window.
      if (!plan.fits) {
        sawOver = true;
        TL.store.flag('budget.over');
      } else if (sawOver) TL.store.flag('budget.fit');
      bar.update(plan.parts.map((pt) => Object.assign({}, pt, { color: COLORS[pt.key], short: SHORT[pt.key] })), vals.windowSize);
      legendEl.replaceChildren(TL.charts.legend(plan.parts.map((pt) => ({ label: pt.label, color: COLORS[pt.key] })).concat([{ label: 'Free space', free: true }])));

      sizePressed.forEach(([v, b]) => b.setAttribute('aria-pressed', String(v === vals.windowSize)));
      presetPressed.forEach(([pr, b]) => b.setAttribute('aria-pressed', String(Object.keys(pr.v).every((k) => pr.v[k] === vals[k]))));

      // status banner
      const biggest = plan.parts.slice().sort((a, b) => b.tokens - a.tokens)[0];
      const used = plan.total / vals.windowSize;
      if (plan.fits) {
        const tight = used >= 0.9;
        statusEl.setAttribute('data-ok', 'true');
        statusEl.replaceChildren(
          icon('check'),
          h('div', null, h('strong', null, tight ? `Fits, but tight: ${fmt.int(plan.free)} tokens to spare` : `Fits: ${fmt.int(plan.free)} tokens to spare`), h('span', null, `${fmt.int(plan.total)} of ${fmt.int(vals.windowSize)} tokens used (${fmt.pct(used)}). Input ${fmt.int(plan.inputTokens)} + reply room ${fmt.int(plan.outputTokens)}.${tight ? ' One longer message could push it over.' : ''}`))
        );
      } else {
        const inputOnlyFits = plan.inputTokens <= vals.windowSize;
        statusEl.setAttribute('data-ok', 'false');
        statusEl.replaceChildren(
          icon('x'),
          h(
            'div',
            null,
            h('strong', null, `Over the window by ${fmt.int(plan.over)} tokens`),
            h('span', null, `${fmt.int(plan.total)} needed, ${fmt.int(vals.windowSize)} available. Many chat APIs would reject this request. ${inputOnlyFits ? 'The prompt alone fits, but the room reserved for the reply pushes it over.' : ''} Biggest consumer: ${biggest.label.toLowerCase()} (${fmt.int(biggest.tokens)}). Trim at least ${fmt.int(plan.over)} tokens from it or from another part.`)
          )
        );
      }

      // cost (worst case: the reply uses the whole reserve)
      const cost = C.requestCost(plan.inputTokens, plan.outputTokens, price.inP, price.outP);
      costOut.replaceChildren(
        h('div', { class: 'stat' }, h('div', { class: 'stat__label' }, 'Cost per request (worst case)'), h('div', { class: 'stat__value' }, fmt.usd(cost)), h('div', { class: 'stat__note' }, 'reply uses all reserved tokens')),
        h('div', { class: 'stat' }, h('div', { class: 'stat__label' }, 'Per day'), h('div', { class: 'stat__value' }, fmt.usd(cost * price.perDay, 2)), h('div', { class: 'stat__note' }, fmt.int(price.perDay) + ' requests')),
        h('div', { class: 'stat' }, h('div', { class: 'stat__label' }, 'Per 30 days'), h('div', { class: 'stat__value' }, fmt.usd(cost * price.perDay * 30, 2)), h('div', { class: 'stat__note' }, plan.fits ? 'if every request fits' : 'requests this big would fail'))
      );

      tv.setRows(plan.parts.map((pt) => [pt.label, fmt.int(pt.tokens), fmt.pct(pt.tokens / vals.windowSize)]).concat([['Free space', fmt.int(plan.free), fmt.pct(plan.free / vals.windowSize)]]));
    }

    // ---- layout ---------------------------------------------------------------
    const concept = h(
      'article',
      { class: 'card' },
      h('h2', null, 'The context window'),
      p('The **context window** is the most tokens a model can handle in **one request**. Your instructions, the conversation so far, documents, your new message **and the reply it is about to write** must all fit. The app resends the history every turn, so old turns keep costing space and money.'),
      callout(
        'warn',
        rich('**Analogy, and where it stops.** Think of a fixed-size desk. But the reply needs room on it too, and models use long contexts unevenly: [Liu et al. (2023)](https://arxiv.org/abs/2307.03172) found the middle is often used less well than the start or end.')
      )
    );

    const labEl = lab(
      { id: 'budget', badge: 'Lab 3', title: 'Context budget planner', sub: 'Pure arithmetic, no model' },
      presetBtns,
      sizeBtns,
      bar.el,
      legendEl,
      statusEl,
      h('div', { class: 'budget-grid' }, winField.el, fields.system.el, fields.history.el, fields.docs.el, fields.user.el, fields.output.el),
      tv.el,
      h('h3', { class: 'panel__title', style: { margin: 'var(--sp-4) 0 0' } }, 'What would it cost?'),
      h('div', { class: 'budget-grid' }, inField.el, outField.el, dayField.el),
      costOut,
      p('Prices are **illustrative**. The calculation is: input tokens × input price + output tokens × output price.', 'muted small')
    );

    const tryIt = h(
      'article',
      { class: 'card' },
      h('h2', null, 'Things to try'),
      h('ol', { class: 'trythis' }, [
        h('li', null, h('b', null, '1'), h('div', null, rich('Pick **Paste a whole report**. It fails. Find **two ways** to make it fit. Which would you use in a real product?'))),
        h('li', null, h('b', null, '2'), h('div', null, rich('On **Document Q&A**, raise the window to 32K. Did the *problem* go away, or just the *error*? Watch the cost.'))),
      ])
    );

    syncLimits();
    render();
    return h('div', { class: 'stack' }, concept, labEl, TL.ui.survivalGame(ctx), tryIt);
  };
})(typeof window !== 'undefined' ? window : globalThis);
