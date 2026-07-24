/* src/ai-story-schema.js — Zod schemas and normalization for AI story generation */
import { z } from 'zod';

export const StoryTokenSchema = z
  .object({
    kanji: z
      .string()
      .nullable()
      .optional()
      .transform((val) => (val ?? '').trim())
      .pipe(z.string().max(200)),
    writing: z
      .string()
      .nullable()
      .optional()
      .transform((val) => (val ?? '').trim())
      .pipe(z.string().max(200)),
    translation: z
      .string()
      .nullable()
      .optional()
      .transform((val) => (val ?? '').trim())
      .pipe(z.string().max(500)),
    type: z
      .string()
      .nullable()
      .optional()
      .transform((val) => {
        const trimmed = (val ?? '').trim();
        return trimmed.length > 0 ? trimmed : 'Unknown';
      })
      .pipe(z.string().max(100)),
  })
  .strip()
  .refine((token) => token.kanji.trim().length > 0 || token.writing.trim().length > 0, {
    message: 'Токен должен содержать хотя бы одно непустое значение в kanji или writing',
    path: ['kanji'],
  });

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
