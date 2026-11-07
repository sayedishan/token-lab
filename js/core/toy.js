/**
 * toy.js - the playground's pre-trained toy tokenizer.
 *
 * Trained lazily on first use from the few-KB corpus in data/corpus.js
 * (takes a few milliseconds). Shared by Lab 1, the "Why tokens" journey and
 * Lab 4 (so token counts are consistent across the whole lesson).
 */
(function (g) {
  'use strict';
  const TL = (g.TokenLab = g.TokenLab || {});
  let cached = null;

  function model() {
    if (!cached) {
      // In the browser the <script> tags provide these; in Node, load them on demand.
      if (!TL.bpe && typeof require === 'function') require('./bpe.js');
      if (!TL.corpus && typeof require === 'function') require('../data/corpus.js');
      const state = TL.bpe.trainFromText(TL.corpus.PLAYGROUND_CORPUS, { numMerges: 400 });
      cached = TL.bpe.modelFromState(state);
    }
    return cached;
  }
  const encode = (text) => {
    const m = model(); // call first: it may need to load TL.bpe in Node
    return TL.bpe.encode(m, text);
  };
  const count = (text) => encode(text).length;

  /** Facts about the toy, computed (never hard-coded) so the UI text cannot drift from reality. */
  function info() {
    const m = model();
    const bytes = TL.corpus.PLAYGROUND_CORPUS.length;
    return {
      corpusKB: bytes / 1000,
      corpusLabel: (bytes / 1000).toFixed(1) + ' KB',
      merges: m.merges.length,
      vocabSize: m.vocab.length,
    };
  }

  TL.toy = { model, encode, count, info };
  if (typeof module !== 'undefined' && module.exports) module.exports = TL.toy;
})(typeof window !== 'undefined' ? window : globalThis);
