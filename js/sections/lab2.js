/**
 * Section 4 - Lab 2: Interactive BPE trainer (Simulation 2, 5 min)
 *
 * What students do: run the REAL Byte-Pair Encoding algorithm on a tiny corpus.
 * Play/pause or step through it (the lab picks the most frequent pair), drag a
 * slider to choose how many merges, or switch on "You choose" and find each pair
 * themselves. After every merge a plain-language explanation shows exact numbers.
 *
 * The animation is only TIMING: highlight the pair, then apply the merge. Every
 * count, merge and number on screen comes from core/bpe.js (deterministic, no randomness).
 */
(function (g) {
  'use strict';
  const TL = g.TokenLab;
  TL.sections = TL.sections || {};

  TL.sections['lab-2'] = function render(ctx) {
    const { h, p, rich, icon, fmt } = TL.dom;
    const { callout, lab, statTile } = TL.ui;
    const bpe = TL.bpe;
    const C = TL.corpus;
    const store = TL.store;
    const D = bpe.displayToken;

    const wf = C.LAB2_WORD_FREQS.map(([w, c]) => [bpe.SPACE_MARK + w, c]);
    const initial = bpe.createState(wf);
    const MAX = bpe.train(wf, { numMerges: 999 }).merges.length; // how many merges exist before no pair repeats
    const reduce = () => !!(g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const SPEEDS = { slow: [1200, 800], normal: [700, 450], fast: [320, 200] }; // [highlight ms, pause ms]

    let history = [initial];
    let challenge = false;
    let wrongAtStep = 0;
    const score = { firstTry: 0, steps: 0 };
    let lastNew = null;
    let explain = null; // describeMerge() result for the latest merge
    let hl = null; // pair being highlighted just before it is merged
    let playing = false;
    let busy = false;
    let speed = 'normal';
    let token = 0; // bumped to cancel any running animation
    let timer = null;
    let feedback = { kind: 'info', text: 'Press Play, or Next step, to glue the most frequent neighbouring pair into one new symbol.' };
    let testWord = 'replaying';

    ctx.onCleanup(() => {
      token++;
      playing = false;
      clearTimeout(timer);
    });

    const cur = () => history[history.length - 1];
    const finished = () => {
      const pairs = bpe.countPairs(cur());
      return pairs.length === 0 || pairs[0].count < 2;
    };
    const wait = (ms) => new Promise((res) => (timer = setTimeout(res, reduce() ? 0 : ms)));

    // ---- elements --------------------------------------------------------------
    const playBtn = h('button', { type: 'button', class: 'btn btn--primary' });
    const stepBtn = h('button', { type: 'button', class: 'btn' }, icon('step'), 'Next step');
    const undoBtn = h('button', { type: 'button', class: 'btn' }, icon('undo'), 'Undo');
    const resetBtn = h('button', { type: 'button', class: 'btn btn--ghost' }, icon('reset'), 'Reset');
    const chInput = h('input', { type: 'checkbox', id: 'bpe-challenge' });
    const chLabel = h('label', { class: 'check' }, chInput, rich('**You choose** the merge (challenge mode)'));
    const slider = h('input', { type: 'range', id: 'bpe-merges', min: '0', max: String(MAX), step: '1', value: '0', 'aria-describedby': 'bpe-merges-out' });
    const sliderOut = h('output', { id: 'bpe-merges-out', for: 'bpe-merges', class: 'mono' }, '0');
    const speedSel = h('select', { class: 'select select--sm', id: 'bpe-speed', 'aria-label': 'Animation speed' }, [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']].map(([v, l]) => h('option', { value: v, selected: v === speed ? true : null }, l)));
    const fb = h('p', { class: 'feedback-line', role: 'status', 'aria-live': 'polite' });
    const explainEl = h('div', { class: 'explain', 'aria-live': 'polite' });
    const wordsEl = h('div', { class: 'bpe-words' });
    const pairsEl = h('div', { class: 'pairs' });
    const logEl = h('ol', { class: 'mergelog', 'aria-label': 'Merges so far', tabindex: '0' });
    const vocabEl = h('div', { class: 'toks toks--static', role: 'list', 'aria-label': 'Vocabulary' });
    const vocabTitle = h('h3', { class: 'panel__title' });
    const sparkHost = h('div');
    const sLen = statTile({ label: 'Corpus length (tokens)', value: '—', tone: 'accent' });
    const sVocab = statTile({ label: 'Vocabulary size', value: '—', note: 'symbols + merges' });
    const sMerges = statTile({ label: 'Merges done', value: '0' });
    const resultHost = h('div');
    const testInput = h('input', { class: 'input', id: 'bpe-test', value: testWord, maxlength: 24, 'aria-label': 'A word to tokenize', style: { maxWidth: '220px' }, autocomplete: 'off', spellcheck: 'false' });
    const beforeOut = h('div', { class: 'toks toks--static', role: 'list', 'aria-label': 'Tokens before training' });
    const afterOut = h('div', { class: 'toks toks--static', role: 'list', 'aria-label': 'Tokens after training' });
    const beforeTitle = h('div', { class: 'ba__title' });
    const afterTitle = h('div', { class: 'ba__title' });
    const testNote = h('p', { class: 'small muted', style: { margin: 0 }, 'aria-live': 'polite' });
    const testBtns = h('div', { class: 'presets' }, h('span', { class: 'presets__label' }, 'Try:'));
    C.LAB2_TEST_WORDS.concat(['replaying']).filter((w, i, a) => a.indexOf(w) === i).forEach((w) => {
      const b = h('button', { type: 'button', class: 'btn btn--chip' }, w);
      b.addEventListener('click', () => {
        testWord = w;
        testInput.value = w;
        renderTest(true);
      });
      testBtns.appendChild(b);
    });

    // ---- actions ----------------------------------------------------------------
    function doMerge(pair, byUser) {
      const before = cur();
      const next = bpe.applyMerge(before, pair.left, pair.right);
      history.push(next);
      lastNew = pair.left + pair.right;
      explain = bpe.describeMerge(before, next);
      if (byUser) {
        score.steps++;
        if (wrongAtStep === 0) {
          score.firstTry++;
          store.count('bpe.manual.ok');
        }
      }
      wrongAtStep = 0;
      feedback = { kind: 'good', text: `${byUser ? 'Correct. ' : ''}Merged ${D(pair.left)} + ${D(pair.right)} → ${D(lastNew)}.` };
      if (finished()) store.flag('bpe.finished');
    }

    /** One animated step: highlight the pair that is about to merge, then merge it. */
    async function stepAnimated() {
      if (finished() || busy) return;
      busy = true;
      const my = token;
      const top = bpe.countPairs(cur())[0];
      hl = { left: top.left, right: top.right };
      renderAll();
      await wait(SPEEDS[speed][0]);
      if (my !== token) {
        busy = false;
        return;
      }
      hl = null;
      doMerge(top, false);
      busy = false;
      renderAll();
    }

    async function play() {
      if (playing || finished()) return;
      playing = true;
      const my = ++token;
      renderControls();
      while (playing && my === token && !finished()) {
        await stepAnimated();
        if (my !== token) return;
        await wait(SPEEDS[speed][1]);
      }
      if (my === token) {
        playing = false;
        renderAll();
      }
    }
    function pause(msg) {
      token++;
      playing = false;
      busy = false;
      hl = null;
      clearTimeout(timer);
      if (msg) feedback = { kind: 'info', text: msg };
    }

    playBtn.addEventListener('click', () => {
      if (playing) {
        pause('Paused. Press Play to continue, or Next step to move one merge at a time.');
        renderAll();
      } else play();
    });
    stepBtn.addEventListener('click', async () => {
      if (playing) pause();
      await stepAnimated();
    });
    undoBtn.addEventListener('click', () => {
      pause();
      if (history.length > 1) {
        history.pop();
        const m = cur().merges;
        lastNew = m.length ? m[m.length - 1].merged : null;
        explain = m.length ? bpe.describeMerge(history[history.length - 2], cur()) : null;
        wrongAtStep = 0;
        feedback = { kind: 'info', text: 'Undid the last merge.' };
      }
      renderAll();
    });
    resetBtn.addEventListener('click', () => {
      pause();
      history = [initial];
      lastNew = null;
      explain = null;
      wrongAtStep = 0;
      score.firstTry = 0;
      score.steps = 0;
      feedback = { kind: 'info', text: 'Back to single characters. Press Play or Next step.' };
      renderAll();
    });
    chInput.addEventListener('change', () => {
      pause();
      challenge = chInput.checked;
      wrongAtStep = 0;
      feedback = challenge ? { kind: 'info', text: 'Challenge on: click the pair you think BPE will merge next (the most frequent one).' } : { kind: 'info', text: 'Challenge off: Play and Next step merge the most frequent pair for you.' };
      renderAll();
    });
    speedSel.addEventListener('change', () => {
      speed = speedSel.value;
    });
    // The slider jumps to ANY number of merges: forward (the most frequent pair each time) or back.
    slider.addEventListener('input', () => {
      pause();
      const n = Number(slider.value);
      const have = cur().merges.length;
      if (n < have) history = history.slice(0, n + 1);
      else {
        while (cur().merges.length < n && !finished()) {
          const before = cur();
          const top = bpe.countPairs(before)[0];
          history.push(bpe.applyMerge(before, top.left, top.right));
        }
        if (finished()) store.flag('bpe.finished');
      }
      const m = cur().merges;
      lastNew = m.length ? m[m.length - 1].merged : null;
      explain = m.length ? bpe.describeMerge(history[history.length - 2], cur()) : null;
      feedback = { kind: 'info', text: `Showing the vocabulary after ${m.length} merge${m.length === 1 ? '' : 's'}.` };
      renderAll();
    });

    // ---- rendering ---------------------------------------------------------------
    function renderWords() {
      wordsEl.replaceChildren(
        ...cur().words.map((w) => {
          const mark = new Set();
          if (hl) {
            const s = w.symbols;
            for (let i = 0; i < s.length - 1; i++) {
              if (s[i] === hl.left && s[i + 1] === hl.right) {
                mark.add(i);
                mark.add(i + 1);
                i++;
              }
            }
          }
          return h(
            'div',
            { class: 'bpe-word' },
            h('div', { class: 'toks toks--static', role: 'list', 'aria-label': w.symbols.join(' ') }, w.symbols.map((s, i) => h('span', { class: 'tok tok--sm' + (mark.has(i) ? ' tok--pair' : '') + (!hl && s === lastNew ? ' tok--new' : ''), role: 'listitem' }, D(s)))),
            h('span', { class: 'count', 'aria-label': w.freq + ' occurrences' }, String(w.freq))
          );
        })
      );
    }

    function renderPairs() {
      const pairs = bpe.countPairs(cur());
      if (!pairs.length) {
        pairsEl.replaceChildren(p('No neighbouring pairs left: every word is a single token.', 'muted small'));
        return;
      }
      const top = pairs[0].count;
      const tied = pairs.filter((x) => x.count === top).length;
      const rows = pairs.slice(0, 6).map((pr) => {
        const isTop = pr.count === top;
        const attrs = { class: 'pair', 'data-top': String(isTop && (!challenge || hl)) };
        const inner = [
          h('span', { class: 'pair__name' }, D(pr.left), h('i', null, '+'), D(pr.right)),
          h('span', { class: 'pair__bar-wrap' }, h('div', { class: 'pair__bar', style: { width: (pr.count / top) * 100 + '%' } })),
          h('span', { class: 'pair__n' }, String(pr.count)),
        ];
        if (!challenge) return h('div', attrs, inner);
        // Accessible name "Merge pair a + y 32" contains the visible text (WCAG 2.5.3); the prefix is screen-reader-only.
        const b = h('button', Object.assign({ type: 'button' }, attrs), h('span', { class: 'sr-only' }, 'Merge pair '), inner);
        if (playing || busy) b.disabled = true;
        b.addEventListener('click', () => {
          if (finished()) return;
          if (pr.count === top) {
            doMerge(pr, true);
          } else {
            wrongAtStep++;
            b.setAttribute('data-wrong', 'true');
            feedback = { kind: 'bad', text: `Not that one: ${D(pr.left)} + ${D(pr.right)} appears ${pr.count} times, but another pair appears ${top} times. BPE always merges the most frequent.` };
            if (wrongAtStep >= 2) {
              const best = pairs[0];
              feedback.text += ` Hint: look at ${D(best.left)} + ${D(best.right)}.`;
            }
          }
          renderAll();
        });
        return b;
      });
      if (tied > 1) rows.push(h('p', { class: 'muted small', style: { margin: '6px 0 0' } }, `${tied} pairs are tied for first. Ties are broken by whichever pair appeared first, and in challenge mode any tied pair is accepted.`));
      pairsEl.replaceChildren(...rows);
    }

    function renderLog() {
      const merges = cur().merges;
      logEl.replaceChildren(...(merges.length ? merges.map((m, i) => h('li', null, `${i + 1}. ${D(m.left)} + ${D(m.right)} → `, h('b', null, D(m.merged)), `  (${m.count}×)`)) : [h('li', { style: { background: 'none' } }, 'No merges yet.')]));
      logEl.scrollTop = logEl.scrollHeight;
    }

    function renderExplain() {
      if (hl) {
        const n = bpe.countPairs(cur()).find((x) => x.left === hl.left && x.right === hl.right).count;
        explainEl.replaceChildren(h('strong', null, 'Counting… '), `the most frequent neighbouring pair is ${D(hl.left)} + ${D(hl.right)}, seen ${n} times. Every place it appears is highlighted.`);
        return;
      }
      if (!explain) {
        const top = bpe.countPairs(cur())[0];
        explainEl.replaceChildren(h('strong', null, 'Before any merge. '), rich(`Every word is a list of single characters (▁ marks a space). The most frequent neighbouring pair is **${D(top.left)} + ${D(top.right)}**, seen ${top.count} times.`));
        return;
      }
      const e = explain;
      const words = e.affected.slice(0, 4).map((a) => `${a.word.replace(/▁/g, '▁')} ×${a.freq * a.occurrences}`).join(', ');
      const more = e.affected.length > 4 ? ` and ${e.affected.length - 4} more` : '';
      const next = e.next && e.next.count >= 2 ? `Next most frequent pair: ${D(e.next.left)} + ${D(e.next.right)} (${e.next.count}).` : 'No pair repeats any more, so training stops here.';
      explainEl.replaceChildren(
        h('strong', null, `Merge ${cur().merges.length}: ${D(e.left)} + ${D(e.right)} → ${D(e.merged)}. `),
        `This pair occurs ${e.count} times (${words}${more}). Each occurrence becomes one symbol, so the corpus shrinks from ${fmt.int(e.lengthBefore)} to ${fmt.int(e.lengthAfter)} tokens (−${e.saved}) and the vocabulary grows to ${e.vocabSize}. ${next}`
      );
    }

    function renderStats() {
      const st = cur();
      const series = history.map(bpe.corpusLength);
      sLen.set(fmt.int(bpe.corpusLength(st)), history.length > 1 ? `${fmt.pct(1 - bpe.corpusLength(st) / series[0])} shorter than at the start (${fmt.int(series[0])})` : 'starting point: one token per character');
      sVocab.set(fmt.int(st.alphabet.length + st.merges.length), `${st.alphabet.length} characters + ${st.merges.length} merges`);
      sMerges.set(String(st.merges.length));
      sparkHost.replaceChildren(series.length > 1 ? TL.charts.sparkline(series, `Corpus length by merge: ${series.join(', ')}`) : h('p', { class: 'muted small', style: { margin: 0 } }, 'The compression curve appears after your first merge.'));
    }

    function renderVocab() {
      const v = bpe.vocabulary(cur());
      vocabTitle.textContent = `Vocabulary: ${v.alphabet.length + v.merged.length} entries (${v.alphabet.length} characters + ${v.merged.length} merged)`;
      vocabEl.replaceChildren(...v.alphabet.map((a) => h('span', { class: 'tok tok--sm tok--base', role: 'listitem' }, D(a))), ...v.merged.map((m) => h('span', { class: 'tok tok--sm' + (m === lastNew ? ' tok--new' : ''), role: 'listitem' }, D(m))));
    }

    /** Before and after: the same word with no merges versus the vocabulary built so far. */
    function renderTest(byUser) {
      const word = testInput.value.replace(/\s+/g, '');
      testWord = word;
      if (!word) {
        beforeOut.replaceChildren();
        afterOut.replaceChildren();
        beforeTitle.textContent = 'Before training';
        afterTitle.textContent = 'After training';
        testNote.textContent = 'Type a word to tokenize.';
        return;
      }
      const before = bpe.encode(bpe.modelFromMerges(initial.alphabet, []), ' ' + word);
      const after = bpe.encode(bpe.modelFromState(cur()), ' ' + word);
      const chip = (t) => h('span', { class: 'tok' + (t.isByte ? ' tok--byte' : ''), role: 'listitem' }, D(t.token));
      beforeOut.replaceChildren(...before.map(chip));
      afterOut.replaceChildren(...after.map(chip));
      beforeTitle.textContent = `Before training (0 merges): ${before.length} tokens`;
      afterTitle.textContent = `After ${cur().merges.length} merge${cur().merges.length === 1 ? '' : 's'}: ${after.length} tokens`;
      const nBytes = after.filter((t) => t.isByte).length;
      testNote.textContent =
        (after.length < before.length ? `Training saved ${before.length - after.length} token${before.length - after.length === 1 ? '' : 's'} on this word. ` : 'No saving yet: run more merges. ') +
        (nBytes ? `${nBytes} dashed piece${nBytes === 1 ? ' is a raw byte' : 's are raw bytes'}: this vocabulary never saw ${nBytes === 1 ? 'that character' : 'those characters'}, so it spells ${nBytes === 1 ? 'it' : 'them'} in bytes instead of failing.` : 'Every piece is a known token.');
      if (byUser && cur().merges.length > 0) store.flag('bpe.test');
    }
    testInput.addEventListener('input', () => renderTest(true));

    function renderResult() {
      if (!finished()) {
        resultHost.replaceChildren();
        return;
      }
      const series = history.map(bpe.corpusLength);
      resultHost.replaceChildren(
        callout('ok', rich(`**Training finished.** No pair appears twice any more, so another merge would only memorise one word. The corpus shrank from **${fmt.int(series[0])}** to **${fmt.int(series[series.length - 1])}** tokens (${fmt.pct(1 - series[series.length - 1] / series[0])} fewer) while the vocabulary grew by **${cur().merges.length}** entries. That is the core trade-off: shorter sequences against a bigger vocabulary. ${challenge && score.steps ? `In challenge mode you found the top pair first try ${score.firstTry} of ${score.steps} times.` : ''}`))
      );
    }

    function renderControls() {
      const done = finished();
      playBtn.replaceChildren(icon(playing ? 'pause' : 'play'), playing ? 'Pause' : 'Play');
      playBtn.setAttribute('aria-pressed', String(playing));
      playBtn.disabled = done;
      stepBtn.disabled = done || busy;
      undoBtn.disabled = history.length <= 1;
      slider.value = String(cur().merges.length);
      sliderOut.textContent = `${cur().merges.length} of ${MAX} merges`;
      slider.setAttribute('aria-valuetext', `${cur().merges.length} of ${MAX} merges`);
    }

    function renderAll() {
      renderWords();
      renderPairs();
      renderLog();
      renderExplain();
      renderStats();
      renderVocab();
      renderTest(false);
      renderResult();
      renderControls();
      fb.textContent = feedback.text;
      fb.setAttribute('data-kind', feedback.kind);
    }

    // ---- layout ---------------------------------------------------------------------
    const concept = h(
      'article',
      { class: 'card' },
      h('h2', null, 'Where does a vocabulary come from?'),
      p('Nobody writes it by hand. Byte-Pair Encoding (BPE) **learns** it from text with one simple loop:'),
      h('ol', null, [
        h('li', null, rich('Start with every word split into single characters (**▁** marks “a space starts here”).')),
        h('li', null, rich('Count how often each **pair of neighbouring symbols** appears, weighted by how often the word appears.')),
        h('li', null, rich('**Merge** the most frequent pair into one new symbol, in every word. Repeat until no pair appears twice.')),
      ]),
      callout('info', rich('**What BPE does not know:** grammar, meaning, or even what a word is. It only counts neighbours. Method: [Sennrich et al. (2016)](https://arxiv.org/abs/1508.07909); alternatives include WordPiece and the Unigram model in [SentencePiece](https://arxiv.org/abs/1808.06226).')),
      p('**Predict first:** the corpus below has 8 words with made-up counts. Which pair will be merged first?', 'muted small')
    );

    const labEl = lab(
      { id: 'bpe', badge: 'Simulation 2', title: 'BPE trainer: watch a vocabulary being learned', sub: 'Real BPE, tiny corpus' },
      h('div', { class: 'row' }, playBtn, stepBtn, undoBtn, resetBtn, chLabel),
      h('div', { class: 'row bpe-slider' }, h('label', { for: 'bpe-merges', class: 'field__label' }, 'Merges'), slider, sliderOut, h('label', { for: 'bpe-speed', class: 'sr-only' }, 'Animation speed'), speedSel),
      fb,
      explainEl,
      h(
        'div',
        { class: 'bpe-grid' },
        h('div', { class: 'panel' }, h('h3', { class: 'panel__title' }, 'Training corpus: words and their counts'), wordsEl),
        h('div', { class: 'stack' }, h('div', { class: 'panel' }, h('h3', { class: 'panel__title' }, 'Most frequent neighbouring pairs'), pairsEl), h('div', { class: 'panel panel--inset' }, h('h3', { class: 'panel__title' }, 'Merge log'), logEl))
      ),
      h('div', { class: 'stats' }, sLen.el, sVocab.el, sMerges.el),
      h('div', { class: 'panel' }, vocabTitle, vocabEl),
      h('div', { class: 'panel' }, h('h3', { class: 'panel__title' }, 'Compression by merge'), sparkHost),
      resultHost,
      h(
        'div',
        { class: 'panel' },
        h('h3', { class: 'panel__title' }, 'Before and after: tokenize any word'),
        h('div', { class: 'row' }, testInput, testBtns),
        h('div', { class: 'ba' }, h('div', { class: 'ba__col' }, beforeTitle, h('div', { class: 'toks-box', style: { minHeight: '56px' } }, beforeOut)), h('div', { class: 'ba__arrow', 'aria-hidden': 'true' }, icon('right')), h('div', { class: 'ba__col' }, afterTitle, h('div', { class: 'toks-box', style: { minHeight: '56px' } }, afterOut))),
        testNote
      )
    );

    const expTry = h(
      'article',
      { class: 'card' },
      h('h2', null, 'Things to try'),
      h('ol', { class: 'trythis' }, [
        h('li', null, h('b', null, '1'), h('div', null, rich('Press **Play** and **Pause** after the third merge. Predict the next pair, then press **Next step**.'))),
        h('li', null, h('b', null, '2'), h('div', null, rich('Drag **Merges** to the end, then test **playful**. Why does the unseen word still work?'))),
        h('li', null, h('b', null, '3'), h('div', null, rich('Switch on **You choose** and pick a pair that is *not* the most frequent. What does the feedback say about BPE’s rule?'))),
      ])
    );

    renderAll();
    return h('div', { class: 'stack' }, concept, labEl, expTry);
  };
})(typeof window !== 'undefined' ? window : globalThis);
