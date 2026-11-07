/**
 * store.js - tiny persisted state: progress, XP, scores, theme, instructor mode.
 *
 * localStorage can throw or be empty (private windows, blocked storage,
 * file:// quirks), so every access is wrapped in try/catch and the app falls
 * back to in-memory state. Nothing the learner types is stored - only
 * progress flags, scores and settings - and nothing is ever sent anywhere.
 *
 * Gamification: flag() / count() / award() update the pure progress object
 * (core/gamification.js), re-evaluate the XP rules, persist, and tell any
 * listener (the toast and XP chip UI) what changed.
 */
(function (g) {
  'use strict';
  const TL = (g.TokenLab = g.TokenLab || {});
  const KEY = 'token-lab:v1'; // unchanged key: progress saved by v1.0 still loads

  const DEFAULTS = () => ({
    visited: {}, // sectionId -> true
    quiz: {}, // optional practice quiz scores
    challenge: { rescue: false, code: false },
    prediction: null,
    theme: null, // 'light' | 'dark' | null (default: dark)
    instructor: false,
    progress: TL.gam.emptyProgress(), // { xp, flags, counters }
    master: { q: {} }, // Token Master: id -> { points, done, attempts, hint }
  });

  let state = DEFAULTS();
  const listeners = new Set();
  const gamListeners = new Set();

  function load() {
    try {
      const raw = g.localStorage && g.localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const d = DEFAULTS();
        state = Object.assign(d, parsed, {
          challenge: Object.assign(d.challenge, parsed.challenge || {}),
          progress: Object.assign(d.progress, parsed.progress || {}),
          master: Object.assign(d.master, parsed.master || {}),
        });
      }
    } catch (e) {
      state = DEFAULTS();
    }
  }
  function persist() {
    try {
      if (g.localStorage) g.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      /* storage unavailable: keep working in memory */
    }
  }
  function emit() {
    listeners.forEach((fn) => fn(state));
  }

  /** Apply a change to the progress object, re-evaluate XP rules, persist, and announce what changed. */
  function mutate(fn) {
    const before = state.progress;
    const after = TL.gam.evaluate(fn(before));
    if (after === before) return false;
    state = Object.assign({}, state, { progress: after });
    persist();
    emit();
    const d = TL.gam.diff(before, after);
    if (d.xpGained > 0 || d.newBadges.length || d.levelUp) gamListeners.forEach((f) => f(d, after));
    return true;
  }

  const store = {
    get: () => state,
    set(patch) {
      state = Object.assign({}, state, patch);
      persist();
      emit();
    },
    markVisited(id) {
      if (state.visited[id]) return;
      state = Object.assign({}, state, { visited: Object.assign({}, state.visited, { [id]: true }) });
      persist();
      emit();
    },
    setQuiz(id, score, total) {
      state = Object.assign({}, state, { quiz: Object.assign({}, state.quiz, { [id]: { score, total } }) });
      persist();
      emit();
    },
    setChallenge(part, done) {
      state = Object.assign({}, state, { challenge: Object.assign({}, state.challenge, { [part]: !!done }) });
      persist();
      emit();
      if (done) store.award(part === 'rescue' ? 'challenge.rescue' : 'challenge.code', 30);
    },
    /** Remember a finished Token Master question. */
    setMasterQ(id, rec) {
      state = Object.assign({}, state, { master: { q: Object.assign({}, state.master.q, { [id]: rec }) } });
      persist();
      emit();
    },
    // ---- gamification ----
    flag: (name) => mutate((p) => TL.gam.setFlag(p, name)),
    count: (name, by) => mutate((p) => TL.gam.bump(p, name, by)),
    award: (id, points) => mutate((p) => TL.gam.award(p, id, points)),
    onGamify(fn) {
      gamListeners.add(fn);
      return () => gamListeners.delete(fn);
    },
    /** Clears progress, XP and scores but keeps the viewer's theme and instructor choice. */
    reset() {
      const keep = { theme: state.theme, instructor: state.instructor };
      state = Object.assign(DEFAULTS(), keep);
      persist();
      emit();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  load();
  TL.store = store;
  if (typeof module !== 'undefined' && module.exports) module.exports = store;
})(typeof window !== 'undefined' ? window : globalThis);
