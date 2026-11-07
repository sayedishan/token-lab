# Test report

**Date:** 2026-11-07 · **OS:** Windows 11 · **Node:** v24.8.0 · **Browser:** Google Chrome 156.0.8078.80 (headless, driven by puppeteer-core) · **Accessibility engine:** axe-core 4.14.0

## Summary

| Suite | Count | Result |
|---|---|---|
| Unit tests (`npm test`) | 45 | **45 pass, 0 fail** |
| End-to-end tests (real Chrome, opened from `file://`) | 61 | **61 pass, 0 fail** (about 60 s) |
| Console errors / warnings / uncaught errors during the whole e2e run | n/a | **0** |
| Requests that left the machine | n/a | **0** (every request was `file:`, `blob:` or `data:`) |
| axe-core violations (WCAG 2.x A/AA + best practice): 10 pages + 13 interactive states × light and dark | 46 audits | **0** |

Reproduce:

```bash
npm test                                                    # unit tests, no setup
npm install --no-save puppeteer-core axe-core               # optional dev tools
# Windows PowerShell example; adjust paths:
$env:AXE_CORE_PATH = "$PWD\node_modules\axe-core\axe.min.js"
$env:BROWSER_PATH  = "C:\Program Files\Google\Chrome\Application\chrome.exe"
node tests/e2e/smoke.e2e.cjs
```

## What the unit tests prove (45)

**Algorithm (`bpe.test.js`, 14):** pre-tokenizing is lossless for any text; the Lab 2 corpus's first merge is `ay` (32×) and is unambiguous; the training story is `play → ▁play → ing`; training is deterministic; `applyMerge` is immutable; every merge shortens the corpus; encoding a training word reproduces its training segmentation; **`decode(encode(text)) === text`** for English, Hindi, Tamil, emoji, code and whitespace; unseen characters fall back to bytes; token IDs are valid and unique; more merges mean fewer tokens and a larger vocabulary; the toy covers basic ASCII but needs bytes for other scripts and emoji.

**Context, memory, challenge (`context.test.js`, 22):** budget fits/overflows, and reply room counts toward the window; cost formula; cumulative chat cost is quadratic (closed form checked) while the windowed strategy is linear; `lastTurns` never leaves an orphaned reply; the reference `trimToFit` passes all 6 tests, **the displayed solution text also passes** (so students never copy a broken answer), **the starter code fails**, and three typical wrong solutions plus a throwing function are caught; the Rescue scenario starts broken, has valid answers, and has near-misses that fit the window but fail on cost; input parsers reject letters, negatives, decimals, empty and out-of-range values; memory strategies keep the system prompt and newest message, **each strategy forgets different facts**, and scenario data is self-consistent.

**Content (`content.test.js`, 9):** the lesson totals **43 minutes and never exceeds 45**; every section has the five design fields; every question has an explanation for every option; correct answers are spread across positions and are **not systematically the longest**; the recorded tokenizer data is internally consistent; **every number quoted in lesson text matches the recording** (36 vs 6 vs 11 tokens, "Token" + "ization", digit grouping `123 | 456 | 789 | 0`, the `" return"` leading-space token, raw-byte pieces for emoji and older-vocabulary Hindi).

## What the end-to-end tests drive (61)

| Area | Checks |
|---|---|
| Shell (4) | Boots from `file://` with 10 sections and 43 min; every nav link opens its section; Next/Back and bad-route fallback; progress ticks |
| Start / Why (2) | Wrong then right prediction feedback; journey stepper, active state, deep link into Lab 3 |
| Lab 1 (7) | Default counts equal the engine; presets; Characters/Words modes; ID toggle; Hindi bytes and the 36-vs-11 encoding switch; **empty input and HTML injection**; chart and table |
| Lab 2 (5) | Start state; Merge/Run 5/Undo/Reset; run to completion (18 merges); unseen word `playful` uses bytes for `f`,`u`; challenge-mode wrong and right picks |
| Checkpoint 1 (4) | 5/5 saved; wrong-then-right = 4/5; two wrong reveals the answer and scores first-try only; keyboard (focus + Enter); Try again |
| Lab 3 (6) | Fits with correct totals and `$0.0202`; overflow by 3,000 with the hatched region; 16K fits; **letters / negative / too large / decimal / empty rejected, state unchanged, reverts on blur**; invalid price; table view |
| Lab 4 (8) | Chart series; break at **turn 37**; keyboard tooltip; out-of-range input; default forgets the name; Summarise keeps name but loses diet/boats; Drop-oldest keeps the opposite set; Keep-everything rejected then accepted; Last-N control and question selector |
| Real world / Challenge (10) | 3 scenario feedbacks; Part A broken (3 of 5) then solved (5 of 5, saved); fits-but-too-expensive still fails; Part B starter scores 2 of 6, hints on request, reference passes 6 of 6, **infinite loop stopped in about 2 s with the page still responsive**, syntax error and missing function reported, common mistakes caught, reset, solution reveal, Tab/Esc editor behaviour |
| Summary / shell features (5) | Checkpoint 2, 6 takeaways and 7 safe references; Reset progress; **theme toggle changes real colours and persists**; Instructor view; progress restored after reload; **app still works when storage throws** |
| Audits (6) | No network; all controls labelled, IDs unique, landmarks present; **axe on 10 pages and on 13 interactive states, in light and dark** |
| Mobile (3) | **No horizontal overflow on any section at 390 px**; menu drawer opens/closes (link, Esc); touch targets ≥ 24 px |
| Hygiene (1) | Zero console errors/warnings across the whole run |

