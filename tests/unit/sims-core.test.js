// Tests for the logic behind the new simulations: modes/classifier, BPE helpers, gamification,
// the Survival game and the Memory Manager. (Token Master is in master.test.js.)
const test = require('node:test');
const assert = require('node:assert/strict');
const bpe = require('../../js/core/bpe.js');
const modes = require('../../js/core/modes.js');
const gam = require('../../js/core/gamification.js');
const S = require('../../js/core/survival.js');
const MM = require('../../js/core/memorymgr.js');
const R = require('../../js/data/real-tokens.js');

// =====================================================================
// modes + classifier
// =====================================================================
test('modes: characters and words behave as the lesson says', () => {
  assert.equal(modes.chars('Hi 😍').length, 4, 'one token per code point, emoji included');
  assert.deepEqual(modes.words('Hello, world! Hi.').map((t) => t.token), ['Hello', ',', 'world', '!', 'Hi', '.']);
  assert.equal(modes.words('the cat the').map((t) => t.id).join(','), '1,2,1', 'word ids are order first seen');
  assert.deepEqual(modes.words('   '), []);
});

test('classifier: word / fragment / number / punctuation / whitespace / byte', () => {
  assert.deepEqual(modes.classify(['▁the', 'ation', ',', '▁', '2026', '<0xE0>', ' is', 'ization']), ['word', 'fragment', 'punct', 'space', 'number', 'byte', 'word', 'fragment']);
  // recorded real pieces use literal spaces
  const plain = R.samples.find((s) => s.id === 'plain').results.cl100k_base.pieces;
  const types = modes.classify(plain);
  assert.equal(types[0], 'word');
  assert.equal(types[1], 'fragment', '"ization" continues "Token"');
  assert.equal(types[plain.length - 1], 'punct');
  assert.equal(modes.classify(['\n', '   ']).join(), 'space,space');
});

test('classifier: every real recorded piece gets exactly one valid type', () => {
  for (const s of R.samples) {
    for (const enc of Object.keys(s.results)) {
      const types = modes.classify(s.results[enc].pieces);
      assert.equal(types.length, s.results[enc].pieces.length);
      for (const t of types) assert.ok(modes.TYPE_INFO[t], s.id + ' ' + t);
    }
  }
});

test('utf8 helpers', () => {
  assert.equal(modes.utf8Length('a'), 1);
  assert.equal(modes.utf8Length('म'), 3);
  assert.equal(modes.utf8Hex('A'), '41');
  assert.equal(modes.utf8Hex('▁'), '20', 'the word-start marker is a space');
});

// =====================================================================
// BPE: cross-check against an independently written naive implementation
// =====================================================================
function naiveBpe(wordFreqs, numMerges) {
  // deliberately different structure from core/bpe.js: arrays of strings, plain loops, no Map reuse
  let words = wordFreqs.map(([w, c]) => ({ sy: Array.from(w).map((ch) => (ch === ' ' ? '▁' : ch)), c }));
  const merges = [];
  for (let n = 0; n < numMerges; n++) {
    const order = [];
    const tally = {};
    for (const w of words) for (let i = 0; i + 1 < w.sy.length; i++) {
      const key = JSON.stringify([w.sy[i], w.sy[i + 1]]);
      if (!(key in tally)) { tally[key] = 0; order.push(key); }
      tally[key] += w.c;
    }
    if (!order.length) break;
    let best = order[0];
    for (const k of order) if (tally[k] > tally[best]) best = k; // first-seen wins ties
    if (tally[best] < 2) break;
    const [l, r] = JSON.parse(best);
    merges.push(l + r);
    words = words.map((w) => {
      const out = [];
      for (let i = 0; i < w.sy.length; i++) {
        if (i + 1 < w.sy.length && w.sy[i] === l && w.sy[i + 1] === r) { out.push(l + r); i++; } else out.push(w.sy[i]);
      }
      return { sy: out, c: w.c };
    });
  }
  return { merges, length: words.reduce((n, w) => n + w.c * w.sy.length, 0) };
}

function lcg(seed) { let x = seed; return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296; }
function randomCorpus(rand) {
  const alphabet = 'abcde';
  const n = 3 + Math.floor(rand() * 6);
  const out = new Map();
  for (let i = 0; i < n; i++) {
    let w = ' ';
    const len = 2 + Math.floor(rand() * 5);
    for (let k = 0; k < len; k++) w += alphabet[Math.floor(rand() * alphabet.length)];
    out.set(w, (out.get(w) || 0) + 1 + Math.floor(rand() * 6));
  }
  return Array.from(out.entries());
}

