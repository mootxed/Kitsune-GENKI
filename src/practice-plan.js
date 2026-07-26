/* src/practice-plan.js — Unified Practice Tasks & GENKI Workbook Integration */

import { localDateKey } from './local-date.js';
import { isGrammarTopicCompleted, evaluateAndCompleteChapter } from './chapter-progress.js';
import { isFirstVocabularyBatchCompleted } from './grammar-plan.js';
import { getNormalizedChapterPracticeTasks, normalizePracticeTask } from './practice-tasks.js';

import { getPlanDateAvailability } from '../studyplan.js';

export { normalizePracticeTask };

export function getChapterPracticeTasks(chapterMeta) {
  return getNormalizedChapterPracticeTasks(chapterMeta);
}

export function canUnlockPracticeTask(state, chapterId, task, chapterMeta = null, options = {}) {
  const chId = Number(chapterId);
  const cs = state?.chapters?.[chId];

  if (!cs || !cs.started) {
    return { canUnlock: false, reason: 'chapter-not-started' };
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
      (task.section !== 'reading-writing' ||
        state?.workbookSettings?.includeReadingWriting !== false) &&
      canUnlockPracticeTask(state, chapterId, task, chapterMeta, options).canUnlock
  );
}

export function completePracticeTask(state, chapterId, taskId, options = {}) {
  const chId = Number(chapterId);
  const occurredAt = options.now ?? Date.now();
  const dateKey = options.dateKey || localDateKey(occurredAt);

  state.chapters ||= {};
  const cs = (state.chapters[chId] ||= { started: true, checklist: {} });
  cs.checklist ||= {};

  if (cs.checklist[taskId] === true) {
    return { changed: false, alreadyCompleted: true };
  }

  const task = getChapterPracticeTasks(options.chapterMeta).find((t) => t.id === taskId) || {
    id: taskId,
  };
  const unlock = canUnlockPracticeTask(state, chId, task, options.chapterMeta, {
    dateKey: options.dateKey,
    now: occurredAt,
  });
  if (!unlock.canUnlock) {
    return { completed: false, changed: false, reason: unlock.reason || 'locked' };
  }

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

  const completion = evaluateAndCompleteChapter(state, chId, {
    chapters: options.chapters || [],
    now: occurredAt,
    recalculatePlan: options.recalculatePlan,
  });

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
  const chId = Number(chapterId);
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

  const completion = evaluateAndCompleteChapter(state, chId, {
    chapters: options.chapters || [],
    now: occurredAt,
    recalculatePlan: options.recalculatePlan,
  });

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
