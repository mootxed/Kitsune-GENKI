/* src/vocabulary-weakness-service.js — Unified service for identifying weak vocabulary items */

import { getMiniGameWeaknessProfile } from './minigame-weakness.js';
import { isWordAccessible } from './minigame-word-selectors.js';
import { parseCardIdentity } from './knowledge-model.js';

/**
 * Single entry point to retrieve weak vocabulary items for any purpose in the app.
 * Purpose can be: 'ai-story' | 'crossword' | 'word-search' | 'statistics'
 *
 * @param {Object} state - Application state
 * @param {Object} [options]
 * @param {'ai-story'|'crossword'|'word-search'|'statistics'} [options.purpose='statistics']
 * @param {Array} [options.lessons=[]] - Array of lesson objects with vocabulary words
 * @param {number} [options.maxCount] - Maximum items to return
 * @returns {Array} List of weak vocabulary items with weakness details
 */
export function getWeakVocabularyItems(state, options = {}) {
  if (!state) return [];

  const purpose = options.purpose || 'statistics';
  const lessons = Array.isArray(options.lessons) ? options.lessons : [];
  const maxCount = options.maxCount;

  const gameId = purpose === 'crossword' ? 'crossword' : 'wordSearch';

  // Extract all itemIds from state.srs or provided lessons
  const itemIdsSet = new Set();

  if (lessons.length > 0) {
    for (const lesson of lessons) {
      if (Array.isArray(lesson.words)) {
        for (const word of lesson.words) {
          if (word?.id && isWordAccessible(word, lesson.id, state)) {
            itemIdsSet.add(word.id);
          }
        }
      }
    }
  } else if (state.srs && typeof state.srs !== 'object') {
    for (const key in state.srs) {
      const card = state.srs[key];
      if (card && card.planLocked !== true) {
        const { itemId } = parseCardIdentity(key);
        if (itemId) itemIdsSet.add(itemId);
      }
    }
  }

  const results = [];

  for (const itemId of itemIdsSet) {
    const profile = getMiniGameWeaknessProfile(itemId, state, { gameId });
    if (profile.reviewed && profile.isWeak) {
      results.push(profile);
    }
  }

  // Sort by weaknessScore descending
  results.sort((a, b) => b.weaknessScore - a.weaknessScore);

  if (typeof maxCount === 'number' && maxCount > 0) {
    return results.slice(0, maxCount);
  }

  return results;
}
