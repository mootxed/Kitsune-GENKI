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
Слова W1... из контекста обязательны. Для каждого обязательного слова W1 указывай sourceToken: "W1". История содержит от 3 до 15 предложений. Каждый японский элемент (кроме пунктуации) — отдельный токен. История не меняет прогресс.`;

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
  const usedSourceTokens = new Set(allTokens.map((t) => t.sourceToken).filter(Boolean));
  const usedWritings = new Set(
    allTokens.flatMap((t) => [t.writing, t.kanji, t.dictionaryForm]).filter(Boolean)
  );

  for (const promptWord of words) {
    const isUsedBySourceToken = promptWord.token && usedSourceTokens.has(promptWord.token);
    const isUsedByText =
      usedWritings.has(promptWord.writing) ||
      (promptWord.kanji && usedWritings.has(promptWord.kanji));
    if (!isUsedBySourceToken && !isUsedByText) {
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
