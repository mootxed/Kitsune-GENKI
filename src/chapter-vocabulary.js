/* src/chapter-vocabulary.js — Centralized vocabulary card creation & reconciliation */

import { SRS } from '../srs.js';
import {
  KNOWLEDGE_TYPES,
  SKILLS,
  makeCardId,
  vocabularySkills,
  vocabularySkillsReadyForIntroduction,
} from './knowledge-model.js';
import { getUnlockedKanjiLesson } from './genki-kanji.js';

/**
 * Ensures vocabulary skill cards exist in appState.srs for a single word.
 * Does not overwrite existing cards or reset SRS properties (due, reps, stability, etc.).
 * Updates suspended status if skill applicability or readiness changes.
 *
 * @param {object} appState - Global state object containing srs, reviewEvents, masteryArchive
 * @param {object} word - Normalized word object
 * @param {object} [options] - Options like planLocked
 * @returns {boolean} True if any card was added or modified in appState.srs
 */
export function ensureVocabularySkillCards(appState, word, options = {}) {
  if (!appState || !appState.srs || !word) return false;

  let changed = false;
  const skillOptions = { unlockedKanjiLesson: getUnlockedKanjiLesson(appState) };
  const applicable = new Set(vocabularySkills(word, skillOptions));
  const ready = new Set(
    vocabularySkillsReadyForIntroduction(
      word,
      appState.reviewEvents || [],
      appState.masteryArchive?.[word.id],
      options.now,
      skillOptions
    )
  );

  const existingCards = Object.values(appState.srs).filter((c) => c && c.itemId === word.id);
  const hasUnlockedCard = existingCards.some(
    (c) =>
      c.planLocked !== true ||
      c.reps > 0 ||
      c.state !== 0 ||
      c.lastReview != null ||
      c.legacyMasteryEstimated === true
  );

  const isPrior = Array.isArray(appState.priorKnowledgeChapterIds)
    ? appState.priorKnowledgeChapterIds.some(
        (chId) => Number(chId) === Number(word.chapterId || word.id?.match(/^L(\d+)_/)?.[1])
      )
    : false;

  const shouldBeLocked = options.planLocked === true && !hasUnlockedCard && !isPrior;

  for (const skill of Object.values(SKILLS)) {
    const cardId = makeCardId(word.id, skill);
    const existing = appState.srs[cardId];

    if (existing) {
      const shouldSuspend = !applicable.has(skill) || !ready.has(skill);
      if (existing.suspended !== shouldSuspend) {
        existing.suspended = shouldSuspend;
        changed = true;
      }
      continue;
    }

    if (ready.has(skill)) {
      appState.srs[cardId] = SRS.newCard(cardId, {
        itemId: word.id,
        skill,
        knowledgeType: KNOWLEDGE_TYPES.VOCABULARY,
        planLocked: shouldBeLocked,
      });
      changed = true;
    }
  }

  return changed;
}

/**
 * Centralized helper to create/ensure vocabulary cards for an entire chapter lesson.
 * Safe, idempotent, preserves all existing SRS state and history.
 *
 * @param {object} appState - Global state object
 * @param {object} lesson - Normalized lesson object with words array
 * @param {object} [options] - Options like planLocked
 * @returns {{ created: number, modified: number, changed: boolean }}
 */
export function ensureChapterVocabularyCards(appState, lesson, options = {}) {
  if (!appState || !lesson || !Array.isArray(lesson.words)) {
    return { created: 0, modified: 0, changed: false };
  }

  const initialCardIds = new Set(Object.keys(appState.srs || {}));
  let changed = false;
  let createdCount = 0;
  let modifiedCount = 0;

  for (const word of lesson.words) {
    const applicable = vocabularySkills(word, {
      unlockedKanjiLesson: getUnlockedKanjiLesson(appState),
    });
    const wordCardIds = applicable.map((skill) => makeCardId(word.id, skill));

    const wordChanged = ensureVocabularySkillCards(appState, word, options);
    if (wordChanged) {
      changed = true;
      for (const cardId of wordCardIds) {
        if (!initialCardIds.has(cardId) && appState.srs[cardId]) {
          createdCount++;
          initialCardIds.add(cardId);
        } else if (initialCardIds.has(cardId)) {
          modifiedCount++;
        }
      }
    }
  }

  return { created: createdCount, modified: modifiedCount, changed };
}

/**
 * Reconciles SRS vocabulary cards for all prior knowledge chapters in appState.
 * Lazily loads lessons using provided loader function and idempotently creates missing cards.
 * Resilient to offline/load errors on individual chapters.
 *
 * @param {object} appState
 * @param {function} ensureLessonFn - async function(chapterId) returning { lesson, story }
 * @returns {Promise<{ success: boolean, addedCards: number, failedChapters: number[] }>}
 */
export async function reconcilePriorKnowledgeVocabulary(appState, ensureLessonFn) {
  const priorIds = appState?.priorKnowledgeChapterIds || [];
  if (!Array.isArray(priorIds) || priorIds.length === 0) {
    return { success: true, addedCards: 0, failedChapters: [] };
  }

  const failedChapters = [];
  let totalCreated = 0;

  for (const chapterId of priorIds) {
    try {
      const entry = await ensureLessonFn(chapterId);
      if (entry && entry.lesson) {
        const res = ensureChapterVocabularyCards(appState, entry.lesson);
        totalCreated += res.created;
      }
    } catch (err) {
      console.warn(`[PriorKnowledge] Failed to load chapter ${chapterId}:`, err);
      failedChapters.push(chapterId);
    }
  }

  return {
    success: failedChapters.length === 0,
    addedCards: totalCreated,
    failedChapters,
  };
}
