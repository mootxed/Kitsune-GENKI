import { describe, expect, it } from 'vitest';
import {
  CARD_MODES,
  buildMultipleChoiceOptions,
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
    const contextWord = {
      ...kanjiWord,
      contextProduction: {
        prompt: '毎日 [ _ ] へ行きます。',
        meaningCue: 'школа',
        acceptedAnswers: ['がっこう'],
        requiredForm: 'dictionary',
      },
    };

    expect(selectMode(newCard, contextWord, randomSequence(0.1, 0.1))).toBe(
      CARD_MODES.CONTEXT_SENTENCE
    );
    expect(selectMode(newCard, contextWord, randomSequence(0.1, 0.4))).toBe(
      CARD_MODES.REVERSE_MULTIPLE_CHOICE
    );
    expect(selectMode(newCard, contextWord, randomSequence(0.1, 0.9))).toBe(
      CARD_MODES.MULTIPLE_CHOICE
    );
  });

  it('создаёт контекст только для безопасных категорий', () => {
    expect(generateWordContext({ ...kanjiWord, category: 'food' })).toBeNull();
    expect(
      generateWordContext({
        ...kanjiWord,
        contextProduction: {
          prompt: '毎朝 [ _ ] へ行きます。',
          meaningCue: 'школа',
          acceptedAnswers: ['がっこう'],
          requiredForm: 'dictionary',
        },
      })
    ).toEqual({
      prompt: '毎朝 [ _ ] へ行きます。',
      meaningCue: 'школа',
      acceptedAnswers: ['がっこう'],
      requiredForm: 'dictionary',
    });
    expect(generateWordContext(kanaWord)).toBeNull();
  });

  it('не создаёт визуально одинаковые или lexeme-дубли в multiple choice', () => {
    const words = [
      { ...kanaWord, id: 'formal', translation: 'Доброе утро! (вежливо)' },
      { ...kanaWord, id: 'duplicate', translation: 'Доброе утро! (другое)' },
      { id: 'thanks', writing: 'ありがとう', translation: 'Спасибо', category: 'greetings' },
      { id: 'bye', writing: 'さようなら', translation: 'До свидания', category: 'greetings' },
      { id: 'yes', writing: 'はい', translation: 'Да', category: 'greetings' },
    ];
    const options = buildMultipleChoiceOptions(words[0], words, (option) =>
      option.translation.split('(')[0].trim()
    );
    const labels = options.map((option) => option.translation.split('(')[0].trim());

    expect(options).toHaveLength(4);
    expect(new Set(labels).size).toBe(4);
    expect(options.some((option) => option.id === 'duplicate')).toBe(false);
  });

  it('исключает одинаковое японское написание при разных переводах и lexemeId', () => {
    const correct = {
      id: 'L1_V019',
      lexemeId: 'friend-1',
      writing: 'ともだち',
      translation: 'друг',
      category: 'people',
    };
    const duplicate = {
      id: 'L11_V028',
      lexemeId: 'friend-2',
      writing: 'トモダチ',
      translation: 'друг, товарищ',
      category: 'people',
    };
    const words = [
      correct,
      duplicate,
      { id: 'teacher', writing: 'せんせい', translation: 'учитель', category: 'people' },
      { id: 'student', writing: 'がくせい', translation: 'студент', category: 'people' },
      { id: 'child', writing: 'こども', translation: 'ребёнок', category: 'people' },
    ];

    const options = buildMultipleChoiceOptions(correct, words, (word) => word.translation);
    expect(options).toHaveLength(4);
    expect(options.some((option) => option.id === duplicate.id)).toBe(false);
  });
});
