/**
 * src/ai/handlers/explain-review-error.js
 *
 * AI-handler для разбора ошибки после ответа на карточку.
 *
 * ЗАПРЕЩЕНО:
 *  - вызывать SRS/FSRS модули
 *  - изменять state
 *  - создавать review events
 *
 * Квиз: 1–4 вопроса, связанных только с текущей ошибкой.
 */

import { z } from 'zod';
import { ReviewExplanationSchema, validateReviewExplanation } from '../schemas.js';
import { runStructuredHandler } from '../handler-runner.js';
import { DIAGNOSIS_CATEGORIES, IncorrectAttemptSchema } from '../review-attempt-schema.js';

const ExplainReviewErrorInputSchema = z
  .object({
    attempt: z.object({
      schemaVersion: z.literal(1),
      item: z.object({
        writing: z.string().min(1).max(200),
        reading: z.string().max(200).nullable(),
        meanings: z.array(z.string()).min(1),
        partOfSpeech: z.array(z.string()).default([]),
      }),
      skill: z.string().min(1),
      mode: z.string().min(1),
      task: z.object({
        prompt: z.string().min(1),
        instruction: z.string().nullish(),
        contextSentence: z.string().nullish(),
        contextTranslation: z.string().nullish(),
        requiredForm: z.string().max(300).nullish(),
      }),
      answer: z.object({
        expectedAnswers: z.array(z.string()).min(1),
        userAnswer: z.string().nullish(),
        selectedOption: z.string().nullish(),
        correctOption: z.string().nullish(),
        incorrectAttempts: z.array(IncorrectAttemptSchema).default([]),
      }),

      result: z.object({
        outcome: z.string(),
        mistakes: z.number().int().min(0),
        hintUsed: z.boolean(),
        firstAttemptCorrect: z.boolean().nullable(),
        responseTimeBand: z.string(),
      }),
      memoryContext: z.object({
        stage: z.string(),
        isLeech: z.boolean(),
        recentLapse: z.boolean(),
      }),
    }),
    localDiagnosis: z
      .object({
        category: z.enum(DIAGNOSIS_CATEGORIES),
        confidence: z.enum(['high', 'medium', 'low']),
      })
      .nullable()
      .optional(),
    reason: z.string().optional(),
  })
  .strip();

