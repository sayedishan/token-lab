const test = require('node:test');
const assert = require('node:assert/strict');
const bpe = require('../../js/core/bpe.js');
const { PLAYGROUND_CORPUS, LAB2_WORD_FREQS, LAB2_TEST_WORDS } = require('../../js/data/corpus.js');

const lab2Freqs = () => LAB2_WORD_FREQS.map(([w, c]) => [bpe.SPACE_MARK + w, c]);
const toyModel = () => bpe.modelFromState(bpe.trainFromText(PLAYGROUND_CORPUS, { numMerges: 400 }));

test('pretokenize is lossless for any text', () => {
  const samples = ['', ' ', 'a', 'Hello, world!', '  two  spaces  ', 'line1\nline2\n\n', 'tab\tsep', '1234567890',
    'मुझे मशीन लर्निंग', 'emoji 😍🎉 ok', 'mixed: abc123-def_456!!!', '   leading', 'trailing   '];
  for (const s of samples) assert.equal(bpe.pretokenize(s).join(''), s, JSON.stringify(s));
});

test('Lab 2: first merge is "ay" with count 32, and it is unambiguous', () => {
  const state = bpe.createState(lab2Freqs());
  const pairs = bpe.countPairs(state);
  assert.equal(pairs[0].left + pairs[0].right, 'ay');
  assert.equal(pairs[0].count, 32);
  assert.ok(pairs[0].count > pairs[1].count, 'top pair must not be tied');
});

test('Lab 2: training story is play -> ▁play -> ing (what the lesson text claims)', () => {
  const state = bpe.train(lab2Freqs(), { numMerges: 50 });
  const merged = state.merges.map((m) => m.merged);
  assert.deepEqual(merged.slice(0, 4), ['ay', 'pl', 'play', '▁play']);
  assert.ok(merged.includes('ing'), 'suffix "ing" should be discovered');
  assert.ok(merged.indexOf('ing') > merged.indexOf('▁play'));
});

test('training is deterministic', () => {
  const a = bpe.train(lab2Freqs(), { numMerges: 50 }).merges.map((m) => m.merged);
  const b = bpe.train(lab2Freqs(), { numMerges: 50 }).merges.map((m) => m.merged);
  assert.deepEqual(a, b);
});

test('applyMerge is immutable (supports undo)', () => {
  const s0 = bpe.createState(lab2Freqs());
  const before = JSON.stringify(s0);
  const p = bpe.countPairs(s0)[0];
  const s1 = bpe.applyMerge(s0, p.left, p.right);
  assert.equal(JSON.stringify(s0), before, 'original state must not change');
  assert.equal(s1.merges.length, 1);
  assert.equal(s0.merges.length, 0);
});

test('every merge strictly shortens the corpus (or leaves it equal), never lengthens it', () => {
  let state = bpe.createState(lab2Freqs());
  const len = (s) => s.words.reduce((n, w) => n + w.freq * w.symbols.length, 0);
  let prev = len(state);
  for (let i = 0; i < 30; i++) {
    const pairs = bpe.countPairs(state);
    if (!pairs.length || pairs[0].count < 2) break;
    state = bpe.applyMerge(state, pairs[0].left, pairs[0].right);
    const now = len(state);
    assert.ok(now < prev, 'a merge of a pair seen >= 2 times must shorten the corpus');
    prev = now;
  }
});

test('encoding a training word reproduces its final segmentation from training', () => {
  const state = bpe.train(lab2Freqs(), { numMerges: 50 });
  const model = bpe.modelFromState(state);
  for (const w of state.words) {
    const text = w.symbols.join('').split(bpe.SPACE_MARK).join(' ');
    const enc = bpe.encode(model, text).map((t) => t.token);
    assert.deepEqual(enc, w.symbols, 'word ' + text);
  }
});

test('round trip: decode(encode(text)) === text, for English, Indic scripts, emoji, whitespace, code', () => {
  const model = toyModel();
  const samples = ['', ' ', 'The teacher is teaching the students.', 'Tokenization is the first step a language model takes.',
    'मुझे मशीन लर्निंग पढ़ना पसंद है।', 'எனக்கு இயந்திர கற்றல் படிப்பது பிடிக்கும்.', 'I love it 😍🎉',
    'def add(a, b):\n    return a + b\n', '  indented\n\ttabbed', 'Order 1234567890 shipped on 2026-11-07.',
    'ünïcödé café', 'a'.repeat(300), 'mixed 日本語 and English'];
  for (const s of samples) assert.equal(bpe.decode(bpe.encode(model, s)), s, JSON.stringify(s).slice(0, 40));
});

