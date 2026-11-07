# Instructional design (Token Lab 2.0)

## 1. Learner and context

- **Learner:** a student or early-career developer who uses chatbots but has not looked inside one. No machine-learning background assumed.
- **Delivery:** self-paced (default) or instructor-led (the *Instructor view* toggle).
- **Constraint:** the whole timed experience, including activities and knowledge checks, must fit in **45 minutes**. The plan totals **43**; an optional extension sits outside it.
- **Why this topic:** tokenization and context windows are the foundation of every later LLM topic (chunk sizes, retrieval budgets and agent memory are all measured in tokens), the underlying algorithm (BPE) can be run for real in a browser, and the consequences (cost, forgetting, unequal language costs) are concrete.

## 2. Objectives, activities and assessment are aligned

Each objective has a place where the learner **does** it, and a place where it is **checked**.

| # | Objective (verb → observable behaviour) | Learner does it in | Checked by |
|---|---|---|---|
| 1 | **Explain** what a token is and why models read tokens | Why (journey), Lab 1 visualiser | Warm-up prediction; Token Master level 1 (Q1: what a split like *un · happi · ness* tells you) |
| 2 | **Predict** how typos, numbers, code and other scripts change token count | Lab 1 (predict, then reveal against recorded real tokenizers) | Level 1 (Q2: *work out* the toy tokenizer's count for a Hindi sentence; the engine computes the answer) |
| 3 | **Run** BPE and describe how a vocabulary is learned | Lab 2 (Play / Pause / Next, merge-count slider, "You choose" mode) | Level 2 (Q3: pick the first merge, with a trap; Q4: count tokens after two merges) |
| 4 | **Calculate** whether a request fits a window | Lab 3 planner and Context Window Survival game | Level 3 (Q5, Q6: *work out* how far a changed reply reserve overflows) |
| 5 | **Decide** what an assistant should remember and never store | Lab 4 AI Memory Manager | Level 4 (Q7: select all facts worth pinning; Q8: how resent history grows) |
| 6 | **Apply** it to realistic decisions | Both games, plus the optional extension | Level 5 (Q9: the single change that fixes an overflow; Q10: a report larger than the window) |

## 3. Learning principles, and where each appears

| Principle | How it is applied |
|---|---|
| **Simple to complex** | A sentence → tokens → IDs → a vocabulary (BPE) → a window → memory under pressure → mixed decisions |
| **Learning by doing** | Four simulations, each one a thing to *manipulate*; reading is kept short and sits next to something to change |
| **Predict, observe, explain** | Labs ask for a prediction *before* the reveal, which exposes misconceptions and makes the answer memorable |
| **Retrieval practice with feedback** | Token Master: five levels, three question types, an explanation for *every* option; a hint costs points but is available; three misses reveal the answer so nobody leaves confused |
| **Mastery gating** | Token Master levels open in order; the completion screen opens only when all five are done. A learner is never shown a level they have not earned the prerequisites for (Instructor view lifts the gates for demonstrations) |
| **Worked example, then independence** | Lab 2 runs the algorithm for you, step by step, then asks you to find each merge yourself |
| **Immediate feedback** | Inline validation, live status banners, per-check results in the survival game, probe results in the memory manager |
| **Visual learning** | Colour-coded token types, a stacked window bar with an overflow region, charts, a fact scoreboard |
| **Real-world connection** | Recorded outputs from production tokenizers; a "where this shows up" table; scenarios drawn from real engineering decisions |
| **Honesty about models** | A "real vs simplified" box on the first page; every analogy says where it stops; both games state they are rules, not language models |
| **Inclusion and access** | Offline; phone-width layout; keyboard operable; light and dark themes; reduced-motion respected; contrast computed |

### Gamification: what it is for, and what it is not

XP, levels and badges are only worth having if they reinforce learning. The rules, all enforced by tests:

- **XP is earned by learning activities** (predicting, experimenting, finding the BPE pair yourself, scoring in a simulation, answering). Visiting a page earns nothing.
- **Each activity pays once.** Replaying can raise a score, never add to it, so XP cannot be farmed.
- **Badges are derived from real evidence** and each one shows its criteria (for example *BPE Apprentice* needs three first-try manual merges **and** a finished training run).
- **Nothing in the timed lesson depends on optional work.** The extension is bonus XP only.
- **Levels are reachable** from the timed lesson alone (450 XP available; the top level starts at 360).

Honest limits: game elements can shift attention from understanding to points. The design mitigates this (points come from correct reasoning, hints cost points but are allowed, explanations always appear), but I have not measured the effect on real learners.

## 4. The five design questions, answered for every section

| Section | What students learn | Why it matters | How it works | How they experiment | Where it is used |
|---|---|---|---|---|---|
| **Start** | Goals; what is real and what is simplified; how XP works | Sets expectations and trust | n/a | Predict the token count of a sentence | Any per-token-billed API |
| **Why tokens matter** | The 5-stage journey; three problems with one cause | Cost, speed, memory and fairness are all measured in tokens | Text → tokens → IDs → window → next-token loop | Click through the stages (live toy tokenizer in stages 2-3) | API billing, chat limits, multilingual products |
| **Lab 1 · Tokenization visualizer** | What a token is; subwords vs characters vs words; why typos, numbers, code and scripts cost differently | Token count drives cost and context use | Vocabulary of pieces; IDs; byte fallback | Type any text; 3 views; 10 presets; inspect any token (type, ID, UTF-8 bytes); compare with recorded real tokenizers | Cost estimates, prompt budgets, comparing languages |
| **Lab 2 · BPE trainer** | How a vocabulary is learned by merging frequent pairs | Explains why common words are one token and rare words split | Count pairs → merge the most frequent → repeat | Play / Pause / Next / Previous / Reset, merge-count slider, vocabulary, before/after, per-merge explanation, "You choose" mode, test any word | The tokenizer-training step behind many LLMs |
| **Token Master I** | (retrieval) levels 1-2 | Practice strengthens memory more than re-reading | n/a | 4 questions with per-option feedback; two are *worked out* against the engine | Debugging an unexpected token count |
| **Lab 3 · Window and survival game** | What competes for the window; fit vs overflow; what a request must still contain | Over the window fails; under-filled wastes money; leaving out the wrong thing fails quietly | total = system + history + docs + message + reply | Budget planner with scenarios; a 4-round game where overflow costs lives and omissions cost points | Prompt design, RAG chunk counts, model choice |
| **Lab 4 · Memory manager** | Quadratic growth of resent history; what to save, forget, summarise and never store | Every chatbot needs a memory policy | Stateless chat resends history; short-term context scrolls out; long-term memory is limited; summaries are lossy | Cost chart; then 10 turns (8 save / keep / forget decisions and 2 probe questions) and a summarise action | Support bots, assistants, tutoring apps |
| **Where this shows up** | Token awareness as engineering decisions | Turns knowledge into judgement | n/a | A table of 6 products and the decision each informs | Support bots, document Q&A, code assistants |
| **Token Master II** | (retrieval) levels 3-5 | Mixed practice transfers skills | n/a | 6 questions: budgets, memory, realistic scenarios; one select-all | Sizing prompts and choosing what an assistant remembers |
| **Completion** | Consolidation; six takeaways; XP by area | A closing recap improves retention | n/a | Review results; replay a level to improve | Next topics: chunking, embeddings, RAG |
| *Extension (optional)* | Combine budgeting and memory in code | Doing it with automatic checks shows real ability | Multi-constraint check; a tested function | Rescue the bot; write `trimToFit()` | The code path in every chat product |

## 5. Misconceptions the design targets

| Misconception | Where it is surfaced and corrected |
|---|---|
| "One word = one token" or "one character = one token" | Warm-up prediction; Lab 1 counts under five tokenizers |
| "The tokenizer understands grammar" | Lab 2: `ay` merges before `play`; Token Master Q1 |
| "The pair in the most words is the most frequent pair" | Token Master Q3 (the trap answer is rejected with the real totals) |
| "Non-English text is just longer" | Lab 1 language chart (with the caveat: one sentence, not a benchmark) |
| "The model remembers our chat" | Why (journey stage 4), Lab 3 text, Lab 4 cost chart |
| "Only the prompt counts toward the window" | Lab 3 reserved-for-reply segment; Token Master Q5, Q6 |
| "A bigger window fixes it" | Lab 3 task 2 (watch the cost); Token Master Q10 |
| "Summaries preserve everything" | Lab 4 Memory Manager: summarising keeps the gist and loses the detail, and probes show it |
| "Save everything, just in case" | Lab 4: memory is capped, and stored secrets cost points |
| "Passing the tests means it is the best policy" | Extension Part B closing note |

## 6. Time budget: a model, not a guess

Reading is the main cost, so the budget is computed rather than asserted.

> **Model:** section minutes ≈ (words visible on the page ÷ reading speed) + (feedback text revealed after answers ÷ reading speed) + interaction time (typing, deciding, calculating).

**Measured:** the words a learner can *see* on each page, counted from the rendered page with everything unlocked (Instructor view, so locked levels are included). Hidden or collapsed content is excluded: the optional practice bank, the optional deep dive, the collapsed *why it matters* text, the instructor panel, the reference list and the plan table. Reading speed is a conservative **180 words per minute**.

**Computed from the content:** feedback text for Token Master (359 words if every answer is right first time, plus about 19 words for each wrong attempt).

**Estimated by me, not measured:** the feedback in the two games, and every interaction time.

| Section | Allocated | Words visible | Reading @180 | Feedback | Interaction | Modelled |
|---|---|---|---|---|---|---|
| Start | 2 | 327 | 1.8 | 0.0 | 0.4 | 2.2 |
| Why tokens | 2 | 260 | 1.4 | 0.0 | 0.6 | 2.0 |
| Lab 1 | 6 | 616 | 3.4 | 0.0 | 2.0 | 5.4 |
| Lab 2 | 5 | 488 | 2.7 | 0.2 | 2.0 | 4.9 |
| Token Master I | 4 | 367 | 2.0 | 0.9 | 1.5 | 4.4 |
| Lab 3 | 8 | 711 | 4.0 | 0.8 | 3.0 | 7.8 |
| Lab 4 | 6 | 510 | 2.8 | 0.8 | 2.5 | 6.1 |
| Where this shows up | 1 | 156 | 0.9 | 0.0 | 0.3 | 1.2 |
| Token Master II | 7 | 587 | 3.3 | 1.6 | 2.5 | 7.4 |
| Completion | 2 | 312 | 1.7 | 0.0 | 0.2 | 1.9 |
| **Total** | **43** | **4,334** | **24.1** | **4.3** | **15.0** | **43.4** |

### What this analysis changed

The first 2.0 build was **over budget by my own model**, and my first measuring tool had hidden the problem in both directions. It read a detached copy of each page, so it counted text a learner never sees (collapsed sections, locked levels, the 9-question practice bank) and under-counted the unlocked Token Master and completion pages. I rewrote it to count the *rendered* text of the live page (this document's method), re-measured, and the honest result was:

| | Minutes |
|---|---|
| Reading the timed pages (about 4,960 visible words at 180 wpm) | 27.6 |
| Feedback text revealed after answers | 4.3 |
| Interaction (my estimate) | 15.0 |
| **Modelled total, against a 43-minute plan and a 45-minute limit** | **46.9** |

Sections that could not hold their own activity at the time: Start (-0.3 min left after reading), Lab 3 (1.2 min left for a planner and a four-round game), Token Master II (3.5 min of reading in a 4-minute slot) and the completion screen (-0.9). I fixed it structurally rather than by relabelling minutes:

1. **The 1.0 Final Challenge became an optional extension** at the end, outside the 45 minutes. The Survival game now covers its multi-constraint budgeting role, and its coding half was already optional. It still works, is still tested, and no level or badge depends on it.
2. **The repeated *Why it matters / Where it is used* strip is collapsed** on every page (one click). Both remain in the lesson; *You will learn* stays visible.
3. **Prose was cut** in Start, Lab 3, Lab 1, Lab 2, Real world, Completion and the scoring text. Together with step 2 the timed pages went from about 4,960 to **4,334 visible words**.
4. **Minutes were re-set from the table above**, with Lab 3 raised to 8 (planner plus a four-round game) and Real world cut to 1.

### Honest caveats

- The result is **43.4 modelled minutes against a 45-minute limit**: a 1.6-minute (3.5%) margin, thinner than 1.0's. The break-even reading speed is about **169 words per minute**. A slower reader, or one who re-reads, will exceed 45. At 150 wpm the same model gives about 48 minutes; at 200 wpm, about 41.
- Interaction times are my estimates for a first-time learner. If they are 20% too low, the lesson takes about 46 minutes.
- Levers if a facilitator needs time back: skip Token Master level 5 (about 2 minutes) or "Where this shows up" (1 minute).
- **This is an analytic estimate and has not been validated with real learners.** A 3-5 person pilot is the first thing I would do next.

## 7. Running it instructor-led (45-minute session)

| Time | Activity |
|---|---|
| 0-2 | Start + prediction poll (show of hands: 9, 11, 27 or 54?) |
| 2-4 | Why tokens: walk the journey together |
| 4-10 | Lab 1: learners predict, then check; inspect a token; compare Hindi and English |
| 10-15 | Lab 2: do three merges on the board first, then "You choose" in pairs |
| 15-19 | Token Master I individually; discuss the BPE trap question |
| 19-27 | Lab 3: break each planner scenario on purpose; then the survival game, pairs compare scores |
| 27-33 | Lab 4: predict the cost at turn 30; then the memory manager; compare what each pair protected |
| 33-34 | Where this shows up |
| 34-41 | Token Master II; discuss level 5, "why not drop everything?" |
| 41-43 | Completion screen; one takeaway each |
| 43-45 | Buffer. The extension is homework or for fast finishers |

Every section in Instructor view has talking points, a question to ask the room and a likely misconception; Instructor view also unlocks every Token Master level and previews the completion screen.

## 8. Assessment quality controls

Automated checks guard the quality of the questions themselves:

- every option has its own explanation;
- the correct answer's **position** is spread across all four slots and never repeats back to back;
- **the correct answer is not systematically the longest** (the first 1.0 draft failed this: 13 of 14 correct answers were the longest, so a learner could have passed by guessing; the options were rewritten and a test now prevents regression);
- question **types vary** (multiple choice, work-it-out numbers, select-all);
- **numeric answers come from the engines**, not hard-coded values, so a question can never disagree with what the lab shows;
- numbers quoted inside questions are checked against the recorded data.

## 9. Originality

All lesson text, examples, the toy training corpus, the Lab 2 word list, the survival and memory scenarios, the quiz questions, the challenge and the code were written for this lesson. External work is cited where it is relied on, and analogies (the desk) are distinguished from the real mechanism, with a note on where each stops.
