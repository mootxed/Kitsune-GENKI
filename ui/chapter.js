import { save, chState } from '../state/store.js';
import { refreshStreakDisplay } from './shared.js';
import { $, $$, todayStr } from '../src/utils.js';
import { allCards, dueCards } from '../src/srs-helpers.js';
import { XP_CHECK, XP_CHAPTER_FULL, addXP } from '../src/xp-system.js';
import { CONTENT_INDEX, getLesson, ensureLesson, startChapter, markActivity } from './home.js';
import { countAvailableCardsForSession } from '../src/srs-limits.js';
import { StudyPlan } from '../studyplan.js';
import {
  evaluateAndCompleteChapter,
  getChapterProgress,
  isGrammarTopicCompleted,
  isPracticeItemCompleted,
  isVocabularyBlockCompleted,
  isPriorKnowledge,
} from '../src/chapter-progress.js';
import {
  countRemainingLockedWords,
  getTodayVocabularyUnlockDecision,
  ensureTodayVocabularyBatch,
  getOldestIncompleteVocabularyBatch,
  getVocabularyBatchProgress,
  startVocabularyBatchSession,
} from '../src/vocabulary-unlock-plan.js';
import { ensureChapterVocabularyCards } from '../src/chapter-vocabulary.js';
import { completeGrammarTopicWithCheck, getGrammarTopicStatus } from '../src/grammar-plan.js';
import {
  canUnlockPracticeTask,
  completePracticeTask,
  undoPracticeTask,
} from '../src/practice-plan.js';
import { getOrGenerateDailyPlan } from '../src/daily-plan.js';

