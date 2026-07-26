import { describe, expect, it } from 'vitest';
import {
  createVocabularySchedule,
  distributeVocabularyAcrossDates,
} from '../src/vocabulary-schedule.js';
import { getTodayVocabularyUnlockDecision } from '../src/vocabulary-unlock-plan.js';

describe('canonical vocabulary schedule', () => {
  it('distributes 57 words evenly without re-reserving the last date', () => {
    const dates = ['2026-07-26', '2026-07-27', '2026-07-28', '2026-07-29'];
    expect(distributeVocabularyAcrossDates(57, dates)).toEqual({
      '2026-07-26': 15,
      '2026-07-27': 14,
      '2026-07-28': 14,
      '2026-07-29': 14,
    });
  });

  it('reports infeasibility instead of silently losing words above the safe maximum', () => {
    const result = createVocabularySchedule(80, ['2026-07-26', '2026-07-27', '2026-07-28'], {
      maxPerDay: 25,
    });
    expect(result).toMatchObject({
      infeasible: true,
      requiredDailyTarget: 27,
      unscheduledWords: 5,
    });
    expect(Object.values(result.schedule)).toEqual([25, 25, 25]);
  });

  it('never uses fallback 17 when a plan exists but today has no allocation', () => {
    const state = {
      studyPlan: {
        studyDaysOfWeek: [1],
        segments: [
          {
            type: 'chapter',
            chapterId: 1,
            assignedDates: ['2026-07-27'],
            vocabularySchedule: { '2026-07-27': 10 },
          },
        ],
      },
      srs: {
        L1_word_1: { id: 'L1_word_1', itemId: 'L1_word_1', planLocked: true },
      },
      vocabularyUnlocks: {},
    };
    const decision = getTodayVocabularyUnlockDecision(state, 1, {
      dateKey: '2026-07-26',
      words: [{ id: 'L1_word_1' }],
    });
    expect(decision).toMatchObject({
      shouldUnlock: false,
      target: 0,
      reason: 'no-plan-allocation',
    });
  });
});
