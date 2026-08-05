import { describe, it, expect } from 'vitest';
import { getCardSchedulingReason, REASON_CODES } from '../src/reason-model.js';

describe('Card Scheduling Reason Model', () => {
  it('identifies supplemental practice cards', () => {
    const reason = getCardSchedulingReason({
      card: { id: 'genki-1:1:1:vocab', isSupplemental: true },
      reviewContext: { mode: 'workbook' },
    });
    expect(reason.code).toBe(REASON_CODES.SUPPLEMENTAL_PRACTICE);
    expect(reason.category).toBe('supplemental');
    expect(reason.title).toBe('Дополнительная практика');
  });

  it('identifies session relearning cards after error', () => {
    const reason = getCardSchedulingReason({
      card: { id: 'genki-1:1:1:vocab', reps: 1 },
      sessionContext: { sessionLapses: 1, isFirstAttempt: false },
    });
    expect(reason.code).toBe(REASON_CODES.FSRS_RELEARNING);
    expect(reason.category).toBe('relearning');
    expect(reason.title).toBe('Повторное обучение');
  });

  it('identifies new material cards from study plan', () => {
    const reason = getCardSchedulingReason({
      card: { id: 'genki-1:2:1:vocab', state: 0, reps: 0 },
    });
    expect(reason.code).toBe(REASON_CODES.NEW_PLAN_ITEM);
    expect(reason.category).toBe('plan-new');
    expect(reason.title).toBe('Новый материал');
  });

  it('identifies overdue FSRS reviews correctly', () => {
    const now = Date.now();
    const twoDaysAgo = new Date(now - 2 * 86400000).toISOString();
    const reason = getCardSchedulingReason({
      card: {
        id: 'genki-1:1:1:vocab',
        state: 2,
        reps: 3,
        due: twoDaysAgo,
        stability: 5.0,
        lastReview: twoDaysAgo,
      },
      now,
    });
    expect(reason.code).toBe(REASON_CODES.FSRS_OVERDUE);
    expect(reason.category).toBe('required-review');
    expect(reason.details.daysOverdue).toBe(2);
  });

  it('provides stable codes and testable details without unrounded floats', () => {
    const now = Date.now();
    const reason = getCardSchedulingReason({
      card: {
        id: 'genki-1:1:1:vocab',
        state: 2,
        reps: 2,
        due: new Date(now).toISOString(),
        stability: 4.12345,
        lastReview: new Date(now - 86400000).toISOString(),
      },
      now,
    });
    expect(reason.code).toBe(REASON_CODES.FSRS_DUE_REVIEW);
    if (reason.details.retrievability != null) {
      expect(Number.isInteger(reason.details.retrievability)).toBe(true);
    }
  });
});
