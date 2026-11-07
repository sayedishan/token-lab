/**
 * Section 7 - Lab 4: A chat that forgets (6 min)
 *
 * Part A (real arithmetic): how many tokens a chat sends over time if it
 *   resends everything vs keeps a window.
 * Part B (SIMULATION of context mechanics, not an LLM): which facts survive
 *   under each memory strategy and window size.
 */
(function (g) {
  'use strict';
  const TL = g.TokenLab;
  TL.sections = TL.sections || {};

  TL.sections['lab-4'] = function render(ctx) {
    const { h, p, rich, icon, fmt } = TL.dom;
    const { callout, lab, segmented, numberField, tableView } = TL.ui;
    const C = TL.context;
    const M = TL.memory;

    // =========================================================================
    // Part A - the cost of remembering everything
    // =========================================================================
    const a = { turns: 30, user: 60, reply: 150, system: 400, keep: 6, windowSize: 8000 };
    const fA = {
      turns: numberField({ label: 'Turns in the conversation', hint: 'One turn = one user message + one reply.', value: a.turns, min: 1, max: 100, sliderMax: 100, onChange: (v) => { a.turns = v; renderA(); } }),
      user: numberField({ label: 'Tokens per user message', value: a.user, min: 1, max: 5000, sliderMax: 500, onChange: (v) => { a.user = v; renderA(); } }),
      reply: numberField({ label: 'Tokens per reply', value: a.reply, min: 1, max: 5000, sliderMax: 1000, onChange: (v) => { a.reply = v; renderA(); } }),
      system: numberField({ label: 'System prompt tokens', value: a.system, min: 0, max: 20000, sliderMax: 2000, onChange: (v) => { a.system = v; renderA(); } }),
      keep: numberField({ label: 'Window strategy: keep last N exchanges', value: a.keep, min: 0, max: 100, sliderMax: 30, onChange: (v) => { a.keep = v; renderA(); } }),
      windowSize: numberField({ label: 'Context window (tokens)', value: a.windowSize, min: 100, max: 1000000, sliderMax: 200000, step: 500, onChange: (v) => { a.windowSize = v; renderA(); } }),
    };
    const chart = TL.charts.lineChart({ xName: 'Turn', yName: 'Total input tokens sent so far', height: 300 });
    const aStats = h('div', { class: 'stats' });
    const aNote = h('div', { 'aria-live': 'polite' });
    const aTable = tableView('Show as a table', ['Turn', 'Resend everything: tokens in this request', 'Resend everything: total so far', 'Last N: tokens in this request', 'Last N: total so far'], [], 1);
    const aSeries = [
      { name: 'Resend everything', color: 1 },
      { name: 'Keep last N exchanges', color: 2 },
    ];

    function renderA() {
      const base = { turns: a.turns, system: a.system, userTokens: a.user, assistantTokens: a.reply };
      const full = C.conversationGrowth(Object.assign({ keepTurns: Infinity }, base));
      const win = C.conversationGrowth(Object.assign({ keepTurns: a.keep }, base));
      const last = a.turns - 1;
      chart.setData(
        [
          { name: 'Resend everything', color: 1, endLabel: 'All turns', points: full.map((x) => ({ x: x.turn, y: x.cumulative })) },
          { name: `Keep last ${a.keep}`, color: 2, endLabel: `Last ${a.keep}`, points: win.map((x) => ({ x: x.turn, y: x.cumulative })) },
        ],
        `Line chart. After ${a.turns} turns, resending everything has sent ${fmt.int(full[last].cumulative)} input tokens in total; keeping the last ${a.keep} exchanges has sent ${fmt.int(win[last].cumulative)}.`
      );
      const breaks = (rows) => {
        const hit = rows.find((r) => r.input + a.reply > a.windowSize);
        return hit ? hit.turn : null;
      };
      const bFull = breaks(full);
      const bWin = breaks(win);
      aStats.replaceChildren(
        h('div', { class: 'stat' }, h('div', { class: 'stat__label' }, `Request size at turn ${a.turns}: resend all`), h('div', { class: 'stat__value' }, fmt.int(full[last].input)), h('div', { class: 'stat__note' }, 'input tokens, one request')),
        h('div', { class: 'stat' }, h('div', { class: 'stat__label' }, `Request size at turn ${a.turns}: last ${a.keep}`), h('div', { class: 'stat__value' }, fmt.int(win[last].input)), h('div', { class: 'stat__note' }, 'input tokens, one request')),
        h('div', { class: 'stat stat--accent' }, h('div', { class: 'stat__label' }, 'Total sent: resend all vs last N'), h('div', { class: 'stat__value' }, fmt.ratio(full[last].cumulative / win[last].cumulative)), h('div', { class: 'stat__note' }, `${fmt.int(full[last].cumulative)} vs ${fmt.int(win[last].cumulative)}`))
      );
      aNote.replaceChildren(
        callout(
          bFull && !bWin ? 'warn' : bFull ? 'warn' : 'ok',
          rich(
            bFull
              ? `**Resend-everything hits the ${fmt.int(a.windowSize)}-token window at turn ${bFull}** (the request plus room for a ${fmt.int(a.reply)}-token reply no longer fits). ${bWin ? `Keeping the last ${a.keep} exchanges also hits it, at turn ${bWin}: pick a smaller N.` : `Keeping the last ${a.keep} exchanges never does: every request stays about ${fmt.int(win[last].input)} tokens.`}`
              : `Within ${a.turns} turns neither strategy reaches the ${fmt.int(a.windowSize)}-token window. Raise the number of turns to see resend-everything break first.`
          )
        )
      );
      aTable.setRows(full.map((r, i) => [String(r.turn), fmt.int(r.input), fmt.int(r.cumulative), fmt.int(win[i].input), fmt.int(win[i].cumulative)]));
    }

    const partA = lab(
      { id: 'growth', badge: 'Lab 4 · Part A', title: 'The cost of remembering everything', sub: 'Real arithmetic' },
      p('A bot that “remembers” resends the old turns every time. **Predict first:** will 30 turns cost about 2×, 5× or 10× more if it resends everything than if it keeps only the last 6 exchanges? Then move the sliders.', 'muted'),
      TL.charts.legend([
        { label: 'Resend everything', color: 1, line: true },
        { label: 'Keep last N exchanges', color: 2, line: true },
      ]),
      chart.el,
      aTable.el,
      aStats,
      aNote,
      h('div', { class: 'budget-grid' }, fA.turns.el, fA.user.el, fA.reply.el, fA.system.el, fA.keep.el, fA.windowSize.el),
      p('Some providers discount repeated prompt prefixes (“prompt caching”). That can lower the **price**, but the tokens still occupy the **context window**, so the break point above does not move.', 'muted small')
    );

    // =========================================================================
    // Part B - the memory-strategy simulator
    // =========================================================================
    const b = { strategy: 'drop-oldest', windowSize: 200, lastN: 2, qIdx: 0 };
    const count = (m) => TL.toy.count(m.content);

    const stratSeg = segmented({
      name: 'mem-strategy',
      label: 'Memory strategy',
      value: b.strategy,
      options: M.STRATEGIES.map((s) => ({ value: s.id, label: s.label })),
      onChange: (v) => {
        b.strategy = v;
        renderB();
      },
    });
    const winF = numberField({ label: 'Context window (toy tokens)', hint: 'The whole conversation is about 400 toy tokens.', value: b.windowSize, min: 20, max: 2000, sliderMax: 450, step: 10, onChange: (v) => { b.windowSize = v; renderB(); } });
    const nF = numberField({ label: 'N: exchanges to keep', hint: 'Plus the new question.', value: b.lastN, min: 0, max: 5, sliderMax: 5, step: 1, onChange: (v) => { b.lastN = v; renderB(); } });
    const qSel = h('select', { class: 'select', id: 'mem-q', 'aria-label': 'Question to ask the assistant' }, M.QUESTIONS.map((q, i) => h('option', { value: i }, q.text)));
    qSel.addEventListener('change', () => {
      b.qIdx = Number(qSel.value);
      renderB();
    });
    const blurb = h('p', { class: 'small muted', style: { margin: 0 } });
    const bar = TL.charts.stackedBar({ ariaLabel: 'What the memory strategy puts into the window' });
    const statusEl = h('p', { class: 'small', style: { margin: 0 }, 'aria-live': 'polite' });
    const msgsEl = h('div', { class: 'msgs' });
    const factsEl = h('div', { class: 'facts' });
    const answerEl = h('div', { 'aria-live': 'polite' });

    function renderB() {
      const q = M.QUESTIONS[b.qIdx];
      const strat = M.STRATEGIES.find((s) => s.id === b.strategy);
      blurb.textContent = strat.blurb;
      nF.el.classList.toggle('hidden', b.strategy !== 'last-turns');

      const c = M.buildContext(b.strategy, { windowSize: b.windowSize, lastN: b.lastN, question: q, count });
      const keptIds = new Set(c.kept.map((m) => m.id));

      // window meter: three groups so the bar shows WHERE the space goes
      const sum = (f) => c.kept.filter(f).reduce((s, m) => s + count(m), 0);
      bar.update(
        [
          { key: 'sys', label: 'System prompt and summary', short: 'System', tokens: sum((m) => m.role === 'system'), color: 1 },
          { key: 'hist', label: 'Earlier conversation kept', short: 'History', tokens: sum((m) => m.role !== 'system' && !m.isQuestion), color: 2 },
          { key: 'q', label: 'New question', short: 'Question', tokens: sum((m) => m.isQuestion), color: 4 },
        ],
        b.windowSize
      );
      statusEl.replaceChildren(
        c.fits ? h('span', { class: 'rt-ok' }, '✓ Fits: ') : h('span', { class: 'num-bad' }, '✗ Over by ' + fmt.int(c.over) + ': '),
        `${fmt.int(c.total)} of ${fmt.int(b.windowSize)} toy tokens used, ${c.kept.length} messages sent, ${c.dropped.length} left out.`
      );

      // message list
      const rows = [M.SYSTEM].concat(b.strategy === 'summary' ? [M.SUMMARY] : [], M.HISTORY, [{ id: 'question', role: 'user', content: q.text, facts: [], isQuestion: true }]);
      msgsEl.replaceChildren(
        ...rows.map((m) => {
          const kept = keptIds.has(m.id);
          const state = m.isSummary ? 'summary' : kept ? 'kept' : 'dropped';
          const prot = b.strategy === 'drop-oldest' && (m.id === 'sys' || m.isQuestion);
          return h(
            'div',
            { class: 'msg', 'data-state': state, 'data-protected': String(prot) },
            h('span', { class: 'msg__role' }, m.isSummary ? 'summary' : m.role),
            h('span', { class: 'msg__text' }, m.content, (m.facts || []).map((f) => h('span', { class: 'msg__fact' }, M.FACTS[f].label))),
            h('span', { class: 'msg__tok' }, count(m) + ' tok')
          );
        })
      );

      // facts scoreboard
      const have = M.factsInContext(c.kept);
      factsEl.replaceChildren(...Object.keys(M.FACTS).map((f) => h('div', { class: 'fact', 'data-have': String(c.fits && have.has(f)) }, icon(c.fits && have.has(f) ? 'check' : 'x'), M.FACTS[f].label + (c.fits && have.has(f) ? ' kept' : ' lost'))));

      // simulated answer
      const ans = M.answer(q, c);
      answerEl.replaceChildren(
        h('div', { class: 'row', style: { alignItems: 'flex-start' } }, h('div', { class: 'bubble', 'data-kind': ans.kind }, h('span', { class: 'bubble__who' }, ans.kind === 'rejected' ? 'API' : 'Simulated assistant (rules, not an LLM)'), ans.text))
      );
    }

    const partB = lab(
      { id: 'memory', badge: 'Deep dive', title: 'A chat that forgets: choose a memory strategy', sub: 'Simulation of context mechanics' },
      callout('warn', rich('**A simulation, not a language model.** Messages are tagged by hand with the facts they contain, and the “assistant” can only report a fact still inside the window. A real model might also guess when information is missing. Counts use the toy tokenizer.')),
      h('div', { class: 'pg-controls' }, stratSeg.el),
      blurb,
      h('div', { class: 'budget-grid' }, winF.el, nF.el),
      bar.el,
      statusEl,
      h('h3', { class: 'panel__title', style: { margin: 'var(--sp-3) 0 0' } }, 'What gets sent to the model'),
      msgsEl,
      h('h3', { class: 'panel__title', style: { margin: 'var(--sp-3) 0 0' } }, 'Which facts are still available?'),
      factsEl,
      h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'mem-q' }, 'Now ask the assistant…'), qSel),
      answerEl
    );

    const tryIt = h(
      'article',
      { class: 'card' },
      h('h2', null, 'Things to try'),
      h('ol', { class: 'trythis' }, [
        h('li', null, h('b', null, '1'), h('div', null, rich('Choose **Keep everything** and slide the window up from 60. At what size does the request stop being rejected?'))),
        h('li', null, h('b', null, '2'), h('div', null, rich('Set the window to about **300** and compare **Drop oldest** with **Summarise old turns**. They remember *different* facts. Which would you rather lose: the name and budget, or the diet and boat warning?'))),
        h('li', null, h('b', null, '3'), h('div', null, rich('Using **Last N exchanges**, find the smallest N that still answers “What do I eat?”. Why is there no N that keeps the name but is cheap?'))),
      ]),
      callout('info', rich('**The design lesson:** under a small window, *no* simple strategy keeps everything, so what survives should be a decision, not an accident. Real systems **pin** key facts (in the system prompt or a small memory store) and keep a bounded recent window.'))
    );

    renderA();
    renderB();
    // Token Lab 2.0: the Memory Manager is the main interactive part. The original four-strategy comparison is
    // kept intact as an optional deep dive (collapsed, and NOT counted in the 45-minute plan).
    const deepDive = h('details', { class: 'disclosure disclosure--deep', id: 'strategy-compare' }, h('summary', null, 'Optional deep dive: compare four automatic memory strategies (about 2 more minutes, not counted)'), h('div', { class: 'disclosure__body' }, partB, tryIt));

    return h('div', { class: 'stack' }, partA, TL.ui.memoryManager(ctx), deepDive);
  };
})(typeof window !== 'undefined' ? window : globalThis);
