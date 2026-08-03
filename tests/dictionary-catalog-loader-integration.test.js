import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderDictionary } from '../ui/flashcards/dictionary.js';
import {
  ensureDictionaryCatalog,
  clearDictionaryCatalogCache,
} from '../src/dictionary/dictionary-catalog-loader.js';
import { dictionaryStore } from '../src/dictionary/dictionary-store.js';

describe('Dictionary catalog loader integration and cache tests', () => {
  beforeEach(async () => {
    clearDictionaryCatalogCache();
    await dictionaryStore.ensureLoaded();
    document.body.innerHTML = '<div id="srs-body"></div>';
  });

  it('renders dictionary shell with skeleton and calls ensureDictionaryCatalog without mass ensureLesson', async () => {
    const mockEnsureLesson = vi.fn().mockResolvedValue({});
    const mockLessons = [
      { id: 1, title: 'Lesson 1', words: [{ id: 'word:1', writing: '一', meaning: 'one' }] },
    ];
    const contentIndex = [{ id: 1 }, { id: 2 }, { id: 3 }];

    const state = { chapters: { 1: { started: true } } };
    const dependencies = {
      LESSONS: mockLessons,
      CONTENT_INDEX: contentIndex,
      ensureLesson: mockEnsureLesson,
      toast: vi.fn(),
    };

    const renderPromise = renderDictionary(state, dependencies, {}, {});

    // Skeleton should be rendered in container
    const container = document.getElementById('dict-lessons-container');
    expect(container).not.toBeNull();

    await renderPromise;

    // ensureLesson should NOT have been called for all chapters
    expect(mockEnsureLesson).not.toHaveBeenCalled();
    // Words should be displayed
    expect(container.innerHTML).toContain('Lesson 1');
  });

  it('respects AbortSignal and cancels post-unmount DOM update', async () => {
    const controller = new AbortController();
    controller.abort();

    const state = { chapters: { 1: { started: true } } };
    const dependencies = {
      LESSONS: [{ id: 1, title: 'Lesson 1', words: [] }],
      CONTENT_INDEX: [{ id: 1 }],
      ensureLesson: vi.fn(),
      toast: vi.fn(),
    };

    await renderDictionary(state, dependencies, {}, { signal: controller.signal });

    // Should abort cleanly without error
    expect(document.getElementById('dict-lessons-container')).not.toBeNull();
  });

  it('invalidates catalog cache when lesson content changes with same array length', async () => {
    const loadedLessonsV1 = [
      { id: 1, words: [{ id: 'w1', writing: '犬' }] },
      { id: 2, words: [{ id: 'w2', writing: '猫' }] },
    ];

    const loadedLessonsV2 = [
      { id: 1, words: [{ id: 'w1', writing: '犬' }] },
      { id: 2, words: [{ id: 'w3', writing: '鳥' }] }, // changed word, same length
    ];

    const result1 = await ensureDictionaryCatalog({
      courseId: 'courseA',
      loadedLessons: loadedLessonsV1,
      contentIndex: [{ id: 1 }, { id: 2 }],
    });

    expect(result1.catalog.some((w) => w.id === 'w2')).toBe(true);

    const result2 = await ensureDictionaryCatalog({
      courseId: 'courseA',
      loadedLessons: loadedLessonsV2,
      contentIndex: [{ id: 1 }, { id: 2 }],
    });

    expect(result2.catalog.some((w) => w.id === 'w3')).toBe(true);
    expect(result2.catalog.some((w) => w.id === 'w2')).toBe(false);
  });
});
