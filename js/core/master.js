/**
 * master.js - the Token Master Challenge: 5 levels x 2 questions, plus scoring rules.
 *
 * Question types (so the quiz is not one repeating pattern):
 *   mc     - multiple choice (one answer)
 *   num    - a number the student works out; checked against the real engine
 *   multi  - select ALL that apply
 * Practical questions get their ANSWER FROM THE ENGINE (the BPE trainer, the toy
 * tokenizer, the budget planner) instead of a hard-coded value, so the answer
 * can never disagree with what the labs show.
 *
 * Anti-guessing rules (enforced by unit tests):
 *   - the correct option's POSITION is spread out (all four used, never the
 *     same position twice in a row);
 *   - the correct option is not systematically the longest or the shortest;
 *   - the question TYPES vary within and across levels.
 */
(function (g) {
  'use strict';
  const TL = (g.TokenLab = g.TokenLab || {});

  function need() {
    if (typeof require !== 'function') return;
    if (!TL.bpe) require('./bpe.js');
    if (!TL.toy) require('./toy.js');
    if (!TL.context) require('./context.js');
    if (!TL.estimate) require('./estimate.js');
    if (!TL.modes) require('./modes.js');
    if (!TL.quizzes) require('../data/quizzes.js');
    if (!TL.realTokens) require('../data/real-tokens.js');
  }

  const MAX_ATTEMPTS = 3;
  const MASTERY_BADGE_PERCENT = 80;

  const LEVELS = [
    { n: 1, name: 'Tokens', blurb: 'What a token is and how text gets cut up.' },
    { n: 2, name: 'BPE', blurb: 'How a vocabulary is learned by merging pairs.' },
    { n: 3, name: 'Context budget', blurb: 'What fits in the window and what overflows.' },
    { n: 4, name: 'Memory', blurb: 'What to keep, forget, and never store.' },
    { n: 5, name: 'Mastery', blurb: 'Realistic decisions that combine everything.' },
  ];

  /** Re-order options so the correct one sits at `pos`; the others keep their relative order. */
  function place(options, correctIdx, pos) {
    const right = options[correctIdx];
    const rest = options.filter((_, i) => i !== correctIdx);
    rest.splice(pos, 0, right);
    return { options: rest, correct: pos };
  }

  /** Points for a finished question. attempts counts every try; revealed = answer was shown. */
  function questionPoints(attempts, hintUsed, revealed) {
    const base = revealed || attempts >= MAX_ATTEMPTS ? 2 : attempts === 2 ? 6 : 10;
    return Math.max(0, base - (hintUsed ? 2 : 0));
  }

  let cache = null;

  function build() {
    if (cache) return cache;
    need();
    const { bpe, toy, context, quizzes: Q, modes } = TL;
    const R = TL.realTokens;
    const fromQuiz = (q, pos, extra) => {
      const p = place(q.options, q.correct, pos);
      return Object.assign({ type: 'mc', stem: q.stem, options: p.options, correct: p.correct }, extra);
    };

    // ---- Level 1 -----------------------------------------------------------
    const hi = R.samples.find((s) => s.id === 'hi').text;
    const hiChars = Array.from(hi).length;
    const hiBytes = modes.utf8Length(hi);
    const hiSpaces = (hi.match(/ /g) || []).length;
    const hiAnswer = toy.count(hi);

    // ---- Level 2: a tiny corpus where the "obvious" pair is NOT the most frequent --------
    const PAIR_WORDS = [['cat', 5], ['cot', 2], ['coat', 4], ['goat', 3]];
    const PAIR_CORPUS = PAIR_WORDS.map(([w, c]) => [bpe.SPACE_MARK + w, c]);
    const st0 = bpe.createState(PAIR_CORPUS);
    const pairs = bpe.countPairs(st0);
    const countOf = (l, r) => (pairs.find((p) => p.left === l && p.right === r) || { count: 0 }).count;
    const top = pairs[0];
    const pairOpts = [
      { text: '▁ + c', l: bpe.SPACE_MARK, r: 'c' },
      { text: top.left + ' + ' + top.right, l: top.left, r: top.right },
      { text: 'o + a', l: 'o', r: 'a' },
      { text: 'c + o', l: 'c', r: 'o' },
    ];
    const pairCorrectIdx = pairOpts.findIndex((o) => o.l === top.left && o.r === top.right);
    const pairMc = pairOpts.map((o, i) => {
      const n = countOf(o.l, o.r);
      return {
        text: o.text,
        why: i === pairCorrectIdx
          ? `Correct. ${o.text} occurs ${n} times in total (summing every word, weighted by its count), more than any other pair.`
          : `${o.text} occurs ${n} times in total, fewer than the ${top.count} of ${top.left} + ${top.right}. BPE merges the pair with the highest TOTAL count.`,
      };
    });
    const pairPlaced = place(pairMc, pairCorrectIdx, 0);
    const afterTwo = bpe.train(PAIR_CORPUS, { numMerges: 2 });
    const step1 = bpe.describeMerge(st0, bpe.applyMerge(st0, top.left, top.right));
    const lenStart = bpe.corpusLength(st0);
    const lenAnswer = bpe.corpusLength(afterTwo);
    const m2 = afterTwo.merges[1];

    // ---- Level 3 -----------------------------------------------------------
    const base = { windowSize: 8000, system: 450, history: 2600, docs: 3200, user: 150, output: 1200 };
    const planFit = context.planBudget(base);
    const planOver = context.planBudget(Object.assign({}, base, { output: 1800 }));

    // ---- Level 4: pin the right facts --------------------------------------
    const pinOptions = [
      { text: "The customer's card number", ok: false, why: 'Sensitive data should not be stored in a prompt or memory at all, and it is not needed to answer.' },
      { text: "Never reveal another customer's data", ok: true, why: 'A policy rule: it must hold on every turn, so it belongs in the pinned system prompt.' },
      { text: "The customer's order number", ok: true, why: 'Later answers depend on it, and it would otherwise scroll out of a limited window.' },
      { text: 'A joke the customer made in turn 2', ok: false, why: 'Small talk. Pinning it spends tokens on every request for no benefit.' },
      { text: 'Refunds are allowed only within 30 days', ok: true, why: 'A policy rule that decides the outcome of refund questions, so it must always be present.' },
      { text: "The customer's favourite colour, mentioned once", ok: false, why: 'Trivia. Not needed for the task.' },
    ];

    // ---- Level 5: a decision whose options are scored by the engine ---------------------
    const W = 2000;
    const cur = { system: 160, history: 840, docs: 1100, user: 50, output: 200 };
    const totalOf = (c) => c.system + c.history + c.docs + c.user + c.output;
    const decisions = [
      { text: 'Drop the three least relevant retrieved chunks', patch: { docs: 1100 - 3 * 220 }, evidence: true, rules: true, reply: true },
      { text: 'Cut the reply reserve to zero so nothing is held back', patch: { output: 0 }, evidence: true, rules: true, reply: false },
      { text: 'Remove the system prompt to free up its tokens', patch: { system: 0 }, evidence: true, rules: false, reply: true },
      { text: 'Drop all five retrieved chunks to save the most space', patch: { docs: 0 }, evidence: false, rules: true, reply: true },
    ].map((d) => {
      const total = totalOf(Object.assign({}, cur, d.patch));
      const fits = total <= W;
      const good = fits && d.evidence && d.rules && d.reply;
      return Object.assign({}, d, { total, fits, good });
    });
    const decGood = decisions.findIndex((d) => d.good);
    const decMc = decisions.map((d, i) => ({
      text: d.text,
      why: `${d.good ? 'Correct. ' : ''}Total after this change: ${d.total.toLocaleString('en-US')} of ${W.toLocaleString('en-US')} tokens (${d.fits ? 'fits' : 'still over by ' + (d.total - W).toLocaleString('en-US')}). ` +
        (d.good ? 'It still has the relevant evidence, the rules, and room for the reply.' : !d.rules ? 'It also removes the rules the assistant must follow.' : !d.reply ? 'It leaves no room for the answer, so there would be nothing to read.' : !d.evidence ? 'It fits, but with no evidence the assistant would have to guess.' : '')
    }));
    const decPlaced = place(decMc, decGood, 2);

    const questions = [
      Object.assign(fromQuiz(Q.CHECKPOINT_1[0], 2), {
        id: 'm1', level: 1, hint: 'Where do vocabulary entries come from: grammar, or how often pieces occur?',
      }),
      {
        id: 'm2', level: 1, type: 'num', unit: 'tokens',
        stem: `The toy tokenizer has never seen Devanagari. This Hindi sentence has ${hiChars} characters, ${hiBytes} bytes in UTF-8 and ${hiSpaces} spaces: “${hi}”. How many tokens does the toy tokenizer produce?`,
        answer: hiAnswer,
        hint: 'Unseen characters fall back to raw bytes, one token per byte. A space is one byte and a known token.',
        explain: `Every non-space character became its UTF-8 bytes (one token each) and each of the ${hiSpaces} spaces is one known token, so the count equals the byte count: ${hiBytes}. A real tokenizer with more Hindi in its vocabulary needs far fewer (the recording in Lab 1).`,
      },
      Object.assign({ id: 'm3', level: 2, type: 'mc', stem: 'BPE is about to make its FIRST merge on this tiny corpus. Which pair does it merge?', options: pairPlaced.options, correct: pairPlaced.correct, extra: { kind: 'bpe', words: PAIR_WORDS } }, {
        hint: 'Total each pair across ALL the words, weighted by the counts. The pair in the most words is not always the most frequent.',
      }),
      {
        id: 'm4', level: 2, type: 'num', unit: 'tokens', extra: { kind: 'bpe', words: PAIR_WORDS },
        stem: 'Run the first TWO BPE merges on the same corpus. In total, how many tokens does the corpus contain afterwards? (Count every occurrence of every word.)',
        answer: lenAnswer,
        hint: 'Merge the most frequent pair, recount the pairs, merge again, then add up (symbols in each word × its count).',
        explain: `The corpus starts at ${lenStart} tokens. Merge 1 (${top.left} + ${top.right}, seen ${step1.count} times) saves ${step1.saved}, leaving ${step1.lengthAfter}. Merge 2 (${m2.left} + ${m2.right}, seen ${m2.count} times) saves ${step1.lengthAfter - lenAnswer}, leaving ${lenAnswer}.`,
      },
      Object.assign(fromQuiz(Q.CHECKPOINT_2[0], 3), { id: 'm5', level: 3, hint: 'The reply you allow also has to fit inside the window.' }),
      {
        id: 'm6', level: 3, type: 'num', unit: 'tokens',
        stem: `Window: 8,000 tokens. System prompt 450, history 2,600, documents 3,200, new message 150 and a reply reserve of 1,200 (a total of ${planFit.total.toLocaleString('en-US')}, so it fits). You raise the reply reserve to 1,800. By how many tokens is the request now OVER the window?`,
        answer: planOver.over,
        hint: 'Add all five parts again with the new reserve, then subtract the window size.',
        explain: `New total: 450 + 2,600 + 3,200 + 150 + 1,800 = ${planOver.total.toLocaleString('en-US')}, which is ${planOver.over} more than 8,000. Reply space counts toward the window, so raising it can break a request that fit.`,
      },
      {
        id: 'm7', level: 4, type: 'multi',
        stem: 'A refund bot has a small memory. Select ALL the facts worth pinning, meaning always kept in the prompt.',
        options: pinOptions.map((o) => ({ text: o.text, why: o.why })),
        correctSet: pinOptions.map((o, i) => (o.ok ? i : -1)).filter((i) => i >= 0),
        hint: 'Pin what must be true on every turn, or what later answers depend on. Never pin trivia or sensitive data.',
      },
      Object.assign(fromQuiz(Q.CHECKPOINT_2[2], 1), { id: 'm8', level: 4, hint: 'Turn N resends the N-1 turns before it. What happens to a running total of that?' }),
      Object.assign({ id: 'm9', level: 5, type: 'mc', options: decPlaced.options, correct: decPlaced.correct, extra: { kind: 'budget', window: W, parts: cur, total: totalOf(cur) } }, {
        stem: `Window: ${W.toLocaleString('en-US')} tokens. The request is system 160 + history 840 + documents 1,100 (five chunks) + new message 50 + reply reserve 200 = ${totalOf(cur).toLocaleString('en-US')}. Which single change fixes it while keeping the answer good?`,
        hint: 'A good fix fits the window AND keeps evidence, rules and room to answer. Check each option’s total.',
      }),
      Object.assign(fromQuiz(Q.SCENARIOS[2], 0), { id: 'm10', level: 5, hint: 'You cannot paste it all in, and guessing which part matters is risky. What do retrieval systems do?' }),
    ];

    const byId = {};
    questions.forEach((q) => (byId[q.id] = q));
    const levels = LEVELS.map((l) => Object.assign({}, l, { questions: questions.filter((q) => q.level === l.n) }));

    // Existing questions not used above stay available as optional extra practice.
    const used = new Set([Q.CHECKPOINT_1[0].id, Q.CHECKPOINT_2[0].id, Q.CHECKPOINT_2[2].id, Q.SCENARIOS[2].id]);
    const practice = [].concat(Q.CHECKPOINT_1, Q.CHECKPOINT_2, Q.SCENARIOS.slice(0, 2)).filter((q) => !used.has(q.id));

    cache = { levels, questions, byId, practice, PAIR_WORDS, PAIR_CORPUS };
    return cache;
  }

  /** Check a response. Returns {correct} or {invalid, error} for unparseable numbers. */
  function evaluate(q, response) {
    need();
    if (q.type === 'mc') return { correct: response === q.correct };
    if (q.type === 'num') {
      const r = TL.estimate.parseWholeNumber(response, 0, 1e9);
      if (!r.ok) return { invalid: true, error: r.error };
      return { correct: r.value === q.answer, value: r.value };
    }
    if (q.type === 'multi') {
      const set = Array.from(new Set(response || [])).sort((a, b) => a - b);
      const want = q.correctSet.slice().sort((a, b) => a - b);
      return { correct: set.length === want.length && set.every((v, i) => v === want[i]), wrong: set.filter((i) => !want.includes(i)), missed: want.filter((i) => !set.includes(i)) };
    }
    throw new Error('unknown question type ' + q.type);
  }

  /** master = { q: { id: {points, done, attempts, hint} } } */
  function levelProgress(master, n) {
    const qs = build().levels[n - 1].questions;
    const rec = (master && master.q) || {};
    const done = qs.filter((q) => rec[q.id] && rec[q.id].done).length;
    const points = qs.reduce((s, q) => s + ((rec[q.id] && rec[q.id].points) || 0), 0);
    return { done, total: qs.length, complete: done === qs.length, points, max: qs.length * 10 };
  }

  /** Level 1 is always open; each later level opens when the previous one is complete. */
  function isUnlocked(master, n) {
    return n <= 1 || levelProgress(master, n - 1).complete;
  }

  function mastery(master) {
    const b = build();
    const points = b.levels.reduce((s, l) => s + levelProgress(master, l.n).points, 0);
    const complete = b.levels.every((l) => levelProgress(master, l.n).complete);
    const percent = Math.round((points / (b.questions.length * 10)) * 100);
    const tier = percent >= 90 ? 'Token Master' : percent >= MASTERY_BADGE_PERCENT ? 'Proficient' : percent >= 60 ? 'Developing' : 'Keep practising';
    return { points, max: b.questions.length * 10, percent, complete, tier, earnedBadge: complete && percent >= MASTERY_BADGE_PERCENT };
  }

  TL.master = { LEVELS, MAX_ATTEMPTS, MASTERY_BADGE_PERCENT, build, evaluate, questionPoints, levelProgress, isUnlocked, mastery, place };
  if (typeof module !== 'undefined' && module.exports) module.exports = TL.master;
})(typeof window !== 'undefined' ? window : globalThis);
