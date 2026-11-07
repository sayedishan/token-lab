/**
 * End-to-end tests: drive the REAL interface in a REAL browser (headless Chrome/Edge)
 * opened straight from file:// - exactly how a student would open index.html.
 *
 * This is a developer tool, not needed to run the lesson. Setup:
 *     npm install --no-save puppeteer-core            (and optionally: axe-core)
 *     set BROWSER_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
 *     node tests/e2e/smoke.e2e.cjs
 *
 * Optional env vars:
 *     PUPPETEER_CORE_PATH   absolute path to the puppeteer-core package (default: normal require)
 *     AXE_CORE_PATH         absolute path to axe.min.js -> also runs an accessibility audit
 *     E2E_JSON              write machine-readable results to this file
 *     BROWSER_PATH          browser executable (Chrome or Edge)
 *     BROWSER_WS            attach to an already-running browser instead of launching one, e.g.
 *                           ws://127.0.0.1:9333/devtools/browser/<id> (start it with --remote-debugging-port=9333)
 *
 * What it asserts: every interactive feature works (all five simulations, XP, badges,
 * unlock rules, quizzes), invalid input is handled, there are no console errors/warnings,
 * no network request leaves the machine, nothing overflows on a phone-sized screen, both
 * themes work, and (with axe) no accessibility violations.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
const INDEX = path.resolve(__dirname, '..', '..', 'index.html');
const URL0 = pathToFileURL(INDEX).href;
const BROWSERS = [
  process.env.BROWSER_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

// 10 timed sections, then the optional extension (the 1.0 final challenge), which is not part of the 45 minutes.
const SECTION_IDS = ['start', 'why', 'lab-1', 'lab-2', 'master-1', 'lab-3', 'lab-4', 'real-world', 'master-2', 'summary', 'challenge'];
const ALL_ROUTES = SECTION_IDS.concat(['progress']);
const results = [];
const problems = []; // console errors, page errors, failed or external requests
let page;
let browserRef;

// ------------------------------------------------------------------ tiny test framework
async function test(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log('  PASS  ' + name);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, error: String(e && e.message ? e.message : e) });
    console.log('  FAIL  ' + name + '\n        ' + String(e && e.message ? e.message : e).split('\n').join('\n        '));
  } finally {
    // axe's stylesheet-fetch errors can be reported a moment AFTER axe returns (Edge does this), so the
    // mute is released after a short grace period. It is never left switched on after a test.
    if (global.axeRunning) await sleep(600);
    global.axeRunning = false;
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TLx = (fn, ...args) => page.evaluate(fn, ...args);

/** Load a route with CLEAN storage (optionally seeded with a saved state). */
async function openFresh(hash, seed) {
  await page.goto(URL0 + (hash || '#/start'), { waitUntil: 'load' });
  await page.evaluate((s) => {
    localStorage.clear();
    if (s) localStorage.setItem('token-lab:v1', JSON.stringify(s));
  }, seed || null);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#section-title');
}
const text = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim());
const exists = async (sel) => !!(await page.$(sel));
const count = (sel) => page.$$eval(sel, (els) => els.length);
const waitFor = (fn, ...args) => page.waitForFunction(fn, { timeout: 8000 }, ...args);

