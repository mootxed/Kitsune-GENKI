import { save, chState } from '../state/store.js';
import { refreshStreakDisplay } from './shared.js';
import { $, $$, todayStr } from '../src/utils.js';
import { allCards, dueCards } from '../src/srs-helpers.js';
import { XP_CHECK, XP_CHAPTER_FULL, addXP } from '../src/xp-system.js';
import {
  CONTENT_INDEX,
  getLesson,
  ensureLesson,
  startChapter,
  markActivity,
  switchCourseRuntime,
} from './home.js';
import { countAvailableCardsForSession } from '../src/srs-limits.js';
import { StudyPlan } from '../studyplan.js';
import {
  evaluateAndCompleteChapter,
  getChapterProgress,
  getChapterProgressSnapshot,
  isGrammarTopicCompleted,
  isPracticeItemCompleted,
  isVocabularyBlockCompleted,
  isPriorKnowledge,
  materializeLegacyChapterEvidence,
} from '../src/chapter-progress.js';
import { sameLessonId } from '../src/courses/course-context.js';
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
import { isPracticeTaskEnabled } from '../src/practice-tasks.js';
import { getOrGenerateDailyPlan } from '../src/daily-plan.js';
import { openGrammarLesson } from './grammar-lesson.js';
import { resolveGrammarTopicId } from '../src/dictionary/dictionary-relations-index.js';

