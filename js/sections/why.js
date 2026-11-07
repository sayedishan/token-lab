/**
 * Section 2 - Why tokens matter (2 min)
 * Three real problems with one shared cause, then an interactive five-step
 * journey of a sentence (the lesson's map; labs refer back to its steps).
 */
(function (g) {
  'use strict';
  const TL = g.TokenLab;
  TL.sections = TL.sections || {};

  TL.sections.why = function render(ctx) {
    const { h, p, rich, icon, fmt } = TL.dom;
    const { callout } = TL.ui;
    const R = TL.realTokens;
    const sample = (id) => R.samples.find((s) => s.id === id);

    const problem = (ico, title, body, cause) =>
      h('article', { class: 'card problem' }, h('div', { class: 'problem__ico' }, icon(ico)), h('h3', null, title), p(body), h('div', { class: 'problem__cause' }, h('span', { class: 'tag tag--accent' }, cause)));

    const problems = h(
      'div',
      { class: 'grid-3' },
      problem('coin', 'The surprise invoice', 'A team forecasts cost from word counts, then the bill is far higher. They missed two things: providers bill per token, and in a chat the whole history is sent again on every turn.', 'Labs 1, 3 and 4'),
      problem('clock', 'The forgetful assistant', 'A support bot is great for ten messages, then asks for the order number again. The oldest messages no longer fit in the context window, so the model never sees them.', 'Labs 3 and 4'),
      problem('globe', 'The unequal price tag', `The same sentence in Hindi needed ${sample('hi').results.cl100k_base.count} tokens on one tokenizer versus ${sample('en').results.cl100k_base.count} in English (recorded in Lab 1). Same meaning, bigger bill, slower reply.`, 'Lab 1')
    );

    const idea = callout('info', rich('**The one idea:** models measure input size, output length, price and memory in **tokens**. If you cannot count tokens, you cannot predict what a request will cost, how long it will take, or what the model will forget.'));

    // ---------------------------------------------------------------- journey
    const sentence = 'I enjoy studying machine learning.';
    const encoded = TL.toy.encode(sentence);
    const steps = [
      {
        key: 'Text',
        title: '1 · You write text',
        body: 'Everything starts as ordinary characters. A language model cannot do arithmetic on letters, so the text must be converted into numbers first.',
        demo: () => h('div', { class: 'toks-box' }, h('span', { style: { fontSize: 'var(--fs-lg)' } }, '“' + sentence + '”')),
        lab: null,
      },
      {
        key: 'Tokens',
        title: '2 · A tokenizer cuts it into tokens',
        body: 'The tokenizer splits the text into pieces taken from a fixed vocabulary. Common words are often one piece; rare words are split into several. (Below: this lab’s toy tokenizer.)',
        demo: () => h('div', { class: 'toks-box' }, h('div', { class: 'toks' }, encoded.map((t) => h('span', { class: 'tok' + (t.isByte ? ' tok--byte' : '') }, TL.bpe.displayToken(t.token))))),
        lab: ['lab-1', 'Try it in Lab 1'],
      },
      {
        key: 'IDs',
        title: '3 · Each token becomes a number (its ID)',
        body: 'Every vocabulary entry has a position number. The model never sees the letters, only this list of IDs. Different tokenizers use different vocabularies, so the same text gets different IDs.',
        demo: () => h('div', { class: 'toks-box' }, h('div', { class: 'toks' }, encoded.map((t) => h('span', { class: 'tok' + (t.isByte ? ' tok--byte' : '') }, TL.bpe.displayToken(t.token), h('span', { class: 'tok__id' }, String(t.id)))))),
        lab: ['lab-2', 'See how the vocabulary is built (Lab 2)'],
      },
      {
        key: 'Window',
        title: '4 · The IDs are packed into the context window',
        body: 'Your tokens share one fixed-size space with the system prompt, the chat history, any documents you attach, and room for the reply. If the total is too big, the request is rejected or something gets cut.',
        demo: () => {
          const parts = [
            ['System prompt', 14, 1],
            ['History', 38, 2],
            ['Documents', 24, 3],
            ['Your message', 6, 4],
            ['Reply', 10, 5],
            ['Free', 8, 0],
          ];
          return h(
            'div',
            null,
            h(
              'div',
              { class: 'miniwindow', role: 'img', 'aria-label': 'Illustration of a context window shared by five parts' },
              parts.map(([label, w, c]) => h('div', { style: { width: w + '%', background: c ? `var(--s${c})` : 'var(--track)' }, title: label }, w >= 14 ? label : ''))
            ),
            h('p', { class: 'muted small', style: { margin: 'var(--sp-2) 0 0' } }, 'Illustrative proportions, not real measurements.')
          );
        },
        lab: ['lab-3', 'Budget a real request in Lab 3'],
      },
      {
        key: 'Model',
        title: '5 · The model predicts the next token, over and over',
        body: 'Given everything in the window, the model picks one next token, appends it, and repeats until the reply is finished. The reply tokens are then converted back to text. Reply tokens also use window space and cost money.',
        demo: () =>
          h(
            'div',
            { class: 'row', 'aria-label': 'Loop: context, then next token, then append, then repeat' },
            ['context so far', 'next token', 'append', 'repeat'].map((t, i) => h('span', { class: 'row' }, h('span', { class: 'tok tok--sm' }, t), i < 3 ? icon('right', { width: 16, height: 16 }) : null))
          ),
        lab: ['lab-4', 'See what gets forgotten in Lab 4'],
      },
    ];

    let active = 0;
    const nodes = h('ol', { class: 'journey__nodes', 'aria-label': 'Journey steps' });
    const detail = h('div', { class: 'card journey__detail', 'aria-live': 'polite' });
    const buttons = steps.map((st, i) => {
      // Accessible name = "Step 1 Text": it CONTAINS the visible text ("1" + "Text"), as WCAG 2.5.3 (label in name) requires.
      const b = h('button', { type: 'button', class: 'journey__node' }, h('span', { class: 'sr-only' }, 'Step '), h('span', { class: 'journey__dot' }, String(i + 1)), h('span', { class: 'lbl' }, st.key));
      b.addEventListener('click', () => select(i));
      nodes.appendChild(h('li', null, b));
      return b;
    });
    function select(i) {
      active = i;
      buttons.forEach((b, k) => (k === i ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current')));
      const st = steps[i];
      detail.replaceChildren(h('h3', null, st.title), p(st.body), st.demo());
      if (st.lab) {
        const go = h('button', { type: 'button', class: 'btn btn--sm', style: { marginTop: 'var(--sp-3)' } }, st.lab[1], icon('right'));
        go.addEventListener('click', () => ctx.go(st.lab[0]));
        detail.appendChild(go);
      }
    }
    const prev = h('button', { type: 'button', class: 'btn btn--sm' }, icon('left'), 'Previous step');
    const next = h('button', { type: 'button', class: 'btn btn--sm btn--primary' }, 'Next step', icon('right'));
    prev.addEventListener('click', () => select(Math.max(0, active - 1)));
    next.addEventListener('click', () => select(Math.min(steps.length - 1, active + 1)));
    select(0);

    const journey = h('section', { 'aria-labelledby': 'journey-h' }, h('h2', { id: 'journey-h' }, 'The journey of a sentence'), p('Click each step. This map comes back in every lab.', 'muted'), nodes, detail, h('div', { class: 'row', style: { marginTop: 'var(--sp-3)' } }, prev, next));

    return h('div', { class: 'stack' }, h('h2', null, 'Three problems, one cause'), problems, idea, journey);
  };
})(typeof window !== 'undefined' ? window : globalThis);
