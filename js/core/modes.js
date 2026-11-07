/**
 * modes.js - the two simple ways of cutting text (characters, words) and a
 * token CLASSIFIER used by the Lab 1 visualiser's inspector and colour-by-type.
 *
 * These live in core/ (no DOM) so the lesson's quiz questions and the unit
 * tests use exactly the same functions the visualiser does.
 */
(function (g) {
  'use strict';
  const TL = (g.TokenLab = g.TokenLab || {});

  /** One token per Unicode character. IDs shown are code points. */
  function chars(text) {
    return Array.from(String(text)).map((ch) => ({ token: ch, id: ch.codePointAt(0), isByte: false }));
  }

  /**
   * Words and punctuation marks as separate tokens; spaces are dropped.
   * "IDs" are order-first-seen, because a word list needs one entry per distinct word.
   */
  function words(text) {
    const seen = new Map();
    const parts = String(text).match(/[\p{L}\p{M}\p{N}_']+|[^\s\p{L}\p{M}\p{N}_']/gu) || [];
    return parts.map((w) => {
      if (!seen.has(w)) seen.set(w, seen.size + 1);
      return { token: w, id: seen.get(w), isByte: false };
    });
  }

  const BYTE_RE = /^<0x[0-9A-Fa-f]+>$/;

  /** Types, with the plain-language explanation shown in the inspector. */
  const TYPE_INFO = {
    word: { label: 'Word start', note: 'The first piece of a word. A leading ▁ means a space came before it.' },
    fragment: { label: 'Word piece', note: 'A continuation piece. Rare or long words are built from several pieces.' },
    number: { label: 'Number', note: 'Digits. Real tokenizers often cut long numbers into groups of digits.' },
    punct: { label: 'Punctuation', note: 'A punctuation or symbol character, usually its own token.' },
    space: { label: 'Whitespace', note: 'Spaces, tabs and line breaks are tokens too, and they cost tokens.' },
    byte: { label: 'Raw byte', note: 'This vocabulary has no entry for the character, so it is written as raw UTF-8 bytes.' },
  };

  /**
   * Classify a sequence of token strings (in order). A literal space and the
   * toy's word-start marker "▁" are treated the same.
   * It is a DISPLAY heuristic: it looks only at the pieces, not at the tokenizer's internals.
   * @param {string[]} pieces
   * @returns {string[]} one of: word | fragment | number | punct | space | byte
   */
  function classify(pieces) {
    const out = [];
    let prevLetterish = false;
    for (const raw of pieces) {
      const t = String(raw);
      if (BYTE_RE.test(t)) {
        out.push('byte');
        prevLetterish = false;
        continue;
      }
      const s = t.replace(/▁/g, ' ');
      if (/^\s+$/.test(s)) {
        out.push('space');
        prevLetterish = false;
        continue;
      }
      const core = s.trim();
      if (/^\p{N}+$/u.test(core)) {
        out.push('number');
        prevLetterish = false;
      } else if (!/[\p{L}\p{M}]/u.test(core)) {
        out.push('punct');
        prevLetterish = false;
      } else {
        out.push(s.startsWith(' ') || !prevLetterish ? 'word' : 'fragment');
        prevLetterish = true;
      }
    }
    return out;
  }

  /** UTF-8 length of a string in bytes. */
  const utf8Length = (s) => new TextEncoder().encode(String(s)).length;

  /** UTF-8 bytes of a single token as hex pairs, e.g. "E0 A4 AE". */
  const utf8Hex = (s) =>
    Array.from(new TextEncoder().encode(String(s).replace(/▁/g, ' ')))
      .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');

  TL.modes = { chars, words, classify, TYPE_INFO, utf8Length, utf8Hex };
  if (typeof module !== 'undefined' && module.exports) module.exports = TL.modes;
})(typeof window !== 'undefined' ? window : globalThis);
