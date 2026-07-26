/* src/chapter-evidence.js — Pure low-level evidence verification helper functions */

import { normalizedChapterId } from './chapter-content-model.js';

export function isPriorKnowledge(appState, chapterId) {
  const id = normalizedChapterId(chapterId);
  if (!id || !Array.isArray(appState?.priorKnowledgeChapterIds)) return false;
  return appState.priorKnowledgeChapterIds.includes(id);
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
