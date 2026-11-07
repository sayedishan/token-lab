/**
 * Section 3 - Lab 1: Tokenization visualizer (Simulation 1, 6 min)
 *
 * What students do: type or pick text, switch between three ways of cutting it
 * (characters / words / toy subwords), click any token to inspect it, colour
 * tokens by type, and compare against RECORDED output of two real production
 * tokenizers. The toy tokenizer is the real BPE algorithm at tiny scale; it is
 * NOT any commercial model's tokenizer, and real token IDs are never invented
 * (real tokenizers are shown only from the recordings).
 */
(function (g) {
  'use strict';
  const TL = g.TokenLab;
  TL.sections = TL.sections || {};

  TL.sections['lab-1'] = function render(ctx) {
    const { h, p, rich, icon, fmt, debounce } = TL.dom;
    const { callout, lab, segmented, statTile, tableView } = TL.ui;
    const bpe = TL.bpe;
    const modes = TL.modes;
    const R = TL.realTokens;
    const store = TL.store;
    const MAX_CHARS = 600;
    const ENC = [
      ['cl100k_base', 'cl100k_base (older)'],
      ['o200k_base', 'o200k_base (newer)'],
    ];
    const sample = (id) => R.samples.find((s) => s.id === id);
    const t = (id, enc) => sample(id).results[enc].count;

    const state = { text: sample('plain').text, mode: 'subword', ids: false, color: 'position', realEnc: 'cl100k_base', sel: null };

    const cutters = { chars: modes.chars, words: modes.words, subword: (x) => TL.toy.encode(x) };
    const MODE_NOTE = {
      chars: 'Every character is a token. IDs shown are Unicode code points. Nothing is ever unknown, but sequences get very long.',
      words: 'Each word and punctuation mark is a token. IDs are "order first seen": a word list needs an entry for every distinct word.',
      subword: `Toy BPE vocabulary (trained on ${TL.toy.info().corpusLabel} of text, ${TL.toy.info().merges} merges). The real algorithm at a tiny scale, not any commercial model’s tokenizer. Characters it never saw, like other scripts and emoji, fall back to raw bytes.`,
    };

    // ---- what to notice, per experiment (numbers come from the recordings) -----------------
    const NOTES = {
      plain: () => `The real tokenizers cut this into ${t('plain', 'cl100k_base')} tokens: “Token” + “ization” (a long word becomes two pieces), then one piece per short common word, and the full stop on its own. The toy needs more because it has seen far less text.`,
      rare: () => `A very long word becomes ${t('rare', 'cl100k_base')} real pieces. Rare words are built from known subwords instead of failing.`,
      typos: () => `Typos cost tokens: ${t('typos', 'cl100k_base')} real tokens (cl100k) against ${t('clean', 'cl100k_base')} for the clean sentence, because a misspelling is not in the vocabulary and splits into smaller pieces.`,
      clean: () => `The correct spelling is the baseline: ${t('clean', 'cl100k_base')} real tokens. Now try the typo version and compare.`,
      numbers: () => 'Both real tokenizers cut 1234567890 into groups of up to three digits (123 | 456 | 789 | 0), and the date splits at every dash. Colour by type to see numbers and punctuation.',
      code: () => 'Spaces and line breaks are tokens too. In the recordings, four spaces of indentation became a three-space piece plus a space glued to the front of “ return”. Whitespace costs tokens.',
      emoji: () => 'Emoji are not in the toy vocabulary, so they become raw bytes. The real tokenizers also fall back to bytes for them (the dashed pieces).',
      en: () => `The English baseline: ${t('en', 'cl100k_base')} tokens on both real tokenizers.`,
      hi: () => `Hindi: ${t('hi', 'cl100k_base')} tokens on the older real tokenizer (much of it raw bytes) but ${t('hi', 'o200k_base')} on the newer one. The toy has never seen Devanagari, so it needs ${TL.toy.count(sample('hi').text)}: one token per byte, as the UTF-8 byte tile shows.`,
      ta: () => `Tamil: ${t('ta', 'cl100k_base')} tokens on the older real tokenizer and ${t('ta', 'o200k_base')} on the newer one, against ${t('en', 'cl100k_base')} for the English sentence. The toy falls back to raw bytes.`,
    };

    // ---- elements -----------------------------------------------------------------------
    const textarea = h('textarea', { class: 'textarea', id: 'pg-text', maxlength: MAX_CHARS, rows: 3, 'aria-describedby': 'pg-count', spellcheck: 'false' });
    textarea.value = state.text;
    const counter = h('span', { id: 'pg-count', class: 'field__hint' });

    const presetsEl = h('div', { class: 'presets', role: 'group', 'aria-label': 'Example texts' }, h('span', { class: 'presets__label' }, 'Try:'));
    const presetBtns = R.samples.map((s) => {
      const b = h('button', { type: 'button', class: 'btn btn--chip', 'aria-pressed': 'false' }, s.label);
      b.addEventListener('click', () => {
        state.text = s.text;
        state.sel = null;
        textarea.value = s.text;
        if (s.id === 'typos') store.flag('tok.preset.typos');
        if (s.id === 'clean') store.flag('tok.preset.clean');
        if (s.id === 'hi' || s.id === 'ta') store.flag('tok.lang.other');
        update(true);
      });
      presetsEl.appendChild(b);
      return [s, b];
    });
    const clearBtn = h('button', { type: 'button', class: 'btn btn--chip' }, 'Clear');
    clearBtn.addEventListener('click', () => {
      state.text = '';
      state.sel = null;
      textarea.value = '';
      textarea.focus();
      update(true);
    });
    presetsEl.appendChild(clearBtn);

    const modeSeg = segmented({
      name: 'pg-mode',
      label: 'How to cut the text',
      value: state.mode,
      options: [
        { value: 'chars', label: 'Characters' },
        { value: 'words', label: 'Words' },
        { value: 'subword', label: 'Subwords (toy BPE)' },
      ],
      onChange: (v) => {
        state.mode = v;
        state.sel = null;
        update(true);
      },
    });
    const colorSeg = segmented({
      name: 'pg-color',
      label: 'Colour tokens by',
      value: state.color,
      options: [
        { value: 'position', label: 'Position' },
        { value: 'type', label: 'Type' },
      ],
      onChange: (v) => {
        state.color = v;
        update(true);
      },
    });
    const idsInput = h('input', { type: 'checkbox', id: 'pg-ids' });
    idsInput.addEventListener('change', () => {
      state.ids = idsInput.checked;
      update(true);
    });
    const modeNote = h('p', { class: 'muted small', style: { margin: 0 } });

    const tokBox = h('div', { class: 'toks toks--static', role: 'group', 'aria-label': 'Tokens. Use the arrow keys to move and Enter to inspect one.' });
    const empty = h('p', { class: 'muted', style: { margin: 0 } }, 'Type something above, or pick an example.');
    const box = h('div', { class: 'toks-box' }, tokBox, empty);
    const legend = h('div', { class: 'type-legend', 'aria-label': 'Token types' });
    const inspector = h('div', { class: 'inspector', 'aria-live': 'polite' });
    const notice = h('div', { class: 'notice', 'aria-live': 'polite' });

    const sChars = statTile({ label: 'Characters', value: '0' });
    const sBytes = statTile({ label: 'UTF-8 bytes', value: '0', note: 'what a byte-level tokenizer sees' });
    const sToks = statTile({ label: 'Tokens (this view)', value: '0', tone: 'accent' });
    const sRatio = statTile({ label: 'Characters per token', value: '—' });
    const sRule = statTile({ label: 'Rule of thumb: chars ÷ 4', value: '—', note: 'for English, large tokenizers' });
    const statsEl = h('div', { class: 'stats' }, sChars.el, sBytes.el, sToks.el, sRatio.el, sRule.el);
    const roundtrip = h('p', { class: 'small', style: { margin: 0 }, 'aria-live': 'polite' });
    const compare = h('div', { class: 'compare-grid', role: 'group', 'aria-label': 'Token count under five different tokenizers' });
    const realPanel = h('div', { class: 'panel panel--inset' });

    const cell = (label, value, kind, note) => h('div', { class: 'compare-cell', 'data-kind': kind }, h('div', { class: 'stat__label' }, label), h('div', { class: 'stat__value' }, value), h('div', { class: 'stat__note' }, note || ' '));

    /** Interactive chips (toy view) or plain chips (recorded real tokenizers). */
    function chipEls(tokens, types, interactive) {
      return tokens.map((tk, i) => {
        const disp = bpe.displayToken(tk.token);
        const attrs = { class: 'tok' + (tk.isByte ? ' tok--byte' : '') + (interactive && state.sel === i ? ' tok--sel' : ''), 'data-type': types[i] };
        const kids = [h('span', { class: 'sr-only' }, `token ${i + 1}: `), disp, state.ids ? h('span', { class: 'tok__id' }, String(tk.id)) : null];
        if (!interactive) return h('span', Object.assign({ role: 'listitem' }, attrs), kids);
        return h('button', Object.assign({ type: 'button', 'data-i': String(i), tabindex: i === (state.sel == null ? 0 : state.sel) ? '0' : '-1', 'aria-pressed': String(state.sel === i) }, attrs), kids);
      });
    }

    function describe(tk, type, i, total) {
      const info = modes.TYPE_INFO[type];
      const raw = tk.token.replace(/▁/g, ' ');
      const idNote = state.mode === 'chars' ? 'Unicode code point of the character.' : state.mode === 'words' ? 'Order this word was first seen (a word list needs one entry per distinct word).' : 'Row number in the toy vocabulary. Real tokenizers have their own, different IDs.';
      // A <dl> may only contain <dt>/<dd> groups, so the explanatory note sits beside it, not inside it.
      return h(
        'div',
        null,
        h(
          'dl',
          { class: 'inspector__grid' },
          h('div', null, h('dt', null, 'Token'), h('dd', { class: 'mono' }, bpe.displayToken(tk.token))),
          h('div', null, h('dt', null, 'Type'), h('dd', null, h('span', { class: 'type-dot', 'data-type': type }), info.label)),
          h('div', null, h('dt', null, 'ID'), h('dd', { class: 'mono' }, String(tk.id))),
          h('div', null, h('dt', null, 'Characters'), h('dd', null, String(Array.from(raw).length))),
          h('div', null, h('dt', null, 'UTF-8 bytes'), h('dd', { class: 'mono' }, tk.isByte ? tk.token.slice(1, -1) : modes.utf8Hex(tk.token))),
          h('div', null, h('dt', null, 'Position'), h('dd', null, `${i + 1} of ${total}`))
        ),
        h('p', { class: 'inspector__note' }, h('strong', null, info.label + ': '), info.note, ' ', h('span', { class: 'muted' }, 'ID: ' + idNote))
      );
    }

    let current = { toks: [], types: [] };

    function update(byUser) {
      const text = state.text;
      const chars = Array.from(text).length;
      counter.textContent = `${chars} / ${MAX_CHARS} characters`;
      presetBtns.forEach(([s, b]) => b.setAttribute('aria-pressed', String(s.text === text)));
      modeNote.textContent = MODE_NOTE[state.mode];
      if (byUser) store.flag('tok.mode.' + state.mode);
      if (byUser && /[^\u0000-ɏ\s]/.test(text) && /[\p{L}]/u.test(text)) store.flag('tok.lang.other');

      const toks = cutters[state.mode](text);
      const types = state.mode === 'chars' ? toks.map((tk) => (/\p{N}/u.test(tk.token) ? 'number' : /\s/.test(tk.token) ? 'space' : /[\p{L}\p{M}]/u.test(tk.token) ? 'fragment' : 'punct')) : modes.classify(toks.map((tk) => tk.token));
      current = { toks, types };
      if (state.sel != null && state.sel >= toks.length) state.sel = null;
      tokBox.dataset.color = state.color;
      tokBox.replaceChildren(...chipEls(toks, types, true));
      empty.classList.toggle('hidden', text.length > 0);

      // legend: shown when colouring by type, so colour is never the only cue
      legend.classList.toggle('hidden', state.color !== 'type');
      legend.replaceChildren(...Object.keys(modes.TYPE_INFO).map((k) => h('span', { class: 'type-legend__item' }, h('span', { class: 'type-dot', 'data-type': k }), modes.TYPE_INFO[k].label)));

      // inspector
      if (state.sel != null && toks[state.sel]) inspector.replaceChildren(describe(toks[state.sel], types[state.sel], state.sel, toks.length));
      else inspector.replaceChildren(h('p', { class: 'muted small', style: { margin: 0 } }, text ? 'Click any token to inspect it: its type, ID, characters and UTF-8 bytes.' : ''));

      // what to notice
      const preset = R.samples.find((s) => s.text === text);
      notice.replaceChildren(
        h('strong', null, 'What to notice'),
        h('p', { style: { margin: '4px 0 0' } }, preset ? NOTES[preset.id]() : 'Your own text: compare the toy count with the rule of thumb, and try a preset to see what changes the count.')
      );

      sChars.set(fmt.int(chars));
      sBytes.set(fmt.int(modes.utf8Length(text)));
      sToks.set(fmt.int(toks.length));
      sRatio.set(toks.length ? (chars / toks.length).toFixed(2) : '—');
      sRule.set(chars ? '≈ ' + TL.estimate.estimateByChars(text) : '—');

      if (!text) roundtrip.replaceChildren();
      else if (state.mode === 'words') roundtrip.replaceChildren(h('span', { class: 'num-bad' }, '✗ '), 'Words mode throws away the spaces, so your exact text cannot be rebuilt from these tokens.');
      else {
        const back = state.mode === 'chars' ? toks.map((tk) => tk.token).join('') : bpe.decode(toks);
        roundtrip.replaceChildren(back === text ? h('span', { class: 'rt-ok' }, '✓ Lossless: ') : h('span', { class: 'num-bad' }, '✗ Mismatch: '), back === text ? 'decoding the tokens gives back your exact text.' : 'decoding did not reproduce the text.');
      }

      const match = preset;
      const real = (enc) => (match ? fmt.int(match.results[enc].count) : 'n/a');
      compare.replaceChildren(
        cell('Characters', fmt.int(modes.chars(text).length), 'local'),
        cell('Words', fmt.int(modes.words(text).length), 'local'),
        cell('Toy subwords', fmt.int(TL.toy.count(text)), 'local', `${TL.toy.info().corpusLabel} of training text`),
        cell('Real: cl100k_base', real('cl100k_base'), match ? 'real' : 'na', match ? 'recorded' : 'pick an example'),
        cell('Real: o200k_base', real('o200k_base'), match ? 'real' : 'na', match ? 'recorded' : 'pick an example')
      );

      if (!match) {
        realPanel.replaceChildren(
          h('h3', { class: 'panel__title' }, 'Reality check'),
          p('Real tokenizers have vocabularies of 100,000+ entries (1–2 MB each), too big to ship inside a page. So their output is **recorded** for the example texts. Click an example above to see how a production tokenizer cut it. Real token IDs are never invented here.', 'small')
        );
      } else {
        const encSel = h('select', { class: 'select', 'aria-label': 'Which real tokenizer', style: { maxWidth: '260px' } }, ENC.map(([v, l]) => h('option', { value: v, selected: v === state.realEnc ? true : null }, l)));
        encSel.addEventListener('change', () => {
          state.realEnc = encSel.value;
          update();
        });
        const r = match.results[state.realEnc];
        const realToks = r.pieces.map((piece, i) => ({ token: piece, id: r.ids[i], isByte: /^<0x[0-9A-F]+>$/.test(piece) }));
        const realTypes = modes.classify(r.pieces);
        const hasBytes = realToks.some((x) => x.isByte);
        const realBox = h('div', { class: 'toks toks--static', role: 'list', style: { marginTop: 'var(--sp-3)' } }, chipEls(realToks, realTypes, false));
        realBox.dataset.color = state.color;
        realPanel.replaceChildren(
          h('div', { class: 'row row--between' }, h('h3', { class: 'panel__title', style: { margin: 0 } }, `Reality check: how ${state.realEnc} cut it (${r.count} tokens)`), encSel),
          realBox,
          ...(hasBytes ? [p('Dashed pieces like `<0xE0A4>` are **raw bytes**: this vocabulary has no entry for that character, so it falls back to the bytes of its UTF-8 encoding. A single character can need 3 or more tokens.', 'small')] : []),
          p(`Recorded with ${R.recordedWith} on ${R.recordedOn}. Vocabulary sizes (including special tokens): cl100k_base ${fmt.int(R.encodings.cl100k_base.vocabSizeIncludingSpecial)}, o200k_base ${fmt.int(R.encodings.o200k_base.vocabSizeIncludingSpecial)}.`, 'muted small')
        );
      }
    }

    // ---- interaction on the chips: click / Enter to inspect, arrows to move (roving tabindex) ----
    tokBox.addEventListener('click', (e) => {
      const b = e.target.closest('button.tok');
      if (!b) return;
      state.sel = Number(b.dataset.i);
      store.flag('tok.inspect');
      update();
      const again = tokBox.querySelector(`button[data-i="${state.sel}"]`);
      if (again) again.focus();
    });
    tokBox.addEventListener('keydown', (e) => {
      const b = e.target.closest('button.tok');
      if (!b) return;
      const all = Array.from(tokBox.querySelectorAll('button.tok'));
      let i = all.indexOf(b);
      if (e.key === 'ArrowRight') i = Math.min(all.length - 1, i + 1);
      else if (e.key === 'ArrowLeft') i = Math.max(0, i - 1);
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = all.length - 1;
      else return;
      e.preventDefault();
      all.forEach((x, k) => x.setAttribute('tabindex', k === i ? '0' : '-1'));
      all[i].focus();
    });

    textarea.addEventListener(
      'input',
      debounce(() => {
        state.text = textarea.value;
        state.sel = null;
        update(true);
      }, 60)
    );

    const playground = lab(
      { id: 'pg', badge: 'Simulation 1', title: 'Live tokenization visualizer', sub: 'Runs in your browser' },
      p('**Predict first:** how many tokens will each view give? Then press a preset and read “What to notice”.', 'muted small'),
      presetsEl,
      h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'pg-text' }, 'Your text'), textarea, counter),
      h('div', { class: 'pg-controls' }, modeSeg.el, colorSeg.el, h('label', { class: 'check' }, idsInput, 'Show token IDs')),
      modeNote,
      box,
      legend,
      inspector,
      roundtrip,
      notice,
      statsEl,
      h('h3', { class: 'panel__title', style: { margin: 'var(--sp-4) 0 0' } }, 'The same text, five ways'),
      compare,
      realPanel
    );

    // ---- concept primer -------------------------------------------------------------------
    const primer = h(
      'article',
      { class: 'card' },
      h('h2', null, 'What is a token?'),
      p('A **token** is a piece of text from a fixed list called the **vocabulary**; each entry has an **ID**, its position number. A tokenizer turns text into IDs and back. The model only ever sees the IDs. There are three obvious ways to choose the pieces; modern models use the third.'),
      h(
        'div',
        { class: 'tablewrap' },
        h(
          'table',
          null,
          h('thead', null, h('tr', null, ['Pieces are…', 'Vocabulary size', 'Text becomes…', 'New words and typos'].map((x) => h('th', { scope: 'col' }, x)))),
          h('tbody', null, [
            ['Characters', 'Tiny (hundreds)', 'Very long sequences', 'Handled: just letters'],
            ['Whole words', 'Huge (every word form)', 'Short sequences', 'Break it: unknown word'],
            ['Subwords (LLMs)', 'Medium (about 100,000–200,000 in the recordings below)', 'In between', 'Handled: split into smaller known pieces'],
          ].map((r) => h('tr', null, r.map((c, i) => h(i === 0 ? 'th' : 'td', { scope: i === 0 ? 'row' : null }, c)))))
        )
      ),
      h('p', { class: 'muted small', style: { marginTop: 'var(--sp-3)' } }, 'Subwords win because rare words can be built from smaller pieces, so no input is ever “unknown”.')
    );

    // ---- the language chart ---------------------------------------------------------------
    const langs = [
      ['English', 'en'],
      ['Hindi', 'hi'],
      ['Tamil', 'ta'],
    ];
    const series = [
      { name: 'cl100k_base (older)', color: 1 },
      { name: 'o200k_base (newer)', color: 2 },
    ];
    const chart = TL.charts.hbars({
      groups: langs.map(([label, id]) => ({ label, values: [t(id, 'cl100k_base'), t(id, 'o200k_base')] })),
      series,
      unit: 'tokens',
      ariaLabel: 'Tokens needed for the same sentence in English, Hindi and Tamil on two real tokenizers',
    });
    const tv = tableView(
      'Show as a table',
      ['Language', 'cl100k_base tokens', 'vs English', 'o200k_base tokens', 'vs English'],
      langs.map(([label, id]) => [label + ' — “' + sample(id).text + '”', fmt.int(t(id, 'cl100k_base')), fmt.ratio(t(id, 'cl100k_base') / t('en', 'cl100k_base')), fmt.int(t(id, 'o200k_base')), fmt.ratio(t(id, 'o200k_base') / t('en', 'o200k_base'))])
    );
    const langCard = h(
      'article',
      { class: 'card' },
      h('h2', null, 'Same meaning, different token bill'),
      p('“I enjoy studying machine learning” in three languages, tokenized by two real vocabularies (recorded, not simulated). Fewer tokens means cheaper and faster.', 'muted'),
      TL.charts.legend(series.map((s) => ({ label: s.name, color: s.color }))),
      h('div', { style: { margin: 'var(--sp-4) 0' } }, chart),
      tv.el,
      callout('warn', rich('**One sentence per language: an illustration, not a benchmark.** The translations are my own. For systematic studies see [Petrov et al., NeurIPS 2023](https://arxiv.org/abs/2305.15425) (up to 15× differences) and [Ahia et al., 2023](https://arxiv.org/abs/2305.13707) (API pricing).')),
      callout('info', rich(`**Why:** rare scripts get few vocabulary entries, so words are cut into tiny pieces, down to bytes. The newer o200k_base needed ${t('hi', 'o200k_base')} tokens for Hindi versus ${t('hi', 'cl100k_base')}: better, still above English. Measure on **your** model’s tokenizer.`))
    );

    return h('div', { class: 'stack' }, primer, (update(false), playground), langCard);
  };
})(typeof window !== 'undefined' ? window : globalThis);