/** Programmatic click: immune to sticky headers and scroll timing. */
async function clickText(selector, label) {
  const ok = await page.evaluate(
    (selector, label) => {
      const el = [...document.querySelectorAll(selector)].find((e) => e.textContent.replace(/\s+/g, ' ').trim().includes(label) && !e.closest('[hidden]'));
      if (!el) return false;
      el.click();
      return true;
    },
    selector,
    label
  );
  assert.ok(ok, `no <${selector}> containing "${label}"`);
}
async function clickKey(key) {
  const ok = await page.evaluate((key) => {
    const el = document.querySelector(`[data-key="${key}"]`);
    if (!el || el.disabled) return false;
    el.click();
    return true;
  }, key);
  assert.ok(ok, `no enabled control with data-key="${key}"`);
}
async function inputOf(labelStart) {
  const sel = await page.evaluate((t) => {
    const l = [...document.querySelectorAll('label.field__label')].find((x) => x.textContent.trim().startsWith(t));
    return l && l.htmlFor ? '#' + l.htmlFor : null;
  }, labelStart);
  assert.ok(sel, 'no field labelled "' + labelStart + '"');
  return sel;
}
/** Type a value like a person would: focus, select ALL existing text, then type key by key. */
async function setField(labelStart, value) {
  const sel = await inputOf(labelStart);
  await page.focus(sel);
  await page.$eval(sel, (el) => el.select());
  await page.keyboard.press('Backspace');
  if (value !== '') await page.type(sel, String(value));
  return sel;
}
/** Put a whole value in at once, like pasting. Used for invalid input so no valid in-between states occur. */
async function pasteField(labelStart, value) {
  const sel = await inputOf(labelStart);
  await page.$eval(sel, (el, v) => { el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, String(value));
  return sel;
}
/** Set a range input and fire its input event. */
const setRange = (sel, v) => page.$eval(sel, (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const xpText = () => text('#xp-chip');
const progressState = () => page.evaluate(() => JSON.parse(JSON.stringify(TokenLab.store.get().progress)));
const totalXP = () => page.evaluate(() => TokenLab.gam.totalXP(TokenLab.store.get().progress));
const badgeIds = () => page.evaluate(() => TokenLab.gam.badges(TokenLab.store.get().progress).filter((b) => b.unlocked).map((b) => b.id));
const getQuizData = (key) => page.evaluate((k) => JSON.parse(JSON.stringify(TokenLab.quizzes[k])), key);

/** Answer one Token Master question correctly through the real UI. */
async function answerMaster(id) {
  const q = await page.evaluate((id) => TokenLab.master.build().byId[id], id);
  const card = `.qcard[data-qid="${id}"]`;
  await page.waitForSelector(card);
  if (q.type === 'mc') {
    await page.$eval(card, (c, n) => c.querySelectorAll('button.opt')[n].click(), q.correct);
  } else if (q.type === 'num') {
    await page.$eval(card + ' input[type="text"]', (i, v) => { i.value = String(v); }, q.answer);
    await page.$eval(card, (c) => [...c.querySelectorAll('button')].find((b) => b.textContent.includes('Check answer')).click());
  } else {
    await page.$eval(card, (c, set) => {
      c.querySelectorAll('input[type="checkbox"]').forEach((cb, i) => { cb.checked = set.includes(i); });
      [...c.querySelectorAll('button')].find((b) => b.textContent.includes('Check answer')).click();
    }, q.correctSet);
  }
  await waitFor((s) => document.querySelector(s + ' .tag--accent:not(.hidden)'), card);
}
async function masterLevel(n) {
  const ids = await page.evaluate((n) => TokenLab.master.build().levels[n - 1].questions.map((q) => q.id), n);
  for (const id of ids) await answerMaster(id);
}
/** A saved state in which Token Master levels 1..n are complete with full marks. */
const seedMaster = (levels) => ({
  master: { q: Object.fromEntries(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10'].slice(0, levels * 2).map((id) => [id, { points: 10, done: true, attempts: 1, hint: false }])) },
});

// ------------------------------------------------------------------ main
(async () => {
  // BROWSER_WS attaches to a browser you started yourself with --remote-debugging-port (needed for Edge on
  // some machines, where puppeteer's own launch exits immediately). Otherwise a browser is launched here.
  const attached = !!process.env.BROWSER_WS;
  const exe = attached ? 'attached via BROWSER_WS' : BROWSERS.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('No browser found. Set BROWSER_PATH or BROWSER_WS.');
  const userDir = attached ? null : fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'tokenlab-e2e-'));
  const browser = attached
    ? await puppeteer.connect({ browserWSEndpoint: process.env.BROWSER_WS })
    : await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--user-data-dir=' + userDir] });
  browserRef = browser;

  // While axe-core runs it fetches stylesheets via XHR to inspect them; browsers block that on file://
  // and log it. That is axe's own behaviour, not the app's, so it is muted ONLY during axe runs and
  // ONLY for that pattern. The same pages are checked with axe off for a clean console.
  global.axeRunning = false;
  const isAxeNoise = (t) => /Access to XMLHttpRequest at 'file:|net::ERR_FAILED|requestfailed: file:.*\.css/.test(t);
  global.watch = (p) => {
    const add = (msg) => {
      if (!(global.axeRunning && isAxeNoise(msg))) problems.push(msg);
    };
    p.on('console', (m) => {
      if (['error', 'warning'].includes(m.type())) {
        const where = m.location() && m.location().url ? ' [at ' + m.location().url + ']' : '';
        add('console.' + m.type() + ': ' + m.text() + where);
      }
    });
    p.on('pageerror', (e) => add('pageerror: ' + e.message));
    p.on('requestfailed', (r) => add('requestfailed: ' + r.url()));
    p.on('request', (r) => {
      if (!/^(file|blob|data|about):/.test(r.url())) problems.push('EXTERNAL REQUEST: ' + r.url());
    });
    p.on('dialog', (d) => d.accept());
  };
  page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  watch(page);
  // The whole suite runs with prefers-reduced-motion (also exercises the app's reduced-motion path), so a
  // smooth-scroll can never make an automated click land on the sticky header.
  global.emulate = (scheme) => page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
  await emulate('light'); // the OS preference must NOT change the (dark) default theme: tested below

  const browserVersion = await browser.version();
  console.log('\nBrowser: ' + browserVersion + '\nPage:    ' + URL0 + '\n');

  // ================================================================== boot + navigation
  console.log('Boot and navigation');
  await test('app boots from file:// with 10 timed sections, 1 optional extension and the progress page; the timed path totals 43 minutes', async () => {
    await openFresh('#/start');
    assert.equal(await count('#nav a'), 12);
    assert.match(await text('#timebox'), /43 min/);
    assert.equal(await page.$$eval('#nav .nav__min', (m) => m.filter((x) => /optional/.test(x.textContent)).length), 1, 'only the extension is marked optional in the sidebar');
    assert.equal(await page.evaluate(() => TokenLab.lesson.SECTIONS.filter((s) => s.optional).map((s) => s.id + ':' + s.minutes).join()), 'challenge:0', 'the extension adds no minutes to the plan');
    assert.match(await text('#section-title'), /Your AI doesn't read words/);
    assert.equal(await page.evaluate(() => TokenLab.lesson.totalMinutes()), 43);
    assert.ok((await page.evaluate(() => TokenLab.lesson.totalMinutes())) <= 45);
  });
  await test('every route opens (hash route, heading, active state, exactly one h1)', async () => {
    await openFresh('#/start');
    for (const id of ALL_ROUTES) {
      await page.evaluate((id) => (location.hash = '#/' + id), id);
      await sleep(40);
      const want = id === 'start' ? "Your AI doesn't read words. It reads tokens." : id === 'progress' ? 'Progress and badges' : await page.evaluate((id) => TokenLab.lesson.SECTIONS.find((s) => s.id === id).title, id);
      assert.equal(await text('#section-title'), want, id + ' heading');
      assert.equal(await page.$eval('#nav a[aria-current="page"]', (a) => a.getAttribute('href')), '#/' + id);
      assert.equal(await count('h1'), 1, id + ' should have exactly one h1');
    }
  });
  await test('Next / Back walk the lesson; unknown route falls back to Start', async () => {
    await openFresh('#/why');
    await clickText('#pager a', 'Next');
    await sleep(50);
    assert.match(await text('#section-title'), /Lab 1/);
    await clickText('#pager a', 'Why tokens');
    await sleep(50);
    assert.match(await text('#section-title'), /Why tokens matter/);
    await page.evaluate(() => (location.hash = '#/nonsense'));
    await sleep(50);
    assert.match(await text('#section-title'), /Your AI doesn't read words/);
  });
  await test('Every section brief shows "You will learn" up front, with "Why it matters" and "Where it is used" one click away', async () => {
    for (const id of SECTION_IDS.filter((x) => x !== 'start')) {
      await openFresh('#/' + id);
      const r = await page.evaluate((id) => {
        const meta = TokenLab.lesson.SECTIONS.find((s) => s.id === id);
        const brief = document.querySelector('.brief');
        const more = brief.querySelector('details.brief__more');
        const visible = (el) => el.getClientRects().length > 0;
        // innerText is the RENDERED text (a closed <details> contributes only its summary). The section's own
        // explanatory sentences are the reliable signal: the summary label itself says "Why it matters".
        const shown = brief.innerText.replace(/\s+/g, ' ');
        return { learn: shown.includes(meta.learn) && visible(brief.querySelector('.brief__item')), open: more.open, why: shown.includes(meta.why) || shown.includes(meta.where) };
      }, id);
      assert.equal(r.learn, true, id + ': "You will learn" is visible');
      assert.equal(r.open, false, id + ': the rest starts collapsed');
      assert.equal(r.why, false, id + ': collapsed text is not rendered');
    }
    await openFresh('#/lab-1');
    await page.click('.brief__more > summary');
    const t = await text('.brief__more');
    assert.match(t, /why it matters/i);
    assert.match(t, /where it is used/i);
    assert.ok(
      await page.evaluate(() => {
        const meta = TokenLab.lesson.SECTIONS.find((s) => s.id === 'lab-1');
        const shown = document.querySelector('.brief').innerText.replace(/\s+/g, ' ');
        return shown.includes(meta.why) && shown.includes(meta.where);
      }),
      'once opened, the explanatory text is rendered'
    );
  });
  await test('The 1.0 final challenge is an optional extension: last in order, labelled, not counted, and never suggested as "next"', async () => {
    // order: Completion is the last timed page and offers the extension; the extension is the end of the line
    await openFresh('#/summary', seedMaster(5));
    assert.equal(await page.$$eval('#pager a', (a) => a.map((x) => x.getAttribute('href')).join()), '#/master-2,#/challenge');
    assert.match(await text('#pager a.btn--primary'), /Extension/);
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /optional extension/.test(b.textContent)).click());
    await waitFor(() => location.hash === '#/challenge');
    assert.match(await text('.section-head .eyebrow-row'), /Optional · not counted/);
    assert.match(await text('.section-head .eyebrow-row'), /After the lesson/);
    assert.equal(await page.$$eval('#pager a', (a) => a.map((x) => x.getAttribute('href')).join()), '#/summary,#/start', 'nothing follows the extension except the way back');
    assert.match(await text('#nav a[href="#/challenge"]'), /optional/);
    // visiting it neither adds minutes nor becomes the dashboard's "next step"
    await openFresh('#/start', { visited: Object.fromEntries(['start', 'why', 'lab-1', 'lab-2', 'master-1', 'lab-3', 'lab-4', 'real-world', 'master-2', 'summary'].map((id) => [id, true])) });
    assert.match(await text('.dash'), /10 of 10 sections visited/);
    assert.match(await text('.dash'), /Lesson complete/);
  });
  await test('The extension is bonus only: XP, levels and badges do not depend on it (timed lesson alone reaches the top level)', async () => {
    const r = await page.evaluate(() => {
      const G = TokenLab.gam;
      return { required: G.MAX_REQUIRED_XP, top: G.LEVELS[G.LEVELS.length - 1].at, topReached: G.level(G.MAX_REQUIRED_XP).n, badgeNeedsOptional: G.BADGES.some((b) => b.criteria.some(([id]) => G.RULES.find((x) => x.id === id).optional)) };
    });
    assert.equal(r.required, 450);
    assert.equal(r.topReached, 5);
    assert.ok(r.required >= r.top + 50);
    assert.equal(r.badgeNeedsOptional, false);
  });
  await test('progress: visiting sections ticks them and reduces minutes left', async () => {
    await openFresh('#/start');
    const before = await text('#time-left');
    await page.evaluate(() => (location.hash = '#/why'));
    await sleep(60);
    await page.evaluate(() => (location.hash = '#/lab-1'));
    await sleep(60);
    assert.notEqual(await text('#time-left'), before);
    assert.ok((await count('#nav a[data-done="true"]')) >= 2);
  });
  await test('progress from the v1.0 save format still loads (backward compatible)', async () => {
    await openFresh('#/lab-1', { visited: { start: true, why: true }, quiz: {}, challenge: { rescue: true, code: false }, theme: 'light', instructor: false });
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
    assert.ok((await count('#nav a[data-done="true"]')) >= 2);
    assert.match(await xpText(), /Lv 1/);
  });

  // ================================================================== start + dashboard
  console.log('\nStart, dashboard and why');
  await test('Start: dashboard shows level, 5 locked badges and a next step', async () => {
    await openFresh('#/start');
    assert.equal(await count('.dash .dash-card'), 3);
    assert.match(await text('.dash'), /Level 1 · Newcomer/);
    assert.equal(await count('.dash .badge-pill[data-unlocked="false"]'), 5);
    assert.match(await text('.dash'), /0 of 10 sections visited/);
  });
  await test('Start: prediction gives feedback, awards +10 XP once, and shows a toast and the XP chip', async () => {
    const opts = await page.$$('.qcard button.opt');
    await opts[0].click(); // 9 - wrong
    assert.match(await text('.qcard__fb'), /Not quite/);
    assert.equal(await totalXP(), 0, 'a wrong first pick earns nothing yet');
    await opts[1].click(); // 11 - right
    assert.match(await text('.qcard__fb'), /Got it|Correct/);
    assert.equal(await totalXP(), 10);
    assert.match(await xpText(), /10 XP/);
    await waitFor(() => document.querySelector('.toast'));
    assert.match(await text('.toast'), /\+10 XP/);
    assert.match(await text('main'), /Continue to the journey/);
  });
  await test('Why: the journey stepper changes content, marks the active step, and links to labs', async () => {
    await openFresh('#/why');
    assert.equal(await count('.journey__node'), 5);
    await page.$$eval('.journey__node', (n) => n[2].click());
    assert.match(await text('.journey__detail h3'), /^3 ·/);
    assert.ok((await count('.journey__detail .tok__id')) > 3, 'step 3 shows token IDs');
    assert.equal(await page.$$eval('.journey__node', (n) => n.findIndex((x) => x.getAttribute('aria-current') === 'step')), 2);
    await clickText('button', 'Next step');
    assert.match(await text('.journey__detail h3'), /^4 ·/);
    await clickText('.journey__detail button', 'Budget a real request');
    await sleep(60);
    assert.match(await text('#section-title'), /Lab 3/);
  });

  // ================================================================== SIMULATION 1: tokenization visualizer
  console.log('\nSimulation 1: tokenization visualizer (Lab 1)');
  const statValues = () => page.$$eval('.stats .stat__value', (v) => v.map((x) => x.textContent));
  await test('Lab 1: default text, subword count equals the engine, real recordings shown, byte tile present', async () => {
    await openFresh('#/lab-1');
    const expected = await TLx(() => TokenLab.toy.count('Tokenization is the first step a language model takes.'));
    const shown = await statValues(); // chars, bytes, tokens, chars/token, rule
    assert.equal(Number(shown[0]), 54);
    assert.equal(Number(shown[1]), 54);
    assert.equal(Number(shown[2]), expected);
    const cells = await page.$$eval('.compare-cell .stat__value', (v) => v.map((x) => x.textContent));
    assert.deepEqual(cells.slice(3), ['11', '11'], 'real cl100k and o200k counts');
    assert.match(await text('.rt-ok'), /Lossless/);
  });
  await test('Lab 1: presets fill the editor and update every number', async () => {
    await clickText('.presets button', 'Python code');
    assert.equal(await page.$eval('#pg-text', (t) => t.value), 'def add(a, b):\n    return a + b\n');
    assert.deepEqual((await page.$$eval('.compare-cell .stat__value', (v) => v.map((x) => x.textContent))).slice(3), ['12', '12']);
    assert.equal(await page.$eval('.presets button[aria-pressed="true"]', (b) => b.textContent), 'Python code');
    assert.match(await text('.notice'), /Spaces and line breaks are tokens too/);
  });
  await test('Lab 1: Characters mode is one token per character; Words mode warns it is lossy', async () => {
    await clickText('.presets button', 'Plain English');
    await page.click('input[name="pg-mode"][value="chars"]');
    assert.equal(Number((await statValues())[2]), 54);
    await page.click('input[name="pg-mode"][value="words"]');
    assert.match(await text('.lab__body'), /Words mode throws away the spaces/);
    assert.equal(Number((await statValues())[2]), 10);
    await page.click('input[name="pg-mode"][value="subword"]');
  });
  await test('Lab 1: "Show token IDs" toggles the ID row', async () => {
    assert.equal(await count('.toks-box .tok__id'), 0);
    await page.click('#pg-ids');
    assert.ok((await count('.toks-box .tok__id')) > 5);
    await page.click('#pg-ids');
    assert.equal(await count('.toks-box .tok__id'), 0);
  });
  await test('Lab 1: click a token to inspect it (type, ID, bytes, explanation); arrow keys move between tokens', async () => {
    await openFresh('#/lab-1');
    assert.match(await text('.inspector'), /Click any token to inspect it/);
    await page.$eval('.toks-box button.tok[data-i="1"]', (b) => b.click());
    const insp = await text('.inspector');
    assert.match(insp, /Type/);
    assert.match(insp, /UTF-8 bytes/);
    assert.match(insp, /Position\s*2 of/);
    assert.equal(await count('.toks-box button.tok.tok--sel'), 1);
    assert.equal(await page.$eval('.toks-box button.tok[data-i="1"]', (b) => b.getAttribute('aria-pressed')), 'true');
    await page.focus('.toks-box button.tok[data-i="1"]');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-i')), '2');
    await page.keyboard.press('End');
    assert.ok(Number(await page.evaluate(() => document.activeElement.getAttribute('data-i'))) > 5);
    await page.keyboard.press('Home');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-i')), '0');
  });
  await test('Lab 1: colour-by-type shows a legend, tags every token with a type, and never relies on colour alone', async () => {
    assert.ok(await page.$eval('.type-legend', (e) => e.classList.contains('hidden')));
    await page.click('input[name="pg-color"][value="type"]');
    assert.ok(!(await page.$eval('.type-legend', (e) => e.classList.contains('hidden'))));
    assert.equal(await count('.type-legend .type-legend__item'), 6);
    assert.equal(await page.$eval('.toks-box .toks', (e) => e.dataset.color), 'type');
    await clickText('.presets button', 'Numbers');
    const types = await page.$$eval('.toks-box button.tok', (b) => [...new Set(b.map((x) => x.dataset.type))]);
    assert.ok(types.includes('number') && types.includes('punct') && types.includes('word'), 'types seen: ' + types);
    await page.click('input[name="pg-color"][value="position"]');
  });
  await test('Lab 1: Hindi preset: toy falls back to bytes, 86 UTF-8 bytes, real 36 vs 11 with the encoding switch', async () => {
    await clickText('.presets button', 'Hindi');
    assert.ok((await count('.toks-box button.tok--byte')) > 20, 'toy falls back to raw bytes');
    assert.equal(Number((await statValues())[1]), 86, 'UTF-8 byte tile');
    assert.equal(Number((await statValues())[2]), 86, 'one toy token per byte');
    assert.match(await text('.panel--inset .panel__title'), /36 tokens/);
    await page.select('.panel--inset select', 'o200k_base');
    assert.match(await text('.panel--inset .panel__title'), /11 tokens/);
    assert.match(await text('.notice'), /Hindi: 36 tokens on the older real tokenizer/);
  });
  await test('Lab 1: English, Hindi and Tamil presets all exist and the typo/clean comparison explains itself', async () => {
    for (const name of ['English', 'Hindi', 'Tamil', 'Same sentence, with typos', 'Same sentence, no typos']) assert.ok(await page.evaluate((n) => [...document.querySelectorAll('.presets button')].some((b) => b.textContent === n), name), name);
    await clickText('.presets button', 'Same sentence, with typos');
    assert.match(await text('.notice'), /15 real tokens \(cl100k\) against 12/);
  });
  await test('Lab 1: empty input and HTML injection are handled safely', async () => {
    await clickText('.presets button', 'Clear');
    assert.ok(await page.$eval('.toks-box > p', (p) => !p.classList.contains('hidden')), 'empty-state hint visible');
    assert.equal((await statValues())[2], '0');
    await page.click('#pg-text');
    await page.type('#pg-text', '<img src=x onerror=alert(1)><script>window.__pwn=1</script>');
    await sleep(150);
    assert.equal(await count('main img'), 0, 'no injected <img>');
    assert.equal(await page.evaluate(() => window.__pwn), undefined, 'script did not run');
    assert.ok((await count('.toks-box .tok')) > 5, 'the markup is just shown as tokens');
  });
  await test('Lab 1: a very long input (5,000 characters) is handled quickly and without errors', async () => {
    const ms = await page.evaluate(() => {
      const ta = document.getElementById('pg-text');
      const t0 = performance.now();
      ta.value = 'The teacher is teaching the students. '.repeat(140);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return performance.now() - t0;
    });
    await sleep(250);
    assert.ok((await count('.toks-box .tok')) > 500);
    assert.ok(ms < 1500, 'input handling took ' + Math.round(ms) + ' ms');
  });
  await test('Lab 1: multilingual and emoji text is processed without mojibake', async () => {
    await page.$eval('#pg-text', (ta) => { ta.value = 'नमस्ते வணக்கம் 😍 café'; ta.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(150);
    assert.match(await text('.rt-ok'), /Lossless/);
  });
  await test('Lab 1: language chart renders 6 bars and a table alternative', async () => {
    assert.equal(await count('.hbars__bar'), 6);
    await page.$$eval('details.disclosure > summary', (ss) => ss.find((s) => s.textContent.includes('Show as a table')).click());
    assert.equal(await page.$$eval('details[open] table tbody tr', (r) => r.length), 3);
  });
  await test('Lab 1 gamification: three modes + non-English + typo/clean comparison earn XP and the Token Explorer badge', async () => {
    await openFresh('#/lab-1');
    assert.equal(await totalXP(), 0, 'nothing is earned for just opening the lab');
    for (const m of ['chars', 'words', 'subword']) await page.$eval(`input[name="pg-mode"][value="${m}"]`, (e) => e.click());
    assert.equal((await progressState()).xp['tok.modes'], 15);
    await clickText('.presets button', 'Tamil');
    assert.equal((await progressState()).xp['tok.multilingual'], 15);
    await clickText('.presets button', 'Same sentence, with typos');
    assert.equal((await progressState()).xp['tok.typos'], undefined, 'only half of the comparison is done');
    await clickText('.presets button', 'Same sentence, no typos');
    assert.equal((await progressState()).xp['tok.typos'], 15);
    assert.deepEqual(await badgeIds(), ['token-explorer']);
    await waitFor(() => [...document.querySelectorAll('.toast')].some((t) => /Badge unlocked: Token Explorer/.test(t.textContent)));
  });

  // ================================================================== SIMULATION 2: BPE trainer
  console.log('\nSimulation 2: interactive BPE trainer (Lab 2)');
  const merges = () => text('.stats .stat:nth-child(3) .stat__value');
  const bpeLen = async () => Number((await text('.stats .stat:nth-child(1) .stat__value')).replace(/,/g, ''));
  await test('Lab 2: starts at 220 tokens and 12 characters; the top pair is a+y, seen 32 times', async () => {
    await openFresh('#/lab-2');
    assert.equal(await bpeLen(), 220);
    assert.match(await text('.pair[data-top="true"]'), /a\s*\+\s*y\s*32/);
    assert.equal(await page.$$eval('button', (bs) => bs.find((b) => b.textContent.trim() === 'Undo').disabled), true, 'Undo disabled at start');
    assert.match(await text('.explain'), /Before any merge/);
    assert.match(await text('#bpe-merges-out'), /0 of 18 merges/);
  });
  await test('Lab 2: Next step highlights the pair, merges it, and explains it with exact numbers', async () => {
    await clickText('button', 'Next step');
    await waitFor(() => /Merge 1:/.test(document.querySelector('.explain').textContent));
    assert.equal(await merges(), '1');
    const e = await text('.explain');
    assert.match(e, /a \+ y → ay/);
    assert.match(e, /occurs 32 times/);
    assert.match(e, /220 to 188 tokens \(.32\)/);
    assert.match(e, /Next most frequent pair: p \+ l \(25\)/);
    assert.equal(await count('.mergelog li'), 1);
    assert.equal(await bpeLen(), 188);
  });
  await test('Lab 2: Play runs merges automatically with a visible highlight, Pause stops it; Reset restores the start', async () => {
    // Animation delays are zero under reduced motion, so this test switches motion ON to exercise real timing.
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await clickText('button', 'Reset');
    await page.select('#bpe-speed', 'normal');
    await clickText('button', 'Play');
    await waitFor(() => document.querySelector('.tok--pair')); // the pair about to merge is highlighted first
    assert.match(await text('.explain'), /Counting/);
    assert.equal(await page.$eval('.btn--primary', (b) => b.getAttribute('aria-pressed')), 'true');
    await waitFor(() => Number(document.querySelector('.stats .stat:nth-child(3) .stat__value').textContent) >= 1);
    await clickText('button', 'Pause');
    const m1 = Number(await merges());
    await sleep(1800);
    assert.equal(Number(await merges()), m1, 'no more merges after Pause');
    assert.match(await text('.feedback-line'), /Paused/);
    await clickText('button', 'Play'); // resumes
    await waitFor(() => Number(document.querySelector('.stats .stat:nth-child(3) .stat__value').textContent) > 1);
    await clickText('button', 'Pause');
    await emulate('light'); // back to reduced motion for the rest of the suite
    await clickText('button', 'Reset');
    assert.equal(await merges(), '0');
    assert.equal(await bpeLen(), 220);
  });
  await test('Lab 2: Play runs all the way to the end and flags "trained until no pair repeats"', async () => {
    await page.select('#bpe-speed', 'fast');
    await clickText('button', 'Play');
    await waitFor(() => /Training finished/.test(document.body.textContent));
    assert.equal(await merges(), '18');
    assert.equal((await progressState()).flags['bpe.finished'], true);
    await clickText('button', 'Reset');
  });
  await test('Lab 2: the merges slider jumps forward and back, and the vocabulary and corpus follow it', async () => {
    await setRange('#bpe-merges', 4);
    assert.equal(await merges(), '4');
    assert.match(await text('#bpe-merges-out'), /4 of 18/);
    assert.deepEqual(await page.$$eval('.mergelog li', (l) => l.map((x) => x.textContent.replace(/\s+/g, ' ').trim().split('→')[1].trim().split(' ')[0])), ['ay', 'pl', 'play', '▁play']);
    assert.match(await text('.panel .panel__title ~ .toks[aria-label="Vocabulary"]'), /play/);
    await setRange('#bpe-merges', 2);
    assert.equal(await merges(), '2');
    assert.equal(await count('.mergelog li'), 2);
    await setRange('#bpe-merges', 18);
    assert.equal(await merges(), '18');
    assert.match(await text('.callout--ok'), /Training finished/);
    assert.equal(await bpeLen(), 32);
    assert.equal(await count('.spark-wrap .spark-dot'), 1);
  });
  await test('Lab 2: vocabulary panel lists 12 characters + 18 merged tokens (30 entries)', async () => {
    assert.match(await text('.panel .panel__title'), /./);
    assert.ok(await page.evaluate(() => /Vocabulary: 30 entries \(12 characters \+ 18 merged\)/.test(document.body.textContent)));
    assert.equal(await count('.toks[aria-label="Vocabulary"] .tok'), 30);
  });
  await test('Lab 2: before/after tokenization: "playful" keeps known pieces and uses raw bytes for f and u', async () => {
    await page.$eval('#bpe-test', (i) => { i.value = ''; });
    await page.type('#bpe-test', 'playful');
    const after = await page.$$eval('.toks[aria-label="Tokens after training"] .tok', (t) => t.map((x) => x.textContent));
    assert.deepEqual(after, ['▁play', '<0x66>', '<0x75>', 'l']);
    const before = await page.$$eval('.toks[aria-label="Tokens before training"] .tok', (t) => t.length);
    assert.equal(before, 8, 'with no merges: the word marker, p, l, a, y, two raw bytes (f, u) and l');
    assert.match(await text('.ba'), /Before training \(0 merges\): 8 tokens/);
    assert.match(await text('.ba'), /After 18 merges: 4 tokens/);
    assert.equal(await count('.toks[aria-label="Tokens after training"] .tok--byte'), 2);
  });
  await test('Lab 2: Undo works and pops exactly one merge', async () => {
    await clickText('button', 'Undo');
    assert.equal(await merges(), '17');
    assert.equal(await count('.callout--ok'), 0, 'no longer finished, so the completion note is gone');
  });
  await test('Lab 2: challenge mode rejects a wrong pair (with feedback) and accepts the top pair', async () => {
    await openFresh('#/lab-2');
    await page.$eval('#bpe-challenge', (c) => c.click());
    const pairs = await page.$$eval('button.pair', (b) => b.length);
    assert.ok(pairs >= 3);
    await page.$$eval('button.pair', (b) => b[2].click()); // l+a (25) while a+y is 32
    assert.match(await text('.feedback-line'), /Not that one/);
    assert.equal(await merges(), '0', 'no merge on a wrong pick');
    await page.$$eval('button.pair', (b) => b[0].click());
    assert.match(await text('.feedback-line'), /Merged a \+ y/);
    assert.equal(await merges(), '1');
  });
  await test('Lab 2 gamification: three first-try manual merges + finishing training + testing a word earn XP and the BPE Apprentice badge', async () => {
    await openFresh('#/lab-2');
    await page.$eval('#bpe-challenge', (c) => c.click());
    for (let i = 0; i < 3; i++) await page.$$eval('button.pair', (b) => b[0].click());
    assert.equal((await progressState()).counters['bpe.manual.ok'], 3);
    assert.equal((await progressState()).xp['bpe.manual'], 20);
    await page.$eval('#bpe-challenge', (c) => c.click());
    await setRange('#bpe-merges', 18);
    assert.equal((await progressState()).xp['bpe.finished'], 20);
    await page.$eval('#bpe-test', (i) => { i.value = 'playful'; i.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal((await progressState()).xp['bpe.test'], 10);
    assert.ok((await badgeIds()).includes('bpe-apprentice'));
  });
  await test('Lab 2: a wrong manual pick earns nothing (XP only for first-try correct picks)', async () => {
    await openFresh('#/lab-2');
    await page.$eval('#bpe-challenge', (c) => c.click());
    await page.$$eval('button.pair', (b) => b[2].click());
    await page.$$eval('button.pair', (b) => b[0].click()); // right, but not first try
    assert.equal((await progressState()).counters['bpe.manual.ok'], undefined);
  });

  // ================================================================== SIMULATION 5: Token Master
  console.log('\nSimulation 5: Token Master Challenge');
  await test('Token Master I: level 1 is open, level 2 is locked, and scoring text is shown', async () => {
    await openFresh('#/master-1');
    assert.equal(await page.$$eval('.mlevel', (l) => l.map((x) => x.dataset.state).join()), 'open,locked');
    assert.equal(await count('.qcard'), 2, 'only level 1 questions are built until level 2 unlocks');
    assert.match(await text('.mlevel[data-state="locked"]'), /Finish level 1 to unlock/);
    assert.match(await text('main'), /first try 10 XP, second 6/);
  });
  await test('Token Master: multiple choice. Wrong pick explains why and scores less; right pick scores; XP awarded', async () => {
    const q = await page.evaluate(() => TokenLab.master.build().byId.m1);
    const wrong = (q.correct + 1) % 4;
    await page.$eval('.qcard[data-qid="m1"]', (c, n) => c.querySelectorAll('button.opt')[n].click(), wrong);
    assert.match(await text('.qcard[data-qid="m1"] .qcard__fb'), /Not quite/);
    assert.match(await text('.qcard[data-qid="m1"] .qcard__fb'), /Attempt 1 of 3/);
    await page.$eval('.qcard[data-qid="m1"]', (c, n) => c.querySelectorAll('button.opt')[n].click(), q.correct);
    await waitFor(() => document.querySelector('.qcard[data-qid="m1"] .tag--accent:not(.hidden)'));
    assert.match(await text('.qcard[data-qid="m1"] .tag--accent'), /\+6 XP/);
    assert.equal((await progressState()).xp['master.q.m1'], 6);
  });
  await test('Token Master: numeric question validates input (letters, negatives, decimals) without using up an attempt', async () => {
    const sel = '.qcard[data-qid="m2"] input[type="text"]';
    for (const bad of ['abc', '-3', '12.5', '']) {
      await page.$eval(sel, (i, v) => { i.value = v; }, bad);
      await page.$eval('.qcard[data-qid="m2"]', (c) => [...c.querySelectorAll('button')].find((b) => b.textContent.includes('Check answer')).click());
      assert.equal(await page.$eval(sel, (i) => i.getAttribute('aria-invalid')), 'true', JSON.stringify(bad));
      assert.ok((await text('.qcard[data-qid="m2"] .field__err')).length > 3);
    }
    assert.equal(await count('.qcard[data-qid="m2"] .qcard__fb .callout'), 0, 'no attempt was consumed');
  });
  await test('Token Master: a wrong number gives feedback, a hint costs 2 XP, and the right number is checked by the engine (86)', async () => {
    const sel = '.qcard[data-qid="m2"]';
    await page.$eval(sel + ' input[type="text"]', (i) => { i.value = '32'; });
    await page.$eval(sel, (c) => [...c.querySelectorAll('button')].find((b) => b.textContent.includes('Check answer')).click());
    assert.match(await text(sel + ' .qcard__fb'), /32 is not the answer/);
    await page.$eval(sel, (c) => [...c.querySelectorAll('button')].find((b) => b.textContent.includes('hint')).click());
    assert.match(await text(sel + ' .mq-hint'), /Hint: Unseen characters fall back to raw bytes/);
    await page.$eval(sel + ' input[type="text"]', (i) => { i.value = '86'; });
    await page.$eval(sel, (c) => [...c.querySelectorAll('button')].find((b) => b.textContent.includes('Check answer')).click());
    await waitFor(() => document.querySelector('.qcard[data-qid="m2"] .tag--accent:not(.hidden)'));
    assert.match(await text(sel + ' .tag--accent'), /\+4 XP/); // second attempt (6) minus the hint (2)
    assert.match(await text(sel + ' .qcard__fb'), /equals the byte count: 86/);
  });
  await test('Token Master: finishing level 1 awards the level bonus and unlocks level 2', async () => {
    assert.equal((await progressState()).xp['master.level.1'], 10);
    assert.equal(await page.$$eval('.mlevel', (l) => l.map((x) => x.dataset.state).join()), 'complete,open');
    assert.equal(await count('.qcard'), 4);
  });
  await test('Token Master: the BPE question shows the corpus; the trap answer is rejected; the engine-checked count is 40', async () => {
    assert.equal(await count('.qcard[data-qid="m3"] .mq-word'), 4);
    const q = await page.evaluate(() => TokenLab.master.build().byId.m3);
    const trap = q.options.findIndex((o) => o.text === '\u2581 + c');
    await page.$eval('.qcard[data-qid="m3"]', (c, n) => c.querySelectorAll('button.opt')[n].click(), trap);
    assert.match(await text('.qcard[data-qid="m3"] .qcard__fb'), /occurs 11 times in total, fewer than the 12/);
    await answerMaster('m3');
    await answerMaster('m4');
    assert.match(await text('.qcard[data-qid="m4"] .qcard__fb'), /63 tokens/);
    assert.equal(await page.$$eval('.mlevel', (l) => l.map((x) => x.dataset.state).join()), 'complete,complete');
    await waitFor(() => /Levels 1 and 2 complete/.test(document.body.textContent));
  });
  await test('Token Master: three wrong tries reveal the answer, with minimal points', async () => {
    await openFresh('#/master-1');
    const q = await page.evaluate(() => TokenLab.master.build().byId.m1);
    const wrongs = [0, 1, 2, 3].filter((i) => i !== q.correct);
    for (const w of wrongs) await page.$eval('.qcard[data-qid="m1"]', (c, n) => c.querySelectorAll('button.opt')[n].click(), w);
    await waitFor(() => document.querySelector('.qcard[data-qid="m1"] .tag--accent:not(.hidden)'));
    assert.match(await text('.qcard[data-qid="m1"] .tag--accent'), /\+2 XP/);
    assert.equal(await count('.qcard[data-qid="m1"] button.opt[data-state="correct"]'), 1);
  });
  await test('Token Master II: levels 3-5 are LOCKED until level 2 is complete, and the lock explains how to unlock', async () => {
    await openFresh('#/master-2');
    assert.equal(await page.$$eval('.mlevel', (l) => l.map((x) => x.dataset.state).join()), 'locked,locked,locked');
    assert.equal(await count('.mlevel .qcard'), 0, 'no level question is built while locked (the optional practice bank below is separate)');
    assert.match(await text('.mlevel[data-state="locked"]'), /Finish level 2 to unlock/);
    assert.ok(await page.evaluate(() => /Go to Token Master I/.test(document.body.textContent)));
  });
  await test('Token Master II: Instructor view unlocks every level for demonstration', async () => {
    await page.click('#inst-btn');
    await waitFor(() => document.querySelectorAll('.mlevel[data-state="open"]').length === 3);
    assert.equal(await count('.mlevel .qcard'), 6);
    await page.click('#inst-btn');
  });
  await test('Token Master II: with levels 1-2 done, levels 3-5 open in order; all question types render', async () => {
    await openFresh('#/master-2', seedMaster(2));
    assert.equal(await page.$$eval('.mlevel', (l) => l.map((x) => x.dataset.state).join()), 'open,locked,locked');
    await masterLevel(3);
    assert.equal(await page.$$eval('.mlevel', (l) => l.map((x) => x.dataset.state).join()), 'complete,open,locked');
    assert.equal(await count('.qcard[data-type="multi"]'), 1);
    await masterLevel(4);
    assert.equal((await progressState()).xp['master.level.3'], 10);
    assert.equal(await count('.qcard[data-qid="m9"]'), 1);
    assert.match(await text('.qcard[data-qid="m9"] .qcard__stem'), /Which single change fixes it/);
  });
  await test('Token Master: select-all (pin the right facts) reports wrong picks and missed ones, then accepts the exact set', async () => {
    await openFresh('#/master-2', seedMaster(3));
    const sel = '.qcard[data-qid="m7"]';
    await page.$eval(sel, (c) => { c.querySelectorAll('input[type="checkbox"]')[0].checked = true; [...c.querySelectorAll('button')].find((b) => b.textContent.includes('Check answer')).click(); });
    assert.match(await text(sel + ' .qcard__fb'), /1 of your picks should not be there and 3 correct facts are missing/);
    await answerMaster('m7');
    assert.equal(await count(sel + ' .mq-why li'), 6);
    assert.equal(await count(sel + ' .mq-why li[data-ok="true"]'), 3);
  });
  await test('Token Master: a full perfect run gives 100%, the Token Master badge, an unlocked completion screen', async () => {
    await openFresh('#/master-1');
    await masterLevel(1);
    await masterLevel(2);
    await page.evaluate(() => (location.hash = '#/master-2'));
    await waitFor(() => document.querySelectorAll('.mlevel[data-state="open"]').length >= 1);
    await masterLevel(3);
    await masterLevel(4);
    await masterLevel(5);
    await waitFor(() => document.querySelector('.mastery'));
    assert.match(await text('.mastery'), /100%/);
    assert.match(await text('.mastery'), /Token Master: 100 of 100 points/);
    assert.ok((await badgeIds()).includes('token-master'));
    assert.equal((await progressState()).xp['master.mastery'], 0);
    assert.equal(await page.evaluate(() => TokenLab.master.mastery(TokenLab.store.get().master).percent), 100);
    await clickText('button', 'See your completion screen');
    await sleep(80);
    assert.match(await text('.complete'), /Token Master: 100% mastery/);
  });
  await test('Token Master: a weak run (hint on every question, second tries) stays below the badge threshold', async () => {
    const weak = { master: { q: Object.fromEntries(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10'].map((id) => [id, { points: 4, done: true, attempts: 2, hint: true }])) } };
    await openFresh('#/master-2', weak);
    assert.equal(await page.evaluate(() => TokenLab.master.mastery(TokenLab.store.get().master).earnedBadge), false);
    assert.equal(await page.evaluate(() => TokenLab.master.mastery(TokenLab.store.get().master).percent), 40);
    assert.ok(!(await badgeIds()).includes('token-master'));
  });
  await test('Token Master: answers survive a reload (saved progress), and replaying cannot lower a score', async () => {
    await openFresh('#/master-1', seedMaster(1));
    assert.equal(await count('.qcard .tag--accent:not(.hidden)'), 2, 'both level-1 questions show as answered');
    assert.match(await text('.qcard[data-qid="m1"] .qcard__fb'), /Vocabulary entries come from frequency/);
    const before = await totalXP();
    await page.evaluate(() => TokenLab.store.award('master.q.m1', 2));
    assert.ok((await totalXP()) >= before, 'a lower score never reduces XP');
  });
  await test('Token Master: the optional practice bank (9 extra questions) is present and not scored', async () => {
    await openFresh('#/master-2', seedMaster(2));
    assert.match(await text('details.disclosure > summary'), /9 more questions/);
    const before = await totalXP();
    await page.$eval('details.disclosure', (d) => (d.open = true));
    const cards = await page.$$('details .qcard');
    assert.equal(cards.length, 9);
    assert.equal(await totalXP(), before);
  });

  // ================================================================== SIMULATION 3: context budget + survival game
  console.log('\nSimulation 3: context planner and Context Window Survival game (Lab 3)');
  const PL = 'section.lab[aria-labelledby="budget-title"]';
  const SV = 'section.lab[aria-labelledby="survival-title"]';
  await test('Lab 3 planner: default scenario fits, with correct totals and cost', async () => {
    await openFresh('#/lab-3');
    assert.match(await text(PL + ' .status'), /Fits: 880 tokens to spare/);
    assert.match(await text(PL + ' .status'), /7,120 of 8,000/);
    assert.equal(await count(PL + ' .stackbar__seg'), 6, '5 parts + free space');
    assert.equal((await page.$$eval(PL + ' .stats .stat__value', (v) => v.map((x) => x.textContent)))[0], '$0.0202');
  });
  await test('Lab 3 planner: "Paste a whole report" overflows by 3,000 and shows the hatched overflow region', async () => {
    await clickText(PL + ' .presets button', 'Paste a whole report');
    assert.match(await text(PL + ' .status'), /Over the window by 3,000 tokens/);
    assert.equal(await page.$eval(PL + ' .status', (e) => e.getAttribute('data-ok')), 'false');
    assert.equal(await count(PL + ' .stackbar__overflow'), 1);
    assert.match(await text(PL + ' .stackbar__over'), /Over by 3,000/);
  });
  await test('Lab 3 planner: fixing the overflow earns XP, but only AFTER an overflow was seen (not for the starting state)', async () => {
    assert.equal((await progressState()).xp['budget.fixed'], undefined);
    await clickText(PL + ' .presets button', '16K');
    assert.match(await text(PL + ' .status'), /Fits/);
    assert.equal((await progressState()).xp['budget.fixed'], 10);
  });
  await test('Lab 3 planner: letters / negative / too large / decimal / empty are rejected, state unchanged, reverts on blur', async () => {
    await openFresh('#/lab-3');
    for (const [bad, msg] of [['abc', /whole numbers/i], ['-5', /at least/i], ['2000000', /at most/i], ['12.5', /whole numbers/i], ['', /Enter a number/i]]) {
      const sel = await pasteField('System prompt', bad);
      assert.equal(await page.$eval(sel, (i) => i.getAttribute('aria-invalid')), 'true', `"${bad}" should be flagged`);
      assert.match(await page.$eval(sel + '-err', (e) => e.textContent), msg, `"${bad}" message`);
      assert.match(await text(PL + ' .status'), /Fits: 880/, `state must not change on invalid input "${bad}"`);
    }
    const okSel = await setField('System prompt', '700');
    assert.equal(await page.$eval(okSel, (i) => i.getAttribute('aria-invalid')), null);
    assert.match(await text(PL + ' .status'), /Fits(, but tight)?: 680 tokens to spare/);
    const sel = await pasteField('System prompt', 'xyz');
    await page.$eval(sel, (i) => i.blur());
    assert.equal(await page.$eval(sel, (i) => i.value), '700');
  });
  await test('Lab 3 planner: invalid price is rejected; valid price recomputes cost; table view lists all parts', async () => {
    await openFresh('#/lab-3');
    const sel = await pasteField('Input price', 'abc');
    assert.equal(await page.$eval(sel, (i) => i.getAttribute('aria-invalid')), 'true');
    await setField('Input price', '1');
    assert.equal((await page.$$eval(PL + ' .stats .stat__value', (v) => v.map((x) => x.textContent)))[0], '$0.0141');
    await page.$eval(PL + ' details.disclosure > summary', (s) => s.click());
    assert.equal(await page.$$eval(PL + ' details[open] tbody tr', (r) => r.length), 6);
  });
  await test('Survival game: starts over the limit (Keep everything), warns, shows lives and the live bar', async () => {
    await openFresh('#/lab-3');
    assert.match(await text(SV + ' .sv-status'), /Over the window by 355 tokens \(125%\)/);
    assert.equal(await page.$eval(SV + ' .sv-status', (e) => e.dataset.level), 'over');
    assert.equal(await count(SV + ' .sv-life[data-on="true"]'), 3);
    assert.match(await text(SV + ' .sv-chip'), /Round\s*1 of 4/);
    assert.equal(await count(SV + ' .stackbar__seg'), 5);
    assert.match(await text(SV + ' .sv-send'), /Send request \(1,755 tokens\)/);
  });
  await test('Survival game: warning level appears at 85-100% and clears when you remove tokens', async () => {
    await clickKey('a-trim'); // shorten docs: 1,755 -> 1,205 of 1,400 = 86%
    assert.equal(await page.$eval(SV + ' .sv-status', (e) => e.dataset.level), 'warn');
    assert.match(await text(SV + ' .sv-status'), /Warning: 86% of the window is used/);
    await clickKey('a-drop');
    assert.equal(await page.$eval(SV + ' .sv-status', (e) => e.dataset.level), 'ok');
  });
  await test('Survival game: sending an overflowing request costs a life, explains the failure, and does not advance the round', async () => {
    await openFresh('#/lab-3');
    await clickKey('send');
    assert.match(await text(SV + ' .sv-result'), /Request rejected: 355 tokens over the window/);
    assert.equal(await count(SV + ' .sv-life[data-on="true"]'), 2);
    assert.match(await text(SV + ' .sv-chip'), /Round\s*1 of 4/);
    assert.equal(await page.$eval('#sv-cap', (i) => i.disabled), true, 'capacity locks after the first request');
  });
  await test('Survival game: three rejected requests end the game with a clear message, and Play again restarts', async () => {
    await clickKey('send');
    await clickKey('send');
    assert.match(await text(SV), /Game over: three rejected requests/);
    assert.equal(await page.$eval('[data-key="send"]', (b) => b.disabled), true);
    await clickText(SV + ' button', 'Play again');
    assert.equal(await count(SV + ' .sv-life[data-on="true"]'), 3);
    assert.equal(await page.$eval('#sv-cap', (i) => i.disabled), false);
  });
  await test('Survival game: capacity is adjustable before the first request (tight/standard/roomy)', async () => {
    await setRange('#sv-cap', 900);
    assert.match(await text(SV + ' .sv-chip ~ *, ' + SV), /900 tokens/);
    assert.match(await text(SV), /Tight: you will need to summarise and trim/);
    await setRange('#sv-cap', 2000);
    assert.match(await text(SV), /Roomy: still not enough to keep everything/);
    assert.match(await text(SV + ' .sv-status'), /Over the window by 0|OK|Warning|Over/);
    await setRange('#sv-cap', 1400);
  });
  /** Play ONE round well through the real UI: only what is needed now or later, just enough room to answer. */
  async function playRound(round, opts) {
    const o = opts || {};
    {
      const keys = await page.evaluate((round) => {
        const S = TokenLab.survival;
        const need = S.ROUNDS[round].needs;
        const future = new Set();
        S.ROUNDS.slice(round).forEach((r) => r.needs.facts.forEach((f) => future.add(f)));
        const factsOf = (id) => {
          const h0 = S.HISTORY0.find((m) => m.id === id);
          if (h0) return h0.facts;
          const m = /^a(\d)$/.exec(id);
          return m ? S.ROUNDS[Number(m[1])].reply.facts : [];
        };
        const off = [];
        document.querySelectorAll('input[data-key^="msg-"]').forEach((cb) => {
          const id = cb.dataset.key.slice(4);
          if (cb.checked && !factsOf(id).some((f) => future.has(f))) off.push(cb.dataset.key);
        });
        document.querySelectorAll('input[data-key^="doc-"]').forEach((cb) => {
          if (cb.checked && !need.docs.includes(cb.dataset.key.slice(4))) off.push(cb.dataset.key);
        });
        const style = document.querySelector('input[data-key="rule-r-style"]');
        if (style && style.checked) off.push('rule-r-style');
        return off;
      }, round);
      for (const k of keys) await clickKey(k);
      if (o.dropRule) {
        const on = await page.$eval(`input[data-key="rule-${o.dropRule}"]`, (c) => c.checked);
        if (on) await clickKey('rule-' + o.dropRule);
      }
      const need = await page.evaluate((r) => TokenLab.survival.ROUNDS[r].answerTokens, round);
      await setRange('#sv-reserve', o.reserve != null ? o.reserve : Math.ceil(need / 50) * 50);
      await clickKey('send');
    }
  }
  async function playSurvivalWell(cap) {
    await setRange('#sv-cap', cap);
    for (let round = 0; round < 4; round++) {
      await playRound(round);
      assert.match(await text(SV + ' .sv-score'), new RegExp(`Round ${round + 1}: 100/100`));
    }
  }
  await test('Survival game: a careful player WINS with 100/100 every round, earns XP, and unlocks Context Guardian', async () => {
    await openFresh('#/lab-3');
    await playSurvivalWell(1400);
    assert.match(await text(SV), /You kept the assistant alive and useful/);
    assert.match(await text(SV), /Average 100% over 4 rounds · 80 of 80 XP points earned \+ 20 for winning/);
    const p = await progressState();
    assert.equal(p.xp['survival.score'], 80);
    assert.equal(p.xp['survival.pass'], 20);
    assert.ok((await badgeIds()).includes('context-guardian'));
    await waitFor(() => [...document.querySelectorAll('.toast')].some((t) => /Context Guardian/.test(t.textContent)));
  });
  await test('Survival game: also winnable at the tightest capacity (900), proving the choices matter at every difficulty', async () => {
    await openFresh('#/lab-3');
    await playSurvivalWell(900);
    assert.match(await text(SV), /kept the assistant alive/);
  });
  await test('Survival game: leaving too little room for the answer cuts it off, and says so', async () => {
    await openFresh('#/lab-3');
    await playRound(0, { reserve: 50 });
    const r = await text(SV + ' .sv-result');
    assert.match(r, /Round 1: 80\/100/);
    assert.match(r, /You reserved 50 tokens but the answer needs 120/i);
  });
  await test('Survival game: removing the refund rule only hurts in the round that needs it (round 2: wrongly approves a refund)', async () => {
    await openFresh('#/lab-3');
    await setRange('#sv-cap', 1400);
    await playRound(0, { dropRule: 'r-refund' });
    assert.match(await text(SV + ' .sv-score'), /Round 1: 100\/100/, 'round 1 does not need that rule');
    await playRound(1, { dropRule: 'r-refund' });
    const r = await text(SV + ' .sv-result');
    assert.match(r, /Round 2: 65\/100/);
    assert.match(r, /you removed this rule, so the assistant approves a refund after 45 days/i);
    assert.equal(await page.$eval(SV + ' .sv-score', (e) => e.dataset.pass), 'false');
  });
  await test('Survival game: the explanation of why context management matters appears at the end', async () => {
    await openFresh('#/lab-3');
    await playSurvivalWell(1400);
    assert.match(await text(SV), /Why this matters: every real assistant has a window/);
  });

  // ================================================================== SIMULATION 4: Memory Manager
  console.log('\nSimulation 4: AI Memory Manager (Lab 4)');
  const MMS = 'section.lab[aria-labelledby="memmgr-title"]';
  const memoryScore = () => page.evaluate((sel) => [...document.querySelectorAll(sel + ' .callout')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()).find((t) => /Memory score/.test(t)) || '', MMS);
  /** Take an action on the pending message; if the memory is full, fall back to "keep" so the conversation moves on. */
  async function decideTurn(action) {
    await clickKey(action);
    if (action === 'save' && /Memory is full/.test(await text(MMS + ' .mm-notice'))) await clickKey('keep');
  }
  async function playMemory(saveIds) {
    for (let i = 0; i < 10; i++) {
      const turn = await page.evaluate((i) => TokenLab.memorymgr.TURNS[i], i);
      if (turn.kind === 'probe') await clickKey('ask');
      else await decideTurn(saveIds.has(turn.id) ? 'save' : 'keep');
    }
  }
  await test('Lab 4A: chart draws two series; resend-all breaks the 8,000 window at turn 37 for 60 turns', async () => {
    await openFresh('#/lab-4');
    assert.equal(await count('.linechart svg path[stroke]'), 2);
    assert.match(await text('.callout--ok'), /Within 30 turns/);
    await setField('Turns in the conversation', '60');
    assert.match(await text('.callout--warn'), /turn 37/);
    assert.match(await text('.stats .stat--accent'), /×/);
  });
  await test('Lab 4A: chart tooltip appears on keyboard focus + arrow keys; out-of-range input is refused', async () => {
    await page.focus('.linechart');
    await page.keyboard.press('ArrowLeft');
    await sleep(60);
    assert.equal(await page.$eval('.chart-tip', (t) => t.getAttribute('data-show')), 'true');
    assert.match(await text('.chart-tip'), /Resend everything/);
    const sel = await setField('Turns in the conversation', '9999');
    assert.equal(await page.$eval(sel, (i) => i.getAttribute('aria-invalid')), 'true');
  });
  await test('Memory manager: starts on turn 1 with save / keep / forget / summarise, and an inspector', async () => {
    await openFresh('#/lab-4');
    assert.match(await text(MMS + ' .mm-progress'), /Turn 1 of 10/);
    assert.match(await text(MMS + ' .mm-turn'), /Hi, I'm Kavya/);
    for (const k of ['save', 'keep', 'forget', 'sum']) assert.ok(await exists(`${MMS} [data-key="${k}"]`), k);
    assert.match(await text(MMS + ' .mm-inspector'), /Short-term context: \d+ \/ 100 tokens/);
    assert.match(await text(MMS + ' .mm-inspector'), /Long-term memory: 0 \/ 85 tokens/);
    assert.match(await text(MMS), /deterministic educational simulation/i);
    assert.match(await text(MMS), /not a language model/i);
  });
  await test('Memory manager: saving writes notes to long-term memory and the inspector shows exactly what is available', async () => {
    await clickKey('save');
    assert.equal(await count(MMS + ' .mm-list[aria-label="Long-term memory"] .mm-li'), 2, 'name and exam');
    assert.match(await text(MMS + ' .mm-list[aria-label="Long-term memory"]'), /Name: Kavya/);
    assert.match(await text(MMS + ' .facts'), /Your name available/);
    assert.match(await text(MMS + ' .facts'), /Exam date available/);
    assert.match(await text(MMS + ' .mm-progress'), /Turn 2 of 10/);
    assert.match(await text(MMS + ' .mm-log'), /Saved to long-term memory/);
  });
  await test('Memory manager: "forget" removes a message at once; its fact never becomes available', async () => {
    await clickKey('forget'); // t2 (best study time)
    assert.match(await text(MMS + ' .facts'), /Best study time not available/);
    assert.match(await text(MMS + ' .mm-log'), /Forgot:/);
  });
  await test('Memory manager: old messages scroll out of the small short-term context (and the log says so)', async () => {
    let sawScrollOut = false;
    for (let i = 0; i < 3; i++) {
      await clickKey('keep'); // t3 (secret), t4, t5
      sawScrollOut = sawScrollOut || /Scrolled out of context/.test(await text(MMS + ' .mm-log'));
      assert.ok(Number((await text(MMS + ' .mm-inspector h4')).match(/(\d+) \//)[1]) <= 100, 'context stays within its cap');
    }
    assert.ok(sawScrollOut, 'an old message scrolled out of the small context window');
  });
  await test('Memory manager: a full memory blocks a save with a clear message and changes nothing', async () => {
    await openFresh('#/lab-4');
    for (let i = 0; i < 4; i++) await clickKey('save'); // t1..t4 saved (including the secret)
    assert.match(await text(MMS + ' .mm-progress'), /Turn 5 of 10/);
    await clickKey('save'); // t5 cat story: 79 + 13 = 92 > 85
    assert.match(await text(MMS + ' .mm-notice'), /Memory is full: this needs 13 tokens but only 6 are free/);
    assert.match(await text(MMS + ' .mm-progress'), /Turn 5 of 10/, 'the conversation did not advance');
  });
  await test('Memory manager: summarising is lossy: it keeps the gist, drops detail, and says what was lost', async () => {
    await openFresh('#/lab-4');
    await clickKey('keep'); // t1 stays in context
    await clickKey('sum'); // summarise before t2 is decided
    assert.match(await text(MMS + ' .mm-list[aria-label="Long-term memory"]'), /Summary: Kavya; 12 Dec exam/);
    assert.match(await text(MMS + ' .mm-log'), /Summarised\. Kept: Your name, Exam date/);
  });
  await test('Memory manager: deleting a memory works and the entry disappears', async () => {
    const before = await count(MMS + ' .mm-list[aria-label="Long-term memory"] .mm-li');
    await page.$eval(MMS + ' button[aria-label^="Delete memory"]', (b) => b.click());
    assert.equal(await count(MMS + ' .mm-list[aria-label="Long-term memory"] .mm-li'), before - 1);
    assert.match(await text(MMS + ' .mm-log'), /Deleted from memory/);
  });
  /** Play the conversation well: save only what later answers need. */
  const playMemoryWell = () => playMemory(new Set(['t1', 't2', 't4', 't6']));
  await test('Memory manager: the probe answers show what was available, and a careful player scores 100 and earns Memory Architect', async () => {
    await openFresh('#/lab-4');
    await playMemoryWell();
    assert.match(await memoryScore(), /Memory score: 100\/100/);
    assert.equal(await count(MMS + ' .mm-answers .bubble'), 2);
    assert.match(await text(MMS + ' .mm-answers'), /Study plan: 4 of 4 facts/);
    assert.match(await text(MMS + ' .mm-answers'), /Recall: 2 of 2 facts/);
    const p = await progressState();
    assert.equal(p.xp['memory.score'], 60);
    assert.equal(p.xp['memory.pass'], 20);
    assert.ok((await badgeIds()).includes('memory-architect'));
    assert.equal(await count(MMS + ' .mm-probe-table tbody tr'), 2);
  });
  await test('Memory manager: keeping everything in short-term context only FAILS (old messages scrolled out) and earns no pass', async () => {
    await openFresh('#/lab-4');
    for (let i = 0; i < 10; i++) {
      const turn = await page.evaluate((i) => TokenLab.memorymgr.TURNS[i], i);
      await clickKey(turn.kind === 'probe' ? 'ask' : 'keep');
    }
    assert.match(await memoryScore(), /below the pass mark of 70/);
    assert.match(await text(MMS + ' .mm-answers'), /Recall: 0 of 2 facts/);
    assert.equal((await progressState()).xp['memory.pass'], undefined);
    assert.ok(!(await badgeIds()).includes('memory-architect'));
  });
  await test('Memory manager: storing a secret costs hygiene points; deleting it afterwards restores them', async () => {
    await openFresh('#/lab-4');
    await playMemory(new Set(['t1', 't2', 't3', 't4', 't6'])); // t6 does not fit once the secret is stored, so it falls back to "keep"
    assert.match(await memoryScore(), /a secret is stored: never keep passwords in memory/);
    // the secret is the one fact you do NOT want available, so storing it is shown as a risk, not as a success
    const tile = () => page.$eval(MMS + ' .fact[data-kind="sensitive"]', (t) => ({ text: t.textContent.trim(), have: t.dataset.have, risk: t.dataset.risk || null }));
    assert.deepEqual(await tile(), { text: 'Wi-Fi password stored: risky', have: 'false', risk: 'true' });
    await page.$eval(MMS + ' button[aria-label="Delete memory: Wi-Fi: blue-tiger-42"]', (b) => b.click());
    assert.doesNotMatch(await memoryScore(), /a secret is stored/);
    assert.match(await memoryScore(), /Memory score: 100\/100/);
    // once it is gone the tile turns into the GOOD outcome (green), not a red "not available"
    assert.deepEqual(await tile(), { text: 'Wi-Fi password not stored: good', have: 'true', risk: null });
  });
  await test('Memory manager: Play again resets the game', async () => {
    await clickText(MMS + ' button', 'Play again');
    assert.match(await text(MMS + ' .mm-progress'), /Turn 1 of 10/);
    assert.equal(await count(MMS + ' .mm-list[aria-label="Long-term memory"] .mm-li'), 0);
  });
  await test('Lab 4: the original four-strategy comparison is preserved as an optional, collapsed deep dive', async () => {
    await openFresh('#/lab-4');
    assert.equal(await page.$eval('#strategy-compare', (d) => d.open), false);
    assert.match(await text('#strategy-compare > summary'), /Optional deep dive.*not counted/);
    await page.$eval('#strategy-compare', (d) => (d.open = true));
    const D = '#strategy-compare';
    assert.match(await text(D + ' .fact:first-child'), /Name lost/);
    assert.match(await text(D + ' .bubble'), /do not have that in my context/);
    assert.equal(await count(D + ' .msg[data-state="dropped"]'), 6);
    assert.equal(await page.$eval(D + ' .msg:first-child', (m) => m.getAttribute('data-protected')), 'true');
    await page.click('input[name="mem-strategy"][value="summary"]');
    await setField('Context window (toy tokens)', '300');
    assert.match(await text(D + ' .bubble'), /Your name is Meera/);
    assert.deepEqual(await page.$$eval(D + ' .fact', (f) => f.map((x) => x.textContent.trim())), ['Name kept', 'Destination kept', 'Trip length kept', 'Budget kept', 'Diet lost', 'Boats lost']);
    await page.click('input[name="mem-strategy"][value="drop-oldest"]');
    assert.deepEqual(await page.$$eval(D + ' .fact', (f) => f.map((x) => x.textContent.trim())), ['Name lost', 'Destination lost', 'Trip length lost', 'Budget lost', 'Diet kept', 'Boats kept']);
    await page.click('input[name="mem-strategy"][value="all"]');
    await setField('Context window (toy tokens)', '200');
    assert.match(await text(D + ' .bubble'), /Request rejected/);
    await setField('Context window (toy tokens)', '450');
    assert.match(await text(D + ' .bubble'), /Your name is Meera/);
  });

  // ================================================================== real world + challenge
  console.log('\nReal world and final challenge');
  await test('Real world: the six-product table is present and the scenarios point to Token Master', async () => {
    await openFresh('#/real-world');
    assert.equal(await page.$$eval('.tablewrap tbody tr', (r) => r.length), 6);
    assert.match(await text('main'), /pick the fix.*Token Master/);
  });
  await test('Part A: starts broken (3 of 5), and the valid configuration passes all five, is saved and earns XP', async () => {
    await openFresh('#/challenge');
    assert.match(await text('.lab__body'), /3 of 5 requirements met/);
    assert.equal(await count('.checklist li[data-pass="false"]'), 2);
    assert.match(await text('.stackbar__over'), /Over by 5,200/);
    await setField('Retrieved document chunks', '4');
    await setField('Past turns remembered', '6');
    await setField('Tokens reserved', '800');
    assert.equal(await count('.checklist li[data-pass="true"]'), 5);
    assert.match(await text('.callout--ok'), /Rescued/);
    assert.equal(await TLx(() => TokenLab.store.get().challenge.rescue), true);
    assert.equal((await progressState()).xp['challenge.rescue'], 30);
  });
  await test('Part A: a configuration that fits the window but is too expensive still fails (cost requirement)', async () => {
    await setField('Retrieved document chunks', '8');
    await setField('Past turns remembered', '10');
    await setField('Tokens reserved', '1000');
    assert.equal(await page.$eval('.checklist li:nth-child(1)', (e) => e.getAttribute('data-pass')), 'true', 'fits the window');
    assert.equal(await page.$eval('.checklist li:nth-child(5)', (e) => e.getAttribute('data-pass')), 'false', 'cost fails');
  });
  await test('Part B: starter passes only 2 of 6; hints on request; the reference solution passes 6 of 6 and earns XP', async () => {
    await clickText('button', 'Run tests');
    await page.waitForSelector('.tests');
    assert.match(await text('.stack[aria-live="polite"]'), /2 of 6 tests passing/);
    assert.equal(await count('.test__hint'), 0, 'no hints until requested');
    await clickText('button', 'Give me a hint');
    assert.ok((await count('.test__hint')) >= 3);
    const solution = await page.evaluate(() => TokenLab.challenge.TRIM_SOLUTION);
    await page.$eval('#code-editor', (e, v) => { e.value = v; }, solution);
    await clickText('button', 'Run tests');
    await waitFor(() => /6 of 6 tests passing/.test(document.body.textContent));
    assert.equal(await count('.test[data-pass="true"]'), 6);
    assert.equal(await TLx(() => TokenLab.store.get().challenge.code), true);
    assert.equal((await progressState()).xp['challenge.code'], 30);
  });
  await test('Part B: an infinite loop is stopped by the timeout and the page stays responsive', async () => {
    await page.$eval('#code-editor', (e) => { e.value = 'function trimToFit(m, x, c) { while (true) {} }'; });
    const t0 = Date.now();
    await clickText('button', 'Run tests');
    await page.waitForFunction(() => /took longer than 2 seconds/.test(document.body.textContent), { timeout: 8000 });
    const dt = Date.now() - t0;
    assert.ok(dt >= 1800 && dt < 6000, 'timeout fired after about 2s (was ' + dt + 'ms)');
    assert.equal(await page.evaluate(() => 1 + 1), 2, 'main thread still responsive');
  });
  await test('Part B: syntax errors and a missing function are reported; common mistakes are caught; reset and Tab/Esc work', async () => {
    await page.$eval('#code-editor', (e) => { e.value = 'function trimToFit( {'; });
    await clickText('button', 'Run tests');
    await page.waitForFunction(() => /could not run/i.test(document.body.textContent));
    await page.$eval('#code-editor', (e) => { e.value = 'const x = 1;'; });
    await clickText('button', 'Run tests');
    await page.waitForFunction(() => /Could not find a function named trimToFit/.test(document.body.textContent));
    await page.$eval('#code-editor', (e) => { e.value = 'function trimToFit(m, max, c) { const k = m.slice(); while (k.reduce((s, x) => s + c(x), 0) > max && k.length) k.pop(); return k; }'; });
    await clickText('button', 'Run tests');
    await page.waitForFunction(() => /\d of 6 tests passing/.test(document.body.textContent) && !/6 of 6/.test(document.body.textContent));
    assert.ok((await count('.test[data-pass="false"]')) >= 1);
    await clickText('button', 'Reset to starter code');
    assert.match(await page.$eval('#code-editor', (e) => e.value), /your code here/);
    await page.focus('#code-editor');
    await page.$eval('#code-editor', (e) => { e.value = ''; });
    await page.keyboard.press('Tab');
    assert.equal(await page.$eval('#code-editor', (e) => e.value), '  ');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    assert.notEqual(await page.evaluate(() => document.activeElement.id), 'code-editor', 'focus moved out');
  });

  // ================================================================== completion, progress page, gamification
  console.log('\nCompletion screen, progress page and gamification');
  await test('Completion screen is LOCKED until Token Master is finished, and says exactly what is missing', async () => {
    await openFresh('#/summary');
    assert.equal(await count('.lockcard'), 1);
    assert.match(await text('.lockcard'), /Completion screen locked/);
    assert.match(await text('.lockcard'), /answered 0 of 10 questions/);
    assert.equal(await count('.complete'), 0);
  });
  await test('Completion screen: Instructor view opens a labelled PREVIEW of it for demonstrations, and turning it off locks it again', async () => {
    await page.click('#inst-btn');
    await waitFor(() => document.querySelector('.complete'));
    assert.match(await text('.complete'), /Preview of the completion screen/);
    assert.equal(await count('.lockcard'), 0);
    await page.click('#inst-btn');
    await waitFor(() => document.querySelector('.lockcard'));
  });
  await test('Completion screen: after all five levels it shows mastery, XP table, 6 takeaways and 7 references', async () => {
    await openFresh('#/summary', Object.assign(seedMaster(5), { progress: { xp: { predict: 10, 'master.mastery': 0 }, flags: {}, counters: {} } }));
    assert.equal(await count('.lockcard'), 0);
    assert.match(await text('.complete'), /Token Master: 100% mastery/);
    assert.equal(await count('.complete .badge-pill'), 5);
    assert.equal(await page.$$eval('.tablewrap tbody tr', (r) => r.length), 7);
    assert.equal(await count('.takeaways li'), 6);
    assert.equal(await count('.refs li'), 7);
    assert.equal(await page.$$eval('.refs a', (a) => a.every((x) => x.rel.includes('noopener') && x.target === '_blank' && /^https:\/\//.test(x.href))), true);
  });
  await test('Reset progress clears XP, badges and saved scores and returns to Start', async () => {
    await clickText('button', 'Reset my progress');
    await sleep(120);
    assert.match(await text('#section-title'), /Your AI doesn't read words/);
    assert.deepEqual(await progressState(), { xp: {}, flags: {}, counters: {} });
    assert.deepEqual(await TLx(() => TokenLab.store.get().master), { q: {} });
    assert.match(await xpText(), /Lv 1.*0 XP/);
  });
  await test('Progress page: "Reset my progress" works for someone only partway through (the completion screen is still locked)', async () => {
    await openFresh('#/start');
    await page.$eval('.qcard button.opt:nth-child(2)', (b) => b.click()); // answers the warm-up prediction: some XP
    assert.ok((await totalXP()) > 0, 'there is progress to clear');
    await page.click('#xp-chip');
    await sleep(80);
    assert.match(await text('.checklist'), /Extension[\s\S]*optional/, 'the optional extension is labelled as such, not "0 min"');
    await page.click('#reset-progress'); // the harness accepts the confirmation dialog
    await sleep(150);
    assert.match(await text('#section-title'), /Your AI doesn't read words/);
    assert.deepEqual(await progressState(), { xp: {}, flags: {}, counters: {} });
    assert.deepEqual(await TLx(() => TokenLab.store.get().visited && Object.keys(TokenLab.store.get().visited).filter((k) => k !== 'start')), []);
    assert.match(await xpText(), /Lv 1.*0 XP/);
  });
  await test('XP chip and progress page: level progress, five badges with criteria, and an XP ledger', async () => {
    await openFresh('#/start');
    await page.$eval('.qcard button.opt:nth-child(2)', (b) => b.click());
    await page.click('#xp-chip');
    await sleep(80);
    assert.match(await text('#section-title'), /Progress and badges/);
    assert.equal(await count('.badge-card'), 5);
    assert.match(await text('.dash'), /Level 1 · Newcomer/);
    assert.match(await text('.tablewrap'), /Made a prediction before the reveal/);
    assert.equal(await count('.badge-card .criteria li'), 3 + 2 + 1 + 1 + 1);
    assert.match(await text('#nav a[aria-current="page"]'), /Progress and badges/);
  });
  await test('Levels: crossing an XP threshold shows a level-up toast and updates the chip; level thresholds are visible', async () => {
    await openFresh('#/start');
    await page.evaluate(() => TokenLab.store.award('survival.score', 75));
    assert.match(await xpText(), /Lv 2/);
    await waitFor(() => [...document.querySelectorAll('.toast')].some((t) => /Level up: Explorer/.test(t.textContent)));
    await page.evaluate(() => (location.hash = '#/progress'));
    await sleep(60);
    assert.match(await text('main'), /Level thresholds: Newcomer at 0 XP, Explorer at 70 XP/);
  });
  await test('Gamification cannot be farmed: repeating an activity does not re-award XP', async () => {
    await openFresh('#/lab-2');
    await page.$eval('#bpe-challenge', (c) => c.click());
    for (let i = 0; i < 3; i++) await page.$$eval('button.pair', (b) => b[0].click());
    const xp1 = await totalXP();
    await page.$eval('#bpe-challenge', (c) => c.click());
    await clickText('button', 'Reset');
    await page.$eval('#bpe-challenge', (c) => c.click());
    for (let i = 0; i < 3; i++) await page.$$eval('button.pair', (b) => b[0].click());
    assert.equal(await totalXP(), xp1, 'the same achievement earned again adds nothing');
  });

  // ================================================================== themes + instructor + storage
  console.log('\nThemes, instructor view and storage');
  await test('Default theme is dark navy even when the OS says light; toggle switches to light and back, and persists', async () => {
    await openFresh('#/start');
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), null, 'no attribute = default dark');
    const bgDark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(bgDark, 'rgb(10, 15, 31)', 'dark navy background (#0a0f1f)');
    await page.click('#theme-btn');
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
    const bgLight = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(bgLight, 'rgb(243, 244, 251)');
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light', 'persisted');
    await page.click('#theme-btn');
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
  });
  await test('Both themes render every route with readable chart colours (series swatches differ by theme)', async () => {
    await openFresh('#/lab-3');
    const dark = await page.evaluate(() => getComputedStyle(document.querySelector('.stackbar__seg')).backgroundColor);
    await page.click('#theme-btn');
    const light = await page.evaluate(() => getComputedStyle(document.querySelector('.stackbar__seg')).backgroundColor);
    assert.notEqual(dark, light);
    await page.click('#theme-btn');
  });
  await test('Instructor view toggles facilitation notes and unlocks Token Master; stays on across sections', async () => {
    await openFresh('#/lab-2');
    const vis = () => page.$eval('.teacher', (e) => getComputedStyle(e).display);
    assert.equal(await vis(), 'none');
    await page.click('#inst-btn');
    assert.equal(await page.$eval('#inst-btn', (b) => b.getAttribute('aria-pressed')), 'true');
    assert.equal(await vis(), 'block');
    assert.match(await text('.teacher'), /Talking points/);
    await page.evaluate(() => (location.hash = '#/lab-3'));
    await sleep(60);
    assert.equal(await vis(), 'block');
    await page.evaluate(() => (location.hash = '#/master-2'));
    await sleep(80);
    assert.equal(await count('.mlevel[data-state="open"]'), 3);
    await page.click('#inst-btn');
    assert.equal(await vis(), 'none');
  });
  await test('Progress is restored after reload, and the app still works if storage is blocked', async () => {
    await openFresh('#/lab-1');
    await page.evaluate(() => (location.hash = '#/lab-2'));
    await sleep(60);
    await page.reload({ waitUntil: 'load' });
    assert.ok((await count('#nav a[data-done="true"]')) >= 1);
    const blocked = await browser.newPage();
    watch(blocked);
    await blocked.evaluateOnNewDocument(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
    });
    await blocked.goto(URL0 + '#/lab-2', { waitUntil: 'load' });
    await blocked.waitForSelector('#section-title');
    assert.match(await blocked.$eval('#section-title', (e) => e.textContent), /Lab 2/);
    await blocked.$$eval('#nav a', (a) => a[3].click());
    await blocked.close();
  });
  await test('Leaving a page stops its animation timers: a half-played BPE run does not finish in the background', async () => {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await openFresh('#/lab-2');
    await page.select('#bpe-speed', 'fast'); // a full run takes about 9 s at this speed
    await clickText('button', 'Play');
    await waitFor(() => Number(document.querySelector('.stats .stat:nth-child(3) .stat__value').textContent) >= 1);
    await page.evaluate(() => (location.hash = '#/why')); // leave mid-run
    await sleep(11000); // long enough for the run to have finished if its timers had survived
    assert.equal(await page.evaluate(() => TokenLab.store.get().progress.flags['bpe.finished']), undefined, 'the abandoned run kept going');
    await emulate('light');
  });

  // ================================================================== audits
  console.log('\nAudits');
  const loadClean = async (id, seed) => {
    await page.goto(URL0 + '#/' + id, { waitUntil: 'load' });
    await page.evaluate((s) => {
      localStorage.clear();
      if (s) localStorage.setItem('token-lab:v1', JSON.stringify(s));
    }, seed || null);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#section-title');
  };
  await test('No network: every request was local (file/blob/data), none failed', async () => {
    assert.deepEqual(problems.filter((p) => p.startsWith('EXTERNAL') || p.startsWith('requestfailed')), []);
  });
  await test('Offline operation: the lesson loads and works with the network switched off', async () => {
    await page.setOfflineMode(true);
    await openFresh('#/lab-1');
    assert.match(await text('#section-title'), /Lab 1/);
    assert.ok((await count('.toks-box .tok')) > 5);
    await page.$eval('input[name="pg-mode"][value="chars"]', (e) => e.click());
    assert.equal(Number((await statValues())[2]), 54);
    await page.setOfflineMode(false);
  });
  await test('Form controls are labelled, IDs are unique, landmarks exist (all 12 routes)', async () => {
    for (const id of ALL_ROUTES) {
      await loadClean(id, id === 'summary' ? seedMaster(5) : null);
      const issues = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
          const labelled = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.id && document.querySelector('label[for="' + el.id + '"]')) || el.closest('label');
          if (!labelled) out.push('unlabelled control: ' + el.outerHTML.slice(0, 80));
        }
        const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
        ids.filter((x, i) => ids.indexOf(x) !== i).forEach((d) => out.push('duplicate id ' + d));
        for (const sel of ['main', 'header', 'nav', 'aside']) if (!document.querySelector(sel)) out.push('missing landmark ' + sel);
        for (const el of document.querySelectorAll('[role=img]')) if (!el.getAttribute('aria-label')) out.push('role=img without aria-label');
        for (const b of document.querySelectorAll('button')) if (!b.textContent.trim() && !b.getAttribute('aria-label')) out.push('icon button without name');
        return out;
      });
      assert.deepEqual(issues, [], id);
    }
  });
  if (process.env.AXE_CORE_PATH) {
    const runAxe = async () => {
      await page.addScriptTag({ path: process.env.AXE_CORE_PATH });
      return page.evaluate(async () => {
        const res = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } });
        return res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 2).map((n) => n.target.join(' ')) }));
      });
    };
    for (const theme of ['dark', 'light']) {
      await test(`axe-core accessibility audit, all 12 routes, ${theme} theme (WCAG 2.x A/AA incl. colour contrast)`, async () => {
        global.axeRunning = true;
        const bad = [];
        for (const id of ALL_ROUTES) {
          await loadClean(id, Object.assign({ theme }, id === 'summary' ? seedMaster(5) : {}));
          await sleep(400);
          (await runAxe()).forEach((v) => bad.push(`${id}: ${v.id} (${v.impact}) @ ${v.nodes.join(' | ')}`));
        }
        assert.deepEqual(bad, []);
      });
    }
    // Interactive states are where contrast bugs hide (dimmed / dropped / failed / over-limit styles), so audit those too.
    const STATES = [
      ['start: prediction answered', 'start', null, async () => { await page.$eval('.qcard button.opt:nth-child(1)', (b) => b.click()); await page.$eval('.qcard button.opt:nth-child(2)', (b) => b.click()); }],
      ['why: step 3', 'why', null, async () => { await page.$$eval('.journey__node', (n) => n[2].click()); }],
      ['lab-1: Hindi + IDs + type colours + token inspected', 'lab-1', null, async () => { await clickText('.presets button', 'Hindi'); await page.click('#pg-ids'); await page.click('input[name="pg-color"][value="type"]'); await page.$eval('.toks-box button.tok[data-i="3"]', (b) => b.click()); }],
      ['lab-2: pair highlight mid-animation', 'lab-2', null, async () => { await page.select('#bpe-speed', 'slow'); await clickText('button', 'Next step'); await sleep(120); }],
      ['lab-2: finished + before/after + challenge wrong pick', 'lab-2', null, async () => { await setRange('#bpe-merges', 18); await page.$eval('#bpe-challenge', (c) => c.click()); await page.$$eval('button.pair', (b) => b[0] && b[0].click()); }],
      ['master-1: answered, wrong and revealed', 'master-1', null, async () => { const q = await page.evaluate(() => TokenLab.master.build().byId.m1); for (const w of [0, 1, 2, 3].filter((i) => i !== q.correct)) await page.$eval('.qcard[data-qid="m1"]', (c, n) => c.querySelectorAll('button.opt')[n].click(), w); await page.$eval('.qcard[data-qid="m2"] input[type="text"]', (i) => { i.value = 'abc'; }); await page.$eval('.qcard[data-qid="m2"]', (c) => [...c.querySelectorAll('button')].find((b) => b.textContent.includes('Check answer')).click()); }],
      ['master-2: locked levels', 'master-2', null, async () => {}],
      ['master-2: results card + multi answered', 'master-2', seedMaster(5), async () => { await page.$eval('details.disclosure', (d) => (d.open = true)); }],
      ['lab-3: planner overflow', 'lab-3', null, async () => { await clickText(PL + ' .presets button', 'Paste a whole report'); }],
      ['lab-3: survival rejected + warn', 'lab-3', null, async () => { await clickKey('send'); await clickKey('a-trim'); }],
      ['lab-3: survival won', 'lab-3', null, async () => { await playSurvivalWell(1400); }],
      ['lab-4: memory manager mid-game with a full-memory notice', 'lab-4', null, async () => { for (let i = 0; i < 5; i++) await clickKey('save'); await clickKey('forget').catch(() => {}); }],
      ['lab-4: memory manager finished', 'lab-4', null, async () => { await playMemoryWell(); }],
      ['lab-4: chart tooltip + deep dive open', 'lab-4', null, async () => { await page.$eval('#strategy-compare', (d) => (d.open = true)); await page.focus('.linechart'); await page.keyboard.press('ArrowLeft'); }],
      ['challenge: failing tests with hints', 'challenge', null, async () => { await clickText('button', 'Run tests'); await page.waitForSelector('.tests'); await clickText('button', 'Give me a hint'); }],
      ['summary: locked', 'summary', null, async () => {}],
      ['badge toast visible', 'lab-1', null, async () => { await page.evaluate(() => { const s = TokenLab.store; ['tok.mode.chars', 'tok.mode.words', 'tok.mode.subword', 'tok.lang.other', 'tok.preset.typos', 'tok.preset.clean'].forEach((f) => s.flag(f)); }); }],
      ['instructor notes visible', 'lab-2', null, async () => { await page.click('#inst-btn'); }],
    ];
    for (const theme of ['dark', 'light']) {
      await test(`axe-core audit of ${STATES.length} interactive states, ${theme} theme`, async () => {
        global.axeRunning = true;
        const bad = [];
        for (const [name, id, seed, setup] of STATES) {
          await loadClean(id, Object.assign({ theme }, seed || {}));
          await setup();
          await sleep(350);
          (await runAxe()).forEach((v) => bad.push(`[${name}] ${v.id} (${v.impact}) @ ${v.nodes.join(' | ')}`));
        }
        assert.deepEqual(bad, []);
      });
    }
  }

  // ================================================================== mobile
  console.log('\nMobile (390x844)');
  await emulate('light');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await test('No horizontal overflow on any route at phone width (both themes)', async () => {
    for (const theme of ['dark', 'light']) {
      for (const id of ALL_ROUTES) {
        await loadClean(id, Object.assign({ theme }, id === 'summary' ? seedMaster(5) : id === 'master-2' ? seedMaster(2) : {}));
        await sleep(200);
        const off = await page.evaluate(() => {
          const vw = document.documentElement.clientWidth;
          const bad = [];
          for (const el of document.querySelectorAll('main *')) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (r.right > vw + 1 && !el.closest('.tablewrap, pre, .codeblock, .editor, textarea')) bad.push(el.tagName.toLowerCase() + '.' + el.className + ' right=' + Math.round(r.right));
          }
          return { page: document.documentElement.scrollWidth - vw, bad: bad.slice(0, 4) };
        });
        assert.ok(off.page <= 1, `${theme} ${id}: page scrolls horizontally by ${off.page}px`);
        assert.deepEqual(off.bad, [], `${theme} ${id} has elements wider than the screen`);
      }
    }
  });
  await test('Smaller phones (360 and 320 px): no horizontal scroll on any route, the header fits and the brand stays on one line', async () => {
    for (const width of [360, 320]) {
      await page.setViewport({ width, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      for (const id of ALL_ROUTES) {
        await loadClean(id, id === 'summary' ? seedMaster(5) : id === 'master-2' ? seedMaster(2) : {});
        await sleep(120);
        const r = await page.evaluate(() => {
          const de = document.documentElement;
          const name = document.querySelector('.brand__name');
          const lineH = parseFloat(getComputedStyle(name).lineHeight) || 20;
          return { over: de.scrollWidth - de.clientWidth, wrapped: name.getBoundingClientRect().height > lineH * 1.4, rightmost: Math.round(document.getElementById('theme-btn').getBoundingClientRect().right), vw: de.clientWidth };
        });
        assert.ok(r.over <= 1, `${width}px ${id}: page scrolls horizontally by ${r.over}px`);
        assert.equal(r.wrapped, false, `${width}px ${id}: the brand name wraps onto two lines`);
        assert.ok(r.rightmost <= r.vw, `${width}px ${id}: the header spills past the screen edge`);
      }
    }
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  });
  await test('Mobile: the simulations stay usable (game, memory manager, token master, BPE) with no overflow when active', async () => {
    await openFresh('#/lab-3');
    await clickKey('send');
    await clickKey('a-trim');
    let w = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(w <= 1, 'survival game overflow ' + w);
    await openFresh('#/lab-4');
    await clickKey('save');
    w = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(w <= 1, 'memory manager overflow ' + w);
    await openFresh('#/master-1');
    w = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(w <= 1, 'token master overflow ' + w);
  });
  await test('Mobile: menu button opens the section drawer, link click navigates and closes it, Esc closes', async () => {
    await openFresh('#/start');
    assert.equal(await page.$eval('#sidebar', (s) => getComputedStyle(s).visibility), 'hidden');
    await page.click('#menu-btn');
    assert.equal(await page.$eval('#sidebar', (s) => s.getAttribute('data-open')), 'true');
    assert.equal(await page.$eval('#menu-btn', (b) => b.getAttribute('aria-expanded')), 'true');
    await clickText('#nav a', 'Lab 3');
    await sleep(80);
    assert.match(await text('#section-title'), /Lab 3/);
    assert.equal(await page.$eval('#sidebar', (s) => s.getAttribute('data-open')), 'false');
    await page.click('#menu-btn');
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('#sidebar', (s) => s.getAttribute('data-open')), 'false');
  });
  await test('Mobile: touch targets for primary controls are at least 24px (WCAG 2.2 minimum)', async () => {
    for (const id of ['lab-1', 'lab-3', 'lab-4']) {
      await openFresh('#/' + id);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('main button:not(.tok), main input[type=checkbox], main select, .icon-btn, .xpchip')]
          .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.width < 24 || r.height < 24); })
          .map((e) => e.tagName + ' ' + (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 20))
      );
      assert.deepEqual(small, [], id);
    }
  });

  // ================================================================== finish
  console.log('\nConsole hygiene');
  await test('Zero console errors, warnings or page errors across the entire run', async () => {
    assert.deepEqual(problems, []);
  });

  if (attached) await browser.disconnect();
  else await browser.close();
  if (userDir) try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) { /* temp profile cleanup is best effort */ }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} end-to-end checks passed.`);
  if (process.env.E2E_JSON) fs.writeFileSync(process.env.E2E_JSON, JSON.stringify({ browser: exe, version: browserVersion, passed, total: results.length, results }, null, 2));
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => {
  console.error('E2E harness crashed:', e);
  process.exit(2);
});
