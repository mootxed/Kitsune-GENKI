/* src/daily-plan.js — Atomic Daily Plan generator & Single Source of Truth */

import { localDateKey } from './local-date.js';
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
import {
  getOldestIncompleteVocabularyBatch,
  getVocabularyBatchProgress,
  getTodayVocabularyUnlockDecision,
} from './vocabulary-unlock-plan.js';
import {
  canUnlockNextGrammarTopic,
  getGrammarTopicStatus,
  unlockDailyGrammarTopic,
} from './grammar-plan.js';
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
  let requiredMinutes = 0;
  const deferredTaskIds = [];
  const warnings = [];

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
      status: 'available',
      completionMode: 'interactive',
      action: { type: 'review' },
      overCapacity: currentMinutes + est > capacityMinutes,
      count: dueCount,
    });
    currentMinutes += est;
    requiredMinutes += est;
  }

  if (isRestDay) {
    return {
      dateKey,
      chapterId: activeChapterId,
      tasks,
      requiredMinutes,
      plannedMinutes: currentMinutes,
      estimatedMinutes: currentMinutes,
      capacityMinutes,
      overCapacity: currentMinutes > capacityMinutes,
      deferredTaskIds,
      warnings:
        currentMinutes > capacityMinutes
          ? ['Сегодня потребуется больше обычного: накопились обязательные повторения.']
          : warnings,
      completion: {
        completedCount: tasks.filter((task) => task.status === 'completed').length,
        totalCount: tasks.length,
      },
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
      status: 'carried_over',
      completionMode: 'interactive',
      action: {
        type: 'vocabulary',
        chapterId: activeChapterId,
        batchDateKey: oldBatch.dateKey,
      },
      overCapacity: currentMinutes + est > capacityMinutes,
      batchDateKey: oldBatch.dateKey,
      count: oldBatch.remaining,
    });
    currentMinutes += est;
    requiredMinutes += est;
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

    if (targetCount > 0 && (todayBatchProgress.total === 0 || !todayBatchProgress.isCompleted)) {
      const remainingCount = Math.max(0, targetCount - todayBatchProgress.completed);
      const availableMinutes = Math.max(0, capacityMinutes - currentMinutes);
      const plannedCount = Math.min(remainingCount, Math.floor(availableMinutes));
      const est = calculateVocabMinutes(plannedCount);
      if (plannedCount >= Math.min(3, remainingCount) && currentMinutes + est <= capacityMinutes) {
        tasks.push({
          id: `vocab-today-${dateKey}`,
          type: 'vocabulary',
          sourceId: `vocab-${dateKey}`,
          title: `Новые слова (${todayBatchProgress.completed}/${targetCount})`,
          description: `Порция из ${targetCount} новых слов`,
          estimatedMinutes: est,
          priority: 3,
          status: todayBatchProgress.completed > 0 ? 'in_progress' : 'available',
          completionMode: 'interactive',
          action: { type: 'vocabulary', chapterId: activeChapterId, batchDateKey: dateKey },
          batchDateKey: dateKey,
          count: plannedCount,
          targetCount,
        });
        currentMinutes += est;
      } else {
        deferredTaskIds.push(`vocab-today-${dateKey}`);
      }
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
        if (currentMinutes + est <= capacityMinutes) {
          if (grammarDecision.canUnlock) {
            unlockDailyGrammarTopic(state, activeChapterId, {
              dateKey,
              plan,
              now,
              chapterMeta,
            });
          }
          const resolvedStatus = getGrammarTopicStatus(
            state,
            activeChapterId,
            topicObj.id,
            chapterMeta
          );
          tasks.push({
            id: `grammar-${topicObj.id}`,
            type: 'grammar',
            sourceId: topicObj.id,
            title: topicObj.title,
            description: `Объяснение и короткая проверка`,
            estimatedMinutes: est,
            priority: 4,
            status:
              resolvedStatus === 'in_progress'
                ? 'in_progress'
                : resolvedStatus === 'unlocked'
                  ? 'available'
                  : 'planned',
            completionMode: 'interactive',
            action: { type: 'grammar', chapterId: activeChapterId, topicId: topicObj.id },
            topicId: topicObj.id,
          });
          currentMinutes += est;
        } else {
          deferredTaskIds.push(`grammar-${topicObj.id}`);
        }
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
        if (currentMinutes + est > capacityMinutes) {
          deferredTaskIds.push(`practice-${pTask.id}`);
          continue;
        }
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
          status: 'available',
          completionMode: 'manual',
          action: { type: 'practice', chapterId: activeChapterId, taskId: pTask.id },
          taskId: pTask.id,
        });
        currentMinutes += est;
        if (currentMinutes >= capacityMinutes) break;
      }
    }
  }

  // 6. Priority 6: Bonus task if everything else is finished
  if (tasks.length === 0 && TIME_ESTIMATES.DEFAULT_BONUS_MINUTES <= capacityMinutes) {
    tasks.push({
      id: `bonus-${dateKey}`,
      type: 'bonus',
      sourceId: 'extra',
      title: 'Дополнительная практика',
      description: 'Мини-игры, карточки или чтения',
      estimatedMinutes: TIME_ESTIMATES.DEFAULT_BONUS_MINUTES,
      priority: 6,
      status: 'available',
      completionMode: 'interactive',
      action: { type: 'bonus' },
    });
    currentMinutes += TIME_ESTIMATES.DEFAULT_BONUS_MINUTES;
  }

  const overCapacity = requiredMinutes > capacityMinutes;
  if (overCapacity) {
    warnings.push('Сегодня потребуется больше обычного: накопились обязательные повторения.');
  }
  return {
    dateKey,
    chapterId: activeChapterId,
    tasks,
    estimatedMinutes: currentMinutes,
    requiredMinutes,
    plannedMinutes: currentMinutes,
    capacityMinutes,
    overCapacity,
    deferredTaskIds,
    warnings,
    completion: {
      completedCount: tasks.filter((task) => task.status === 'completed').length,
      totalCount: tasks.length,
    },
    generatedAt: now,
    isRestDay: false,
  };
}

