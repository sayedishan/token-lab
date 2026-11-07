/**
 * estimate.js - the "rule of thumb" token estimators used in the lesson.
 *
 * Common guidance for English text on large commercial tokenizers is roughly
 * 4 characters per token, or about 3/4 of a word per token (OpenAI Help
 * Center, "What are tokens and how to count them"). It is an ESTIMATE for
 * planning. Exact counts depend on the specific model's tokenizer and on the
 * language, so billing-grade numbers must come from that tokenizer.
 */
(function (g) {
  'use strict';
  const TL = (g.TokenLab = g.TokenLab || {});

  /** ~4 characters per token. Counts Unicode characters, not UTF-16 units. */
  function estimateByChars(text) {
    const n = Array.from(String(text)).length;
    return n === 0 ? 0 : Math.ceil(n / 4);
  }

  /** ~0.75 words per token, i.e. tokens ~ words / 0.75. */
  function estimateByWords(text) {
    const words = String(text).trim().split(/\s+/).filter(Boolean).length;
    return words === 0 ? 0 : Math.ceil(words / 0.75);
  }

  /**
   * Validate a numeric form field. Returns {ok, value, error}.
   * Accepts whole numbers only; rejects empty, NaN, negatives, decimals and
   * out-of-range values with a human-readable message (used for inline errors).
   */
  function parseWholeNumber(raw, min, max) {
    const s = String(raw).trim().replace(/,/g, '');
    if (s === '') return { ok: false, value: null, error: 'Enter a number.' };
    if (!/^-?\d+$/.test(s)) return { ok: false, value: null, error: 'Use whole numbers only (no letters or decimals).' };
    const v = Number(s);
    if (v < min) return { ok: false, value: null, error: 'Must be at least ' + min.toLocaleString('en-US') + '.' };
    if (v > max) return { ok: false, value: null, error: 'Must be at most ' + max.toLocaleString('en-US') + '.' };
    return { ok: true, value: v, error: null };
  }

  /** Same idea for prices (decimals allowed). */
  function parseDecimal(raw, min, max) {
    const s = String(raw).trim();
    if (s === '') return { ok: false, value: null, error: 'Enter a number.' };
    if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, value: null, error: 'Use a plain number like 2.5.' };
    const v = Number(s);
    if (v < min) return { ok: false, value: null, error: 'Must be at least ' + min + '.' };
    if (v > max) return { ok: false, value: null, error: 'Must be at most ' + max + '.' };
    return { ok: true, value: v, error: null };
  }

  TL.estimate = { estimateByChars, estimateByWords, parseWholeNumber, parseDecimal };
  if (typeof module !== 'undefined' && module.exports) module.exports = TL.estimate;
})(typeof window !== 'undefined' ? window : globalThis);
