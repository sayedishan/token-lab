/**
 * lesson.js - the lesson's structure: single source of truth for section
 * titles, time estimates and teaching notes.
 *
 * Why data-driven? The sidebar, the time total, the progress bar and the
 * instructor notes are all generated from this list, so the time budget can
 * never drift out of sync with what the learner sees. A unit test asserts the
 * total stays within the 45-minute limit from the assignment brief.
 *
 * Each section answers the five instructional-design questions:
 *   learn  -> What should students learn?
 *   why    -> Why is it important?
 *   (body) -> How does it work?   (explained in the section itself)
 *   (lab)  -> How can students experiment? (the interactive lab)
 *   where  -> Where is it used in real applications?
 *
 * Token Lab 2.0: the two old checkpoints became the five-level "Token Master"
 * challenge (levels 1-2 after Lab 2, levels 3-5 near the end), and Labs 3 and 4
 * gained the Context Window Survival game and the AI Memory Manager.
 *
 * Time: the timed path is every section that is not `optional`. The 1.0 Final
 * challenge is now an optional extension at the end (minutes: 0, not counted).
 * Section minutes were set from a words-read measurement plus activity time
 * (see docs/INSTRUCTIONAL_DESIGN.md); the estimate has not been piloted.
 */
(function (g) {
  'use strict';
  const TL = (g.TokenLab = g.TokenLab || {});

  /** Hard limit from the assignment brief. */
  const MAX_MINUTES = 45;

  const SECTIONS = [
    {
      id: 'start', title: 'Start here', short: 'Start', minutes: 2, type: 'Dashboard',
      learn: 'What you will be able to do, how XP and badges work, and what is real versus simplified in this lab.',
      why: 'Knowing the goal and the limits of the tools up front makes every later experiment easier to interpret.',
      where: 'Every AI application that bills by the token or has a context limit.',
      teacher: {
        talk: ['Read the six objectives aloud and ask which one sounds hardest.', 'Point out the honesty box: the lab separates what is real from what is simplified.', 'Explain that XP and badges are earned by doing, never by clicking around.'],
        ask: 'Before running anything: how many tokens do you think one sentence is? (Use the prediction below.)',
        misconception: 'Learners often assume one word = one token, or one character = one token. The prediction exposes this early.',
      },
    },
    {
      id: 'why', title: 'Why tokens matter', short: 'Why tokens', minutes: 2, type: 'Motivation',
      learn: 'The five-step journey of a sentence through a language model, and three real problems that all trace back to tokens.',
      why: 'Cost, speed, memory and fairness are all measured in tokens. If you cannot count tokens, you cannot predict them.',
      where: 'API billing, chat history limits, multilingual products.',
      teacher: {
        talk: ['Walk the five nodes of the journey; pause on step 4, the context window.', 'Ask learners which of the three problems they have already seen.'],
        ask: 'Which step of the journey could silently lose information?',
        misconception: '"The model remembers our conversation." In the common chat API pattern the app re-sends the history each time.',
      },
    },
    {
      id: 'lab-1', title: 'Lab 1 · Tokenization visualizer', short: 'Lab 1 · Tokens', minutes: 6, type: 'Simulation 1',
      learn: 'What a token is, how subwords differ from characters and words, and how typos, numbers, code and other scripts change the count.',
      why: 'Token count drives cost and context use. Surprises here become surprise invoices later.',
      where: 'Estimating API cost, budgeting prompts, comparing languages, writing prompts that fit.',
      teacher: {
        talk: ['Have learners predict before pressing a preset, then reveal.', 'Click a single token to inspect it, then compare the toy with the recorded real tokenizers.'],
        ask: 'Which would cost more: the sentence with typos or the clean one? By how much?',
        misconception: 'The toy tokenizer is not GPT\'s tokenizer. Its job is to show the mechanism, not to predict real counts.',
      },
    },
    {
      id: 'lab-2', title: 'Lab 2 · Interactive BPE trainer', short: 'Lab 2 · BPE', minutes: 5, type: 'Simulation 2',
      learn: 'How Byte-Pair Encoding learns a vocabulary by repeatedly merging the most frequent neighbouring pair.',
      why: 'It explains why common words are one token, rare words split up, and why vocabulary size is a trade-off.',
      where: 'The tokenizer training step behind many modern language models.',
      teacher: {
        talk: ['Press Play and pause after the third merge to ask what comes next.', 'Switch on "You choose" so learners must find the most frequent pair.'],
        ask: 'Why did "ay" merge before "play"? What does the algorithm know about English?',
        misconception: 'BPE does not understand grammar or meaning. It only counts how often symbols sit next to each other.',
      },
    },
    {
      id: 'master-1', title: 'Token Master · Levels 1-2', short: 'Master I', minutes: 4, type: 'Simulation 5',
      learn: 'Check tokens and BPE with practical questions: some you work out, not just recognise.',
      why: 'Retrieval practice with immediate feedback strengthens memory far more than re-reading.',
      where: 'The same reasoning you use when debugging an unexpected token count.',
      teacher: {
        talk: ['Let learners answer individually, then discuss any question most got wrong.', 'Hints cost 2 XP: ask when a hint is worth it.'],
        ask: 'Which wrong option was the most tempting, and why?',
        misconception: 'The BPE question has a trap: the pair inside the most words is not the most frequent pair overall.',
      },
    },
    {
      id: 'lab-3', title: 'Lab 3 · Context window and survival game', short: 'Lab 3 · Window', minutes: 8, type: 'Simulation 3',
      learn: 'What a context window is, what competes for its space, and how to keep an assistant working inside it.',
      why: 'A request that does not fit fails or loses information. A request that fits but is bloated wastes money.',
      where: 'Prompt design, RAG (how many chunks to retrieve), choosing a model, cost forecasting.',
      teacher: {
        talk: ['Use the planner presets to break each scenario on purpose, then play the survival game.', 'Point at the reserved-for-reply segment: the answer needs room too.'],
        ask: 'If the window doubles, does your problem disappear? What else changes?',
        misconception: 'Input and output share one budget in most chat APIs; learners often count only the input. Policies differ between models.',
      },
    },
    {
      id: 'lab-4', title: 'Lab 4 · AI memory manager', short: 'Lab 4 · Memory', minutes: 6, type: 'Simulation 4',
      learn: 'Why chat cost grows with every turn, and how deciding what to remember changes what an assistant can do later.',
      why: 'Every production chatbot needs a memory policy; the wrong one is either expensive or forgetful.',
      where: 'Customer-support bots, assistants, tutoring apps, any multi-turn product.',
      teacher: {
        talk: ['Ask for a prediction of cumulative cost at turn 30 before moving the slider.', 'Have pairs compare their memory choices and scores.'],
        ask: 'You could not save everything. How did you decide what to protect, and what should never be stored?',
        misconception: 'The simulator is deterministic, not a language model. It shows what information is available, not how a model reasons.',
      },
    },
    {
      id: 'real-world', title: 'Where this shows up', short: 'Real world', minutes: 1, type: 'Application',
      learn: 'How token awareness changes real engineering decisions.',
      why: 'Connecting the mechanism to decisions is what turns knowledge into skill.',
      where: 'Support bots, document Q&A, multilingual products, code assistants.',
      teacher: {
        talk: ['Ask learners which product they would build a token dashboard for, and why.'],
        ask: 'Which of these would you monitor first?',
        misconception: 'Bigger window is not a free fix: it costs more and does not remove the need to choose what goes in.',
      },
    },
    {
      id: 'master-2', title: 'Token Master · Levels 3-5', short: 'Master II', minutes: 7, type: 'Simulation 5',
      learn: 'Check context budgets, memory decisions and realistic scenarios, then see your mastery score.',
      why: 'Mixed practice with feedback is how skills transfer from the lab to real decisions.',
      where: 'The judgement calls you make when sizing prompts and choosing what an assistant remembers.',
      teacher: {
        talk: ['Levels unlock in order. Instructor view unlocks them all for demonstration.', 'Discuss level 5: why is "drop everything" not a good fix?'],
        ask: 'Where did the engine-checked questions surprise you?',
        misconception: 'Raising the reply budget can break a request that fit: the answer shares the window.',
      },
    },
    {
      id: 'summary', title: 'Completion and takeaways', short: 'Completion', minutes: 2, type: 'Review',
      learn: 'Your final results, six takeaways, and where to go next.',
      why: 'A closing recap improves retention and shows what you achieved.',
      where: 'Next topics: chunking, embeddings, retrieval and RAG all build on token budgets.',
      teacher: {
        talk: ['Ask each learner for one takeaway in their own words.'],
        ask: 'Where will you use token counting first?',
        misconception: 'Rules of thumb are planning tools; production billing numbers come from the real tokenizer.',
      },
    },
    {
      // Optional extension: fully working, but NOT part of the timed path (minutes: 0). In Token Lab 1.0 this was
      // a counted section; the Survival game now covers its budgeting role and the new sections needed the time.
      id: 'challenge', title: 'Extension · Fix the bot and write the code', short: 'Extension', minutes: 0, optional: true, type: 'Optional extension',
      learn: 'Apply everything: repair a failing configuration, then write the trimming function yourself.',
      why: 'Doing the work, with automatic checks, shows what you can actually apply.',
      where: 'This is the code path every chat product with limited context needs.',
      teacher: {
        talk: ['Optional and not part of the timed path: use it as homework or for fast finishers.', 'Part A in pairs, Part B individually. Part B is optional for learners who do not code yet.', 'Compare solutions: who protected the latest message?'],
        ask: 'What would you protect that the checks here do not test?',
        misconception: 'Passing the tests means the function meets this spec, not that it is the best memory policy.',
      },
    },
  ];

  /** The timed path: everything except optional extensions. */
  const required = () => SECTIONS.filter((s) => !s.optional);

  /** Total minutes of the timed path (optional extensions are not counted). */
  const totalMinutes = () => required().reduce((s, x) => s + x.minutes, 0);

  TL.lesson = { MAX_MINUTES, SECTIONS, required, totalMinutes };
  if (typeof module !== 'undefined' && module.exports) module.exports = TL.lesson;
})(typeof window !== 'undefined' ? window : globalThis);
