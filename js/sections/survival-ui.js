/**
 * survival-ui.js - the Context Window Survival game (Simulation 3), shown inside Lab 3.
 *
 * All rules live in core/survival.js (deterministic, no randomness, no language
 * model). This file only draws the state and forwards the student's choices.
 * Focus is restored after every redraw so keyboard users never lose their place.
 */
(function (g) {
  'use strict';
  const TL = g.TokenLab;
  TL.ui = TL.ui || {};

  TL.ui.survivalGame = function survivalGame(ctx) {
    const { h, p, rich, icon, fmt } = TL.dom;
    const { callout, lab } = TL.ui;
    const S = TL.survival;
    const store = TL.store;

    let state = S.newGame({ capacity: S.CAPACITY.default });
    let capacity = S.CAPACITY.default;

    const bar = TL.charts.stackedBar({ ariaLabel: 'How the request fills the context window' });
    const head = h('div', { class: 'sv-head' });
    const statusEl = h('div', { class: 'sv-status', role: 'status', 'aria-live': 'polite' });
    const actionsEl = h('div', { class: 'sv-actions' });
    const listsEl = h('div', { class: 'sv-lists' });
    const sendEl = h('div', { class: 'sv-send' });
    const resultEl = h('div', { class: 'sv-result', 'aria-live': 'polite' });
    const finalEl = h('div');

    const capIn = h('input', { type: 'range', id: 'sv-cap', min: String(S.CAPACITY.min), max: String(S.CAPACITY.max), step: String(S.CAPACITY.step), value: String(capacity), 'aria-describedby': 'sv-cap-out' });
    const capOut = h('output', { id: 'sv-cap-out', for: 'sv-cap', class: 'mono' });
    const capNote = h('span', { class: 'field__hint' });

    /** Redraw, then put keyboard focus back on the control that had it. */
    function redraw() {
      const key = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : null;
      draw();
      if (key) {
        const el = lab_el.querySelector(`[data-key="${key}"]`);
        if (el && !el.disabled) el.focus();
      }
    }

    const live = () => state.status === 'playing';
    const set = (next) => {
      state = next;
      redraw();
    };

    const COLORS = { system: 1, history: 2, docs: 3, user: 4, reserve: 5 };
    const SHORT = { system: 'System', history: 'History', docs: 'Docs', user: 'You', reserve: 'Reply' };
    const LABEL = { system: 'System rules', history: 'Conversation history', docs: 'Retrieved documents', user: 'New user message', reserve: 'Reserved for the answer' };

    function item(key, checked, disabled, onChange, ...kids) {
      const cb = h('input', { type: 'checkbox', 'data-key': key, checked: checked ? true : null, disabled: disabled ? true : null });
      cb.addEventListener('change', onChange);
      return h('label', { class: 'sv-item', 'data-on': String(checked) }, cb, h('span', { class: 'sv-item__body' }, kids));
    }

    function draw() {
      const u = S.usage(state);
      const round = S.ROUNDS[Math.min(state.round, S.ROUNDS.length - 1)];
      const over = state.status === 'lost' || state.status === 'won' || state.status === 'done';
      const locked = state.results.length > 0 || state.last != null; // capacity can only be chosen before the first request

      // ---- header: round, lives, score
      head.replaceChildren(
        h('div', { class: 'sv-chip' }, h('span', { class: 'eyebrow' }, 'Round'), h('strong', null, `${Math.min(state.round + 1, S.ROUNDS.length)} of ${S.ROUNDS.length}`), h('span', { class: 'muted small' }, over ? 'finished' : round.title)),
        h('div', { class: 'sv-chip', 'aria-label': `${state.lives} of ${S.LIVES} lives left` }, h('span', { class: 'eyebrow' }, 'Lives'), h('span', { class: 'sv-lives' }, Array.from({ length: S.LIVES }, (_, i) => h('span', { class: 'sv-life', 'data-on': String(i < state.lives) }, icon('shield')))), h('span', { class: 'sr-only' }, `${state.lives} of ${S.LIVES}`)),
        h('div', { class: 'sv-chip' }, h('span', { class: 'eyebrow' }, 'Score'), h('strong', null, S.summary(state).average + '%'), h('span', { class: 'muted small' }, state.results.length ? `average of ${state.results.length} round${state.results.length === 1 ? '' : 's'}` : 'no rounds yet'))
      );

      // ---- capacity (only before the first request)
      capIn.value = String(state.capacity);
      capIn.disabled = locked;
      capOut.textContent = fmt.int(state.capacity) + ' tokens';
      capNote.textContent = locked ? 'Locked after the first request. Restart to change it.' : state.capacity <= 1100 ? 'Tight: you will need to summarise and trim.' : state.capacity >= 1800 ? 'Roomy: still not enough to keep everything.' : 'Standard.';

      // ---- live bar + warning
      bar.update(
        ['system', 'history', 'docs', 'user', 'reserve'].map((k) => ({ key: k, label: LABEL[k], short: SHORT[k], tokens: u[k], color: COLORS[k] })),
        state.capacity
      );
      const pct = Math.round(u.ratio * 100);
      statusEl.setAttribute('data-level', u.level);
      statusEl.replaceChildren(
        icon(u.level === 'over' ? 'x' : u.level === 'warn' ? 'alert' : 'check'),
        h(
          'div',
          null,
          h('strong', null, u.level === 'over' ? `Over the window by ${fmt.int(u.over)} tokens (${pct}%)` : u.level === 'warn' ? `Warning: ${pct}% of the window is used` : `OK: ${pct}% used, ${fmt.int(u.free)} tokens free`),
          h('span', null, u.level === 'over' ? 'Many APIs would reject this request. Remove something before you send.' : u.level === 'warn' ? 'One more addition and it will not fit.' : 'There is room. Keep what the answer needs.')
        )
      );

      // ---- actions
      const dis = !live();
      const mk = (label, ic, key, fn, hint) => {
        const b = h('button', { type: 'button', class: 'btn btn--sm', 'data-key': key, disabled: dis ? true : null, title: hint }, icon(ic), label);
        b.addEventListener('click', fn);
        return b;
      };
      const res = h('input', { type: 'range', id: 'sv-reserve', 'data-key': 'reserve', min: String(S.RESERVE.min), max: String(S.RESERVE.max), step: String(S.RESERVE.step), value: String(state.reserve), disabled: dis ? true : null, 'aria-describedby': 'sv-reserve-out' });
      res.addEventListener('input', () => set(S.setReserve(state, Number(res.value))));
      actionsEl.replaceChildren(
        mk('Drop the 2 oldest messages', 'trash', 'a-drop', () => set(S.dropOldest(state, 2)), 'Frees tokens. Anything only those messages said is gone.'),
        mk('Summarise history', 'layers', 'a-sum', () => set(S.summarise(state)), 'Replaces older messages with one 60-token summary that keeps only the gist.'),
        mk('Shorten documents', 'layers', 'a-trim', () => set(S.trimDocs(state)), 'Halves each included chunk. Some lose detail.'),
        h('div', { class: 'sv-reserve' }, h('label', { for: 'sv-reserve', class: 'field__label' }, 'Room for the answer'), res, h('output', { id: 'sv-reserve-out', for: 'sv-reserve', class: 'mono' }, state.reserve + ' tokens'), h('span', { class: 'field__hint' }, `This round's answer needs about ${round.answerTokens}.`))
      );

      // ---- lists
      const sysList = h('div', { class: 'sv-list' }, h('h3', null, 'System rules (pinned instructions)'), state.rules.map((r) => {
        const d = S.ruleDef(r.id);
        return item('rule-' + r.id, r.on, dis, () => set(S.toggleRule(state, r.id)), h('span', { class: 'sv-item__text' }, d.text), h('span', { class: 'tag' + (d.critical ? ' tag--warn' : '') }, d.critical ? 'critical' : 'style'), h('span', { class: 'sv-tok' }, d.tokens + ' tok'));
      }));
      const histList = h('div', { class: 'sv-list' }, h('h3', null, 'Conversation history'), state.history.map((m) =>
        item('msg-' + m.id, m.on, dis, () => set(S.toggleMsg(state, m.id)), h('span', { class: 'sv-role' }, m.role), h('span', { class: 'sv-item__text' }, m.text), ...m.facts.map((f) => h('span', { class: 'msg__fact' }, S.FACTS[f].split(' (')[0])), h('span', { class: 'sv-tok' }, m.tokens + ' tok'))
      ));
      const docList = h('div', { class: 'sv-list' }, h('h3', null, 'Retrieved documents'), state.docs.map((d) => {
        const def = S.DOCS[d.id];
        return item('doc-' + d.id, d.on, dis, () => set(S.toggleDoc(state, d.id)), h('span', { class: 'sv-item__text' }, def.title), d.trimmed ? h('span', { class: 'tag' }, 'shortened') : null, h('span', { class: 'sv-tok' }, (d.trimmed ? def.trimTokens : def.tokens) + ' tok'));
      }));
      const userBox = h('div', { class: 'sv-list sv-list--fixed' }, h('h3', null, 'New user message (fixed)'), h('div', { class: 'sv-item sv-item--fixed' }, h('span', { class: 'sv-role' }, 'user'), h('span', { class: 'sv-item__text' }, round.user.text), h('span', { class: 'sv-tok' }, round.user.tokens + ' tok')));
      listsEl.replaceChildren(sysList, histList, docList, userBox);

      // ---- send
      const send = h('button', { type: 'button', class: 'btn btn--primary', 'data-key': 'send', disabled: dis ? true : null }, icon('play'), `Send request (${fmt.int(u.total)} tokens)`);
      send.addEventListener('click', () => {
        const before = state.results.length;
        state = S.send(state);
        if (state.results.length > before) {
          store.award('survival.score', S.summary(state).points);
          if (state.status === 'won') store.award('survival.pass', 20);
        }
        redraw();
      });
      sendEl.replaceChildren(send, h('span', { class: 'muted small' }, 'Sending an overflowing request costs a life.'));

      // ---- result of the last request
      const last = state.last;
      if (!last) resultEl.replaceChildren(h('p', { class: 'muted small', style: { margin: 0 } }, 'Assemble the request, then send it. The consequences of your choices appear here.'));
      else if (last.rejected) {
        resultEl.replaceChildren(callout('bad', rich(`**Request rejected: ${fmt.int(last.over)} tokens over the window.** You lost a life (${last.livesLeft} left). Many real APIs answer an overflowing request with a context-length error; other systems may silently cut text instead, and policies differ between models. Either way, you must decide what goes in before you send.`)));
      } else {
        resultEl.replaceChildren(
          h('div', { class: 'sv-score', 'data-pass': String(last.pass) }, h('strong', null, `Round ${last.round + 1}: ${last.score}/100`), h('span', null, last.pass ? 'The assistant answered well.' : 'The answer was weak.'), h('span', { class: 'muted small' }, ` ${fmt.int(last.total)} tokens sent`)),
          h('ul', { class: 'checklist' }, last.checks.map((c) => h('li', { 'data-pass': String(c.ok) }, icon(c.ok ? 'check' : 'x'), h('span', null, h('strong', null, c.label), h('br'), h('span', { class: 'muted small' }, c.detail)), h('span', { class: 'detail' }, c.ok ? 'ok' : 'problem'))))
        );
      }

      // ---- end of game
      if (over) {
        const sum = S.summary(state);
        const again = h('button', { type: 'button', class: 'btn btn--primary' }, icon('reset'), 'Play again');
        again.addEventListener('click', () => {
          state = S.newGame({ capacity: Number(capIn.value) });
          redraw();
        });
        finalEl.replaceChildren(
          callout(
            state.status === 'won' ? 'ok' : 'warn',
            h('div', null,
              h('p', null, h('strong', null, state.status === 'won' ? 'You kept the assistant alive and useful.' : state.status === 'lost' ? 'Game over: three rejected requests.' : `You finished, but the average score was ${sum.average}% (the pass mark is ${S.PASS_SCORE}%).`)),
              h('p', null, `Average ${sum.average}% over ${sum.rounds} round${sum.rounds === 1 ? '' : 's'} · ${sum.points} of 80 XP points earned${state.status === 'won' ? ' + 20 for winning' : ''}.`),
              p('**Why this matters:** every real assistant has a window. What you sent decides what it can use: forgotten facts, missing evidence and dropped rules all change the answer. Overflowing the window is only the loudest failure; the quiet ones (a trimmed chunk, a summary that lost a detail) are the dangerous ones.'))
          ),
          h('div', null, again)
        );
      } else finalEl.replaceChildren();
    }

    capIn.addEventListener('input', () => {
      if (state.results.length || state.last) return;
      state = S.newGame({ capacity: Number(capIn.value) });
      redraw();
    });

    const lab_el = lab(
      { id: 'survival', badge: 'Simulation 3', title: 'Context Window Survival', sub: 'Deterministic game, not a language model' },
      p('**Goal:** keep the assistant working for four rounds. Tick what goes into the request, watch the bar, then **Send**. Overflow costs a life; leaving out what the question needs costs points. Sizes are round game numbers.', 'muted'),
      h('div', { class: 'row' }, h('label', { for: 'sv-cap', class: 'field__label' }, 'Context window capacity'), capIn, capOut, capNote),
      head,
      bar.el,
      TL.charts.legend(['system', 'history', 'docs', 'user', 'reserve'].map((k) => ({ label: LABEL[k], color: COLORS[k] })).concat([{ label: 'Free space', free: true }])),
      statusEl,
      actionsEl,
      listsEl,
      sendEl,
      resultEl,
      finalEl
    );

    draw();
    return lab_el;
  };
})(typeof window !== 'undefined' ? window : globalThis);
