import { z } from 'zod';
import { AI_INTENTS } from '../intents.js';
import { ExplanationWithQuizResponseSchema, validateQuizForMaterial } from '../schemas.js';
import { runStructuredHandler } from '../handler-runner.js';

export const ExplainGrammarInputSchema = z
  .object({
    grammar: z.string().trim().min(1).max(300),
    complexity: z.enum(['simple', 'normal', 'complex']).default('normal'),
  })
  .strip();
export const EXPLAIN_GRAMMAR_PROMPT = `Объясни грамматическую конструкцию по-русски:
смысл, образование, ограничения, типичные ошибки и разные примеры. Верни только JSON следующей точной структуры:
{
  "type": "explanation",
  "message": "разбор грамматики",
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
Квиз обязателен. Для normal дай 3-4 разных вопроса, для complex 5-7 (максимум 8). Вопросы должны быть разнотипными. Все поля (id, type, prompt, topic, options, explanation) обязательны.
СТРОГИЕ ПРАВИЛА ГРАММАТИКИ: Правильный вариант (isCorrect: true) должен быть грамматически допустим в контексте ВСЕГО предложения. Незавершённая основа глагола (ます-основа, например: 勉強し, 食べ, 書き, 読み, 話し) НЕ МОЖЕТ самостоятельно завершать обычное повествовательное предложение без продолжения (ます, たい, ながら, に行く и т.д.). Перед возвратом JSON мысленно вставь каждый вариант в предложение. Ровно один вариант должен создавать естественное законченное предложение. Объяснение (explanation) должно обосновывать правильный вариант и объяснять неверность дистракторов без внутренних противоречий.`;

export function handleExplainGrammar(options) {
  return runStructuredHandler({
    handlerName: AI_INTENTS.EXPLAIN_GRAMMAR,
    systemPrompt: EXPLAIN_GRAMMAR_PROMPT,
    inputSchema: ExplainGrammarInputSchema,
    outputSchema: ExplanationWithQuizResponseSchema,
    additionalValidator: (data) =>
      validateQuizForMaterial(data, {
        intent: AI_INTENTS.EXPLAIN_GRAMMAR,
        complexity: options.input.complexity,
        text: options.input.grammar,
      }),
    ...options,
  });
}
