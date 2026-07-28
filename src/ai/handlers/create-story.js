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
Верни только JSON type=story с 3-15 предложениями. Каждый японский элемент, кроме
пунктуации, обязан быть отдельным tokens-объектом: kanji, writing, translation, type.
Для склонённых слов добавляй dictionaryForm, dictionaryReading, dictionaryMeaning.
Слова W1... обязательны, но не выводи локальные ID. История не меняет прогресс.`;

export function handleCreateStory(options) {
  return runStructuredHandler({
    handlerName: 'create_story',
    systemPrompt: CREATE_STORY_PROMPT,
    inputSchema: CreateStoryInputSchema,
    outputSchema: StoryResponseSchema,
    ...options,
  });
}
