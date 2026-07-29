import { describe, it, expect } from 'vitest';
import { ReviewAttemptSnapshotSchema } from '../src/ai/review-attempt-schema.js';

describe('ReviewAttemptSnapshotSchema', () => {
  it('validates a complete valid snapshot without FSRS internals', () => {
    const validSnapshot = {
      schemaVersion: 1,
      item: {
        writing: '食べる',
        reading: 'たべる',
        meanings: ['есть', 'кушать'],
        partOfSpeech: ['verb'],
      },
      skill: 'recognition',
      mode: 'typing',
      task: {
        prompt: 'Введите перевод',
        instruction: null,
        contextSentence: null,
        contextTranslation: null,
      },
      answer: {
        expectedAnswers: ['食べる'],
        userAnswer: '食べます',
        selectedOption: null,
        correctOption: '食べる',
      },
      result: {
        outcome: 'incorrect',
        mistakes: 1,
        hintUsed: false,
        firstAttemptCorrect: false,
        responseTimeBand: 'normal',
      },
      memoryContext: {
        stage: 'fragile',
        isLeech: false,
        recentLapse: true,
      },
    };

    const result = ReviewAttemptSnapshotSchema.safeParse(validSnapshot);
    expect(result.success).toBe(true);
  });

  it('rejects forbidden FSRS or internal fields (strict mode)', () => {
    const dirtySnapshot = {
      schemaVersion: 1,
      item: {
        writing: '食べる',
        reading: 'たべる',
        meanings: ['есть'],
        partOfSpeech: [],
      },
      skill: 'recognition',
      mode: 'typing',
      task: {
        prompt: 'Test',
        instruction: null,
        contextSentence: null,
        contextTranslation: null,
      },
      answer: {
        expectedAnswers: ['食べる'],
        userAnswer: 'taberu',
        selectedOption: null,
        correctOption: '食べる',
      },
      result: {
        outcome: 'incorrect',
        mistakes: 1,
        hintUsed: false,
        firstAttemptCorrect: false,
        responseTimeBand: 'normal',
      },
      memoryContext: {
        stage: 'fragile',
        isLeech: false,
        recentLapse: false,
      },
      // Forbidden fields!
      cardId: 'card-123',
      stability: 4.5,
      difficulty: 6.2,
    };

    const result = ReviewAttemptSnapshotSchema.safeParse(dirtySnapshot);
    expect(result.success).toBe(false);
  });
});
