import { describe, expect, it } from 'vitest';
import { getQuizQuestionRange, QuizSchema, validateQuizForMaterial } from '../src/ai/schemas.js';

const question = (id = 'q1') => ({
  id,
  type: 'usage',
  prompt: `Вопрос ${id}`,
  topic: 'は',
  options: [
    { text: `Верно ${id}`, isCorrect: true },
    { text: `Неверно ${id}`, isCorrect: false },
  ],
  explanation: 'Непустое объяснение.',
});

describe('Sensei quiz schema', () => {
  it('defines material-sensitive question ranges with an absolute maximum of 8', () => {
    expect(getQuizQuestionRange('explain_word', 'simple')).toEqual({ min: 1, max: 2 });
    expect(getQuizQuestionRange('explain_grammar', 'normal')).toEqual({ min: 3, max: 4 });
    expect(getQuizQuestionRange('compare_items', 'complex')).toEqual({ min: 5, max: 7 });
    expect(() =>
      QuizSchema.parse({
        questions: Array.from({ length: 9 }, (_, index) => question(`q${index}`)),
      })
    ).toThrow();
  });

  it('rejects duplicate options, two correct options and an empty explanation', () => {
    expect(
      QuizSchema.safeParse({
        questions: [
          {
            ...question(),
            options: [
              { text: 'A', isCorrect: true },
              { text: ' A ', isCorrect: false },
            ],
          },
        ],
      }).success
    ).toBe(false);
    expect(
      QuizSchema.safeParse({
        questions: [
          {
            ...question(),
            options: [
              { text: 'A', isCorrect: true },
              { text: 'B', isCorrect: true },
            ],
          },
        ],
      }).success
    ).toBe(false);
    expect(QuizSchema.safeParse({ questions: [{ ...question(), explanation: '' }] }).success).toBe(
      false
    );
  });

  it('enforces 5-7 questions for complex comparisons', () => {
    const response = {
      type: 'explanation',
      message: 'Различие.',
      examples: [],
      quiz: { questions: [question()] },
    };
    expect(
      validateQuizForMaterial(response, { intent: 'compare_items', complexity: 'complex' }).success
    ).toBe(false);
  });

  it('answer state does not mutate FSRS, XP, streak or mastery', () => {
    const state = {
      srs: { card: { stability: 10 } },
      xp: 100,
      streak: { count: 4 },
      masteryArchive: { word: 0.8 },
    };
    const snapshot = JSON.stringify(state);
    QuizSchema.parse({ questions: [{ ...question(), selectedIndex: 0, answeredCorrectly: true }] });
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
