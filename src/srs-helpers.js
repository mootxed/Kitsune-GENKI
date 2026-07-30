/* src/srs-helpers.js — pure queries over SRS records */
import { SRS } from '../srs.js';
import { parseCardIdentity } from './knowledge-model.js';
import { getDictionaryEntry } from './dictionary/dictionary-store.js';
import { isPriorKnowledge, shouldChapterHaveVocabularyCards } from './chapter-progress.js';
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
  const itemId = canonicalizeKnowledgeItemId(parseCardIdentity(wordId).itemId);
  if (!lessons || lessons.length === 0) {
    console.warn(`[wordById] lessons array is empty or null for wordId: ${wordId}`);
    return null;
  }

  for (const l of lessons) {
    // Поддерживаем оба формата: words и vocabulary
    const wordList = l.words || l.vocabulary || [];
    const w = wordList.find(
      (x) =>
        canonicalizeKnowledgeItemId(x.id) === itemId ||
        canonicalizeKnowledgeItemId(x.dictionaryId || x.knowledgeItemId) === itemId
    );
    if (w) return w;
  }

  const dictionaryEntry = getDictionaryEntry(itemId);
  if (dictionaryEntry) return dictionaryEntry;

  console.warn(`[wordById] Word not found: ${wordId}. Lessons count: ${lessons.length}`);
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
