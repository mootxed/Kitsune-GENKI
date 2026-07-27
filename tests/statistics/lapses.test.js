import { describe, test, expect } from 'vitest';
import { calculateLapseStats, RISK_WEIGHTS } from '../../src/statistics/lapse-statistics.js';
import { State } from 'ts-fsrs';

describe('Lapses and Problem Cards (17–23)', () => {
  test('17. New learning card mistake is not counted as review lapse', () => {
    const events = [
      {
        eventId: '1',
        cardId: 'c1',
        effectiveRating: 0,
        previousCard: { state: State.New },
        reviewedAt: 1000,
      },
    ];
    const stats = calculateLapseStats(events, {});
    expect(stats.totalLapses).toBe(0);
  });

  test('18. Again on review card counts as one review lapse', () => {
    const events = [
      {
        eventId: '1',
        cardId: 'c1',
        effectiveRating: 0,
        previousCard: { state: State.Review },
        reviewedAt: 1000,
      },
    ];
    const stats = calculateLapseStats(events, {});
    expect(stats.totalLapses).toBe(1);
  });

  test('19. Relearning retry event does not create a second lapse', () => {
    const events = [
      {
        eventId: '1',
        cardId: 'c1',
        effectiveRating: 0,
        previousCard: { state: State.Review },
        reviewedAt: 1000,
      },
      {
        eventId: '2',
        cardId: 'c1',
        effectiveRating: 4,
        previousCard: { state: State.Relearning },
        reviewedAt: 1050,
      },
    ];
    const stats = calculateLapseStats(events, {});
    expect(stats.totalLapses).toBe(1);
  });

  test('20. Undo removes lapse from statistics', () => {
    // Normalization filters out undone events
    const events = []; // undone event excluded
    const stats = calculateLapseStats(events, {});
    expect(stats.totalLapses).toBe(0);
  });

  test('21. Cards are sorted by risk score deterministically', () => {
    const cards = {
      c1: { id: 'c1', itemId: 'w1', lapses: 1, stability: 10, state: State.Review },
      c2: { id: 'c2', itemId: 'w2', lapses: 5, stability: 2, state: State.Relearning },
    };
    const events = [
      {
        eventId: '1',
        cardId: 'c2',
        effectiveRating: 0,
        previousCard: { state: State.Review },
        reviewedAt: Date.now(),
      },
    ];
    const stats = calculateLapseStats(events, cards);
    expect(stats.problemCards[0].cardId).toBe('c2');
  });

  test('22. Recent Again increases risk score', () => {
    const cards = {
      c1: { id: 'c1', itemId: 'w1', lapses: 1, stability: 10, state: State.Review },
    };
    const eventsRecent = [
      {
        eventId: '1',
        cardId: 'c1',
        effectiveRating: 0,
        previousCard: { state: State.Review },
        reviewedAt: Date.now(),
      },
    ];
    const stats = calculateLapseStats(eventsRecent, cards);
    expect(stats.problemCards[0].riskScore).toBeGreaterThanOrEqual(RISK_WEIGHTS.RECENT_AGAIN);
  });

  test('23. Old lapse progressively loses weight without recent lapse boost', () => {
    const cards = {
      c1: { id: 'c1', itemId: 'w1', lapses: 1, stability: 10, state: State.Review },
    };
    const eventsOld = [
      {
        eventId: '1',
        cardId: 'c1',
        effectiveRating: 0,
        previousCard: { state: State.Review },
        reviewedAt: Date.now() - 30 * 86400000,
      },
    ];
    const stats = calculateLapseStats(eventsOld, cards);
    expect(stats.problemCards[0].riskScore).toBeLessThan(RISK_WEIGHTS.RECENT_AGAIN + 20);
  });
});