test('BPE engine agrees with an independent naive implementation on 200 random corpora', () => {
  const rand = lcg(12345);
  for (let t = 0; t < 200; t++) {
    const corpus = randomCorpus(rand);
    const mine = bpe.train(corpus, { numMerges: 25 });
    const ref = naiveBpe(corpus, 25);
    assert.deepEqual(mine.merges.map((m) => m.merged), ref.merges, 'corpus ' + JSON.stringify(corpus));
    assert.equal(bpe.corpusLength(mine), ref.length);
  }
});

test('describeMerge: numbers are exact, never estimated', () => {
  const rand = lcg(777);
  for (let t = 0; t < 100; t++) {
    let st = bpe.createState(randomCorpus(rand));
    for (let step = 0; step < 6; step++) {
      const pairs = bpe.countPairs(st);
      if (!pairs.length || pairs[0].count < 2) break;
      const after = bpe.applyMerge(st, pairs[0].left, pairs[0].right);
      const d = bpe.describeMerge(st, after);
      assert.equal(d.saved, d.lengthBefore - d.lengthAfter);
      assert.equal(d.saved, d.affected.reduce((n, w) => n + w.freq * w.occurrences, 0), 'each merged occurrence removes exactly one symbol');
      assert.equal(d.vocabSize, after.alphabet.length + after.merges.length);
      if (d.left !== d.right) assert.equal(d.saved, d.count, 'for distinct symbols saved == pair count');
      st = after;
    }
  }
});

test('describeMerge on the Lab 2 corpus: first merge is a+y, saves 32', () => {
  const C = require('../../js/data/corpus.js');
  const st = bpe.createState(C.LAB2_WORD_FREQS.map(([w, c]) => [bpe.SPACE_MARK + w, c]));
  const after = bpe.applyMerge(st, 'a', 'y');
  const d = bpe.describeMerge(st, after);
  assert.equal(d.count, 32);
  assert.equal(d.saved, 32);
  assert.equal(d.lengthBefore, 220);
  assert.equal(d.lengthAfter, 188);
  assert.equal(d.merged, 'ay');
  assert.equal(d.next.left + d.next.right, 'pl');
});

test('vocabulary() lists characters then merges in learned order', () => {
  const C = require('../../js/data/corpus.js');
  const st = bpe.train(C.LAB2_WORD_FREQS.map(([w, c]) => [bpe.SPACE_MARK + w, c]), { numMerges: 4 });
  const v = bpe.vocabulary(st);
  assert.equal(v.alphabet.length, 12);
  assert.deepEqual(v.merged, ['ay', 'pl', 'play', '▁play']);
});

test('encode() reports which word each piece belongs to', () => {
  const toy = require('../../js/core/toy.js');
  const e = toy.encode('the teacher');
  assert.ok(e.every((t) => Number.isInteger(t.pre) && typeof t.first === 'boolean'));
  assert.equal(e[0].first, true);
  assert.deepEqual(new Set(e.map((t) => t.pre)).size, 2);
});

// =====================================================================
// gamification
// =====================================================================
test('gamification: XP can be earned once; replays only raise the points', () => {
  let p = gam.emptyProgress();
  p = gam.award(p, 'survival.score', 40);
  const same = gam.award(p, 'survival.score', 30);
  assert.equal(same, p, 'a lower score changes nothing (same object)');
  p = gam.award(p, 'survival.score', 70);
  assert.equal(gam.totalXP(p), 70);
  assert.equal(gam.totalXP(gam.award(p, 'survival.score', 70)), 70, 'same score again adds nothing');
});

test('gamification: rule events need ALL their flags, and fire exactly once', () => {
  let p = gam.emptyProgress();
  p = gam.setFlag(p, 'tok.mode.chars');
  p = gam.setFlag(p, 'tok.mode.words');
  assert.equal(gam.has(gam.evaluate(p), 'tok.modes'), false, 'two of three is not enough');
  p = gam.evaluate(gam.setFlag(p, 'tok.mode.subword'));
  assert.equal(p.xp['tok.modes'], 15);
  assert.equal(gam.totalXP(gam.evaluate(p)), 15, 're-evaluating adds nothing');
});

