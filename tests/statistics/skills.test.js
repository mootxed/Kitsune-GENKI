import { describe, test, expect } from 'vitest';
import { calculateSkillStats } from '../../src/statistics/skill-statistics.js';
import { SKILLS } from '../../src/knowledge-model.js';
import { State } from 'ts-fsrs';

describe('Skill Statistics (41–47)', () => {
  test('41. Recognition review is counted only in recognition skill', () => {
    const events = [
      {
        eventId: '1',
        skill: SKILLS.RECOGNITION,
        mode: 'multiple-choice',
        effectiveRating: 4,
        reviewedAt: Date.now(),
      },
    ];
    const stats = calculateSkillStats(events, {});
    expect(stats[SKILLS.RECOGNITION].totalAttempts).toBe(1);
    expect(stats[SKILLS.RECALL].totalAttempts).toBe(0);
  });

  test('42. Recall is not counted as context-production', () => {
    const events = [
      {
        eventId: '1',
        skill: SKILLS.RECALL,
        mode: 'typing',
        effectiveRating: 4,
        reviewedAt: Date.now(),
      },
    ];
    const stats = calculateSkillStats(events, {});
    expect(stats[SKILLS.RECALL].totalAttempts).toBe(1);
    expect(stats[SKILLS.CONTEXT_PRODUCTION].totalAttempts).toBe(0);
  });

  test('43. Drawing is counted in reading-writing skill', () => {
    const events = [
      {
        eventId: '1',
        skill: SKILLS.READING_WRITING,
        mode: 'drawing',
        effectiveRating: 4,
        reviewedAt: Date.now(),
      },
    ];
    const stats = calculateSkillStats(events, {});
    expect(stats[SKILLS.READING_WRITING].totalAttempts).toBe(1);
  });

  test('44. Skill without events shows insufficient data status', () => {
    const stats = calculateSkillStats([], {});
    expect(stats[SKILLS.RECOGNITION].isInsufficient).toBe(true);
    expect(stats[SKILLS.RECOGNITION].formattedRetention).toBe('Недостаточно данных');
  });

  test('45. Unavailable context-production is distinguished from untested', () => {
    const cardsUntested = {
      'w1::context-production': {
        id: 'w1::context-production',
        itemId: 'w1',
        skill: SKILLS.CONTEXT_PRODUCTION,
        state: State.New,
      },
    };
    const statsUntested = calculateSkillStats([], cardsUntested);
    expect(statsUntested[SKILLS.CONTEXT_PRODUCTION].statusCode).toBe('untested');

    const statsUnavailable = calculateSkillStats([], {});
    expect(statsUnavailable[SKILLS.CONTEXT_PRODUCTION].statusCode).toBe('task_unavailable');
  });

  test('46. New/learning/review/relearning states are counted accurately', () => {
    const cards = {
      c1: { id: 'c1', itemId: 'w1', skill: SKILLS.RECOGNITION, state: State.New },
      c2: { id: 'c2', itemId: 'w2', skill: SKILLS.RECOGNITION, state: State.Learning },
      c3: { id: 'c3', itemId: 'w3', skill: SKILLS.RECOGNITION, state: State.Review },
      c4: { id: 'c4', itemId: 'w4', skill: SKILLS.RECOGNITION, state: State.Relearning },
    };
    const stats = calculateSkillStats([], cards);
    expect(stats[SKILLS.RECOGNITION].newCardsCount).toBe(1);
    expect(stats[SKILLS.RECOGNITION].learningCardsCount).toBe(1);
    expect(stats[SKILLS.RECOGNITION].reviewCardsCount).toBe(1);
    expect(stats[SKILLS.RECOGNITION].relearningCardsCount).toBe(1);
  });

  test('47. Suspended cards are tracked separately', () => {
    const cards = {
      c1: {
        id: 'c1',
        itemId: 'w1',
        skill: SKILLS.RECOGNITION,
        state: State.Review,
        suspended: true,
      },
    };
    const stats = calculateSkillStats([], cards);
    expect(stats[SKILLS.RECOGNITION].suspendedCardsCount).toBe(1);
    expect(stats[SKILLS.RECOGNITION].nonSuspendedActiveCount).toBe(0);
  });
});
