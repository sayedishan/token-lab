const test = require('node:test');
const assert = require('node:assert/strict');
const bpe = require('../../js/core/bpe.js');
const C = require('../../js/core/context.js');
const E = require('../../js/core/estimate.js');
const CH = require('../../js/core/challenge.js');
const M = require('../../js/core/memory.js');
const { PLAYGROUND_CORPUS } = require('../../js/data/corpus.js');

// ---------- budget ----------
test('planBudget: fits and reports free space', () => {
  const b = C.planBudget({ windowSize: 8000, system: 400, history: 3000, docs: 3000, user: 150, output: 1000 });
  assert.equal(b.total, 7550);
  assert.equal(b.inputTokens, 6550);
  assert.equal(b.free, 450);
  assert.equal(b.over, 0);
  assert.equal(b.fits, true);
});

test('planBudget: reports overflow, and output counts toward the window', () => {
  // the prompt alone (7,500) fits in 8,000, but 7,500 + 1,000 reply does not
  const b = C.planBudget({ windowSize: 8000, system: 500, history: 3000, docs: 3850, user: 150, output: 1000 });
  assert.equal(b.inputTokens, 7500);
  assert.equal(b.total, 8500);
  assert.equal(b.fits, false);
  assert.equal(b.over, 500);
  assert.equal(b.free, 0);
});

test('requestCost uses per-million prices', () => {
  assert.ok(Math.abs(C.requestCost(1000000, 0, 2, 8) - 2) < 1e-12);
  assert.ok(Math.abs(C.requestCost(0, 500000, 2, 8) - 4) < 1e-12);
  assert.ok(Math.abs(C.requestCost(6400, 500, 2, 8) - 0.0168) < 1e-12);
});

// ---------- growth ----------
test('conversationGrowth: resend-all is quadratic, windowed is linear', () => {
  const full = C.conversationGrowth({ turns: 30, system: 400, userTokens: 60, assistantTokens: 150, keepTurns: Infinity });
  // turn t sends 400 + (t-1)*210 + 60
  assert.equal(full[0].input, 460);
  assert.equal(full[29].input, 400 + 29 * 210 + 60);
  const win = C.conversationGrowth({ turns: 30, system: 400, userTokens: 60, assistantTokens: 150, keepTurns: 6 });
  assert.equal(win[29].input, 400 + 6 * 210 + 60);
  assert.ok(full[29].cumulative > win[29].cumulative);
  // closed form for the full-history cumulative sum
  const n = 30;
  assert.equal(full[29].cumulative, n * (400 + 60) + 210 * (n * (n - 1)) / 2);
  // doubling turns more than doubles cumulative cost (super-linear)
  const full60 = C.conversationGrowth({ turns: 60, system: 400, userTokens: 60, assistantTokens: 150, keepTurns: Infinity });
  // linear growth would give exactly 2x; quadratic gives close to 4x (here ~3.8x because of the linear terms)
  assert.ok(full60[59].cumulative > 3 * full[29].cumulative, 'doubling turns should cost >3x');
  const win60 = C.conversationGrowth({ turns: 60, system: 400, userTokens: 60, assistantTokens: 150, keepTurns: 6 });
  assert.ok(win60[59].cumulative < 2.2 * win[29].cumulative, 'windowed cost grows roughly linearly');
});

// ---------- strategies ----------
const msgs = (spec) => spec.map(([id, role, tokens]) => ({ id, role, tokens }));
const ids = (a) => a.map((m) => m.id);

test('lastTurns never leaves an orphaned assistant reply', () => {
  const m = msgs([['s', 'system', 1], ['u1', 'user', 1], ['a1', 'assistant', 1], ['u2', 'user', 1], ['a2', 'assistant', 1], ['u3', 'user', 1]]);
  assert.deepEqual(ids(C.lastTurns(m, 1)), ['s', 'u3']);
  assert.deepEqual(ids(C.lastTurns(m, 2)), ['s', 'u2', 'a2', 'u3']);
  assert.deepEqual(ids(C.lastTurns(m, 99)), ['s', 'u1', 'a1', 'u2', 'a2', 'u3']);
  assert.deepEqual(ids(C.lastTurns(m, 0)), ['s']);
});

