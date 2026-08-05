/* src/chapter-evidence.js — Pure low-level evidence verification helper functions */

import { normalizedChapterId } from './chapter-content-model.js';
import { sameLessonId } from './courses/course-context.js';

export function isPriorKnowledge(appState, chapterId) {
  const id = normalizedChapterId(chapterId);
  if (!id || !Array.isArray(appState?.priorKnowledgeChapterIds)) return false;
  return appState.priorKnowledgeChapterIds.some((entry) => sameLessonId(entry, id));
}

export function shouldChapterHaveVocabularyCards(appState, chapterId) {
  const id = normalizedChapterId(chapterId);
  if (!id) return false;
  const chapter = appState?.chapters?.[id];
  if (chapter?.started === true || Boolean(chapter?.completedAt)) return true;
  if (isPriorKnowledge(appState, id)) return true;
  return false;
}

export function isGrammarTopicCompleted(chapterState, topicId) {
  if (!chapterState || !topicId) return false;
  return chapterState.checklist?.[topicId] === true;
}

export function isPracticeItemCompleted(chapterState, taskId) {
  if (!chapterState || !taskId) return false;
  return chapterState.checklist?.[taskId] === true;
}

export function isBasicVocabularyEvidencePresent(appState, chapterId) {
  const id = normalizedChapterId(chapterId);
  if (!id) return false;
  const chapterState = appState?.chapters?.[id];
  if (chapterState?.legacyVocabularyCompleted === true) return true;
  if (isPriorKnowledge(appState, id)) return true;
  return false;
}
