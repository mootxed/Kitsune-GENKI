import { z } from 'zod';
import { AI_INTENTS } from '../intents.js';
import { QuizResponseSchema, validateQuizForMaterial } from '../schemas.js';
import { runStructuredHandler } from '../handler-runner.js';

export const CreateQuizInputSchema = z
  .object({
    topic: z.string().trim().min(1).max(500),
    complexity: z.enum(['simple', 'normal', 'complex']).default('normal'),
    storyContext: z
      .object({
        storyMessageId: z.string().nullable().optional(),
        sentences: z.array(
          z.object({
            japanese: z.string(),
            translation: z.string(),
          })
        ),
      })
      .optional(),
  })
  .strip();
export const CREATE_QUIZ_PROMPT = `Создай проверочный квиз с вариантами ответа.
Верни только JSON следующей точной структуры:
{
  "type": "quiz",
  "message": "Проверочный квиз",
  "quiz": {
    "questions": [
      {
        "id": "q1",
        "type": "translation|reading|dictionary_form|verb_form|particle|natural_sentence|usage|find_error",
        "prompt": "Текст вопроса",
        "topic": "Тема",
        "options": [ { "text": "Вариант 1", "isCorrect": true }, { "text": "Вариант 2", "isCorrect": false } ],
        "explanation": "Объяснение ответа"
      }
    ]
  }
}
Если в контексте переданы предложения истории (storyContext), составляй вопросы именно по этой истории. Каждый id вопроса (q1, q2...) должен быть уникальным. В каждом вопросе 2-6 уникальных вариантов text/isCorrect, ровно один правильный и непустое объяснение. Все поля обязательны.
СТРОГИЕ ПРАВИЛА ГРАММАТИКИ: Правильный вариант (isCorrect: true) должен быть грамматически допустим в контексте ВСЕГО предложения. Незавершённая основа глагола (ます-основа, например: 勉強し, 食べ, 書き, 読み, 話し) НЕ МОЖЕТ самостоятельно завершать обычное повествовательное предложение без продолжения (ます, たい, ながら, に行く и т.д.). Перед возвратом JSON мысленно вставь каждый вариант в предложение. Ровно один вариант должен создавать естественное законченное предложение. Объяснение (explanation) должно обосновывать правильный вариант и объяснять неверность дистракторов без внутренних противоречий.`;

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
