/**
 * challenge.js - definitions for the final challenge (Part A + Part B).
 *
 * Part A "Rescue the support bot": tune three knobs so a request fits the
 *   window AND meets business requirements (pure arithmetic, auto-checked).
 * Part B "Write trimToFit()": the learner writes real code; it is run against
 *   data-driven test cases inside a Web Worker (see ui/code-runner.js).
 *
 * The prices below are ILLUSTRATIVE numbers invented for this exercise. They
 * are not any provider's real prices.
 */
(function (g) {
  'use strict';
  const TL = (g.TokenLab = g.TokenLab || {});

  // ---------------- Part A ----------------
  const RESCUE = {
    windowSize: 16000,
    systemTokens: 1000,
    userTokens: 200,
    tokensPerChunk: 900, // one retrieved document chunk
    tokensPerTurn: 450, // one past user+assistant exchange
    expectedReplyTokens: 500, // typical reply length, used only for cost
    priceInPerM: 2.0, // $ per 1M input tokens  (illustrative)
    priceOutPerM: 8.0, // $ per 1M output tokens (illustrative)
    maxCostPerRequest: 0.02,
    minChunks: 3,
    minTurns: 6,
    minReserve: 800,
    start: { chunks: 8, turns: 24, reserve: 2000 }, // the broken configuration
    limits: { chunks: [0, 12], turns: [0, 40], reserve: [0, 4000] },
  };

  /** Check a configuration against every requirement. */
  function evaluateRescue(cfg, S) {
    const s = S || RESCUE;
    const input = s.systemTokens + s.userTokens + cfg.chunks * s.tokensPerChunk + cfg.turns * s.tokensPerTurn;
    const total = input + cfg.reserve;
    const cost =
      (input / 1e6) * s.priceInPerM + (s.expectedReplyTokens / 1e6) * s.priceOutPerM;
    const checks = [
      {
        id: 'fits',
        label: 'Fits in the ' + s.windowSize.toLocaleString('en-US') + '-token window',
        pass: total <= s.windowSize,
        detail: total.toLocaleString('en-US') + ' of ' + s.windowSize.toLocaleString('en-US') + ' tokens used',
      },
      {
        id: 'chunks',
        label: 'At least ' + s.minChunks + ' document chunks (answers need evidence)',
        pass: cfg.chunks >= s.minChunks,
        detail: cfg.chunks + ' chunks',
      },
      {
        id: 'turns',
        label: 'Remembers at least ' + s.minTurns + ' past turns (customers should not repeat themselves)',
        pass: cfg.turns >= s.minTurns,
        detail: cfg.turns + ' turns',
      },
      {
        id: 'reserve',
        label: 'Reserves at least ' + s.minReserve + ' tokens for the reply (so answers are not cut off)',
        pass: cfg.reserve >= s.minReserve,
        detail: cfg.reserve + ' tokens reserved',
      },
      {
        id: 'cost',
        label: 'Costs no more than $' + s.maxCostPerRequest.toFixed(3) + ' per request',
        pass: cost <= s.maxCostPerRequest + 1e-12,
        detail: '$' + cost.toFixed(4) + ' per request',
      },
    ];
    return { input, total, cost, checks, allPass: checks.every((c) => c.pass) };
  }

  // ---------------- Part B ----------------
  /**
   * Data-driven test cases. Each message has a numeric `tokens` so counting is
   * deterministic. `expect` lists the ids that must remain, in order.
   */
  const M = (id, role, tokens) => ({ id, role, tokens });
  const TRIM_TESTS = [
    {
      name: 'Leaves everything alone when it already fits',
      maxTokens: 400,
      messages: [M('sys', 'system', 50), M('u1', 'user', 100), M('a1', 'assistant', 100), M('u2', 'user', 50)],
      expect: ['sys', 'u1', 'a1', 'u2'],
      hint: 'If the total is already <= maxTokens, return the messages untouched.',
    },
    {
      name: 'Drops the OLDEST messages first',
      maxTokens: 300,
      messages: [
        M('sys', 'system', 50), M('u1', 'user', 100), M('a1', 'assistant', 100),
        M('u2', 'user', 100), M('a2', 'assistant', 100), M('u3', 'user', 50),
      ],
      expect: ['sys', 'u2', 'a2', 'u3'],
      hint: 'Remove from the FRONT of the conversation (oldest), not the back. Total starts at 500 and must reach 300.',
    },
    {
      name: 'Never drops a system message, wherever it sits',
      maxTokens: 150,
      messages: [M('u1', 'user', 100), M('sys', 'system', 50), M('a1', 'assistant', 100), M('u2', 'user', 50)],
      expect: ['sys', 'u2'],
      hint: 'Skip any message whose role is "system" when choosing what to drop - even if it is not first.',
    },
    {
      name: 'Never drops the latest message, even if still too big',
      maxTokens: 200,
      messages: [M('sys', 'system', 50), M('u1', 'user', 100), M('u2', 'user', 500)],
      expect: ['sys', 'u2'],
      hint: 'The newest message is what the user is asking right now. Stop dropping when only system + latest remain.',
    },
    {
      name: 'Does not modify the array you were given',
      maxTokens: 100,
      messages: [M('sys', 'system', 40), M('u1', 'user', 60), M('u2', 'user', 60)],
      expect: ['sys', 'u2'],
      checkNoMutation: true,
      hint: 'Work on a copy (e.g. messages.slice()) - callers do not expect their array to change.',
    },
    {
      name: 'Handles an empty conversation',
      maxTokens: 100,
      messages: [],
      expect: [],
      hint: 'An empty list should come back as an empty list, without throwing.',
    },
  ];

  const TRIM_STARTER = [
    '// Return the messages that fit inside maxTokens.',
    '//  - messages: [{ id, role, tokens }], oldest first',
    '//  - countTokens(message) tells you how many tokens a message costs',
    '//  - ALWAYS keep system messages and the most recent message',
    '//  - drop the OLDEST other messages first',
    '//  - do not modify the array you receive',
    'function trimToFit(messages, maxTokens, countTokens) {',
    '  // your code here',
    '  return messages;',
    '}',
  ].join('\n');

  const TRIM_SOLUTION = [
    'function trimToFit(messages, maxTokens, countTokens) {',
    '  const kept = messages.slice();                       // 1. copy - never mutate the input',
    '  const total = () => kept.reduce((sum, m) => sum + countTokens(m), 0);',
    '',
    '  while (total() > maxTokens) {                        // 2. keep going until it fits...',
    '    const last = kept.length - 1;',
    '    const i = kept.findIndex(                          // 3. oldest message we MAY drop:',
    '      (m, idx) => m.role !== "system" && idx !== last  //    not system, not the latest',
    '    );',
    '    if (i === -1) break;                               // 4. nothing droppable left: stop',
    '    kept.splice(i, 1);',
    '  }',
    '  return kept;',
    '}',
  ].join('\n');

  /**
   * Run the test cases against a candidate function.
   * SELF-CONTAINED on purpose (no outside references): ui/code-runner.js
   * injects this function's source text into a Web Worker, and the Node unit
   * tests call it directly, so the same logic grades both.
   */
  function runTrimTests(fn, tests) {
    return tests.map(function (t) {
      const input = t.messages.map(function (m) { return Object.assign({}, m); });
      const snapshot = JSON.stringify(input);
      try {
        const out = fn(input, t.maxTokens, function (m) { return m.tokens; });
        if (!Array.isArray(out)) {
          return {
            name: t.name, pass: false, hint: t.hint,
            detail: 'Your function returned ' + (out === undefined ? 'undefined' : typeof out) + ' - expected an array of messages.',
          };
        }
        const ids = out.map(function (m) { return m && m.id; });
        let pass = ids.length === t.expect.length && ids.every(function (id, i) { return id === t.expect[i]; });
        let detail = pass
          ? 'Returned [' + ids.join(', ') + ']'
          : 'Expected [' + t.expect.join(', ') + '] but got [' + ids.join(', ') + ']';
        if (pass && t.checkNoMutation && JSON.stringify(input) !== snapshot) {
          pass = false;
          detail = 'The returned list is right, but you modified the array you were given.';
        }
        return { name: t.name, pass: pass, detail: detail, hint: pass ? '' : t.hint };
      } catch (e) {
        return { name: t.name, pass: false, detail: 'Threw an error: ' + e.message, hint: t.hint };
      }
    });
  }

  TL.challenge = { RESCUE, evaluateRescue, TRIM_TESTS, TRIM_STARTER, TRIM_SOLUTION, runTrimTests };
  if (typeof module !== 'undefined' && module.exports) module.exports = TL.challenge;
})(typeof window !== 'undefined' ? window : globalThis);
