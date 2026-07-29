/**
 * src/ai/review-attempt-schema.js
 *
 * Строгая Zod-схема одного снапшота попытки для AI Сенсея.
 *
 * ЗАПРЕЩЕНО ПЕРЕДАВАТЬ МОДЕЛИ:
 *  - UUID карточки / card.id
 *  - полный state.srs
 *  - полный review log
 *  - stability, difficulty, retrievability (передавать только stage)
 *  - точный due date
 *  - XP, стрик, дневной план, имя пользователя
 *  - все словари, всю историю карточки
 */

import { z } from 'zod';

const trimmed = (max = 500) => z.string().trim().min(1).max(max);
const nullableStr = (max = 500) => z.string().trim().max(max).nullable();

// Результат попытки
export const REVIEW_OUTCOMES = ['correct', 'incorrect', 'partial', 'hinted', 'skipped'];

// Скоростная полоса ответа (преобразовывается локально из responseTimeMs)
export const RESPONSE_TIME_BANDS = ['fast', 'normal', 'slow', 'unknown'];

// Локальная стадия памяти (без exact FSRS-чисел)
export const MEMORY_STAGES = ['new', 'fragile', 'developing', 'stable', 'leech'];

// Категории диагноза ошибки (ограниченный enum)
export const DIAGNOSIS_CATEGORIES = [
  'wrong_meaning',
  'wrong_reading',
  'wrong_writing',
  'wrong_particle',
  'wrong_word_order',
  'wrong_verb_form',
  'polite_instead_of_dictionary_form',
  'dictionary_instead_of_polite_form',
  'tense_error',
  'negation_error',
  'kana_confusion',
  'kanji_confusion',
  'similar_word_confusion',
  'context_misunderstanding',
  'unknown',
];

/**
 * Схема ReviewAttemptSnapshot — передаётся AI-модели.
 * Никаких внутренних идентификаторов или FSRS-данных.
 */
export const ReviewAttemptSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),

    // Лексема слова — только публичные данные
    item: z
      .object({
        writing: trimmed(200),
        reading: nullableStr(200),
        meanings: z.array(trimmed(300)).min(1).max(10),
        partOfSpeech: z.array(trimmed(100)).max(8).default([]),
      })
      .strict(),

    // Навык (recall, recognition, reading-writing, context-production)
    skill: trimmed(80),

    // Режим карточки (typing, multiple-choice, …)
    mode: trimmed(80),

    // Описание задания — что было показано пользователю
    task: z
      .object({
        prompt: trimmed(1_000),
        instruction: nullableStr(300),
        contextSentence: nullableStr(500),
        contextTranslation: nullableStr(500),
      })
      .strict(),

    // Ответы
    answer: z
      .object({
        expectedAnswers: z.array(trimmed(500)).min(1).max(20),
        userAnswer: nullableStr(500),
        selectedOption: nullableStr(300),
        correctOption: nullableStr(300),
      })
      .strict(),

    // Результат попытки
    result: z
      .object({
        outcome: z.enum(REVIEW_OUTCOMES),
        mistakes: z.number().int().min(0).max(100),
        hintUsed: z.boolean(),
        // null означает «неизвестно» (не передавать false как «первая попытка неверная»)
        firstAttemptCorrect: z.boolean().nullable(),
        responseTimeBand: z.enum(RESPONSE_TIME_BANDS),
      })
      .strict(),

    // Контекст памяти — только агрегированные данные, без точных чисел FSRS
    memoryContext: z
      .object({
        stage: z.enum(MEMORY_STAGES),
        isLeech: z.boolean(),
        recentLapse: z.boolean(),
      })
      .strict(),
  })
  .strict();

/** @typedef {import('zod').infer<typeof ReviewAttemptSnapshotSchema>} ReviewAttemptSnapshot */

/**
 * Контекст AI-попытки формируется адаптерами режима ДО вызова submitReview.
 * Передаётся внутри reviewContext.aiAttempt.
 */
export const AIAttemptContextSchema = z
  .object({
    prompt: nullableStr(1_000),
    instruction: nullableStr(300),
    expectedAnswers: z.array(trimmed(500)).max(20).default([]),
    userAnswer: nullableStr(500),
    selectedOption: nullableStr(300),
    correctOption: nullableStr(300),
    contextSentence: nullableStr(500),
    contextTranslation: nullableStr(500),
    // Дополнительные данные по режиму
    modeSpecific: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