test('trimToFit (reference solution) passes every challenge test', () => {
  const results = CH.runTrimTests(C.trimToFit, CH.TRIM_TESTS);
  for (const r of results) assert.ok(r.pass, r.name + ' -> ' + r.detail);
  assert.equal(results.length, CH.TRIM_TESTS.length);
});

test('the displayed solution text also passes (so students never copy a broken answer)', () => {
  const fn = new Function(CH.TRIM_SOLUTION + '\n;return trimToFit;')();
  for (const r of CH.runTrimTests(fn, CH.TRIM_TESTS)) assert.ok(r.pass, r.name + ' -> ' + r.detail);
});

test('the starter code FAILS the tests (so the challenge is not already solved)', () => {
  const fn = new Function(CH.TRIM_STARTER + '\n;return trimToFit;')();
  const res = CH.runTrimTests(fn, CH.TRIM_TESTS);
  assert.ok(res.some((r) => !r.pass));
});

test('common wrong solutions are caught by the tests', () => {
  const dropNewest = (messages, max, count) => {
    const k = messages.slice();
    while (k.reduce((s, m) => s + count(m), 0) > max && k.length) k.pop();
    return k;
  };
  const dropsSystem = (messages, max, count) => {
    const k = messages.slice();
    while (k.reduce((s, m) => s + count(m), 0) > max && k.length) k.shift();
    return k;
  };
  const mutates = (messages, max, count) => {
    while (messages.reduce((s, m) => s + count(m), 0) > max) {
      const i = messages.findIndex((m, idx) => m.role !== 'system' && idx !== messages.length - 1);
      if (i === -1) break;
      messages.splice(i, 1);
    }
    return messages;
  };
  for (const [name, fn] of [['dropNewest', dropNewest], ['dropsSystem', dropsSystem], ['mutates', mutates]]) {
    assert.ok(CH.runTrimTests(fn, CH.TRIM_TESTS).some((r) => !r.pass), name + ' should fail at least one test');
  }
  assert.ok(CH.runTrimTests(() => 'oops', CH.TRIM_TESTS).every((r) => !r.pass || r.name.includes('empty') === false));
  const thrower = () => { throw new Error('boom'); };
  assert.ok(CH.runTrimTests(thrower, CH.TRIM_TESTS).every((r) => !r.pass && /boom/.test(r.detail)));
});

// ---------- rescue ----------
test('Rescue: the starting configuration is broken in the ways the lesson says', () => {
  const r = CH.evaluateRescue(CH.RESCUE.start);
  assert.equal(r.total, 1000 + 200 + 8 * 900 + 24 * 450 + 2000); // 21,200
  assert.equal(r.checks.find((c) => c.id === 'fits').pass, false);
  assert.equal(r.allPass, false);
});

test('Rescue: a valid solution exists, and so do near-misses that fit the window but fail on cost', () => {
  const good = CH.evaluateRescue({ chunks: 4, turns: 6, reserve: 800 });
  assert.equal(good.allPass, true);
  // fits the 16,000 window, but too expensive: the second constraint matters
  const pricey = CH.evaluateRescue({ chunks: 8, turns: 10, reserve: 1000 });
  assert.equal(pricey.checks.find((c) => c.id === 'fits').pass, true);
  assert.equal(pricey.checks.find((c) => c.id === 'cost').pass, false);
  assert.equal(pricey.allPass, false);
});

test('Rescue: the feasible region is neither empty nor trivially huge', () => {
  let n = 0;
  let total = 0;
  const [cmin, cmax] = CH.RESCUE.limits.chunks;
  const [tmin, tmax] = CH.RESCUE.limits.turns;
  for (let c = cmin; c <= cmax; c++) for (let t = tmin; t <= tmax; t++) for (const r of [0, 500, 800, 1000, 2000, 4000]) {
    total++;
    if (CH.evaluateRescue({ chunks: c, turns: t, reserve: r }).allPass) n++;
  }
  assert.ok(n > 5, 'at least a handful of valid answers (found ' + n + ')');
  assert.ok(n / total < 0.1, 'valid answers should be a small fraction (found ' + n + '/' + total + ')');
});

// ---------- estimators & validation ----------
test('rule-of-thumb estimators', () => {
  assert.equal(E.estimateByChars(''), 0);
  assert.equal(E.estimateByChars('abcd'), 1);
  assert.equal(E.estimateByChars('abcde'), 2);
  assert.equal(E.estimateByWords('  '), 0);
  assert.equal(E.estimateByWords('one two three'), 4); // 3 / 0.75
  assert.equal(E.estimateByChars('😍🎉'), 1, 'counts code points, not UTF-16 units');
});

