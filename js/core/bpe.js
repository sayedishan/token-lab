/**
 * bpe.js - a small, readable Byte-Pair Encoding (BPE) implementation.
 *
 * This is the REAL algorithm that production tokenizers are built on
 * (Sennrich et al., 2016, arXiv:1508.07909), implemented from scratch for
 * teaching. What makes it a "toy" is only its SCALE: it is trained on a few
 * kilobytes of text, so its vocabulary is tiny. It is NOT the tokenizer of
 * any commercial model and its token counts will differ from theirs.
 *
 * Design notes
 *  - Immutable training state: every merge returns a NEW state. That makes
 *    "undo" and step-through trivial in the UI and keeps the logic testable.
 *  - Words carry a leading space marker "▁" (SentencePiece style, Kudo &
 *    Richardson 2018) so "▁the" (a word) and "the" (inside "other") differ.
 *  - Unseen characters fall back to their raw UTF-8 bytes, shown as <0xHH>.
 *    Real byte-level tokenizers do the same, which is why they never need an
 *    "unknown word" token - and why scripts that are rare in training data
 *    can explode into many tokens.
 *
 * Works in the browser (as window.TokenLab.bpe) and in Node (module.exports).
 */
(function (g) {
  'use strict';
  const TL = (g.TokenLab = g.TokenLab || {});

  /** Marker standing in for a space at the start of a word. */
  const SPACE_MARK = '▁'; // ▁

  /**
   * Pre-tokenizer: cuts text into "words" BEFORE BPE runs, so merges never
   * cross word boundaries. Pattern (in order): letters, numbers, punctuation
   * runs - each with an optional single leading space - then whitespace.
   * It covers every character, so splitting is lossless.
   */
  const PRETOKEN_RE = / ?[\p{L}\p{M}]+| ?\p{N}+| ?[^\s\p{L}\p{M}\p{N}]+|\s+(?!\S)|\s+/gu;

  const PAIR_SEP = '\u0001';
  const BYTE_TOKEN_RE = /^<0x[0-9A-F]{2}>$/;

  const pairKey = (l, r) => l + PAIR_SEP + r;
  const byteToken = (b) => '<0x' + b.toString(16).toUpperCase().padStart(2, '0') + '>';
  const isByteToken = (t) => BYTE_TOKEN_RE.test(t);

  /** Split raw text into pre-tokens (words). */
  function pretokenize(text) {
    return String(text).match(PRETOKEN_RE) || [];
  }

  /** A pre-token as a list of symbols (one per Unicode code point; space -> ▁). */
  function toSymbols(pretoken) {
    return Array.from(pretoken, (ch) => (ch === ' ' ? SPACE_MARK : ch));
  }

  /** Count how often each pre-token occurs. Returns [[pretoken, count], ...] in first-seen order. */
  function countPretokens(text) {
    const m = new Map();
    for (const p of pretokenize(text)) m.set(p, (m.get(p) || 0) + 1);
    return Array.from(m.entries());
  }

  // ------------------------------------------------------------------
  // Training (immutable state)
  // ------------------------------------------------------------------

  /**
   * @param {Array<[string, number]>} wordFreqs  e.g. [["▁learn", 8], ...]
   * @returns {{words: Array<{symbols:string[], freq:number}>, merges: Array, alphabet: string[]}}
   */
  function createState(wordFreqs) {
    const words = wordFreqs.map(([w, c]) => ({ symbols: toSymbols(w), freq: c }));
    const alpha = new Set();
    for (const w of words) for (const s of w.symbols) alpha.add(s);
    return { words, merges: [], alphabet: Array.from(alpha).sort() };
  }

  /**
   * Count adjacent symbol pairs across all words, weighted by word frequency.
   * Sorted by count (high -> low). Ties keep first-seen order, which is the
   * tie-break rule the lesson teaches ("whichever pair appeared first").
   */
  function countPairs(state) {
    const m = new Map();
    for (const w of state.words) {
      for (let i = 0; i < w.symbols.length - 1; i++) {
        const l = w.symbols[i];
        const r = w.symbols[i + 1];
        const k = pairKey(l, r);
        const e = m.get(k);
        if (e) e.count += w.freq;
        else m.set(k, { left: l, right: r, count: w.freq });
      }
    }
    // Array.prototype.sort is stable (ES2019), so ties stay in insertion order.
    return Array.from(m.values()).sort((a, b) => b.count - a.count);
  }

  /** Merge every adjacent occurrence of (left,right). Returns a NEW state. */
  function applyMerge(state, left, right) {
    const merged = left + right;
    const count = countPairs(state).find((p) => p.left === left && p.right === right);
    const words = state.words.map((w) => {
      const s = w.symbols;
      const out = [];
      let i = 0;
      while (i < s.length) {
        if (i < s.length - 1 && s[i] === left && s[i + 1] === right) {
          out.push(merged);
          i += 2;
        } else {
          out.push(s[i]);
          i += 1;
        }
      }
      return { symbols: out, freq: w.freq };
    });
    return {
      words,
      alphabet: state.alphabet,
      merges: state.merges.concat([{ left, right, merged, count: count ? count.count : 0 }]),
    };
  }

  /**
   * Run BPE training.
   * @param {Array<[string, number]>} wordFreqs
   * @param {{numMerges?: number, minCount?: number}} opts
   *   minCount: stop when the best pair occurs fewer than this many times
   *   (a pair seen once is not evidence of a useful pattern).
   * @returns the final state (state.merges is the learned, ordered merge list)
   */
  function train(wordFreqs, opts) {
    const numMerges = (opts && opts.numMerges) || 100;
    const minCount = opts && opts.minCount != null ? opts.minCount : 2;
    let state = createState(wordFreqs);
    for (let n = 0; n < numMerges; n++) {
      const pairs = countPairs(state);
      if (pairs.length === 0 || pairs[0].count < minCount) break;
      state = applyMerge(state, pairs[0].left, pairs[0].right);
    }
    return state;
  }

  function trainFromText(text, opts) {
    return train(countPretokens(text), opts);
  }

  // ------------------------------------------------------------------
  // Model = what you keep after training: ordered merges + vocabulary
  // ------------------------------------------------------------------

  /**
   * Build a usable tokenizer from an alphabet and an ordered merge list.
   * ID layout: 0-255 raw bytes, then single characters, then merged tokens in
   * the order they were learned (so earlier merges have smaller IDs).
   */
  function modelFromMerges(alphabet, merges) {
    const vocab = [];
    for (let b = 0; b < 256; b++) vocab.push(byteToken(b));
    for (const a of alphabet) vocab.push(a);
    const seen = new Set(vocab);
    const ranks = new Map();
    merges.forEach((m, i) => {
      ranks.set(pairKey(m.left, m.right), i);
      if (!seen.has(m.merged)) {
        seen.add(m.merged);
        vocab.push(m.merged);
      }
    });
    const idOf = new Map(vocab.map((t, i) => [t, i]));
    return { alphabet, alphabetSet: new Set(alphabet), merges, ranks, vocab, idOf };
  }

  function modelFromState(state) {
    return modelFromMerges(state.alphabet, state.merges);
  }

  /** Same model, but using only the first `k` merges (for the vocab-size slider). */
  function truncateModel(model, k) {
    return modelFromMerges(model.alphabet, model.merges.slice(0, Math.max(0, k)));
  }

  // ------------------------------------------------------------------
  // Encoding / decoding
  // ------------------------------------------------------------------

  /** Turn one pre-token into base symbols, using byte fallback for unseen characters. */
  function baseSymbols(model, pretoken) {
    const out = [];
    for (const ch of pretoken) {
      const sym = ch === ' ' ? SPACE_MARK : ch;
      if (model.alphabetSet.has(sym)) {
        out.push(sym);
      } else {
        const bytes = new TextEncoder().encode(ch);
        for (const b of bytes) out.push(byteToken(b));
      }
    }
    return out;
  }

  /**
   * Apply learned merges to one word: repeatedly merge the adjacent pair with
   * the LOWEST rank (= learned earliest), until no learned pair remains.
   */
  function segmentWord(model, symbols) {
    let s = symbols.slice();
    while (s.length > 1) {
      let bestRank = Infinity;
      let bestL = null;
      let bestR = null;
      for (let i = 0; i < s.length - 1; i++) {
        const r = model.ranks.get(pairKey(s[i], s[i + 1]));
        if (r !== undefined && r < bestRank) {
          bestRank = r;
          bestL = s[i];
          bestR = s[i + 1];
        }
      }
      if (bestL === null) break;
      const out = [];
      let i = 0;
      while (i < s.length) {
        if (i < s.length - 1 && s[i] === bestL && s[i + 1] === bestR) {
          out.push(bestL + bestR);
          i += 2;
        } else {
          out.push(s[i]);
          i += 1;
        }
      }
      s = out;
    }
    return s;
  }

  /**
   * Encode text. Returns [{token, id, isByte}, ...]
   * Invariant (tested): decode(encode(text)) === text for ANY text.
   */
  function encode(model, text) {
    const result = [];
    let preIndex = 0;
    for (const pre of pretokenize(text)) {
      segmentWord(model, baseSymbols(model, pre)).forEach((tok, k) => {
        // `pre` / `first` tell the UI which word a piece belongs to (used by the visualiser).
        result.push({ token: tok, id: model.idOf.get(tok), isByte: isByteToken(tok), pre: preIndex, first: k === 0 });
      });
      preIndex++;
    }
    return result;
  }

  /** Decode token strings back to text (byte tokens are reassembled as UTF-8). */
  function decode(tokens) {
    const dec = new TextDecoder('utf-8');
    let text = '';
    let pending = [];
    const flush = () => {
      if (pending.length) {
        text += dec.decode(Uint8Array.from(pending));
        pending = [];
      }
    };
    for (const t of tokens) {
      const tok = typeof t === 'string' ? t : t.token;
      if (isByteToken(tok)) {
        pending.push(parseInt(tok.slice(3, 5), 16));
      } else {
        flush();
        text += tok.split(SPACE_MARK).join(' ');
      }
    }
    flush();
    return text;
  }

  /**
   * Display helper. A literal space and the word-start marker BOTH show as "▁",
   * so the learner sees ONE symbol for "a space starts here" (our toy tokens
   * already use ▁; real tokenizers store a literal space).
   * Newlines show as ↵ and tabs as ⇥.
   */
  function displayToken(tok) {
    return tok.replace(/ /g, SPACE_MARK).replace(/\n/g, '↵').replace(/\t/g, '⇥');
  }

  // ------------------------------------------------------------------
  // Helpers for the interactive trainer (Lab 2)
  // ------------------------------------------------------------------

  /** Total number of symbols in the corpus, counting every occurrence of every word. */
  function corpusLength(state) {
    return state.words.reduce((n, w) => n + w.freq * w.symbols.length, 0);
  }

  /** Vocabulary after training: base characters, then each merged token in the order learned. */
  function vocabulary(state) {
    const seen = new Set(state.alphabet);
    const merged = [];
    for (const m of state.merges) {
      if (!seen.has(m.merged)) {
        seen.add(m.merged);
        merged.push(m.merged);
      }
    }
    return { alphabet: state.alphabet.slice(), merged };
  }

  /**
   * Explain ONE merge, using real numbers from the before/after states (no estimates).
   * @param {object} before  state before the merge
   * @param {object} after   state returned by applyMerge(before, ...)
   */
  function describeMerge(before, after) {
    const m = after.merges[after.merges.length - 1];
    const affected = [];
    for (const w of before.words) {
      let n = 0;
      const s = w.symbols;
      for (let i = 0; i < s.length - 1; i++) {
        if (s[i] === m.left && s[i + 1] === m.right) {
          n++;
          i++; // same left-to-right, non-overlapping scan that applyMerge uses
        }
      }
      if (n) affected.push({ word: s.join(''), freq: w.freq, occurrences: n });
    }
    const lengthBefore = corpusLength(before);
    const lengthAfter = corpusLength(after);
    const next = countPairs(after)[0] || null;
    return {
      left: m.left,
      right: m.right,
      merged: m.merged,
      count: m.count,
      affected,
      lengthBefore,
      lengthAfter,
      saved: lengthBefore - lengthAfter,
      vocabSize: after.alphabet.length + after.merges.length,
      next: next ? { left: next.left, right: next.right, count: next.count } : null,
    };
  }

  TL.bpe = {
    corpusLength,
    vocabulary,
    describeMerge,
    SPACE_MARK,
    pretokenize,
    toSymbols,
    countPretokens,
    createState,
    countPairs,
    applyMerge,
    train,
    trainFromText,
    modelFromMerges,
    modelFromState,
    truncateModel,
    encode,
    decode,
    isByteToken,
    displayToken,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TL.bpe;
})(typeof window !== 'undefined' ? window : globalThis);