// ---------- Render: Chapter ----------
export async function renderChapter(id, state, dependencies, context = {}, options = {}) {
  const opts =
    options && typeof options === 'object' && Object.keys(options).length > 0
      ? options
      : context && typeof context === 'object' && !context.signal
        ? context
        : {};
  const { signal } = context && context.signal ? context : {};

  // Safely handle cross-course navigation
  if (opts.courseId && state?.activeCourseId && opts.courseId !== state.activeCourseId) {
    try {
      await switchCourseRuntime(opts.courseId);
    } catch (err) {
      console.warn('[Chapter] Could not switch course runtime:', err);
    }
  }

  // Лениво подгружаем контент главы перед отображением
  try {
    await ensureLesson(id);
  } catch (e) {
    console.error('Не удалось загрузить главу:', e);
  }
  if (signal?.aborted) return;

  const l = getLesson(id);
  const toast = dependencies?.toast || window.toast || (() => {});
  if (!l) {
    // Не уводить пользователя, если навигация уже устарела
    if (!signal?.aborted) {
      toast('Глава не найдена');
      window.nav('home');
    }
    return;
  }

  const cs = chState(id);
  const migration = materializeLegacyChapterEvidence(cs, l);
  if (migration?.changed) {
    await save(true);
    if (signal?.aborted) return;
  }
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
      if (signal?.aborted) return;
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

  const snapshot = getChapterProgressSnapshot(state, id, l);

  const rawCategories = Array.isArray(l.words) ? l.words.map((w) => w?.category) : [];
  const validCategories = [
    ...new Set(rawCategories.filter((c) => Boolean(c) && c !== 'undefined')),
  ].slice(0, 8);
  const tagsHtml =
    validCategories.length > 0
      ? validCategories.map((c) => `<span class="tag">${c}</span>`).join('')
      : '<span class="muted" style="font-size:13px">Темы не указаны</span>';

  const grammarTopics = progress.grammarTopics || [];
  const allPracticeTasks = progress.practiceTasks || [];
  const practiceTasks = allPracticeTasks.filter((p) =>
    isPracticeTaskEnabled(p, state?.workbookSettings)
  );

  const activeDailyType = dailyPlan?.tasks?.[0]?.type;
  const openGrammar = activeDailyType === 'grammar';
  const openPractice = activeDailyType === 'practice';
  const openVocab = !openGrammar && !openPractice;

  const isVocabDone = isVocabularyBlockCompleted(state, id, l);
  const vocabBlockStatusHtml = isVocabDone
    ? `<span class="badge" style="background:rgba(76,175,80,0.15);color:var(--green,#2e7d32);font-weight:600;">✓ Все слова встроены</span>`
    : `<span class="badge" style="background:rgba(255,152,0,0.15);color:var(--orange,#e65100);font-weight:600;">Слова ${snapshot.vocabulary.completed}/${snapshot.vocabulary.total} изучено</span>`;

  const targetLabel = decision.target > 0 ? decision.target : todayUnlockedCount;

  const warningHtml = decision.insufficientDays
    ? `<div class="warning-banner card-warning" style="margin-top:8px;padding:10px;background:rgba(255,152,0,0.1);border-left:3px solid var(--orange,#ff9800);font-size:12px;color:var(--ink,#333);text-align:left;">
        Чтобы завершить главу вовремя, требуется около ${decision.requiredDailyTarget} новых слов в день. Текущий безопасный максимум — 25. Пересчитайте план или продлите срок.
      </div>`
    : '';

  const wbDisabledNotice =
    state?.workbookSettings?.enabled === false
      ? `<p class="muted" style="font-size:12px;margin:4px 0 8px;color:var(--muted,#888);">Задания Workbook отключены в Плане обучения.</p>`
      : '';

  if (signal?.aborted) return;

  body.innerHTML = `
    <!-- Верхний прогресс главы (3 блока сводки) -->
    <div class="card">
      <div class="row-between" style="margin-bottom:8px;">
        <span class="card-h" style="margin:0">Прогресс главы</span>
        <b style="color:var(--orange)" data-testid="chapter-progress-text">${snapshot.isCompleted ? 100 : Math.round(snapshot.overallRatio * 100)}%</b>
      </div>
      <div class="chapter-summary-3blocks" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center;font-size:12px;">
        <div style="background:rgba(255,122,26,0.08);padding:8px;border-radius:8px;">
          <span style="display:block;color:var(--muted,#666);margin-bottom:2px;">Слова</span>
          <b>${snapshot.vocabulary.completed}/${snapshot.vocabulary.total}</b>
        </div>
        <div style="background:rgba(33,150,243,0.08);padding:8px;border-radius:8px;">
          <span style="display:block;color:var(--muted,#666);margin-bottom:2px;">Грамматика</span>
          <b>${snapshot.grammar.completed}/${snapshot.grammar.total}</b>
        </div>
        <div style="background:rgba(156,39,176,0.08);padding:8px;border-radius:8px;">
          <span style="display:block;color:var(--muted,#666);margin-bottom:2px;">Практика</span>
          <b>${snapshot.practice.completed}/${snapshot.practice.required}</b>
        </div>
      </div>
    </div>

    <!-- 1. Блок: Новые слова -->
    ${isPrior ? startBlock : ''}
    <details class="card progress-card-block" ${openVocab ? 'open' : ''} style="margin-bottom:12px;">
      <summary class="row-between" style="cursor:pointer;list-style:none;">
        <h3 class="card-h" style="margin:0">1. Новые слова</h3>
        ${vocabBlockStatusHtml}
      </summary>
      <div class="vocab-progress-panel" style="margin-top:12px;">
        <div class="vocab-metrics-grid">
          <div class="vocab-metric">
            <b>Изучено: ${snapshot.vocabulary.completed} из ${snapshot.vocabulary.total}</b>
          </div>
          <div class="vocab-metric">
            <b>Открыто: ${snapshot.vocabulary.unlocked} из ${snapshot.vocabulary.total}</b>
          </div>
          <div class="vocab-metric">
            <b>Пока закрыто: ${snapshot.vocabulary.locked}</b>
          </div>
        </div>
        ${targetLabel > 0 ? `<p class="badge-today" style="font-size:12px;text-align:center;color:var(--orange);margin:8px 0;">Дневная норма: ${targetLabel} новых слов</p>` : ''}
        ${warningHtml}
        <div class="vocab-progress-actions" style="margin-top:10px;">
          ${
            cs.started || progress.completionSource === 'app' || isPrior
              ? `
                ${hasBatchToStudy ? `<button class="btn-primary vocab-primary-action" id="ch-batch-session" style="width:100%;margin-bottom:6px;" data-testid="chapter-batch-session-btn">${batchBtnText}</button>` : ''}
                ${due > 0 ? `<button class="btn-study-sm vocab-primary-action" id="ch-study" style="width:100%;" data-testid="chapter-study-btn">Повторить ${due} карточек</button>` : ''}
                `
              : `<button class="btn-primary vocab-primary-action" id="ch-start" style="width:100%;" data-testid="start-chapter-btn">▶ Начать главу</button>
                 <p class="muted" style="text-align:center;margin:10px 0 6px;font-size:13px">Слова и грамматика заблокированы до старта главы 🔒</p>`
          }
        </div>
      </div>
    </details>

    <!-- 2. Блок: Грамматика -->
    <details class="card progress-card-block" ${openGrammar ? 'open' : ''} style="margin-bottom:12px;">
      <summary class="row-between" style="cursor:pointer;list-style:none;">
        <h3 class="card-h" style="margin:0">2. Грамматика</h3>
        <span class="badge" style="background:rgba(33,150,243,0.15);color:var(--blue,#1976d2);font-weight:600;">${snapshot.grammar.completed}/${snapshot.grammar.total} пройдено</span>
      </summary>
      <div style="margin-top:12px;">
        ${grammarTopics
          .map((g, idx) => {
            const grammarStatus = isPrior ? 'completed' : getGrammarTopicStatus(state, id, g.id, l);
            const checked = grammarStatus === 'completed';
            const locked = grammarStatus === 'locked';
            const hiddenClass = idx >= 4 ? 'grammar-extra-item hidden' : '';
            return `<div class="check-item ${checked ? 'done' : ''} ${locked ? 'locked' : ''} ${hiddenClass}" data-kind="grammar" data-check="${g.id}" data-testid="check-${g.id}">
              <div class="checkbox">${checked ? '✓' : ''}</div>
              <div class="check-label-group">
                <span class="check-label">${g.title}</span>
                <small>${locked ? '🔒 Тема откроется после предыдущего шага' : checked ? 'Проверка пройдена' : 'Открыть объяснение и короткую проверку'}</small>
              </div>
            </div>`;
          })
          .join('')}
        ${
          grammarTopics.length > 4
            ? `<button class="btn-sm btn-outline" id="toggle-grammar-topics" style="width:100%;margin-top:8px;">Показать все темы (${grammarTopics.length})</button>`
            : ''
        }
      </div>
    </details>

    <!-- 3. Блок: Практика -->
    <details class="card progress-card-block" ${openPractice ? 'open' : ''} style="margin-bottom:12px;">
      <summary class="row-between" style="cursor:pointer;list-style:none;">
        <h3 class="card-h" style="margin:0">3. Практика</h3>
        <span class="badge" style="background:rgba(156,39,176,0.15);color:var(--purple,#7b1fa2);font-weight:600;">${snapshot.practice.completed}/${snapshot.practice.required} выполнено</span>
      </summary>
      <div style="margin-top:12px;">
        ${wbDisabledNotice}
        ${practiceTasks
          .map((p, idx) => {
            const checked = isPrior || isPracticeItemCompleted(cs, p.id);
            const unlock = checked ? { canUnlock: true } : canUnlockPracticeTask(state, id, p, l);
            const locked = !unlock.canUnlock;
            const hiddenClass = idx >= 4 ? 'practice-extra-item hidden' : '';
            const workbookMeta =
              p.type === 'workbook'
                ? `<small>${p.source || 'GENKI I Workbook'}${p.page ? ` · Стр. ${p.page}` : ''}${p.exercise ? ` · ${p.exercise}` : ''} · Около ${p.estimatedMinutes} минут</small>`
                : `<small>${p.description || 'Интерактивная практика'} · Около ${p.estimatedMinutes || 10} минут</small>`;
            return `<div class="check-item ${checked ? 'done' : ''} ${locked ? 'locked' : ''} ${hiddenClass}" data-kind="practice" data-check="${p.id}" data-testid="check-${p.id}">
              <div class="checkbox">${checked ? '✓' : ''}</div>
              <div class="check-label-group">
                <span class="check-label">${p.title}</span>
                ${locked ? '<small>🔒 Задание откроется после связанной грамматики или предыдущего задания</small>' : workbookMeta}
              </div>
            </div>`;
          })
          .join('')}
        ${
          practiceTasks.length > 4
            ? `<button class="btn-sm btn-outline" id="toggle-practice-tasks" style="width:100%;margin-top:8px;">Показать все задания (${practiceTasks.length})</button>`
            : ''
        }
      </div>
    </details>

    <div class="card">
      <h3 class="card-h">Ключевые темы</h3>
      <div class="tag-row">${tagsHtml}</div>
    </div>`;

  const btnGrammarToggle = $('#toggle-grammar-topics');
  if (btnGrammarToggle) {
    btnGrammarToggle.onclick = () => {
      const extras = $$('.grammar-extra-item');
      const isHidden = extras[0]?.classList.contains('hidden');
      extras.forEach((el) => el.classList.toggle('hidden', !isHidden));
      btnGrammarToggle.textContent = isHidden
        ? 'Скрыть дополнительные темы'
        : `Показать все темы (${grammarTopics.length})`;
    };
  }

  const btnPracticeToggle = $('#toggle-practice-tasks');
  if (btnPracticeToggle) {
    btnPracticeToggle.onclick = () => {
      const extras = $$('.practice-extra-item');
      const isHidden = extras[0]?.classList.contains('hidden');
      extras.forEach((el) => el.classList.toggle('hidden', !isHidden));
      btnPracticeToggle.textContent = isHidden
        ? 'Скрыть дополнительные задания'
        : `Показать все задания (${practiceTasks.length})`;
    };
  }

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

      if (isPrior) return;
      const itemId = el.dataset.check;
      const chapters = CONTENT_INDEX.map((chapter) => (sameLessonId(chapter.id, id) ? l : chapter));

      if (el.dataset.kind === 'grammar') {
        const topic = grammarTopics.find((entry) => entry.id === itemId);
        const status = getGrammarTopicStatus(state, id, itemId, l);
        if (status === 'locked') {
          toast('🔒 Тема откроется после предыдущего шага');
          return;
        }
        if (status === 'completed') return;

        const checkResult = await openGrammarLesson({
          state,
          chapterId: id,
          topic,
        });
        if (checkResult.canceled) return;

        const result = completeGrammarTopicWithCheck(state, id, itemId, checkResult, {
          chapterMeta: l,
        });
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

  const focusGrammarId = opts.focusGrammarId || opts.grammarId;
  if (focusGrammarId) {
    setTimeout(() => {
      const resolvedTopicId = resolveGrammarTopicId(focusGrammarId);
      const safeGrammarId =
        typeof window !== 'undefined' && window.CSS && typeof window.CSS.escape === 'function'
          ? window.CSS.escape(String(focusGrammarId))
          : String(focusGrammarId);
      const safeTopicId =
        resolvedTopicId &&
        typeof window !== 'undefined' &&
        window.CSS &&
        typeof window.CSS.escape === 'function'
          ? window.CSS.escape(String(resolvedTopicId))
          : String(resolvedTopicId || '');

      const targetEl =
        (safeTopicId && document.querySelector(`[data-check="${safeTopicId}"]`)) ||
        (safeTopicId && document.querySelector(`[data-grammar-id="${safeTopicId}"]`)) ||
        document.querySelector(`[data-check="${safeGrammarId}"]`) ||
        document.querySelector(`[data-grammar-id="${safeGrammarId}"]`);
      if (targetEl) {
        const parentSection = targetEl.closest('.card, .collapsible-section');
        const toggleBtn = parentSection?.querySelector('#toggle-grammar-topics');
        if (toggleBtn) {
          const extras = parentSection.querySelectorAll('.grammar-extra-item');
          extras.forEach((item) => item.classList.remove('hidden'));
          toggleBtn.textContent = 'Свернуть темы';
        }
        if (typeof targetEl.scrollIntoView === 'function') {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        targetEl.classList.add('grammar-focus-highlight');
        setTimeout(() => targetEl.classList.remove('grammar-focus-highlight'), 3000);
      }
    }, 100);
  }
}
