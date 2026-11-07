const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../js/data/lesson.js');
const Q = require('../../js/data/quizzes.js');
const R = require('../../js/data/real-tokens.js');

// ---------- lesson structure ----------
test('lesson fits inside the 45-minute limit from the assignment brief', () => {
  const total = L.totalMinutes();
  assert.ok(total <= L.MAX_MINUTES, `total ${total} min exceeds ${L.MAX_MINUTES}`);
  assert.equal(total, 43, 'README/video script quote 43 minutes; update them if this changes');
});

test('optional extensions are not counted, and every timed section is counted', () => {
  const optional = L.SECTIONS.filter((s) => s.optional);
  assert.deepEqual(optional.map((s) => s.id), ['challenge'], 'only the 1.0 final challenge is an optional extension');
  for (const s of optional) assert.equal(s.minutes, 0, s.id + ' must add no minutes');
  assert.equal(L.required().length, L.SECTIONS.length - optional.length);
  assert.equal(L.totalMinutes(), L.required().reduce((n, s) => n + s.minutes, 0));
  // the extension comes AFTER the timed path, so "Next" never drops a learner into optional work mid-lesson
  assert.equal(L.SECTIONS[L.SECTIONS.length - 1].id, 'challenge');
});

test('every section has the five instructional-design fields and a unique id', () => {
  const seen = new Set();
  for (const s of L.SECTIONS) {
    assert.ok(!seen.has(s.id), 'duplicate id ' + s.id);
    seen.add(s.id);
    for (const k of ['title', 'short', 'type']) assert.ok(s[k] && s[k].length >= 4, `${s.id}.${k}`);
    for (const k of ['learn', 'why', 'where']) assert.ok(s[k] && s[k].length > 30, `${s.id}.${k} should be a full sentence`);
    // timed sections: 1-8 minutes; an optional extension is not counted, so it has none
    if (s.optional) assert.equal(s.minutes, 0, s.id + ' optional sections add no minutes');
    else assert.ok(Number.isInteger(s.minutes) && s.minutes >= 1 && s.minutes <= 8, s.id + ' minutes');
    assert.ok(s.teacher.talk.length >= 1 && s.teacher.ask && s.teacher.misconception, s.id + ' teacher notes');
  }
  // Token Lab 2.0: 10 timed sections (the two checkpoints became Token Master I and II, a completion screen was
  // added) plus the 1.0 final challenge, moved to the end as an optional extension.
  assert.equal(L.SECTIONS.length, 11);
  assert.deepEqual(L.SECTIONS.map((s) => s.id), ['start', 'why', 'lab-1', 'lab-2', 'master-1', 'lab-3', 'lab-4', 'real-world', 'master-2', 'summary', 'challenge']);
});

// ---------- quizzes ----------
const allQuestions = [Q.PREDICTION, ...Q.CHECKPOINT_1, ...Q.CHECKPOINT_2, ...Q.SCENARIOS];

test('every question is well-formed with an explanation for EVERY option', () => {
  for (const q of allQuestions) {
    assert.ok(q.stem.length > 20, q.id);
    assert.equal(q.options.length, 4, q.id + ' should have 4 options');
    assert.ok(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < q.options.length, q.id);
    for (const o of q.options) {
      assert.ok(o.text && o.text.length >= 1, q.id + ' option text');
      assert.ok(o.why && o.why.length > 20, q.id + ' option explanation');
    }
    assert.equal(new Set(q.options.map((o) => o.text)).size, 4, q.id + ' duplicate options');
  }
  assert.equal(Q.CHECKPOINT_1.length, 5);
  assert.equal(Q.CHECKPOINT_2.length, 5);
  assert.equal(Q.SCENARIOS.length, 3);
});

test('correct answers are spread across positions (no "always B" pattern)', () => {
  const positions = new Set(allQuestions.map((q) => q.correct));
  assert.ok(positions.size >= 3, 'correct answer positions used: ' + [...positions]);
  const longest = (arr) => arr.reduce((best, x, i) => { const run = i && arr[i - 1] === x ? best.run + 1 : 1; return { run, max: Math.max(best.max, run) }; }, { run: 0, max: 0 }).max;
  assert.ok(longest(allQuestions.map((q) => q.correct)) <= 2, 'no long run of the same answer position');
});

