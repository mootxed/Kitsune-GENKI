/* src/vocabulary-unlock-plan.js — Gradual daily vocabulary batch unlocking */

import { localDateKey } from './local-date.js';
import { parseCardIdentity } from './knowledge-model.js';
import { cardChapter } from './srs-helpers.js';
import { State } from 'ts-fsrs';

export const DEFAULT_DAILY_NEW_VOCABULARY_LIMIT = 17;

/**
 * Checks if a card is locked by the learning plan.
 */
export function isCardPlanLocked(card) {
  return card?.planLocked === true;
}

/**
 * Helper to get all SRS cards for a word.
 */
function cardsForWord(srsRecords, itemId) {
  if (!srsRecords || typeof srsRecords !== 'object') return [];
  return Object.values(srsRecords).filter((c) => {
    if (!c) return false;
    const identity = parseCardIdentity(c);
    return identity.itemId === itemId;
  });
}

/**
 * Helper to retrieve words for a chapter from passed list or SRS.
 */
function getChapterWords(state, chapterId, passedWords = null) {
  if (Array.isArray(passedWords) && passedWords.length > 0) {
    return passedWords;
  }
  const chId = Number(chapterId);
  const seenItemIds = new Set();
  const words = [];
  if (state?.srs) {
    for (const card of Object.values(state.srs)) {
      if (card && cardChapter(card.id) === chId) {
        const itemId = parseCardIdentity(card).itemId;
        if (!seenItemIds.has(itemId)) {
          seenItemIds.add(itemId);
          words.push({ id: itemId });
        }
      }
    }
  }
  return words;
}

/**
 * Normalizes state to ensure vocabularyUnlocks structure and safety migration.
 */
export function normalizeVocabularyLockState(state) {
  if (!state) return state;

  if (!state.vocabularyUnlocks || typeof state.vocabularyUnlocks !== 'object') {
    state.vocabularyUnlocks = {};
  }

  const priorKnowledge = new Set(
    Array.isArray(state.priorKnowledgeChapterIds) ? state.priorKnowledgeChapterIds.map(Number) : []
  );

  const reviewEvents = Array.isArray(state.reviewEvents) ? state.reviewEvents : [];
  const cardsWithReviews = new Set(
    reviewEvents
      .filter((ev) => ev && ev.eventType === 'review' && !ev.undoneAt)
      .map((ev) => ev.cardId)
  );

  if (state.srs && typeof state.srs === 'object') {
    for (const [cardId, card] of Object.entries(state.srs)) {
      if (!card) continue;
      const chapterId = cardChapter(cardId);
      const isStudied =
        card.reps > 0 ||
        card.state !== State.New ||
        card.lastReview != null ||
        card.legacyMasteryEstimated === true ||
        cardsWithReviews.has(cardId);

      const isPrior = chapterId !== null && priorKnowledge.has(chapterId);

      if (isStudied || isPrior) {
        if (card.planLocked === true) {
          card.planLocked = false;
        }
      }
    }
  }

  return state;
}

/**
 * Helper to count remaining locked words in a chapter.
 */
export function countRemainingLockedWords(state, chapterId, words = null) {
  const chWords = getChapterWords(state, chapterId, words);
  let lockedCount = 0;
  for (const word of chWords) {
    if (!word || !word.id) continue;
    const cards = cardsForWord(state.srs, word.id);
    if (cards.length > 0 && cards.every((c) => c.planLocked === true)) {
      lockedCount++;
    }
  }
  return lockedCount;
}

/**
 * Unlocks a daily batch of vocabulary cards for a specific chapter.
 * Idempotent per chapter per dateKey.
 */