export function getOrGenerateDailyPlan(state, options = {}) {
  if (!state) return null;
  const dateKey = options.dateKey || localDateKey(options.now ?? Date.now());

  const inputRevision = getDailyPlanInputRevision(state, options);
  if (
    state.dailyPlan &&
    state.dailyPlan.dateKey === dateKey &&
    state.dailyPlan.inputRevision === inputRevision &&
    !options.forceRefresh
  ) {
    return state.dailyPlan;
  }

  const newPlan = generateDailyPlan(state, options);
  newPlan.inputRevision = inputRevision;
  state.dailyPlan = newPlan;

  state.dailyPlanHistory ||= [];
  for (const historical of state.dailyPlanHistory) {
    if (historical.dateKey < dateKey && !historical.finalizedAt) {
      historical.finalizedAt = newPlan.generatedAt;
    }
  }
  const snapshot = {
    dateKey,
    chapterId: newPlan.chapterId,
    tasks: newPlan.tasks.map((task) => ({ ...task })),
    estimatedMinutes: newPlan.estimatedMinutes,
    capacityMinutes: newPlan.capacityMinutes,
    generatedAt: newPlan.generatedAt,
    finalizedAt: null,
  };
  const existingIndex = state.dailyPlanHistory.findIndex((plan) => plan.dateKey === dateKey);
  if (existingIndex < 0) {
    state.dailyPlanHistory.push(snapshot);
  } else if (!state.dailyPlanHistory[existingIndex].finalizedAt) {
    state.dailyPlanHistory[existingIndex] = snapshot;
  }

  return newPlan;
}

function getDailyPlanInputRevision(state, options) {
  const lastLearningEvent = state?.learningEvents?.at?.(-1);
  const lastReviewEvent = state?.reviewEvents?.at?.(-1);
  const chapterMeta = options.chapterMeta;
  return JSON.stringify([
    state?.updatedAt || 0,
    state?.activeChapterId || null,
    getDailyCapacity(state),
    state?.studyPlan?.updatedAt || state?.studyPlan?.recalculatedAt || 0,
    state?.learningEvents?.length || 0,
    lastLearningEvent?.eventId || lastLearningEvent?.occurredAt || null,
    state?.reviewEvents?.length || 0,
    lastReviewEvent?.eventId || lastReviewEvent?.reviewedAt || null,
    Object.keys(state?.vocabularyUnlocks?.[state?.activeChapterId] || {}).length,
    chapterMeta?.id || chapterMeta?.lesson_id || null,
    chapterMeta?.words?.length || 0,
    chapterMeta?.grammarTopics?.length || chapterMeta?.grammar?.length || 0,
    chapterMeta?.practice?.length || 0,
    options.capacityMinutes || null,
  ]);
}

export function getNextStudyAction(dailyPlan) {
  return (
    dailyPlan?.tasks?.find((task) => task.status !== 'completed' && task.status !== 'locked') ||
    null
  );
}
