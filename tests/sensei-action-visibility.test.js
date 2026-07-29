import { describe, it, expect } from 'vitest';
import { shouldShowSenseiAction } from '../ui/flashcards/sensei-review-actions.js';

describe('shouldShowSenseiAction visibility policy', () => {
  const baseSnapshot = {
    schemaVersion: 1,
    item: { writing: '本', reading: 'ほん', meanings: ['книга'] },
    skill: 'recognition',
    mode: 'typing',
    task: { prompt: 'Введите ответ' },
    answer: { expectedAnswers: ['ほん'] },
    result: {
      outcome: 'correct',
      mistakes: 0,
      hintUsed: false,
      firstAttemptCorrect: true,
      responseTimeBand: 'fast',
    },
    memoryContext: { stage: 'stable', isLeech: false, recentLapse: false },
  };

  it('hides Sensei on perfect response for non-leech card', () => {
    const res = shouldShowSenseiAction(baseSnapshot);
    expect(res.show).toBe(false);
    expect(res.actions).toHaveLength(0);
  });

  it('shows explain_error on error', () => {
    const errorSnapshot = {
      ...baseSnapshot,
      result: {
        ...baseSnapshot.result,
        outcome: 'incorrect',
        mistakes: 1,
        firstAttemptCorrect: false,
      },
    };
    const res = shouldShowSenseiAction(errorSnapshot);
    expect(res.show).toBe(true);
    expect(res.actions[0].actionType).toBe('explain_error');
  });

  it('shows BOTH explain_error AND mnemonic when leech card has an error', () => {
    const leechErrorSnapshot = {
      ...baseSnapshot,
      result: { ...baseSnapshot.result, outcome: 'incorrect', mistakes: 1 },
      memoryContext: { ...baseSnapshot.memoryContext, isLeech: true },
    };
    const res = shouldShowSenseiAction(leechErrorSnapshot);
    expect(res.show).toBe(true);
    expect(res.actions).toHaveLength(2);
    expect(res.actions[0].actionType).toBe('explain_error');
    expect(res.actions[1].actionType).toBe('mnemonic');
  });

  it('shows explain_more when hint was used on correct response', () => {
    const hintSnapshot = {
      ...baseSnapshot,
      result: { ...baseSnapshot.result, outcome: 'hinted', hintUsed: true },
    };
    const res = shouldShowSenseiAction(hintSnapshot);
    expect(res.show).toBe(true);
    expect(res.actions[0].actionType).toBe('explain_more');
  });

  it('shows mnemonic on successful review of leech card', () => {
    const leechSuccessSnapshot = {
      ...baseSnapshot,
      memoryContext: { ...baseSnapshot.memoryContext, isLeech: true },
    };
    const res = shouldShowSenseiAction(leechSuccessSnapshot);
    expect(res.show).toBe(true);
    expect(res.actions).toHaveLength(1);
    expect(res.actions[0].actionType).toBe('mnemonic');
  });

  it('never shows actions on technical fallback modes', () => {
    const fallbackSnapshot = {
      ...baseSnapshot,
      mode: 'system-fallback',
      result: { ...baseSnapshot.result, outcome: 'incorrect' },
    };
    const res = shouldShowSenseiAction(fallbackSnapshot);
    expect(res.show).toBe(false);
  });
});
