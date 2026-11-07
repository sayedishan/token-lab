/**
 * memorymgr.js - engine for the "AI Memory Manager" (Lab 4).
 *
 * WHAT THIS IS: a deterministic EDUCATIONAL SIMULATION. It is not a language
 * model and not a production memory system. Every message in the script is
 * tagged by hand with the facts it carries. The "assistant" can only use a fact
 * that is (a) still inside its short-term context window, or (b) written in its
 * long-term memory (or a summary note). That is the real constraint: a model
 * cannot use information it is not given.
 *
 * What the student controls, for each message: save it to long-term memory,
 * keep it in short-term context only (it will scroll out), or forget it now.
 * They can also summarise the context into one note (lossy: only "gist" facts
 * survive) and delete memories. Later PROBE questions reveal what that cost.
 *
 * Token counts use the lesson's toy tokenizer, so they match Lab 1.
 */
(function (g) {
  'use strict';
  const TL = (g.TokenLab = g.TokenLab || {});

  /** Caps in toy tokens. Tuned (and unit-tested) so that saving everything does not fit. */
  const CAPS = { context: 100, memory: 85 };
  const PASS_SCORE = 70;

  const FACTS = {
    name: { label: 'Your name', note: 'Name: Kavya', answer: 'your name is Kavya', gist: true, gistNote: 'Kavya', kind: 'core' },
    exam: { label: 'Exam date', note: 'Exam: 12 Dec (data structures)', answer: 'your exam is on 12 December', gist: true, gistNote: '12 Dec exam', kind: 'core' },
    slot: { label: 'Best study time', note: 'Best study time: 6-8 am', answer: 'you study best from 6 to 8 am', gist: false, kind: 'core' },
    secret: { label: 'Wi-Fi password', note: 'Wi-Fi: blue-tiger-42', answer: 'the Wi-Fi password', gist: false, kind: 'sensitive' },
    weak: { label: 'Weak topics', note: 'Weak: recursion, graph traversal', answer: 'you need work on recursion and graph traversal', gist: true, gistNote: 'weak: recursion, graphs', kind: 'core' },
    cat: { label: 'Cat story', note: 'Cat sat on keyboard', answer: 'the cat story', gist: false, kind: 'trivia' },
    hours: { label: 'Weekly hours', note: 'Hours: 2 weekdays, 5 Sunday', answer: 'you have 2 hours on weekdays and 5 on Sunday', gist: false, kind: 'core' },
    music: { label: 'Music taste', note: 'Likes lo-fi music', answer: 'you like lo-fi music', gist: false, kind: 'trivia' },
    library: { label: 'Library hours', note: 'Library closes 9 pm', answer: 'the library closes at 9 pm', gist: false, kind: 'trivia' },
  };

  const TURNS = [
    { id: 't1', kind: 'info', text: "Hi, I'm Kavya. My data structures exam is on 12 December.", facts: ['name', 'exam'] },
    { id: 't2', kind: 'info', text: 'I focus best between 6 and 8 in the morning.', facts: ['slot'] },
    { id: 't3', kind: 'info', text: 'My Wi-Fi password is blue-tiger-42, in case you need it.', facts: ['secret'] },
    { id: 't4', kind: 'info', text: 'I struggle most with recursion and graph traversal.', facts: ['weak'] },
    { id: 't5', kind: 'info', text: 'Funny thing: my cat sat on my keyboard today.', facts: ['cat'] },
    { id: 't6', kind: 'info', text: 'I can study 2 hours on weekdays and 5 hours on Sunday.', facts: ['hours'] },
    { id: 't7', kind: 'probe', text: 'Can you plan my study week?', needs: ['exam', 'slot', 'weak', 'hours'], label: 'Study plan' },
    { id: 't8', kind: 'info', text: 'I like lo-fi music while I study.', facts: ['music'] },
    { id: 't9', kind: 'info', text: 'The library closes at 9 pm.', facts: ['library'] },
    { id: 't10', kind: 'probe', text: 'Remind me: what is my name, and when is my exam?', needs: ['name', 'exam'], label: 'Recall' },
  ];

  const tok = (text) => {
    if (!TL.toy && typeof require === 'function') require('./toy.js');
    return TL.toy.count(text);
  };
  const copy = (s, patch) => Object.assign({}, s, patch);

  function ctxTokens(s) {
    return s.context.reduce((n, m) => n + m.tokens, 0);
  }
  function memTokens(s) {
    return s.memory.reduce((n, m) => n + m.tokens, 0);
  }

  /** Facts the assistant can use right now. */
  function available(s) {
    const set = new Set();
    s.context.forEach((m) => m.facts.forEach((f) => set.add(f)));
    s.memory.forEach((m) => m.facts.forEach((f) => set.add(f)));
    return set;
  }

  /** Put the next user message into the context. */
  function arrive(s) {
    const t = TURNS[s.i];
    const msg = { id: t.id, role: 'user', text: t.text, tokens: tok(t.text), facts: t.facts || [], turn: s.i };
    const events = (s.events || []).slice();
    const trimmed = trim(copy(s, { context: s.context.concat([msg]) }), events); // oldest messages fall out first
    return copy(trimmed, { pending: t.id, events });
  }

  /** Drop the oldest context messages until it fits the cap (what a real window does). */
  function trim(s, events) {
    let context = s.context.slice();
    let n = context.reduce((a, m) => a + m.tokens, 0);
    while (n > CAPS.context && context.length > 1) {
      const gone = context.shift();
      n -= gone.tokens;
      if (gone.facts.length) events.push({ type: 'fell-out', text: gone.text, facts: gone.facts });
    }
    return copy(s, { context });
  }

  function newGame() {
    return arrive({ i: 0, context: [], memory: [], pending: null, probes: [], events: [], error: null, done: false, summaries: 0 });
  }

  const isProbe = (s) => TURNS[s.i] && TURNS[s.i].kind === 'probe';

  /** Move on to the next turn (or finish). */
  function advance(s, events) {
    const i = s.i + 1;
    if (i >= TURNS.length) return copy(s, { i, pending: null, done: true, events, error: null });
    return arrive(copy(s, { i, events, error: null }));
  }

  /**
   * Decide what to do with the pending info message: 'save' | 'keep' | 'forget'.
   * Returns a new state; if memory is full, state.error explains and nothing changes.
   */
  function decide(s, action) {
    if (s.done || isProbe(s)) return s;
    const t = TURNS[s.i];
    let cur = s;
    const events = [];
    if (action === 'save') {
      const add = [];
      for (const f of t.facts) {
        if (cur.memory.some((m) => m.facts.includes(f))) continue;
        add.push({ id: 'm-' + f, text: FACTS[f].note, tokens: tok(FACTS[f].note), facts: [f], source: 'note' });
      }
      const need = add.reduce((n, m) => n + m.tokens, 0);
      if (memTokens(cur) + need > CAPS.memory) {
        return copy(cur, { error: { type: 'memory-full', need, free: CAPS.memory - memTokens(cur) } });
      }
      cur = copy(cur, { memory: cur.memory.concat(add) });
      events.push({ type: 'saved', text: add.map((m) => m.text).join('; ') || 'already saved' });
    } else if (action === 'forget') {
      cur = copy(cur, { context: cur.context.filter((m) => m.id !== t.id) });
      events.push({ type: 'forgot', text: t.text });
    } else if (action === 'keep') {
      events.push({ type: 'kept', text: t.text });
    } else {
      return s;
    }
    const reply = { id: 'a-' + t.id, role: 'assistant', text: 'Noted.', tokens: tok('Noted.'), facts: [] };
    cur = trim(copy(cur, { context: cur.context.concat([reply]) }), events);
    return advance(cur, events);
  }

  /** Let the assistant answer the pending probe question using only what it can see. */
  function answerProbe(s) {
    if (s.done || !isProbe(s)) return s;
    const t = TURNS[s.i];
    const have = available(s);
    const used = t.needs.filter((f) => have.has(f));
    const missing = t.needs.filter((f) => !have.has(f));
    const text = (used.length ? 'Using what I know: ' + used.map((f) => FACTS[f].answer).join('; ') + '. ' : '') + (missing.length ? "I don't have: " + missing.map((f) => FACTS[f].label.toLowerCase()).join(', ') + '.' : '');
    const probe = { id: t.id, label: t.label, needs: t.needs, used, missing, text, fraction: used.length / t.needs.length };
    const reply = { id: 'a-' + t.id, role: 'assistant', text, tokens: tok(text), facts: [] };
    const events = [{ type: 'probe', text: t.label + ': ' + used.length + ' of ' + t.needs.length + ' facts available' }];
    const withReply = trim(copy(s, { probes: s.probes.concat([probe]), context: s.context.concat([reply]) }), events);
    return advance(withReply, events);
  }

  /**
   * Compress the context (everything except the message waiting for a decision) into ONE memory note.
   * LOSSY: only facts marked `gist` survive. The summarised messages leave the context.
   */
  function summarise(s) {
    if (s.done) return s;
    const pendingId = s.pending;
    const old = s.context.filter((m) => m.id !== pendingId);
    const factSet = [];
    old.forEach((m) => m.facts.forEach((f) => !factSet.includes(f) && factSet.push(f)));
    const fresh = factSet.filter((f) => !s.memory.some((m) => m.facts.includes(f)));
    if (!old.length || !fresh.length) return copy(s, { error: { type: 'nothing' } });
    const gist = fresh.filter((f) => FACTS[f].gist);
    const lost = fresh.filter((f) => !FACTS[f].gist);
    const text = gist.length ? 'Summary: ' + gist.map((f) => FACTS[f].gistNote).join('; ') : '';
    const entry = text ? { id: 'sum-' + s.summaries, text, tokens: tok(text), facts: gist, source: 'summary' } : null;
    const need = entry ? entry.tokens : 0;
    if (memTokens(s) + need > CAPS.memory) return copy(s, { error: { type: 'memory-full', need, free: CAPS.memory - memTokens(s) } });
    const events = [{ type: 'summarised', text: gist.length ? 'Kept: ' + gist.map((f) => FACTS[f].label).join(', ') : 'Nothing worth keeping', lost: lost.map((f) => FACTS[f].label) }];
    return copy(s, { context: s.context.filter((m) => m.id === pendingId), memory: entry ? s.memory.concat([entry]) : s.memory, summaries: s.summaries + 1, events, error: null });
  }

  /** Delete a long-term memory entry. */
  function deleteMemory(s, id) {
    return copy(s, { memory: s.memory.filter((m) => m.id !== id), events: [{ type: 'deleted', text: (s.memory.find((m) => m.id === id) || {}).text || '' }], error: null });
  }

  /** Final score. Hygiene is judged on what is in memory AT THE END, so cleaning up is rewarded. */
  function score(s) {
    const probeFrac = s.probes.length ? s.probes.reduce((n, p) => n + p.fraction, 0) / TURNS.filter((t) => t.kind === 'probe').length : 0;
    const secrets = s.memory.filter((m) => m.facts.some((f) => FACTS[f].kind === 'sensitive')).length;
    const trivia = s.memory.filter((m) => m.facts.some((f) => FACTS[f].kind === 'trivia')).length;
    const hygiene = 20 - (secrets ? 10 : 0) - Math.min(10, trivia * 3);
    const total = Math.max(0, Math.min(100, Math.round(probeFrac * 80 + hygiene)));
    return { probePart: Math.round(probeFrac * 80), hygiene, secrets, trivia, total, pass: s.done && total >= PASS_SCORE };
  }

  const points = (total) => Math.round((total / 100) * 60);

  TL.memorymgr = { CAPS, PASS_SCORE, FACTS, TURNS, newGame, decide, answerProbe, summarise, deleteMemory, available, score, points, ctxTokens, memTokens, isProbe };
  if (typeof module !== 'undefined' && module.exports) module.exports = TL.memorymgr;
})(typeof window !== 'undefined' ? window : globalThis);
