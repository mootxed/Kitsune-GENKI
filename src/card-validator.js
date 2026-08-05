/* src/card-validator.js — Card renderability validation for FSRS flashcards */

import { parseCardIdentity } from './knowledge-model.js';
import { cardChapter, wordById } from './srs-helpers.js';
import { getDictionaryEntry } from './dictionary/dictionary-store.js';

/**
 * Validates whether an SRS card has all required underlying data and links to be rendered.
 *
 * @param {Object} card — The SRS card record to validate.
 * @param {Object} context — Context object containing { state, lessons }.
 * @returns {{ valid: boolean, code: string|null, message: string|null, details: Object|null }}
 */
export function validateRenderableCard(card, context = {}) {
  if (!card || typeof card !== 'object') {
    return {
      valid: false,
      code: 'INVALID_CARD_STRUCTURE',
      message: 'Card record is missing or not an object',
      details: {
        cardId: null,
        itemId: null,
        dictionaryId: null,
        courseId: null,
        lessonId: null,
        mode: null,
      },
    };
  }

  const cardId = typeof card.id === 'string' && card.id.trim() ? card.id : null;
  if (!cardId) {
    return {
      valid: false,
      code: 'INVALID_CARD_ID',
      message: 'Card ID is missing or empty',
      details: {
        cardId: null,
        itemId: card.itemId || null,
        dictionaryId: card.dictionaryId || null,
        courseId: context.state?.activeCourseId || null,
        lessonId: card.lessonId || null,
        mode: card.forcedMode || null,
      },
    };
  }

  const identity = parseCardIdentity(card);
  const itemId = card.itemId || identity.itemId || null;
  const dictionaryId = card.dictionaryId || card.dictId || null;
  const mode = card.forcedMode || null;
  const courseId = context.state?.activeCourseId || card.courseId || null;
  const lessonId = card.lessonId || cardChapter(card);

  const baseDetails = {
    cardId,
    itemId,
    dictionaryId,
    courseId,
    lessonId,
    mode,
  };

  // Check 1: Particle Quiz Mode
  if (cardId.startsWith('PARTICLE_') || mode === 'particle-quiz') {
    const lessons = context.lessons || context.LESSONS || [];
    const lessonData = lessons.find((l) => l.id === lessonId);
    if (!lessonData || !Array.isArray(lessonData.particles) || lessonData.particles.length === 0) {
      return {
        valid: false,
        code: 'MISSING_TASK_DATA',
        message: `Particle quiz data missing for lesson: ${lessonId}`,
        details: baseDetails,
      };
    }
  }

  // Check 2: Sentence Building Mode
  if (mode === 'sentence-building') {
    const lessons = context.lessons || context.LESSONS || [];
    const lessonData = lessons.find((l) => l.id === lessonId);
    if (!lessonData || !Array.isArray(lessonData.particles) || lessonData.particles.length === 0) {
      return {
        valid: false,
        code: 'MISSING_TASK_DATA',
        message: `Sentence building particle data missing for lesson: ${lessonId}`,
        details: baseDetails,
      };
    }
  }

  // Check 3: Check dictionary reference if specified explicitly
  if (dictionaryId && typeof getDictionaryEntry === 'function') {
    const dictEntry = getDictionaryEntry(dictionaryId);
    if (!dictEntry && !wordById(dictionaryId, context.lessons || context.LESSONS || [])) {
      return {
        valid: false,
        code: 'MISSING_DICTIONARY_ENTRY',
        message: `Dictionary entry not found for dictionaryId: ${dictionaryId}`,
        details: baseDetails,
      };
    }
  }

  // Check 4: Check if dictionary reference was required by card schema but missing/empty
  if (card.requiresDictionaryId === true && !dictionaryId) {
    return {
      valid: false,
      code: 'MISSING_DICTIONARY_ID',
      message: 'Card requires dictionaryId, but reference is missing or empty',
      details: baseDetails,
    };
  }

  // Check 5: Word / Knowledge Item lookup
  const lessons = context.lessons || context.LESSONS || [];
  const word = wordById(cardId, lessons);

  if (!word) {
    if (dictionaryId) {
      return {
        valid: false,
        code: 'MISSING_DICTIONARY_ENTRY',
        message: `Dictionary entry was not found for dictionaryId: ${dictionaryId}`,
        details: baseDetails,
      };
    }

    if (!itemId) {
      return {
        valid: false,
        code: 'MISSING_KNOWLEDGE_ITEM',
        message: 'Knowledge item reference missing or could not be parsed',
        details: baseDetails,
      };
    }

    return {
      valid: false,
      code: 'MISSING_WORD_DATA',
      message: `Word data was not found for card: ${cardId}`,
      details: baseDetails,
    };
  }

  return {
    valid: true,
    code: null,
    message: null,
    details: baseDetails,
  };
}
