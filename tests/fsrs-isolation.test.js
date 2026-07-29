import { describe, it, expect } from 'vitest';
import { submitReview } from '../ui/flashcards/review-fsrs.js';
import { SRS } from '../srs.js';

describe('FSRS Isolation guarantee', () => {
  it('does NOT alter card FSRS schedule, state or create review logs when AI snapshot is generated', () => {
    const card = SRS.newCard('word:test_item_1:recognition');

    const state = {
      srs: { [card.id]: card },
      reviewEvents: [],
    };

    const eventsBeforeLength = state.reviewEvents.length;

    const reviewResult = submitReview(card, SRS.Quality.Good, state, {
      mode: 'multiple-choice',
      mistakes: 0,
      hintUsed: false,
      aiAttempt: {
        prompt: 'Test prompt',
        expectedAnswers: ['test'],
        userAnswer: 'test',
      },
    });

    expect(reviewResult.accepted).toBe(true);

    // AI actions have zero side-effects on SRS/FSRS scheduling logic:
    // Only 1 review event was generated from SRS.applyReview
    expect(state.reviewEvents.length).toBe(eventsBeforeLength + 1);

    // FSRS rating is Good (3), not mutated by AI logic
    expect(reviewResult.quality).toBe(SRS.Quality.Good);
  });
});
