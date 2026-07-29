import { describe, it, expect } from 'vitest';
import {
  adaptTypingContext,
  adaptMultipleChoiceContext,
  adaptParticleQuizContext,
  adaptDrawingContext,
} from '../ui/flashcards/review-context-adapters.js';

describe('Review Context Adapters', () => {
  it('adaptTypingContext correctly formats attempt', () => {
    const res = adaptTypingContext({
      word: { translation: 'собака' },
      acceptedAnswers: ['いぬ', '犬'],
      userAnswer: 'ねこ',
      mistakes: 1,
      hintUsed: false,
      firstAttemptCorrect: false,
    });

    expect(res.userAnswer).toBe('ねこ');
    expect(res.expectedAnswers).toEqual(['いぬ', '犬']);
    expect(res.mistakes).toBe(1);
  });

  it('adaptMultipleChoiceContext correctly formats attempt', () => {
    const res = adaptMultipleChoiceContext({
      word: { id: 'w1' },
      displayQuestion: 'Переведите: 犬',
      selectedText: 'Кошка',
      correctText: 'Собака',
      mode: 'multiple-choice',
      mistakes: 1,
      firstAttemptCorrect: false,
    });

    expect(res.selectedOption).toBe('Кошка');
    expect(res.correctOption).toBe('Собака');
    expect(res.prompt).toBe('Переведите: 犬');
  });

  it('adaptParticleQuizContext correctly replaces slot', () => {
    const res = adaptParticleQuizContext({
      quizData: { sentence: '猫 [_] います', correctParticle: 'が', russianHint: 'Есть кошка' },
      selectedParticle: 'は',
      mistakes: 1,
      firstAttemptCorrect: false,
    });

    expect(res.contextSentence).toBe('猫 ___ います');
    expect(res.selectedOption).toBe('は');
    expect(res.correctOption).toBe('が');
  });

  it('adaptDrawingContext does not include canvas or stroke data', () => {
    const res = adaptDrawingContext({
      kanji: '日',
      reading: 'にち',
      translation: 'день',
      totalMistakes: 2,
      hintUsed: true,
    });

    expect(res.correctOption).toBe('日');
    expect(res.mistakes).toBe(2);
    expect(res.userAnswer).toBeNull();
    expect(res.modeSpecific).not.toHaveProperty('strokes');
    expect(res.modeSpecific).not.toHaveProperty('canvas');
  });
});
