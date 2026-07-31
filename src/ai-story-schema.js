/* src/ai-story-schema.js — Zod schemas and normalization for AI story generation */
import { z } from 'zod';

export const StoryTokenSchema = z
  .object({
    surface: z
      .string()
      .nullable()
      .optional()
      .transform((val) => (val ?? '').trim()),
    reading: z
      .string()
      .nullable()
      .optional()
      .transform((val) => (val ?? '').trim()),
    kanji: z
      .string()
      .nullable()
      .optional()
      .transform((val) => (val ?? '').trim()),
    writing: z
      .string()
      .nullable()
      .optional()
      .transform((val) => (val ?? '').trim()),
    translation: z
      .string()
      .nullable()
      .optional()
      .transform((val) => (val ?? '').trim()),
    contextMeaning: z
      .string()
      .nullable()
      .optional()
      .transform((val) => (val ?? '').trim()),
    type: z
      .string()
      .nullable()
      .optional()
      .transform((val) => {
        const trimmed = (val ?? '').trim();
        return trimmed.length > 0 ? trimmed : 'Unknown';
      }),
    partOfSpeechHint: z
      .string()
      .nullable()
      .optional()
      .transform((val) => (val ?? '').trim()),
    lemmaHint: z
      .string()
      .nullable()
      .optional()
      .transform((val) => (val ?? '').trim()),
    dictionaryForm: z
      .string()
      .nullable()
      .optional()
      .transform((val) => {
        const value = (val ?? '').trim();
        return value || null;
      })
      .pipe(z.string().max(200).nullable()),
    dictionaryReading: z
      .string()
      .nullable()
      .optional()
      .transform((val) => {
        const value = (val ?? '').trim();
        return value || null;
      })
      .pipe(z.string().max(200).nullable()),
    dictionaryMeaning: z
      .string()
      .nullable()
      .optional()
      .transform((val) => {
        const value = (val ?? '').trim();
        return value || null;
      })
      .pipe(z.string().max(500).nullable()),
    dictionaryRef: z
      .string()
      .nullable()
      .optional()
      .transform((val) => {
        const value = (val ?? '').trim();
        return value || null;
      })
      .refine((val) => val === null || /^W\d+$/i.test(val), {
        message: 'dictionaryRef должен быть формата W1, W2 и т.д.',
      }),
    dictionaryId: z
      .string()
      .nullable()
      .optional()
      .transform((val) => {
        const value = (val ?? '').trim();
        return value || null;
      })
      .pipe(z.string().max(200).nullable()),
    sourceToken: z
      .string()
      .nullable()
      .optional()
      .transform((val) => {
        const value = (val ?? '').trim();
        return value || null;
      })
      .pipe(z.string().max(100).nullable()),
    form: z.any().optional(),
  })
  .strip()
  .refine(
    (token) =>
      (token.surface && token.surface.length > 0) ||
      (token.kanji && token.kanji.length > 0) ||
      (token.writing && token.writing.length > 0),
    {
      message: 'Токен должен содержать хотя бы одно непустое значение в surface, kanji или writing',
      path: ['surface'],
    }
  );

export const StorySentenceSchema = z
  .object({
    sentence_id: z.coerce
      .number()
      .int({ message: 'sentence_id должен быть целым числом' })
      .positive({ message: 'sentence_id должен быть положительным' }),
    speaker: z
      .string()
      .transform((val) => val.trim())
      .pipe(
        z
          .string()
          .min(1, { message: 'speaker не должен быть пустым' })
          .max(40, { message: 'speaker не должен превышать 40 символов' })
      ),
    tokens: z
      .array(StoryTokenSchema)
      .min(1, { message: 'Массив tokens должен содержать хотя бы 1 токен' })
      .max(40, { message: 'Массив tokens не может превышать 40 токенов' }),
    translation: z
      .string()
      .transform((val) => val.trim())
      .pipe(
        z
          .string()
          .min(1, { message: 'translation не должен быть пустым' })
          .max(500, { message: 'translation не должен превышать 500 символов' })
      ),
  })
  .strip();

export const AIStorySchema = z
  .object({
    story: z
      .array(StorySentenceSchema)
      .min(3, { message: 'История должна содержать минимум 3 предложения' })
      .max(15, { message: 'История может содержать максимум 15 предложений' }),
  })
  .strip()
  .transform((data) => {
    // Normalize sentence_ids to be strictly 1...N sequential numbers
    const normalizedStory = data.story.map((sentence, index) => ({
      ...sentence,
      sentence_id: index + 1,
    }));
    return {
      story: normalizedStory,
    };
  });
