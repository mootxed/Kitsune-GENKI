import { z } from 'zod';
import { AI_INTENTS } from '../intents.js';
import { ExplanationResponseSchema, validateQuizForMaterial } from '../schemas.js';
import { runStructuredHandler } from '../handler-runner.js';

export const CompareItemsInputSchema = z
  .object({
    itemType: z.enum(['word', 'grammar', 'auto']).default('auto'),
    targets: z.array(z.string().trim().min(1).max(200)).min(2).max(4),
    complexity: z.enum(['normal', 'complex']).default('complex'),
  })
  .strip();
export const COMPARE_ITEMS_PROMPT = `Сравни элементы: общая идея, точные различия,
естественные контексты и ошибки взаимозамены. Верни JSON type=explanation и 5-7
разнотипных вопросов. Не делай вопросы перефразировками друг друга.`;

export function handleCompareItems(options) {
  return runStructuredHandler({
    handlerName: AI_INTENTS.COMPARE_ITEMS,
    systemPrompt: COMPARE_ITEMS_PROMPT,
    inputSchema: CompareItemsInputSchema,
    outputSchema: ExplanationResponseSchema,
    additionalValidator: (data) =>
      validateQuizForMaterial(data, {
        intent: AI_INTENTS.COMPARE_ITEMS,
        complexity: options.input.complexity,
      }),
    ...options,
  });
}
