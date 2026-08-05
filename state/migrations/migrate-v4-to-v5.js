/* state/migrations/migrate-v4-to-v5.js — Migration v4 -> v5 */

import { compactReviewJournal } from '../../src/review-journal.js';

export const migrationV4ToV5 = {
  from: 4,
  to: 5,
  migrate(oldState) {
    const reviewEvents = Array.isArray(oldState.reviewEvents) ? [...oldState.reviewEvents] : [];
    const cardsWithCleanEvidence = new Set(
      reviewEvents
        .filter((event) => event?.eventType === 'review' && !event.undoneAt)
        .map((event) => event.cardId)
    );
    const srs = Object.fromEntries(
      Object.entries(oldState.srs || {}).map(([cardId, card]) => [
        cardId,
        card.reps > 0 && !cardsWithCleanEvidence.has(cardId)
          ? { ...card, legacyMasteryEstimated: true }
          : card,
      ])
    );
    const migratedState = {
      ...oldState,
      srs,
      reviewEvents,
      masteryArchive: { ...(oldState.masteryArchive || {}) },
      version: 5,
    };
    return compactReviewJournal(migratedState);
  },
};
