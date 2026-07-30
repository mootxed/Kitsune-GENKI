import { describe, expect, it, vi } from 'vitest';
import {
  buildVocabularyBatchSessionQueue,
  startVocabularyBatchSession,
} from '../src/vocabulary-unlock-plan.js';

function card(id, overrides = {}) {
  return {
    id,
    itemId: id.split('::')[0],
    lessonId: 1,
    skill: 'recognition',
    planLocked: false,
    suspended: false,
    ...overrides,
  };
}

describe('Vocabulary batch session integration', () => {
  it('starts the real session with cards from only the requested batch', () => {
    const state = {
      vocabularyUnlocks: {
        1: {
          '2026-07-26': { itemIds: ['L1_word_1', 'L1_word_2'] },
          '2026-07-27': { itemIds: ['L1_word_3'] },
        },
      },
      srs: {
        L1_word_1: card('L1_word_1'),
        L1_word_2: card('L1_word_2'),
        L1_word_3: card('L1_word_3'),
        L2_word_1: card('L2_word_1'),
      },
    };
    const startSession = vi.fn();

    const result = startVocabularyBatchSession({
      state,
      chapterId: '1',
      dateKey: '2026-07-26',
      startSession,
    });

    expect(result).toEqual({
      started: true,
      chapterId: '1',
      batchDateKey: '2026-07-26',
      itemCount: 2,
      cardCount: 2,
    });
    expect(startSession).toHaveBeenCalledOnce();
    expect(startSession.mock.calls[0][0]).toBe('1');
    expect(startSession.mock.calls[0][1].map((entry) => entry.itemId)).toEqual([
      'L1_word_1',
      'L1_word_2',
    ]);
  });

  it('excludes plan-locked and suspended cards from the queue', () => {
    const state = {
      vocabularyUnlocks: {
        1: {
          '2026-07-26': {
            itemIds: ['L1_word_1', 'L1_word_2', 'L1_word_3'],
          },
        },
      },
      srs: {
        L1_word_1: card('L1_word_1'),
        L1_word_2: card('L1_word_2', { planLocked: true }),
        L1_word_3: card('L1_word_3', { suspended: true }),
      },
    };

    expect(
      buildVocabularyBatchSessionQueue(state, 1, '2026-07-26').map((entry) => entry.itemId)
    ).toEqual(['L1_word_1']);
  });

  it('does not start an empty batch and always returns a structured result', () => {
    const startSession = vi.fn();
    const result = startVocabularyBatchSession({
      state: { vocabularyUnlocks: {}, srs: {} },
      chapterId: '1',
      dateKey: '2026-07-26',
      startSession,
    });

    expect(result).toEqual({
      started: false,
      reason: 'empty-batch',
      chapterId: '1',
      batchDateKey: '2026-07-26',
      itemCount: 0,
      cardCount: 0,
    });
    expect(startSession).not.toHaveBeenCalled();
  });
});
