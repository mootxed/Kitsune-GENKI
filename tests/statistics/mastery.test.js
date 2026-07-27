import { describe, test, expect } from 'vitest';
import { calculateMasteryStats } from '../../src/statistics/mastery-statistics.js';
import { MASTERY_LEVELS } from '../../src/mastery.js';
import { State } from 'ts-fsrs';

describe('Mastery Statistics (48–51)', () => {
  test('48. Current distribution matches calculateMastery logic', () => {
    const state = {
      srs: {
        w1: { id: 'w1', itemId: 'w1', skill: 'recognition', state: State.New },
      },
      reviewEvents: [],
      masteryArchive: {},
    };
    const stats = calculateMasteryStats(state);
    expect(stats.totalItemsCount).toBe(1);
    expect(stats.distribution[MASTERY_LEVELS.NEW]).toBe(1);
  });

  test('49. Recent lapse retains cap on level', () => {
    const now = Date.now();
    const state = {
      srs: {
        w1: {
          id: 'w1',
          itemId: 'w1',
          skill: 'recognition',
          stability: 100,
          reps: 5,
          state: State.Review,
        },
        'w1::recall': {
          id: 'w1::recall',
          itemId: 'w1',
          skill: 'recall',
          stability: 100,
          reps: 5,
          state: State.Review,
        },
        'w1::context-production': {
          id: 'w1::context-production',
          itemId: 'w1',
          skill: 'context-production',
          stability: 100,
          reps: 5,
          state: State.Review,
        },
      },
      reviewEvents: [
        {
          eventId: '1',
          itemId: 'w1',
          cardId: 'w1',
          skill: 'recognition',
          mode: 'multiple-choice',
          firstAttemptCorrect: true,
          effectiveRating: 4,
          reviewedAt: now - 86400000 * 40,
          eventType: 'review',
        },
        {
          eventId: '2',
          itemId: 'w1',
          cardId: 'w1::recall',
          skill: 'recall',
          mode: 'typing',
          firstAttemptCorrect: true,
          effectiveRating: 4,
          reviewedAt: now - 86400000 * 40,
          eventType: 'review',
        },
        {
          eventId: '3',
          itemId: 'w1',
          cardId: 'w1::recall',
          skill: 'recall',
          mode: 'typing',
          firstAttemptCorrect: true,
          effectiveRating: 4,
          reviewedAt: now - 86400000 * 39,
          eventType: 'review',
        },
        {
          eventId: '4',
          itemId: 'w1',
          cardId: 'w1::recall',
          skill: 'recall',
          mode: 'typing',
          firstAttemptCorrect: true,
          effectiveRating: 4,
          reviewedAt: now - 86400000 * 38,
          eventType: 'review',
        },
        {
          eventId: '5',
          itemId: 'w1',
          cardId: 'w1::recall',
          skill: 'recall',
          mode: 'typing',
          firstAttemptCorrect: true,
          effectiveRating: 4,
          reviewedAt: now - 86400000 * 37,
          eventType: 'review',
        },
        {
          eventId: '6',
          itemId: 'w1',
          cardId: 'w1::context-production',
          skill: 'context-production',
          mode: 'context-production',
          firstAttemptCorrect: true,
          effectiveRating: 4,
          reviewedAt: now - 86400000 * 40,
          eventType: 'review',
        },
        {
          eventId: '7',
          itemId: 'w1',
          cardId: 'w1::context-production',
          skill: 'context-production',
          mode: 'context-production',
          firstAttemptCorrect: true,
          effectiveRating: 4,
          reviewedAt: now - 86400000 * 39,
          eventType: 'review',
        },
        {
          eventId: '8',
          itemId: 'w1',
          cardId: 'w1::context-production',
          skill: 'context-production',
          mode: 'context-production',
          firstAttemptCorrect: true,
          effectiveRating: 4,
          reviewedAt: now - 86400000 * 38,
          eventType: 'review',
        },
        {
          eventId: '9',
          itemId: 'w1',
          cardId: 'w1::context-production',
          skill: 'context-production',
          mode: 'context-production',
          firstAttemptCorrect: true,
          effectiveRating: 4,
          reviewedAt: now - 86400000 * 37,
          eventType: 'review',
        },
        // Recent lapse 2 days ago (accuracy becomes 4/5 = 80%, satisfies confident/mastered thresholds, gets capped by hasRecentLapse):
        {
          eventId: '10',
          itemId: 'w1',
          cardId: 'w1::recall',
          skill: 'recall',
          mode: 'typing',
          firstAttemptCorrect: false,
          effectiveRating: 0,
          reviewedAt: now - 86400000 * 2,
          eventType: 'review',
        },
      ],
      masteryArchive: {},
    };
    const stats = calculateMasteryStats(state, { now });
    expect(stats.recentLapseCappedCount).toBe(1);
  });

  test('50. Absence of context-production task is counted separately', () => {
    const state = {
      srs: {
        w1: { id: 'w1', itemId: 'w1', skill: 'recognition', state: State.Review },
      },
      reviewEvents: [],
    };
    const stats = calculateMasteryStats(state);
    expect(stats.missingProductionCappedCount).toBe(1);
  });

  test('51. Statistics calculation does not mutate mastery or app state', () => {
    const state = {
      srs: {
        w1: { id: 'w1', itemId: 'w1', skill: 'recognition', state: State.New },
      },
      reviewEvents: [],
      masteryArchive: {},
    };
    const snapshotBefore = JSON.stringify(state);
    calculateMasteryStats(state);
    const snapshotAfter = JSON.stringify(state);
    expect(snapshotBefore).toBe(snapshotAfter);
  });
});
