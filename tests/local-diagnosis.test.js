import { describe, it, expect } from 'vitest';
import { diagnoseReviewError } from '../src/ai/local-diagnosis.js';

describe('diagnoseReviewError', () => {
  const baseSnapshot = {
    schemaVersion: 1,
    item: { writing: '食べる', reading: 'たべる', meanings: ['есть'] },
    skill: 'recognition',
    mode: 'typing',
    task: { prompt: 'Введите ответ' },
    answer: { expectedAnswers: ['食べる', 'たべる'], userAnswer: '食べます' },
    result: { outcome: 'incorrect', mistakes: 1 },
    memoryContext: { stage: 'fragile', isLeech: false, recentLapse: false },
  };

  it('detects polite form instead of dictionary form with high confidence', () => {
    const diag = diagnoseReviewError(baseSnapshot);
    expect(diag.category).toBe('polite_instead_of_dictionary_form');
    expect(diag.confidence).toBe('high');
  });

  it('detects wrong particle in particle-quiz mode', () => {
    const particleSnapshot = {
      ...baseSnapshot,
      mode: 'particle-quiz',
      answer: { selectedOption: 'は', correctOption: 'が' },
    };
    const diag = diagnoseReviewError(particleSnapshot);
    expect(diag.category).toBe('wrong_particle');
    expect(diag.confidence).toBe('high');
  });

  it('detects wrong word order in sentence-building mode', () => {
    const sentenceSnapshot = {
      ...baseSnapshot,
      mode: 'sentence-building',
      answer: { userAnswer: '猫が 食べる 魚を', expectedAnswers: ['猫が 魚を 食べる'] },
    };
    const diag = diagnoseReviewError(sentenceSnapshot);
    expect(diag.category).toBe('wrong_word_order');
    expect(diag.confidence).toBe('medium');
  });

  it('returns unknown with low confidence when pattern does not match', () => {
    const unknownSnapshot = {
      ...baseSnapshot,
      answer: { userAnswer: 'xyz', expectedAnswers: ['食べる'] },
    };
    const diag = diagnoseReviewError(unknownSnapshot);
    expect(diag.category).toBe('unknown');
    expect(diag.confidence).toBe('low');
  });

  it('uses last incorrectAttempt when userAnswer is final correct or empty', () => {
    const retrySnapshot = {
      ...baseSnapshot,
      answer: {
        expectedAnswers: ['食べる'],
        userAnswer: '食べる',
        incorrectAttempts: [{ rawAnswer: '食べます', normalizedAnswer: '食べます' }],
      },
      result: { outcome: 'partial', mistakes: 1 },
    };
    const diag = diagnoseReviewError(retrySnapshot);
    expect(diag.category).toBe('polite_instead_of_dictionary_form');
    expect(diag.confidence).toBe('high');
  });
});
