/* src/practice-plan.js — Unified Practice Tasks & GENKI Workbook Integration */

import { localDateKey } from './local-date.js';
import {
  isGrammarTopicCompleted,
  isPracticeItemCompleted,
  completeChapter,
} from './chapter-progress.js';
import { isFirstVocabularyBatchCompleted } from './grammar-plan.js';

export function normalizePracticeTask(task, chapterId, idx = 0) {
  const chId = Number(chapterId);
  return {
    id: String(task.id || `L${chId}_p${idx + 1}`),
    type: task.type || 'workbook', // 'workbook' | 'dialog' | 'listening' | 'reading'
    source: task.source || (task.type === 'workbook' ? 'GENKI Workbook' : 'GENKI Textbook'),
    page: typeof task.page === 'number' ? task.page : null,
    exercise: task.exercise || null,
    title: task.title || task.exercise || `Задание ${idx + 1}`,
    relatedGrammarIds: Array.isArray(task.relatedGrammarIds) ? task.relatedGrammarIds : [],
    estimatedMinutes: Number(task.estimatedMinutes) || 10,
    required: task.required !== false,
  };
}

export function getChapterPracticeTasks(chapterMeta) {
  const chapterId = Number(chapterMeta?.lesson_id || chapterMeta?.id || 0);
  if (Array.isArray(chapterMeta?.practice) && chapterMeta.practice.length > 0) {
    return chapterMeta.practice.map((item, idx) => normalizePracticeTask(item, chapterId, idx));
  }
  // Default practice items fallback
  return [
    {
      id: 'dialog',
      type: 'dialog',
      source: 'GENKI Textbook',
      title: 'Диалог',
      page: null,
      exercise: null,
      relatedGrammarIds: [],
      estimatedMinutes: 10,
      required: true,
    },
    {
      id: 'listening',
      type: 'listening',
      source: 'GENKI Audio',
      title: 'Аудирование',
      page: null,
      exercise: null,
      relatedGrammarIds: [],
      estimatedMinutes: 10,
      required: true,
    },
    {
      id: 'reading',
      type: 'reading',
      source: 'GENKI Textbook',
      title: 'Чтение',
      page: null,
      exercise: null,
      relatedGrammarIds: [],
      estimatedMinutes: 10,
      required: true,
    },
  ];
}

export function canUnlockPracticeTask(state, chapterId, task, chapterMeta = null) {
  const chId = Number(chapterId);
  const cs = state?.chapters?.[chId];

  if (!cs || !cs.started) {
    return { canUnlock: false, reason: 'chapter-not-started' };
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

  return { canUnlock: true, reason: 'eligible' };
}

export function getAvailablePracticeTasks(state, chapterId, chapterMeta = null) {
  const tasks = getChapterPracticeTasks(chapterMeta);
  return tasks.filter((t) => canUnlockPracticeTask(state, chapterId, t, chapterMeta).canUnlock);
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

  cs.checklist[taskId] = true;
  cs.updatedAt = occurredAt;

  state.learningEvents ||= [];
  const eventId = `practice-task-completed:${chId}:${taskId}:${occurredAt}`;
  if (!state.learningEvents.some((e) => e.eventId === eventId)) {
    state.learningEvents.push({
      eventId,
      eventType: 'practice-task-completed',
      chapterId: chId,
      taskId,
      dateKey,
      occurredAt,
    });
  }

  const completion = completeChapter(state, chId, {
    chapters: options.chapters || [],
    now: occurredAt,
  });

  return {
    changed: true,
    completedNow: true,
    chapterId: chId,
    taskId,
    dateKey,
    occurredAt,
    chapterCompleted: completion.changed && completion.completedAt,
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

  return {
    changed: true,
    chapterId: chId,
    taskId,
    dateKey,
    occurredAt,
  };
}
