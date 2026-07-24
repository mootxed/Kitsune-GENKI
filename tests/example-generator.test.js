/**
 * tests/example-generator.test.js
 * Модульные тесты для генератора и ранжирования контекстных предложений.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/examples-db.js', () => ({
  ExamplesDB: {
    getExamplesForLexeme: vi.fn(() => []),
    getCompatibleVocab: vi.fn(() => []),
  },
}));

import { ExamplesDB } from '../src/examples-db.js';
import {
  generateExample,
  getExampleCandidates,
  nextSeed,
  highlightWord,
  EXAMPLE_SOURCES,
} from '../src/example-generator.js';

function makeNoun(overrides = {}) {
  return {
    id: 'n1',
    kanji: '本',
    writing: 'ほん',
    translation: 'книга',
    lexemeId: 'lex-hon',
    lessonIds: [1],
    partOfSpeech: 'noun',
    category: 'things',
    ...overrides,
  };
}

function makeCorpusExample(overrides = {}) {
  return {
    japanese: '本を読みます',
    reading: 'ほんをよみます',
    translation: 'читаю книгу',
    lessonRequired: 1,
    grammarIds: ['を'],
    source: 'curated',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  ExamplesDB.getExamplesForLexeme.mockReturnValue([]);
  ExamplesDB.getCompatibleVocab.mockReturnValue([]);
});

describe('Детерминизм и получение кандидатов', () => {
  it('один index → один результат при повторном вызове', () => {
    ExamplesDB.getExamplesForLexeme.mockReturnValue([
      makeCorpusExample(),
      makeCorpusExample({ japanese: 'これは本です' }),
    ]);

    const word = makeNoun();
    const r1 = generateExample(word, { exampleIndex: 0 });
    const r2 = generateExample(word, { exampleIndex: 0 });

    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r1.japanese).toBe(r2.japanese);
    expect(r1.translation).toBe(r2.translation);
  });

  it('разные exampleIndex → возвращают разные примеры', () => {
    const corpus = Array.from({ length: 3 }, (_, i) =>
      makeCorpusExample({ japanese: `文${i}。`, translation: `предложение ${i}` })
    );
    ExamplesDB.getExamplesForLexeme.mockReturnValue(corpus);

    const word = makeNoun();
    const results = new Set();
    for (let i = 0; i < 3; i++) {
      const r = generateExample(word, { exampleIndex: i });
      if (r) results.add(r.japanese);
    }
    expect(results.size).toBe(3);
  });

  it('nextSeed детерминирован', () => {
    expect(nextSeed(0)).toBe(nextSeed(0));
    expect(nextSeed(100)).toBe(nextSeed(100));
    expect(nextSeed(0)).not.toBe(0);
  });
});

describe('Ограничения по урокам', () => {
  it('corpus: не возвращает примеры с лексикой будущих уроков', () => {
    ExamplesDB.getExamplesForLexeme.mockReturnValue([]);

    const word = makeNoun();
    getExampleCandidates(word, { userMaxLesson: 3 });

    expect(ExamplesDB.getExamplesForLexeme).toHaveBeenCalledWith(word.lexemeId, 3);
  });

  it('возвращает null при userMaxLesson=0 (нет открытых уроков)', () => {
    ExamplesDB.getExamplesForLexeme.mockReturnValue([]);

    const word = makeNoun();
    const result = generateExample(word, { userMaxLesson: 0 });
    expect(result).toBeNull();
  });
});

describe('Отсутствие ложного production evidence', () => {
  it('результат generateExample не содержит acceptedAnswers или requiredForm', () => {
    ExamplesDB.getExamplesForLexeme.mockReturnValue([makeCorpusExample()]);
    const result = generateExample(makeNoun());

    expect(result).not.toBeNull();
    expect(result.acceptedAnswers).toBeUndefined();
    expect(result.requiredForm).toBeUndefined();
    expect(result).not.toHaveProperty('prompt');
    expect(result).not.toHaveProperty('meaningCue');
  });
});

describe('Подсветка слова (highlightWord)', () => {
  it('оборачивает кандзи слова в <mark class="ex-highlight">', () => {
    const word = makeNoun();
    const result = highlightWord('これは本です', word);
    expect(result).toContain('<mark class="ex-highlight">本</mark>');
  });

  it('оборачивает кану если кандзи нет в предложении', () => {
    const word = makeNoun({ kanji: '', writing: 'ほん' });
    const result = highlightWord('これはほんです', word);
    expect(result).toContain('<mark class="ex-highlight">ほん</mark>');
  });

  it('возвращает оригинал при отсутствии совпадения', () => {
    const word = makeNoun();
    const result = highlightWord('これは猫です', word);
    expect(result).toBe('これは猫です');
  });

  it('не ломается на null объектах', () => {
    const word = makeNoun();
    expect(highlightWord(null, word)).toBe('');
    expect(highlightWord('これは本です', null)).toBe('これは本です');
  });
});

describe('Структура ответа getExampleCandidates', () => {
  it('пример содержит все обязательные поля и сохраняет реальный источник', () => {
    ExamplesDB.getExamplesForLexeme.mockReturnValue([
      makeCorpusExample({ source: 'curated-word' }),
    ]);
    const result = generateExample(makeNoun());

    expect(result).not.toBeNull();
    expect(typeof result.japanese).toBe('string');
    expect(typeof result.japaneseHighlighted).toBe('string');
    expect(typeof result.reading).toBe('string');
    expect(typeof result.translation).toBe('string');
    expect(result.source).toBe('curated-word');
  });
});
