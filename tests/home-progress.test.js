import { describe, expect, it } from 'vitest';
import { countCompletedReviewsForDate } from '../ui/home.js';

describe('home daily progress', () => {
  it('не принимает dailyCards и общую активность за решённые карточки', () => {
    const reviewedAt = new Date(2026, 6, 23, 12).getTime();
    const state = {
      dailyCards: 99,
      reviewEvents: [
        {
          eventId: 'valid',
          eventType: 'review',
          reviewedAt,
          undoneAt: null,
        },
        {
          eventId: 'undone',
          eventType: 'review',
          reviewedAt,
          undoneAt: reviewedAt + 1,
        },
        {
          eventId: 'chapter-open',
          eventType: 'chapter-started',
          reviewedAt,
          undoneAt: null,
        },
      ],
    };
    expect(countCompletedReviewsForDate(state, '2026-07-23')).toBe(1);
  });
});
