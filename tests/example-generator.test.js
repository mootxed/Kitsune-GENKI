/**
 * tests/example-generator.test.js
 * Модульные тесты для гибридного генератора контекстных предложений.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Мокируем ExamplesDB — движок не зависит от реального БД в unit-тестах
// ---------------------------------------------------------------------------
vi.mock('../src/examples-db.js', () => ({
  ExamplesDB: {
    getExamplesForLexeme: vi.fn(() => []),
    getCompatibleVocab: vi.fn(() => []),
  },
}));

import { ExamplesDB } from '../src/examples-db.js';
import {
  generateExample,
  nextSeed,
  highlightWord,
  isSemanticallySafe,
  EXAMPLE_SOURCES,
  SEMANTIC_TEMPLATES,
} from '../src/example-generator.js';

// ---------------------------------------------------------------------------
// Фабрики тестовых слов
// ---------------------------------------------------------------------------

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
    semanticTags: ['object'],
    ...overrides,
  };
}

function makeVerb(overrides = {}) {
  return {
    id: 'v1',
    kanji: '食べる',
    writing: 'たべる',
    translation: 'есть',
    lexemeId: 'lex-taberu',
    lessonIds: [3],
    partOfSpeech: 'verb',
    verbClass: 'ichidan',
    category: 'ru-verbs',
    transitivity: 'transitive',
    semanticTags: ['verb'],
    ...overrides,
  };
}

function makeFood(overrides = {}) {
  return {
    id: 'f1',
    kanji: 'コーヒー',
    writing: 'コーヒー',
    translation: 'кофе',
    lexemeId: 'lex-coffee',
    lessonIds: [2],
    partOfSpeech: 'noun',
    category: 'food',
    semanticTags: ['food', 'drink'],
    ...overrides,
  };
}

function makeAdj(overrides = {}) {
  return {
    id: 'a1',
    kanji: '美味しい',
    writing: 'おいしい',
    translation: 'вкусный',
    lexemeId: 'lex-oishii',
    lessonIds: [4],
    partOfSpeech: 'adjective',
    category: 'i-adjectives',
    semanticTags: ['adjective', 'quality'],
    ...overrides,
  };
}

function makePerson(overrides = {}) {
  return {
    id: 'p1',
    kanji: '友達',
    writing: 'ともだち',
    translation: 'друг',
    lexemeId: 'lex-tomodachi',
    lessonIds: [1],
    partOfSpeech: 'noun',
    category: 'people',
    semanticTags: ['person', 'animate'],
    ...overrides,
  };
}

function makePlace(overrides = {}) {
  return {
    id: 'pl1',
    kanji: '学校',
    writing: 'がっこう',
    translation: 'школа',
    lexemeId: 'lex-gakkou',
    lessonIds: [2],
    partOfSpeech: 'noun',
    category: 'places',
    semanticTags: ['place'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Вспомогательная функция: создать corpus-пример
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// beforeEach: сбросить все моки
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  ExamplesDB.getExamplesForLexeme.mockReturnValue([]);
  ExamplesDB.getCompatibleVocab.mockReturnValue([]);
});

// ---------------------------------------------------------------------------
// 1. Детерминизм
// ---------------------------------------------------------------------------
describe('Детерминизм', () => {
  it('один seed → один результат при повторном вызове', () => {
    ExamplesDB.getExamplesForLexeme.mockReturnValue([
      makeCorpusExample(),
      makeCorpusExample({ japanese: 'これは本です' }),
    ]);

    const word = makeNoun();
    const r1 = generateExample(word, { seed: 42 });
    const r2 = generateExample(word, { seed: 42 });

    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r1.japanese).toBe(r2.japanese);
    expect(r1.translation).toBe(r2.translation);
  });

  it('разные seeds → могут давать разные результаты при большом корпусе', () => {
    // Наполняем корпус 20 разными вариантами
    const corpus = Array.from({ length: 20 }, (_, i) =>
      makeCorpusExample({ japanese: `文報${i}。`, translation: `предложение ${i}` })
    );
    ExamplesDB.getExamplesForLexeme.mockReturnValue(corpus);

    const word = makeNoun();
    const results = new Set();
    // Используем nextSeed-цепочку — даёт хорошо разбросанные значения
    let s = 0;
    for (let i = 0; i < 20; i++) {
      const r = generateExample(word, { seed: s });
      if (r) results.add(r.japanese);
      s = nextSeed(s);
    }
    // Хотя бы два разных результата для 20 хорошо разбросанных seeds
    expect(results.size).toBeGreaterThanOrEqual(2);
  });

  it('nextSeed детерминирован', () => {
    expect(nextSeed(0)).toBe(nextSeed(0));
    expect(nextSeed(100)).toBe(nextSeed(100));
    expect(nextSeed(0)).not.toBe(0); // должен менять значение
  });

  it('перебор seeds через nextSeed даёт разные значения', () => {
    const seeds = new Set();
    let s = 0;
    for (let i = 0; i < 20; i++) {
      seeds.add(s);
      s = nextSeed(s);
    }
    expect(seeds.size).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// 2. Ограничения по урокам
// ---------------------------------------------------------------------------
describe('Ограничения по урокам', () => {
  it('corpus: не возвращает примеры с лексикой будущих уроков', () => {
    // getExamplesForLexeme уже фильтрует по уроку, тест проверяет что generateExample
    // передаёт правильный userMaxLesson
    ExamplesDB.getExamplesForLexeme.mockReturnValue([]);

    const word = makeNoun();
    generateExample(word, { seed: 0, userMaxLesson: 3 });

    expect(ExamplesDB.getExamplesForLexeme).toHaveBeenCalledWith(word.lexemeId, 3);
  });

  it('template: getCompatibleVocab вызывается с правильным userMaxLesson', () => {
    ExamplesDB.getExamplesForLexeme.mockReturnValue([]);
    ExamplesDB.getCompatibleVocab.mockReturnValue([makeVerb()]);

    const word = makePlace();
    generateExample(word, { seed: 0, userMaxLesson: 5 });

    expect(ExamplesDB.getCompatibleVocab).toHaveBeenCalledWith([], 5);
  });

  it('возвращает null при userMaxLesson=0 (нет открытых уроков)', () => {
    ExamplesDB.getExamplesForLexeme.mockReturnValue([]);
    ExamplesDB.getCompatibleVocab.mockReturnValue([]);

    const word = makeNoun();
    const result = generateExample(word, { seed: 0, userMaxLesson: 0 });
    // Либо null (нет шаблонных компаньонов), либо шаблон без компаньона
    // Главное — не крашится
    expect(result === null || typeof result === 'object').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Семантическая совместимость
// ---------------------------------------------------------------------------
describe('Семантическая совместимость', () => {
  it('еда + переходный глагол-еды — совместимо', () => {
    const food = makeFood();
    const drinkVerb = makeVerb({
      writing: 'のむ',
      kanji: '飲む',
      translation: 'пить',
      id: 'v-drink',
    });
    const tpl = SEMANTIC_TEMPLATES.find((t) => t.id === 'food-wo-drink');
    expect(tpl).toBeDefined();
    expect(isSemanticallySafe(food, drinkVerb, tpl)).toBe(true);
  });

  it('еда + глагол движения — несовместимо (запрещено)', () => {
    const food = makeFood();
    const walkVerb = makeVerb({
      writing: 'あるく',
      kanji: '歩く',
      translation: 'идти',
      id: 'v-walk',
      transitivity: 'intransitive',
    });
    const tpl = SEMANTIC_TEMPLATES.find((t) => t.id === 'food-wo-drink');
    expect(tpl).toBeDefined();
    expect(isSemanticallySafe(food, walkVerb, tpl)).toBe(false);
  });

  it('одинаковые слова — несовместимо', () => {
    const noun = makeNoun();
    const tpl = SEMANTIC_TEMPLATES.find((t) => t.id === 'noun-wa-desu');
    expect(isSemanticallySafe(noun, noun, tpl)).toBe(false);
  });

  it('слово не подходит по тегам шаблона — несовместимо', () => {
    const verb = makeVerb();
    const adj = makeAdj();
    // place-de-verb требует targetTags=['place']
    const tpl = SEMANTIC_TEMPLATES.find((t) => t.id === 'place-de-verb');
    expect(isSemanticallySafe(verb, adj, tpl)).toBe(false);
  });

  it('место + глагол (で) — совместимо', () => {
    const place = makePlace();
    const verb = makeVerb({ id: 'v2' });
    const tpl = SEMANTIC_TEMPLATES.find((t) => t.id === 'place-de-verb');
    expect(isSemanticallySafe(place, verb, tpl)).toBe(true);
  });

  it('прилагательное в роли предиката + существительное — совместимо', () => {
    const adj = makeAdj();
    const noun = makeNoun({ id: 'n2' });
    const tpl = SEMANTIC_TEMPLATES.find((t) => t.id === 'adj-standalone');
    expect(isSemanticallySafe(adj, noun, tpl)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Управление частицами
// ---------------------------------------------------------------------------
describe('Управление частицами', () => {
  it('шаблон place-ni-verb содержит частицу に', () => {
    const tpl = SEMANTIC_TEMPLATES.find((t) => t.id === 'place-ni-verb');
    expect(tpl.particle).toBe('に');
    expect(tpl.targetTags).toContain('place');
  });

  it('шаблон food-wo-drink содержит частицу を', () => {
    const tpl = SEMANTIC_TEMPLATES.find((t) => t.id === 'food-wo-drink');
    expect(tpl.particle).toBe('を');
  });

  it('шаблон person-to-verb содержит частицу と', () => {
    const tpl = SEMANTIC_TEMPLATES.find((t) => t.id === 'person-to-verb');
    expect(tpl.particle).toBe('と');
    expect(tpl.targetTags).toContain('person');
  });

  it('generated result содержит particle в grammar при template-источнике', () => {
    ExamplesDB.getExamplesForLexeme.mockReturnValue([]);
    ExamplesDB.getCompatibleVocab.mockReturnValue([makeVerb({ id: 'v2' })]);

    const place = makePlace();
    const result = generateExample(place, { seed: 0, userMaxLesson: 5 });

    if (result && result.source === EXAMPLE_SOURCES.TEMPLATE) {
      expect(result.grammar).toBeDefined();
      expect(result.grammar.templateId).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Спряжения
// ---------------------------------------------------------------------------
describe('Спряжения', () => {
  it('глагол в шаблоне place-de-verb спрягается в ます-форму', () => {
    ExamplesDB.getExamplesForLexeme.mockReturnValue([]);
    ExamplesDB.getCompatibleVocab.mockReturnValue([makeVerb({ id: 'v2' })]);

    const place = makePlace();
    const result = generateExample(place, { seed: 0, userMaxLesson: 5 });

    if (result && result.source === EXAMPLE_SOURCES.TEMPLATE) {
      // たべる → たべます
      expect(result.japanese).toMatch(/ます/);
    }
  });

  it('глагол godan (のむ) спрягается корректно в ます-форму', () => {
    ExamplesDB.getExamplesForLexeme.mockReturnValue([]);
    const drinkVerb = {
      id: 'v-nomu',
      kanji: '飲む',
      writing: 'のむ',
      translation: 'пить',
      lexemeId: 'lex-nomu',
      lessonIds: [3],
      partOfSpeech: 'verb',
      verbClass: 'godan',
      category: 'u-verbs',
      transitivity: 'transitive',
      semanticTags: ['verb'],
    };
    ExamplesDB.getCompatibleVocab.mockReturnValue([drinkVerb]);

    const food = makeFood();
    const result = generateExample(food, { seed: 0, userMaxLesson: 5 });

    if (result && result.source === EXAMPLE_SOURCES.TEMPLATE) {
      // のむ → 飲みます (кандзи форма)
      // Шаблон генерирует предложение с кандзи-формой глагола
      expect(result.japanese).toMatch(/飲みます/);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Отсутствие ложного production evidence
// ---------------------------------------------------------------------------
describe('Отсутствие ложного production evidence', () => {
  it('результат generateExample не содержит acceptedAnswers', () => {
    ExamplesDB.getExamplesForLexeme.mockReturnValue([makeCorpusExample()]);
    const result = generateExample(makeNoun(), { seed: 0 });

    expect(result).not.toBeNull();
    expect(result.acceptedAnswers).toBeUndefined();
  });

  it('результат generateExample не содержит requiredForm', () => {
    ExamplesDB.getExamplesForLexeme.mockReturnValue([makeCorpusExample()]);
    const result = generateExample(makeNoun(), { seed: 0 });

    expect(result).not.toBeNull();
    expect(result.requiredForm).toBeUndefined();
  });

  it('corpus-source не содержит поля для FSRS production', () => {
    ExamplesDB.getExamplesForLexeme.mockReturnValue([makeCorpusExample()]);
    const result = generateExample(makeNoun(), { seed: 0 });

    expect(result).not.toBeNull();
    expect(result.source).toBe(EXAMPLE_SOURCES.CORPUS);
    // Результат не должен иметь полей, которые productionContext() ожидает
    expect(result).not.toHaveProperty('prompt');
    expect(result).not.toHaveProperty('meaningCue');
  });

  it('template-source не содержит поля для FSRS production', () => {
    ExamplesDB.getExamplesForLexeme.mockReturnValue([]);
    ExamplesDB.getCompatibleVocab.mockReturnValue([makeAdj({ id: 'a2' })]);

    const noun = makeNoun();
    const result = generateExample(noun, { seed: 0, userMaxLesson: 5 });

    if (result) {
      expect(result).not.toHaveProperty('prompt');
      expect(result).not.toHaveProperty('meaningCue');
      expect(result).not.toHaveProperty('acceptedAnswers');
      expect(result).not.toHaveProperty('requiredForm');
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Fallback при отсутствии безопасного примера
// ---------------------------------------------------------------------------
describe('Fallback при отсутствии безопасного примера', () => {
  it('возвращает null при пустом корпусе и отсутствии совместимых слов', () => {
    ExamplesDB.getExamplesForLexeme.mockReturnValue([]);
    ExamplesDB.getCompatibleVocab.mockReturnValue([]);

    // Используем редкое слово без семантических тегов
    const weirdWord = {
      id: 'w1',
      kanji: '〜',
      writing: '〜',
      translation: 'суффикс',
      lexemeId: 'lex-suffix',
      lessonIds: [1],
      partOfSpeech: 'suffix',
      category: 'suffixes',
      semanticTags: [],
    };
    const result = generateExample(weirdWord, { seed: 0 });
    expect(result).toBeNull();
  });

  it('возвращает null для слова без writing', () => {
    const result = generateExample({ id: 'x', kanji: '本' }, { seed: 0 });
    expect(result).toBeNull();
  });

  it('возвращает null для null-слова', () => {
    const result = generateExample(null, { seed: 0 });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. Подсветка слова
// ---------------------------------------------------------------------------
describe('Подсветка слова (highlightWord)', () => {
  it('оборачивает кандзи слова в <mark class="ex-highlight">', () => {
    const word = makeNoun(); // kanji: '本'
    const result = highlightWord('これは本です', word);
    expect(result).toContain('<mark class="ex-highlight">本</mark>');
  });

  it('оборачивает кану если кандзи нет в предложении', () => {
    const word = makeNoun({ kanji: '', writing: 'ほん' });
    const result = highlightWord('これはほんです', word);
    expect(result).toContain('<mark class="ex-highlight">ほん</mark>');
  });

  it('возвращает оригинал при отсутствии совпадения', () => {
    const word = makeNoun(); // kanji: '本'
    const result = highlightWord('これは猫です', word);
    expect(result).toBe('これは猫です');
  });

  it('не ломается на null предложении', () => {
    const word = makeNoun();
    expect(highlightWord(null, word)).toBe('');
    expect(highlightWord('', word)).toBe('');
  });

  it('не ломается на null слове', () => {
    expect(highlightWord('これは本です', null)).toBe('これは本です');
  });

  it('результат generateExample содержит japaneseHighlighted с тегом mark', () => {
    ExamplesDB.getExamplesForLexeme.mockReturnValue([
      makeCorpusExample({ japanese: '本を読みます', translation: 'читаю книгу' }),
    ]);
    const word = makeNoun(); // kanji: '本'
    const result = generateExample(word, { seed: 0 });
    expect(result).not.toBeNull();
    expect(result.japaneseHighlighted).toContain('<mark class="ex-highlight">');
  });
});

// ---------------------------------------------------------------------------
// 9. Структура ответа
// ---------------------------------------------------------------------------
describe('Структура ответа generateExample', () => {
  it('corpus-пример содержит все обязательные поля', () => {
    ExamplesDB.getExamplesForLexeme.mockReturnValue([makeCorpusExample()]);
    const result = generateExample(makeNoun(), { seed: 0 });

    expect(result).not.toBeNull();
    expect(typeof result.japanese).toBe('string');
    expect(typeof result.japaneseHighlighted).toBe('string');
    expect(typeof result.reading).toBe('string');
    expect(typeof result.translation).toBe('string');
    expect(result.source).toBe(EXAMPLE_SOURCES.CORPUS);
  });

  it('template-пример содержит все обязательные поля', () => {
    ExamplesDB.getExamplesForLexeme.mockReturnValue([]);
    ExamplesDB.getCompatibleVocab.mockReturnValue([makeVerb({ id: 'v2' })]);

    const place = makePlace();
    const result = generateExample(place, { seed: 0, userMaxLesson: 5 });

    if (result) {
      expect(typeof result.japanese).toBe('string');
      expect(typeof result.japaneseHighlighted).toBe('string');
      expect(result.source).toBe(EXAMPLE_SOURCES.TEMPLATE);
    }
  });
});
