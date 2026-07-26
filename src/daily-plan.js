/* src/daily-plan.js — Atomic Daily Plan generator & Single Source of Truth */

import { localDateKey, getLocalWeekday } from './local-date.js';
import {
  TIME_ESTIMATES,
  DEFAULT_DAILY_CAPACITY_MINUTES,
  calculateReviewMinutes,
  calculateVocabMinutes,
  calculateGrammarMinutes,
  calculatePracticeMinutes,
} from './time-estimates.js';
import { countAvailableCardsForSession } from './srs-limits.js';
import { dueCards } from './srs-helpers.js';
import { getChapterProgress, isChapterCompleted } from './chapter-progress.js';
import {
  ensureTodayVocabularyBatch,
  getOldestIncompleteVocabularyBatch,
  getVocabularyBatchProgress,
  getTodayVocabularyUnlockDecision,
} from './vocabulary-unlock-plan.js';
import { canUnlockNextGrammarTopic, getGrammarTopicStatus } from './grammar-plan.js';
import { getAvailablePracticeTasks } from './practice-plan.js';

export function getDailyCapacity(state) {
  const cap = Number(
    state?.dailyCapacityMinutes ??
      state?.studyPlan?.capacityMinutes ??
      DEFAULT_DAILY_CAPACITY_MINUTES
  );
  return Number.isFinite(cap) && cap > 0 ? cap : DEFAULT_DAILY_CAPACITY_MINUTES;
}

