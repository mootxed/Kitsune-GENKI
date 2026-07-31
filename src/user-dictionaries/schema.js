import { z } from 'zod';

export const USER_DICTIONARY_SCHEMA_VERSION = 1;
export const USER_DICTIONARY_LIMITS = Object.freeze({
  fileBytes: 10 * 1024 * 1024,
  entries: 20_000,
  jsonDepth: 20,
  dictionaryName: 120,
  description: 2_000,
  word: 200,
  reading: 200,
  meanings: 50,
  meaning: 1_000,
  tags: 50,
  tag: 100,
  notes: 10_000,
  examples: 20,
  exampleText: 2_000,
});

const isoDate = z
  .string()
  .max(50)
  .refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) &&
      !Number.isNaN(Date.parse(value)),
    {
      message: 'Ожидалась корректная ISO-дата',
    }
  );
const dictionaryId = z.string().regex(/^user-dict:[A-Za-z0-9-]{8,100}$/u);
const entryId = z.string().regex(/^user-word:[A-Za-z0-9-]{8,100}$/u);
const profileId = z.string().regex(/^import-profile:[A-Za-z0-9-]{8,100}$/u);
const cleanString = (max) => z.string().trim().max(max);
// Строгий набор символов для чтения (хирагана, катакана, кандзи, ー, ・, пробелы)
const readingText = (max) =>
  cleanString(max).refine(
    (value) =>
      value === '' ||
      /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}々〆ヶー・\s]+$/u.test(value),
    { message: 'Ожидался японский текст' }
  );
// Мягкий набор символов для написания: любые Unicode кроме управляющих символов
const writingText = (max) =>
  cleanString(max).refine((value) => value === '' || !/[\u0000-\u001F\u007F-\u009F]/u.test(value), {
    message: 'Написание не может содержать управляющие символы',
  });
const nonEmptyStrings = (maxItems, maxLength) =>
  z.array(cleanString(maxLength).min(1)).max(maxItems);

export const UserDictionarySchema = z
  .object({
    id: dictionaryId,
    name: cleanString(USER_DICTIONARY_LIMITS.dictionaryName).min(1),
    description: cleanString(USER_DICTIONARY_LIMITS.description).default(''),
    createdAt: isoDate,
    updatedAt: isoDate,
    sourceType: z.enum(['manual', 'import', 'ai']),
    kind: z.enum(['personal', 'regular', 'ai-cache']).default('regular'),
    hidden: z.boolean().optional(),
    schemaVersion: z.literal(USER_DICTIONARY_SCHEMA_VERSION),
  })
  .strict();

export const UserDictionaryExampleSchema = z
  .object({
    japanese: cleanString(USER_DICTIONARY_LIMITS.exampleText).default(''),
    translation: cleanString(USER_DICTIONARY_LIMITS.exampleText).default(''),
  })
  .strict()
  .refine((value) => Boolean(value.japanese || value.translation), {
    message: 'Пример не может быть пустым',
  });

const ProductionTaskSchema = z
  .object({
    prompt: cleanString(2_000).min(1),
    meaningCue: cleanString(1_000).min(1),
    acceptedAnswers: nonEmptyStrings(20, USER_DICTIONARY_LIMITS.word).min(1),
    requiredForm: cleanString(200).min(1),
  })
  .strict();

export const UserDictionaryEntrySchema = z
  .object({
    id: entryId,
    dictionaryId,
    writing: writingText(USER_DICTIONARY_LIMITS.word).default(''),
    reading: readingText(USER_DICTIONARY_LIMITS.reading).default(''),
    meanings: nonEmptyStrings(USER_DICTIONARY_LIMITS.meanings, USER_DICTIONARY_LIMITS.meaning).min(
      1
    ),
    alternativeWritings: nonEmptyStrings(30, USER_DICTIONARY_LIMITS.word).default([]),
    partOfSpeech: nonEmptyStrings(20, 100).default([]),
    tags: nonEmptyStrings(USER_DICTIONARY_LIMITS.tags, USER_DICTIONARY_LIMITS.tag).default([]),
    examples: z.array(UserDictionaryExampleSchema).max(USER_DICTIONARY_LIMITS.examples).default([]),
    notes: cleanString(USER_DICTIONARY_LIMITS.notes).default(''),
    source: z
      .object({
        type: z.enum(['manual', 'import', 'ai']),
        label: cleanString(500).default(''),
        externalId: z.union([cleanString(500), z.null()]).default(null),
      })
      .strict(),
    globalDictionaryId: z
      .string()
      .regex(/^(?:jp|user)-word:[^:]+:[^:]+(?::[^:]+)?$/u)
      .optional(),
    verbClass: z.enum(['godan', 'ichidan', 'irregular']).nullable().optional(),
    adjectiveClass: z.enum(['i', 'na']).nullable().optional(),
    transitivity: z.enum(['transitive', 'intransitive']).nullable().optional(),
    tokenForms: nonEmptyStrings(500, USER_DICTIONARY_LIMITS.word).optional(),
    confidence: z.number().min(0).max(1).optional(),
    verified: z.boolean().optional(),
    productionTask: ProductionTaskSchema.optional(),
    learningEnabled: z.boolean().default(false),
    entryKey: z.string().min(1).max(500),
    searchText: z.string().max(50_000).default(''),
    createdAt: isoDate,
    updatedAt: isoDate,
    schemaVersion: z.literal(USER_DICTIONARY_SCHEMA_VERSION),
  })
  .strict()
  .refine((value) => Boolean(value.writing || value.reading), {
    message: 'Укажите написание или чтение',
    path: ['writing'],
  });

export const ImportProfileSchema = z
  .object({
    id: profileId,
    name: cleanString(120).min(1),
    format: z.enum(['json', 'csv', 'tsv']),
    collectionPath: z.union([z.string().max(500), z.null()]).default(null),
    mapping: z.record(
      z.string().max(100),
      z.union([z.string().max(500), z.array(z.string().max(500)).max(10)])
    ),
    transforms: z
      .object({
        meaningSeparator: z.string().max(10).default(';'),
        tagSeparator: z.string().max(10).default(','),
        stripHtml: z.boolean().default(true),
        // trim и emptyAsMissing убраны в v1: нормализатор обрезает пробелы
        // безусловно, отдельная настройка вводила пользователя в заблуждение.
        useObjectKeyAsWriting: z.boolean().default(false),
      })
      .strict(),
    createdAt: isoDate,
    updatedAt: isoDate,
    schemaVersion: z.literal(USER_DICTIONARY_SCHEMA_VERSION),
  })
  .strict();

export const UserDictionaryExportSchema = z
  .object({
    format: z.literal('kotokitsu-dictionary'),
    schemaVersion: z.literal(USER_DICTIONARY_SCHEMA_VERSION),
    exportedAt: isoDate,
    dictionary: UserDictionarySchema,
    entries: z.array(UserDictionaryEntrySchema).max(USER_DICTIONARY_LIMITS.entries),
  })
  .strict();
