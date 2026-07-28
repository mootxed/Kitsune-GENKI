import { z } from 'zod';
import { StorySentenceSchema } from '../ai-story-schema.js';
import { AI_INTENTS, WORD_SOURCES } from './intents.js';

const cleanText = (max = 4_000) => z.string().trim().min(1).max(max);
const nullableText = (max = 500) => z.string().trim().max(max).nullable().optional();

export const IntentRouterSchema = z.discriminatedUnion('intent', [
  z
    .object({
      intent: z.literal(AI_INTENTS.GENERAL_QUESTION),
      question: cleanText(),
    })
    .strip(),
  z
    .object({
      intent: z.literal(AI_INTENTS.EXPLAIN_WORD),
      word: cleanText(200),
    })
    .strip(),
  z
    .object({
      intent: z.literal(AI_INTENTS.EXPLAIN_GRAMMAR),
      grammar: cleanText(300),
      complexity: z.enum(['simple', 'normal', 'complex']).default('normal'),
    })
    .strip(),
  z
    .object({
      intent: z.literal(AI_INTENTS.COMPARE_ITEMS),
      itemType: z.enum(['word', 'grammar', 'auto']).default('auto'),
      targets: z.array(cleanText(200)).min(2).max(4),
      complexity: z.enum(['normal', 'complex']).default('complex'),
    })
    .strip(),
  z
    .object({
      intent: z.literal(AI_INTENTS.CREATE_STORY),
      topic: cleanText(500),
      tone: z.enum(['neutral', 'funny', 'warm', 'mystery']).default('neutral'),
      length: z.enum(['short', 'medium', 'long']).default('short'),
      wordSource: z.enum(WORD_SOURCES).default('mixed'),
      explicitWords: z.array(cleanText(200)).max(20).default([]),
      dictionaryId: z.string().trim().max(100).optional(),
      dictionaryName: z.string().trim().max(200).optional(),
    })
    .strip(),
  z
    .object({
      intent: z.literal(AI_INTENTS.CREATE_QUIZ),
      topic: cleanText(500),
      complexity: z.enum(['simple', 'normal', 'complex']).default('normal'),
      storyContext: z
        .object({
          storyMessageId: z.string().nullable().optional(),
          sentences: z.array(
            z.object({
              japanese: cleanText(2_000),
              translation: cleanText(2_000),
            })
          ),
        })
        .optional(),
    })
    .strip(),
  z
    .object({
      intent: z.literal(AI_INTENTS.CLARIFY_REQUEST),
      missing: z
        .array(z.enum(['activityType', 'target', 'comparisonTarget', 'topic']))
        .min(1)
        .max(4),
      question: nullableText(500),
    })
    .strip(),
]);

export const QuizOptionSchema = z
  .object({
    text: cleanText(500),
    isCorrect: z.boolean(),
  })
  .strip();

export const QUIZ_QUESTION_TYPES = Object.freeze([
  'translation',
  'reading',
  'dictionary_form',
  'verb_form',
  'particle',
  'natural_sentence',
  'usage',
  'find_error',
]);

export const QuizQuestionSchema = z
  .object({
    id: cleanText(100),
    type: z.enum(QUIZ_QUESTION_TYPES),
    prompt: cleanText(1_000),
    topic: cleanText(300),
    options: z.array(QuizOptionSchema).min(2).max(6),
    explanation: cleanText(2_000),
    selectedIndex: z.number().int().min(0).max(5).nullable().optional(),
    answeredCorrectly: z.boolean().nullable().optional(),
  })
  .strip()
  .superRefine((question, ctx) => {
    const correct = question.options.filter((option) => option.isCorrect);
    if (correct.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Должен быть ровно один правильный вариант',
      });
    }
    const normalized = question.options.map((option) =>
      option.text.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('ru')
    );
    if (new Set(normalized).size !== normalized.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Варианты ответа не должны дублироваться',
      });
    }
  });

export const QuizSchema = z
  .object({
    questions: z.array(QuizQuestionSchema).min(1).max(8),
  })
  .strip()
  .superRefine((quiz, ctx) => {
    const ids = quiz.questions.map((q) => q.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['questions'],
        message: 'Идентификаторы вопросов (id) должны быть уникальными',
      });
    }
  });

export const ExampleSchema = z
  .object({
    japanese: cleanText(1_000),
    reading: nullableText(1_000),
    translation: cleanText(1_000),
  })
  .strip();

