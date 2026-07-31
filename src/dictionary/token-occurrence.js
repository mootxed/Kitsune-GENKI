/* src/dictionary/token-occurrence.js — Canonical TokenOccurrence contract and legacy adapter */
import { z } from 'zod';
import { resolveDictionaryAlias } from './dictionary-store.js';

export const TOKEN_RESOLUTION_STATUS = Object.freeze([
  'resolved',
  'ambiguous',
  'missing',
  'non-lexical',
]);

export const TOKEN_RESOLUTION_SOURCE = Object.freeze([
  'builtin',
  'user-ai',
  'ai-context',
  'explicit-reference',
  'legacy',
  'none',
]);

export const TokenFormSchema = z
  .object({
    tense: z.string().trim().max(100).optional().nullable(),
    politeness: z.string().trim().max(100).optional().nullable(),
    polarity: z.string().trim().max(100).optional().nullable(),
    conjugation: z.string().trim().max(100).optional().nullable(),
  })
  .strip()
  .optional()
  .default({});

export const TokenResolutionSchema = z
  .object({
    status: z.enum(TOKEN_RESOLUTION_STATUS).default('missing'),
    source: z.enum(TOKEN_RESOLUTION_SOURCE).default('none'),
    confidence: z.number().min(0).max(1).default(1),
  })
  .strip();

export const TokenOccurrenceSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    id: z.string().trim().min(1).max(200),
    surface: z.string().trim().min(1).max(200),
    reading: z.string().trim().max(200).default(''),
    dictionaryId: z.string().trim().max(200).nullable().default(null),
    form: TokenFormSchema,
    contextMeaning: z.string().trim().max(500).nullable().default(null),
    resolution: TokenResolutionSchema,
  })
  .strip();

/**
 * Normalizes legacy story token to canonical TokenOccurrence format.
 * Legacy properties: kanji, writing, translation, type, lexemeId, wordId, etc.
 *
 * @param {object} rawToken - Input token object (legacy or canonical)
 * @param {object} context - Context containing storyId, sentenceId, tokenIndex, optional dictionaryStore
 * @returns {object} Canonical TokenOccurrence object
 */
export function normalizeLegacyStoryToken(rawToken, context = {}) {
  if (!rawToken || typeof rawToken !== 'object') {
    throw new Error('[TokenOccurrence] Invalid rawToken passed to normalizeLegacyStoryToken');
  }

  const { storyId = 'story', sentenceId = 1, tokenIndex = 0, dictionaryStore = null } = context;

  // Idempotence check: if already canonical TokenOccurrence
  if (
    rawToken.schemaVersion === 1 &&
    typeof rawToken.id === 'string' &&
    typeof rawToken.surface === 'string' &&
    rawToken.resolution &&
    typeof rawToken.resolution === 'object'
  ) {
    return TokenOccurrenceSchema.parse(rawToken);
  }

  const surface = String(rawToken.surface || rawToken.kanji || rawToken.writing || '').trim();
  const rawReading = String(rawToken.reading || rawToken.writing || '').trim();
  const reading = rawReading || surface;
  const contextMeaning =
    String(
      rawToken.contextMeaning || rawToken.translation || rawToken.dictionaryMeaning || ''
    ).trim() || null;

  const type = String(rawToken.type || '').trim();
  const isPunctuation = type === 'Punctuation' || /^[。、！？\s.,!?…─―]+$/u.test(surface);

  let dictionaryId = rawToken.dictionaryId || rawToken.lexemeId || rawToken.wordId || null;

  if (dictionaryId && dictionaryStore) {
    dictionaryId = dictionaryStore.resolveAlias(dictionaryId) || dictionaryId;
  } else if (dictionaryId) {
    dictionaryId = resolveDictionaryAlias(dictionaryId) || dictionaryId;
  }

  const generatedId = rawToken.id || `${storyId}:sentence-${sentenceId}:token-${tokenIndex}`;

  let status = 'missing';
  let source = 'none';
  let confidence = 1;

  if (isPunctuation) {
    status = 'non-lexical';
    source = 'none';
    dictionaryId = null;
  } else if (dictionaryId) {
    status = 'resolved';
    source =
      rawToken.resolution?.source || (dictionaryId.startsWith('user-') ? 'user-ai' : 'builtin');
  } else if (rawToken.resolution) {
    status = rawToken.resolution.status || 'missing';
    source = rawToken.resolution.source || 'none';
    confidence =
      typeof rawToken.resolution.confidence === 'number' ? rawToken.resolution.confidence : 1;
  } else {
    status = 'missing';
    source = 'legacy';
  }

  const form = {
    tense: rawToken.form?.tense || null,
    politeness: rawToken.form?.politeness || null,
    polarity: rawToken.form?.polarity || null,
    conjugation: rawToken.form?.conjugation || null,
  };

  return TokenOccurrenceSchema.parse({
    schemaVersion: 1,
    id: generatedId,
    surface: surface || ' ',
    reading,
    dictionaryId,
    form,
    contextMeaning,
    resolution: {
      status,
      source,
      confidence,
    },
  });
}
