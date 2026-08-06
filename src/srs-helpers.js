/* src/srs-helpers.js — pure queries over SRS records */
import { SRS } from '../srs.js';
import { parseCardIdentity } from './knowledge-model.js';
import { getDictionaryEntry, dictionaryStore } from './dictionary/dictionary-store.js';
import { isPriorKnowledge, shouldChapterHaveVocabularyCards } from './chapter-evidence.js';
import {
  canonicalizeKnowledgeItemId,
  canonicalLessonId,
  lessonIdForKnowledgeItem,
  sameLessonId,
} from './courses/course-context.js';

export function cardChapter(cardOrId) {
  const record = cardOrId && typeof cardOrId === 'object' ? cardOrId : null;
  const explicitLessonId =
    record?.introducedIn ||
    record?.lessonId ||
    record?.chapterId ||
    record?.lesson ||
    record?.lessonIds?.[0];
  if (explicitLessonId) {
    return canonicalLessonId(explicitLessonId);
  }
  const itemId = canonicalizeKnowledgeItemId(parseCardIdentity(cardOrId).itemId);
  return lessonIdForKnowledgeItem(itemId);
}

export function wordById(wordId, lessons) {
  if (!wordId) return null;
  const itemId = canonicalizeKnowledgeItemId(parseCardIdentity(wordId).itemId);

  if (Array.isArray(lessons) && lessons.length > 0) {
    for (const l of lessons) {
      const wordList = l.words || l.vocabulary || [];
      const w = wordList.find((x) => {
        const candidateId = canonicalizeKnowledgeItemId(x.id);
        const dictionaryId = canonicalizeKnowledgeItemId(x.dictionaryId || x.knowledgeItemId);
        return candidateId === itemId || dictionaryId === itemId;
      });
      if (w) return w;
    }
  }

  if (dictionaryStore && typeof dictionaryStore.getCourseVocabularyReference === 'function') {
    const courseRef = dictionaryStore.getCourseVocabularyReference(itemId);
    if (courseRef) {
      const resolved = dictionaryStore.resolveCourseVocabularyReference(courseRef);
      if (resolved) return resolved;
    }
  }

  if (dictionaryStore && typeof dictionaryStore.resolveVocabularyRuntimeItem === 'function') {
    const runtimeItem = dictionaryStore.resolveVocabularyRuntimeItem(itemId);
    if (runtimeItem) return runtimeItem;
  }

  const dictionaryEntry = getDictionaryEntry(itemId);
  if (dictionaryEntry) return dictionaryEntry;

  if (typeof window !== 'undefined' && (window.__DEV_MODE__ || window.devMode)) {
    console.warn(`[wordById] Word not found: ${wordId}`);
  }
  return null;
}

export function isWordUnlocked(wordId, chaptersOrAppState, maybeAppState = null) {
  const chapterId = cardChapter(wordId);
  if (!chapterId) return true;

  const appState =
    maybeAppState ||
    (chaptersOrAppState &&
    typeof chaptersOrAppState === 'object' &&
    ('chapters' in chaptersOrAppState || 'priorKnowledgeChapterIds' in chaptersOrAppState)
      ? chaptersOrAppState
      : null);

  const chapters = appState ? appState.chapters : chaptersOrAppState || {};
  const chapter = chapters?.[chapterId];
  if (chapter?.started === true) return true;

  if (appState && isPriorKnowledge(appState, chapterId)) return true;

  return false;
}

export function dueCards(srsRecords, chapterId, now = Date.now()) {
  const seen = new Set();
  return Object.values(srsRecords || {}).filter((c) => {
    if (!c) return false;
    if (c.suspended === true) return false;
    if (c.planLocked === true) return false;
    if (chapterId && !sameLessonId(cardChapter(c), chapterId)) return false;
    if (seen.has(c.id)) return false;
    return SRS.isDue(c, now);
  });
}

export function allCards(srsRecords, chapterId, includeLocked = false) {
  return Object.values(srsRecords || {}).filter((c) => {
    if (!c) return false;
    if (!includeLocked && c.planLocked === true) return false;
    return !chapterId || sameLessonId(cardChapter(c), chapterId);
  });
}

export function getUnlockedParticles(chaptersOrAppState, lessons, maybeAppState = null) {
  const particles = new Set();
  const appState =
    maybeAppState ||
    (chaptersOrAppState &&
    typeof chaptersOrAppState === 'object' &&
    ('chapters' in chaptersOrAppState || 'priorKnowledgeChapterIds' in chaptersOrAppState)
      ? chaptersOrAppState
      : null);

  const chapters = appState ? appState.chapters : chaptersOrAppState || {};

  lessons.forEach((lesson, idx) => {
    const chapterId = lesson.id || idx + 1;
    const isUnlocked = appState
      ? shouldChapterHaveVocabularyCards(appState, chapterId)
      : Boolean(chapters[chapterId]?.started);

    if (isUnlocked) {
      const particleList = lesson.particles || (lesson.lesson && lesson.lesson.particles) || [];
      if (particleList.length > 0) {
        particleList.forEach((p) => particles.add(p));
      }
    }
  });

  return Array.from(particles);
}
