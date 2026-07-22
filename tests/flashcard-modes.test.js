import { describe, expect, it } from 'vitest';
import {
  CARD_MODES,
  generateWordContext,
  getAdaptiveModeWeights,
  selectMode,
} from '../ui/flashcards.js';

const kanjiWord = {
  id: 'word-kanji',
  kanji: '学校',
  writing: 'がっこう',
  translation: 'школа',
  category: 'places',
};

const kanaWord = {
  id: 'word-kana',
  kanji: 'こんにちは',
  writing: 'こんにちは',
  translation: 'добрый день',
  category: 'greetings',
};

function randomSequence(...values) {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe('adaptive flashcard modes', () => {
  it('выбирает recognition для новых карточек и production для зрелых', () => {
    expect(getAdaptiveModeWeights({ state: 0, reps: 0 }, kanjiWord)).toEqual({
      multipleChoice: 0.7,
      typing: 0.2,
      drawing: 0.1,
    });
    expect(getAdaptiveModeWeights({ state: 2, reps: 8, stability: 7 }, kanjiWord)).toEqual({
      multipleChoice: 0.2,
      typing: 0.3,
      drawing: 0.5,
    });
  });

  it('не назначает drawing слову без кандзи и повышает долю typing', () => {
    expect(getAdaptiveModeWeights({ state: 0, reps: 0 }, kanaWord)).toEqual({
      multipleChoice: 0.7,
      typing: 0.3,
      drawing: 0,
    });
    expect(getAdaptiveModeWeights({ state: 2, reps: 8, stability: 8 }, kanaWord)).toEqual({
      multipleChoice: 0.2,
      typing: 0.8,
      drawing: 0,
    });
  });

  it('выбирает reverse и context как подрежимы recognition', () => {
    const newCard = { state: 0, reps: 0 };

    expect(selectMode(newCard, kanjiWord, randomSequence(0.1, 0.1))).toBe(
      CARD_MODES.CONTEXT_SENTENCE
    );
    expect(selectMode(newCard, kanjiWord, randomSequence(0.1, 0.4))).toBe(
      CARD_MODES.REVERSE_MULTIPLE_CHOICE
    );
    expect(selectMode(newCard, kanjiWord, randomSequence(0.1, 0.9))).toBe(
      CARD_MODES.MULTIPLE_CHOICE
    );
  });

  it('создаёт контекст только для безопасных категорий', () => {
    expect(generateWordContext({ ...kanjiWord, category: 'food' })).toEqual({
      sentence: '毎朝 [ _ ] を食べます。',
      hint: 'Каждое утро я ем ___.',
    });
    expect(generateWordContext(kanaWord)).toBeNull();
  });
});
