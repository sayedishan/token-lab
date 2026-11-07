/**
 * corpus.js - training text and word lists for the TOY tokenizers.
 *
 * Everything here was written for this lesson (no copied text). It is
 * deliberately tiny: a few kilobytes, English only. Real tokenizers train on
 * enormous multilingual corpora - that gap is exactly what Lab 1 lets
 * students feel (non-English text and rare words fall apart into small pieces).
 */
(function (g) {
  'use strict';
  const TL = (g.TokenLab = g.TokenLab || {});

  /** Playground toy vocabulary: trained once at startup from this text. */
  const PLAYGROUND_CORPUS = [
    'A language model does not read letters or words the way people do. It reads numbers, and a tokenizer turns text into those numbers.',
    'The tokenizer cuts the text into small pieces called tokens. Common words are often one token, while rare words are split into several pieces.',
    'When you type a message to a chatbot, the message is split into tokens first. The model then reads the tokens and writes new tokens as its answer.',
    'Learning to count tokens helps you plan the cost of a request and make sure the request fits in the context window.',
    'Our class is learning about tokens and learning how models read text. The teacher says that reading the tokens is the first step.',
    'The students were playing cricket in the evening while the teacher was reading a book about the history of the game.',
    'She is making tea in the kitchen. The tea is hot and the milk is fresh. He is eating a sandwich and reading the news.',
    'It is raining in the city today, so the market is quiet and the streets are empty. The weather will be better in the evening.',
    'We are travelling to the mountains next week. The train leaves in the morning and the journey takes about eight hours.',
    'The team is working on a new project. They are building a simple app that reads a message and sends a short reply to the user.',
    'Writing good code means writing clear names, short functions, and tests that run every time you change something.',
    'The function takes a list of numbers and returns the total. If the list is empty, the function returns zero.',
    'Every request has a limit. The limit is the number of tokens the model can read and write in one conversation.',
    'If the conversation is too long, the oldest messages are removed so that the newest messages still fit inside the limit.',
    'The model can only use what is inside the window. Anything outside the window is not remembered, and the model cannot see it.',
    'Reading, writing, speaking, and listening are four skills. Practising every day makes each skill stronger over time.',
    'The students are asking questions and the teacher is answering them. Good questions help everyone understand the topic better.',
    'My brother is learning to cook. He is making rice, lentils, and vegetables, and he is learning how much salt to add.',
    'The bus was late this morning, so the students were waiting at the station and talking about the match.',
    'Please send the report to the team by Friday. The report should include the results, the problems, and the next steps.',
    'The weather is warm in the summer and cool in the winter. In the monsoon season it is cloudy and the rain comes every day.',
    'There are many ways to build an application, but the simplest way is usually the best way to start.',
    'The teacher is teaching the students how a tokenizer works, and the students are testing the tokenizer with their own sentences.',
    'In the evening, the players were running, throwing, catching, and laughing. The coach was watching and taking notes.',
    'A short message costs fewer tokens than a long message, and a clear message gets a better answer than a confusing one.',
    'We are testing whether the number of tokens changes when we change the words, the spelling, or the language of the sentence.',
    'The library opens at nine in the morning and closes at six in the evening. Students are reading and studying there every day.',
    'He was thinking about the problem, and she was writing the solution. Together they were finishing the work before the deadline.',
    'The model reads the tokens one after another, and each new token depends on the tokens that came before it.',
  ].join(' ') + '\n' + [
    // Coverage lines: every basic ASCII letter, digit and punctuation mark appears at least once, so
    // the toy only falls back to raw bytes for characters it genuinely has not seen (other scripts, emoji).
    'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. A B C D E F G H I J K L M N O P Q R S T U V W X Y Z.',
    'Digits: 0 1 2 3 4 5 6 7 8 9. Numbers like 7, 42 and 2026; the date 2026-11-07; the time 9:30; a price of $5 or a 20% discount.',
    'Symbols: "double" and \'single\' quotes, (round) [square] {curly} brackets, a@b.com, a/b\\c, + = < > ~ ^ | _ # * & ! ? ; : `code`.',
    'function total(items) {',
    '  return items.length;',
    '}',
    'function count(items) {',
    '  return items.length;',
    '}',
  ].join('\n');

  /**
   * Lab 2 mini-corpus: word -> how many times it appears.
   * Chosen so the merge story is easy to follow:
   *   "ay" is the most common glued pair (play AND stay AND player...),
   *   then "pl", then "play", then the suffix "ing" is discovered.
   */
  const LAB2_WORD_FREQS = [
    ['play', 7],
    ['playing', 6],
    ['player', 4],
    ['players', 3],
    ['replay', 3],
    ['replaying', 2],
    ['stay', 4],
    ['staying', 3],
  ];

  /** Words students can try on the Lab 2 vocabulary (the first one was never seen in training). */
  const LAB2_TEST_WORDS = ['playful', 'replayer', 'stray', 'staying', 'playing'];

  TL.corpus = { PLAYGROUND_CORPUS, LAB2_WORD_FREQS, LAB2_TEST_WORDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = TL.corpus;
})(typeof window !== 'undefined' ? window : globalThis);
