# Architecture and design decisions (Token Lab 2.0)

This document explains how Token Lab is built and, more importantly, **why** each choice was made. Version 2.0 *extended* the 1.0 code base rather than replacing it: the layering, the rules and almost every 1.0 module survive; section 9 lists exactly what changed.

## 1. Goals that shaped the design

| Goal | Consequence |
|---|---|
| A student must be able to open it with **no setup** | No build step, no server, no dependencies, no network. `index.html` works from `file://` |
| Everything on screen must be **true** | Real algorithms where possible; static *recordings* of real tokenizers rather than invented numbers; every simulation is labelled as a simulation |
| It must be **provably correct** | Logic is separated from the UI so it can be unit-tested in Node; the UI is tested in real browsers |
| It must fit **45 minutes** | Lesson structure is data, and a test fails if the total exceeds 45 |
| Game mechanics must **serve learning** | XP is only earned for learning activities, can be earned once per activity, and badges are derived from XP events (section 4.5) |

## 2. Layers

```
                  ┌─────────────────────────────────────────────────────┐
  index.html ───► │ app.js   routing · sidebar · theme · XP chip · pager │
                  └───────────────┬─────────────────────────────────────┘
                                  │ renders
                  ┌───────────────▼─────────────────────────────────────┐
                  │ sections/   one file per lesson page (12 routes);    │  presentation
                  │ *-ui.js     the three simulation front-ends          │
                  └───────┬──────────────────────────┬──────────────────┘
                          │ uses                     │ uses
              ┌───────────▼───────────┐   ┌──────────▼──────────────────┐
              │ ui/  dom · store ·    │   │ data/  lesson · quizzes ·   │
              │ gamify · components · │   │ corpus · real-tokens        │  content
              │ charts · quiz · code- │   └──────────┬──────────────────┘
              │ runner                │              │
              └───────────┬───────────┘              │ read by
                          │ calls                    │
                  ┌───────▼──────────────────────────▼──────────────────┐
                  │ core/  bpe · toy · modes · estimate · context ·      │  pure logic
                  │        survival · memorymgr · master · gamification  │  (no DOM)
                  │        memory · challenge                            │
                  └─────────────────────────────────────────────────────┘
```

The rule: **`core/` never touches the DOM.** That is what makes it testable in Node and reusable. `ui/` and `sections/` contain no algorithms; they only display what `core/` computes. 2.0 kept this rule for all four new engines: the survival game, the memory manager, Token Master and the XP system each have a pure engine plus a thin UI file.

## 3. Module reference

| File | Responsibility |
|---|---|
| `core/bpe.js` | Byte-Pair Encoding: pre-tokenizer, immutable trainer, rank-based encoder, byte fallback, decoder, vocabulary listing, per-merge explanation |
| `core/toy.js` | The pre-trained toy tokenizer used across labs (trained once, lazily; 356 merges from a ~4 KB corpus written for the lesson) |
| `core/modes.js` | Character and word tokenizers, UTF-8 helpers, and the token *classifier* behind Lab 1's colour-by-type and inspector |
| `core/estimate.js` | The "chars ÷ 4" rule of thumb; strict input validation helpers |
| `core/context.js` | Budget planner, cost formula, per-turn growth, `trimToFit`, `lastTurns` |
| `core/survival.js` | **New.** Engine for the Context Window Survival game (rules in section 4.6) |
| `core/memorymgr.js` | **New.** Engine for the AI Memory Manager (section 4.7) |
| `core/master.js` | **New.** Token Master: 5 levels × 2 questions, three question types, engine-computed answers, scoring and unlock rules (section 4.8) |
| `core/gamification.js` | **New.** XP rules, levels, badges: pure functions on a plain object (section 4.5) |
| `core/memory.js` | 1.0's four-strategy comparison (kept, now an optional deep dive in Lab 4) |
| `core/challenge.js` | Part A requirements; Part B tests and reference solution; the test runner |
| `data/lesson.js` | Section list: titles, minutes, learn/why/where, instructor notes |
| `data/quizzes.js` | All questions with a `why` for every option (used by Token Master and the optional practice bank) |
| `data/corpus.js` | Text used to train the toy tokenizers |
| `data/real-tokens.js` | **Generated** by `tools/record_real_tokens.py` from tiktoken |
| `ui/dom.js` | `h()` hyperscript, `rich()` inline formatting, icons, formatting, tooltip |
| `ui/store.js` | Progress, settings and scores in `localStorage`, with an in-memory fallback; emits XP/badge changes |
| `ui/gamify.js` | **New.** XP chip, toasts and the live-region announcement, dashboard cards, badge views |
| `ui/components.js`, `charts.js`, `quiz.js`, `code-runner.js` | Callouts and lab frames; charts; quiz engine; Web Worker sandbox for learner code |
| `sections/*.js` | One file per page. `survival-ui.js`, `memory-ui.js`, `master-ui.js` are the front-ends of the three new simulations |
| `app.js` | Hash router, sidebar, top bar, theme and instructor toggles, pager |

