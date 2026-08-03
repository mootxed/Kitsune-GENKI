/* tests/dictionary-catalog-loader.test.js */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ensureDictionaryCatalog,
  clearDictionaryCatalogCache,
} from '../src/dictionary/dictionary-catalog-loader.js';
import { dictionaryStore } from '../src/dictionary/dictionary-store.js';
import { normalizeDictionaryEntry } from '../src/dictionary/dictionary-contract.js';

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

  it('4. Maps course vocabulary references into lesson structure and invalidates cache when user revision changes', async () => {
    const entry = normalizeDictionaryEntry({
      id: 'jp-word:本:ほん',
      dictionaryForm: '本',
      reading: 'ほん',
      meanings: ['book'],
      tokenForms: ['本', 'ほん'],
      semanticTags: [],
    });
    dictionaryStore.builtinEntries.set('jp-word:本:ほん', entry);

    const res1 = await ensureDictionaryCatalog({
      courseId: 'genki-1',
      loadedLessons: [{ id: 1, words: [{ id: 'w1', writing: '一', lessonId: 1 }] }],
      contentIndex: [{ id: 1 }, { id: 2 }],
    });

    expect(res1.lessons.length).toBe(2);

    dictionaryStore.resolveCourseVocabularyReference({
      id: 'genki-1:vocabulary:hon',
      localId: 'hon',
      courseId: 'genki-1',
      dictionaryId: 'jp-word:本:ほん',
      introducedIn: '2',
      lessonId: '2',
    });

    const res2 = await ensureDictionaryCatalog({
      courseId: 'genki-1',
      userDictionaryRevision: String(dictionaryStore.userRevision + 1),
      loadedLessons: [{ id: 1, words: [{ id: 'w1', writing: '一', lessonId: 1 }] }],
      contentIndex: [{ id: 1 }, { id: 2 }],
    });

    expect(res2.cached).toBe(false);
    expect(res2.catalog.some((w) => w.reading === 'ほん')).toBe(true);
  });
});
