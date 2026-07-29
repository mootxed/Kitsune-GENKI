import { describe, it, expect } from 'vitest';
import {
  validateStorySemantics,
  validateStoryForMaterial,
} from '../src/ai/handlers/create-story.js';

describe('AI Story Quality & Semantic Validation', () => {
  it('rejects stories consisting primarily of repetitive greetings (>60%)', () => {
    const repetitiveStoryPayload = {
      type: 'story',
      message: 'Тест',
      story: [
        {
          sentence_id: 1,
          speaker: '山田',
          translation: 'Доброе утро, Ямада-сан',
          tokens: [{ kanji: 'おはよう', writing: 'おはよう', type: 'Expression' }],
        },
        {
          sentence_id: 2,
          speaker: '田中',
          translation: 'Доброе утро, Танака-сан',
          tokens: [{ kanji: 'おはよう', writing: 'おはよう', type: 'Expression' }],
        },
        {
          sentence_id: 3,
          speaker: '先生',
          translation: 'Здравствуйте, учитель',
          tokens: [
            { kanji: 'おはようございます', writing: 'おはようございます', type: 'Expression' },
          ],
        },
        {
          sentence_id: 4,
          speaker: '山田',
          translation: 'Добрый день, Ямада-сан',
          tokens: [{ kanji: 'こんにちは', writing: 'こんにちは', type: 'Expression' }],
        },
      ],
    };

    const semanticResult = validateStorySemantics(repetitiveStoryPayload);
    expect(semanticResult.success).toBe(false);
    expect(semanticResult.issues[0]).toContain('повторяющихся приветствий');
  });

  it('passes a coherent narrative story with setup, action, and result', () => {
    const coherentStoryPayload = {
      type: 'story',
      message: 'Учебная история',
      story: [
        {
          sentence_id: 1,
          speaker: 'Рассказчик',
          translation: 'Ямада утром идет в школу.',
          tokens: [
            { kanji: '山田', writing: 'やまだ' },
            { kanji: 'さん', writing: 'さん' },
            { kanji: 'は', writing: 'は' },
            { kanji: '朝', writing: 'あさ' },
            { kanji: '学校', writing: 'がっこう' },
            { kanji: 'へ', writing: 'へ' },
            { kanji: '行きます', writing: 'いきます' },
            { kanji: '。', writing: '。', type: 'Punctuation' },
          ],
        },
        {
          sentence_id: 2,
          speaker: 'Рассказчик',
          translation: 'В школе он встречает Танаку.',
          tokens: [
            { kanji: '学校', writing: 'がっこう' },
            { kanji: 'で', writing: 'で' },
            { kanji: '田中', writing: 'たなか' },
            { kanji: 'さん', writing: 'さん' },
            { kanji: 'に', writing: 'に' },
            { kanji: '会います', writing: 'あいます' },
            { kanji: '。', writing: '。', type: 'Punctuation' },
          ],
        },
        {
          sentence_id: 3,
          speaker: 'Рассказчик',
          translation: 'Они вместе читают книгу.',
          tokens: [
            { kanji: '二人は', writing: 'ふたりは' },
            { kanji: '一緒に', writing: 'いっしょに' },
            { kanji: '本', writing: 'ほん' },
            { kanji: 'を', writing: 'を' },
            { kanji: '読みます', writing: 'よみます' },
            { kanji: '。', writing: '。', type: 'Punctuation' },
          ],
        },
      ],
    };

    const semanticResult = validateStorySemantics(coherentStoryPayload);
    expect(semanticResult.success).toBe(true);
  });

  it('short story uses suitable word limit (max 4 required words) without over-requiring', () => {
    const storyPayload = {
      type: 'story',
      message: 'История',
      story: [
        {
          sentence_id: 1,
          speaker: 'Рассказчик',
          translation: 'Ямада учится.',
          tokens: [
            { kanji: '山田', writing: 'やまだ', sourceToken: 'W1' },
            { kanji: '本', writing: 'ほん', sourceToken: 'W2' },
            { kanji: '学校', writing: 'がっこう', sourceToken: 'W3' },
            { kanji: '読む', writing: 'よむ', sourceToken: 'W4' },
          ],
        },
        {
          sentence_id: 2,
          speaker: 'Рассказчик',
          translation: 'Он идёт домой.',
          tokens: [{ kanji: '帰る', writing: 'かえる' }],
        },
        {
          sentence_id: 3,
          speaker: 'Рассказчик',
          translation: 'Конец.',
          tokens: [{ kanji: '終わり', writing: 'おわり' }],
        },
      ],
    };

    const words = [
      { token: 'W1', writing: '山田' },
      { token: 'W2', writing: '本' },
      { token: 'W3', writing: '学校' },
      { token: 'W4', writing: '読む' },
      { token: 'W5', writing: '先生' },
      { token: 'W6', writing: '学生' },
    ];

    // Короткая история требует максимум 4 первых слова, игнорируя перегрузку
    const validation = validateStoryForMaterial(storyPayload, { length: 'short', words });
    expect(validation.success).toBe(true);
  });
});
