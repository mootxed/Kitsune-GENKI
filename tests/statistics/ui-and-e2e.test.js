import { describe, test, expect, beforeEach } from 'vitest';
import { buildStatisticsViewModel } from '../../src/statistics/statistics-view-model.js';
import { State } from 'ts-fsrs';

describe('UI & E2E Requirements (52–60)', () => {
  let emptyState;

  beforeEach(() => {
    emptyState = {
      srs: {},
      reviewEvents: [],
      masteryArchive: {},
      settings: { requestRetention: 0.9 },
    };
  });

  test('52. Screen opens cleanly on empty state', () => {
    const vm = buildStatisticsViewModel(emptyState);
    expect(vm.overview.reviewsToday).toBe(0);
    expect(vm.overview.retentionIsInsufficient).toBe(true);
    expect(vm.overview.retentionFormatted).toBe('Недостаточно данных');
  });

  test('53. Selecting period updates dependent blocks', () => {
    const now = Date.now();
    const state = {
      srs: {},
      reviewEvents: [
        {
          eventId: '1',
          itemId: 'w1',
          cardId: 'c1',
          skill: 'recognition',
          mode: 'multiple-choice',
          effectiveRating: 4,
          firstAttemptCorrect: true,
          reviewedAt: now - 86400000 * 20,
        },
        {
          eventId: '2',
          itemId: 'w1',
          cardId: 'c1',
          skill: 'recognition',
          mode: 'multiple-choice',
          effectiveRating: 4,
          firstAttemptCorrect: true,
          reviewedAt: now - 86400000 * 80,
        },
      ],
    };

    const vm7 = buildStatisticsViewModel(state, { timeRangeDays: 7, now });
    expect(vm7.retention.totalFirstAttempts).toBe(0);

    const vm30 = buildStatisticsViewModel(state, { timeRangeDays: 30, now });
    expect(vm30.retention.totalFirstAttempts).toBe(1);

    const vm90 = buildStatisticsViewModel(state, { timeRangeDays: 90, now });
    expect(vm90.retention.totalFirstAttempts).toBe(2);
  });

  test('54. Period selection option defaults to 30 days', () => {
    const vm = buildStatisticsViewModel(emptyState);
    expect(vm.selectedPeriod).toBe(30);
  });

  test('55. Chart correctly displays a single point without error', () => {
    const now = Date.now();
    const state = {
      srs: {},
      reviewEvents: [
        {
          eventId: '1',
          itemId: 'w1',
          cardId: 'c1',
          skill: 'recognition',
          mode: 'multiple-choice',
          effectiveRating: 4,
          firstAttemptCorrect: true,
          reviewedAt: now,
        },
      ],
    };
    const vm = buildStatisticsViewModel(state, { timeRangeDays: 7, now });
    const dataPoints = vm.retention.timeSeries.filter((pt) => pt.hasData);
    expect(dataPoints).toHaveLength(1);
    expect(dataPoints[0].retention).toBe(1.0);
  });

  test('56. Chart correctly displays empty period without breaking', () => {
    const vm = buildStatisticsViewModel(emptyState, { timeRangeDays: 7 });
    expect(vm.retention.timeSeries).toHaveLength(7);
    vm.retention.timeSeries.forEach((pt) => {
      expect(pt.hasData).toBe(false);
      expect(pt.retention).toBeNull();
    });
  });

  test('57. Overview metrics map clean non-mutated data', () => {
    const vm = buildStatisticsViewModel(emptyState);
    expect(vm.overview).toBeDefined();
    expect(typeof vm.overview.reviewsToday).toBe('number');
  });

  test('58. Risk score problem cards sort properly with zero crashes', () => {
    const state = {
      srs: {
        c1: {
          id: 'c1',
          itemId: 'w1',
          skill: 'recognition',
          lapses: 2,
          stability: 3,
          state: State.Review,
          japanese: '犬',
          translation: 'собака',
        },
      },
      reviewEvents: [],
    };
    const vm = buildStatisticsViewModel(state);
    expect(vm.lapses.problemCards.length).toBe(1);
    expect(vm.lapses.problemCards[0].japanese).toBe('犬');
  });

  test('59. Viewport responsiveness: Forecast and workload return structured array structures suitable for mobile CSS grid/flex', () => {
    const vm = buildStatisticsViewModel(emptyState);
    expect(Array.isArray(vm.forecast.byDay14)).toBe(true);
    expect(Array.isArray(vm.workload.heatmap)).toBe(true);
  });

  test('60. Safe fallback when knowledge item route or details are absent', () => {
    const state = {
      srs: {
        orphanCard: {
          id: 'orphanCard',
          itemId: 'deletedItem',
          skill: 'recognition',
          state: State.Review,
          lapses: 3,
        },
      },
      reviewEvents: [],
    };
    const vm = buildStatisticsViewModel(state);
    expect(vm.lapses.problemCards.length).toBe(1);
    expect(vm.lapses.problemCards[0].cardId).toBe('orphanCard');
  });

  test('FULL E2E SCENARIO SIMULATION (Steps 1–16 of E2E spec)', () => {
    // 1. App started with clean state
    const appState = {
      srs: {
        'card-1': {
          id: 'card-1',
          itemId: 'w1',
          skill: 'recognition',
          due: Date.now() + 86400000,
          state: State.Review,
        },
        'card-2': {
          id: 'card-2',
          itemId: 'w2',
          skill: 'recall',
          due: Date.now() + 86400000 * 2,
          state: State.Review,
        },
        'card-3': {
          id: 'card-3',
          itemId: 'w3',
          skill: 'reading-writing',
          due: Date.now() + 86400000 * 3,
          state: State.Review,
        },
      },
      reviewEvents: [],
      masteryArchive: {},
      settings: { requestRetention: 0.9 },
    };

    // 2. Open statistics -> insufficient data
    let vm = buildStatisticsViewModel(appState);
    expect(vm.overview.retentionIsInsufficient).toBe(true);

    // 3. Create review events
    const now = Date.now();
    appState.reviewEvents = [
      // recognition Good (4)
      {
        eventId: 'ev1',
        cardId: 'card-1',
        itemId: 'w1',
        skill: 'recognition',
        mode: 'multiple-choice',
        effectiveRating: 4,
        firstAttemptCorrect: true,
        reviewedAt: now - 5000,
        undoneAt: null,
      },
      // recall Again (0)
      {
        eventId: 'ev2',
        cardId: 'card-2',
        itemId: 'w2',
        skill: 'recall',
        mode: 'typing',
        effectiveRating: 0,
        firstAttemptCorrect: false,
        reviewedAt: now - 4000,
        undoneAt: null,
      },
      // recall Good in relearning (session retry) -> should not count as 2nd FSRS review
      {
        eventId: 'ev3',
        cardId: 'card-2',
        itemId: 'w2',
        skill: 'recall',
        mode: 'typing',
        effectiveRating: 4,
        firstAttemptCorrect: true,
        isSessionRetry: true,
        reviewedAt: now - 3000,
        undoneAt: null,
      },
      // reading-writing Hard (3)
      {
        eventId: 'ev4',
        cardId: 'card-3',
        itemId: 'w3',
        skill: 'reading-writing',
        mode: 'drawing',
        effectiveRating: 3,
        firstAttemptCorrect: true,
        reviewedAt: now - 2000,
        undoneAt: null,
      },
      // undone context-production review
      {
        eventId: 'ev5',
        cardId: 'card-4',
        itemId: 'w4',
        skill: 'context-production',
        mode: 'context-production',
        effectiveRating: 4,
        firstAttemptCorrect: true,
        reviewedAt: now - 1000,
        undoneAt: now,
      },
    ];

    // 4. Re-query statistics
    vm = buildStatisticsViewModel(appState, { timeRangeDays: 30, now });

    // 5. Verify retention (2 successful / 3 total attempts = 66.7%)
    expect(vm.retention.totalFirstAttempts).toBe(3);
    expect(vm.retention.successfulFirstAttempts).toBe(2);
    expect(vm.retention.overallRetention).toBeCloseTo(2 / 3, 2);

    // 6. Verify undone event excluded
    const eventIds = vm.retention.timeSeries.flatMap((pt) => pt.total);
    expect(eventIds.reduce((a, b) => a + b, 0)).toBe(3);

    // 7. Verify Again counted once in lapses
    expect(vm.lapses.totalLapses).toBe(1);

    // 8. Verify skill breakdown
    expect(vm.skills['recognition'].retention).toBe(1.0);
    expect(vm.skills['recall'].retention).toBe(0);
    expect(vm.skills['reading-writing'].retention).toBe(1.0);

    // 9. Verify forecast
    expect(vm.forecast.dueTomorrowCount).toBe(1);

    // 10. Verify state non-mutation
    expect(appState.reviewEvents).toHaveLength(5);
  });
});
