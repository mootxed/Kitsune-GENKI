import { z } from 'zod';
import { AI_INTENTS } from '../intents.js';
import { ExplanationWithQuizResponseSchema, validateQuizForMaterial } from '../schemas.js';
import { runStructuredHandler } from '../handler-runner.js';

export const CompareItemsInputSchema = z
  .object({
    itemType: z.enum(['word', 'grammar', 'auto']).default('auto'),
    targets: z.array(z.string().trim().min(1).max(200)).min(2).max(4),
    complexity: z.enum(['normal', 'complex']).default('complex'),
  })
  .strip();
export const COMPARE_ITEMS_PROMPT = `Сравни элементы: общая идея, точные различия,
естественные контексты и ошибки взаимозамены. Верни только JSON следующей точной структуры:
{
  "type": "explanation",
  "message": "сравнение элементов",
  "examples": [ { "japanese": "...", "reading": "...", "translation": "..." } ],
  "quiz": {
    "questions": [
      {
        "id": "q1",
        "type": "translation|reading|dictionary_form|verb_form|particle|natural_sentence|usage|find_error",
        "prompt": "Текст вопроса",
        "topic": "Тема",
        "options": [ { "text": "Вариант 1", "isCorrect": true }, { "text": "Вариант 2", "isCorrect": false } ],
        "explanation": "Объяснение"
      }
    ]
  }
}
Квиз обязателен из 5-7 разнотипных вопросов. Не делай вопросы перефразировками друг друга. Все поля (id, type, prompt, topic, options, explanation) обязательны.
СТРОГИЕ ПРАВИЛА ГРАММАТИКИ: Правильный вариант (isCorrect: true) должен быть грамматически допустим в контексте ВСЕГО предложения. Незавершённая основа глагола (ます-основа, например: 勉強し, 食べ, 書き, 読み, 話し) НЕ МОЖЕТ самостоятельно завершать обычное повествовательное предложение без продолжения (ます, たい, ながら, に行く и т.д.). Перед возвратом JSON мысленно вставь каждый вариант в предложение. Ровно один вариант должен создавать естественное законченное предложение. Объяснение (explanation) должно обосновывать правильный вариант и объяснять неверность дистракторов без внутренних противоречий.`;

export function handleCompareItems(options) {
  return runStructuredHandler({
    handlerName: AI_INTENTS.COMPARE_ITEMS,
    systemPrompt: COMPARE_ITEMS_PROMPT,
    inputSchema: CompareItemsInputSchema,
    outputSchema: ExplanationWithQuizResponseSchema,
    additionalValidator: (data) =>
      validateQuizForMaterial(data, {
        intent: AI_INTENTS.COMPARE_ITEMS,
        complexity: options.input.complexity,
      }),
    ...options,
  });
}
