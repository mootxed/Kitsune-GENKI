/* tests/ai-mnemonic-confusion.test.js — Unit tests for AI mnemonic confusion extraction */

import { describe, it, expect } from 'vitest';
import { getLastConfusion } from '../src/ai/local-diagnosis.js';
import { buildSenseiActionInput } from '../ui/flashcards/sensei-review-actions.js';

describe('AI Mnemonic Confusion Extraction', () => {
  it('returns last incorrect attempt from incorrectAttempts even when userAnswer contains the final correct answer', () => {
    const answer = {
      expectedAnswers: ['たべます'],
      userAnswer: 'たべます', // User eventually answered correctly
      selectedOption: null,
      incorrectAttempts: [
        { rawAnswer: 'たべました', normalizedAnswer: 'たべました' },
        { rawAnswer: 'たべない', normalizedAnswer: 'たべない' },
      ],
    };

    const confusion = getLastConfusion(answer);
    expect(confusion).toBe('たべない');
  });

  it('falls back to userAnswer or selectedOption if incorrectAttempts is empty', () => {
    const answer1 = {
      userAnswer: 'たべました',
      selectedOption: null,
      incorrectAttempts: [],
    };
    expect(getLastConfusion(answer1)).toBe('たべました');

    const answer2 = {
      userAnswer: null,
      selectedOption: 'Option B',
      incorrectAttempts: [],
    };
    expect(getLastConfusion(answer2)).toBe('Option B');
  });

  it('correctly sets confusion in buildSenseiActionInput for mnemonic action', () => {
    const snapshot = {
      item: { writing: '食べる', meanings: ['есть'] },
      skill: 'recall',
      mode: 'typing',
      answer: {
        expectedAnswers: ['たべます'],
        userAnswer: 'たべます', // Final correct answer
        selectedOption: null,
        incorrectAttempts: [{ rawAnswer: 'たべた', normalizedAnswer: 'たべた' }],
      },
    };

    const input = buildSenseiActionInput(snapshot, 'mnemonic');
    expect(input.confusion).toBe('たべた');
  });
});