test('the correct option is not systematically the longest (length-guessing check)', () => {
  let longestIsCorrect = 0;
  for (const q of allQuestions) {
    const lens = q.options.map((o) => o.text.length);
    if (lens.indexOf(Math.max(...lens)) === q.correct) longestIsCorrect++;
  }
  assert.ok(longestIsCorrect / allQuestions.length < 0.75, `${longestIsCorrect}/${allQuestions.length} correct answers are the longest option`);
});

// ---------- recorded real-tokenizer data ----------
const sample = (id) => R.samples.find((s) => s.id === id);
const count = (id, enc) => sample(id).results[enc].count;

test('recorded data is internally consistent', () => {
  assert.match(R.recordedWith, /^tiktoken /);
  assert.ok(R.encodings.cl100k_base && R.encodings.o200k_base);
  for (const s of R.samples) {
    for (const enc of Object.keys(R.encodings)) {
      const r = s.results[enc];
      assert.equal(r.ids.length, r.count, `${s.id}/${enc} ids`);
      assert.equal(r.pieces.length, r.count, `${s.id}/${enc} pieces`);
      // when no piece is a raw-byte placeholder, the pieces must spell the text exactly
      if (!r.pieces.some((p) => /^<0x[0-9A-F]+>$/.test(p))) assert.equal(r.pieces.join(''), s.text, `${s.id}/${enc}`);
    }
    assert.equal(s.chars, Array.from(s.text).length);
    assert.equal(s.utf8Bytes, Buffer.byteLength(s.text, 'utf8'));
  }
});

test('numbers quoted in the lesson text match the recorded data', () => {
  // quiz c1-q3 and the Start prediction quote these exact figures
  assert.equal(count('hi', 'cl100k_base'), 36);
  assert.equal(count('en', 'cl100k_base'), 6);
  assert.equal(count('hi', 'o200k_base'), 11);
  assert.equal(count('plain', 'cl100k_base'), 11);
  assert.equal(sample('plain').results.cl100k_base.pieces[0], 'Token');
  assert.equal(sample('plain').results.cl100k_base.pieces[1], 'ization');
  // sanity: typos cost more than the clean sentence on both encodings
  assert.ok(count('typos', 'cl100k_base') > count('clean', 'cl100k_base'));
  assert.ok(count('typos', 'o200k_base') > count('clean', 'o200k_base'));
});

test('the "language tax" exists in the recording but shrinks in the newer tokenizer', () => {
  const ratio = (id, enc) => count(id, enc) / count('en', enc);
  for (const id of ['hi', 'ta']) assert.ok(ratio(id, 'cl100k_base') > ratio(id, 'o200k_base'), id);
  for (const id of ['hi', 'ta']) assert.ok(ratio(id, 'o200k_base') > 1, id + ' still costs more than English');
});

test('observations stated in Lab 1 are true of the recorded data', () => {
  const pieces = (id, enc) => sample(id).results[enc].pieces;
  for (const enc of ['cl100k_base', 'o200k_base']) {
    // numbers are cut into groups of at most 3 digits
    const num = pieces('numbers', enc);
    const i = num.indexOf('123');
    assert.deepEqual(num.slice(i, i + 4), ['123', '456', '789', '0'], enc + ' digit grouping');
    // whitespace attaches to the NEXT word in code (" return"), not to its own token
    assert.ok(pieces('code', enc).includes(' return'), enc + ' leading-space token');
    // emoji fall back to raw byte pieces
    assert.ok(pieces('emoji', enc).some((p) => /^<0x[0-9A-F]+>$/.test(p)), enc + ' emoji bytes');
    // a lone typo word is split into smaller pieces than its correct spelling
    assert.ok(pieces('typos', enc).length > pieces('clean', enc).length - 1);
  }
  // Hindi on the older vocabulary falls back to raw bytes heavily; the newer one does not
  const rawBytes = (enc) => pieces('hi', enc).filter((p) => /^<0x[0-9A-F]+>$/.test(p)).length;
  assert.ok(rawBytes('cl100k_base') >= 15);
  assert.equal(rawBytes('o200k_base'), 0);
});
