/**
 * quiz.js - formative-assessment engine.
 *
 * Behaviour (designed for learning, not just scoring):
 *  - Options are BUTTONS, not radios, so keyboard users can move between
 *    options without accidentally committing to an answer.
 *  - A wrong pick explains why THAT option is wrong, then lets the learner try
 *    again. After two wrong picks the correct answer is revealed with its
 *    explanation, so nobody leaves the question confused.
 *  - Score counts first-try correct answers only.
 */
(function (g) {
  'use strict';
  const TL = (g.TokenLab = g.TokenLab || {});
  const { h, icon, rich, announce } = TL.dom;
  const { callout } = TL.ui;

  const KEYS = ['A', 'B', 'C', 'D', 'E'];

  /**
   * One question card.
   * @returns {{el:HTMLElement, state:()=>object}}
   *  onDone({firstTry:boolean}) fires once, when the learner reaches the answer.
   */
  function question(q, { number, label, onDone }) {
    let attempts = 0;
    let done = false;
    const optEls = [];
    const fb = h('div', { class: 'qcard__fb', 'aria-live': 'polite' });
    const stemId = TL.ui.nextId('stem');
    const group = h('div', { class: 'opts', role: 'group', 'aria-labelledby': stemId });

    function lockAll(correctIdx) {
      done = true;
      optEls.forEach((el, i) => {
        el.setAttribute('data-locked', 'true');
        el.setAttribute('aria-disabled', 'true');
        if (i === correctIdx) {
          el.setAttribute('data-state', 'correct');
          el.querySelector('.opt__key').replaceChildren(icon('check'));
        } else if (el.getAttribute('data-state') !== 'wrong') {
          el.setAttribute('data-state', 'dim');
        }
      });
    }

    function pick(i) {
      if (done) return;
      const el = optEls[i];
      if (el.getAttribute('data-state') === 'wrong') return;
      attempts++;
      const isRight = i === q.correct;
      if (isRight) {
        lockAll(q.correct);
        fb.replaceChildren(callout('ok', h('p', null, h('strong', null, attempts === 1 ? 'Correct. ' : 'Got it. '), rich(q.options[i].why))));
        announce('Correct. ' + q.options[i].why);
        onDone && onDone({ firstTry: attempts === 1 });
        return;
      }
      el.setAttribute('data-state', 'wrong');
      el.querySelector('.opt__key').replaceChildren(icon('x'));
      el.setAttribute('aria-disabled', 'true');
      if (attempts >= 2) {
        lockAll(q.correct);
        fb.replaceChildren(
          callout('bad', h('p', null, h('strong', null, 'Not quite. '), rich(q.options[i].why))),
          callout('info', h('p', null, h('strong', null, 'The answer: '), rich(q.options[q.correct].text), h('br'), rich(q.options[q.correct].why)))
        );
        announce('Not quite. The correct answer is ' + q.options[q.correct].text);
        onDone && onDone({ firstTry: false });
      } else {
        fb.replaceChildren(callout('warn', h('p', null, h('strong', null, 'Not quite. '), rich(q.options[i].why), ' Try another option.')));
        announce('Not quite. Try another option.');
      }
    }

    q.options.forEach((o, i) => {
      const btn = h('button', { type: 'button', class: 'opt', 'aria-describedby': null }, h('span', { class: 'opt__key', 'aria-hidden': 'true' }, KEYS[i]), h('span', null, rich(o.text)));
      btn.addEventListener('click', () => pick(i));
      optEls.push(btn);
      group.appendChild(btn);
    });

    const el = h(
      'article',
      { class: 'qcard', 'data-qid': q.id },
      number != null ? h('div', { class: 'qcard__num' }, label ? label : 'Question ' + number) : null,
      h('p', { class: 'qcard__stem', id: stemId }, q.stem),
      group,
      fb
    );
    return { el, state: () => ({ attempts, done }) };
  }

  /**
   * A scored set of questions with progress dots and a summary.
   * opts: {id, questions, store, closing:(score,total)=>string}
   */
  function quiz({ id, questions, closing }) {
    const store = TL.store;
    let results = [];
    const root = h('div', { class: 'quiz' });

    function build() {
      results = [];
      const dots = questions.map(() => h('span', { class: 'dot', 'data-state': 'idle' }));
      const counter = h('span', { class: 'tabular' }, `0 of ${questions.length} answered`);
      const bar = h('div', { class: 'quiz__bar' }, h('span', { class: 'dots', 'aria-hidden': 'true' }, dots), counter);
      const list = h('div', { class: 'stack' });
      const summary = h('div', { 'aria-live': 'polite' });

      questions.forEach((q, i) => {
        const card = question(q, {
          number: i + 1,
          onDone: ({ firstTry }) => {
            results[i] = firstTry;
            dots[i].setAttribute('data-state', firstTry ? 'good' : 'retry');
            const n = results.filter((r) => r !== undefined).length;
            counter.textContent = `${n} of ${questions.length} answered`;
            if (n === questions.length) finish();
          },
        });
        list.appendChild(card.el);
      });

      function finish() {
        const score = results.filter(Boolean).length;
        store.setQuiz(id, score, questions.length);
        const again = h('button', { type: 'button', class: 'btn' }, icon('reset'), 'Try the questions again');
        again.addEventListener('click', () => {
          root.replaceChildren();
          build();
          root.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        summary.replaceChildren(
          h(
            'div',
            { class: 'card quiz__summary' },
            h('div', { class: 'quiz__score' }, `${score}/${questions.length}`),
            h('p', { class: 'lead', style: { margin: '0 auto var(--sp-4)' } }, closing(score, questions.length)),
            h('p', { class: 'muted small' }, 'Score counts first-try answers. The explanations are the point: re-read any you missed.'),
            again
          )
        );
        announce(`You scored ${score} out of ${questions.length}.`);
      }

      root.append(bar, list, summary);
    }

    build();
    return root;
  }

  TL.quiz = { question, quiz };
  if (typeof module !== 'undefined' && module.exports) module.exports = TL.quiz;
})(typeof window !== 'undefined' ? window : globalThis);
