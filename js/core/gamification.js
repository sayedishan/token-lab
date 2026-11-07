/**
 * gamification.js - XP, levels and badges, as PURE functions on a plain object.
 *
 * Design rules (so the game is not decorative):
 *  - Every XP source is a LEARNING ACTIVITY (a prediction, an experiment, a
 *    correct answer, a completed simulation). Merely visiting a page earns nothing.
 *  - An event can be earned ONCE; replaying can only RAISE its points to a better
 *    score, never add them again, so XP cannot be farmed.
 *  - Badges are derived from events, so they can be tested and cannot drift.
 *
 * progress = { xp: {eventId: points}, flags: {name: true}, counters: {name: n} }
 */
(function (g) {
  'use strict';
  const TL = (g.TokenLab = g.TokenLab || {});

  /**
   * Rule-based events: awarded automatically when their conditions are met.
   * Events with `direct: true` are awarded by simulations with a computed score.
   */
  const RULES = [
    { id: 'predict', xp: 10, group: 'Start', label: 'Made a prediction before the reveal', direct: true },
    { id: 'tok.modes', xp: 15, group: 'Lab 1', label: 'Compared character, word and subword tokenization', needs: ['tok.mode.chars', 'tok.mode.words', 'tok.mode.subword'] },
    { id: 'tok.multilingual', xp: 15, group: 'Lab 1', label: 'Tokenized non-English text', needs: ['tok.lang.other'] },
    { id: 'tok.typos', xp: 15, group: 'Lab 1', label: 'Compared a typo with its correction', needs: ['tok.preset.typos', 'tok.preset.clean'] },
    { id: 'tok.inspect', xp: 5, group: 'Lab 1', label: 'Inspected a single token', needs: ['tok.inspect'] },
    { id: 'bpe.manual', xp: 20, group: 'Lab 2', label: 'Found the most frequent pair yourself 3 times', counter: { name: 'bpe.manual.ok', min: 3 } },
    { id: 'bpe.finished', xp: 20, group: 'Lab 2', label: 'Trained BPE until no pair repeats', needs: ['bpe.finished'] },
    { id: 'bpe.test', xp: 10, group: 'Lab 2', label: 'Tokenized an unseen word', needs: ['bpe.test'] },
    { id: 'budget.fixed', xp: 10, group: 'Lab 3', label: 'Fixed an overflowing request in the planner', needs: ['budget.over', 'budget.fit'] },
    { id: 'survival.score', xp: 80, group: 'Lab 3', label: 'Survival game: points from four rounds', direct: true, max: 80 },
    { id: 'survival.pass', xp: 20, group: 'Lab 3', label: 'Survival game: kept the assistant alive and useful', direct: true },
    { id: 'memory.score', xp: 60, group: 'Lab 4', label: 'Memory manager: points from the probes', direct: true, max: 60 },
    { id: 'memory.pass', xp: 20, group: 'Lab 4', label: 'Memory manager: recalled what mattered, stored nothing risky', direct: true },
    // Optional extension (not part of the timed lesson): bonus XP that no level or badge depends on.
    { id: 'challenge.rescue', xp: 30, group: 'Extension', optional: true, label: 'Extension: rescued the support bot (Part A)', direct: true },
    { id: 'challenge.code', xp: 30, group: 'Extension', optional: true, label: 'Extension: passed all trimToFit tests (Part B)', direct: true },
    { id: 'master.mastery', xp: 0, group: 'Token Master', label: 'Reached a mastery score of 80% or more', direct: true },
  ];
  // Token Master awards 10 XP per question and 10 per completed level (see master.js).
  const MASTER_XP = 5 * 2 * 10 + 5 * 10;

  /** Highest XP anyone can earn, and the highest from the timed lesson alone (no optional extension). */
  const MAX_XP = RULES.reduce((s, r) => s + (r.max || r.xp), 0) + MASTER_XP;
  const MAX_REQUIRED_XP = RULES.filter((r) => !r.optional).reduce((s, r) => s + (r.max || r.xp), 0) + MASTER_XP;

  const LEVELS = [
    { n: 1, name: 'Newcomer', at: 0 },
    { n: 2, name: 'Explorer', at: 70 },
    { n: 3, name: 'Apprentice', at: 160 },
    { n: 4, name: 'Engineer', at: 280 },
    { n: 5, name: 'Master', at: 360 }, // 80% of what the timed lesson can award, so the top level never depends on optional work
  ];

  const BADGES = [
    { id: 'token-explorer', name: 'Token Explorer', icon: 'target', lab: 'Lab 1', desc: 'Explored how text becomes tokens.', criteria: [['tok.modes', 'Compared all three tokenizer modes'], ['tok.multilingual', 'Tokenized non-English text'], ['tok.typos', 'Compared a typo with its correction']] },
    { id: 'bpe-apprentice', name: 'BPE Apprentice', icon: 'sparkle', lab: 'Lab 2', desc: 'Ran Byte-Pair Encoding yourself.', criteria: [['bpe.manual', 'Found the top pair yourself 3 times'], ['bpe.finished', 'Trained until no pair repeats']] },
    { id: 'context-guardian', name: 'Context Guardian', icon: 'shield', lab: 'Lab 3', desc: 'Kept an assistant alive inside its context window.', criteria: [['survival.pass', 'Won the Context Window Survival game']] },
    { id: 'memory-architect', name: 'Memory Architect', icon: 'bolt', lab: 'Lab 4', desc: 'Decided what an assistant should remember.', criteria: [['memory.pass', 'Passed the AI Memory Manager']] },
    { id: 'token-master', name: 'Token Master', icon: 'check', lab: 'Token Master', desc: 'Mastered tokenization and context windows.', criteria: [['master.mastery', 'Scored 80% or more across all five levels']] },
  ];

  const emptyProgress = () => ({ xp: {}, flags: {}, counters: {} });

  const has = (p, id) => Object.prototype.hasOwnProperty.call(p.xp, id);

  /** Mark a flag (idempotent). Returns the SAME object if nothing changed. */
  function setFlag(p, name) {
    if (p.flags[name]) return p;
    return Object.assign({}, p, { flags: Object.assign({}, p.flags, { [name]: true }) });
  }

  /** Add to a counter. */
  function bump(p, name, by) {
    const n = (p.counters[name] || 0) + (by == null ? 1 : by);
    return Object.assign({}, p, { counters: Object.assign({}, p.counters, { [name]: n }) });
  }

  /** Award an event. Re-awarding only raises the points. Returns the SAME object if unchanged. */
  function award(p, id, points) {
    const cur = has(p, id) ? p.xp[id] : null;
    if (cur !== null && points <= cur) return p;
    return Object.assign({}, p, { xp: Object.assign({}, p.xp, { [id]: points }) });
  }

  /** Award every rule whose conditions are now met and that has not been awarded yet. */
  function evaluate(p) {
    let cur = p;
    for (const r of RULES) {
      if (r.direct || has(cur, r.id)) continue;
      const flagsOk = (r.needs || []).every((f) => cur.flags[f]);
      const counterOk = !r.counter || (cur.counters[r.counter.name] || 0) >= r.counter.min;
      if (flagsOk && counterOk) cur = award(cur, r.id, r.xp);
    }
    return cur;
  }

  const totalXP = (p) => Object.keys(p.xp).reduce((s, k) => s + p.xp[k], 0);

  /** Level information for an XP total. */
  function level(xp) {
    let cur = LEVELS[0];
    for (const l of LEVELS) if (xp >= l.at) cur = l;
    const next = LEVELS.find((l) => l.n === cur.n + 1) || null;
    return {
      n: cur.n,
      name: cur.name,
      xp,
      floor: cur.at,
      next,
      toNext: next ? next.at - xp : 0,
      ratio: next ? (xp - cur.at) / (next.at - cur.at) : 1,
    };
  }

  /** Every badge with its unlocked state and per-criterion progress. */
  function badges(p) {
    return BADGES.map((b) => {
      // "pass" events are only ever awarded on a pass, so presence of the event is the test.
      const criteria = b.criteria.map(([id, label]) => ({ id, label, done: has(p, id) }));
      return Object.assign({}, b, { criteria, unlocked: criteria.every((c) => c.done) });
    });
  }

  /** Human label for an event id (rules, plus the dynamic Token Master ids). */
  function labelFor(id) {
    const rule = RULES.find((r) => r.id === id);
    if (rule) return rule.label;
    if (id.indexOf('master.q.') === 0) return 'Token Master: answered a question';
    if (id.indexOf('master.level.') === 0) return 'Token Master: completed level ' + id.slice('master.level.'.length);
    return id;
  }

  /** What changed between two progress snapshots (for toasts). */
  function diff(before, after) {
    const xpGained = totalXP(after) - totalXP(before);
    const newEvents = Object.keys(after.xp)
      .filter((id) => !has(before, id) || after.xp[id] > before.xp[id])
      .map((id) => ({ id, points: after.xp[id] - (has(before, id) ? before.xp[id] : 0), label: labelFor(id) }));
    const bBefore = badges(before).filter((b) => b.unlocked).map((b) => b.id);
    const newBadges = badges(after).filter((b) => b.unlocked && !bBefore.includes(b.id));
    const l0 = level(totalXP(before)).n;
    const l1 = level(totalXP(after)).n;
    return { xpGained, newEvents, newBadges, levelUp: l1 > l0 ? { from: l0, to: l1, name: level(totalXP(after)).name } : null };
  }

  TL.gam = { labelFor, RULES, LEVELS, BADGES, MAX_XP, MAX_REQUIRED_XP, MASTER_XP, emptyProgress, setFlag, bump, award, evaluate, totalXP, level, badges, diff, has };
  if (typeof module !== 'undefined' && module.exports) module.exports = TL.gam;
})(typeof window !== 'undefined' ? window : globalThis);
