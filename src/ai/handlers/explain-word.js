import { z } from 'zod';
import { AI_INTENTS } from '../intents.js';
import { ExplanationWithQuizResponseSchema, validateQuizForMaterial } from '../schemas.js';
import { runStructuredHandler } from '../handler-runner.js';

export const ExplainWordInputSchema = z.object({ word: z.string().trim().min(1).max(200) }).strip();
export const EXPLAIN_WORD_PROMPT = `Объясни указанное японское слово: значение, чтение,
словарную форму, оттенки и 2-3 примера. Верни только JSON следующей точной структуры:
{
  "type": "explanation",
  "message": "подробное объяснение слова",
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
Квиз обязателен (1-2 вопросов). В каждом вопросе ровно один isCorrect=true. Все поля (id, type, prompt, topic, options, explanation) обязательны.`;

export function handleExplainWord(options) {
  return runStructuredHandler({
    handlerName: AI_INTENTS.EXPLAIN_WORD,
    systemPrompt: EXPLAIN_WORD_PROMPT,
    inputSchema: ExplainWordInputSchema,
    outputSchema: ExplanationWithQuizResponseSchema,
    additionalValidator: (data) =>
      validateQuizForMaterial(data, { intent: AI_INTENTS.EXPLAIN_WORD, complexity: 'simple' }),
    ...options,
  });
}