## 4. Key mechanisms

### 4.1 Byte-Pair Encoding (`core/bpe.js`)

*Training*: start with each word as a list of characters (a leading space becomes `▁`). Repeat: count adjacent pairs weighted by word frequency; merge the most frequent pair everywhere. Stop at the requested number of merges, or when no pair occurs at least twice (a pair seen once is not evidence of a useful pattern). Ties go to the pair seen first, which makes training **deterministic**, so every learner (and every test) sees the same merges and the same pair counts.

*State is immutable*: `applyMerge` returns a new state. That gives Lab 2 its Play / Pause / Next / Previous / Reset and a merge-count slider for free (any step is just "state after *n* merges"), and made the algorithm easy to test (a test asserts the original state is untouched).

*Encoding*: split text with a pre-tokenizer regex that covers every character (so splitting is lossless), turn each piece into symbols, then repeatedly merge the adjacent pair with the **lowest rank** (learned earliest) until none applies. A test proves that encoding each training word reproduces the segmentation produced during training. The *before / after* panel in Lab 2 is two calls to the same encoder: one with zero merges, one with the current merges.

*Byte fallback*: a character not in the alphabet becomes its UTF-8 bytes, shown as `<0xE0>`. This is why the toy never needs an "unknown" token, and it demonstrates the real mechanism behind expensive non-English text.

*Invariant, tested on English, Hindi, Tamil, emoji, whitespace and code*: `decode(encode(text)) === text`.

### 4.2 Lab 1 visualiser (`core/modes.js`, `sections/lab1.js`)

Three tokenizers over one text box: characters, words and the learned subword tokenizer. The classifier labels each token (word start, word piece, number, punctuation, whitespace, raw byte) from the pieces alone; it is explicitly a *display heuristic*, and the inspector says so. A fourth panel shows **recorded** output of two real tokenizers (`cl100k_base`, `o200k_base`, tiktoken 0.14.0), never computed in the browser. Input is capped at 600 characters and empty input has its own message.

### 4.3 Context arithmetic (`core/context.js`)

- `planBudget`: total = system + history + documents + user + reserved output; it fits iff total ≤ window. (In most chat APIs the allowed output must fit too, so the planner counts it.)
- `requestCost = input/1e6 × inputPrice + output/1e6 × outputPrice`.
- `conversationGrowth`: turn *t* sends `system + min(t-1, keep) × (user+reply) + user`. With full history the cumulative total is `n(system+user) + (user+reply)·n(n-1)/2`, which is **quadratic**; a test checks the closed form.

### 4.4 The coding challenge (`core/challenge.js`, `ui/code-runner.js`)

Tests are **data** (messages with token counts and the expected surviving ids), so they are deterministic and the same `runTrimTests` function grades both the Node unit tests and the browser. For the browser, that function's source text is injected into a Web Worker. The page terminates the worker after 2 seconds, so a learner's infinite loop cannot freeze the tab. Unit tests prove the reference solution passes, the starter code fails, and three typical wrong solutions are each caught.

### 4.5 Gamification (`core/gamification.js`, `ui/gamify.js`)

The progress object is `{ xp: {eventId: points}, flags, counters }`, changed only by pure functions that return a new object.

- **Every XP source is a learning activity** (a prediction, comparing a typo with its correction, finding the top BPE pair yourself, a simulation score, a correct answer). Visiting a page earns nothing: a test asserts that an empty progress object has 0 XP and no badges, and that badges unlock only from activity events.
- **Earned once.** Re-awarding an event only *raises* its points to a better score; it never adds them again, so XP cannot be farmed by replaying. Hints cost XP.
- **Badges are derived, not stored.** `badges(progress)` computes which are unlocked from the XP events, so they cannot drift out of sync, and each badge shows its criteria and which are met.
- **Levels are reachable.** The maximum XP is computed from the rule table (510), and a test asserts it exceeds the top level's threshold (420 XP) by a safe margin, so no level is out of reach.
- **Unlockable content** is two things: Token Master levels open in sequence, and the completion screen opens when all five are done. *Instructor view* unlocks everything for demonstrations, and the completion screen is then labelled *Preview*.

