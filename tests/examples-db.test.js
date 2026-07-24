/**
 * tests/examples-db.test.js
 * Тесты для слоя данных примеров употребления слов (ExamplesDB)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ExamplesDBClass, isWordInSentence } from '../src/examples-db.js';

// ---------------------------------------------------------------------------
// Вспомогательные фабрики
// ---------------------------------------------------------------------------

function makeNoun({
  id = 'n1',
  kanji = '',
  writing = 'ほん',
  translation = 'книга',
  lexemeId = 'lex-hon',
  lessonIds = [1],
} = {}) {
  return { id, kanji, writing, translation, lexemeId, lessonIds, partOfSpeech: 'noun' };
}

function makeVerb({
  id = 'v1',
  kanji = '食べる',
  writing = 'たべる',
  translation = 'есть',
  verbClass = 'ichidan',
  lexemeId = 'lex-taberu',
  lessonIds = [3],
} = {}) {
  return { id, kanji, writing, translation, lexemeId, lessonIds, partOfSpeech: 'verb', verbClass };
}

function makeAdj({
  id = 'a1',
  kanji = '美味しい',
  writing = 'おいしい',
  translation = 'вкусный',
  lexemeId = 'lex-oishii',
  lessonIds = [4],
} = {}) {
  return { id, kanji, writing, translation, lexemeId, lessonIds, partOfSpeech: 'adjective' };
}

// ---------------------------------------------------------------------------
// Тесты isWordInSentence
// ---------------------------------------------------------------------------

describe('isWordInSentence', () => {
  it('возвращает true при прямом совпадении каны', () => {
    const word = makeNoun({ writing: 'ほん', kanji: '' });
    expect(isWordInSentence(word, 'これはほんです。')).toBe(true);
  });

  it('возвращает true при прямом совпадении кандзи', () => {
    const word = makeNoun({ writing: 'ほん', kanji: '本' });
    expect(isWordInSentence(word, 'これは本です。')).toBe(true);
  });

  it('возвращает false при отсутствии слова в предложении', () => {
    const word = makeNoun({ writing: 'ほん', kanji: '本' });
    expect(isWordInSentence(word, 'これはえんぴつです。')).toBe(false);
  });

  it('возвращает true для спряжённого глагола (て-форма)', () => {
    const word = makeVerb();
    expect(isWordInSentence(word, '食べてください。')).toBe(true);
  });

  it('возвращает true для спряжённого глагола (ます-форма)', () => {
    const word = makeVerb();
    expect(isWordInSentence(word, '毎日食べます。')).toBe(true);
  });

  it('возвращает true для i-прилагательного через основу', () => {
    const word = makeAdj();
    expect(isWordInSentence(word, 'このケーキはおいしかったです。')).toBe(true);
  });

  it('возвращает false для null/undefined', () => {
    expect(isWordInSentence(null, 'これは本です。')).toBe(false);
    expect(isWordInSentence(makeNoun(), null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Тесты ExamplesDBClass
// ---------------------------------------------------------------------------

describe('ExamplesDBClass', () => {
  let db;

  beforeEach(() => {
    db = new ExamplesDBClass();
  });

  it('registerVocabulary сохраняет слова по id', () => {
    const word = makeNoun();
    db.registerVocabulary([word]);
    expect(db.vocabulary.has(word.id)).toBe(true);
  });

  it('addRawSentence игнорирует пустые японские строки', () => {
    db.addRawSentence({ japanese: '', translation: 'test', sourceLessonId: 1, source: 'test' });
    expect(db.rawSentences).toHaveLength(0);
  });

  it('addRawSentence сохраняет корректные предложения', () => {
    db.addRawSentence({
      japanese: 'これは本です。',
      translation: 'Это книга.',
      sourceLessonId: 1,
      source: 'test',
    });
    expect(db.rawSentences).toHaveLength(1);
    expect(db.rawSentences[0].japanese).toBe('これは本です。');
  });

  it('registerLesson регистрирует лексику урока', () => {
    const lesson = { lesson_id: 1, vocabulary: [makeNoun()], notes: [], cultural_notes: [] };
    db.registerLesson(lesson);
    expect(db.vocabulary.size).toBeGreaterThan(0);
  });

  it('registerLesson парсит contextProduction', () => {
    const word = {
      ...makeVerb(),
      contextProduction: {
        prompt: 'わたしは[_]ます',
        meaningCue: 'Я ем',
        requiredForm: 'masu',
        acceptedAnswers: ['たべ'],
      },
    };
    const lesson = { lesson_id: 3, vocabulary: [word], notes: [], cultural_notes: [] };
    db.registerLesson(lesson);
    expect(db.rawSentences.some((s) => s.source === 'contextProduction')).toBe(true);
  });

  it('registerStory добавляет предложения из истории', () => {
    const story = {
      id: 3,
      content: [
        {
          tokens: [
            { writing: 'わたし', kanji: '私' },
            { writing: 'は' },
            { writing: 'たべる', kanji: '食べる' },
          ],
          translation: 'Я ем',
        },
      ],
    };
    db.registerStory(story);
    expect(db.rawSentences).toHaveLength(1);
    expect(db.rawSentences[0].source).toBe('story');
    expect(db.rawSentences[0].japanese).toContain('食べる');
  });

  it('registerParticlesDictionary парсит примеры частиц', () => {
    const dict = {
      particles: {
        wa: {
          introduced_in_lesson: 1,
          usage_examples: ['わたしは田中です (Watashi wa Tanaka desu) — Я Танака'],
        },
      },
    };
    db.registerParticlesDictionary(dict);
    expect(db.rawSentences).toHaveLength(1);
    expect(db.rawSentences[0].japanese).toBe('わたしは田中です');
    expect(db.rawSentences[0].translation).toBe('Я Танака');
  });

  it('registerCuratedParticleSentences подставляет частицу в шаблон', () => {
    const curated = { は: [{ sentence: 'わたし[_]田中です', correct: 'は', hint: 'Я Танака' }] };
    db.registerCuratedParticleSentences(curated);
    expect(db.rawSentences).toHaveLength(1);
    expect(db.rawSentences[0].japanese).toBe('わたしは田中です');
  });

  it('rebuildIndex строит индекс для слова в предложении', () => {
    const word = makeNoun({ writing: 'ほん', kanji: '本', lexemeId: 'lex-hon' });
    db.registerVocabulary([word]);
    db.addRawSentence({
      japanese: 'これは本です。',
      translation: 'Это книга.',
      sourceLessonId: 1,
      source: 'test',
    });
    db.rebuildIndex();
    expect(db.lexemeIndex.has('lex-hon')).toBe(true);
    expect(db.lexemeIndex.get('lex-hon')).toHaveLength(1);
  });

  it('rebuildIndex дедуплицирует одинаковые предложения для одной лексемы', () => {
    const word = makeNoun({ writing: 'ほん', kanji: '本', lexemeId: 'lex-hon' });
    db.registerVocabulary([word]);
    db.addRawSentence({
      japanese: 'これは本です。',
      translation: 'Это книга.',
      sourceLessonId: 1,
      source: 'a',
    });
    db.addRawSentence({
      japanese: 'これは本です。',
      translation: 'Это книга.',
      sourceLessonId: 1,
      source: 'b',
    });
    db.rebuildIndex();
    expect(db.lexemeIndex.get('lex-hon')).toHaveLength(1);
  });

  it('rebuildIndex устанавливает lessonRequired как max(sourceLessonId, maxVocabLesson)', () => {
    const word = makeNoun({ writing: 'ほん', kanji: '本', lexemeId: 'lex-hon', lessonIds: [5] });
    db.registerVocabulary([word]);
    db.addRawSentence({
      japanese: 'これは本です。',
      translation: 'Это книга.',
      sourceLessonId: 1,
      source: 'test',
    });
    db.rebuildIndex();
    const example = db.lexemeIndex.get('lex-hon')[0];
    expect(example.lessonRequired).toBe(5);
  });

  it('getExamplesForLexeme применяет ограничение по уроку', () => {
    const word = makeNoun({ writing: 'ほん', kanji: '本', lexemeId: 'lex-hon', lessonIds: [1] });
    db.registerVocabulary([word]);
    db.addRawSentence({
      japanese: 'これは本です。',
      translation: 'Это книга.',
      sourceLessonId: 1,
      source: 'test',
    });
    db.rebuildIndex();
    expect(db.getExamplesForLexeme('lex-hon', 12)).toHaveLength(1);
    expect(db.getExamplesForLexeme('lex-hon', 0)).toHaveLength(0);
  });

  it('getExamplesForLexeme возвращает [] для несуществующей лексемы', () => {
    db.rebuildIndex();
    expect(db.getExamplesForLexeme('nonexistent', 12)).toEqual([]);
  });

  it('getExamplesForLexeme блокирует предложения с лексикой будущих уроков', () => {
    const wordA = makeNoun({
      id: 'a',
      writing: 'ほん',
      kanji: '本',
      lexemeId: 'lex-hon',
      lessonIds: [1],
    });
    const wordB = makeNoun({
      id: 'b',
      writing: 'えんぴつ',
      kanji: '',
      lexemeId: 'lex-enpitsu',
      lessonIds: [8],
    });
    db.registerVocabulary([wordA, wordB]);
    db.addRawSentence({
      japanese: '本とえんぴつがあります。',
      translation: 'Есть книга и карандаш.',
      sourceLessonId: 1,
      source: 'test',
    });
    db.rebuildIndex();
    // At lesson 6 the sentence should be blocked (wordB is from lesson 8)
    expect(db.getExamplesForLexeme('lex-hon', 6)).toHaveLength(0);
    // At lesson 8 the sentence becomes available
    expect(db.getExamplesForLexeme('lex-hon', 8)).toHaveLength(1);
  });

  it('rebuildIndex связывает спряжённый глагол с базовой лексемой', () => {
    const word = makeVerb({ lexemeId: 'lex-taberu' });
    db.registerVocabulary([word]);
    db.addRawSentence({
      japanese: '食べてください。',
      translation: 'Пожалуйста, ешьте.',
      sourceLessonId: 3,
      source: 'test',
    });
    db.rebuildIndex();
    expect(db.lexemeIndex.has('lex-taberu')).toBe(true);
    expect(db.lexemeIndex.get('lex-taberu')).toHaveLength(1);
  });
});