export function generateDailyPlan(state, options = {}) {
  const dateKey = options.dateKey || localDateKey(options.now ?? Date.now());
  const now = options.now ?? Date.now();
  const capacityMinutes = options.capacityMinutes ?? getDailyCapacity(state);
  const chapterMeta = options.chapterMeta;

  const plan = state?.studyPlan;
  const isRestDay =
    plan && Array.isArray(plan.segments)
      ? (() => {
          const activeSeg = plan.segments.find((s) => s.assignedDates?.includes(dateKey));
          if (!activeSeg) return false;
          const status = activeSeg.dateStatuses?.[dateKey];
          return status === 'rest-day';
        })()
      : false;

  const activeChapterId = options.activeChapterId ?? state?.activeChapterId ?? 1;
  const tasks = [];
  let currentMinutes = 0;

  // 1. Priority 1: Due & Overdue SRS Reviews
  const studiedDueCards = dueCards(state?.srs).filter(
    (c) =>
      c && !c.suspended && !c.planLocked && (c.reps > 0 || c.state !== 0 || c.lastReview != null)
  );
  const dueCount = countAvailableCardsForSession(studiedDueCards, state?.srs);
  if (dueCount > 0) {
    const est = calculateReviewMinutes(dueCount);
    tasks.push({
      id: `review-${dateKey}`,
      type: 'review',
      sourceId: 'srs',
      title: isRestDay ? 'Повторить слабые знания' : 'Повторение слов (SRS)',
      description: `${dueCount} карточек к повторению`,
      estimatedMinutes: est,
      priority: 1,
      status: 'planned',
      completionMode: 'interactive',
      count: dueCount,
    });
    currentMinutes += est;
  }

  if (isRestDay) {
    return {
      dateKey,
      chapterId: activeChapterId,
      tasks,
      estimatedMinutes: currentMinutes,
      capacityMinutes,
      generatedAt: now,
      isRestDay: true,
    };
  }

  // 2. Priority 2: Unfinished rolled over tasks / incomplete vocabulary batch
  const oldBatch = getOldestIncompleteVocabularyBatch(state, activeChapterId, dateKey);
  if (oldBatch) {
    const est = calculateVocabMinutes(oldBatch.remaining);
    tasks.push({
      id: `vocab-batch-${oldBatch.dateKey}`,
      type: 'vocabulary',
      sourceId: `vocab-${oldBatch.dateKey}`,
      title: `Слова за ${oldBatch.dateKey} (${oldBatch.remaining} осталось)`,
      description: `Доучить незавершённую порцию`,
      estimatedMinutes: est,
      priority: 2,
      status: 'planned',
      completionMode: 'interactive',
      batchDateKey: oldBatch.dateKey,
      count: oldBatch.remaining,
    });
    currentMinutes += est;
  }

  // 3. Priority 3: Today's New Vocabulary Batch (if capacity permits)
  if (!oldBatch && currentMinutes < capacityMinutes) {
    const decision = getTodayVocabularyUnlockDecision(state, activeChapterId, {
      plan,
      dateKey,
      now,
      words: chapterMeta?.words,
    });

    const todayBatchProgress = getVocabularyBatchProgress(state, activeChapterId, dateKey);
    const targetCount = decision.target > 0 ? decision.target : todayBatchProgress.total;

    if (targetCount > 0 && !todayBatchProgress.isCompleted) {
      const remainingCount = targetCount - todayBatchProgress.completed;
      const est = calculateVocabMinutes(remainingCount);
      tasks.push({
        id: `vocab-today-${dateKey}`,
        type: 'vocabulary',
        sourceId: `vocab-${dateKey}`,
        title: `Новые слова (${todayBatchProgress.completed}/${targetCount})`,
        description: `Порция из ${targetCount} новых слов`,
        estimatedMinutes: est,
        priority: 3,
        status: todayBatchProgress.completed > 0 ? 'in_progress' : 'planned',
        completionMode: 'interactive',
        batchDateKey: dateKey,
        count: remainingCount,
      });
      currentMinutes += est;
    }
  }

  // 4. Priority 4: Grammar Topic (if capacity permits)
  if (currentMinutes < capacityMinutes) {
    const grammarDecision = canUnlockNextGrammarTopic(state, activeChapterId, {
      dateKey,
      plan,
      now,
      chapterMeta,
    });

    let topicToInclude = null;
    if (grammarDecision.canUnlock && grammarDecision.nextTopic) {
      topicToInclude = grammarDecision.nextTopic;
    } else if (
      grammarDecision.reason === 'already-unlocked-today' ||
      grammarDecision.reason === 'previous-topic-incomplete'
    ) {
      topicToInclude = grammarDecision.topicId || grammarDecision.pendingTopic;
    }

    if (topicToInclude) {
      const topicObj =
        typeof topicToInclude === 'string'
          ? { id: topicToInclude, title: `Грамматическая тема ${topicToInclude}` }
          : topicToInclude;
      const status = getGrammarTopicStatus(state, activeChapterId, topicObj.id, chapterMeta);

      if (status !== 'completed') {
        const est = calculateGrammarMinutes(topicObj);
        tasks.push({
          id: `grammar-${topicObj.id}`,
          type: 'grammar',
          sourceId: topicObj.id,
          title: topicObj.title,
          description: `Объяснение и короткая проверка`,
          estimatedMinutes: est,
          priority: 4,
          status: status === 'unlocked' ? 'in_progress' : 'planned',
          completionMode: 'interactive',
          topicId: topicObj.id,
        });
        currentMinutes += est;
      }
    }
  }

  // 5. Priority 5: Practice Tasks (if capacity permits)
  if (currentMinutes < capacityMinutes && chapterMeta) {
    const availablePractice = getAvailablePracticeTasks(state, activeChapterId, chapterMeta);
    const cs = state?.chapters?.[activeChapterId];

    for (const pTask of availablePractice) {
      const isDone = cs?.checklist?.[pTask.id] === true;
      if (!isDone) {
        const est = calculatePracticeMinutes(pTask);
        tasks.push({
          id: `practice-${pTask.id}`,
          type: 'practice',
          sourceId: pTask.id,
          title: pTask.title,
          description: pTask.source
            ? `${pTask.source}${pTask.page ? ` · стр. ${pTask.page}` : ''}${pTask.exercise ? ` · ${pTask.exercise}` : ''}`
            : 'Практическое задание',
          estimatedMinutes: est,
          priority: 5,
          status: 'planned',
          completionMode: 'manual',
          taskId: pTask.id,
        });
        currentMinutes += est;
        if (currentMinutes >= capacityMinutes) break;
      }
    }
  }

  // 6. Priority 6: Bonus task if everything else is finished
  if (tasks.length === 0) {
    tasks.push({
      id: `bonus-${dateKey}`,
      type: 'bonus',
      sourceId: 'extra',
      title: 'Дополнительная практика',
      description: 'Мини-игры, карточки или чтения',
      estimatedMinutes: TIME_ESTIMATES.DEFAULT_BONUS_MINUTES,
      priority: 6,
      status: 'planned',
      completionMode: 'interactive',
    });
    currentMinutes += TIME_ESTIMATES.DEFAULT_BONUS_MINUTES;
  }

  return {
    dateKey,
    chapterId: activeChapterId,
    tasks,
    estimatedMinutes: currentMinutes,
    capacityMinutes,
    generatedAt: now,
    isRestDay: false,
  };
}

export function getOrGenerateDailyPlan(state, options = {}) {
  if (!state) return null;
  const dateKey = options.dateKey || localDateKey(options.now ?? Date.now());

  if (state.dailyPlan && state.dailyPlan.dateKey === dateKey && !options.forceRefresh) {
    return state.dailyPlan;
  }

  const newPlan = generateDailyPlan(state, options);
  state.dailyPlan = newPlan;

  state.dailyPlanHistory ||= [];
  if (!state.dailyPlanHistory.some((p) => p.dateKey === dateKey)) {
    state.dailyPlanHistory.push({
      dateKey,
      chapterId: newPlan.chapterId,
      taskCount: newPlan.tasks.length,
      estimatedMinutes: newPlan.estimatedMinutes,
      capacityMinutes: newPlan.capacityMinutes,
      generatedAt: newPlan.generatedAt,
    });
  }

  return newPlan;
}
