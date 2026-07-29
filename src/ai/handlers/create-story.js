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

export const CREATE_STORY_PROMPT = `Создай естественную учебную историю на японском языке с понятным сюжетом.
Верни только JSON следующей точной структуры:
{
  "type": "story",
  "message": "Готово — вот ваша история.",
  "story": [
    {
      "sentence_id": 1,
      "speaker": "Рассказчик",
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
ТРЕБОВАНИЯ К СЮЖЕТУ:
1. История должна быть связным повествованием (завязка → действие → результат), а не набором изолированных фраз.
2. Каждое следующее предложение логически продолжает предыдущее.
3. ЗАПРЕЩЕНЫ несколько почти одинаковых приветствий подряд (например, "おはよう 山田さん" / "おはよう 田中さん" / "こんにちは"). Максимум одно приветствие на всю историю.
4. Персонажи (speaker) должны быть постоянными (1-3 персонажа). Для закадрового описания используй speaker: "Рассказчик".
5. Хотя бы одно действие должно изменять ситуацию. Финальное предложение должно завершать сцену.
6. Целевые слова (requiredWords) используй естественно. При недостатке лексики в первой главе разрешено добавить простые служебные слова N5 (行く, 見る, 読む, 学校, 本, 一緒に) и указать их в unknownWords. Каждый японский элемент (кроме пунктуации) — отдельный токен.`;

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

export function validateStorySemantics(data) {
  const story = data?.story;
  if (!Array.isArray(story) || story.length === 0) {
    return { success: false, issues: ['История пуста'] };
  }

  const issues = [];
  const rawJapaneseSentences = story.map((s) =>
    (s.tokens || []).map((t) => (t ? t.kanji || t.writing || '' : '')).join('')
  );

  const greetings = ['おはよう', 'こんにちは', 'こんばんは', 'さようなら', 'はじめまして'];
  let greetingCount = 0;
  for (const jText of rawJapaneseSentences) {
    if (greetings.some((g) => jText.includes(g))) {
      greetingCount++;
    }
  }

  if (story.length >= 3 && greetingCount / story.length > 0.6) {
    issues.push(
      'История состоит преимущественно из повторяющихся приветствий (>60%). Добавь завязку, действие и результат. Сохрани целевые слова, но не повторяй один шаблон.'
    );
  }

  const normalizedSentences = rawJapaneseSentences.map((s) => s.replace(/[。、！？\s]/gu, ''));
  const uniqueSentences = new Set(normalizedSentences);
  if (story.length >= 3 && uniqueSentences.size < Math.ceil(story.length * 0.7)) {
    issues.push(
      'История содержит повторяющиеся или одинаковые предложения. Каждое предложение должно развивать сюжет.'
    );
  }

  const speakers = story
    .map((s) => (s.speaker || '').trim())
    .filter((sp) => sp && sp !== 'Рассказчик' && sp !== 'Narrator' && sp !== 'Голос');
  const uniqueSpeakers = new Set(speakers);

  if (story.length <= 5 && uniqueSpeakers.size > 3) {
    issues.push('Слишком много разных персонажей для короткой истории.');
  }

  if (issues.length > 0) {
    return { success: false, issues };
  }

  return { success: true };
}

export function validateStoryForMaterial(data, options = {}) {
  const { length = 'short', words = [], isRepairedAttempt = false } = options;
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

  const semantic = validateStorySemantics(data);
  if (!semantic.success && !isRepairedAttempt) {
    return {
      success: false,
      error: new z.ZodError(
        semantic.issues.map((msg) => ({
          code: 'custom',
          path: ['story'],
          message: msg,
        }))
      ),
    };
  }

  const allTokens = story.flatMap((s) => s.tokens || []);
  const requiredLimits = { short: 4, medium: 7, long: 10 };
  const maxRequired = requiredLimits[length] || 4;
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
    additionalValidator: (data, validatorOpts) =>
      validateStoryForMaterial(data, {
        length: options.input?.length || 'short',
        words: options.context?.words || [],
        ...validatorOpts,
      }),
    ...options,
  });
}
