import { describe, it, expect } from 'vitest';
import { getDailyStudyDigest, formatMinutesPlural } from '../src/daily-study-digest.js';
import { State } from 'ts-fsrs';

describe('Daily Study Digest & Time Estimation', () => {
  it('formats Russian plurals for minutes correctly', () => {
    expect(formatMinutesPlural(1)).toBe('1 минута');
    expect(formatMinutesPlural(21)).toBe('21 минута');
    expect(formatMinutesPlural(2)).toBe('2 минуты');
    expect(formatMinutesPlural(4)).toBe('4 минуты');
    expect(formatMinutesPlural(22)).toBe('22 минуты');
    expect(formatMinutesPlural(5)).toBe('5 минут');
    expect(formatMinutesPlural(11)).toBe('11 минут');
    expect(formatMinutesPlural(14)).toBe('14 минут');
    expect(formatMinutesPlural(25)).toBe('25 минут');
  });

  it('calculates digest correctly with both reviews and new items using fallbacks', () => {
    const now = Date.now();
    const state = {
      srs: {
        L1_w1: { id: 'L1_w1', state: State.Review, due: new Date(now - 1000).toISOString() },
        'L1_w2::recall': {
          id: 'L1_w2::recall',
          state: State.Review,
          due: new Date(now - 1000).toISOString(),
        },
        // Two skill cards for the same new word item 'L1_w3'
        L1_w3: { id: 'L1_w3', state: State.New, due: new Date(now - 1000).toISOString() },
        'L1_w3::recall': {
          id: 'L1_w3::recall',
          state: State.New,
          due: new Date(now - 1000).toISOString(),
        },
      },
      reviewEvents: [],
      history: {},
    };

    const digest = getDailyStudyDigest(state, { now });

    expect(digest.dueReviewCards).toBe(2);
    // 2 skill cards for 1 word item L1_w3 => 1 available new item card in session
    expect(digest.availableNewItems).toBe(1);
    expect(digest.availableCardCount).toBe(3);
    expect(digest.isComplete).toBe(false);
    // Fallback: 2 reviews * 15s + 1 new item * 30s = 60s => 1 minute ("< 1 минуты" if < 60s, or 1m if 60s)
    expect(digest.estimatedSeconds).toBe(60);
    expect(digest.durationText).toBe('≈ 1 минута');
    expect(digest.summaryText).toBe('2 повторения · 1 новых');
  });

  it('calculates digest with only reviews', () => {
    const now = Date.now();
    const state = {
      srs: {
        L1_w1: { id: 'L1_w1', state: State.Review, due: new Date(now - 1000).toISOString() },
      },
      reviewEvents: [],
    };

    const digest = getDailyStudyDigest(state, { now });
    expect(digest.dueReviewCards).toBe(1);
    expect(digest.availableNewItems).toBe(0);
    expect(digest.summaryText).toBe('1 повторение');
  });

  it('calculates digest with only new items', () => {
    const now = Date.now();
    const state = {
      srs: {
        L1_w1: { id: 'L1_w1', state: State.New, due: new Date(now - 1000).toISOString() },
      },
      reviewEvents: [],
    };

    const digest = getDailyStudyDigest(state, { now });
    expect(digest.dueReviewCards).toBe(0);
    expect(digest.availableNewItems).toBe(1);
    expect(digest.summaryText).toBe('1 новых слов');
  });

  it('handles complete digest when all cards are completed', () => {
    const state = { srs: {}, reviewEvents: [] };
    const digest = getDailyStudyDigest(state);
    expect(digest.isComplete).toBe(true);
    expect(digest.availableCardCount).toBe(0);
    expect(digest.summaryText).toBe('На сегодня всё выполнено 🎉');
    expect(digest.durationText).toBe('Готово на сегодня');
  });

  it('uses median responseTime from reviewEvents with clamping', () => {
    const now = Date.now();
    const state = {
      srs: {
        L1_w1: { id: 'L1_w1', state: State.Review, due: new Date(now - 1000).toISOString() },
        L1_w2: { id: 'L1_w2', state: State.New, due: new Date(now - 1000).toISOString() },
      },
      reviewEvents: [
        // Outlier 500s -> should be clamped to max limit 60s
        { cardId: 'L1_w1', stateBefore: State.Review, responseTimeMs: 500000 },
        { cardId: 'L1_w1', stateBefore: State.Review, responseTimeMs: 400000 },
        // Outlier 1s -> should be clamped to min limit 10s for new item
        { cardId: 'L1_w2', stateBefore: State.New, responseTimeMs: 1000 },
      ],
    };

    const digest = getDailyStudyDigest(state, { now });
    // Review median: 450s clamped to 60s
    // New item median: 1s clamped to 10s
    // Total = 1 * 60 + 1 * 10 = 70s -> 1 min
    expect(digest.estimatedSeconds).toBe(70);
    expect(digest.durationText).toBe('≈ 1 минута');
  });
});
