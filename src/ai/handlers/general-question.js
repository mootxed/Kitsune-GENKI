import { z } from 'zod';
import { GeneralResponseSchema } from '../schemas.js';
import { runStructuredHandler } from '../handler-runner.js';

export const GeneralQuestionInputSchema = z
  .object({ question: z.string().trim().min(1).max(4_000) })
  .strip();
export const GENERAL_QUESTION_PROMPT = `Ты AI Сенсей. Ответь по-русски ясно и точно.
Верни только JSON: {"type":"explanation","message":"...","examples":[]}.
Не выдумывай уровень ученика. Квиз не обязателен.`;

export function handleGeneralQuestion(options) {
  return runStructuredHandler({
    handlerName: 'general_question',
    systemPrompt: GENERAL_QUESTION_PROMPT,
    inputSchema: GeneralQuestionInputSchema,
    outputSchema: GeneralResponseSchema,
    ...options,
  });
}
