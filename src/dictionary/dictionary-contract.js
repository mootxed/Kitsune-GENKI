import { z } from 'zod';
import {
  canonicalHiragana,
  dictionaryEntryId,
  normalizeDictionaryText,
  userDictionaryEntryId,
} from './dictionary-id.js';

export const DICTIONARY_SCHEMA_VERSION = 1;
export const DICTIONARY_CONTENT_VERSION = '1';

const NonEmptyText = z.string().trim().min(1).max(2_000);
const OptionalText = z.string().trim().max(10_000).nullable().default(null);
const DictionaryId = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .regex(/^(?:jp|user)-word:[^:]+:[^:]+(?::[^:]+)?$/u);
const PartOfSpeech = z
  .enum(['noun', 'verb', 'adjective', 'adverb', 'particle', 'expression', 'other'])
  .nullable()
  .default(null);

export const DictionaryProvenanceSchema = z
  .object({
    sourceType: z.enum([
      'kotokitsu-content',
      'course-package',
      'ai-user',
      'ai-story-token',
      'ai-story',
    ]),
    sourceId: z.string().trim().max(500).nullable().optional(),
    contentVersion: z.string().trim().max(100).nullable().optional(),
  })
  .strict();

export const DictionaryEntrySchema = z
  .object({
    schemaVersion: z.literal(DICTIONARY_SCHEMA_VERSION),
    id: DictionaryId,
    dictionaryForm: NonEmptyText,
    reading: NonEmptyText,
    meanings: z.array(NonEmptyText).min(1).max(100),
    partOfSpeech: PartOfSpeech,
    verbClass: z.enum(['godan', 'ichidan', 'irregular']).nullable().default(null),
    adjectiveClass: z.enum(['i', 'na']).nullable().default(null),
    transitivity: z.enum(['transitive', 'intransitive']).nullable().default(null),
    tokenForms: z.array(NonEmptyText).min(1).max(500),
    semanticTags: z.array(NonEmptyText).max(100).default([]),
    romaji: z.string().trim().max(500).default(''),
    source: z.enum(['curated', 'ai']),
    confidence: z.number().min(0).max(1),
    verified: z.boolean().optional(),
    provenance: DictionaryProvenanceSchema,
  })
  .strict()
  .superRefine((entry, context) => {
    const expectedId =
      entry.source === 'ai'
        ? userDictionaryEntryId(entry, { disambiguator: entry.id.split(':')[3] })
        : dictionaryEntryId(entry, { disambiguator: entry.id.split(':')[3] });
    if (entry.id !== expectedId) {
      context.addIssue({
        code: 'custom',
        path: ['id'],
        message: 'DictionaryEntry.id is not deterministic for dictionaryForm/reading',
      });
    }
    if (entry.reading !== canonicalHiragana(entry.reading)) {
      context.addIssue({
        code: 'custom',
        path: ['reading'],
        message: 'reading must be canonical hiragana',
      });
    }
    if (entry.partOfSpeech === 'verb' && !entry.verbClass) {
      context.addIssue({
        code: 'custom',
        path: ['verbClass'],
        message: 'verbClass is required for verbs',
      });
    }
    if (entry.partOfSpeech !== 'verb' && entry.verbClass) {
      context.addIssue({
        code: 'custom',
        path: ['verbClass'],
        message: 'verbClass is only valid for verbs',
      });
    }
    if (entry.partOfSpeech !== 'adjective' && entry.adjectiveClass) {
      context.addIssue({
        code: 'custom',
        path: ['adjectiveClass'],
        message: 'adjectiveClass is only valid for adjectives',
      });
    }
    const CYRILLIC_RE = /[\u0400-\u04FF]/u;
    const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F-\u009F]/u;
    for (let i = 0; i < entry.tokenForms.length; i++) {
      const form = entry.tokenForms[i];
      if (CYRILLIC_RE.test(form)) {
        context.addIssue({
          code: 'custom',
          path: ['tokenForms', i],
          message: `tokenForm "${form}" cannot contain Cyrillic characters`,
        });
      }
      if (CONTROL_CHARS_RE.test(form)) {
        context.addIssue({
          code: 'custom',
          path: ['tokenForms', i],
          message: `tokenForm "${form}" cannot contain control characters`,
        });
      }
    }
    if (new Set(entry.tokenForms).size !== entry.tokenForms.length) {
      context.addIssue({
        code: 'custom',
        path: ['tokenForms'],
        message: 'tokenForms must be unique',
      });
    }
    for (const field of ['courseId', 'introducedIn', 'lessonIds', 'courseMeaning']) {
      if (Object.hasOwn(entry, field)) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} is course-specific and forbidden in DictionaryEntry`,
        });
      }
    }
  });

export const CourseVocabularyReferenceSchema = z
  .object({
    id: NonEmptyText,
    localId: NonEmptyText,
    courseId: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    dictionaryId: DictionaryId,
    introducedIn: NonEmptyText,
    lessonId: NonEmptyText.optional(),
    chapterId: NonEmptyText.optional(),
    courseMeaning: NonEmptyText,
    tags: z.array(NonEmptyText).max(100).default([]),
    note: OptionalText,
    contextProduction: z.unknown().nullable().default(null),
    acceptedAnswers: z.array(NonEmptyText).nullable().default(null),
    particlePatterns: z.array(NonEmptyText).nullable().default(null),
    examples: z.array(z.unknown()).nullable().default(null),
  })
  .strict();

export const DictionaryManifestSchema = z
  .object({
    schemaVersion: z.literal(DICTIONARY_SCHEMA_VERSION),
    contentVersion: NonEmptyText,
    entries: NonEmptyText,
    tokenIndex: NonEmptyText,
    aliases: NonEmptyText,
  })
  .strict();

export function normalizeDictionaryEntry(raw) {
  const dictionaryForm = normalizeDictionaryText(
    raw?.dictionaryForm || raw?.writtenForm || raw?.kanji || raw?.writing || raw?.reading
  );
  const reading = canonicalHiragana(raw?.reading || raw?.writing || dictionaryForm);
  const meanings = [
    ...new Set(
      (Array.isArray(raw?.meanings)
        ? raw.meanings
        : [raw?.meaning || raw?.translation || raw?.courseMeaning]
      )
        .map((value) =>
          String(value || '')
            .normalize('NFKC')
            .trim()
        )
        .filter(Boolean)
    ),
  ];
  const tokenForms = [
    ...new Set(
      (Array.isArray(raw?.tokenForms) ? raw.tokenForms : [dictionaryForm, reading])
        .map(normalizeDictionaryText)
        .filter(Boolean)
    ),
  ];
  const entry = {
    schemaVersion: DICTIONARY_SCHEMA_VERSION,
    id: raw?.id || dictionaryEntryId({ dictionaryForm, reading }, raw),
    dictionaryForm,
    reading,
    meanings,
    partOfSpeech: raw?.partOfSpeech || null,
    verbClass: raw?.partOfSpeech === 'verb' ? raw?.verbClass || null : null,
    adjectiveClass: raw?.partOfSpeech === 'adjective' ? raw?.adjectiveClass || null : null,
    transitivity: raw?.transitivity || null,
    tokenForms,
    semanticTags: [
      ...new Set((raw?.semanticTags || []).map((value) => String(value).trim()).filter(Boolean)),
    ],
    romaji: String(raw?.romaji || '').trim(),
    source: raw?.source === 'ai' ? 'ai' : 'curated',
    confidence: Number.isFinite(raw?.confidence) ? raw.confidence : raw?.source === 'ai' ? 0.5 : 1,
    ...(raw?.verified !== undefined ? { verified: raw.verified === true } : {}),
    provenance: raw?.provenance || { sourceType: 'kotokitsu-content' },
  };
  return DictionaryEntrySchema.parse(entry);
}

export function normalizeCourseVocabularyReference(raw) {
  return CourseVocabularyReferenceSchema.parse({
    id: raw.id,
    localId: raw.localId || raw.id,
    courseId: raw.courseId,
    dictionaryId: raw.dictionaryId,
    introducedIn: raw.introducedIn || raw.lessonId || raw.chapterId,
    ...(raw.lessonId ? { lessonId: raw.lessonId } : {}),
    ...(raw.chapterId ? { chapterId: raw.chapterId } : {}),
    courseMeaning: raw.courseMeaning || raw.meaning || raw.translation,
    tags: raw.tags || [],
    note: raw.note || null,
    contextProduction: raw.contextProduction || raw.context_production || null,
    acceptedAnswers: raw.acceptedAnswers || raw.accepted_answers || null,
    particlePatterns: raw.particlePatterns || null,
    examples: raw.examples || null,
  });
}
