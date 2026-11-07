/**
 * survival.js - engine for the "Context Window Survival" game (Lab 3).
 *
 * WHAT THIS IS: a DETERMINISTIC educational simulation. There is no language
 * model and no randomness. Each round gives the student a request to assemble
 * (system rules + history + retrieved documents + the new message + room for
 * the answer). The engine then checks plain rules:
 *   - does the total fit in the window?   (the real constraint)
 *   - is each fact the question needs still in the history that was sent?
 *   - is the evidence chunk the question needs included?
 *   - is the policy rule the question needs still in the system prompt?
 *   - is there room for the whole answer?
 * What it deliberately does NOT claim: that every model rejects an overflowing
 * request the same way (policies differ), or how a real model would word an answer.
 * Token sizes are round game numbers, not measurements.
 */
(function (g) {
  'use strict';
  const TL = (g.TokenLab = g.TokenLab || {});

  const LIVES = 3;
  const PASS_SCORE = 70;
  const WARN_RATIO = 0.85;
  const CAPACITY = { min: 900, max: 2000, step: 100, default: 1400 };
  const RESERVE = { min: 0, max: 600, step: 50, default: 200 };

  const FACTS = {
    order: 'Order number #4821',
    name: "Customer's name",
    damaged: 'The blender arrived damaged',
    promo: 'Promo code (small talk)',
    cat: 'Cat story (small talk)',
    status: 'Order status (shipped)',
    decision: 'Refund decision (declined, replacement offered)',
    plan: 'Replacement plan',
  };

  const RULES = [
    { id: 'r-privacy', text: "Never share another customer's data.", tokens: 60, critical: true, ifMissing: "shares another customer's order details" },
    { id: 'r-refund', text: 'Refunds only within 30 days of purchase.', tokens: 60, critical: true, ifMissing: 'approves a refund after 45 days' },
    { id: 'r-style', text: 'Keep answers under 80 words.', tokens: 40, critical: false, ifMissing: 'writes longer answers (no real harm)' },
  ];

  const DOCS = {
    tracking: { id: 'tracking', title: 'Order tracking and delivery times', tokens: 220, trimTokens: 110, trimSafe: true },
    returns: { id: 'returns', title: 'Returns and refunds policy', tokens: 220, trimTokens: 110, trimSafe: true },
    damage: { id: 'damage', title: 'Damaged items: claim steps', tokens: 220, trimTokens: 110, trimSafe: false },
    promo: { id: 'promo', title: 'Promo code terms', tokens: 220, trimTokens: 110, trimSafe: true },
    brand: { id: 'brand', title: 'Our brand story', tokens: 220, trimTokens: 110, trimSafe: true },
  };

  const HISTORY0 = [
    { id: 'h1', role: 'user', text: "Hi, I'm Priya. I ordered a blender, order #4821.", tokens: 45, facts: ['name', 'order'], gist: ['order'] },
    { id: 'h2', role: 'assistant', text: 'Hi Priya! How can I help?', tokens: 20, facts: [], gist: [] },
    { id: 'h3', role: 'user', text: 'It arrived damaged: the jar is cracked.', tokens: 40, facts: ['damaged'], gist: ['damaged'] },
    { id: 'h4', role: 'assistant', text: "Sorry to hear that. I'll look into it.", tokens: 30, facts: [], gist: [] },
    { id: 'h5', role: 'user', text: 'I used promo code SAVE10, if that matters.', tokens: 40, facts: ['promo'], gist: [] },
    { id: 'h6', role: 'assistant', text: 'Noted. One moment.', tokens: 15, facts: [], gist: [] },
    { id: 'h7', role: 'user', text: 'My cat knocked the box over, funny story.', tokens: 40, facts: ['cat'], gist: [] },
    { id: 'h8', role: 'assistant', text: 'Ha! Glad the cat is okay.', tokens: 25, facts: [], gist: [] },
  ];

  const ROUNDS = [
    {
      title: 'Where is my order?',
      user: { text: 'Where is my order?', tokens: 40 },
      needs: { facts: ['order'], docs: ['tracking'], rules: [] },
      answerTokens: 120,
      reply: { text: 'Your order has shipped and arrives Friday.', facts: ['status'] },
      docOrder: ['tracking', 'promo', 'returns', 'brand', 'damage'],
    },
    {
      title: 'I want a refund',
      user: { text: 'I bought it 45 days ago and I want a refund.', tokens: 50 },
      needs: { facts: ['order'], docs: ['returns'], rules: ['r-refund'] },
      answerTokens: 150,
      reply: { text: "I can't refund after 30 days, but I can offer a replacement.", facts: ['decision'] },
      docOrder: ['returns', 'promo', 'tracking', 'damage', 'brand'],
    },
    {
      title: "A colleague's order",
      user: { text: 'My colleague Ananya also ordered one. Can you read me her order? And what can you do about my damaged jar?', tokens: 70 },
      needs: { facts: ['damaged'], docs: ['damage'], rules: ['r-privacy'] },
      answerTokens: 160,
      reply: { text: "I can't share Ananya's order. For the damaged jar I will arrange a replacement.", facts: ['plan'] },
      docOrder: ['damage', 'returns', 'brand', 'promo', 'tracking'],
    },
    {
      title: 'Summarise everything',
      user: { text: 'Please summarise everything we agreed.', tokens: 40 },
      needs: { facts: ['order', 'damaged', 'decision', 'plan'], docs: [], rules: [] },
      answerTokens: 200,
      reply: { text: 'Order #4821: damaged blender, refund declined, replacement arranged.', facts: [] },
      docOrder: ['returns', 'damage', 'tracking', 'promo', 'brand'],
    },
  ];

  const SUMMARY_TOKENS = 60;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function roundDocs(n) {
    return ROUNDS[n].docOrder.map((id) => ({ id, on: true, trimmed: false }));
  }

  /** Start a new game. Capacity can only be chosen here (before the first request). */
  function newGame(opts) {
    const capacity = clamp(Math.round(((opts && opts.capacity) || CAPACITY.default) / CAPACITY.step) * CAPACITY.step, CAPACITY.min, CAPACITY.max);
    return {
      capacity,
      lives: LIVES,
      round: 0,
      status: 'playing', // playing | won | done | lost
      history: HISTORY0.map((m) => Object.assign({ on: true }, m)),
      rules: RULES.map((r) => ({ id: r.id, on: true })),
      docs: roundDocs(0),
      reserve: RESERVE.default,
      results: [],
      last: null, // outcome of the most recent Send
    };
  }

  const ruleDef = (id) => RULES.find((r) => r.id === id);

  /** Token usage of the request as currently assembled. */
  function usage(s) {
    const round = ROUNDS[Math.min(s.round, ROUNDS.length - 1)];
    const system = s.rules.filter((r) => r.on).reduce((n, r) => n + ruleDef(r.id).tokens, 0);
    const history = s.history.filter((m) => m.on).reduce((n, m) => n + m.tokens, 0);
    const docs = s.docs.filter((d) => d.on).reduce((n, d) => n + (d.trimmed ? DOCS[d.id].trimTokens : DOCS[d.id].tokens), 0);
    const user = round.user.tokens;
    const total = system + history + docs + user + s.reserve;
    const ratio = total / s.capacity;
    return { system, history, docs, user, reserve: s.reserve, total, capacity: s.capacity, free: Math.max(0, s.capacity - total), over: Math.max(0, total - s.capacity), ratio, level: total > s.capacity ? 'over' : ratio >= WARN_RATIO ? 'warn' : 'ok' };
  }

  // ---- actions (all return a NEW state) -----------------------------------
  const copy = (s, patch) => Object.assign({}, s, patch);

  const toggleRule = (s, id) => copy(s, { rules: s.rules.map((r) => (r.id === id ? Object.assign({}, r, { on: !r.on }) : r)) });
  const toggleMsg = (s, id) => copy(s, { history: s.history.map((m) => (m.id === id ? Object.assign({}, m, { on: !m.on }) : m)) });
  const toggleDoc = (s, id) => copy(s, { docs: s.docs.map((d) => (d.id === id ? Object.assign({}, d, { on: !d.on }) : d)) });
  const setReserve = (s, v) => copy(s, { reserve: clamp(Math.round(v / RESERVE.step) * RESERVE.step, RESERVE.min, RESERVE.max) });
  /** Shorten every included chunk to a snippet (about half the tokens). Some chunks lose detail doing it. */
  const trimDocs = (s) => copy(s, { docs: s.docs.map((d) => (d.on ? Object.assign({}, d, { trimmed: true }) : d)) });

  /** Exclude the n oldest INCLUDED messages. */
  function dropOldest(s, n) {
    let left = n;
    return copy(s, { history: s.history.map((m) => (m.on && left-- > 0 ? Object.assign({}, m, { on: false }) : m)) });
  }

  /**
   * Replace every included message except the last two with ONE summary.
   * Lossy by design: it keeps only each message's `gist` facts.
   */
  function summarise(s) {
    const inc = s.history.filter((m) => m.on);
    if (inc.length <= 3) return s;
    const keep = inc.slice(-2);
    const old = inc.slice(0, -2);
    const facts = [];
    old.forEach((m) => m.gist.forEach((f) => !facts.includes(f) && facts.push(f)));
    const summary = { id: 'sum' + s.round + '-' + s.history.length, role: 'summary', text: 'Summary of earlier chat: ' + (facts.map((f) => FACTS[f]).join('; ') || 'nothing important') + '.', tokens: SUMMARY_TOKENS, facts, gist: facts, on: true };
    return copy(s, { history: [summary].concat(keep) });
  }

  // ---- evaluating a round --------------------------------------------------
  const MISSING_FACT = 25;
  const MISSING_DOC = 30;
  const MISSING_RULE = 35;
  const TRUNCATED = 20;

  function evaluate(s) {
    const round = ROUNDS[s.round];
    const have = new Set();
    s.history.filter((m) => m.on).forEach((m) => m.facts.forEach((f) => have.add(f)));
    const checks = [];
    let penalty = 0;
    for (const f of round.needs.facts) {
      const ok = have.has(f);
      if (!ok) penalty += MISSING_FACT;
      checks.push({ kind: 'fact', ok, label: FACTS[f], detail: ok ? 'Still in the request, so the assistant can use it.' : 'No message carrying this is in the request any more. A real model cannot use what it is not sent and might guess.' });
    }
    for (const id of round.needs.docs) {
      const d = s.docs.find((x) => x.id === id);
      const included = !!(d && d.on);
      const safe = included && (!d.trimmed || DOCS[id].trimSafe);
      if (!safe) penalty += MISSING_DOC;
      checks.push({ kind: 'doc', ok: safe, label: DOCS[id].title, detail: safe ? 'The evidence the answer needs is included.' : included ? 'You trimmed this chunk and the steps the answer needed were cut off.' : 'This chunk is not in the request, so the answer would have no evidence.' });
    }
    for (const id of round.needs.rules) {
      const r = s.rules.find((x) => x.id === id);
      const ok = !!(r && r.on);
      if (!ok) penalty += MISSING_RULE;
      checks.push({ kind: 'rule', ok, label: ruleDef(id).text, detail: ok ? 'The rule is in the system prompt, so the assistant follows it.' : 'You removed this rule, so the assistant ' + ruleDef(id).ifMissing + '.' });
    }
    const truncated = s.reserve < round.answerTokens;
    if (truncated) penalty += TRUNCATED;
    checks.push({ kind: 'reserve', ok: !truncated, label: 'Room for the answer', detail: truncated ? 'You reserved ' + s.reserve + ' tokens but the answer needs ' + round.answerTokens + ', so it is cut off mid-sentence.' : 'You reserved ' + s.reserve + ' tokens; the answer needs ' + round.answerTokens + '.' });
    const score = Math.max(0, 100 - penalty);
    return { checks, score, pass: score >= PASS_SCORE, truncated };
  }

  /**
   * Send the request.
   *  - over the window  -> rejected, lose a life, the round does not advance;
   *  - otherwise        -> evaluated; the exchange is appended to history and the next round begins.
   */
  function send(s) {
    if (s.status !== 'playing') return s;
    const u = usage(s);
    if (u.total > s.capacity) {
      const lives = s.lives - 1;
      return copy(s, { lives, status: lives <= 0 ? 'lost' : 'playing', last: { rejected: true, over: u.over, total: u.total, round: s.round, livesLeft: lives } });
    }
    const round = ROUNDS[s.round];
    const ev = evaluate(s);
    const result = { round: s.round, title: round.title, score: ev.score, pass: ev.pass, checks: ev.checks, total: u.total, truncated: ev.truncated };
    // Messages the student switched off are gone for good (that is what truncation does).
    const kept = s.history.filter((m) => m.on);
    const replyTokens = Math.min(s.reserve, round.answerTokens);
    const userMsg = { id: 'u' + s.round, role: 'user', text: round.user.text, tokens: round.user.tokens, facts: [], gist: [], on: true };
    const replyMsg = { id: 'a' + s.round, role: 'assistant', text: round.reply.text, tokens: replyTokens, facts: ev.truncated ? [] : round.reply.facts, gist: ev.truncated ? [] : round.reply.facts, on: true };
    const nextRound = s.round + 1;
    const results = s.results.concat([result]);
    const finished = nextRound >= ROUNDS.length;
    const avg = results.reduce((n, r) => n + r.score, 0) / results.length;
    return copy(s, {
      history: kept.concat([userMsg, replyMsg]),
      round: finished ? s.round : nextRound,
      docs: finished ? s.docs : roundDocs(nextRound),
      reserve: RESERVE.default,
      results,
      status: finished ? (avg >= PASS_SCORE ? 'won' : 'done') : 'playing',
      last: Object.assign({ rejected: false }, result),
    });
  }

  /** Points toward XP: up to 20 per round. */
  const roundPoints = (score) => Math.round((score / 100) * 20);

  function summary(s) {
    const n = s.results.length;
    const avg = n ? s.results.reduce((a, r) => a + r.score, 0) / n : 0;
    return { rounds: n, average: Math.round(avg), points: s.results.reduce((a, r) => a + roundPoints(r.score), 0), won: s.status === 'won' };
  }

  TL.survival = { LIVES, PASS_SCORE, WARN_RATIO, CAPACITY, RESERVE, FACTS, RULES, DOCS, ROUNDS, HISTORY0, newGame, usage, toggleRule, toggleMsg, toggleDoc, setReserve, trimDocs, dropOldest, summarise, send, roundPoints, summary, ruleDef };
  if (typeof module !== 'undefined' && module.exports) module.exports = TL.survival;
})(typeof window !== 'undefined' ? window : globalThis);
