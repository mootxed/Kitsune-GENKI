import { z } from 'zod';
import { WORD_SOURCES } from '../intents.js';
import { StoryResponseSchema } from '../schemas.js';
import { runStructuredHandler } from '../handler-runner.js';

export const CreateStoryInputSchema = z
  .object({
    topic: z.string().trim().min(1).max(500),
    tone: z.enum(['neutral', 'funny', 'warm', 'mystery']).default('neutral'),
    length: z.enum(['short', 'medium', 'long']).default('short'),
    wordSource: z.enum(WORD_SOURCES).default('mixed'),
    explicitWords: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  })
  .strip();

export const CREATE_STORY_PROMPT = `Создай естественную учебную историю на японском.
Верни только JSON следующей точной структуры:
{
  "type": "story",
  "message": "Готово — вот ваша история.",
  "story": [
    {
      "sentence_id": 1,
      "speaker": "Имя или Голос",
      "translation": "Перевод предложения на русский",
      "tokens": [
        {
          "kanji": "猫",
          "writing": "ねこ",
          "translation": "кошка",
          "type": "Noun",
          "dictionaryForm": "猫",
          "dictionaryReading": "ねこ",
          "dictionaryMeaning": "кошка",
          "sourceToken": "W1"
        }
      ]
    }
  ],
  "unknownWords": [ { "writing": "...", "reading": "...", "meaning": "..." } ]
}
Обязательные слова (requiredWords / первые слова W1..Wk) обязательны к использованию с указанием sourceToken: "W1". Дополнительные слова (supportingWords) являются необязательным поддерживающим контекстом. История содержит от 3 до 15 предложений. Каждый японский элемент (кроме пунктуации) — отдельный токен. История не меняет прогресс.`;

function norm(val) {
  return String(val || '')
    .normalize('NFKC')
    .replace(/\s+/gu, '')
    .toLowerCase();
}

export function isTokenMatchingWord(token, word) {
  if (!token || !word) return false;
  const surfaceWriting = norm(token.kanji || token.writing);
  const dictionaryForm = norm(token.dictionaryForm);
  const surfaceReading = norm(token.writing);
  const dictionaryReading = norm(token.dictionaryReading);

  const wordWriting = norm(word.writing || word.kanji);
  const wordReading = norm(word.reading);
  const wordHasKanji = /[\u4e00-\u9faf]/u.test(wordWriting);

  if (dictionaryForm && dictionaryForm === wordWriting) {
    return !wordReading || !dictionaryReading || dictionaryReading === wordReading;
  }

  if (surfaceWriting && surfaceWriting === wordWriting) {
    return true;
  }

  if (
    !wordHasKanji &&
    wordReading &&
    (dictionaryReading === wordReading || surfaceReading === wordReading)
  ) {
    return true;
  }

  return false;
}

export function validateStoryForMaterial(data, { length = 'short', words = [] } = {}) {
  const story = data?.story;
  if (!Array.isArray(story) || story.length === 0) {
    return {
      success: false,
      error: new z.ZodError([{ code: 'custom', path: ['story'], message: 'История пуста' }]),
    };
  }

  const lengthRanges = {
    short: { min: 3, max: 5 },
    medium: { min: 6, max: 9 },
    long: { min: 10, max: 15 },
  };
  const range = lengthRanges[length] || lengthRanges.short;
  if (story.length < range.min || story.length > range.max) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: 'custom',
          path: ['story'],
          message: `Количество предложений (${story.length}) не соответствует длине '${length}' (${range.min}-${range.max})`,
        },
      ]),
    };
  }

  const allTokens = story.flatMap((s) => s.tokens || []);
  const requiredLimits = { short: 6, medium: 9, long: 12 };
  const maxRequired = requiredLimits[length] || 6;
  const requiredWords = words.slice(0, maxRequired);

  for (const promptWord of requiredWords) {
    const isMatched = allTokens.some((t) => {
      if (t.sourceToken && promptWord.token && t.sourceToken === promptWord.token) {
        return isTokenMatchingWord(t, promptWord);
      }
      return isTokenMatchingWord(t, promptWord);
    });

    if (!isMatched) {
      return {
        success: false,
        error: new z.ZodError([
          {
            code: 'custom',
            path: ['story'],
            message: `Обязательное слово ${promptWord.token || ''} (${promptWord.writing}) не было использовано в истории`,
          },
        ]),
      };
    }
  }

  if (Array.isArray(data.unknownWords) && data.unknownWords.length > 15) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: 'custom',
          path: ['unknownWords'],
          message: 'Превышен лимит неизвестных слов (максимум 15)',
        },
      ]),
    };
  }

  return { success: true, data };
}

export function handleCreateStory(options) {
  return runStructuredHandler({
    handlerName: 'create_story',
    systemPrompt: CREATE_STORY_PROMPT,
    inputSchema: CreateStoryInputSchema,
    outputSchema: StoryResponseSchema,
    additionalValidator: (data) =>
      validateStoryForMaterial(data, {
        length: options.input?.length || 'short',
        words: options.context?.words || [],
      }),
    ...options,
  });
}