export const ExplanationResponseSchema = z
  .object({
    type: z.literal('explanation'),
    message: cleanText(8_000),
    examples: z.array(ExampleSchema).max(12).default([]),
    quiz: QuizSchema.optional(),
  })
  .strip();

export const ExplanationWithQuizResponseSchema = z
  .object({
    type: z.literal('explanation'),
    message: cleanText(8_000),
    examples: z.array(ExampleSchema).max(12).default([]),
    quiz: QuizSchema,
  })
  .strip();

export const GeneralResponseSchema = z
  .object({
    type: z.literal('explanation'),
    message: cleanText(8_000),
    examples: z.array(ExampleSchema).max(12).default([]),
    quiz: QuizSchema.optional(),
  })
  .strip();

export const StoryResponseSchema = z
  .object({
    type: z.literal('story'),
    message: cleanText(2_000).default('Готово — вот ваша история.'),
    story: z.array(StorySentenceSchema).min(3).max(15),
    unknownWords: z
      .array(
        z
          .object({
            writing: cleanText(200),
            reading: nullableText(200),
            meaning: cleanText(500),
          })
          .strip()
      )
      .max(30)
      .default([]),
  })
  .strip()
  .transform((value) => ({
    ...value,
    story: value.story.map((sentence, index) => ({ ...sentence, sentence_id: index + 1 })),
  }));

export const QuizResponseSchema = z
  .object({
    type: z.literal('quiz'),
    message: cleanText(2_000),
    quiz: QuizSchema,
  })
  .strip();

export const StructuredResponseSchema = z.union([
  ExplanationResponseSchema,
  ExplanationWithQuizResponseSchema,
  StoryResponseSchema,
  QuizResponseSchema,
]);

export function getQuizQuestionRange(intent, complexity = 'normal') {
  if (complexity === 'simple' || intent === AI_INTENTS.EXPLAIN_WORD) return { min: 1, max: 2 };
  if (complexity === 'complex' || intent === AI_INTENTS.COMPARE_ITEMS) return { min: 5, max: 7 };
  return { min: 3, max: 4 };
}

export function validateQuizForMaterial(
  response,
  { intent, complexity = 'normal', text = '' } = {}
) {
  const parsed = StructuredResponseSchema.safeParse(response);
  if (!parsed.success) return parsed;
  const isMandatoryQuiz = [
    AI_INTENTS.EXPLAIN_WORD,
    AI_INTENTS.EXPLAIN_GRAMMAR,
    AI_INTENTS.COMPARE_ITEMS,
    AI_INTENTS.CREATE_QUIZ,
  ].includes(intent);

  const quiz = parsed.data.quiz;
  if (!quiz) {
    if (isMandatoryQuiz) {
      return {
        success: false,
        error: new z.ZodError([
          {
            code: 'custom',
            path: ['quiz'],
            message: 'Квиз обязателен для данного материала',
          },
        ]),
      };
    }
    return parsed;
  }

  let effectiveComplexity = complexity;
  if (intent === AI_INTENTS.EXPLAIN_GRAMMAR) {
    const isComplexPattern =
      /N[12]/i.test(text) ||
      /сложн/i.test(text) ||
      /продвинут/i.test(text) ||
      quiz.questions.length >= 5;
    if (isComplexPattern) {
      effectiveComplexity = 'complex';
    }
  }

  const range = getQuizQuestionRange(intent, effectiveComplexity);
  if (quiz.questions.length < range.min || quiz.questions.length > range.max) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: 'custom',
          path: ['quiz', 'questions'],
          message: `Ожидалось от ${range.min} до ${range.max} вопросов`,
        },
      ]),
    };
  }

  if (quiz.questions.length >= 3) {
    const types = new Set(quiz.questions.map((q) => q.type));
    const prompts = new Set(quiz.questions.map((q) => q.prompt.trim().toLowerCase()));
    if (types.size < 2 || prompts.size < quiz.questions.length) {
      return {
        success: false,
        error: new z.ZodError([
          {
            code: 'custom',
            path: ['quiz', 'questions'],
            message: 'Вопросы квиза должны быть разнотипными и не дублировать формулировки',
          },
        ]),
      };
    }
  }

  return parsed;
}

export function getCorrectOptionIndex(question) {
  return question.options.findIndex((option) => option.isCorrect);
}