// ---------- Render: Chapter ----------
export async function renderChapter(id, state, dependencies) {
  // Лениво подгружаем контент главы перед отображением
  try {
    await ensureLesson(id);
  } catch (e) {
    console.error('Не удалось загрузить главу:', e);
  }
  const l = getLesson(id);
  const toast = dependencies?.toast || window.toast || (() => {});
  if (!l) {
    toast('Глава не найдена');
    window.nav('home');
    return;
  }

  const cs = chState(id);
  const progress = getChapterProgress(state, id, l);

  $('#chapter-title').textContent = `Глава ${id}: ${l.title}`;
  $('#chapter-jp').textContent = l.jp || '';

  const body = $('#chapter-body');
  const items = progress.totalCount;
  const done = progress.completedCount;
  const totalCards = allCards(state.srs, id, true).length;
  const unlockedCards = allCards(state.srs, id, false).length;
  const due = countAvailableCardsForSession(dueCards(state.srs, id), state.srs);

  const totalWords = Array.isArray(l.words) ? l.words.length : 0;
  const lockedWords = countRemainingLockedWords(state, id, l.words);
  const unlockedWords = Math.max(0, totalWords - lockedWords);

  const today = todayStr();

  let dailyPlan = getOrGenerateDailyPlan(state, {
    dateKey: today,
    activeChapterId: id,
    chapterMeta: l,
  });
  if (cs.started || progress.completionSource === 'app') {
    const plannedVocabulary = dailyPlan?.tasks.find(
      (task) => task.type === 'vocabulary' && task.batchDateKey === today
    );
    const batchRes = ensureTodayVocabularyBatch(state, id, {
      plan: state.studyPlan,
      dateKey: today,
      words: l.words,
      limit: plannedVocabulary?.count,
    });
    if (batchRes.created) {
      await save(true);
      getOrGenerateDailyPlan(state, {
        dateKey: today,
        activeChapterId: id,
        chapterMeta: l,
        forceRefresh: true,
      });
    }
  }

  const decision = getTodayVocabularyUnlockDecision(state, id, {
    plan: state.studyPlan,
    dateKey: today,
    words: l.words,
  });

  const todayUnlockEntry = state.vocabularyUnlocks?.[id]?.[today];
  const todayUnlockedCount = Array.isArray(todayUnlockEntry?.itemIds)
    ? todayUnlockEntry.itemIds.length
    : 0;

  const oldBatch = getOldestIncompleteVocabularyBatch(state, id, today);
  const todayBatchProgress = getVocabularyBatchProgress(state, id, today);
  const targetBatchDateKey = oldBatch ? oldBatch.dateKey : today;
  const hasBatchToStudy = Boolean(
    oldBatch || (todayBatchProgress.total > 0 && !todayBatchProgress.isCompleted)
  );
  const batchBtnText = oldBatch
    ? `Продолжить слова за ${oldBatch.dateKey} (${oldBatch.remaining} осталось)`
    : `Продолжить сегодняшние слова (${todayBatchProgress.completed}/${todayBatchProgress.total})`;

  const isPrior = isPriorKnowledge(state, id);

  let startBlock;
  if (isPrior) {
    const studyBtnText = due > 0 ? 'Повторять слова →' : 'Учить слова →';
    const hasCards = unlockedCards > 0 || totalCards > 0;
    startBlock = `<div class="card prior-knowledge-card">
         <div class="prior-knowledge-header">
           <span class="badge prior-knowledge-badge" data-testid="prior-knowledge-badge">📚 Изучено ранее</span>
           <p class="prior-knowledge-description">Вы отметили эту главу как изученную ранее</p>
         </div>
         <div class="prior-knowledge-stats">
           <div class="m"><b>${totalWords}</b><span>всего слов</span></div>
           <div class="m due"><b>${due}</b><span>доступно сейчас</span></div>
         </div>
         <div class="prior-knowledge-action">
           ${
             hasCards
               ? `<button class="btn-study-sm prior-knowledge-btn" id="ch-study" data-testid="chapter-study-btn">${studyBtnText}</button>`
               : `<button class="btn-study-sm prior-knowledge-btn" id="ch-reconcile-srs" data-testid="reconcile-srs-btn">Добавить слова в SRS</button>`
           }
         </div>
       </div>`;
  } else if (cs.started || progress.completionSource === 'app') {
    const wordStatusMsg =
      unlockedWords < totalWords
        ? `${unlockedWords} из ${totalWords} открыто (${lockedWords} будут добавляться постепенно)`
        : `Все ${totalWords} слов добавлены в обучение`;

    const targetLabel = decision.target > 0 ? decision.target : todayUnlockedCount;

    const warningHtml = decision.insufficientDays
      ? `<div class="warning-banner card-warning" style="margin-top:8px;padding:10px;background:rgba(255,152,0,0.1);border-left:3px solid var(--orange,#ff9800);font-size:12px;color:var(--ink,#333);text-align:left;">
          Чтобы завершить главу вовремя, требуется около ${decision.requiredDailyTarget} новых слов в день. Текущий безопасный максимум — 25. Пересчитайте план или продлите срок.
        </div>`
      : '';

    startBlock = `<div class="card srs-mini">
         <div class="m-row" style="display:flex;justify-content:space-around;text-align:center;margin-bottom:8px;">
           <div class="m"><b>${totalWords}</b><span>всего слов</span></div>
           <div class="m"><b>${unlockedWords}</b><span>открыто</span></div>
           <div class="m due"><b>${due}</b><span>к повтору</span></div>
         </div>
         <p class="muted" style="font-size:12px;text-align:center;margin:6px 0;">${wordStatusMsg}</p>
         ${
           targetLabel > 0
             ? `<p class="badge-today" style="font-size:12px;text-align:center;color:var(--orange);margin-bottom:8px;">Сегодня по плану: ${targetLabel} новых слов</p>`
             : ''
         }
         ${warningHtml}
         ${hasBatchToStudy ? `<button class="btn-primary" id="ch-batch-session" style="margin-bottom:8px;width:100%;" data-testid="chapter-batch-session-btn">${batchBtnText}</button>` : ''}
         <button class="btn-study-sm" id="ch-study" ${due === 0 ? 'disabled' : ''} data-testid="chapter-study-btn">Учить все →</button>
       </div>`;
  } else {
    startBlock = `<button class="btn-primary" id="ch-start" data-testid="start-chapter-btn">▶ Начать главу</button>
       <p class="muted" style="text-align:center;margin:10px 0 18px;font-size:13px">Слова и грамматика заблокированы до старта главы 🔒</p>`;
  }

  const rawCategories = Array.isArray(l.words) ? l.words.map((w) => w?.category) : [];
  const validCategories = [
    ...new Set(rawCategories.filter((c) => Boolean(c) && c !== 'undefined')),
  ].slice(0, 8);
  const tagsHtml =
    validCategories.length > 0
      ? validCategories.map((c) => `<span class="tag">${c}</span>`).join('')
      : '<span class="muted" style="font-size:13px">Темы не указаны</span>';

  const grammarTopics = progress.grammarTopics || [];
  const practiceTasks = progress.practiceTasks || [];

  const completedGrammarCount = grammarTopics.filter(
    (g) => isPriorKnowledge || isGrammarTopicCompleted(cs, g.id)
  ).length;
  const completedPracticeCount = practiceTasks.filter(
    (p) => isPriorKnowledge || isPracticeItemCompleted(cs, p.id)
  ).length;
  const isVocabDone = isVocabularyBlockCompleted(state, id, l);

  const vocabBlockStatusHtml = isVocabDone
    ? `<span class="badge" style="background:rgba(76,175,80,0.15);color:var(--green,#2e7d32);font-weight:600;">✓ Все слова встроены</span>`
    : `<span class="badge" style="background:rgba(255,152,0,0.15);color:var(--orange,#e65100);font-weight:600;">${unlockedWords}/${totalWords} открыто</span>`;

  const targetLabel = decision.target > 0 ? decision.target : todayUnlockedCount;

  body.innerHTML = `
    <div class="card">
      <div class="row-between"><span class="card-h" style="margin:0">Прогресс главы</span><b style="color:var(--orange)" data-testid="chapter-progress-text">${done}/${items}</b></div>
      <div class="prog-dash">
        ${Array.from({ length: items }, (_, i) => `<i class="segment ${i < done ? 'active' : ''}"></i>`).join('')}
      </div>
    </div>

    <!-- 1. Блок: Новые слова -->
    <details class="card progress-card-block" open style="margin-bottom:12px;">
      <summary class="row-between" style="cursor:pointer;list-style:none;">
        <h3 class="card-h" style="margin:0">1. Новые слова</h3>
        ${vocabBlockStatusHtml}
      </summary>
      <div style="margin-top:12px;">
        <div class="m-row" style="display:flex;justify-content:space-around;text-align:center;margin-bottom:8px;">
          <div class="m"><b>${totalWords}</b><span>всего</span></div>
          <div class="m"><b>${unlockedWords}</b><span>открыто</span></div>
          <div class="m"><b>${todayBatchProgress.completed}</b><span>в порции</span></div>
          <div class="m"><b>${lockedWords}</b><span>заблокировано</span></div>
        </div>
        ${targetLabel > 0 ? `<p class="badge-today" style="font-size:12px;text-align:center;color:var(--orange);margin:6px 0;">Дневная норма: ${targetLabel} новых слов</p>` : ''}
        ${startBlock}
      </div>
    </details>

    <!-- 2. Блок: Грамматика -->
    <details class="card progress-card-block" open style="margin-bottom:12px;">
      <summary class="row-between" style="cursor:pointer;list-style:none;">
        <h3 class="card-h" style="margin:0">2. Грамматика</h3>
        <span class="badge" style="background:rgba(33,150,243,0.15);color:var(--blue,#1976d2);font-weight:600;">${completedGrammarCount}/${grammarTopics.length} пройдено</span>
      </summary>
      <div style="margin-top:12px;">
        ${grammarTopics
          .map((g) => {
            const grammarStatus = isPriorKnowledge
              ? 'completed'
              : getGrammarTopicStatus(state, id, g.id, l);
            const checked = grammarStatus === 'completed';
            const locked = grammarStatus === 'locked';
            return `<div class="check-item ${checked ? 'done' : ''} ${locked ? 'locked' : ''}" data-kind="grammar" data-check="${g.id}" data-testid="check-${g.id}">
              <div class="checkbox">${checked ? '✓' : ''}</div>
              <div class="check-label-group">
                <span class="check-label">${g.title}</span>
                <small>${locked ? '🔒 Тема откроется после предыдущего шага' : checked ? 'Проверка пройдена' : 'Открыть объяснение и короткую проверку'}</small>
              </div>
            </div>`;
          })
          .join('')}
      </div>
    </details>

    <!-- 3. Блок: Практика -->
    <details class="card progress-card-block" open style="margin-bottom:12px;">
      <summary class="row-between" style="cursor:pointer;list-style:none;">
        <h3 class="card-h" style="margin:0">3. Практика</h3>
        <span class="badge" style="background:rgba(156,39,176,0.15);color:var(--purple,#7b1fa2);font-weight:600;">${completedPracticeCount}/${practiceTasks.length} выполнено</span>
      </summary>
      <div style="margin-top:12px;">
        ${practiceTasks
          .map((p) => {
            const checked = isPriorKnowledge || isPracticeItemCompleted(cs, p.id);
            const unlock = checked ? { canUnlock: true } : canUnlockPracticeTask(state, id, p, l);
            const locked = !unlock.canUnlock;
            const workbookMeta =
              p.type === 'workbook'
                ? `<small>${p.source || 'GENKI I Workbook'}${p.page ? ` · Стр. ${p.page}` : ''}${p.exercise ? ` · ${p.exercise}` : ''} · Около ${p.estimatedMinutes} минут</small>`
                : `<small>${p.description || 'Интерактивная практика'} · Около ${p.estimatedMinutes || 10} минут</small>`;
            return `<div class="check-item ${checked ? 'done' : ''} ${locked ? 'locked' : ''}" data-kind="practice" data-check="${p.id}" data-testid="check-${p.id}">
              <div class="checkbox">${checked ? '✓' : ''}</div>
              <div class="check-label-group">
                <span class="check-label">${p.title}</span>
                ${locked ? '<small>🔒 Задание откроется после связанной грамматики или предыдущего задания</small>' : workbookMeta}
              </div>
            </div>`;
          })
          .join('')}
      </div>
    </details>

    <div class="card">
      <h3 class="card-h">Ключевые темы</h3>
      <div class="tag-row">${tagsHtml}</div>
    </div>`;

  if ($('#ch-batch-session')) {
    $('#ch-batch-session').onclick = () => {
      startVocabularyBatchSession({
        state,
        chapterId: id,
        dateKey: targetBatchDateKey,
        startSession: dependencies?.startChapterFlashcards,
        toast,
      });
    };
  }

  if ($('#ch-study')) {
    $('#ch-study').onclick = () => {
      let chapterCards = dueCards(state.srs, id);
      if (chapterCards.length === 0) {
        chapterCards = allCards(state.srs, id);
      }
      if (chapterCards.length === 0) {
        toast('Нет карточек к повторению');
        return;
      }
      if (dependencies?.startChapterFlashcards) {
        dependencies.startChapterFlashcards(id, chapterCards);
      } else if (window.nav) {
        window.nav('srs');
      }
    };
  }

  if ($('#ch-reconcile-srs')) {
    $('#ch-reconcile-srs').onclick = async () => {
      try {
        const entry = await ensureLesson(id);
        if (entry && entry.lesson) {
          ensureChapterVocabularyCards(state, entry.lesson);
          await save(true);
          toast('Слова главы добавлены в SRS');
        }
      } catch {
        toast('Ошибка при загрузке карточек главы');
      }
      await renderChapter(id, state, dependencies);
    };
  }

  if ($('#ch-start')) {
    $('#ch-start').onclick = () => {
      startChapter(id, toast);
      renderChapter(id, state, dependencies);
      dependencies?.renderHome?.();
    };
  }

  $$('#chapter-body .check-item').forEach((el) => {
    el.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (isPriorKnowledge) return;
      const itemId = el.dataset.check;
      const chapters = CONTENT_INDEX.map((chapter) => (chapter.id === Number(id) ? l : chapter));

      if (el.dataset.kind === 'grammar') {
        const topic = grammarTopics.find((entry) => entry.id === itemId);
        const status = getGrammarTopicStatus(state, id, itemId, l);
        if (status === 'locked') {
          toast('🔒 Тема откроется после предыдущего шага');
          return;
        }
        if (status === 'completed') return;

        const checkResult = await openGrammarCheck(topic);
        const result = completeGrammarTopicWithCheck(state, id, itemId, checkResult);
        if (!result.completed) {
          toast('Проверка не пройдена. Можно повторить попытку.');
        } else {
          if (result.rewardGranted) addXP(XP_CHECK, state);
          toast('Грамматическая тема завершена');
        }
      } else if (el.dataset.kind === 'practice') {
        const task = practiceTasks.find((entry) => entry.id === itemId);
        const unlock = canUnlockPracticeTask(state, id, task, l);
        if (!unlock.canUnlock && !isPracticeItemCompleted(cs, itemId)) {
          toast('🔒 Сначала завершите предыдущий шаг');
          return;
        }

        if (isPracticeItemCompleted(cs, itemId)) {
          if (!window.confirm('Повторно открыть это задание?')) return;
          undoPracticeTask(state, id, itemId);
        } else {
          if (
            task.type === 'workbook' &&
            !window.confirm(
              'Отмечайте после самостоятельного выполнения упражнения в рабочей тетради.'
            )
          ) {
            return;
          }
          const result = completePracticeTask(state, id, itemId, {
            chapters,
            recalculatePlan: StudyPlan.recalculateFuturePlan,
          });
          if (result.rewardGranted) addXP(XP_CHECK, state);
          if (result.chapterCompletion?.rewardGranted) {
            addXP(XP_CHAPTER_FULL, state);
            toast(`🎉 Глава пройдена! +${XP_CHAPTER_FULL} XP!`);
          } else {
            toast('Практическое задание завершено');
          }
        }
      }

      const completion = evaluateAndCompleteChapter(state, id, {
        chapters,
        recalculatePlan: StudyPlan.recalculateFuturePlan,
      });
      if (completion.rewardGranted) {
        addXP(XP_CHAPTER_FULL, state);
        toast(`🎉 Глава пройдена! +${XP_CHAPTER_FULL} XP!`);
      }

      await save(true);
      markActivity(toast);
      refreshStreakDisplay();
      await renderChapter(id, state, dependencies);
      dependencies?.renderHome?.();
    };
  });
}

