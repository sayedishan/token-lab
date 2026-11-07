/**
 * Section 9 - Final challenge (6 min)
 *
 * Part A: repair a failing request configuration. It must fit the window AND
 *         satisfy four business requirements (auto-checked).
 * Part B: write trimToFit() in JavaScript. The code runs in a Web Worker
 *         against data-driven tests, with a timeout for infinite loops.
 */
(function (g) {
  'use strict';
  const TL = g.TokenLab;
  TL.sections = TL.sections || {};

  TL.sections.challenge = function render(ctx) {
    const { h, p, rich, icon, fmt } = TL.dom;
    const { callout, lab, numberField, disclosure } = TL.ui;
    const CH = TL.challenge;
    const S = CH.RESCUE;

    // =========================================================================
    // Part A
    // =========================================================================
    const cfg = Object.assign({}, S.start);
    const L = S.limits;
    const f = {
      chunks: numberField({ label: 'Retrieved document chunks', hint: `${fmt.int(S.tokensPerChunk)} tokens each`, value: cfg.chunks, min: L.chunks[0], max: L.chunks[1], sliderMax: L.chunks[1], onChange: (v) => { cfg.chunks = v; renderA(); } }),
      turns: numberField({ label: 'Past turns remembered', hint: `${fmt.int(S.tokensPerTurn)} tokens per turn (user message + reply)`, value: cfg.turns, min: L.turns[0], max: L.turns[1], sliderMax: L.turns[1], onChange: (v) => { cfg.turns = v; renderA(); } }),
      reserve: numberField({ label: 'Tokens reserved for the reply', hint: 'max tokens you allow', value: cfg.reserve, min: L.reserve[0], max: L.reserve[1], sliderMax: L.reserve[1], step: 50, onChange: (v) => { cfg.reserve = v; renderA(); } }),
    };
    const bar = TL.charts.stackedBar({ ariaLabel: 'How the support bot request fills the window' });
    const legendEl = TL.charts.legend([
      { label: 'System prompt', color: 1 },
      { label: 'History', color: 2 },
      { label: 'Documents', color: 3 },
      { label: 'New message', color: 4 },
      { label: 'Reserved reply', color: 5 },
      { label: 'Free space', free: true },
    ]);
    const checks = h('ul', { class: 'checklist', 'aria-label': 'Requirements' });
    const resultA = h('div', { 'aria-live': 'polite' });
    const resetA = h('button', { type: 'button', class: 'btn btn--ghost btn--sm' }, icon('reset'), 'Back to the broken configuration');
    resetA.addEventListener('click', () => {
      Object.assign(cfg, S.start);
      f.chunks.set(cfg.chunks);
      f.turns.set(cfg.turns);
      f.reserve.set(cfg.reserve);
      renderA();
    });

    function renderA() {
      const r = CH.evaluateRescue(cfg);
      bar.update(
        [
          { key: 'system', label: 'System prompt', short: 'System', tokens: S.systemTokens, color: 1 },
          { key: 'history', label: 'Conversation history', short: 'History', tokens: cfg.turns * S.tokensPerTurn, color: 2 },
          { key: 'docs', label: 'Retrieved documents', short: 'Docs', tokens: cfg.chunks * S.tokensPerChunk, color: 3 },
          { key: 'user', label: 'New user message', short: 'You', tokens: S.userTokens, color: 4 },
          { key: 'output', label: 'Reserved for reply', short: 'Reply', tokens: cfg.reserve, color: 5 },
        ],
        S.windowSize
      );
      checks.replaceChildren(
        ...r.checks.map((c) => h('li', { 'data-pass': String(c.pass) }, icon(c.pass ? 'check' : 'x'), h('span', null, c.label), h('span', { class: 'detail' }, c.detail)))
      );
      const passN = r.checks.filter((c) => c.pass).length;
      if (r.allPass) {
        TL.store.setChallenge('rescue', true);
        resultA.replaceChildren(callout('ok', rich(`**Rescued.** All ${r.checks.length} requirements pass at ${fmt.usd(r.cost)} per request. Notice the trade-off you made: the window limit was not the only constraint, and the cheapest fix for one requirement can break another.`)));
      } else {
        resultA.replaceChildren(h('p', { class: 'small muted', style: { margin: 0 } }, `${passN} of ${r.checks.length} requirements met. The cost uses input tokens at $${S.priceInPerM.toFixed(2)} per million and a typical ${S.expectedReplyTokens}-token reply at $${S.priceOutPerM.toFixed(2)} per million (illustrative prices).`));
      }
    }

    renderA();
    const partA = lab(
      { id: 'rescue', badge: 'Part A', title: 'Rescue the support bot', sub: 'Required · about 3 min' },
      p(`A support bot keeps failing with “context too long”. Its window is **${fmt.int(S.windowSize)} tokens**. Change the three settings until **all five** requirements are met. There is more than one valid answer.`),
      bar.el,
      legendEl,
      h('div', { class: 'budget-grid' }, f.chunks.el, f.turns.el, f.reserve.el),
      checks,
      resultA,
      h('div', null, resetA)
    );

    // =========================================================================
    // Part B
    // =========================================================================
    const editor = h('textarea', { class: 'editor', id: 'code-editor', 'aria-label': 'JavaScript editor for the trimToFit function', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', wrap: 'off' });
    editor.value = CH.TRIM_STARTER;
    let trap = true; // Tab inserts spaces until Esc is pressed
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        trap = false;
        return;
      }
      if (e.key === 'Tab' && trap && !e.shiftKey) {
        e.preventDefault();
        const { selectionStart: s0, selectionEnd: s1, value } = editor;
        editor.value = value.slice(0, s0) + '  ' + value.slice(s1);
        editor.selectionStart = editor.selectionEnd = s0 + 2;
      }
    });
    editor.addEventListener('focus', () => (trap = true));

    const runBtn = h('button', { type: 'button', class: 'btn btn--primary' }, icon('play'), 'Run tests');
    const hintBtn = h('button', { type: 'button', class: 'btn' }, 'Give me a hint');
    const resetB = h('button', { type: 'button', class: 'btn btn--ghost' }, icon('reset'), 'Reset to starter code');
    const out = h('div', { class: 'stack', 'aria-live': 'polite' });
    let lastResults = null;
    let showHints = false;
    let ran = false;

    function renderResults() {
      if (!lastResults) return;
      const res = lastResults;
      if (res.timedOut) {
        out.replaceChildren(callout('bad', rich('**Your code took longer than 2 seconds and was stopped.** That usually means an infinite loop: check that every pass through your `while` loop makes progress (for example by removing a message).')));
        return;
      }
      if (res.fatal) {
        out.replaceChildren(callout('bad', rich('**Your code could not run.** ' + res.fatal.replace(/`/g, ''))));
        return;
      }
      const passN = res.results.filter((r) => r.pass).length;
      const total = res.results.length;
      const list = h(
        'ul',
        { class: 'tests' },
        res.results.map((r) =>
          h(
            'li',
            { class: 'test', 'data-pass': String(r.pass) },
            icon(r.pass ? 'check' : 'x'),
            h('div', null, h('div', { class: 'test__name' }, r.name), h('div', { class: 'test__detail' }, r.detail), !r.pass && showHints && r.hint ? h('div', { class: 'test__hint' }, r.hint) : null)
          )
        )
      );
      const kids = [h('p', { style: { margin: 0, fontWeight: 650 } }, `${passN} of ${total} tests passing`), list];
      if (passN === total) {
        TL.store.setChallenge('code', true);
        kids.push(callout('ok', rich('**All tests pass.** Compare with the reference solution below: it makes the same three decisions (copy, protect, drop oldest first). Passing these tests means your function meets *this spec*, not that it is the best memory policy. A smarter one might pin facts, as in Lab 4.')));
      }
      if (res.sandboxed === false) kids.push(callout('warn', 'Web Workers were unavailable, so your code ran on the main page without timeout protection.'));
      out.replaceChildren(...kids);
    }

    runBtn.addEventListener('click', async () => {
      runBtn.disabled = true;
      runBtn.replaceChildren(icon('clock'), 'Running…');
      lastResults = await TL.codeRunner.run(editor.value, CH.TRIM_TESTS, 2000);
      ran = true;
      renderResults();
      runBtn.disabled = false;
      runBtn.replaceChildren(icon('play'), 'Run tests');
    });
    hintBtn.addEventListener('click', () => {
      showHints = true;
      if (!lastResults) {
        out.replaceChildren(callout('info', 'Run the tests first. Hints are attached to the tests that fail.'));
        return;
      }
      renderResults();
    });
    resetB.addEventListener('click', () => {
      editor.value = CH.TRIM_STARTER;
      lastResults = null;
      showHints = false;
      out.replaceChildren();
    });

    const solution = disclosure('Show the reference solution (try on your own first)', h('pre', { class: 'codeblock', tabindex: '0' }, CH.TRIM_SOLUTION), p('Why it works: it **copies** the array so the caller’s data is untouched; it **loops until the total fits**; each time it removes the **oldest message that is allowed to go** (not a system message, not the latest one); and it **stops** if nothing droppable is left instead of looping forever.', 'small'));

    const partB = lab(
      { id: 'code', badge: 'Part B', title: 'Write trimToFit()', sub: 'Recommended · about 4 min · JavaScript' },
      callout('info', rich('**Optional if you do not code yet:** skip to the reference solution at the bottom and read it line by line. Your code runs in a sandboxed Web Worker in your browser. Nothing is uploaded.')),
      p('Complete the function so it **keeps system messages and the newest message, and drops the oldest others first** until the conversation fits. Six automatic tests check your work.'),
      h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'code-editor' }, 'Your code'), editor, h('div', { class: 'field__hint' }, 'Tab inserts two spaces. Press Esc, then Tab, to move focus out of the editor.')),
      h('div', { class: 'row' }, runBtn, hintBtn, resetB),
      out,
      solution
    );

    return h(
      'div',
      { class: 'stack' },
      callout('info', rich('Part A is the budget calculation from Lab 3. Part B is the memory strategy from Lab 4, written as real code.')),
      partA,
      partB
    );
  };
})(typeof window !== 'undefined' ? window : globalThis);
