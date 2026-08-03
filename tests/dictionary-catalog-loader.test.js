/* tests/dictionary-catalog-loader.test.js */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ensureDictionaryCatalog,
  clearDictionaryCatalogCache,
} from '../src/dictionary/dictionary-catalog-loader.js';
import { dictionaryStore } from '../src/dictionary/dictionary-store.js';

describe('Dictionary Catalog Loader Performance & Correctness', () => {
  beforeEach(() => {
    clearDictionaryCatalogCache();
  });

  it('1. Extracts words from loaded lessons, formats lessons, and caches result', async () => {
    const lessons = [
      { id: 1, words: [{ id: 'w1', kanji: '猫', meaning: 'cat' }] },
      { id: 2, words: [{ id: 'w2', kanji: '犬', meaning: 'dog' }] },
    ];

    const res1 = await ensureDictionaryCatalog({
      courseId: 'genki-1',
      contentIndex: [{ id: 1 }, { id: 2 }],
      loadedLessons: lessons,
    });

    expect(res1.catalog.length).toBe(2);
    expect(res1.lessons.length).toBe(2);
    expect(res1.lessons[0].words[0].id).toBe('w1');
    expect(res1.cached).toBe(false);

    const res2 = await ensureDictionaryCatalog({
      courseId: 'genki-1',
      contentIndex: [{ id: 1 }, { id: 2 }],
      loadedLessons: lessons,
    });

    expect(res2.catalog.length).toBe(2);
    expect(res2.lessons.length).toBe(2);
    expect(res2.cached).toBe(true);
  });

  it('2. Supports AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      ensureDictionaryCatalog({
        signal: controller.signal,
        courseId: 'genki-1',
        contentIndex: [],
        loadedLessons: [],
      })
    ).rejects.toThrow();
  });

  it('3. Invalidates cache when word content (translation, reading, topic) changes for same word ID', async () => {
    const lessonsV1 = [
      { id: 1, words: [{ id: 'w1', writing: '猫', reading: 'ねこ', translation: 'cat' }] },
    ];

    const lessonsV2 = [
      { id: 1, words: [{ id: 'w1', writing: '猫', reading: 'ねこ', translation: 'кошка' }] },
    ];

    const res1 = await ensureDictionaryCatalog({
      courseId: 'genki-1',
      loadedLessons: lessonsV1,
      contentIndex: [{ id: 1 }],
    });

    expect(res1.catalog[0].translation).toBe('cat');

    const res2 = await ensureDictionaryCatalog({
      courseId: 'genki-1',
      loadedLessons: lessonsV2,
      contentIndex: [{ id: 1 }],
    });

    expect(res2.cached).toBe(false);
    expect(res2.catalog[0].translation).toBe('кошка');
  });

  it('4. Maps dictionaryStore entries into lesson structure and invalidates cache when user entry is added', async () => {
    const res1 = await ensureDictionaryCatalog({
      courseId: 'genki-1',
      loadedLessons: [{ id: 1, words: [{ id: 'w1', writing: '一', lessonId: 1 }] }],
      contentIndex: [{ id: 1 }, { id: 2 }],
    });

    expect(res1.lessons.length).toBe(2);

    // Register user entry into dictionaryStore
    await dictionaryStore.registerUserDictionaryEntry({
      dictionaryForm: '本',
      reading: 'ほん',
      meanings: ['book'],
      lessonId: 2,
    });

    const res2 = await ensureDictionaryCatalog({
      courseId: 'genki-1',
      loadedLessons: [{ id: 1, words: [{ id: 'w1', writing: '一', lessonId: 1 }] }],
      contentIndex: [{ id: 1 }, { id: 2 }],
    });

    expect(res2.cached).toBe(false);
    expect(res2.catalog.some((w) => w.reading === 'ほん')).toBe(true);
  });
});