### 4.6 Context Window Survival (`core/survival.js`)

A **deterministic** game (no model, no randomness). Each of four rounds gives a new customer message. The student chooses which system rules, history messages and retrieved documents to send, the window size and how much room to reserve for the reply. The engine checks plain rules: does the total fit; is each *fact* the question needs still in the history that was sent; is the needed evidence document included; is the needed policy rule still present; is there room for the whole answer. Token sizes are round game numbers, not measurements. The UI says it is "not a language model", and that overflow handling differs between real models.

### 4.7 AI Memory Manager (`core/memorymgr.js`)

A deterministic simulation of an assistant with a small short-term context and a small long-term memory. Every scripted message is **hand-tagged** with the facts it carries; for each message the student chooses *save*, *keep in context only* (it will scroll out) or *forget*, and can *summarise* (lossy: only "gist" facts survive) or delete memories. Probe questions then report whether the facts were still available. The simulation only claims what is true: a model cannot use information that is not in its prompt. Stored secrets reduce a *hygiene* score. Token counts come from the same toy tokenizer as Lab 1. Caps were tuned (and a test asserts) so that saving everything does not fit.

### 4.8 Token Master (`core/master.js`, `sections/master-ui.js`)

Five levels × two questions (tokens, BPE, context budget, memory, mixed), split across two places in the lesson: levels 1-2 after Lab 2, levels 3-5 near the end.

- **Three question types** (multiple choice, a number you work out, select-all) so it is not one repeating pattern.
- **Answers come from the engines.** The BPE question asks for a count the BPE trainer computes; the byte-fallback question asks for a count the toy tokenizer computes; budget questions use the planner. The answer can therefore never disagree with what the labs show.
- **No guessable pattern**: correct positions are spread over all four slots (never the same twice in a row), the correct option is not systematically the longest or shortest, and tests enforce all of it.
- **Scoring**: first try 10 XP, second 6, third 2; a hint costs 2; three misses reveal the answer. Each option, right or wrong, has its own explanation. Mastery is a percentage of the maximum, and 80 % earns the *Token Master* badge.

## 5. Design decisions and trade-offs

| Decision | Alternatives considered | Why this one |
|---|---|---|
| **Vanilla JS, no framework** | React | The lesson is widgets, not an app. A framework would need a build step or a CDN, either of which breaks "double-click to run" and offline use |
| **Classic scripts, not ES modules** | `type="module"` | Browsers block module imports from `file://` (CORS). A shared `TokenLab` namespace and "UMD-lite" wrappers keep the code modular and Node-testable |
| **Implement BPE myself** | Ship a real tokenizer library | A real vocabulary is 1-2 MB, and the point is to *show the algorithm*. Real outputs are recorded instead, with the library version and date shown |
| **Static real-tokenizer recordings** | Run a real tokenizer in-browser; invent illustrative numbers | In-browser needs large data files. Invented numbers would violate the accuracy rule. Recording keeps real numbers at tiny cost |
| **Rule-based simulations (survival, memory)** | Call a real LLM | A live model needs an API key and gives non-reproducible output. The simulations isolate exactly what each lab teaches and are deterministic and testable |
| **Immutable training state** | In-place mutation | Undo, step-through, the merge-count slider and testability come for free |
| **XP tied to activities, once each** | Points for page visits and clicks | Clicking around would be rewarded as much as learning. Replay-safe scoring keeps XP meaningful |
| **Badges derived from XP events** | Stored badge flags | They cannot disagree with the XP shown, and the criteria are testable |
| **Engine-computed quiz answers** | Hard-coded numbers | A quiz number that drifts from the lab's output would teach the wrong thing |
| **Quiz options as buttons, not radios** | Radio inputs | Arrow keys on radios change the selection, so keyboard users would commit to answers accidentally |
| **Dark navy default with a light theme** | Follow the OS setting | A consistent first impression for the product; the toggle is one click and is remembered. The OS preference is deliberately not used for the default (and a test asserts it) |
| **Data-driven lesson structure** | Hard-coded sidebar and totals | Times can never drift from what the learner sees, and a test enforces the 45-minute limit |
| **Data-viz palette validated with a tool** | Eyeballed colours | Adjacent-colour separation for colour-blind readers was computed, not guessed; label ink was chosen per fill for ≥4.5:1 contrast |
| **No `innerHTML`** | Template strings with `innerHTML` | Learners type arbitrary text into the playground; building DOM from text nodes makes injection impossible (and is tested) |