function buildSystemPrompt(localDiagnosis, reason = 'error', attempt = null) {
  if (reason === 'writing_guidance') {
    return `Ты — AI Сенсей, учитель японского языка. Пользователь тренировал написание иероглифа/слова.
Дай руководство по написанию СТРОГО на русском языке.
НЕ утверждай, что пользователь совершил конкретную ошибку в штрихе (данные отдельных штрихов не передаются).
Объясни:
- порядок штрихов
- ключевые элементы (радикалы/графемы) и компоненты
- визуальную мнемонику для запоминания формы
- типичные ошибки при написании вообще.

Установи category: "no_error" в поле diagnosis.

ОБЯЗАТЕЛЬНАЯ СТРУКТУРА ОТВЕТА (JSON):
{
  "type": "review_explanation",
  "diagnosis": {
    "category": "no_error",
    "message": "Руководство по написанию и структуре слова/иероглифа"
  },
  "explanation": "Подробное руководство по порядку штрихов, элементам и мнемонике (2–5 предложений)",
  "comparison": [
    { "form": "Правильное написание", "reading": "чтение или null", "role": "Эталонная форма", "isExpected": true }
  ],
  "examples": [
    { "japanese": "Пример использования.", "reading": null, "translation": "Перевод." }
  ],
  "quiz": {
    "questions": [
      {
        "id": "q1",
        "type": "kanji_confusion|reading|usage",
        "prompt": "Вопрос на понимание структуры или применения",
        "topic": "Тема",
        "options": [{ "text": "Вариант", "isCorrect": true }, { "text": "Вариант 2", "isCorrect": false }],
        "explanation": "Объяснение ответа"
      }
    ]
  }
}

ДОПУСТИМЫЕ КАТЕГОРИИ ДИАГНОЗА:
${DIAGNOSIS_CATEGORIES.join(', ')}

ПРАВИЛА КВИЗА:
- 1–3 вопроса на закрепление материала
- Ровно один isCorrect: true в каждом вопросе

Верни ТОЛЬКО валидный JSON без markdown-обёрток.`;
  }

  const isNoError = reason !== 'error' || attempt?.result?.mistakes === 0;

  if (isNoError) {
    return `Ты — AI Сенсей, учитель японского языка. Пользователь успешно ответил (или воспользовался подсказкой / задумался) и запросил подробное объяснение материала.
Проанализируй карточку и дай подробный разбор СТРОГО на русском языке.
НЕ утверждай, что пользователь совершил ошибку. Установи category: "no_error" в поле diagnosis.

ОБЯЗАТЕЛЬНАЯ СТРУКТУРА ОТВЕТА (JSON):
{
  "type": "review_explanation",
  "diagnosis": {
    "category": "no_error",
    "message": "Разбор употребления и особенностей слова"
  },
  "explanation": "Подробное объяснение грамматических и смысловых нюансов (2–5 предложений)",
  "comparison": [
    { "form": "Словарная форма", "reading": "чтение", "role": "Базовая форма", "isExpected": true }
  ],
  "examples": [
    { "japanese": "Пример на японском.", "reading": null, "translation": "Перевод." }
  ],
  "quiz": {
    "questions": [
      {
        "id": "q1",
        "type": "verb_form|particle|translation|dictionary_form|natural_sentence|usage|reading",
        "prompt": "Вопрос для закрепления",
        "topic": "Тема",
        "options": [{ "text": "Вариант", "isCorrect": true }, { "text": "Вариант 2", "isCorrect": false }],
        "explanation": "Объяснение ответа"
      }
    ]
  }
}

ДОПУСТИМЫЕ КАТЕГОРИИ ДИАГНОЗА:
${DIAGNOSIS_CATEGORIES.join(', ')}

ПРАВИЛА КВИЗА:
- 1–3 вопроса на закрепление материала
- Ровно один isCorrect: true в каждом вопросе

Верни ТОЛЬКО валидный JSON без markdown-обёрток.`;
  }

  const diagHint =
    localDiagnosis && localDiagnosis.category !== 'unknown'
      ? `\nЛОКАЛЬНЫЙ ДИАГНОЗ (уверенность: ${localDiagnosis.confidence}): «${localDiagnosis.category}».
Если уверенность high — не заменяй диагноз без весомой причины.
Если medium/low — можешь уточнить после анализа.`
      : '';

  return `Ты — AI Сенсей, учитель японского языка. Пользователь допустил ошибку при повторении карточки.
Проанализируй попытку и дай краткий разбор СТРОГО на русском языке.${diagHint}

ОБЯЗАТЕЛЬНАЯ СТРУКТУРА ОТВЕТА (JSON):
{
  "type": "review_explanation",
  "diagnosis": {
    "category": "<категория из списка ниже>",
    "message": "Краткое описание ошибки (1 предложение)"
  },
  "explanation": "Подробное объяснение ошибки (2–5 предложений)",
  "comparison": [
    { "form": "правильная форма", "reading": "чтение или null", "role": "Словарная форма", "isExpected": true },
    { "form": "ответ пользователя", "reading": "чтение или null", "role": "Что ввёл пользователь", "isExpected": false }
  ],
  "examples": [
    { "japanese": "Пример на японском.", "reading": null, "translation": "Перевод." }
  ],
  "quiz": {
    "questions": [
      {
        "id": "q1",
        "type": "verb_form|particle|translation|dictionary_form|natural_sentence|find_error|usage|reading",
        "prompt": "Вопрос",
        "topic": "Тема",
        "options": [{ "text": "Вариант", "isCorrect": true }, { "text": "Вариант 2", "isCorrect": false }],
        "explanation": "Объяснение правильного ответа"
      }
    ]
  }
}

ДОПУСТИМЫЕ КАТЕГОРИИ ДИАГНОЗА:
${DIAGNOSIS_CATEGORIES.join(', ')}

ПРАВИЛА КВИЗА:
- Строго 1–4 вопроса, связанных ТОЛЬКО с текущей ошибкой
- Ровно один isCorrect: true в каждом вопросе
- Вопросы не дублируют карточку, а закрепляют понятый принцип
- Простая ошибка: 1–2 вопроса; форма/частица: 2–3; смешение конструкций / leech: 3–4

ПРАВИЛА ДИАГНОЗА:
- Диагноз должен соответствовать snapshot: если userAnswer=«始めます» и expected=«始める» — допустим только «polite_instead_of_dictionary_form»
- НЕ ставь «wrong_meaning», если это явная ошибка формы глагола

Верни ТОЛЬКО валидный JSON без markdown-обёрток.`;
}

/**
 * Запускает explain_review_error handler.
 *
 * @param {object} options
 * @param {object} options.input — { attempt, localDiagnosis, reason }
 * @param {object} options.context — AI context (recentMessages)
 * @param {Function} options.request — AI request client
 */
export function handleExplainReviewError(options) {
  const localDiagnosis = options.input?.localDiagnosis || null;
  const attempt = options.input?.attempt;
  const reason = options.input?.reason || 'error';

  return runStructuredHandler({
    handlerName: 'explain_review_error',
    systemPrompt: buildSystemPrompt(localDiagnosis, reason, attempt),
    input: options.input,
    inputSchema: ExplainReviewErrorInputSchema,
    outputSchema: ReviewExplanationSchema,
    context: options.context,
    request: options.request,
    additionalValidator: (data, opts) =>
      validateReviewExplanation(data, attempt, localDiagnosis, opts?.isRepairedAttempt, reason),
  });
}
