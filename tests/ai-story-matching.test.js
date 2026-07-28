import { describe, expect, it } from 'vitest';
import { isTokenMatchingWord, validateStoryForMaterial } from '../src/ai/handlers/create-story.js';

describe('Story Token Matching Rules', () => {
  it('correctly matches inflected verb 始めました with prompt word 始める via dictionaryForm', () => {
    const promptWord = { token: 'W1', writing: '始める', reading: 'はじめる', kanji: '始める' };
    const inflectedToken = {
      kanji: '始めました',
      writing: 'はじめました',
      dictionaryForm: '始める',
      dictionaryReading: 'はじめる',
      type: 'Verb',
    };
    expect(isTokenMatchingWord(inflectedToken, promptWord)).toBe(true);

    const validationResult = validateStoryForMaterial(
      {
        story: [
          {
            sentence_id: 1,
            speaker: 'Sensei',
            translation: 'Мы начали.',
            tokens: [inflectedToken],
          },
          {
            sentence_id: 2,
            speaker: 'Sensei',
            translation: 'Хорошо.',
            tokens: [{ writing: 'いいえ' }],
          },
          {
            sentence_id: 3,
            speaker: 'Sensei',
            translation: 'Пошли.',
            tokens: [{ writing: '行こう' }],
          },
        ],
      },
      { length: 'short', words: [promptWord] }
    );
    expect(validationResult.success).toBe(true);
  });

  it('rejects homonyms like 箸【はし】 when prompt word is 橋【はし】 (kanji word)', () => {
    const bridgeWord = { token: 'W1', writing: '橋', reading: 'はし', kanji: '橋' };
    const chopsticksToken = {
      kanji: '箸',
      writing: 'はし',
      dictionaryForm: '箸',
      dictionaryReading: 'はし',
      type: 'Noun',
    };
    expect(isTokenMatchingWord(chopsticksToken, bridgeWord)).toBe(false);

    const validationResult = validateStoryForMaterial(
      {
        story: [
          {
            sentence_id: 1,
            speaker: 'Sensei',
            translation: 'Палочки на столе.',
            tokens: [chopsticksToken],
          },
          {
            sentence_id: 2,
            speaker: 'Sensei',
            translation: 'Хорошо.',
            tokens: [{ writing: 'いいえ' }],
          },
          {
            sentence_id: 3,
            speaker: 'Sensei',
            translation: 'Пошли.',
            tokens: [{ writing: '行こう' }],
          },
        ],
      },
      { length: 'short', words: [bridgeWord] }
    );
    expect(validationResult.success).toBe(false);
  });
});
