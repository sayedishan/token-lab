const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../js/core/master.js');
const gam = require('../../js/core/gamification.js');
const modes = require('../../js/core/modes.js');
const R = require('../../js/data/real-tokens.js');

const B = M.build();
const mcLike = B.questions.filter((q) => q.type === 'mc');

test('structure: 5 levels x 2 questions, unique ids, every option explained', () => {
  assert.equal(B.levels.length, 5);
  assert.ok(B.levels.every((l) => l.questions.length === 2));
  assert.equal(new Set(B.questions.map((q) => q.id)).size, 10);
  for (const q of B.questions) {
    assert.ok(q.stem.length > 20 && q.hint.length > 10, q.id);
    if (q.options) for (const o of q.options) assert.ok(o.text && o.why && o.why.length > 15, q.id + ' option');
  }
});

test('variety: more than one question type, and types differ within levels', () => {
  const types = new Set(B.questions.map((q) => q.type));
  assert.deepEqual([...types].sort(), ['mc', 'multi', 'num']);
  assert.ok(B.levels.filter((l) => new Set(l.questions.map((q) => q.type)).size === 2).length >= 3, 'most levels mix two types');
});

test('ANSWER POSITION is not predictable: all four used, none twice in a row, none dominant', () => {
  const pos = mcLike.map((q) => q.correct);
  assert.deepEqual([...new Set(pos)].sort(), [0, 1, 2, 3], 'positions used: ' + pos);
  for (let i = 1; i < pos.length; i++) assert.notEqual(pos[i], pos[i - 1], 'same position twice in a row at ' + i);
  const counts = [0, 1, 2, 3].map((p) => pos.filter((x) => x === p).length);
  assert.ok(Math.max(...counts) <= Math.ceil(mcLike.length / 2), 'no position holds more than half: ' + counts);
});

test('ANSWER LENGTH does not give the answer away', () => {
  let longest = 0;
  let shortest = 0;
  for (const q of mcLike) {
    const lens = q.options.map((o) => o.text.length);
    const L = lens[q.correct];
    if (L === Math.max(...lens) && lens.filter((x) => x === L).length === 1) longest++;
    if (L === Math.min(...lens) && lens.filter((x) => x === L).length === 1) shortest++;
  }
  assert.ok(longest / mcLike.length <= 0.4, 'correct is the unique longest in ' + longest + '/' + mcLike.length);
  assert.ok(shortest / mcLike.length <= 0.4, 'correct is the unique shortest in ' + shortest + '/' + mcLike.length);
});

test('the multi-select answer set is not a position pattern either (and is a strict subset)', () => {
  const q = B.byId.m7;
  assert.ok(q.correctSet.length > 1 && q.correctSet.length < q.options.length);
  assert.notDeepEqual(q.correctSet, [0, 1, 2], 'not simply the first few');
  assert.notDeepEqual(q.correctSet, q.correctSet.map((_, i) => i * 2), 'not simply alternating');
});

// ----- answers verified INDEPENDENTLY of the engine (hand-derived) --------------------
test('m2: the Hindi byte question matches the UTF-8 byte count (independent check)', () => {
  const hi = R.samples.find((s) => s.id === 'hi').text;
  assert.equal(B.byId.m2.answer, Buffer.byteLength(hi, 'utf8'));
  assert.equal(B.byId.m2.answer, 86);
  assert.match(B.byId.m2.stem, /32 characters, 86 bytes/);
});

test('m3 / m4: pair and merge-count answers match a hand calculation', () => {
  // corpus: cat x5, cot x2, coat x4, goat x3 (each with a leading word marker)
  // pair totals: at = 5+4+3 = 12; marker+c = 5+2+4 = 11; o+a = 4+3 = 7; c+o = 2+4 = 6  -> "a + t" wins
  const q = B.byId.m3;
  assert.equal(q.options[q.correct].text, 'a + t');
  const wrong = q.options.filter((_, i) => i !== q.correct).map((o) => o.text).sort();
  assert.deepEqual(wrong, ['c + o', 'o + a', '▁ + c'].sort());
  // hand-computed token totals: start 4*5 + 4*2 + 5*4 + 5*3 = 63; after "at": 51; after "marker+c": 40
  assert.equal(B.byId.m4.answer, 63 - 12 - 11);
  assert.equal(B.byId.m4.answer, 40);
  assert.match(B.byId.m4.explain, /63 tokens/);
});

test('m3: the "obvious" distractor really is a trap (it appears in MORE words but has a lower total)', () => {
  const q = B.byId.m3;
  const trap = q.options.find((o) => o.text === '▁ + c');
  assert.match(trap.why, /11 times/);
  assert.match(q.options[q.correct].why, /12 times/);
});

test('m6: the budget answer is plain arithmetic', () => {
  const total = 450 + 2600 + 3200 + 150 + 1800;
  assert.equal(total, 8200);
  assert.equal(B.byId.m6.answer, total - 8000);
  assert.equal(B.byId.m6.answer, 200);
});

