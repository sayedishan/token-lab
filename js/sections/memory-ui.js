/**
 * memory-ui.js - the AI Memory Manager (Simulation 4), shown inside Lab 4.
 *
 * A DETERMINISTIC EDUCATIONAL SIMULATION, not a language model and not a
 * production memory system (core/memorymgr.js). The student decides what to
 * save, keep, forget or summarise; later probe questions show what that cost.
 * The inspector always shows exactly which facts the assistant can use right now.
 */
(function (g) {
  'use strict';
  const TL = g.TokenLab;
  TL.ui = TL.ui || {};

  TL.ui.memoryManager = function memoryManager(ctx) {
    const { h, p, rich, icon, fmt } = TL.dom;
    const { callout, lab } = TL.ui;
    const MM = TL.memorymgr;
    const store = TL.store;

    let state = MM.newGame();
    let forgotten = new Set();
    let notice = null; // {kind, text} shown under the action buttons
    const log = []; // newest first

    const progressEl = h('div', { class: 'mm-progress', role: 'group' });
    const turnEl = h('div', { class: 'mm-turn', 'aria-live': 'polite' });
    const actionsEl = h('div', { class: 'mm-actions' });
    const noticeEl = h('div', { class: 'mm-notice', role: 'status', 'aria-live': 'polite' });
    const answersEl = h('div', { class: 'mm-answers', 'aria-live': 'polite' });
    const ctxMeter = h('div', { class: 'meter', role: 'progressbar', 'aria-label': 'Short-term context used', 'aria-valuemin': '0' }, h('span'));
    const memMeter = h('div', { class: 'meter', role: 'progressbar', 'aria-label': 'Long-term memory used', 'aria-valuemin': '0' }, h('span'));
    const ctxTitle = h('h4', null);
    const memTitle = h('h4', null);
    const ctxList = h('ul', { class: 'mm-list', 'aria-label': 'Short-term context' });
    const memList = h('ul', { class: 'mm-list', 'aria-label': 'Long-term memory' });
    const factsEl = h('div', { class: 'facts' });
    const logEl = h('ol', { class: 'mm-log', 'aria-label': 'What just happened' });
    const resultEl = h('div', { 'aria-live': 'polite' });

    const remember = (events) => events.forEach((e) => log.unshift(e));
    const apply = (next, forgotId) => {
      if (next.error) {
        notice = next.error.type === 'memory-full' ? { kind: 'bad', text: `Memory is full: this needs ${next.error.need} tokens but only ${next.error.free} are free. Delete something first, or choose another action.` } : { kind: 'info', text: 'There is nothing new to summarise yet.' };
        state = Object.assign({}, state, { error: null });
      } else {
        notice = null;
        if (forgotId) forgotten.add(forgotId);
        remember(next.events || []);
        state = next;
      }
      draw();
    };

    const eventText = (e) => {
      if (e.type === 'saved') return 'Saved to long-term memory: ' + e.text;
      if (e.type === 'kept') return 'Kept in short-term context only.';
      if (e.type === 'forgot') return 'Forgot: ' + e.text;
      if (e.type === 'fell-out') return 'Scrolled out of context: "' + e.text + '"';
      if (e.type === 'summarised') return 'Summarised. ' + e.text + (e.lost && e.lost.length ? '. Lost in the summary: ' + e.lost.join(', ') : '');
      if (e.type === 'deleted') return 'Deleted from memory: ' + e.text;
      if (e.type === 'probe') return e.text;
      return e.text;
    };

    function btn(label, ic, key, fn, desc, primary) {
      const b = h('button', { type: 'button', class: 'btn' + (primary ? ' btn--primary' : ''), 'data-key': key }, icon(ic), label);
      b.addEventListener('click', fn);
      return h('div', { class: 'mm-action' }, b, desc ? h('span', { class: 'field__hint' }, desc) : null);
    }

    function revealedFacts() {
      const ids = [];
      MM.TURNS.slice(0, Math.min(state.i + 1, MM.TURNS.length)).forEach((t) => (t.facts || t.needs || []).forEach((f) => !ids.includes(f) && ids.push(f)));
      return ids;
    }

    function draw() {
      const key = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : null;
      const turnN = Math.min(state.i + 1, MM.TURNS.length);
      progressEl.replaceChildren(
        ...MM.TURNS.map((t, k) => h('span', { class: 'mm-dot', 'data-state': k < state.i ? 'done' : k === state.i && !state.done ? 'now' : 'todo', 'data-kind': t.kind, title: `Turn ${k + 1}${t.kind === 'probe' ? ' (question for the assistant)' : ''}` })),
        h('span', { class: 'muted small' }, state.done ? 'All 10 turns finished' : `Turn ${turnN} of ${MM.TURNS.length}`)
      );
      progressEl.setAttribute('aria-label', state.done ? 'Conversation finished' : `Turn ${turnN} of ${MM.TURNS.length}`);

      // ---- the current turn and the choices
      const t = MM.TURNS[state.i];
      if (state.done) {
        turnEl.replaceChildren(h('p', { class: 'muted', style: { margin: 0 } }, 'The conversation is over. You can still delete memories below: hygiene is judged on what is stored at the end.'));
        actionsEl.replaceChildren();
      } else if (t.kind === 'probe') {
        turnEl.replaceChildren(h('div', { class: 'mm-msg mm-msg--probe' }, h('span', { class: 'mm-who' }, 'Question for the assistant'), h('p', null, `“${t.text}”`), h('p', { class: 'small muted', style: { margin: 0 } }, 'The assistant can only use the facts listed under “What the assistant can use now”.')));
        actionsEl.replaceChildren(btn('Ask the assistant', 'play', 'ask', () => apply(MM.answerProbe(state)), 'See what it can answer from short-term context and long-term memory.', true));
      } else {
        turnEl.replaceChildren(h('div', { class: 'mm-msg' }, h('span', { class: 'mm-who' }, 'Kavya says'), h('p', null, `“${t.text}”`), h('p', { class: 'small muted', style: { margin: 0 } }, 'What should the assistant do with this?')));
        actionsEl.replaceChildren(
          btn('Save to memory', 'save', 'save', () => apply(MM.decide(state, 'save')), 'Keeps a short note forever, but memory is small.', true),
          btn('Keep in context only', 'layers', 'keep', () => apply(MM.decide(state, 'keep')), 'It stays until newer messages push it out.'),
          btn('Forget it', 'trash', 'forget', () => apply(MM.decide(state, 'forget'), t.id), 'Remove it now. The assistant will never see it.'),
          btn('Summarise context', 'sparkle', 'sum', () => apply(MM.summarise(state)), 'Compress what is in context into one short note. Lossy: some details are dropped.')
        );
      }
      noticeEl.setAttribute('data-kind', notice ? notice.kind : 'none');
      noticeEl.replaceChildren(...(notice ? [icon(notice.kind === 'bad' ? 'alert' : 'info'), h('span', null, notice.text)] : []));

      // ---- assistant answers so far
      answersEl.replaceChildren(
        ...state.probes.map((pr) => h('div', { class: 'bubble', 'data-kind': pr.fraction === 1 ? 'known' : pr.fraction === 0 ? 'rejected' : 'forgotten' }, h('span', { class: 'bubble__who' }, `Simulated assistant (rules, not an LLM) · ${pr.label}: ${pr.used.length} of ${pr.needs.length} facts`), pr.text))
      );

      // ---- inspector
      const ct = MM.ctxTokens(state);
      const mt = MM.memTokens(state);
      ctxTitle.textContent = `Short-term context: ${ct} / ${MM.CAPS.context} tokens`;
      memTitle.textContent = `Long-term memory: ${mt} / ${MM.CAPS.memory} tokens`;
      ctxMeter.setAttribute('aria-valuemax', String(MM.CAPS.context));
      ctxMeter.setAttribute('aria-valuenow', String(ct));
      ctxMeter.firstChild.style.width = Math.min(100, (ct / MM.CAPS.context) * 100) + '%';
      ctxMeter.setAttribute('data-level', ct / MM.CAPS.context >= 0.9 ? 'warn' : 'ok');
      memMeter.setAttribute('aria-valuemax', String(MM.CAPS.memory));
      memMeter.setAttribute('aria-valuenow', String(mt));
      memMeter.firstChild.style.width = Math.min(100, (mt / MM.CAPS.memory) * 100) + '%';
      memMeter.setAttribute('data-level', mt / MM.CAPS.memory >= 0.9 ? 'warn' : 'ok');
      ctxList.replaceChildren(...(state.context.length ? state.context.map((m) => h('li', { class: 'mm-li' }, h('span', { class: 'sv-role' }, m.role), h('span', { class: 'mm-li__text' }, m.text), h('span', { class: 'sv-tok' }, m.tokens + ' tok'))) : [h('li', { class: 'muted small' }, 'Empty')]));
      memList.replaceChildren(
        ...(state.memory.length
          ? state.memory.map((m) => {
              const del = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'aria-label': 'Delete memory: ' + m.text, 'data-key': 'del-' + m.id }, icon('trash'));
              del.addEventListener('click', () => {
                state = MM.deleteMemory(state, m.id);
                remember(state.events);
                draw();
                finish();
              });
              return h('li', { class: 'mm-li' }, h('span', { class: 'sv-role' }, m.source), h('span', { class: 'mm-li__text' }, m.text), h('span', { class: 'sv-tok' }, m.tokens + ' tok'), del);
            })
          : [h('li', { class: 'muted small' }, 'Nothing saved yet')])
      );
      const have = MM.available(state);
      // A SENSITIVE fact (the Wi-Fi password) is the one fact you want the assistant NOT to have, so "not stored"
      // is shown as the good outcome and "stored" as the warning, instead of the usual available / missing colours.
      factsEl.replaceChildren(
        ...revealedFacts().map((f) => {
          const sensitive = MM.FACTS[f].kind === 'sensitive';
          const yes = have.has(f);
          const label = MM.FACTS[f].label + (sensitive ? (yes ? ' stored: risky' : ' not stored: good') : yes ? ' available' : ' not available');
          return h('div', { class: 'fact', 'data-have': String(sensitive ? !yes : yes), 'data-kind': sensitive ? 'sensitive' : null, 'data-risk': sensitive && yes ? 'true' : null }, icon(sensitive ? (yes ? 'alert' : 'shield') : yes ? 'check' : 'x'), label);
        })
      );
      logEl.replaceChildren(...log.slice(0, 5).map((e) => h('li', { 'data-type': e.type }, eventText(e))));

      finish();
      if (key) {
        const el = lab_el.querySelector(`[data-key="${key}"]`);
        if (el) el.focus();
      }
    }

    /** When the conversation is over, show the score (and award XP; replays can only raise it). */
    function finish() {
      if (!state.done) {
        resultEl.replaceChildren();
        return;
      }
      const sc = MM.score(state);
      store.award('memory.score', MM.points(sc.total));
      if (sc.pass) store.award('memory.pass', 20);
      const again = h('button', { type: 'button', class: 'btn btn--primary' }, icon('reset'), 'Play again');
      again.addEventListener('click', () => {
        state = MM.newGame();
        forgotten = new Set();
        notice = null;
        log.length = 0;
        draw();
      });
      resultEl.replaceChildren(
        callout(
          sc.pass ? 'ok' : 'warn',
          h('div', null,
            h('p', null, h('strong', null, `Memory score: ${sc.total}/100`), sc.pass ? ' — the assistant could answer what mattered.' : ` — below the pass mark of ${MM.PASS_SCORE}.`),
            h('p', { class: 'small' }, `Recall of what the probes needed: ${sc.probePart}/80. Memory hygiene: ${sc.hygiene}/20${sc.secrets ? ' (a secret is stored: never keep passwords in memory)' : ''}${sc.trivia ? ` (${sc.trivia} trivia item${sc.trivia === 1 ? '' : 's'} stored: clutter costs tokens on every request)` : ''}.`),
            p('**Why this matters:** an assistant is only as good as what it is given. Limited windows force a memory policy: save what later answers need, keep trivia and secrets out, and remember that a summary is shorter but loses detail. This is a rules-based simulation, not a language model and not a production memory system.'))
        ),
        h('div', { class: 'mm-probe-table tablewrap' }, h('table', null, h('thead', null, h('tr', null, ['Question', 'Needed', 'Available', 'Missing'].map((x) => h('th', { scope: 'col' }, x)))), h('tbody', null, state.probes.map((pr) => h('tr', null, h('th', { scope: 'row' }, pr.label), h('td', null, pr.needs.map((f) => MM.FACTS[f].label).join(', ')), h('td', { class: 'good' }, pr.used.map((f) => MM.FACTS[f].label).join(', ') || 'none'), h('td', { class: pr.missing.length ? 'bad' : '' }, pr.missing.map((f) => MM.FACTS[f].label).join(', ') || 'none')))))),
        h('div', null, again)
      );
    }

    const lab_el = lab(
      { id: 'memmgr', badge: 'Simulation 4', title: 'AI Memory Manager', sub: 'Deterministic simulation, not a language model' },
      p('**Learning objective:** decide what an assistant should remember. **How to play:** Kavya talks to a study assistant for 10 turns. For each message choose **Save to memory**, **Keep in context only** or **Forget it**; you can also **Summarise** the context. Short-term context is small, so old messages scroll out. Two questions test what the assistant can still use. Save the facts later answers need, and keep secrets and small talk out.', 'muted'),
      callout('info', rich('**A deterministic educational simulation.** Each message is tagged by hand with the facts it carries, and the “assistant” can only use facts that are in its short-term context or long-term memory. It is not a language model and not a production memory system. Token counts use the lesson’s toy tokenizer.')),
      progressEl,
      h(
        'div',
        { class: 'mm-grid' },
        h('div', { class: 'mm-col' }, turnEl, actionsEl, noticeEl, answersEl),
        h(
          'div',
          { class: 'mm-col mm-inspector' },
          h('h3', { class: 'panel__title' }, 'Memory inspector'),
          ctxTitle,
          ctxMeter,
          ctxList,
          memTitle,
          memMeter,
          memList,
          h('h4', null, 'What the assistant can use now'),
          factsEl,
          h('h4', null, 'What just happened'),
          logEl
        )
      ),
      resultEl
    );

    draw();
    return lab_el;
  };
})(typeof window !== 'undefined' ? window : globalThis);
