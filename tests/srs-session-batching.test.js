/* tests/srs-session-batching.test.js — Regression test for 45-card SRS session batching */

import { describe, it, expect, beforeEach } from 'vitest';
import { initSessionBatching, startNextBatchIfAny } from '../ui/flashcards/session.js';
import { setSessionManager, getSessionManager, setFlashQueue } from '../ui/flashcards/state.js';
import { SessionManager } from '../session-manager.js';

describe('SRS Session Batching Regression (45 cards)', () => {
  let mockCards;
  let mockLessons;
  let state;
  let dependencies;

  beforeEach(() => {
    // Create 45 mock cards
    mockCards = Array.from({ length: 45 }, (_, i) => ({
      id: `word-${i}`,
      itemId: `word-${i}`,
      due: Date.now() - 1000,
      reps: 1,
      state: 2,
    }));

    mockLessons = [
      {
        id: 1,
        words: mockCards.map((c) => ({ id: c.id, writing: c.id, translation: `Trans ${c.id}` })),
      },
    ];

    state = { srs: {} };
    dependencies = { LESSONS: mockLessons, save: () => {} };
  });

  it('runs a 45-card session as 20 + 20 + 5 batches and triggers completion only after card 45', () => {
    const batchInfo = initSessionBatching(mockCards, mockLessons, 20);

    expect(batchInfo).not.toBeNull();
    expect(batchInfo.totalBatches).toBe(3);
    expect(batchInfo.organizedCards.length).toBe(20);

    // Simulate activateSessionBatch: set initial SessionManager
    setFlashQueue(batchInfo.organizedCards);
    let manager = new SessionManager(batchInfo.organizedCards, {
      srs: { review: () => ({}) },
      state,
      onSave: dependencies.save,
    });
    setSessionManager(manager);

    let totalCardsAnswered = 0;
    const batchSizes = [];
    let currentBatchAnswered = 0;

    // Process all cards through the batches
    while (manager) {
      const card = manager.getNextCard();
      if (card) {
        manager.answerCard(card.id, 3, state.srs);
        totalCardsAnswered++;
        currentBatchAnswered++;
      } else {
        batchSizes.push(currentBatchAnswered);
        currentBatchAnswered = 0;
        const hasNext = startNextBatchIfAny(state, dependencies);
        if (hasNext) {
          manager = getSessionManager();
        } else {
          manager = null;
        }
      }
    }

    // Add the final batch size
    if (currentBatchAnswered > 0) {
      batchSizes.push(currentBatchAnswered);
    }

    expect(totalCardsAnswered).toBe(45);
    expect(batchSizes).toEqual([20, 20, 5]);
  });
});
