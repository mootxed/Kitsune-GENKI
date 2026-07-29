/**
 * src/ai/handlers/create-mnemonic.js
 *
 * AI-handler для создания мнемоники (для leech-карточек и Drawing).
 *
 * ЗАПРЕЩЕНО:
 *  - анализировать strokes / canvas
 *  - изменять state или FSRS
 *  - создавать ложную этимологию как факт
 *  - использовать оскорбительные образы
 */

import { z } from 'zod';
import { MnemonicSchema } from '../schemas.js';
import { runStructuredHandler } from '../handler-runner.js';

const CreateMnemonicInputSchema = z
  .object({
    item: z.object({
      writing: z.string().min(1).max(200),
      reading: z.string().max(200).nullable(),
      meanings: z.array(z.string()).min(1),
      partOfSpeech: z.array(z.string()).default([]),
    }),
    skill: z.string().min(1).max(80),
    mode: z.string().min(1).max(80),
    confusion: z.string().max(500).nullable().optional(),
    userPreferences: z
      .object({
        mnemonicLanguage: z.enum(['ru', 'en']).default('ru'),
      })
      .default({ mnemonicLanguage: 'ru' }),
  })
  .strip();

const SYSTEM_PROMPT = `Ты — AI Сенсей, учитель японского. Создай короткую запоминающуюся мнемонику для японского слова.

ОБЯЗАТЕЛЬНАЯ СТРУКТУРА ОТВЕТА (JSON):
{
  "type": "mnemonic",
  "mnemonic": "Короткая ассоциация на русском (1–3 предложения)",
  "breakdown": [
    { "element": "始", "cue": "Ассоциация для этого элемента" }
  ],
  "warning": null,
  "example": {
    "japanese": "Пример с этим словом.",
    "translation": "Перевод."
  }
}

ПРАВИЛА:
- Мнемоника короткая и конкретная (не абстрактная)
- Явно называй художественные ассоциации «ассоциацией», не выдавай за факт
- При объяснении компонентов кандзи — не придумывай значения радикалов
- Не используй оскорбительные или травмирующие образы
- Если слово сложное для мнемоники — добавь предупреждение в поле warning
- Ответ на русском языке

Верни ТОЛЬКО валидный JSON без markdown-обёрток.`;

/**
 * @param {object} options
 * @param {object} options.input — { item, skill, mode, confusion, userPreferences }
 * @param {object} options.context
 * @param {Function} options.request
 */
export function handleCreateMnemonic(options) {
  return runStructuredHandler({
    handlerName: 'create_mnemonic',
    systemPrompt: SYSTEM_PROMPT,
    input: options.input,
    inputSchema: CreateMnemonicInputSchema,
    outputSchema: MnemonicSchema,
    context: options.context,
    request: options.request,
  });
}
