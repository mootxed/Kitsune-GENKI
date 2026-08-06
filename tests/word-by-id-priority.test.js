import { describe, it, expect, beforeEach } from 'vitest';
import { wordById } from '../src/srs-helpers.js';
import { dictionaryStore } from '../src/dictionary/dictionary-store.js';

describe('wordById priority and resolution tests', () => {
  beforeEach(async () => {
    await dictionaryStore.ensureLoaded();
  });

  it('returns word from LESSONS when present, overriding raw dictionary entry', () => {
    const courseWord = {
      id: 'genki-1:1:taberu',
      dictionaryId: 'dict:verb:taberu',
      writing: '食べる',
      reading: 'たべる',
      meaning: 'кушать (специфичное значение курса)',
      translation: 'есть',
      lessonId: '1',
      courseId: 'genki-1',
      contextProduction: ['ご飯を___。'],
      acceptedAnswers: ['たべる', '食べる'],
    };

    const mockLessons = [
      {
        id: '1',
        words: [courseWord],
      },
    ];

    const result = wordById('genki-1:1:taberu', mockLessons);
    expect(result).toBeDefined();
    expect(result.meaning).toBe('кушать (специфичное значение курса)');
    expect(result.courseId).toBe('genki-1');
    expect(result.lessonId).toBe('1');
    expect(result.acceptedAnswers).toEqual(['たべる', '食べる']);
  });

  it('resolves by dictionaryId matching itemId in LESSONS', () => {
    const courseWord = {
      id: 'genki-1:vocab:100',
      dictionaryId: 'dict:word:test-item',
      meaning: 'Course meaning',
      translation: 'Перевод',
      lessonId: 2,
    };

    const lessons = [{ id: 2, vocabulary: [courseWord] }];

    const result = wordById('dict:word:test-item', lessons);
    expect(result).toEqual(courseWord);
    expect(result.meaning).toBe('Course meaning');
  });

  it('uses resolveVocabularyRuntimeItem as fallback when not in LESSONS', () => {
    const entries = dictionaryStore.getAllDictionaryEntries();
    expect(entries.length).toBeGreaterThan(0);
    const targetEntry = entries[0];

    const entry = wordById(targetEntry.id, []);
    expect(entry).toBeDefined();
    expect(entry.id || entry.dictionaryForm).toBe(targetEntry.id);
  });

  it('preserves contextual fields when word comes from LESSONS', () => {
    const wordWithContext = {
      id: 'custom:word:1',
      writing: '猫',
      reading: 'ねこ',
      meaning: 'Кот',
      translation: 'Кошка',
      kanji: '猫',
      category: 'animals',
      topic: 'pets',
      lessonId: 'ch-3',
      contextProduction: ['___が鳴く'],
      particlePatterns: ['が'],
    };

    const lessons = [{ id: 'ch-3', words: [wordWithContext] }];
    const found = wordById('custom:word:1', lessons);

    expect(found.category).toBe('animals');
    expect(found.topic).toBe('pets');
    expect(found.contextProduction).toEqual(['___が鳴く']);
    expect(found.particlePatterns).toEqual(['が']);
  });

  it('resolves legacy card IDs correctly', () => {
    const courseWord = {
      id: 'genki-1:1:iku',
      dictionaryId: 'dict:verb:iku',
      meaning: 'ходить',
    };
    const lessons = [{ id: 1, words: [courseWord] }];

    // Card identity with known skill suffix
    const found = wordById('genki-1:1:iku::recall', lessons);
    expect(found).toEqual(courseWord);
  });

  it('returns null if item is not found anywhere', () => {
    const result = wordById('nonexistent:item:id:999999', []);
    expect(result).toBeNull();
  });
});
