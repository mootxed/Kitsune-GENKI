import { describe, it, expect } from 'vitest';
import { calculateSevenDayForecast } from '../src/forecast-service.js';

describe('7-Day Load Forecast Service', () => {
  it('calculates deterministic 7-day forecast with fixed timestamp', () => {
    const fixedNow = new Date('2026-08-05T12:00:00Z').getTime();
    const state = {
      dailyCapacityMinutes: 30,
      studyPlan: {
        studyDaysOfWeek: [1, 2, 3, 4, 5, 6, 0],
        paused: false,
      },
      srs: {
        'card-1': { id: 'card-1', reps: 1, due: '2026-08-05T10:00:00Z' },
        'card-2': { id: 'card-2', reps: 2, due: '2026-08-06T10:00:00Z' },
        'card-3': { id: 'card-3', reps: 1, due: '2026-08-07T10:00:00Z' },
      },
    };

    const forecast = calculateSevenDayForecast({ state, now: fixedNow });
    expect(forecast.days.length).toBe(7);
    expect(forecast.days[0].date).toBe('2026-08-05');
    expect(forecast.days[0].dueReviews).toBe(1);
    expect(forecast.days[1].date).toBe('2026-08-06');
    expect(forecast.days[1].dueReviews).toBe(1);
    expect(forecast.totalMinutes).toBeGreaterThan(0);
    expect(forecast.risk).toBeDefined();
  });

  it('detects recovery risk level when large review backlog exists', () => {
    const fixedNow = new Date('2026-08-05T12:00:00Z').getTime();
    const srs = {};
    for (let i = 0; i < 40; i++) {
      srs[`backlog-card-${i}`] = { id: `backlog-card-${i}`, reps: 1, due: '2026-08-01T10:00:00Z' };
    }
    const state = { dailyCapacityMinutes: 25, srs };

    const forecast = calculateSevenDayForecast({ state, now: fixedNow });
    expect(forecast.backlogCount).toBe(40);
    expect(forecast.risk).toBe('recovery');
  });
});