test('gamification: counter rules (three correct manual merges)', () => {
  let p = gam.emptyProgress();
  p = gam.bump(gam.bump(p, 'bpe.manual.ok'), 'bpe.manual.ok');
  assert.equal(gam.has(gam.evaluate(p), 'bpe.manual'), false);
  p = gam.evaluate(gam.bump(p, 'bpe.manual.ok'));
  assert.equal(p.xp['bpe.manual'], 20);
});

test('gamification: nothing is awarded for merely existing; progress objects are immutable', () => {
  const p = gam.emptyProgress();
  const frozen = JSON.stringify(p);
  gam.setFlag(p, 'x'); gam.bump(p, 'y'); gam.award(p, 'predict', 10); gam.evaluate(p);
  assert.equal(JSON.stringify(p), frozen);
  assert.equal(gam.totalXP(gam.evaluate(p)), 0);
});

test('gamification: levels are monotonic, and every level (and badge) is reachable', () => {
  let last = -1;
  for (const l of gam.LEVELS) { assert.ok(l.at > last || l.at === 0); last = l.at; }
  assert.ok(gam.MAX_XP >= gam.LEVELS[gam.LEVELS.length - 1].at + 50, 'top level reachable with margin (max ' + gam.MAX_XP + ')');
  // The top level must be reachable from the TIMED lesson alone: no level may depend on the optional extension.
  assert.ok(gam.MAX_REQUIRED_XP >= gam.LEVELS[gam.LEVELS.length - 1].at + 50, 'timed lesson alone reaches the top level (max ' + gam.MAX_REQUIRED_XP + ')');
  assert.equal(gam.MAX_REQUIRED_XP, 450);
  assert.equal(gam.MAX_XP - gam.MAX_REQUIRED_XP, 60, 'the extension is worth 60 bonus XP');
  for (const b of gam.BADGES) for (const [id] of b.criteria) assert.ok(!gam.RULES.find((r) => r.id === id).optional, b.id + ' must not depend on optional work');
  assert.equal(gam.level(0).name, 'Newcomer');
  assert.equal(gam.level(69).n, 1);
  assert.equal(gam.level(70).n, 2);
  assert.equal(gam.level(gam.MAX_XP).n, 5);
  assert.equal(gam.level(gam.MAX_XP).toNext, 0);
  const l = gam.level(100);
  assert.ok(l.ratio > 0 && l.ratio < 1 && l.toNext === 60);
});

test('gamification: every badge criterion refers to a real event, and badges unlock from activity only', () => {
  const ids = new Set(gam.RULES.map((r) => r.id));
  for (const b of gam.BADGES) for (const [id] of b.criteria) assert.ok(ids.has(id), b.id + ' -> ' + id);
  assert.equal(gam.BADGES.length, 5);
  assert.deepEqual(gam.badges(gam.emptyProgress()).map((b) => b.unlocked), [false, false, false, false, false]);
  let p = gam.emptyProgress();
  for (const f of ['tok.mode.chars', 'tok.mode.words', 'tok.mode.subword', 'tok.lang.other', 'tok.preset.typos', 'tok.preset.clean']) p = gam.setFlag(p, f);
  p = gam.evaluate(p);
  assert.equal(gam.badges(p).find((b) => b.id === 'token-explorer').unlocked, true);
  assert.equal(gam.badges(p).find((b) => b.id === 'token-master').unlocked, false);
});

test('gamification: diff reports XP, new events, new badges and level-ups', () => {
  const a = gam.emptyProgress();
  let b = a;
  for (const f of ['tok.mode.chars', 'tok.mode.words', 'tok.mode.subword', 'tok.lang.other', 'tok.preset.typos', 'tok.preset.clean']) b = gam.setFlag(b, f);
  b = gam.evaluate(b);
  const d = gam.diff(a, b);
  assert.equal(d.xpGained, 45);
  assert.deepEqual(d.newBadges.map((x) => x.id), ['token-explorer']);
  assert.equal(d.levelUp, null);
  const d2 = gam.diff(b, gam.award(b, 'survival.score', 50));
  assert.deepEqual(d2.levelUp && [d2.levelUp.from, d2.levelUp.to], [1, 2]);
});

// =====================================================================
// Survival game
// =====================================================================
const set = (s, f) => f(s);

