import { z } from 'zod';
import { AI_INTENTS } from '../intents.js';
import { ExplanationResponseSchema, validateQuizForMaterial } from '../schemas.js';
import { runStructuredHandler } from '../handler-runner.js';

export const ExplainGrammarInputSchema = z
  .object({
    grammar: z.string().trim().min(1).max(300),
    complexity: z.enum(['simple', 'normal', 'complex']).default('normal'),
  })
  .strip();
export const EXPLAIN_GRAMMAR_PROMPT = `Объясни грамматическую конструкцию по-русски:
смысл, образование, ограничения, типичные ошибки и разные примеры. Верни только JSON
type=explanation. Для normal дай 3-4 разных вопроса, для complex 5-7, максимум 8.
Варианты имеют text/isCorrect и ровно один правильный.`;

export function handleExplainGrammar(options) {
  return runStructuredHandler({
    handlerName: AI_INTENTS.EXPLAIN_GRAMMAR,
    systemPrompt: EXPLAIN_GRAMMAR_PROMPT,
    inputSchema: ExplainGrammarInputSchema,
    outputSchema: ExplanationResponseSchema,
    additionalValidator: (data) =>
      validateQuizForMaterial(data, {
        intent: AI_INTENTS.EXPLAIN_GRAMMAR,
        complexity: options.input.complexity,
      }),
    ...options,
  });
}
