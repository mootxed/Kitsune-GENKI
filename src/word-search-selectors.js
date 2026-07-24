/* src/word-search-selectors.js — Selector for accessible candidate words for Word Search */

import { isPriorKnowledge } from './chapter-progress.js';
import { isValidWordForSearch } from './word-search-generator.js';
import { parseCardIdentity } from './knowledge-model.js';

/**
 * Checks if a word is unlocked / accessible to the user based on state.
 */
export function isWordAccessible(word, lessonChapterId, state) {
  if (!state) return false;

  // 1. If card exists in state.srs
  if (state.srs) {
    const srsKeys = Object.keys(state.srs);
    for (const key of srsKeys) {
      const { itemId } = parseCardIdentity(key);
      if (itemId === word.id || key === word.id) {
        return true;
      }
    }
  }

  // 2. If chapter is started
  if (lessonChapterId && state.chapters && state.chapters[lessonChapterId]?.started === true) {
    return true;
  }

  // 3. If prior knowledge chapter and card is in SRS
  if (lessonChapterId && isPriorKnowledge(state, lessonChapterId)) {
    if (state.srs) {
      const srsKeys = Object.keys(state.srs);
      for (const key of srsKeys) {
        const { itemId } = parseCardIdentity(key);
        if (itemId === word.id || key === word.id) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Retrieves candidate words sorted by priority:
 * 1. Weak words (lapses > 0, low stability/state 1 or 3 in SRS)
 * 2. Recently added/reviewed words
 * 3. Fallback: random available words
 */
export function getAvailableWordSearchCandidates(state, lessons = []) {
  if (!state || !Array.isArray(lessons) || lessons.length === 0) {
    return [];
  }

  const candidateMap = new Map();

  for (const lesson of lessons) {
    const chapterId = lesson.id;
    const wordList = lesson.words || lesson.vocabulary || [];

    for (const rawWord of wordList) {
      if (!rawWord || !rawWord.id) continue;

      if (isWordAccessible(rawWord, chapterId, state)) {
        const kana = rawWord.writing || rawWord.kana || rawWord.reading || '';
        const translation = rawWord.translation || rawWord.russian || rawWord.meaning || '';
        const kanji = rawWord.kanji || rawWord.writing || kana;

        const wordObj = {
          id: rawWord.id,
          word: rawWord.id,
          kana,
          writing: rawWord.writing || kana,
          kanji,
          translation,
          originalWord: rawWord,
          lessonId: chapterId,
          // Priority score calculation (higher = higher priority)
          priorityScore: 0,
        };

        if (isValidWordForSearch(wordObj)) {
          candidateMap.set(rawWord.id, wordObj);
        }
      }
    }
  }

  const candidates = Array.from(candidateMap.values());

  // Calculate priority score for each candidate
  if (state.srs) {
    for (const cand of candidates) {
      // Look up SRS record for this item
      let srsRecord = null;
      for (const key in state.srs) {
        const { itemId } = parseCardIdentity(key);
        if (itemId === cand.id || key === cand.id) {
          srsRecord = state.srs[key];
          break;
        }
      }

      if (srsRecord) {
        let score = 10;
        // Weak words get top priority
        if (srsRecord.lapses && srsRecord.lapses > 0) {
          score += 100 + srsRecord.lapses * 10;
        }
        if (srsRecord.state === 1 || srsRecord.state === 3) {
          score += 50;
        }
        if (typeof srsRecord.stability === 'number' && srsRecord.stability < 3) {
          score += 30;
        }
        cand.priorityScore = score;
      }
    }
  }

  // Sort by priorityScore descending
  candidates.sort((a, b) => b.priorityScore - a.priorityScore);

  return candidates;
}
