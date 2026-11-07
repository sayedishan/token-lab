/**
 * Section 8 - Where this shows up (2 min)
 * A map from real products to the token decisions they depend on. The "pick the fix"
 * scenarios now live in Token Master (level 5) and the optional practice bank.
 */
(function (g) {
  'use strict';
  const TL = g.TokenLab;
  TL.sections = TL.sections || {};

  TL.sections['real-world'] = function render(ctx) {
    const { h, p, rich, icon } = TL.dom;
    const { callout } = TL.ui;

    const rows = [
      ['Support chatbot', 'Turns to keep; facts to pin.', 'Tokens per request; repeated questions.'],
      ['Document Q&A (RAG)', 'Chunk size; how many to retrieve.', 'Retrieved tokens versus the window.'],
      ['Multilingual product', 'Which tokenizer; pricing by language.', 'Tokens for equal messages per language.'],
      ['Code assistant', 'Which files to include; long names cost tokens.', 'Tokens per file.'],
      ['Batch summariser', 'How to split a long document.', 'Chunk size in tokens.'],
      ['Cost dashboard', 'Forecasting and capping spend.', 'Input versus output tokens per feature.'],
    ];

    return h(
      'div',
      { class: 'stack' },
      p('Each simulation you used is a decision real teams make.', 'muted'),
      h(
        'div',
        { class: 'tablewrap' },
        h(
          'table',
          null,
          h('thead', null, h('tr', null, ['Product', 'Decision it informs', 'What to measure'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', null, rows.map((r) => h('tr', null, r.map((c, i) => h(i === 0 ? 'th' : 'td', { scope: i === 0 ? 'row' : null }, c)))))
        )
      ),
      callout('info', rich('**The connecting thread:** chunking, retrieval and agents all work *inside* a token budget. Policies differ between models, so check yours. The “pick the fix” scenarios are in **Token Master**, levels 3 to 5.'))
    );
  };
})(typeof window !== 'undefined' ? window : globalThis);
