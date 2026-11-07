/**
 * context.js - context-window arithmetic and memory-management strategies.
 *
 * "Context window" = the maximum number of tokens a model can handle in ONE
 * request. In most chat APIs the input tokens (instructions, history,
 * retrieved text, new message) PLUS the output you allow (max tokens) must
 * fit inside it; providers differ in details, so check their documentation.
 *
 * Everything here is plain arithmetic on token counts - no model involved.
 */
(function (g) {
  'use strict';
  const TL = (g.TokenLab = g.TokenLab || {});

  /** The five things competing for space, in the order the lesson draws them. */
  const SEGMENTS = [
    { key: 'system', label: 'System prompt' },
    { key: 'history', label: 'Conversation history' },
    { key: 'docs', label: 'Retrieved documents' },
    { key: 'user', label: 'New user message' },
    { key: 'output', label: 'Reserved for reply' },
  ];

  /**
   * Work out whether a request fits.
   * @param {{windowSize:number, system:number, history:number, docs:number, user:number, output:number}} cfg
   */
  function planBudget(cfg) {
    const parts = SEGMENTS.map((s) => ({ key: s.key, label: s.label, tokens: Math.max(0, cfg[s.key] || 0) }));
    const total = parts.reduce((sum, p) => sum + p.tokens, 0);
    const inputTokens = total - parts.find((p) => p.key === 'output').tokens;
    return {
      windowSize: cfg.windowSize,
      parts,
      inputTokens,
      outputTokens: parts.find((p) => p.key === 'output').tokens,
      total,
      free: Math.max(0, cfg.windowSize - total),
      over: Math.max(0, total - cfg.windowSize),
      fits: total <= cfg.windowSize,
    };
  }

  /** Cost of one request given prices per 1,000,000 tokens. Result in dollars. */
  function requestCost(inputTokens, outputTokens, inputPricePerM, outputPricePerM) {
    return (inputTokens / 1e6) * inputPricePerM + (outputTokens / 1e6) * outputPricePerM;
  }

  /**
   * How many tokens get SENT on each turn of a chat.
   * Chat APIs are stateless: the whole conversation you want the model to
   * "remember" is sent again with every request.
   *
   * @param {{turns:number, system:number, userTokens:number, assistantTokens:number, keepTurns:number}} cfg
   *   keepTurns = Infinity -> resend everything; k -> resend only the last k exchanges.
   * @returns {Array<{turn:number, input:number, cumulative:number}>}
   */
  function conversationGrowth(cfg) {
    const out = [];
    let cumulative = 0;
    const pair = cfg.userTokens + cfg.assistantTokens;
    for (let t = 1; t <= cfg.turns; t++) {
      const remembered = Math.min(t - 1, cfg.keepTurns);
      const input = cfg.system + remembered * pair + cfg.userTokens;
      cumulative += input;
      out.push({ turn: t, input, cumulative });
    }
    return out;
  }

  // ------------------------------------------------------------------
  // Memory strategies (used by Lab 4 and the coding challenge)
  // ------------------------------------------------------------------

  /**
   * REFERENCE SOLUTION for the coding challenge.
   * Keep every system message and the most recent message. Drop the OLDEST
   * other messages first until the total fits (or nothing droppable is left).
   * Never mutates its input.
   *
   * @param {Array<{role:string}>} messages
   * @param {number} maxTokens
   * @param {(m:object)=>number} countTokens
   */
  function trimToFit(messages, maxTokens, countTokens) {
    const kept = messages.slice(); // copy: do not mutate the caller's array
    const total = () => kept.reduce((sum, m) => sum + countTokens(m), 0);
    while (total() > maxTokens) {
      const last = kept.length - 1;
      const i = kept.findIndex((m, idx) => m.role !== 'system' && idx !== last);
      if (i === -1) break; // nothing left that we are allowed to drop
      kept.splice(i, 1);
    }
    return kept;
  }

  /**
   * Strategy: keep only the last `n` user/assistant exchanges (plus system).
   * A "turn" here is one user message and the assistant reply that follows it.
   */
  function lastTurns(messages, n) {
    const system = messages.filter((m) => m.role === 'system');
    const convo = messages.filter((m) => m.role !== 'system');
    if (n <= 0) return system;
    // Start at the n-th user message counted from the end, so we never keep
    // an assistant reply whose question was dropped (an "orphan").
    const userIdx = [];
    convo.forEach((m, i) => {
      if (m.role === 'user') userIdx.push(i);
    });
    const start = userIdx.length > n ? userIdx[userIdx.length - n] : 0;
    return system.concat(convo.slice(start));
  }

  TL.context = { SEGMENTS, planBudget, requestCost, conversationGrowth, trimToFit, lastTurns };
  if (typeof module !== 'undefined' && module.exports) module.exports = TL.context;
})(typeof window !== 'undefined' ? window : globalThis);