/** A careful player: only what is needed now or later; just enough room for the answer. */
function carefulPlayer(capacity, opts) {
  const o = opts || {};
  let s = S.newGame({ capacity });
  while (s.status === 'playing') {
    const need = S.ROUNDS[s.round].needs;
    const future = new Set();
    S.ROUNDS.slice(s.round).forEach((r) => r.needs.facts.forEach((f) => future.add(f)));
    s.history.filter((m) => m.on).forEach((m) => {
      if (!m.facts.some((f) => future.has(f))) s = S.toggleMsg(s, m.id);
    });
    s.docs.forEach((d) => { if (!need.docs.includes(d.id) && d.on) s = S.toggleDoc(s, d.id); });
    s.rules.forEach((r) => { if (r.id === 'r-style' && r.on) s = S.toggleRule(s, r.id); });
    if (o.dropRule && s.rules.find((r) => r.id === o.dropRule).on) s = S.toggleRule(s, o.dropRule);
    s = S.setReserve(s, o.reserve != null ? o.reserve : Math.ceil(S.ROUNDS[s.round].answerTokens / 50) * 50);
    s = S.send(s);
  }
  return s;
}

test('survival: the starting history is 255 tokens and tokens add up', () => {
  const s = S.newGame();
  const u = S.usage(s);
  assert.equal(u.history, 255);
  assert.equal(u.system, 160);
  assert.equal(u.docs, 5 * 220);
  assert.equal(u.total, u.system + u.history + u.docs + u.user + u.reserve);
});

test('survival: "keep everything" overflows at the default capacity and costs a life, without advancing', () => {
  let s = S.newGame();
  assert.equal(S.usage(s).level, 'over');
  s = S.send(s);
  assert.equal(s.last.rejected, true);
  assert.equal(s.lives, 2);
  assert.equal(s.round, 0, 'the round does not advance on a rejected request');
  assert.equal(s.results.length, 0);
});

test('survival: three rejected requests end the game', () => {
  let s = S.newGame();
  for (let i = 0; i < 3; i++) s = S.send(s);
  assert.equal(s.status, 'lost');
  assert.equal(s.lives, 0);
  assert.equal(S.send(s), s, 'a finished game ignores further sends');
});

test('survival: a careful player wins at every capacity, with full marks', () => {
  for (const cap of [900, 1100, 1400, 1700, 2000]) {
    const s = carefulPlayer(cap);
    assert.equal(s.status, 'won', 'capacity ' + cap);
    assert.deepEqual(s.results.map((r) => r.score), [100, 100, 100, 100], 'capacity ' + cap);
    assert.equal(s.lives, 3);
    assert.equal(S.summary(s).points, 80);
  }
});

test('survival: removing the refund rule breaks round 2 with a policy failure', () => {
  const s = carefulPlayer(1400, { dropRule: 'r-refund' });
  const r2 = s.results[1];
  assert.equal(r2.pass, false);
  const rule = r2.checks.find((c) => c.kind === 'rule');
  assert.equal(rule.ok, false);
  assert.match(rule.detail, /approves a refund after 45 days/);
  assert.equal(r2.score, 65);
});

test('survival: too little reply space truncates the answer and the truncated facts are lost later', () => {
  const s = carefulPlayer(1400, { reserve: 50 });
  assert.ok(s.results.every((r) => r.truncated));
  assert.equal(s.results[0].score, 80);
  // round 4 needs the "decision" and "plan" facts, which only exist in answers that were NOT truncated
  const r4 = s.results[3];
  assert.equal(r4.checks.filter((c) => c.kind === 'fact' && !c.ok).length, 2);
});

test('survival: summarising keeps only gist facts (lossy by design) and costs 60 tokens', () => {
  let s = S.newGame({ capacity: 2000 });
  s = S.summarise(s);
  const sum = s.history.find((m) => m.role === 'summary');
  assert.ok(sum);
  assert.equal(sum.tokens, 60);
  assert.deepEqual(sum.facts.sort(), ['damaged', 'order']);
  const facts = new Set();
  s.history.filter((m) => m.on).forEach((m) => m.facts.forEach((f) => facts.add(f)));
  assert.equal(facts.has('promo'), false, 'detail from the summarised part is lost');
  assert.equal(facts.has('name'), false, 'the name was not a gist fact, so it is lost too');
  assert.equal(facts.has('cat'), true, 'the last two messages are kept word for word');
  assert.equal(S.summarise(s), s, 'a short history is left alone');
});