function generateGrammarQuizQuestions(topic) {
  const title = topic?.title || 'Грамматическая тема';
  let mainParticle = 'は';
  if (title.includes('の')) mainParticle = 'の';
  else if (title.includes('も')) mainParticle = 'も';
  else if (title.includes('か')) mainParticle = 'か';
  else if (title.includes('に')) mainParticle = 'に';
  else if (title.includes('で')) mainParticle = 'で';
  else if (title.includes('を')) mainParticle = 'を';

  return [
    {
      id: 'q1',
      title: '1. Конструкция темы',
      question: `Какой элемент лежит в основе темы «${title}»?`,
      options: [
        { text: `Частица / модель «${mainParticle}» в предложении`, correct: true },
        { text: 'Форма глагола на -て и союз から', correct: false },
        { text: 'Пассивный залог и условная форма -たら', correct: false },
      ],
    },
    {
      id: 'q2',
      title: '2. Частицы и связки',
      question: `Выберите правильную частицу/элемент для структуры «${title}»:`,
      options: [
        { text: mainParticle, correct: true },
        { text: mainParticle === 'は' ? 'に' : 'は', correct: false },
        { text: mainParticle === 'で' ? 'から' : 'で', correct: false },
      ],
    },
    {
      id: 'q3',
      title: '3. Структура предложения',
      question: 'Укажите верный порядок элементов в японском предложении:',
      options: [
        { text: 'Подлежащее + Частица + Сказуемое / Глагол в конце', correct: true },
        { text: 'Глагол в начале + Подлежащее + Дополнение', correct: false },
        { text: 'Прилагательное после глагола + Частица в начале', correct: false },
      ],
    },
  ];
}