test('parseWholeNumber rejects bad input with a message', () => {
  assert.deepEqual(E.parseWholeNumber('1,500', 0, 2000), { ok: true, value: 1500, error: null });
  for (const bad of ['', '  ', 'abc', '12.5', '-3', '1e3', '--1']) {
    const r = E.parseWholeNumber(bad, 0, 2000);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.ok(r.error && r.error.length > 0);
  }
  assert.equal(E.parseWholeNumber('5000', 0, 2000).ok, false);
  assert.equal(E.parseWholeNumber('5', 10, 20).ok, false);
});

test('parseDecimal', () => {
  assert.equal(E.parseDecimal('2.5', 0, 100).value, 2.5);
  assert.equal(E.parseDecimal('abc', 0, 100).ok, false);
  assert.equal(E.parseDecimal('-1', 0, 100).ok, false);
  assert.equal(E.parseDecimal('', 0, 100).ok, false);
});

// ---------- memory lab ----------
const model = bpe.modelFromState(bpe.trainFromText(PLAYGROUND_CORPUS, { numMerges: 400 }));
const count = (m) => bpe.encode(model, m.content).length;
const ask = (needs) => M.QUESTIONS.find((q) => q.needs === needs);
const run = (strategy, windowSize, lastN, q) => M.buildContext(strategy, { windowSize, lastN, question: q || M.QUESTIONS[0], count });

test('memory: keeping everything fits only in a big window, otherwise the request is rejected', () => {
  const big = run('all', 500, 2);
  assert.equal(big.fits, true);
  for (const f of Object.keys(M.FACTS)) assert.ok(M.factsInContext(big.kept).has(f));
  const small = run('all', 200, 2);
  assert.equal(small.fits, false);
  const a = M.answer(M.QUESTIONS[0], small);
  assert.equal(a.kind, 'rejected');
});

test('memory: drop-oldest protects the system prompt and the newest message', () => {
  const ctx = run('drop-oldest', 120, 2);
  assert.ok(ctx.kept.some((m) => m.id === 'sys'));
  assert.ok(ctx.kept.some((m) => m.id === 'question'));
  assert.ok(ctx.fits);
  assert.equal(M.answer(ask('name'), ctx).kind, 'forgotten', 'the name was said first, so it is dropped first');
});

test('memory: each strategy forgets DIFFERENT facts (the lesson point)', () => {
  const summary = run('summary', 300, 2);
  const have = M.factsInContext(summary.kept);
  assert.ok(have.has('name') && have.has('budget'));
  assert.ok(!have.has('diet') && !have.has('seasick'), 'the canned summary loses diet and boats on purpose');
  const drop = run('drop-oldest', 300, 2);
  const haveDrop = M.factsInContext(drop.kept);
  assert.ok(haveDrop.has('diet') && haveDrop.has('seasick'));
  assert.ok(!haveDrop.has('name'));
});

test('memory: last-N keeps exactly N previous exchanges plus the question', () => {
  const ctx = run('last-turns', 1000, 2);
  assert.deepEqual(ids(ctx.kept), ['sys', 'm7', 'm8', 'm9', 'm10', 'question']);
  const ctx1 = run('last-turns', 1000, 1);
  assert.deepEqual(ids(ctx1.kept), ['sys', 'm9', 'm10', 'question']);
});

test('memory: a known fact is answered, from the scenario table', () => {
  const ctx = run('all', 1000, 2, ask('budget'));
  const a = M.answer(ask('budget'), ctx);
  assert.equal(a.kind, 'known');
  assert.match(a.text, /40,000/);
});

test('memory: scenario data is consistent (every question needs a real fact carried by some message)', () => {
  const all = [M.SYSTEM, ...M.HISTORY, M.SUMMARY];
  for (const q of M.QUESTIONS) {
    assert.ok(M.FACTS[q.needs], q.id);
    assert.ok(all.some((m) => (m.facts || []).includes(q.needs)), q.id + ' has no source message');
  }
  for (const m of M.HISTORY) for (const f of m.facts) assert.ok(M.FACTS[f], m.id + ' -> ' + f);
});

test('memory: unknown strategy throws', () => {
  assert.throws(() => run('nope', 100, 1));
});
