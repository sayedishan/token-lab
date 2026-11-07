/**
 * Section 11 - Completion and takeaways (1 min)
 * The final completion screen. It UNLOCKS when all five Token Master levels are
 * answered (Instructor view opens it for demonstrations).
 */
(function (g) {
  'use strict';
  const TL = g.TokenLab;
  TL.sections = TL.sections || {};

  TL.sections.summary = function render(ctx) {
    const { h, p, rich, icon } = TL.dom;
    const { callout } = TL.ui;
    const R = TL.realTokens;
    const G = TL.gam;
    const M = TL.master;
    const store = TL.store;
    const B = M.build();

    const st = store.get();
    const mastery = M.mastery(st.master);
    const answered = B.questions.filter((q) => st.master.q[q.id] && st.master.q[q.id].done).length;

    // ---- locked: the completion screen has to be earned -------------------------------------------
    if (!mastery.complete && !st.instructor) {
      const go = (id, label) => {
        const b = h('button', { type: 'button', class: 'btn' + (id === 'master-1' ? ' btn--primary' : '') }, label, icon('right'));
        b.addEventListener('click', () => ctx.go(id));
        return b;
      };
      return h(
        'div',
        { class: 'stack' },
        h('section', { class: 'card lockcard' }, h('div', { class: 'lockcard__ico' }, icon('lock')), h('h2', null, 'Completion screen locked'), p(`Finish the Token Master challenge to unlock it. You have answered **${answered} of ${B.questions.length}** questions.`), h('div', { class: 'meter', role: 'progressbar', 'aria-label': 'Token Master questions answered', 'aria-valuemin': '0', 'aria-valuemax': String(B.questions.length), 'aria-valuenow': String(answered) }, h('span', { style: { width: (answered / B.questions.length) * 100 + '%' } })), h('div', { class: 'row' }, go('master-1', 'Token Master I (levels 1-2)'), go('master-2', 'Token Master II (levels 3-5)')), p('Facilitators: switch on Instructor view (top bar) to preview this screen.', 'muted small'))
      );
    }

    const xp = G.totalXP(st.progress);
    const lv = G.level(xp);
    const badges = G.badges(st.progress);
    const takeaways = [
      'A **token** is a piece of text from a fixed vocabulary; the model reads token IDs, not words.',
      '**BPE** builds a vocabulary by merging the most frequent neighbouring pair, again and again.',
      '**Token counts depend on the text and the tokenizer:** typos, numbers, code and other scripts can cost more.',
      'The **context window** is one shared budget: system prompt, history, documents, new message and the reserved reply.',
      'Chats **resend history**, so cost grows quickly. Every memory policy forgets something: **pin what matters, never store secrets**.',
      'Rules of thumb are for planning; **billing-grade numbers come from the real tokenizer.**',
    ];

    // XP by area (earned vs possible), computed from the same rules that award it
    const areas = ['Start', 'Lab 1', 'Lab 2', 'Lab 3', 'Lab 4', 'Token Master', 'Extension'];
    const areaOf = (id) => (id.indexOf('master.') === 0 ? 'Token Master' : (G.RULES.find((r) => r.id === id) || {}).group);
    const earned = {};
    Object.keys(st.progress.xp).forEach((id) => (earned[areaOf(id)] = (earned[areaOf(id)] || 0) + st.progress.xp[id]));
    const possible = {};
    G.RULES.forEach((r) => (possible[r.group] = (possible[r.group] || 0) + (r.max || r.xp)));
    possible['Token Master'] = (possible['Token Master'] || 0) + G.MASTER_XP;

    const extBtn = h('button', { type: 'button', class: 'btn btn--primary' }, 'Try the optional extension', icon('right'));
    extBtn.addEventListener('click', () => ctx.go('challenge'));
    const resetBtn = h('button', { type: 'button', class: 'btn' }, icon('reset'), 'Reset my progress');
    resetBtn.addEventListener('click', () => {
      if (window.confirm('Clear your saved progress, XP, badges and scores on this device?')) {
        store.reset();
        ctx.go('start');
      }
    });

    const refs = [
      ['Sennrich, R., Haddow, B., Birch, A. (2016). *Neural Machine Translation of Rare Words with Subword Units.* ACL 2016.', 'https://arxiv.org/abs/1508.07909', 'Byte-Pair Encoding for subword vocabularies (Lab 2).'],
      ['Kudo, T., Richardson, J. (2018). *SentencePiece: A simple and language independent subword tokenizer and detokenizer for Neural Text Processing.* EMNLP 2018 (demo).', 'https://arxiv.org/abs/1808.06226', 'The ▁ word-start marker; the Unigram model.'],
      ['Liu, N. F. et al. (2023). *Lost in the Middle: How Language Models Use Long Contexts.* Transactions of the ACL.', 'https://arxiv.org/abs/2307.03172', 'Models use the start and end of a long context better than the middle (Lab 3).'],
      ['Petrov, A., La Malfa, E., Torr, P. H. S., Bibi, A. (2023). *Language Model Tokenizers Introduce Unfairness Between Languages.* NeurIPS 2023.', 'https://arxiv.org/abs/2305.15425', 'Token counts for the same text differ widely across languages (Lab 1).'],
      ['Ahia, O. et al. (2023). *Do All Languages Cost the Same? Tokenization in the Era of Commercial Language Models.* arXiv preprint.', 'https://arxiv.org/abs/2305.13707', 'What unequal token counts mean for API pricing (Lab 1).'],
      ['OpenAI Help Center. *What are tokens and how to count them?* (rule of thumb of about 4 characters or ¾ of a word per token for English).', 'https://help.openai.com/en/articles/4936856-what-are-tokens-and-how-to-count-them', 'The characters ÷ 4 estimate (Lab 1).'],
      ['OpenAI. *tiktoken* (open-source tokenizer library). Used to record the real tokenizer outputs shown in Lab 1.', 'https://github.com/openai/tiktoken', `Recorded with ${R.recordedWith} on ${R.recordedOn}.`],
    ];

    return h(
      'div',
      { class: 'stack' },
      h(
        'section',
        { class: 'card complete', 'data-tier': mastery.tier },
        h('div', { class: 'eyebrow' }, 'Lesson complete'),
        h('h2', null, mastery.complete ? `${mastery.tier}: ${mastery.percent}% mastery` : 'Preview of the completion screen'),
        h('p', { class: 'lead', style: { margin: '0 auto var(--sp-4)' } }, mastery.complete ? `You answered all ${B.questions.length} Token Master questions for ${mastery.points} of ${mastery.max} points.${mastery.earnedBadge ? '' : ' Replay a level to raise your score: only improvements count.'}` : 'Instructor preview: the learner has not finished the Token Master challenge yet.'),
        h('div', { class: 'complete__stats' }, h('div', { class: 'stat stat--accent' }, h('div', { class: 'stat__label' }, 'Level'), h('div', { class: 'stat__value' }, `${lv.n} · ${lv.name}`)), h('div', { class: 'stat' }, h('div', { class: 'stat__label' }, 'Experience'), h('div', { class: 'stat__value' }, xp + ' XP'), h('div', { class: 'stat__note' }, `of ${G.MAX_REQUIRED_XP} in the timed lesson`)), h('div', { class: 'stat' }, h('div', { class: 'stat__label' }, 'Badges'), h('div', { class: 'stat__value' }, `${badges.filter((b) => b.unlocked).length} of ${badges.length}`))),
        G.badges(st.progress).length ? h('ul', { class: 'badge-row badge-row--center', 'aria-label': 'Badges' }, badges.map((b) => h('li', { class: 'badge-pill', 'data-unlocked': String(b.unlocked) }, icon(b.unlocked ? b.icon : 'lock'), h('span', null, b.name), h('span', { class: 'sr-only' }, b.unlocked ? ' (unlocked)' : ' (locked)')))) : null
      ),
      h('h2', null, 'Where your XP came from'),
      h('div', { class: 'tablewrap' }, h('table', null, h('thead', null, h('tr', null, [h('th', { scope: 'col' }, 'Area'), h('th', { class: 'num', scope: 'col' }, 'XP earned'), h('th', { class: 'num', scope: 'col' }, 'Possible')])), h('tbody', null, areas.map((a) => h('tr', null, h('th', { scope: 'row' }, a), h('td', { class: 'num' }, String(earned[a] || 0)), h('td', { class: 'num' }, String(possible[a] || 0))))))),
      p('XP is earned by doing, never by visiting a page. Replaying only raises a score.', 'muted small'),
      h('h2', null, 'Six things to remember'),
      h('ul', { class: 'takeaways card' }, takeaways.map((t) => h('li', null, icon('check'), h('span', null, rich(t))))),
      callout('info', rich('**Where next:** chunking, embeddings and retrieval all decide what goes inside a token budget.')),
      h('div', { class: 'row' }, extBtn, resetBtn),
      p('The extension is optional and not part of the 45 minutes: repair a failing bot, then write and test `trimToFit()`.', 'muted small'),
      p('Progress is saved only in this browser (localStorage). Nothing is sent anywhere.', 'muted small'),
      h('h2', null, 'References and acknowledgements'),
      h('ol', { class: 'refs' }, refs.map(([t, url, note]) => h('li', null, rich(t.replace(/\*([^*]+)\*/g, '$1')), ' ', h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, url.replace(/^https?:\/\//, '')), h('br'), h('span', { class: 'muted' }, note)))),
      p('Fonts: Inter and JetBrains Mono (SIL OFL 1.1, licences in assets/fonts). All text, examples, corpus and code were written for this lesson.', 'muted small')
    );
  };
})(typeof window !== 'undefined' ? window : globalThis);
