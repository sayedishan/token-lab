/**
 * quizzes.js - question banks.
 *
 * Instructional design choices:
 *  - Every wrong option is a REAL misconception, and each has its own
 *    explanation, so a wrong answer teaches instead of just scoring.
 *  - `correct` is an index into `options`.
 *  - Questions are kept short on purpose: reading load counts against the
 *    45-minute budget. Option lengths are balanced and answer positions are
 *    spread out, so a learner cannot pass by picking "the longest" or
 *    "always B". A unit test (tests/unit/content.test.js) enforces both.
 *  - Questions that depend on recorded numbers say so in the explanation, and
 *    a test checks those numbers against js/data/real-tokens.js.
 */
(function (g) {
  'use strict';
  const TL = (g.TokenLab = g.TokenLab || {});

  /** The opening prediction on the Start page (not scored). */
  const PREDICTION = {
    id: 'predict-first',
    stem: 'Predict: how many tokens is this sentence on a real production tokenizer?\n"Tokenization is the first step a language model takes."',
    options: [
      { text: '9 (one per word)', why: 'Close, and the most common guess. But "Tokenization" is itself split in two, and the final full stop is its own token.' },
      { text: '11', why: 'Yes. In the recorded output for cl100k_base, "Token" + "ization" are two tokens, each of the other 8 words is one token, and "." is one: 2 + 8 + 1 = 11.' },
      { text: '54 (one per character)', why: 'The sentence has 54 characters, but tokens are usually much bigger than one character. Large vocabularies make common words single tokens.' },
      { text: '27 (about two characters each)', why: 'Tokens in English average around four characters on large tokenizers, so the count is much lower than this.' },
    ],
    correct: 1,
  };

  const CHECKPOINT_1 = [
    {
      id: 'c1-q1',
      stem: 'A tokenizer splits "unhappiness" into "un" + "happi" + "ness". What does that tell you?',
      options: [
        { text: 'The tokenizer knows English grammar, so it cuts at prefixes and suffixes on purpose.', why: 'Tokenizers do not know grammar. They only learned which pieces were frequent in their training text.' },
        { text: 'Those pieces were frequent in its training text, so they earned entries.', why: 'Right. Vocabulary entries come from frequency, not meaning. Sometimes pieces line up with real prefixes and suffixes, but that is a side effect.' },
        { text: 'The model stores the word as three separate dictionary words.', why: 'They are tokens (pieces of text), not words, and the model never stores words as such.' },
        { text: 'Every word is always cut into exactly three equal parts.', why: 'Common words are often a single token; the number of pieces depends on the word and the vocabulary.' },
      ],
      correct: 1,
    },
    {
      id: 'c1-q2',
      stem: 'At each step of BPE training, which pair of neighbouring symbols gets merged?',
      options: [
        { text: 'The longest pair, since long pieces shorten sequences most.', why: 'Length is not the rule. A long pair that appears once is useless as a vocabulary entry.' },
        { text: 'A random pair, so the vocabulary stays varied.', why: 'BPE is deterministic: given the same data and tie-break rule it produces the same vocabulary.' },
        { text: 'The most frequent pair across the training data.', why: 'Correct. Frequent pairs save the most tokens when glued together, which is the whole point of the method.' },
        { text: 'The pair that spells a real dictionary word.', why: 'BPE has no dictionary. "ay" merged before "play" in Lab 2 because it was more frequent, not because it is a word.' },
      ],
      correct: 2,
    },
    {
      id: 'c1-q3',
      stem: 'The same sentence took 36 tokens in Hindi but 6 in English on cl100k_base (recorded). Best explanation?',
      options: [
        { text: 'Hindi carries more meaning, so it needs more tokens for the same idea.', why: 'The two sentences have the same meaning. The difference comes from how the text is cut up, not from content.' },
        { text: 'Hindi was rare in the training text, so words split into tiny pieces, even bytes.', why: 'Correct. Rare scripts get few vocabulary entries, so text falls back to tiny pieces. The newer o200k_base needed only 11 tokens for the same sentence, so vocabulary design can reduce (but not erase) the gap.' },
        { text: 'The provider charges a surcharge for Hindi, so each character counts as several tokens.', why: 'Pricing is per token. The gap appears because the number of tokens differs, not because of a language surcharge.' },
        { text: 'BPE only works on Latin letters, so Hindi uses a slower method.', why: 'BPE handles any script, as the recording shows. It is just less efficient when the training data had little Hindi.' },
      ],
      correct: 1,
    },
    {
      id: 'c1-q4',
      stem: 'In Lab 2 you ran more merges. What generally happens to the number of tokens for the training text?',
      options: [
        { text: 'It falls, because pieces get longer, but the vocabulary grows.', why: 'Yes. That is the core trade-off: shorter sequences against a larger vocabulary.' },
        { text: 'It rises, because there are more distinct pieces to track.', why: 'Each merge replaces two symbols with one, so the text can only get shorter or stay the same.' },
        { text: 'It stays the same, because the text itself has not changed.', why: 'The text is identical but its segmentation changes: fewer, longer pieces.' },
        { text: 'It falls, and the vocabulary shrinks too, as merged pieces replace old ones.', why: 'Each merge adds a new vocabulary entry, so the vocabulary grows as the text shrinks.' },
      ],
      correct: 0,
    },
    {
      id: 'c1-q5',
      stem: 'Your toy tokenizer meets "playful" and has never seen "f" or "u". What does a byte-fallback tokenizer do?',
      options: [
        { text: 'It stops with an unknown-word error.', why: 'Byte-fallback exists precisely to avoid that: any text can be written as bytes.' },
        { text: 'It swaps the word for an unknown token, losing the spelling.', why: 'Older word-level tokenizers did this. Byte-fallback keeps the information.' },
        { text: 'It uses known pieces plus raw bytes for the rest, losing nothing.', why: 'Correct. You saw "▁play" plus byte tokens for "f" and "u" plus "l" in Lab 2. It is lossless but costs extra tokens.' },
        { text: 'It guesses the nearest known word, such as "play", and encodes that.', why: 'Tokenizers do not guess. They apply fixed merge rules mechanically.' },
      ],
      correct: 2,
    },
  ];

  const CHECKPOINT_2 = [
    {
      id: 'c2-q1',
      stem: 'The window is 8,000 tokens. Your prompt is 7,500 and you allow 1,000 tokens of reply. What commonly happens?',
      options: [
        { text: 'It works: only the 7,500-token prompt counts against the limit.', why: 'In most chat APIs the allowed output also has to fit in the window.' },
        { text: 'It is rejected or must shrink: 7,500 + 1,000 exceeds 8,000.', why: 'Correct for many providers. Rules differ slightly by provider, so always read the documentation for your model.' },
        { text: 'The model quietly ignores the oldest part of the prompt and answers anyway.', why: 'Silent truncation depends on how an app is built, and is a bug waiting to happen. Do not rely on it.' },
        { text: 'The reply is automatically cut to the 500 tokens that fit.', why: 'Some systems may cap output, but you should not assume this; plan your budget explicitly.' },
      ],
      correct: 1,
    },
    {
      id: 'c2-q2',
      stem: 'Which statement about the context window is accurate?',
      options: [
        { text: 'It is the long-term memory a model keeps for every user across separate conversations.', why: 'The window is per request. A model does not carry your conversation into other chats by itself.' },
        { text: 'It is the total amount of training text, so a bigger window means a smarter model.', why: 'Training data and context window are unrelated quantities, and a bigger window does not by itself make a model smarter.' },
        { text: 'It is one request’s token capacity, shared by prompt, history, documents and reply.', why: 'Correct. That sharing is why Lab 3 had five competing segments.' },
        { text: 'It is the maximum length of the message a user may type into the chat box.', why: 'System prompt, history, documents and the reply also count, not just what the user types.' },
      ],
      correct: 2,
    },
    {
      id: 'c2-q3',
      stem: 'An app resends the full history every turn. How does total input sent over the whole chat grow?',
      options: [
        { text: 'Linearly, since each turn adds about the same amount.', why: 'Each request is bigger than the last, so the total grows faster than linear.' },
        { text: 'Roughly quadratically: turn N resends the N-1 turns before it.', why: 'Correct. You saw the curve bend upward in Lab 4. Prompt caching can reduce what you pay, but the tokens are still in the context.' },
        { text: 'It stays flat, because the model remembers earlier turns itself.', why: 'In the common chat API pattern the model is stateless; the app resends the history.' },
        { text: 'It shrinks, because the model compresses old turns automatically.', why: 'Models do not compress history unless you build that step (for example, summarising).' },
      ],
      correct: 1,
    },
    {
      id: 'c2-q4',
      stem: 'A customer gives an order number in turn 1; by turn 40 the bot has forgotten it. Which fix bounds cost and protects it?',
      options: [
        { text: 'Keep all 40 turns in every request and accept the growing cost.', why: 'It works until cost or the window limit stops it, and the cost keeps growing every turn.' },
        { text: 'Raise the temperature so the model recalls details better.', why: 'Temperature changes randomness of wording, not what information is available.' },
        { text: 'Keep a bounded recent window and pin key facts in the system prompt.', why: 'Correct. Recent turns give flow; pinned facts protect what must never be lost. Lab 4 showed that dropping or summarising blindly loses facts.' },
        { text: 'Count characters instead of tokens for a more accurate history.', why: 'Counting differently does not change what is inside the window.' },
      ],
      correct: 2,
    },
    {
      id: 'c2-q5',
      stem: 'Why not rely on "characters divided by 4" for exact billing?',
      options: [
        { text: 'It is a rough English rule; exact counts depend on the model’s tokenizer.', why: 'Correct. The Hindi and Tamil examples in Lab 1 show how far it can be off.' },
        { text: 'Tokens are always exactly three characters, so it overestimates everything.', why: 'Token length varies widely: single characters, whole words, even partial bytes.' },
        { text: 'Providers do not publish per-token prices, so any estimate is meaningless anyway.', why: 'Most providers do publish per-token prices; that is why counting matters.' },
        { text: 'It always overestimates, for every language and every kind of text.', why: 'It underestimates for some languages and text types, so it is not reliably high or low.' },
      ],
      correct: 0,
    },
  ];

  /** "Pick the fix" scenarios in the Real world section. */
  const SCENARIOS = [
    {
      id: 'rw-1',
      title: 'The intermittent error',
      stem: 'Your document Q&A bot sometimes fails with "context too long". It retrieves 5 chunks, some huge. Best first fix?',
      options: [
        { text: 'Always use the largest model, because a bigger window ends the problem for good.', why: 'A bigger window costs more and still fails if the input is unbounded. It does not replace budgeting.' },
        { text: 'Delete the system prompt so there is always room for chunks.', why: 'You would lose behaviour you designed. Trim what is optional, not what defines the bot.' },
        { text: 'Count tokens first, and retrieve fewer or smaller chunks when it would not fit.', why: 'Correct. Measuring first turns a random failure into a controlled decision. This is the budget calculation from Lab 3.' },
        { text: 'Ask users to write much shorter questions so requests stay small.', why: 'The big chunks, not the question, are the problem.' },
      ],
      correct: 2,
    },
    {
      id: 'rw-2',
      title: 'The slow, costly Hindi version',
      stem: 'Your bot works in English and Hindi, but Hindi chats cost more and respond slower. What should you check first?',
      options: [
        { text: 'Whether Hindi users simply type longer messages, which alone would explain the cost.', why: 'Possible, but the more fundamental cause is how the same text is split into tokens.' },
        { text: 'Token counts of equivalent Hindi and English messages on your model’s tokenizer.', why: 'Correct. Cost and speed track tokens, and the same meaning can need many more tokens in some scripts. Measure it for your model; do not assume.' },
        { text: 'Whether the model "likes" Hindi less, and switch to English-only mode.', why: 'Preference is not the mechanism; token count is measurable.' },
        { text: 'Nothing: the language of a message never affects its token count.', why: 'The recorded examples in Lab 1 show it can.' },
      ],
      correct: 1,
    },
    {
      id: 'rw-3',
      title: 'The 300-page report',
      stem: 'A report is far larger than the model’s context window and you need answers from it. What do you do?',
      options: [
        { text: 'Paste only the first 10% and hope the answer is in that part.', why: 'You would be guessing which part holds the answer.' },
        { text: 'Use a smaller font so more of the report fits.', why: 'Font size has no effect; the model counts tokens, not pixels.' },
        { text: 'Tell the model to ignore the overflow and answer from what fits.', why: 'Overflowing content is not read at all; the request typically fails.' },
        { text: 'Split it into chunks, then retrieve relevant ones or summarise in stages.', why: 'Correct. Chunking plus retrieval (RAG) or staged summarising are the standard approaches, and they are the next topics in this course.' },
      ],
      correct: 3,
    },
  ];

  TL.quizzes = { PREDICTION, CHECKPOINT_1, CHECKPOINT_2, SCENARIOS };
  if (typeof module !== 'undefined' && module.exports) module.exports = TL.quizzes;
})(typeof window !== 'undefined' ? window : globalThis);