test('unseen characters fall back to UTF-8 bytes (no unknown token)', () => {
  const model = bpe.modelFromState(bpe.train(lab2Freqs(), { numMerges: 50 }));
  const enc = bpe.encode(model, ' playful').map((t) => t.token);
  assert.deepEqual(enc, ['▁play', '<0x66>', '<0x75>', 'l']);
  // A 3-byte Devanagari character costs 3 byte tokens in the toy.
  const hi = bpe.encode(model, 'म');
  assert.equal(hi.length, 3);
  assert.ok(hi.every((t) => t.isByte));
});

test('Lab 2 test words behave as the lesson describes', () => {
  const model = bpe.modelFromState(bpe.train(lab2Freqs(), { numMerges: 50 }));
  const enc = (w) => bpe.encode(model, ' ' + w).map((t) => t.token);
  assert.deepEqual(enc('playing'), ['▁playing']);
  assert.deepEqual(enc('staying'), ['▁staying']);
  assert.deepEqual(enc('replayer'), ['▁replay', 'e', 'r']);
  assert.ok(LAB2_TEST_WORDS.includes('playful'));
});

test('token ids are valid, unique per token string, and bytes occupy 0-255', () => {
  const model = toyModel();
  assert.equal(new Set(model.vocab).size, model.vocab.length, 'no duplicate vocabulary entries');
  assert.equal(model.vocab[0], '<0x00>');
  assert.equal(model.vocab[255], '<0xFF>');
  for (const t of bpe.encode(model, 'The students are learning.')) {
    assert.ok(Number.isInteger(t.id) && t.id >= 0 && t.id < model.vocab.length);
    assert.equal(model.vocab[t.id], t.token);
  }
});

test('more merges => fewer (or equal) tokens for English text; vocabulary grows', () => {
  const full = toyModel();
  const text = 'The teacher is teaching the students how a tokenizer works.';
  let prev = Infinity;
  let prevVocab = 0;
  for (const k of [0, 10, 40, 100, 200, full.merges.length]) {
    const m = bpe.truncateModel(full, k);
    const n = bpe.encode(m, text).length;
    assert.ok(n <= prev, `k=${k}: ${n} should be <= ${prev}`);
    assert.ok(m.vocab.length >= prevVocab);
    prev = n;
    prevVocab = m.vocab.length;
  }
  // with zero merges every character is its own token
  assert.equal(bpe.encode(bpe.truncateModel(full, 0), 'abc').length, 3);
});

test('displayToken shows ONE visible symbol (▁) for spaces, plus visible newlines and tabs', () => {
  assert.equal(bpe.displayToken('▁the'), '▁the');
  assert.equal(bpe.displayToken(' the'), '▁the', "a real tokenizer's literal space shows the same way");
  assert.equal(bpe.displayToken('\n'), '↵');
  assert.equal(bpe.displayToken('\t'), '⇥');
});

test('toy tokenizer: trains once, is cached, round-trips, and only falls back to bytes for unseen scripts/emoji', () => {
  const toy = require('../../js/core/toy.js');
  const s = 'The teacher is teaching the students.';
  const enc = toy.encode(s);
  assert.equal(enc.length, toy.count(s));
  assert.equal(toy.model(), toy.model(), 'model is cached');
  assert.equal(bpe.decode(enc), s);
  // basic ASCII (letters, digits, punctuation, newline) must NOT need byte fallback...
  const ascii = 'Hello, World! (42) "ok" a@b.com 100% [x] {y} <z> ~ ^ | _ # * & ? ; : \n';
  assert.ok(toy.encode(ascii).every((t) => !t.isByte), 'ASCII is covered by the toy alphabet');
  // ...but other scripts and emoji must (that is the lesson).
  assert.ok(toy.encode('मुझे').every((t) => t.isByte));
  assert.ok(toy.encode('😍').every((t) => t.isByte));
  const info = toy.info();
  assert.ok(info.merges > 100 && info.merges <= 400 && info.corpusKB > 3 && info.corpusKB < 10);
});
