/* src/minigame-word-selectors.js — Canonical selector for accessible candidate words for minigames */

import { isPriorKnowledge, isChapterCompleted } from './chapter-progress.js';
import { isValidWordForSearch } from './word-search-generator.js';
import { parseCardIdentity } from './knowledge-model.js';
import { getWeakMiniGameCandidates } from './minigame-weakness.js';

/**
 * Calculates the number of unique chapters available to minigames.
 * A chapter is available if it is started, completed, or in priorKnowledgeChapterIds.
 *
 * @param {Object} state - App state
 * @returns {number} Unique available chapter count
 */
export function getAvailableChapterCount(state) {
  if (!state) return 0;

  const uniqueChapters = new Set();

  // 1. Started or completed chapters in state.chapters
  if (state.chapters && typeof state.chapters === 'object') {
    for (const [idStr, chState] of Object.entries(state.chapters)) {
      const chId = Number(idStr);
      if (!Number.isInteger(chId) || chId <= 0) continue;
      if (chState?.started === true || isChapterCompleted(chState)) {
        uniqueChapters.add(chId);
      }
    }
  }

  // 2. Prior knowledge chapter IDs
  if (Array.isArray(state.priorKnowledgeChapterIds)) {
    for (const id of state.priorKnowledgeChapterIds) {
      const chId = Number(id);
      if (Number.isInteger(chId) && chId > 0) {
        uniqueChapters.add(chId);
      }
    }
  }

  return uniqueChapters.size;
}

/**
 * Checks if a word is unlocked / accessible to minigames based on state.
 * Supports skill-based FSRS card identities (e.g. L2_V001::recognition).
 *
 * @param {Object} word - Word object containing id
 * @param {number|string} lessonChapterId - Chapter ID of the word
 * @param {Object} state - App state
 * @returns {boolean} True if accessible
 */
export function isWordAccessible(word, lessonChapterId, state) {
  if (!word || !word.id || !state) return false;

  const chId = Number(lessonChapterId);

  // 1. Started chapter
  if (chId && state.chapters && state.chapters[chId]?.started === true) {
    return true;
  }

  // 2. Completed chapter
  if (chId && state.chapters && isChapterCompleted(state.chapters[chId])) {
    return true;
  }

  // 3. Prior knowledge chapter
  if (chId && isPriorKnowledge(state, chId)) {
    return true;
  }

  // 4. Card exists in state.srs (matching either exact key, baseId prefix, or parsed itemId)
  if (state.srs && typeof state.srs === 'object') {
    for (const key in state.srs) {
      if (key === word.id) return true;
      const baseId = key.includes('::') ? key.split('::')[0] : key;
      if (baseId === word.id) return true;
      const { itemId } = parseCardIdentity(key);
      if (itemId === word.id) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Retrieves candidate words from lessons accessible in minigames.
 * Computes base priorityScore from SRS (lapses, state, stability).
 *
 * @param {Object} state - App state
 * @param {Array} lessons - Array of lesson objects
 * @returns {Array} Canonical candidate words sorted by SRS priority
 */
export function getAvailableMiniGameCandidates(state, lessons = []) {
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
          priorityScore: 0,
        };

        candidateMap.set(rawWord.id, wordObj);
      }
    }
  }

  const candidates = Array.from(candidateMap.values());

  // Calculate SRS priority score for candidates
  if (state.srs && typeof state.srs === 'object') {
    for (const cand of candidates) {
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

  candidates.sort((a, b) => b.priorityScore - a.priorityScore);

  return candidates;
}

/**
 * Retrieves candidate words specifically filtered for Word Search minigame.
 *
 * @param {Object} state - App state
 * @param {Array} lessons - Array of lesson objects
 * @returns {Array} Word Search candidate words
 */
export function getAvailableWordSearchCandidates(state, lessons = []) {
  const candidates = getAvailableMiniGameCandidates(state, lessons);
  return candidates.filter(isValidWordForSearch);
}

/**
 * Retrieves candidate words filtered for Weak Words mode in Word Search.
 *
 * @param {Object} state - App state
 * @param {Array} lessons - Array of lesson objects
 * @returns {Array} Weak candidate words for Word Search
 */
export function getWeakWordSearchCandidates(state, lessons = []) {
  const candidates = getAvailableWordSearchCandidates(state, lessons);
  return getWeakMiniGameCandidates(candidates, state, { gameId: 'wordSearch' });
}

/**
 * Retrieves candidate words filtered for Weak Words mode in Crossword.
 *
 * @param {Object} state - App state
 * @param {Array} lessons - Array of lesson objects
 * @returns {Array} Weak candidate words for Crossword
 */
export function getWeakCrosswordCandidates(state, lessons = []) {
  const candidates = getAvailableMiniGameCandidates(state, lessons);
  return getWeakMiniGameCandidates(candidates, state, { gameId: 'crossword' });
}
