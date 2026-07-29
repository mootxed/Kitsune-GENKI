import { describe, it, expect } from 'vitest';
import { handleExplainReviewError } from '../src/ai/handlers/explain-review-error.js';

describe('handleExplainReviewError', () => {
  const validSnapshot = {
    schemaVersion: 1,
    item: { writing: '行きます', reading: 'いきます', meanings: ['идти'] },
    skill: 'recognition',
    mode: 'typing',
    task: { prompt: 'Напишите слово' },
    answer: { expectedAnswers: ['行く'], userAnswer: '行きます' },
    result: {
      outcome: 'incorrect',
      mistakes: 1,
      hintUsed: false,
      firstAttemptCorrect: false,
      responseTimeBand: 'normal',
    },
    memoryContext: { stage: 'fragile', isLeech: false, recentLapse: false },
  };

  it('runs explain_review_error and returns validated artifact with 1-4 quiz questions', async () => {
    const mockRequest = async () =>
      JSON.stringify({
        type: 'review_explanation',
        diagnosis: {
          category: 'polite_instead_of_dictionary_form',
          message: 'Использована вежливая форма вместо словарной.',
        },
        explanation: 'В задании требовалась простая словарная форма (行きます → 行く).',
        comparison: [
          { form: '行く', reading: 'いく', role: 'Словарная форма', isExpected: true },
          { form: '行きます', reading: 'いきます', role: 'Введённый ответ', isExpected: false },
        ],
        examples: [
          { japanese: '明日、図書館へ行く。', translation: 'Завтра я пойду в библиотеку.' },
        ],
        quiz: {
          questions: [
            {
              id: 'q1',
              type: 'dictionary_form',
              prompt: 'Какова словарная форма глагола 食べます?',
              topic: 'Глаголы',
              options: [
                { text: '食べる', isCorrect: true },
                { text: '食べた', isCorrect: false },
              ],
              explanation: 'Словарная форма II группы оканчивается на る.',
            },
          ],
        },
      });

    const res = await handleExplainReviewError({
      input: {
        attempt: validSnapshot,
        localDiagnosis: { category: 'polite_instead_of_dictionary_form', confidence: 'high' },
      },
      request: mockRequest,
    });

    if (!res.success) {
      console.log('Test failed with issues:', JSON.stringify(res.issues, null, 2));
    }

    expect(res.success).toBe(true);
    expect(res.artifact.type).toBe('review_explanation');
    expect(res.artifact.quiz.questions).toHaveLength(1);
  });
});
