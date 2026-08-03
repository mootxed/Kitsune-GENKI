/* tests/dictionary-catalog-loader.test.js */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ensureDictionaryCatalog,
  clearDictionaryCatalogCache,
} from '../src/dictionary/dictionary-catalog-loader.js';

describe('Dictionary Catalog Loader Performance', () => {
  beforeEach(() => {
    clearDictionaryCatalogCache();
  });

  it('1. Extracts words from loaded lessons and caches result', async () => {
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
    expect(res1.cached).toBe(false);

    const res2 = await ensureDictionaryCatalog({
      courseId: 'genki-1',
      contentIndex: [{ id: 1 }, { id: 2 }],
      loadedLessons: lessons,
    });

    expect(res2.catalog.length).toBe(2);
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
});