## Defects found by testing, and fixed

Testing was not a formality: it found real bugs. In the order they were found:

| # | Found by | Defect | Fix |
|---|---|---|---|
| 1 | Screenshot review | Challenge Part A showed a **blank chart and no requirement list** (never rendered initially) | Initial render added; e2e asserts "3 of 5 met" on load |
| 2 | Screenshot review | Cost displayed as **`$0.0,202`** (thousands separator inserted after the decimal point) | Group digits in the whole part only; e2e asserts `$0.0202` |
| 3 | Screenshot review | Stray text **"null"** under the real-tokenizer chips (`replaceChildren(null)`) | Filter empty children |
| 4 | Screenshot review | Hero tokens looked broken: the toy corpus lacked `Y` and `'`, so ordinary ASCII fell back to bytes | Coverage lines added to the corpus; test now asserts ASCII needs no bytes while Hindi/emoji do |
| 5 | Unit-test audit | `▁` vs `␣` shown inconsistently; **a scripted edit had silently not applied** | Fixed with an explicit edit; unit test pins the behaviour |
| 6 | Screenshot review | Chart value labels were far from the bar tips; "Window limit" label overlapped the bar | Bars sized so values sit at the tip; spacing fixed |
| 7 | Quiz-quality test | **13 of 14 correct answers were the longest option** (guessable) | Options rewritten and shortened; test prevents regression |
| 8 | Quiz-quality test | All three "pick the fix" answers were option A | Positions varied; test checks spread |
| 9 | Timing analysis | Reading load alone was 27 of 43 minutes; Summary over budget | Prose cut about 9%; minutes rebalanced (see INSTRUCTIONAL_DESIGN §6) |
| 10 | axe | **Dropped messages and dimmed quiz options used `opacity`** and failed colour contrast | Explicit AA colours, strikethrough and label instead of opacity |
| 11 | axe | Accessible name did not contain the visible label on the journey buttons, brand link and merge-pair buttons (WCAG 2.5.3) | Names now contain the visible text; prefixes are screen-reader-only |
| 12 | axe | Headings skipped levels (h1 → h4) | Proper heading levels |
| 13 | axe (interactive states) | Scrollable merge log not keyboard-focusable; tooltip outside any landmark | `tabindex=0`; tooltip `aria-hidden` (it duplicates each mark's label) |
| 14 | Screenshot review | Sparkline end-dot squashed into an ellipse; challenge checklist squeezed on phones | Dot is an HTML overlay; checklist stacks on small screens |

Test-harness issues (not app bugs), fixed so the tests are trustworthy: triple-click does not select-all in headless Chrome (replaced with `select()`); typing digit by digit passes through valid values, so invalid-input tests use a paste-style single event; axe's own stylesheet fetches log CORS errors under `file://` (muted **only** during axe runs, only for that pattern; the app is checked separately with axe off); and one test failed intermittently on the final ZIP check because CSS `scroll-behavior: smooth` let an automated click land on the sticky header mid-scroll, so the whole suite now runs under `prefers-reduced-motion` (which also exercises the app's reduced-motion path). After that change the suite passed twice in a row on the source and once on the extracted ZIP.

## Manual checks performed

Visual review of screenshots in **light, dark and 390 px mobile** for all ten sections after each round of changes; checked that every statement in the lesson about recorded numbers appears in the data (automated), and that the lesson text matches what the labs do.

## Not tested (be aware)

- **Firefox and Safari**: standard APIs only, but not run.
- **Real assistive technology**: no manual NVDA/JAWS/VoiceOver pass. Automated audits and keyboard-only operation pass; that is not a substitute.
- **Real learners**: the 43-minute estimate is modelled, not measured.
- **Very old browsers**: the app uses modern JavaScript (`\p{L}` regexes, `ResizeObserver`, CSS `color-mix`, `:has`) and expects a current browser.
- **Slow or low-memory devices**: not profiled; the work per keystroke is tiny (600 characters maximum).
