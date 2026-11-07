/**
 * memory.js - logic for Lab 4 ("a chat that forgets").
 *
 * IMPORTANT - what this is and is not:
 *   This is a SIMULATION OF CONTEXT MECHANICS, not a language model.
 *   Each message in the scenario is tagged by hand with the facts it contains.
 *   The "assistant" can only report a fact if some message still inside the
 *   context window carries that fact. That is the real constraint: a model
 *   cannot use what is not in its prompt. What this simulation deliberately
 *   leaves out: a real model may guess or invent an answer when information
 *   is missing, and may also use information unevenly across a long context
 *   (Liu et al., "Lost in the Middle", arXiv:2307.03172).
 *
 *   The hand-written summary used by the "summarise" strategy is also canned.
 *   In real systems a model writes the summary: that costs extra tokens and can
 *   silently drop details, which is the point this lab demonstrates.
 */
(function (g) {
  'use strict';
  const TL = (g.TokenLab = g.TokenLab || {});

  /** Facts the user shares, and what the assistant says when it still knows them. */
  const FACTS = {
    name: { label: 'Name', answer: 'Your name is Meera.' },
    destination: { label: 'Destination', answer: 'You are going to Goa, in December.' },
    days: { label: 'Trip length', answer: 'You have five days.' },
    budget: { label: 'Budget', answer: 'Your budget is 40,000 rupees in total.' },
    diet: { label: 'Diet', answer: 'You are vegetarian.' },
    seasick: { label: 'Boats', answer: 'You get seasick, so no boat trips.' },
  };

  /** Questions the student can ask at the end. Each needs exactly one fact. */
  const QUESTIONS = [
    { id: 'q-name', text: 'What is my name?', needs: 'name' },
    { id: 'q-dest', text: 'Where am I travelling to?', needs: 'destination' },
    { id: 'q-days', text: 'How many days do I have?', needs: 'days' },
    { id: 'q-budget', text: 'What is my total budget?', needs: 'budget' },
    { id: 'q-diet', text: 'What do I eat?', needs: 'diet' },
    { id: 'q-boats', text: 'What did I say about boat trips?', needs: 'seasick' },
  ];

  /** The earlier conversation. `facts` marks which facts each message carries. */
  const HISTORY = [
    { id: 'm1', role: 'user', content: 'Hi, I am Meera and I am planning a trip to Goa in December.', facts: ['name', 'destination'] },
    { id: 'm2', role: 'assistant', content: 'Lovely! That is a great time of year. How long can you stay, and what is your budget?', facts: [] },
    { id: 'm3', role: 'user', content: 'Five days, and my budget is 40,000 rupees in total.', facts: ['days', 'budget'] },
    { id: 'm4', role: 'assistant', content: 'That works well for a mid-range stay. Do you have any food or activity preferences?', facts: [] },
    { id: 'm5', role: 'user', content: 'I am vegetarian, and I get seasick, so no boat trips please.', facts: ['diet', 'seasick'] },
    { id: 'm6', role: 'assistant', content: 'Understood, I will plan around that. Would you like beach areas or quieter villages?', facts: [] },
    { id: 'm7', role: 'user', content: 'Quieter villages, please.', facts: [] },
    { id: 'm8', role: 'assistant', content: 'Then Palolem or Assagao are good choices. Both are calm and easy to explore on foot.', facts: [] },
    { id: 'm9', role: 'user', content: 'What should I do on the first day?', facts: [] },
    { id: 'm10', role: 'assistant', content: 'Start with a slow morning at the beach, then a relaxed lunch and an evening walk through the local market.', facts: [] },
  ];

  const SYSTEM = {
    id: 'sys', role: 'system',
    content: 'You are TripBuddy, a friendly travel assistant. Keep every answer short.',
    facts: [],
  };

  /** Canned summary used by the "summarise" strategy. It LOSES diet and seasick on purpose. */
  const SUMMARY = {
    id: 'summary', role: 'system', isSummary: true,
    content: 'Summary of earlier chat: the user is Meera, planning five days in Goa in December with a 40,000-rupee budget.',
    facts: ['name', 'destination', 'days', 'budget'],
  };

  const STRATEGIES = [
    { id: 'all', label: 'Keep everything', blurb: 'Send the whole conversation every time. Simple - until it no longer fits.' },
    { id: 'drop-oldest', label: 'Drop oldest', blurb: 'Remove the oldest messages first until it fits. The system prompt and the newest message are protected.' },
    { id: 'last-turns', label: 'Last N exchanges', blurb: 'Keep only the most recent N question-and-answer pairs. Predictable, but blind to what matters.' },
    { id: 'summary', label: 'Summarise old turns', blurb: 'Replace everything except the last 2 exchanges with a short summary. Cheaper, but lossy.' },
  ];

  /** Wrap a question as the newest user message. */
  function questionMessage(q) {
    return { id: 'question', role: 'user', content: q.text, facts: [], isQuestion: true };
  }

  /**
   * Decide what goes into the context window.
   * @param {string} strategyId
   * @param {{windowSize:number, lastN:number, question:object, count:(m:object)=>number}} o
   * @returns {{kept:object[], dropped:object[], total:number, fits:boolean, over:number}}
   */
  function buildContext(strategyId, o) {
    const C = TL.context;
    const full = [SYSTEM].concat(HISTORY, [questionMessage(o.question)]);
    let kept;
    if (strategyId === 'all') {
      kept = full;
    } else if (strategyId === 'drop-oldest') {
      kept = C.trimToFit(full, o.windowSize, o.count);
    } else if (strategyId === 'last-turns') {
      // +1 because the current question's own turn counts as one.
      kept = C.lastTurns(full, o.lastN + 1);
    } else if (strategyId === 'summary') {
      const recent = C.lastTurns(full, 3).filter((m) => m.role !== 'system'); // question + last 2 exchanges
      kept = [SYSTEM, SUMMARY].concat(recent);
    } else {
      throw new Error('Unknown strategy: ' + strategyId);
    }
    const keptIds = new Set(kept.map((m) => m.id));
    const dropped = full.filter((m) => !keptIds.has(m.id));
    const total = kept.reduce((s, m) => s + o.count(m), 0);
    return { kept, dropped, total, fits: total <= o.windowSize, over: Math.max(0, total - o.windowSize) };
  }

  /** Which facts are still available to the assistant? */
  function factsInContext(kept) {
    const s = new Set();
    for (const m of kept) for (const f of m.facts || []) s.add(f);
    return s;
  }

  /** Simulated reply: only facts inside the window can be reported. */
  function answer(question, ctx) {
    if (!ctx.fits) {
      return {
        ok: false,
        kind: 'rejected',
        text: 'Request rejected: the prompt is ' + ctx.over + ' tokens over the context window, so no model call happens. Most APIs return an error like this.',
      };
    }
    const have = factsInContext(ctx.kept);
    if (have.has(question.needs)) return { ok: true, kind: 'known', text: FACTS[question.needs].answer };
    return {
      ok: false,
      kind: 'forgotten',
      text: 'I do not have that in my context. (A real model might guess here - that is a separate risk this simulation does not show.)',
    };
  }

  TL.memory = { FACTS, QUESTIONS, HISTORY, SYSTEM, SUMMARY, STRATEGIES, buildContext, factsInContext, answer };
  if (typeof module !== 'undefined' && module.exports) module.exports = TL.memory;
})(typeof window !== 'undefined' ? window : globalThis);