test('survival: trimming docs halves tokens, but a trimmed damage chunk loses the claim steps', () => {
  let s = S.newGame();
  const before = S.usage(s).docs;
  s = S.trimDocs(s);
  assert.equal(S.usage(s).docs, before / 2);
  // jump to round 3 (needs the damage chunk) with a careful player, but trim everything
  let g = S.newGame({ capacity: 2000 });
  for (let round = 0; round < 2; round++) {
    const need = S.ROUNDS[g.round].needs;
    g.docs.forEach((d) => { if (!need.docs.includes(d.id)) g = S.toggleDoc(g, d.id); });
    g = S.setReserve(g, 200);
    g = S.send(g);
  }
  assert.equal(g.round, 2);
  g = S.trimDocs(g);
  g = S.send(g);
  const doc = g.results[2].checks.find((c) => c.kind === 'doc');
  assert.equal(doc.ok, false);
  assert.match(doc.detail, /trimmed/);
});

test('survival: warning level appears between 85% and 100%', () => {
  let s = S.newGame({ capacity: 1400 });
  s = S.dropOldest(S.trimDocs(s), 0);
  // docs trimmed (550) -> total 160+255+550+40+200 = 1205 = 86%
  assert.equal(S.usage(s).level, 'warn');
  s = S.dropOldest(s, 4);
  assert.equal(S.usage(s).level, 'ok');
});

test('survival: capacity is clamped and snapped to the step', () => {
  assert.equal(S.newGame({ capacity: 10 }).capacity, 900);
  assert.equal(S.newGame({ capacity: 99999 }).capacity, 2000);
  assert.equal(S.newGame({ capacity: 1449 }).capacity, 1400);
  assert.equal(S.setReserve(S.newGame(), 9999).reserve, 600);
  assert.equal(S.setReserve(S.newGame(), -5).reserve, 0);
});

test('survival: messages switched off are permanently gone after a send (that is what truncation does)', () => {
  const s = carefulPlayer(1400);
  assert.ok(s.history.length < S.HISTORY0.length + 8, 'history did not keep every message');
  assert.equal(s.history.some((m) => m.id === 'h7'), false);
});

// =====================================================================
// Memory manager
// =====================================================================
function playMemory(plan) {
  let s = MM.newGame();
  const problems = [];
  while (!s.done) {
    const t = MM.TURNS[s.i];
    if (t.kind === 'probe') { s = MM.answerProbe(s); continue; }
    const a = plan(t.id, s);
    let n = a === 'summarise' ? MM.summarise(s) : MM.decide(s, a);
    if (n.error) { problems.push(t.id + ':' + n.error.type); n = MM.decide(s, 'keep'); }
    s = a === 'summarise' && !n.error ? MM.decide(n, 'keep') : n;
  }
  return { s, score: MM.score(s), problems };
}
const SAVE = new Set(['t1', 't2', 't4', 't6']);

test('memory: the facts that matter fit in memory; saving everything does not', () => {
  const note = (f) => require('../../js/core/toy.js').count(MM.FACTS[f].note);
  const core = ['name', 'exam', 'slot', 'weak', 'hours'].reduce((n, f) => n + note(f), 0);
  const all = Object.keys(MM.FACTS).reduce((n, f) => n + note(f), 0);
  assert.ok(core <= MM.CAPS.memory, 'core facts fit (' + core + ' <= ' + MM.CAPS.memory + ')');
  assert.ok(all > MM.CAPS.memory, 'everything does not fit (' + all + ')');
});

test('memory: selective saving scores 100 and answers both probes fully', () => {
  const r = playMemory((id) => (SAVE.has(id) ? 'save' : 'keep'));
  assert.equal(r.score.total, 100);
  assert.equal(r.score.pass, true);
  assert.deepEqual(r.s.probes.map((p) => p.used.length + '/' + p.needs.length), ['4/4', '2/2']);
  assert.deepEqual(r.problems, []);
});

test('memory: keeping everything in short-term context only fails, because old messages scroll out', () => {
  const r = playMemory(() => 'keep');
  assert.equal(r.score.pass, false);
  assert.deepEqual(r.s.probes.map((p) => p.used.length), [1, 0]);
  assert.ok(r.score.total < 40);
});

