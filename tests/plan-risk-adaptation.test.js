import { describe, it, expect } from 'vitest';
import { evaluatePlanRiskAndAdaptation, RISK_LEVELS } from '../src/plan-risk-adaptation.js';

describe('Plan Risk Model & Load Adaptation', () => {
  it('evaluates normal plan risk when load is within capacity', () => {
    const fixedNow = new Date('2026-08-05T12:00:00Z').getTime();
    const state = {
      dailyCapacityMinutes: 30,
      studyPlan: { studyDaysOfWeek: [1, 2, 3, 4, 5, 6, 0] },
      srs: {
        'card-1': { id: 'card-1', reps: 1, due: '2026-08-05T10:00:00Z' },
      },
    };

    const res = evaluatePlanRiskAndAdaptation({ state, now: fixedNow });
    expect(res.risk).toBe(RISK_LEVELS.NORMAL);
    expect(res.isRecoveryMode).toBe(false);
    expect(res.decisionExplanation.decision).toBe('KEEP_CAPACITY');
  });

  it('recommends reducing new cards during recovery mode without hiding FSRS reviews', () => {
    const fixedNow = new Date('2026-08-05T12:00:00Z').getTime();
    const srs = {};
    for (let i = 0; i < 35; i++) {
      srs[`card-${i}`] = { id: `card-${i}`, reps: 1, due: '2026-08-01T10:00:00Z' };
    }
    const state = { dailyCapacityMinutes: 25, srs };

    const res = evaluatePlanRiskAndAdaptation({ state, now: fixedNow });
    expect(res.risk).toBe(RISK_LEVELS.RECOVERY);
    expect(res.isRecoveryMode).toBe(true);
    expect(res.recommendedNewCards).toBeLessThan(10);
    expect(res.decisionExplanation.inputs.overdueReviews).toBeGreaterThan(0);
  });
});