function openGrammarCheck(topic) {
  return new Promise((resolve) => {
    const questions = generateGrammarQuizQuestions(topic);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay grammar-check-modal';
    overlay.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-label="Проверка грамматики" style="max-width:520px;max-height:90vh;overflow-y:auto;">
        <h2>${topic?.title || 'Грамматическая тема'}</h2>
        <div class="grammar-explanation" style="font-size:13px;line-height:1.5;margin-bottom:14px;padding:10px;background:rgba(0,0,0,0.03);border-radius:8px;">${topic?.content || 'Прочитайте объяснение темы и ответьте на мини-тест.'}</div>
        <h3 style="font-size:15px;margin-bottom:10px;">Проверочные задания (3 вопроса)</h3>
        <div class="grammar-quiz-container">
          ${questions
            .map(
              (q, qIdx) => `
            <div class="grammar-quiz-q" style="margin-bottom:14px;padding:10px;border:1px solid rgba(0,0,0,0.08);border-radius:8px;">
              <strong style="display:block;font-size:13px;margin-bottom:4px;">${q.title}</strong>
              <p style="font-size:13px;margin:0 0 8px;">${q.question}</p>
              ${q.options
                .map(
                  (opt, oIdx) => `
                <label style="display:flex;align-items:center;gap:6px;font-size:13px;margin-bottom:4px;cursor:pointer;">
                  <input type="radio" name="g_q_${qIdx}" value="${opt.correct ? 'correct' : 'wrong'}">
                  <span>${opt.text}</span>
                </label>
              `
                )
                .join('')}
            </div>
          `
            )
            .join('')}
        </div>
        <div class="modal-actions" style="margin-top:16px;">
          <button type="button" class="btn-secondary" data-cancel>Отмена</button>
          <button type="button" class="btn-primary" data-submit>Проверить ответы</button>
        </div>
      </div>`;

    const finish = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.querySelector('[data-cancel]').onclick = () =>
      finish({ passed: false, score: 0, canceled: true });

    overlay.querySelector('[data-submit]').onclick = () => {
      let correct = 0;
      for (let i = 0; i < questions.length; i++) {
        const selected = overlay.querySelector(`input[name="g_q_${i}"]:checked`);
        if (selected && selected.value === 'correct') {
          correct++;
        }
      }
      const score = Math.round((correct / questions.length) * 100);
      finish({ passed: score >= 67, score });
    };

    document.body.appendChild(overlay);
  });
}
