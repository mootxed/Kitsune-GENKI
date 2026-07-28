import { z } from 'zod';
import { AI_INTENTS } from '../intents.js';
import { QuizResponseSchema, validateQuizForMaterial } from '../schemas.js';
import { runStructuredHandler } from '../handler-runner.js';

export const CreateQuizInputSchema = z
  .object({
    topic: z.string().trim().min(1).max(500),
    complexity: z.enum(['simple', 'normal', 'complex']).default('normal'),
  })
  .strip();
export const CREATE_QUIZ_PROMPT = `Создай проверочный квиз с вариантами ответа.
Верни JSON type=quiz. В каждом вопросе 2-6 уникальных вариантов text/isCorrect,
ровно один правильный и непустое объяснение. Используй разные типы проверки.`;

export function handleCreateQuiz(options) {
  return runStructuredHandler({
    handlerName: AI_INTENTS.CREATE_QUIZ,
    systemPrompt: CREATE_QUIZ_PROMPT,
    inputSchema: CreateQuizInputSchema,
    outputSchema: QuizResponseSchema,
    additionalValidator: (data) =>
      validateQuizForMaterial(data, {
        intent: AI_INTENTS.CREATE_QUIZ,
        complexity: options.input.complexity,
      }),
    ...options,
  });
}