## 6. Security and robustness

- **No network access**: no CDN, fonts or analytics; a test asserts every request is `file:`, `blob:` or `data:`, and another runs the lesson with the network switched off.
- **Learner code is sandboxed** in a Web Worker (no DOM access) with a timeout. It runs only in the learner's own browser, and nothing is uploaded.
- **Storage can fail** (private mode, blocked cookies): every `localStorage` access is wrapped, and a test runs the app with storage that throws. Only progress, scores and settings are stored, never what a learner types. The storage key is unchanged from 1.0, so 1.0 progress still loads.
- **Input validation**: whole numbers and decimals are parsed strictly (no `1e3`, no `12.5` for integer fields), ranges are enforced, and invalid text never changes state.
- **Timers are cleaned up**: leaving a page runs its cleanup callbacks (the Lab 2 auto-play timer is cancelled; Token Master unsubscribes from the store), so nothing keeps running in the background. An end-to-end test starts the BPE auto-play, leaves the page, waits, and asserts the run never finished.

## 7. Accessibility

Semantic landmarks and one `h1` per view; a skip link; visible focus rings; `aria-live` regions for feedback and for XP/badge announcements; every control labelled (WCAG 2.5.3 *label in name* is checked by axe, and a mismatch on the XP chip found during 2.0 testing was fixed by letting its visible text be its name); correct list, definition-list and heading structures (also found by axe during 2.0 testing); charts have legends, direct labels where they fit, keyboard tooltips and a table alternative; `prefers-reduced-motion` is respected (decorative animation stops and the BPE auto-play steps without delay, so the end-to-end suite turns motion on to exercise Play / Pause); a 24 px minimum target size; text contrast was computed for both themes. Automated audits cover all 12 routes and 18 interactive states in both themes. See `docs/TEST_REPORT.md` for what automated checks cannot establish.

## 8. Extending it

- **New quiz question**: add an object to `data/quizzes.js` with four options, a `why` for each, and a `correct` index. Unit tests validate its shape, answer-position spread and length balance.
- **New section**: add its metadata to `data/lesson.js` (the total and sidebar update themselves), create `js/sections/<id>.js` registering `TokenLab.sections['<id>']`, and add the `<script>` tag to `index.html`.
- **New XP source or badge**: add a rule to `RULES` or `BADGES` in `core/gamification.js`; the max-XP, reachability and "every XP source is an activity" tests run on the table.
- **Refresh the real tokenizer data**: `pip install tiktoken` then `python tools/record_real_tokens.py`. The tests that pin numbers quoted in the text will tell you if the lesson wording needs to change.

## 9. What changed from 1.0 to 2.0

| Area | 1.0 | 2.0 |
|---|---|---|
| Lab 1 | Playground with three modes and a real-tokenizer panel | Adds a token inspector (type, ID, UTF-8 bytes), colour by type, ID toggle, and counts for characters / words / tokens |
| Lab 2 | BPE merge-by-merge with undo and a challenge mode | Adds Play / Pause / Next / Previous / Reset, merge-count slider, vocabulary, before/after tokenization and a per-merge explanation; the challenge mode is kept |
| Lab 3 | Budget planner | Planner kept; adds the Context Window Survival game |
| Lab 4 | Cost chart and four-strategy comparison | Adds the AI Memory Manager; the comparison is kept as an optional deep dive |
| Quizzes | Two 5-question checkpoints | Replaced by the five-level Token Master challenge (the old question bank powers its multiple-choice items and an optional practice bank) |
| Game layer | none | XP, levels, five badges, dashboard, unlockable levels, completion screen |
| Look | Light by default, dark available | Dark navy default with purple / cyan / blue accents, light theme kept |
| Sections | 10 | 11 timed sections (43 min) plus an untimed progress page |

Unchanged and still tested: the BPE and context-arithmetic cores, the cost model, the final challenge (Part A and the Web Worker-graded Part B), the real-tokenizer recordings, the offline guarantee and the storage fallbacks.

## 10. What I would do next

1. Pilot with 3-5 learners and replace the modelled time estimate with measured times.
2. Add a manual screen-reader pass (NVDA/VoiceOver) and test in Firefox and Safari.
3. Offer the optional "live" mode: a bring-your-own-key panel that sends the Lab 4 conversation to a real model, so students can compare it with the rule-based simulation.
4. Native-speaker review of the Hindi and Tamil examples, and a third script (for example Arabic or Telugu).
