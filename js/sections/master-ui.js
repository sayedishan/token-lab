/**
 * master-ui.js - the Token Master Challenge (Simulation 5).
 * Registers two lesson sections: master-1 (levels 1-2) and master-2 (levels 3-5).
 *
 * Questions and scoring live in core/master.js. Practical answers are computed by
 * the real engine, so they can never disagree with the labs. Levels unlock in order
 * (Instructor view unlocks them all, for demonstrations). Replaying can only RAISE a
 * score, because XP awards keep the best value (core/gamification.js).
 */
(function (g) {
  'use strict';
  const TL = g.TokenLab;
  TL.sections = TL.sections || {};

  function renderMaster(ctx, levelNums, introText) {
    const { h, p, rich, icon, fmt } = TL.dom;
    const { callout } = TL.ui;
    const M = TL.master;
    const store = TL.store;
    const B = M.build();
    const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

    const master = () => store.get().master;
    const open = (n) => M.isUnlocked(master(), n) || store.get().instructor;

    const root = h('div', { class: 'stack' });
    const levelsEl = h('div', { class: 'stack' });
    const summaryEl = h('div', { 'aria-live': 'polite' });
    const wrappers = {}; // level -> {wrap, head, body, built}

    // ---- scoring side effects --------------------------------------------------------------
    function afterAnswer() {
      B.levels.forEach((l) => {
        if (M.levelProgress(master(), l.n).complete) store.award('master.level.' + l.n, 10);
      });
      const m = M.mastery(master());
      if (m.earnedBadge) store.award('master.mastery', 0);
    }

    // ---- one question ------------------------------------------------------------------------
    function questionCard(q, number) {
      const rec = (master().q || {})[q.id];
      let attempts = rec ? rec.attempts : 0;
      let hintUsed = rec ? !!rec.hint : false;
      let done = !!(rec && rec.done);
      const typeLabel = q.type === 'mc' ? 'Multiple choice' : q.type === 'num' ? 'Work it out' : 'Select all that apply';
      const hintBtn = h('button', { type: 'button', class: 'btn btn--ghost btn--sm' }, icon('info'), 'Show a hint (costs 2 XP)');
      const hintEl = h('p', { class: 'mq-hint hidden' });
      const fb = h('div', { class: 'qcard__fb', 'aria-live': 'polite' });
      const pts = h('span', { class: 'tag tag--accent hidden' });
      const input = h('div', { class: 'mq-input' });
      const root2 = h('article', { class: 'qcard mq', 'data-qid': q.id, 'data-type': q.type }, h('div', { class: 'qcard__num' }, `Level ${q.level} · Question ${number} · ${typeLabel}`, ' ', pts), h('p', { class: 'qcard__stem' }, q.stem));

      if (q.extra && q.extra.kind === 'bpe') {
        root2.appendChild(h('div', { class: 'mq-corpus', role: 'group', 'aria-label': 'Corpus' }, q.extra.words.map(([w, c]) => h('div', { class: 'mq-word' }, h('span', { class: 'toks toks--static' }, [TL.bpe.SPACE_MARK].concat(Array.from(w)).map((s) => h('span', { class: 'tok tok--sm' }, s))), h('span', { class: 'count' }, '×' + c)))));
      }
      root2.append(input, h('div', { class: 'mq-tools' }, hintBtn), hintEl, fb);

      hintBtn.addEventListener('click', () => {
        hintUsed = true;
        hintEl.textContent = 'Hint: ' + q.hint;
        hintEl.classList.remove('hidden');
        hintBtn.disabled = true;
      });

      function finish(revealed) {
        done = true;
        const points = M.questionPoints(attempts, hintUsed, revealed);
        store.setMasterQ(q.id, { points, done: true, attempts, hint: hintUsed });
        store.award('master.q.' + q.id, points);
        afterAnswer();
        showDone(points);
      }

      function showDone(points) {
        hintBtn.classList.add('hidden');
        pts.textContent = `+${points} XP`;
        pts.classList.remove('hidden');
        const explain = q.type === 'mc' ? q.options[q.correct].why : q.type === 'num' ? q.explain : null;
        fb.replaceChildren(callout('ok', h('div', null, explain ? h('p', null, rich(explain)) : null, q.type === 'multi' ? h('ul', { class: 'mq-why' }, q.options.map((o, i) => h('li', { 'data-ok': String(q.correctSet.includes(i)) }, icon(q.correctSet.includes(i) ? 'check' : 'x'), h('span', null, h('strong', null, o.text), ' — ', o.why)))) : null)));
        input.querySelectorAll('button, input').forEach((e) => (e.disabled = true));
      }

      // ---- the answer controls by type
      if (q.type === 'mc') {
        const group = h('div', { class: 'opts', role: 'group', 'aria-label': 'Answer options' });
        const els = q.options.map((o, i) => {
          const b = h('button', { type: 'button', class: 'opt' }, h('span', { class: 'opt__key', 'aria-hidden': 'true' }, KEYS[i]), h('span', null, rich(o.text)));
          b.addEventListener('click', () => {
            if (done || b.getAttribute('data-state') === 'wrong') return;
            attempts++;
            if (i === q.correct) {
              b.setAttribute('data-state', 'correct');
              b.querySelector('.opt__key').replaceChildren(icon('check'));
              finish(false);
              return;
            }
            b.setAttribute('data-state', 'wrong');
            b.querySelector('.opt__key').replaceChildren(icon('x'));
            if (attempts >= M.MAX_ATTEMPTS) {
              els[q.correct].setAttribute('data-state', 'correct');
              finish(true);
            } else fb.replaceChildren(callout('warn', h('p', null, h('strong', null, 'Not quite. '), rich(o.why), ` Attempt ${attempts} of ${M.MAX_ATTEMPTS}.`)));
          });
          return b;
        });
        els.forEach((b) => group.appendChild(b));
        input.appendChild(group);
        if (done) {
          els[q.correct].setAttribute('data-state', 'correct');
          showDone(rec.points);
        }
      } else if (q.type === 'num') {
        const id = TL.ui.nextId('mq');
        const field = h('input', { class: 'input input--num', id, type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'Your answer in ' + (q.unit || 'tokens'), 'aria-describedby': id + '-err', style: { maxWidth: '180px' } });
        const err = h('div', { class: 'field__err', id: id + '-err', role: 'status', 'aria-live': 'polite' });
        const check = h('button', { type: 'button', class: 'btn btn--primary' }, 'Check answer');
        const run = () => {
          if (done) return;
          const r = M.evaluate(q, field.value);
          if (r.invalid) {
            field.setAttribute('aria-invalid', 'true');
            err.textContent = r.error;
            return;
          }
          field.removeAttribute('aria-invalid');
          err.textContent = '';
          attempts++;
          if (r.correct) finish(false);
          else if (attempts >= M.MAX_ATTEMPTS) {
            field.value = String(q.answer);
            finish(true);
          } else fb.replaceChildren(callout('warn', h('p', null, h('strong', null, 'Not quite. '), `${r.value.toLocaleString('en-US')} is not the answer. Attempt ${attempts} of ${M.MAX_ATTEMPTS}. Re-read the question or use the hint.`)));
        };
        check.addEventListener('click', run);
        field.addEventListener('keydown', (e) => e.key === 'Enter' && run());
        input.append(h('div', { class: 'row' }, field, h('span', { class: 'muted' }, q.unit || 'tokens'), check), err);
        if (done) {
          field.value = String(q.answer);
          showDone(rec.points);
        }
      } else {
        const boxes = q.options.map((o, i) => {
          const cb = h('input', { type: 'checkbox', value: String(i) });
          return [cb, h('label', { class: 'sv-item' }, cb, h('span', { class: 'sv-item__body' }, h('span', { class: 'sv-item__text' }, o.text)))];
        });
        const check = h('button', { type: 'button', class: 'btn btn--primary' }, 'Check answer');
        check.addEventListener('click', () => {
          if (done) return;
          const chosen = boxes.map(([cb], i) => (cb.checked ? i : -1)).filter((i) => i >= 0);
          if (!chosen.length) {
            fb.replaceChildren(callout('info', 'Select at least one option first.'));
            return;
          }
          const r = M.evaluate(q, chosen);
          attempts++;
          if (r.correct) finish(false);
          else if (attempts >= M.MAX_ATTEMPTS) {
            boxes.forEach(([cb], i) => (cb.checked = q.correctSet.includes(i)));
            finish(true);
          } else fb.replaceChildren(callout('warn', h('p', null, h('strong', null, 'Not quite. '), `${r.wrong.length} of your picks should not be there and ${r.missed.length} correct fact${r.missed.length === 1 ? ' is' : 's are'} missing. Attempt ${attempts} of ${M.MAX_ATTEMPTS}.`)));
        });
        input.append(h('div', { class: 'sv-list', role: 'group', 'aria-label': 'Select all that apply' }, boxes.map((b) => b[1])), h('div', { style: { marginTop: 'var(--sp-3)' } }, check));
        if (done) {
          boxes.forEach(([cb], i) => (cb.checked = q.correctSet.includes(i)));
          showDone(rec.points);
        }
      }
      return root2;
    }

    // ---- level cards (built lazily, never rebuilt, so an answer in progress is never lost) ----
    function level(l) {
      const wrap = h('section', { class: 'mlevel', 'aria-label': `Level ${l.n}: ${l.name}` });
      const head = h('div', { class: 'mlevel__head' });
      const body = h('div', { class: 'stack' });
      wrap.append(head, body);
      wrappers[l.n] = { wrap, head, body, built: false, l };
      return wrap;
    }

    function refresh() {
      Object.values(wrappers).forEach((w) => {
        const l = w.l;
        const prog = M.levelProgress(master(), l.n);
        const isOpen = open(l.n);
        const state = !isOpen ? 'locked' : prog.complete ? 'complete' : 'open';
        w.wrap.setAttribute('data-state', state);
        w.head.replaceChildren(
          h('span', { class: 'mlevel__n' }, state === 'locked' ? icon('lock') : String(l.n)),
          h('div', { class: 'mlevel__title' }, h('strong', null, `Level ${l.n}: ${l.name}`), h('span', { class: 'muted small' }, l.blurb)),
          h('span', { class: 'tag' + (state === 'complete' ? ' tag--good' : state === 'locked' ? '' : ' tag--accent') }, state === 'locked' ? 'Locked' : state === 'complete' ? `Complete · ${prog.points}/${prog.max}` : `${prog.done} of ${prog.total} answered`)
        );
        if (!isOpen) {
          const prev = l.n - 1;
          const inThisPage = levelNums.includes(prev);
          const go = h('button', { type: 'button', class: 'btn btn--sm' }, inThisPage ? 'Answer level ' + prev : 'Go to Token Master I', icon('right'));
          go.addEventListener('click', () => (inThisPage ? wrappers[prev].wrap.scrollIntoView({ behavior: 'smooth', block: 'start' }) : ctx.go('master-1')));
          w.body.replaceChildren(callout('info', h('div', null, p(`Finish level ${prev} to unlock this level. (Instructor view unlocks every level for demonstrations.)`), go)));
          w.built = false;
        } else if (!w.built) {
          w.body.replaceChildren(...l.questions.map((q, i) => questionCard(q, B.questions.indexOf(q) + 1)));
          w.built = true;
        }
      });
      renderSummary();
    }

    function renderSummary() {
      const m = M.mastery(master());
      const answered = B.questions.filter((q) => (master().q || {})[q.id] && master().q[q.id].done).length;
      const lastLevel = levelNums[levelNums.length - 1];
      const levelsDone = levelNums.every((n) => M.levelProgress(master(), n).complete);
      if (!levelsDone) {
        summaryEl.replaceChildren();
        return;
      }
      if (lastLevel < 5) {
        const go = h('button', { type: 'button', class: 'btn btn--primary' }, 'Continue to the labs', icon('right'));
        go.addEventListener('click', () => ctx.go('lab-3'));
        summaryEl.replaceChildren(callout('ok', h('div', null, p(`**Levels ${levelNums.join(' and ')} complete.** Levels 3 to 5 unlock in Token Master II, near the end of the lesson. Keep your XP: so far ${answered} of ${B.questions.length} questions answered.`), go)));
        return;
      }
      const go = h('button', { type: 'button', class: 'btn btn--primary' }, m.complete ? 'See your completion screen' : 'Continue', icon('right'));
      go.addEventListener('click', () => ctx.go('summary'));
      summaryEl.replaceChildren(
        h(
          'section',
          { class: 'card mastery', 'data-tier': m.tier },
          h('div', { class: 'eyebrow' }, 'Token Master results'),
          m.complete ? h('div', { class: 'mastery__score' }, `${m.percent}%`) : h('div', { class: 'mastery__score' }, `${answered}/${B.questions.length}`),
          h('p', { class: 'lead', style: { margin: '0 auto var(--sp-3)' } }, m.complete ? `${m.tier}: ${m.points} of ${m.max} points.${m.earnedBadge ? ' You earned the Token Master badge.' : ` Reach ${M.MASTERY_BADGE_PERCENT}% to earn the Token Master badge: replaying can only raise your score.`}` : 'Finish levels 1 and 2 in Token Master I to complete the challenge.'),
          h('div', null, go)
        )
      );
    }

    // ---- page ------------------------------------------------------------------------------------
    B.levels.filter((l) => levelNums.includes(l.n)).forEach((l) => levelsEl.appendChild(level(l)));
    const practice = h('details', { class: 'disclosure' }, h('summary', null, `Optional extra practice: ${B.practice.length} more questions (not scored, not counted in the lesson time)`), h('div', { class: 'disclosure__body' }, TL.quiz.quiz({ id: 'practice', questions: B.practice, closing: (s, t) => `${s} of ${t} on the first try. Explanations are the point.` })));
    root.append(p(introText, 'muted'), levelsEl, summaryEl);
    if (levelNums.includes(5)) root.append(practice);
    const unsub = store.subscribe(() => refresh());
    ctx.onCleanup(unsub);
    refresh();
    return root;
  }

  const SCORING = 'Scoring: first try 10 XP, second 6, third or revealed 2; a hint costs 2. Levels unlock in order.';
  TL.sections['master-1'] = (ctx) => renderMaster(ctx, [1, 2], SCORING + ' “Work it out” answers come from the labs’ own engine.');
  TL.sections['master-2'] = (ctx) => renderMaster(ctx, [3, 4, 5], SCORING + ' Level 3 opens after Token Master I.');
})(typeof window !== 'undefined' ? window : globalThis);
