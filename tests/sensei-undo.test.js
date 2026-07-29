import { describe, it, expect, vi } from 'vitest';
import { submitReview, undoLastReview } from '../ui/flashcards/review-fsrs.js';
import { SRS } from '../srs.js';
import { activeReviewAIContext, setActiveReviewAIContext } from '../ui/flashcards/state.js';

describe('Sensei Review Undo Integration', () => {
  it('clears activeReviewAIContext when review is undone', async () => {
    const card = SRS.newCard('word:test_item_2:recognition');

    const state = {
      srs: { [card.id]: card },
      reviewEvents: [],
      journalLogs: [],
    };

    submitReview(card, SRS.Quality.Again, state, {
      mode: 'multiple-choice',
      mistakes: 1,
      hintUsed: false,
    });

    // Manually simulate active context set by snapshot
    setActiveReviewAIContext({
      snapshot: { schemaVersion: 1 },
      cardSessionId: 'sess-123',
    });

    expect(activeReviewAIContext).not.toBeNull();

    const deps = {
      save: vi.fn().mockResolvedValue(true),
      toast: vi.fn(),
      onReviewUndone: vi.fn(),
    };

    const undone = await undoLastReview(state, deps, () => {});

    expect(undone).toBe(true);
    expect(activeReviewAIContext).toBeNull();
  });
});