export function unlockDailyVocabularyBatch(state, chapterId, options = {}) {
  const chId = Number(chapterId);
  const dateKey = options.dateKey || localDateKey(options.now ?? Date.now());
  const limit =
    Number.isInteger(options.limit) && options.limit > 0
      ? options.limit
      : DEFAULT_DAILY_NEW_VOCABULARY_LIMIT;

  state.vocabularyUnlocks ||= {};
  state.vocabularyUnlocks[chId] ||= {};

  // Idempotency check: already unlocked today
  if (state.vocabularyUnlocks[chId][dateKey]) {
    const existingEntry = state.vocabularyUnlocks[chId][dateKey];
    const unlockedItemIds = Array.isArray(existingEntry.itemIds) ? existingEntry.itemIds : [];
    const remaining = countRemainingLockedWords(state, chId, options.words);
    return {
      chapterId: chId,
      dateKey,
      requestedCount: limit,
      unlockedCount: 0,
      unlockedItemIds: [],
      alreadyUnlockedToday: true,
      remainingLockedCount: remaining,
      todaysItemIds: unlockedItemIds,
    };
  }

  // Get words for this chapter
  const words = getChapterWords(state, chId, options.words);
  const lockedWords = [];

  for (const word of words) {
    if (!word || !word.id) continue;

    // Check if word is already unlocked or studied
    const cards = cardsForWord(state.srs, word.id);
    if (cards.length === 0) continue;

    const isAlreadyUnlocked = cards.some(
      (c) =>
        c.planLocked !== true ||
        c.reps > 0 ||
        c.state !== State.New ||
        c.lastReview != null ||
        c.legacyMasteryEstimated === true
    );

    if (isAlreadyUnlocked) {
      // Ensure all cards for this word are planLocked: false
      cards.forEach((c) => {
        if (c.planLocked === true) c.planLocked = false;
      });
      continue;
    }

    // Word is currently locked
    lockedWords.push(word);
  }

  const batchToUnlock = lockedWords.slice(0, limit);
  const unlockedItemIds = [];

  for (const word of batchToUnlock) {
    unlockedItemIds.push(word.id);
    const cards = cardsForWord(state.srs, word.id);
    cards.forEach((c) => {
      c.planLocked = false;
    });
  }

  const occurredAt = options.now ?? Date.now();
  state.vocabularyUnlocks[chId][dateKey] = {
    itemIds: unlockedItemIds,
    occurredAt,
  };

  // Add learning event
  state.learningEvents ||= [];
  const eventId = `vocabulary-batch-unlocked:${chId}:${dateKey}`;
  if (!state.learningEvents.some((e) => e.eventId === eventId)) {
    state.learningEvents.push({
      eventId,
      eventType: 'vocabulary-batch-unlocked',
      chapterId: chId,
      dateKey,
      itemIds: unlockedItemIds,
      occurredAt,
    });
  }

  const remainingLockedCount = countRemainingLockedWords(state, chId, words);

  return {
    chapterId: chId,
    dateKey,
    requestedCount: limit,
    unlockedCount: unlockedItemIds.length,
    unlockedItemIds,
    alreadyUnlockedToday: false,
    remainingLockedCount,
    todaysItemIds: unlockedItemIds,
  };
}

/**
 * Returns progress of the daily vocabulary batch for today (or specified dateKey).
 */
export function getVocabularyBatchProgress(state, chapterId, dateKey = localDateKey()) {
  const chId = Number(chapterId);
  const entry = state?.vocabularyUnlocks?.[chId]?.[dateKey];
  const itemIds = Array.isArray(entry?.itemIds) ? entry.itemIds : [];

  if (itemIds.length === 0) {
    return {
      total: 0,
      started: 0,
      completed: 0,
      remaining: 0,
      ratio: 1,
      isCompleted: true,
    };
  }

  const reviewEvents = Array.isArray(state.reviewEvents) ? state.reviewEvents : [];
  let startedCount = 0;
  let completedCount = 0;

  for (const itemId of itemIds) {
    const cards = cardsForWord(state.srs, itemId);

    const hasStarted = cards.some(
      (c) =>
        c.reps > 0 ||
        c.state !== State.New ||
        c.lastReview != null ||
        reviewEvents.some(
          (ev) => ev && ev.itemId === itemId && ev.eventType === 'review' && !ev.undoneAt
        )
    );

    if (hasStarted) startedCount++;

    const isItemCompleted =
      cards.length > 0 &&
      cards.every(
        (c) =>
          c.reps > 0 ||
          c.state !== State.New ||
          c.lastReview != null ||
          c.legacyMasteryEstimated === true ||
          reviewEvents.some(
            (ev) =>
              ev &&
              ev.cardId === c.id &&
              ev.eventType === 'review' &&
              !ev.undoneAt &&
              ev.firstAttemptCorrect === true
          )
      );

    if (isItemCompleted) completedCount++;
  }

  const total = itemIds.length;
  const remaining = total - completedCount;
  const ratio = total > 0 ? completedCount / total : 1;

  return {
    total,
    started: startedCount,
    completed: completedCount,
    remaining,
    ratio,
    isCompleted: completedCount === total,
  };
}
