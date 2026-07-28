import { z } from 'zod';
import { AI_INTENTS } from '../intents.js';
import { ExplanationResponseSchema, validateQuizForMaterial } from '../schemas.js';
import { runStructuredHandler } from '../handler-runner.js';

export const ExplainWordInputSchema = z.object({ word: z.string().trim().min(1).max(200) }).strip();
export const EXPLAIN_WORD_PROMPT = `Объясни указанное японское слово: значение, чтение,
словарную форму, оттенки и 2-3 примера. Верни только JSON type=explanation.
Добавь квиз из 1-2 разных вопросов с 2-6 вариантами; у каждого варианта text и isCorrect,
ровно один isCorrect=true.`;

export function handleExplainWord(options) {
  return runStructuredHandler({
    handlerName: AI_INTENTS.EXPLAIN_WORD,
    systemPrompt: EXPLAIN_WORD_PROMPT,
    inputSchema: ExplainWordInputSchema,
    outputSchema: ExplanationResponseSchema,
    additionalValidator: (data) =>
      validateQuizForMaterial(data, { intent: AI_INTENTS.EXPLAIN_WORD, complexity: 'simple' }),
    ...options,
  });
}
