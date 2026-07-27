import { describe, test, expect } from 'vitest';
import { calculateRetentionStats } from '../../src/statistics/retention-statistics.js';

describe('Retention Calculations (9–16)', () => {
  test('9. Again (0) is counted as unsuccessful first attempt', () => {
    const events = [
      {
        eventId: '1',
        effectiveRating: 0,
        skill: 'recognition',
        mode: 'multiple-choice',
        reviewedAt: 1000,
      },
    ];
    const stats = calculateRetentionStats(events);
    expect(stats.overallRetention).toBe(0);
    expect(stats.successfulFirstAttempts).toBe(0);
    expect(stats.totalFirstAttempts).toBe(1);
  });

  test('10. Hard (3), Good (4), and Easy (5) are counted as successful first attempt', () => {
    const events = [
      {
        eventId: '1',
        effectiveRating: 3,
        skill: 'recognition',
        mode: 'multiple-choice',
        reviewedAt: 1000,
      },
      {
        eventId: '2',
        effectiveRating: 4,
        skill: 'recognition',
        mode: 'multiple-choice',
        reviewedAt: 1050,
      },
      {
        eventId: '3',
        effectiveRating: 5,
        skill: 'recognition',
        mode: 'multiple-choice',
        reviewedAt: 1100,
      },
    ];
    const stats = calculateRetentionStats(events);
    expect(stats.overallRetention).toBe(1.0);
    expect(stats.successfulFirstAttempts).toBe(3);
  });

  test('11. Retention does not include intra-session retry after Again', () => {
    // Both events filtered by getEffectiveReviewEvents before passing to retention
    const events = [
      {
        eventId: '1',
        effectiveRating: 0,
        skill: 'recognition',
        mode: 'multiple-choice',
        reviewedAt: 1000,
      },
    ];
    const stats = calculateRetentionStats(events);
    expect(stats.totalFirstAttempts).toBe(1);
    expect(stats.overallRetention).toBe(0);
  });

  test('12. Empty history returns insufficient-data state', () => {
    const stats = calculateRetentionStats([]);
    expect(stats.isInsufficient).toBe(true);
    expect(stats.overallRetention).toBeNull();
    expect(stats.formattedOverall).toBe('Недостаточно данных');
  });

  test('13. Retention is correctly filtered by skill', () => {
    const events = [
      {
        eventId: '1',
        effectiveRating: 4,
        skill: 'recognition',
        mode: 'multiple-choice',
        reviewedAt: 1000,
      },
      { eventId: '2', effectiveRating: 0, skill: 'recall', mode: 'typing', reviewedAt: 1000 },
    ];
    const stats = calculateRetentionStats(events);
    expect(stats.bySkill.recognition.retention).toBe(1.0);
    expect(stats.bySkill.recall.retention).toBe(0);
  });

  test('14. Retention is correctly filtered by mode', () => {
    const events = [
      {
        eventId: '1',
        effectiveRating: 4,
        skill: 'recognition',
        mode: 'multiple-choice',
        reviewedAt: 1000,
      },
      { eventId: '2', effectiveRating: 0, skill: 'recall', mode: 'typing', reviewedAt: 1000 },
    ];
    const stats = calculateRetentionStats(events);
    expect(stats.byMode['multiple-choice'].retention).toBe(1.0);
    expect(stats.byMode['typing'].retention).toBe(0);
  });

  test('15. Retention is correctly formatted for period', () => {
    const events = [
      {
        eventId: '1',
        effectiveRating: 4,
        skill: 'recognition',
        mode: 'multiple-choice',
        reviewedAt: 1000,
      },
    ];
    const stats = calculateRetentionStats(events, { timeRangeDays: 7 });
    expect(stats.formattedOverall).toBe('100.0%');
  });

  test('16. Missing days are marked as hasData=false and not forced to 0%', () => {
    const events = [
      {
        eventId: '1',
        effectiveRating: 4,
        skill: 'recognition',
        mode: 'multiple-choice',
        reviewedAt: Date.now(),
      },
    ];
    const stats = calculateRetentionStats(events, { timeRangeDays: 7 });
    const emptyPoints = stats.timeSeries.filter((pt) => !pt.hasData);
    expect(emptyPoints.length).toBeGreaterThan(0);
    emptyPoints.forEach((pt) => {
      expect(pt.retention).toBeNull();
      expect(pt.formattedRetention).toBe('—');
    });
  });
});
