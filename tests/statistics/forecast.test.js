import { describe, test, expect } from 'vitest';
import {
  calculateForecastStats,
  DEFAULT_CARD_TIME_MS,
} from '../../src/statistics/forecast-statistics.js';
import { State } from 'ts-fsrs';

describe('Repetition Forecast (31–40)', () => {
  const now = new Date(2026, 6, 27, 12, 0).getTime();

  test('31. Card due tomorrow is included in tomorrow forecast', () => {
    const tomorrowMs = now + 86400000;
    const cards = {
      c1: { id: 'c1', due: tomorrowMs, state: State.Review },
    };
    const forecast = calculateForecastStats(cards, [], { now });
    expect(forecast.dueTomorrowCount).toBe(1);
    expect(forecast.byDay14[1].reviewsCount).toBe(1);
  });

  test('32. Suspended card is excluded from forecast', () => {
    const tomorrowMs = now + 86400000;
    const cards = {
      c1: { id: 'c1', due: tomorrowMs, state: State.Review, suspended: true },
    };
    const forecast = calculateForecastStats(cards, [], { now });
    expect(forecast.dueTomorrowCount).toBe(0);
  });

  test('33. PlanLocked card is excluded from forecast', () => {
    const tomorrowMs = now + 86400000;
    const cards = {
      c1: { id: 'c1', due: tomorrowMs, state: State.Review, planLocked: true },
    };
    const forecast = calculateForecastStats(cards, [], { now });
    expect(forecast.dueTomorrowCount).toBe(0);
  });

  test('34. Overdue card is included in today workload forecast', () => {
    const pastMs = now - 86400000 * 2;
    const cards = {
      c1: { id: 'c1', due: pastMs, state: State.Review },
    };
    const forecast = calculateForecastStats(cards, [], { now });
    expect(forecast.dueTodayCount).toBe(1);
    expect(forecast.byDay14[0].reviewsCount).toBe(1);
  });

  test('35. Card at local day boundary is mapped to correct date', () => {
    const nightMs = new Date(2026, 6, 28, 1, 0).getTime();
    const cards = {
      c1: { id: 'c1', due: nightMs, state: State.Review },
    };
    const forecast = calculateForecastStats(cards, [], { now, dayBoundaryHour: 4 });
    expect(forecast.dueTodayCount).toBe(1);
  });

  test('36. New cards are displayed separately from reviews', () => {
    const cards = {
      c1: { id: 'c1', due: now, state: State.New },
      c2: { id: 'c2', due: now, state: State.Review },
    };
    const forecast = calculateForecastStats(cards, [], { now });
    expect(forecast.plannedNewCardsCount).toBe(1);
    expect(forecast.scheduledReviewsCount).toBe(1);
  });

  test('37. Duration forecast uses median mode time when available', () => {
    const tomorrowMs = now + 86400000;
    const cards = {
      c1: { id: 'c1', mode: 'drawing', due: tomorrowMs, state: State.Review },
    };
    const events = [
      { eventId: 'e1', mode: 'drawing', responseTimeMs: 12000, reviewedAt: now - 1000 },
    ];
    const forecast = calculateForecastStats(cards, events, { now });
    expect(forecast.byDay14[1].estimatedTimeMs).toBe(12000);
  });

  test('38. Skill fallback is used when mode history is absent', () => {
    const tomorrowMs = now + 86400000;
    const cards = {
      c1: {
        id: 'c1::recall',
        skill: 'recall',
        mode: 'unknown-mode',
        due: tomorrowMs,
        state: State.Review,
      },
    };
    const events = [
      { eventId: 'e1', skill: 'recall', responseTimeMs: 9000, reviewedAt: now - 1000 },
    ];
    const forecast = calculateForecastStats(cards, events, { now });
    expect(forecast.byDay14[1].estimatedTimeMs).toBe(9000);
  });

  test('39. Default fallback is used when no history is present', () => {
    const tomorrowMs = now + 86400000;
    const cards = {
      c1: { id: 'c1', due: tomorrowMs, state: State.Review },
    };
    const forecast = calculateForecastStats(cards, [], { now });
    expect(forecast.byDay14[1].estimatedTimeMs).toBe(DEFAULT_CARD_TIME_MS);
  });

  test('40. Due modification updates forecast without altering review history', () => {
    const cards = {
      c1: { id: 'c1', due: now + 86400000, state: State.Review },
    };
    const f1 = calculateForecastStats(cards, [], { now });
    expect(f1.dueTomorrowCount).toBe(1);

    cards.c1.due = now + 86400000 * 2;
    const f2 = calculateForecastStats(cards, [], { now });
    expect(f2.dueTomorrowCount).toBe(0);
    expect(f2.dueDays2to7Count).toBe(1);
  });
});
