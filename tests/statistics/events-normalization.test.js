import { describe, test, expect } from 'vitest';
import { getEffectiveReviewEvents } from '../../src/statistics/statistics-events.js';

describe('Review Events Normalization (1–8)', () => {
  test('1. Undone review is excluded', () => {
    const state = {
      reviewEvents: [
        {
          eventId: 'ev-1',
          eventType: 'review',
          cardId: 'c1',
          itemId: 'w1',
          skill: 'recognition',
          mode: 'multiple-choice',
          effectiveRating: 4,
          reviewedAt: 1000,
          undoneAt: 2000,
        },
        {
          eventId: 'ev-2',
          eventType: 'review',
          cardId: 'c1',
          itemId: 'w1',
          skill: 'recognition',
          mode: 'multiple-choice',
          effectiveRating: 4,
          reviewedAt: 1000,
          undoneAt: null,
        },
      ],
    };
    const events = getEffectiveReviewEvents(state, { now: 5000 });
    expect(events).toHaveLength(1);
    expect(events[0].eventId).toBe('ev-2');
  });

  test('2. Duplicate eventId is counted once', () => {
    const state = {
      reviewEvents: [
        {
          eventId: 'dup-1',
          eventType: 'review',
          cardId: 'c1',
          itemId: 'w1',
          skill: 'recognition',
          mode: 'multiple-choice',
          effectiveRating: 4,
          reviewedAt: 1000,
          undoneAt: null,
        },
        {
          eventId: 'dup-1',
          eventType: 'review',
          cardId: 'c1',
          itemId: 'w1',
          skill: 'recognition',
          mode: 'multiple-choice',
          effectiveRating: 4,
          reviewedAt: 1000,
          undoneAt: null,
        },
      ],
    };
    const events = getEffectiveReviewEvents(state, { now: 5000 });
    expect(events).toHaveLength(1);
  });

  test('3. Intra-session repeat answer is excluded from separate FSRS review', () => {
    const state = {
      reviewEvents: [
        {
          eventId: 'ev-1',
          eventType: 'review',
          cardId: 'c1',
          itemId: 'w1',
          skill: 'recognition',
          mode: 'multiple-choice',
          effectiveRating: 0,
          reviewedAt: 1000,
          undoneAt: null,
        },
        {
          eventId: 'ev-2',
          eventType: 'review',
          cardId: 'c1',
          itemId: 'w1',
          skill: 'recognition',
          mode: 'multiple-choice',
          effectiveRating: 4,
          reviewedAt: 1050,
          isSessionRetry: true,
          undoneAt: null,
        },
      ],
    };
    const events = getEffectiveReviewEvents(state, { now: 5000 });
    expect(events).toHaveLength(1);
    expect(events[0].eventId).toBe('ev-1');
  });

  test('4. System fallback and non-learning modes are excluded', () => {
    const state = {
      reviewEvents: [
        {
          eventId: 'sys-1',
          eventType: 'review',
          cardId: 'c1',
          itemId: 'w1',
          skill: 'recognition',
          mode: 'system-fallback',
          effectiveRating: 4,
          reviewedAt: 1000,
          undoneAt: null,
        },
        {
          eventId: 'real-1',
          eventType: 'review',
          cardId: 'c1',
          itemId: 'w1',
          skill: 'recognition',
          mode: 'typing',
          effectiveRating: 4,
          reviewedAt: 1000,
          undoneAt: null,
        },
      ],
    };
    const events = getEffectiveReviewEvents(state, { now: 5000 });
    expect(events).toHaveLength(1);
    expect(events[0].eventId).toBe('real-1');
  });

  test('5. Legacy event without skill is safely handled', () => {
    const state = {
      reviewEvents: [
        {
          eventId: 'leg-1',
          eventType: 'review',
          cardId: 'c1',
          itemId: 'w1',
          mode: 'typing',
          effectiveRating: 4,
          reviewedAt: 1000,
          undoneAt: null,
        },
      ],
    };
    const events = getEffectiveReviewEvents(state, { now: 5000 });
    expect(events).toHaveLength(1);
    expect(events[0].skill).toBe('recall'); // modeSkill('typing') = recall
  });

  test('6. Corrupted event with invalid timestamp or rating does not crash', () => {
    const state = {
      reviewEvents: [
        { eventId: 'bad-1', eventType: 'review', cardId: 'c1', reviewedAt: -500 },
        {
          eventId: 'bad-2',
          eventType: 'review',
          cardId: 'c1',
          effectiveRating: 99,
          reviewedAt: 1000,
        },
        {
          eventId: 'good-1',
          eventType: 'review',
          cardId: 'c1',
          itemId: 'w1',
          mode: 'typing',
          effectiveRating: 4,
          reviewedAt: 1000,
          undoneAt: null,
        },
      ],
    };
    const events = getEffectiveReviewEvents(state, { now: 5000 });
    expect(events).toHaveLength(1);
    expect(events[0].eventId).toBe('good-1');
  });

  test('7. Events are correctly grouped by local study day', () => {
    const state = {
      reviewEvents: [
        {
          eventId: 'ev-1',
          eventType: 'review',
          cardId: 'c1',
          itemId: 'w1',
          mode: 'typing',
          effectiveRating: 4,
          reviewedAt: new Date(2026, 6, 27, 10, 0).getTime(),
          undoneAt: null,
        },
      ],
    };
    const events = getEffectiveReviewEvents(state);
    expect(events[0].studyDay).toBe('2026-07-27');
  });

  test('8. Event before day boundary (e.g. 04:00) belongs to previous study day', () => {
    const state = {
      reviewEvents: [
        {
          eventId: 'night-1',
          eventType: 'review',
          cardId: 'c1',
          itemId: 'w1',
          mode: 'typing',
          effectiveRating: 4,
          reviewedAt: new Date(2026, 6, 27, 2, 30).getTime(),
          undoneAt: null,
        },
      ],
    };
    const events = getEffectiveReviewEvents(state, { dayBoundaryHour: 4 });
    expect(events[0].studyDay).toBe('2026-07-26');
  });
});
