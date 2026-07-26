import { save, chState } from '../state/store.js';
import { refreshStreakDisplay } from './shared.js';
import { $, $$, todayStr } from '../src/utils.js';
import { allCards, dueCards } from '../src/srs-helpers.js';
import { XP_CHECK, XP_CHAPTER_FULL, addXP } from '../src/xp-system.js';
import {
  CHECK_ITEMS,
  CONTENT_INDEX,
  getLesson,
  ensureLesson,
  startChapter,
  markActivity,
} from './home.js';
import { countAvailableCardsForSession } from '../src/srs-limits.js';
import { StudyPlan } from '../studyplan.js';
import {
  completeChapter,
  getChapterProgress,
  getChapterGrammarTopics,
  getChapterPracticeTasks,
  isGrammarTopicCompleted,
  isPracticeItemCompleted,
  isVocabularyBlockCompleted,
  setChapterSection,
} from '../src/chapter-progress.js';
import {
  countRemainingLockedWords,
  getTodayVocabularyUnlockDecision,
  ensureTodayVocabularyBatch,
  getOldestIncompleteVocabularyBatch,
  getVocabularyBatchProgress,
  startVocabularyBatchSession,
} from '../src/vocabulary-unlock-plan.js';

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

  if (cs.started || progress.completionSource === 'app') {
    const batchRes = ensureTodayVocabularyBatch(state, id, {
      plan: state.studyPlan,
      dateKey: today,
      words: l.words,
    });
    if (batchRes.created) await save(true);
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

  const isPriorKnowledge = progress.completionSource === 'prior-knowledge';

  let startBlock;
  if (cs.started || progress.completionSource === 'app') {
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
  } else if (isPriorKnowledge) {
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
            const checked = isPriorKnowledge || isGrammarTopicCompleted(cs, g.id);
            const locked = !cs.started && !progress.completed;
            return `<div class="check-item ${checked ? 'done' : ''} ${locked ? 'locked' : ''}" data-check="${g.id}" data-testid="check-${g.id}">
              <div class="checkbox">${checked ? '✓' : ''}</div>
              <div class="check-label-group">
                <span class="check-label">${g.title}</span>
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
            const locked = !cs.started && !progress.completed;
            return `<div class="check-item ${checked ? 'done' : ''} ${locked ? 'locked' : ''}" data-check="${p.id}" data-testid="check-${p.id}">
              <div class="checkbox">${checked ? '✓' : ''}</div>
              <span class="check-label">${p.title}</span>
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
      startVocabularyBatchSession(id, targetBatchDateKey, state, {
        toast,
        QuestsManager: window.QuestsManager,
        save,
        renderFlash: window.renderFlash,
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
        const { ensureChapterVocabularyCards } = await import('../src/chapter-vocabulary.js');
        const entry = await ensureLesson(id);
        if (entry && entry.lesson) {
          ensureChapterVocabularyCards(state, entry.lesson);
          await save(true);
          toast('Слова главы добавлены в SRS');
        }
      } catch (err) {
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

      if (!cs.started) {
        startChapter(id, toast);
      }

      const k = el.dataset.check;
      const wasCompleted = cs.checklist[k] === true;
      const sectionResult = setChapterSection(state, id, k, !wasCompleted, {
        chapters: CONTENT_INDEX,
      });
      if (!sectionResult.changed) return;

      if (wasCompleted) {
        state.xp = Math.max(0, state.xp - XP_CHECK);
        toast(`❌ Отметка снята, -${XP_CHECK} XP`);
      } else {
        addXP(XP_CHECK, state);
        toast(`+${XP_CHECK} XP за чек-лист!`);

        if (sectionResult.completedNow) {
          const completion = completeChapter(state, id, {
            chapters: CONTENT_INDEX,
            recalculatePlan: StudyPlan.recalculateFuturePlan,
          });
          if (completion.rewardGranted) {
            addXP(XP_CHAPTER_FULL, state);
            toast(`🎉 Глава пройдена! +${XP_CHAPTER_FULL} XP!`);
          }
        }
      }

      await save(true);
      markActivity(toast);
      refreshStreakDisplay();
      await renderChapter(id, state, dependencies);
      dependencies?.renderHome?.();
    };
  });
}