test('m9: exactly ONE option fixes the request without breaking evidence, rules or reply room', () => {
  const q = B.byId.m9;
  const window = 2000;
  const base = { system: 160, history: 840, docs: 1100, user: 50, output: 200 };
  const total = (p) => Object.values(Object.assign({}, base, p)).reduce((a, b) => a + b, 0);
  assert.equal(total({}), 2350);
  const outcomes = {
    'Drop the three least relevant retrieved chunks': total({ docs: 440 }),
    'Cut the reply reserve to zero so nothing is held back': total({ output: 0 }),
    'Remove the system prompt to free up its tokens': total({ system: 0 }),
    'Drop all five retrieved chunks to save the most space': total({ docs: 0 }),
  };
  assert.equal(outcomes['Drop the three least relevant retrieved chunks'], 1690);
  assert.equal(q.options[q.correct].text, 'Drop the three least relevant retrieved chunks');
  // the three wrong answers are wrong for three DIFFERENT reasons
  assert.ok(outcomes['Cut the reply reserve to zero so nothing is held back'] > window, 'still over');
  assert.ok(outcomes['Remove the system prompt to free up its tokens'] > window, 'still over');
  assert.ok(outcomes['Drop all five retrieved chunks to save the most space'] <= window, 'fits but has no evidence');
  for (const o of q.options) assert.match(o.why, /Total after this change/);
});

// ----- scoring, evaluating and unlocking -----------------------------------------------
test('evaluate: mc, num (with validation) and multi', () => {
  assert.equal(M.evaluate(B.byId.m1, B.byId.m1.correct).correct, true);
  assert.equal(M.evaluate(B.byId.m1, (B.byId.m1.correct + 1) % 4).correct, false);
  assert.equal(M.evaluate(B.byId.m6, '200').correct, true);
  assert.equal(M.evaluate(B.byId.m6, ' 200 ').correct, true);
  assert.equal(M.evaluate(B.byId.m6, '199').correct, false);
  for (const bad of ['', 'abc', '-3', '12.5', '1e3']) assert.equal(M.evaluate(B.byId.m6, bad).invalid, true, JSON.stringify(bad));
  const q = B.byId.m7;
  assert.equal(M.evaluate(q, q.correctSet).correct, true);
  assert.equal(M.evaluate(q, q.correctSet.slice().reverse()).correct, true, 'order does not matter');
  const partial = M.evaluate(q, [q.correctSet[0]]);
  assert.equal(partial.correct, false);
  assert.equal(partial.missed.length, q.correctSet.length - 1);
  const over = M.evaluate(q, q.correctSet.concat([0]));
  assert.equal(over.correct, false);
  assert.deepEqual(over.wrong, [0]);
  assert.equal(M.evaluate(q, []).correct, false);
  assert.throws(() => M.evaluate({ type: 'nope' }, 1));
});

test('points: first try 10, second 6, third or revealed 2, hint costs 2, never negative', () => {
  assert.equal(M.questionPoints(1, false, false), 10);
  assert.equal(M.questionPoints(2, false, false), 6);
  assert.equal(M.questionPoints(3, false, false), 2);
  assert.equal(M.questionPoints(1, false, true), 2);
  assert.equal(M.questionPoints(1, true, false), 8);
  assert.equal(M.questionPoints(3, true, false), 0);
  assert.equal(M.questionPoints(5, true, true), 0);
});

const answered = (ids, pts) => ({ q: Object.fromEntries(ids.map((id) => [id, { points: pts, done: true }])) });

test('unlocking: level 1 is open; each level needs the previous one COMPLETE', () => {
  assert.equal(M.isUnlocked({}, 1), true);
  assert.equal(M.isUnlocked({}, 2), false);
  assert.equal(M.isUnlocked(answered(['m1'], 10), 2), false, 'half a level is not enough');
  assert.equal(M.isUnlocked(answered(['m1', 'm2'], 10), 2), true);
  assert.equal(M.isUnlocked(answered(['m1', 'm2'], 10), 3), false, 'cannot skip a level');
  assert.equal(M.isUnlocked(answered(B.questions.slice(0, 8).map((q) => q.id), 10), 5), true);
});

test('mastery: percent, tier and the badge threshold', () => {
  const all = B.questions.map((q) => q.id);
  assert.equal(M.mastery(answered(all, 10)).percent, 100);
  assert.equal(M.mastery(answered(all, 10)).tier, 'Token Master');
  assert.equal(M.mastery(answered(all, 10)).earnedBadge, true);
  assert.equal(M.mastery(answered(all, 8)).percent, 80);
  assert.equal(M.mastery(answered(all, 8)).earnedBadge, true, '80% is the threshold');
  assert.equal(M.mastery(answered(all, 6)).earnedBadge, false);
  assert.equal(M.mastery(answered(all, 6)).tier, 'Developing');
  assert.equal(M.mastery(answered(all.slice(0, 9), 10)).earnedBadge, false, 'must finish every level');
  assert.equal(M.mastery({}).percent, 0);
});

test('Token Master XP caps match the gamification catalogue (10 per question + 10 per level)', () => {
  assert.equal(gam.MASTER_XP, B.questions.length * 10 + B.levels.length * 10);
});

test('the optional practice bank keeps every existing question that is not in the main game', () => {
  assert.equal(B.practice.length, 9);
  const ids = new Set(B.practice.map((q) => q.id));
  assert.equal(ids.size, 9);
  for (const q of B.practice) assert.ok(q.options.every((o) => o.why));
});

test('the toy-tokenizer question agrees with the visualiser (same function, same answer)', () => {
  const toy = require('../../js/core/toy.js');
  const hi = R.samples.find((s) => s.id === 'hi').text;
  assert.equal(toy.count(hi), B.byId.m2.answer);
  assert.equal(modes.utf8Length(hi), B.byId.m2.answer);
});
