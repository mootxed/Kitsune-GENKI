import { describe, test, expect } from 'vitest';
import {
  calculateWorkloadStats,
  MAX_VALID_RESPONSE_TIME_MS,
  calculateMedian,
} from '../../src/statistics/workload-statistics.js';

describe('Workload Statistics (24–30)', () => {
  test('24. Events count and unique cards count are tracked separately', () => {
    const events = [
      { eventId: '1', cardId: 'c1', responseTimeMs: 4000, reviewedAt: Date.now() },
      { eventId: '2', cardId: 'c1', responseTimeMs: 5000, reviewedAt: Date.now() },
    ];
    const stats = calculateWorkloadStats(events, {});
    expect(stats.totalEventsCount).toBe(2);
    expect(stats.dailyWorkload[stats.dailyWorkload.length - 1].uniqueCardsCount).toBe(1);
  });

  test('25. Negative or non-numeric response time is excluded from time stats', () => {
    const events = [
      { eventId: '1', cardId: 'c1', responseTimeMs: -500, reviewedAt: Date.now() },
      { eventId: '2', cardId: 'c2', responseTimeMs: 4000, reviewedAt: Date.now() },
    ];
    const stats = calculateWorkloadStats(events, {});
    expect(stats.totalActiveTimeMs).toBe(4000);
  });

  test('26. Large response time timeout (background tab) is capped or excluded', () => {
    const events = [
      {
        eventId: '1',
        cardId: 'c1',
        responseTimeMs: MAX_VALID_RESPONSE_TIME_MS + 50000,
        reviewedAt: Date.now(),
      },
      { eventId: '2', cardId: 'c2', responseTimeMs: 5000, reviewedAt: Date.now() },
    ];
    const stats = calculateWorkloadStats(events, {});
    expect(stats.totalActiveTimeMs).toBe(5000);
  });

  test('27. Median response time is calculated correctly', () => {
    const times = [2000, 4000, 10000];
    expect(calculateMedian(times)).toBe(4000);

    const evenTimes = [2000, 4000, 8000, 10000];
    expect(calculateMedian(evenTimes)).toBe(6000);
  });

  test('28. Workload is split by mode', () => {
    const events = [
      { eventId: '1', cardId: 'c1', mode: 'typing', responseTimeMs: 5000, reviewedAt: Date.now() },
      { eventId: '2', cardId: 'c2', mode: 'drawing', responseTimeMs: 9000, reviewedAt: Date.now() },
    ];
    const stats = calculateWorkloadStats(events, {});
    expect(stats.modeMedianTimes['typing']).toBe(5000);
    expect(stats.modeMedianTimes['drawing']).toBe(9000);
  });

  test('29. Workload is split by skill', () => {
    const events = [
      {
        eventId: '1',
        cardId: 'c1',
        skill: 'recognition',
        responseTimeMs: 3000,
        reviewedAt: Date.now(),
      },
      { eventId: '2', cardId: 'c2', skill: 'recall', responseTimeMs: 7000, reviewedAt: Date.now() },
    ];
    const stats = calculateWorkloadStats(events, {});
    expect(stats.skillMedianTimes['recognition']).toBe(3000);
    expect(stats.skillMedianTimes['recall']).toBe(7000);
  });

  test('30. Day without events is displayed with zero values', () => {
    const stats = calculateWorkloadStats([], {}, { timeRangeDays: 7 });
    expect(stats.dailyWorkload).toHaveLength(7);
    stats.dailyWorkload.forEach((d) => {
      expect(d.reviewsCount).toBe(0);
      expect(d.totalTimeMs).toBe(0);
    });
  });
});
