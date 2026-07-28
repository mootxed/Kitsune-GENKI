import { describe, expect, it } from 'vitest';
import { runSenseiPipeline } from '../src/ai/pipeline.js';

describe('Story Understanding Quiz Pipeline Integration', () => {
  it('preserves storyContext through IntentRouterSchema, pipeline, and context builder', async () => {
    const storyContext = {
      storyMessageId: 'msg-123',
      sentences: [
        { japanese: '昔々、おじいさんがいました。', translation: 'Давным-давно жил-был дедушка.' },
        { japanese: '山へ柴刈りに行きました。', translation: 'Он пошёл в горы собирать хворост.' },
      ],
    };

    let capturedContext = null;
    const mockRequest = async (messages) => {
      const userMessage = messages.find((m) => m.role === 'user')?.content || '';
      if (userMessage.includes('Ограниченный контекст')) {
        capturedContext = JSON.parse(userMessage.split('Ограниченный контекст:\n')[1]);
      }
      return JSON.stringify({
        type: 'quiz',
        message: 'Квиз по истории',
        quiz: {
          questions: [
            {
              id: 'q1',
              type: 'translation',
              prompt: 'Куда пошёл дедушка?',
              topic: 'Понимание истории',
              options: [
                { text: 'В горы', isCorrect: true },
                { text: 'На море', isCorrect: false },
              ],
              explanation: 'В тексте сказано: 山へ柴刈りに行きました。',
            },
            {
              id: 'q2',
              type: 'natural_sentence',
              prompt: 'Что собирал дедушка?',
              topic: 'Детали истории',
              options: [
                { text: 'Хворост', isCorrect: true },
                { text: 'Грибы', isCorrect: false },
              ],
              explanation: '柴刈り — сбор хвороста.',
            },
            {
              id: 'q3',
              type: 'usage',
              prompt: 'Кто был главным героем?',
              topic: 'Герои',
              options: [
                { text: 'Дедушка', isCorrect: true },
                { text: 'Мальчик', isCorrect: false },
              ],
              explanation: 'В первом предложении: おじいさん.',
            },
          ],
        },
      });
    };

    const result = await runSenseiPipeline({
      text: 'Создай квиз на понимание истории из 2 предложений',
      explicitIntent: 'create_quiz',
      state: {},
      lessons: [],
      request: mockRequest,
      overrides: { storyContext },
    });

    expect(result.status).toBe('success');
    expect(result.context.storyContext).toEqual(storyContext);
    expect(capturedContext).toBeDefined();
    expect(capturedContext.storyContext).toEqual(storyContext);
  });
});
