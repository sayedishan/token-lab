/**
 * Section 1 - Start here (2 min)
 * Objectives, prerequisites, the honesty box (real vs simplified), and a
 * prediction that surfaces the "one word = one token" misconception early.
 */
(function (g) {
  'use strict';
  const TL = g.TokenLab;
  TL.sections = TL.sections || {};

  TL.sections.start = function render(ctx) {
    const { h, p, rich, icon } = TL.dom;
    const { callout } = TL.ui;
    const L = TL.lesson;
    const R = TL.realTokens;

    // The hero line, cut by the lab's own toy tokenizer (live, not a mock-up).
    const heroLine = "Your AI doesn't read words. It reads tokens.";
    const chips = h(
      'div',
      { class: 'hero__chips toks', role: 'img', 'aria-label': 'The title sentence split into tokens by the toy tokenizer' },
      TL.toy.encode(heroLine).map((t) => h('span', { class: 'tok' + (t.isByte ? ' tok--byte' : '') }, TL.bpe.displayToken(t.token)))
    );

    const hero = h(
      'section',
      { class: 'hero' },
      h(
        'div',
        { class: 'hero__meta' },
        h('span', { class: 'tag tag--accent' }, icon('flask'), 'Interactive lesson'),
        h('span', { class: 'tag' }, icon('clock'), L.totalMinutes() + ' minutes'),
        h('span', { class: 'tag' }, 'Works offline')
      ),
      h('h1', { tabindex: '-1', id: 'section-title' }, heroLine),
      chips,
      p('A hands-on lesson on **tokenization and context windows**: how models turn text into numbers, and why every request has a size limit.', 'lead'),
      h(
        'div',
        { class: 'row' },
        (() => {
          const b = h('button', { type: 'button', class: 'btn btn--primary' }, 'Begin the lesson', icon('right'));
          b.addEventListener('click', () => ctx.go('why'));
          return b;
        })(),
        h('span', { class: 'muted small' }, 'Facilitating? Switch on ', h('strong', null, 'Instructor view'), ' (top bar).')
      )
    );

    const objectives = h(
      'article',
      { class: 'card' },
      h('h2', { style: { fontSize: 'var(--fs-xl)' } }, 'By the end you will be able to'),
      h(
        'ol',
        { class: 'objectives' },
        [
          ['Explain', 'what a token is and why models read tokens, not words.'],
          ['Predict', 'how typos, numbers, code and other scripts change the count.'],
          ['Run', 'Byte-Pair Encoding and describe how a vocabulary is learned.'],
          ['Calculate', 'whether a request fits a context window.'],
          ['Decide', 'what an assistant should remember, and what it must never store.'],
          ['Apply', 'it in two games and a five-level mastery challenge.'],
        ].map(([verb, rest]) => h('li', null, h('span', null, h('b', null, verb + ' '), rest)))
      )
    );

    const before = h(
      'article',
      { class: 'card' },
      h('h2', { style: { fontSize: 'var(--fs-xl)' } }, 'Before you begin'),
      h('ul', null, [
        h('li', null, 'You have used a chatbot, and basic arithmetic is enough.'),
        h('li', null, 'Nothing to install: it runs offline in any modern browser.'),
      ]),
    );

    const plan = h(
      'article',
      { class: 'card' },
      h('h2', { style: { fontSize: 'var(--fs-xl)' } }, 'Your 45-minute plan'),
      h(
        'ul',
        { class: 'timeline' },
        L.required().map((s, i) => h('li', null, h('span', null, `${i + 1}. ${s.title}`), h('span', null, s.minutes + ' min'))).concat([
          h('li', null, h('span', null, 'Total (a buffer inside the 45-minute limit)'), h('span', null, L.totalMinutes() + ' min')),
        ]),
        L.SECTIONS.filter((s) => s.optional).map((s) => h('li', null, h('span', null, s.title), h('span', null, 'optional, not counted')))
      )
    );

    const honest = h(
      'section',
      { class: 'honest', 'aria-label': 'What is real and what is simplified' },
      h(
        'div',
        { class: 'honest__col honest__col--real' },
        h('h3', null, icon('shield'), 'Real in this lesson'),
        h('ul', null, [
          h('li', null, rich('The **Byte-Pair Encoding algorithm**: trained and run live in your browser.')),
          h('li', null, 'Context-window and cost arithmetic.'),
          h('li', null, rich(`Real tokenizer outputs for \`cl100k_base\` and \`o200k_base\`, recorded with ${R.recordedWith} on ${R.recordedOn}.`)),
        ])
      ),
      h(
        'div',
        { class: 'honest__col honest__col--sim' },
        h('h3', null, icon('alert'), 'Simplified on purpose'),
        h('ul', null, [
          h('li', null, `The toy tokenizer learned from only ${TL.toy.info().corpusLabel} of text, so its counts differ from any commercial model’s.`),
          h('li', null, rich('The two games are **deterministic rules, not language models**.')),
          h('li', null, 'Prices are made-up, illustrative numbers.'),
        ])
      )
    );

    // Warm-up prediction (not scored).
    const predWrap = h('div', { class: 'stack' });
    const q = TL.quiz.question(TL.quizzes.PREDICTION, {
      number: 1,
      label: 'Warm-up prediction',
      onDone: ({ firstTry }) => {
        TL.store.set({ prediction: firstTry ? 'first' : 'later' });
        TL.store.award('predict', 10);
        const go = h('button', { type: 'button', class: 'btn btn--primary' }, 'Continue to the journey', icon('right'));
        go.addEventListener('click', () => ctx.go('why'));
        predWrap.appendChild(callout('info', rich('Keep that number in mind. **Lab 1** shows exactly where those 11 pieces come from, and why some words need more than one.')));
        predWrap.appendChild(h('div', null, go));
      },
    });
    predWrap.prepend(q.el);

    return h('div', { class: 'stack' }, hero, TL.ui.gamify.dashboard(ctx.go), h('div', { class: 'grid-2' }, h('div', { class: 'stack' }, objectives, before), plan), honest, h('h2', null, 'Warm-up'), predWrap);
  };
})(typeof window !== 'undefined' ? window : globalThis);
