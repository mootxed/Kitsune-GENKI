/* src/practice-plan.js — unified course practice tasks */

import { localDateKey } from './local-date.js';
import { getChapterPracticeTasks } from './chapter-content-model.js';
import { isGrammarTopicCompleted } from './chapter-evidence.js';
import { isFirstVocabularyBatchCompleted } from './grammar-plan.js';
import {
  getNormalizedChapterPracticeTasks,
  normalizePracticeTask,
  isPracticeTaskEnabled,
  getBuiltInPracticeTasks,
} from './practice-tasks.js';

import { getPlanDateAvailability } from '../studyplan.js';
import { canonicalLessonId, sameLessonId } from './courses/course-context.js';

export { normalizePracticeTask, getChapterPracticeTasks };

export function canUnlockPracticeTask(state, chapterId, task, chapterMeta = null, options = {}) {
  const chId = canonicalLessonId(chapterId);
  const cs = state?.chapters?.[chId];

  if (!cs || !cs.started) {
    return { canUnlock: false, reason: 'chapter-not-started' };
  }

  if (!isPracticeTaskEnabled(task, state?.workbookSettings)) {
    return { canUnlock: false, reason: 'task-disabled' };
  }

  const checkDateKey = options.dateKey || (options.now ? null : localDateKey());
  if (checkDateKey) {
    const availability = getPlanDateAvailability(state?.studyPlan, chId, checkDateKey);
    if (!availability.isStudyDay) {
      return { canUnlock: false, reason: availability.reason };
    }
  }

  // 1. Vocabulary prerequisite check (must have completed at least 1st batch)
  if (!isFirstVocabularyBatchCompleted(state, chId)) {
    return { canUnlock: false, reason: 'vocabulary-prerequisite-not-met' };
  }

  // 2. Grammar prerequisite check (all related grammar IDs must be completed)
  const relatedGrammar = Array.isArray(task.relatedGrammarIds) ? task.relatedGrammarIds : [];
  for (const gId of relatedGrammar) {
    if (!isGrammarTopicCompleted(cs, gId)) {
      return { canUnlock: false, reason: 'grammar-prerequisite-not-met', missingGrammarId: gId };
    }
  }

  if (task.section === 'reading-writing') {
    const readingWriting = getChapterPracticeTasks(chapterMeta).filter(
      (candidate) => candidate.section === 'reading-writing'
    );
    const index = readingWriting.findIndex((candidate) => candidate.id === task.id);
    if (index > 0 && cs.checklist?.[readingWriting[index - 1].id] !== true) {
      return {
        canUnlock: false,
        reason: 'previous-practice-incomplete',
        previousTaskId: readingWriting[index - 1].id,
      };
    }
  }

  return { canUnlock: true, reason: 'eligible' };
}

export function getAvailablePracticeTasks(state, chapterId, chapterMeta = null, options = {}) {
  const tasks = getChapterPracticeTasks(chapterMeta);
  return tasks.filter(
    (task) =>
      isPracticeTaskEnabled(task, state?.workbookSettings) &&
      canUnlockPracticeTask(state, chapterId, task, chapterMeta, options).canUnlock
  );
}

export function completePracticeTask(state, chapterId, taskId, options = {}) {
  const chId = canonicalLessonId(chapterId);
  if (!chId) {
    return { changed: false, completed: false, reason: 'invalid-chapter-id' };
  }

  const cs = state?.chapters?.[chId];
  if (!cs || !cs.started) {
    return { changed: false, completed: false, reason: 'chapter-not-started' };
  }

  const chapterMeta =
    options.chapterMeta ||
    (Array.isArray(options.chapters)
      ? options.chapters.find((c) => sameLessonId(c.id || c.lesson_id, chId))
      : null);
  let task = null;

  if (chapterMeta) {
    const tasks = getChapterPracticeTasks(chapterMeta);
    task = tasks.find((t) => t.id === taskId);
  } else {
    const builtIn = getBuiltInPracticeTasks(chId).find((t) => t.id === taskId);
    if (builtIn) {
      task = builtIn;
    } else {
      if (state?.chapters?.[chId]?.checklist?.[taskId] !== undefined) {
        task = {
          id: taskId,
          type: 'workbook',
          estimatedMinutes: 10,
          required: true,
          requiredForChapterCompletion: true,
        };
      }
    }
  }

  if (!task) {
    return { changed: false, completed: false, reason: 'task-not-found' };
  }

  if (!isPracticeTaskEnabled(task, state?.workbookSettings)) {
    return { changed: false, completed: false, reason: 'task-disabled' };
  }

  const occurredAt = options.now ?? Date.now();
  const dateKey = options.dateKey || localDateKey(occurredAt);

  const unlock = canUnlockPracticeTask(state, chId, task, chapterMeta, {
    dateKey: options.dateKey,
    now: occurredAt,
  });
  if (!unlock.canUnlock) {
    return { completed: false, changed: false, reason: unlock.reason || 'task-locked' };
  }

  if (cs.checklist?.[taskId] === true) {
    return { changed: false, alreadyCompleted: true };
  }

  cs.checklist ||= {};
  cs.checklist[taskId] = true;
  cs.updatedAt = occurredAt;

  state.learningEvents ||= [];
  const eventId = `practice-task-completed:${chId}:${taskId}`;
  const rewardGranted = !state.learningEvents.some((e) => e.eventId === eventId);
  if (rewardGranted) {
    state.learningEvents.push({
      eventId,
      eventType: 'practice-task-completed',
      chapterId: chId,
      taskId,
      dateKey,
      occurredAt,
    });
  }

  const evaluator = options.evaluateAndCompleteChapter;
  const completion =
    typeof evaluator === 'function'
      ? evaluator(state, chId, {
          chapters: options.chapters || [],
          now: occurredAt,
          recalculatePlan: options.recalculatePlan,
        })
      : { changed: false };

  return {
    changed: true,
    completedNow: true,
    chapterId: chId,
    taskId,
    dateKey,
    occurredAt,
    rewardGranted,
    chapterCompleted: completion.changed && completion.completedAt,
    chapterCompletion: completion,
  };
}

export function undoPracticeTask(state, chapterId, taskId, options = {}) {
  const chId = canonicalLessonId(chapterId);
  const occurredAt = options.now ?? Date.now();
  const dateKey = options.dateKey || localDateKey(occurredAt);

  state.chapters ||= {};
  const cs = state.chapters[chId];
  if (!cs || !cs.checklist || cs.checklist[taskId] !== true) {
    return { changed: false, notCompleted: true };
  }

  cs.checklist[taskId] = false;
  cs.updatedAt = occurredAt;

  state.learningEvents ||= [];
  state.learningEvents.push({
    eventId: `practice-task-reopened:${chId}:${taskId}:${occurredAt}`,
    eventType: 'practice-task-reopened',
    chapterId: chId,
    taskId,
    dateKey,
    occurredAt,
  });

  const evaluator = options.evaluateAndCompleteChapter;
  const completion =
    typeof evaluator === 'function'
      ? evaluator(state, chId, {
          chapters: options.chapters || [],
          now: occurredAt,
          recalculatePlan: options.recalculatePlan,
        })
      : { changed: false };

  return {
    changed: true,
    chapterId: chId,
    taskId,
    dateKey,
    occurredAt,
    chapterReopened: completion.reopened === true,
    chapterCompletion: completion,
  };
}