test('memory: saving everything is blocked by the memory cap, and a stored secret costs hygiene points', () => {
  const r = playMemory(() => 'save');
  assert.ok(r.problems.some((p) => p.endsWith('memory-full')), 'memory filled up');
  assert.ok(MM.memTokens(r.s) <= MM.CAPS.memory);
  assert.equal(r.score.secrets, 1);
  assert.equal(r.score.hygiene, 10);
});

test('memory: deleting the stored secret at the end restores the hygiene score', () => {
  const r = playMemory((id) => (SAVE.has(id) || id === 't3' ? 'save' : 'keep'));
  assert.equal(r.score.secrets, 1);
  const cleaned = MM.deleteMemory(r.s, 'm-secret');
  assert.equal(MM.score(cleaned).secrets, 0);
  assert.equal(MM.score(cleaned).total, 100);
});

test('memory: "forget" removes the message at once, so its facts are never available', () => {
  let s = MM.newGame();
  s = MM.decide(s, 'forget');
  assert.equal(MM.available(s).has('name'), false);
  assert.equal(MM.available(s).has('exam'), false);
});

test('memory: the short-term context never exceeds its cap and drops the OLDEST message first', () => {
  let s = MM.newGame();
  const seen = [];
  while (!s.done) {
    assert.ok(MM.ctxTokens(s) <= MM.CAPS.context || s.context.length === 1, 'context cap respected');
    seen.push(...s.events.filter((e) => e.type === 'fell-out').map((e) => e.text));
    s = MM.isProbe(s) ? MM.answerProbe(s) : MM.decide(s, 'keep');
  }
  assert.equal(seen[0], MM.TURNS[0].text, 'the first message is the first to fall out');
});

test('memory: a failed save (memory full) changes nothing', () => {
  let s = MM.newGame();
  s = MM.decide(s, 'save'); // t1
  s = MM.decide(s, 'save'); // t2
  s = MM.decide(s, 'save'); // t3 secret (fits: 33+12+16=61)
  const before = JSON.stringify([s.memory, s.context, s.i]);
  const blocked = MM.decide(s, 'save'); // t4 weak: 61+18 = 79 <= 85 fits, so save it, then t5
  assert.ok(!blocked.error);
  s = MM.decide(blocked, 'save'); // t5 cat: 79+13 = 92 > 85
  assert.equal(s.error.type, 'memory-full');
  const afterFail = MM.decide(s, 'save');
  assert.equal(afterFail.error.type, 'memory-full');
  assert.deepEqual(afterFail.memory, s.memory, 'a blocked save leaves memory untouched');
  assert.equal(afterFail.i, s.i, 'and does not advance the conversation');
  assert.ok(before.length > 0);
});

test('memory: summarising is lossy: gist facts survive, detail facts do not, and it can come too late', () => {
  // summarise while name+exam+slot are still in the context (turn 2 pending)
  let s = MM.newGame();
  s = MM.decide(s, 'keep'); // t1 kept in context
  const sum = MM.summarise(s); // pending is t2; summarise t1 (name, exam)
  assert.ok(!sum.error);
  assert.deepEqual(sum.memory[0].facts.sort(), ['exam', 'name']);
  assert.equal(sum.memory[0].source, 'summary');
  assert.ok(sum.memory[0].tokens < 9 + 24, 'the summary is shorter than the two separate notes');
  // summarising later finds nothing left to summarise
  let late = MM.newGame();
  for (let i = 0; i < 4; i++) late = MM.decide(late, 'keep');
  assert.equal(MM.available(late).has('name'), false, 'the name has already scrolled out of the context');
  const afterLate = MM.summarise(late);
  assert.equal(MM.available(afterLate).has('name'), false, 'summarising cannot bring back what is already gone');
  assert.equal(MM.available(afterLate).has('exam'), false);
});

test('memory: probes only report what is available, and the score blends recall and hygiene', () => {
  const r = playMemory((id) => (SAVE.has(id) ? 'save' : 'keep'));
  assert.match(r.s.probes[0].text, /exam is on 12 December/);
  const sc = MM.score(r.s);
  assert.equal(sc.probePart + sc.hygiene, sc.total);
  assert.equal(MM.points(100), 60);
  assert.equal(MM.points(0), 0);
});
