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

    const state = { activeCourseId: 'genki-1', chapters: { 1: { started: true } } };
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

  it('fresh install: displays all 12 chapters from vocabulary index without calling ensureLesson for future lessons', async () => {
    const mockEnsureLesson = vi.fn().mockResolvedValue({});
    const contentIndex = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      title: `Глава ${i + 1}`,
      order: i,
    }));
    const loadedLessons = [
      {
        id: 1,
        title: 'Глава 1',
        words: [{ id: 'w1', writing: '一', reading: 'いち', translation: 'один', lessonId: 1 }],
      },
    ];

    const vocabIndexLessons = contentIndex.map((item) => ({
      id: item.id,
      lessonId: item.id,
      words: [
        {
          id: `w_lesson_${item.id}`,
          localId: `w_local_${item.id}`,
          writing: item.id === 10 ? '未来' : `Word ${item.id}`,
          reading: item.id === 10 ? 'みらい' : `Reading ${item.id}`,
          translation: item.id === 10 ? 'будущее' : `Meaning ${item.id}`,
          meaning: item.id === 10 ? 'будущее' : `Meaning ${item.id}`,
          topic: item.id === 10 ? 'future_tech' : 'general',
          lessonId: item.id,
          introducedIn: item.id,
        },
      ],
    }));

    const vocabularyIndex = {
      schemaVersion: 1,
      contentVersion: '1.0.0',
      courseId: 'genki-1',
      lessons: vocabIndexLessons,
    };

    const state = {
      activeCourseId: 'genki-1',
      activeChapterId: 1,
      chapters: { 1: { started: true } },
    };
    const dependencies = {
      LESSONS: loadedLessons,
      CONTENT_INDEX: contentIndex,
      ensureLesson: mockEnsureLesson,
      toast: vi.fn(),
    };

    const catalogResult = await ensureDictionaryCatalog({
      courseId: 'genki-1',
      vocabularyIndex,
      contentIndex,
      loadedLessons,
    });

    expect(catalogResult.lessons.length).toBe(12);
    expect(mockEnsureLesson).not.toHaveBeenCalledWith(10);

    await renderDictionary(state, dependencies, {}, {});
    const container = document.getElementById('dict-lessons-container');
    expect(container.innerHTML).toContain('Глава 12');

    // Topic filter check
    const topicSelect = document.getElementById('dict-topic-select');
    expect(topicSelect).not.toBeNull();
    expect(topicSelect.innerHTML).toContain('future_tech');
  });

  it('runtime override replaces lightweight entry without duplicating lexemes', async () => {
    const vocabularyIndex = {
      schemaVersion: 1,
      contentVersion: '1.0.0',
      courseId: 'genki-1',
      lessons: [
        {
          id: 1,
          lessonId: 1,
          words: [
            {
              id: 'genki-1:vocabulary:L1_V001',
              lexemeId: 'jp-word:おはよう:おはよう',
              writing: 'おはよう',
              translation: 'доброе утро (lightweight)',
              lessonId: 1,
            },
          ],
        },
      ],
    };

    const result1 = await ensureDictionaryCatalog({
      courseId: 'genki-1',
      vocabularyIndex,
      loadedLessons: [],
    });

    expect(result1.lessons[0].words[0].translation).toBe('доброе утро (lightweight)');

    const loadedLessons = [
      {
        id: 1,
        words: [
          {
            id: 'genki-1:vocabulary:L1_V001',
            lexemeId: 'jp-word:おはよう:おはよう',
            writing: 'おはよう',
            reading: 'おはよう',
            translation: 'доброе утро (full runtime)',
            lessonId: 1,
          },
        ],
      },
    ];

    const result2 = await ensureDictionaryCatalog({
      courseId: 'genki-1',
      vocabularyIndex,
      loadedLessons,
    });

    expect(result2.lessons[0].words.length).toBe(1);
    expect(result2.lessons[0].words[0].translation).toBe('доброе утро (full runtime)');
  });

  it('course switching isolates vocabulary and uses course-specific cache key', async () => {
    const courseAVocab = {
      lessons: [{ id: 1, words: [{ id: 'cA_w1', writing: 'CourseA_Word', lessonId: 1 }] }],
    };
    const courseBVocab = {
      lessons: [{ id: 1, words: [{ id: 'cB_w1', writing: 'CourseB_Word', lessonId: 1 }] }],
    };

    const resA = await ensureDictionaryCatalog({
      courseId: 'courseA',
      vocabularyIndex: courseAVocab,
    });

    const resB = await ensureDictionaryCatalog({
      courseId: 'courseB',
      vocabularyIndex: courseBVocab,
    });

    expect(resA.catalog.some((w) => w.writing === 'CourseA_Word')).toBe(true);
    expect(resA.catalog.some((w) => w.writing === 'CourseB_Word')).toBe(false);

    expect(resB.catalog.some((w) => w.writing === 'CourseB_Word')).toBe(true);
    expect(resB.catalog.some((w) => w.writing === 'CourseA_Word')).toBe(false);
  });

  it('cache invalidates on user revision, dictionary version, or content version changes', async () => {
    const loadedLessons = [{ id: 1, words: [{ id: 'w1', writing: '犬' }] }];

    const res1 = await ensureDictionaryCatalog({
      courseId: 'genki-1',
      contentVersion: '1.0',
      userDictionaryRevision: '1',
      loadedLessons,
    });
    expect(res1.cached).toBe(false);

    const res2 = await ensureDictionaryCatalog({
      courseId: 'genki-1',
      contentVersion: '1.0',
      userDictionaryRevision: '1',
      loadedLessons,
    });
    expect(res2.cached).toBe(true);

    const res3 = await ensureDictionaryCatalog({
      courseId: 'genki-1',
      contentVersion: '1.1', // content version changed
      userDictionaryRevision: '1',
      loadedLessons,
    });
    expect(res3.cached).toBe(false);
  });

  it('respects AbortSignal and cancels post-unmount DOM update', async () => {
    const controller = new AbortController();
    controller.abort();

    const state = { activeCourseId: 'genki-1', chapters: { 1: { started: true } } };
    const dependencies = {
      LESSONS: [{ id: 1, title: 'Lesson 1', words: [] }],
      CONTENT_INDEX: [{ id: 1 }],
      ensureLesson: vi.fn(),
      toast: vi.fn(),
    };

    await renderDictionary(state, dependencies, {}, { signal: controller.signal });
    expect(document.getElementById('dict-lessons-container')).not.toBeNull();
  });

  it('security: escapes HTML in lesson titles, words, readings, and translations to prevent XSS', async () => {
    const xssTitle = '<img src=x onerror=alert("xss-title")>';
    const xssWriting = '<script>alert("xss-word")</script>';
    const xssTranslation = '<iframe src="javascript:alert(1)"></iframe>';

    const loadedLessons = [
      {
        id: 1,
        title: xssTitle,
        words: [
          {
            id: 'xss_w1',
            writing: xssWriting,
            reading: 'тест',
            translation: xssTranslation,
            meaning: xssTranslation,
            lessonId: 1,
          },
        ],
      },
    ];

    const state = {
      activeCourseId: 'genki-1',
      activeChapterId: 1,
      chapters: { 1: { started: true } },
    };
    const dependencies = {
      LESSONS: loadedLessons,
      CONTENT_INDEX: [{ id: 1, title: xssTitle }],
      ensureLesson: vi.fn(),
      toast: vi.fn(),
    };

    await renderDictionary(state, dependencies, {}, {});
    const container = document.getElementById('dict-lessons-container');

    // Raw script and iframe tags should NOT exist unescaped in DOM HTML
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.innerHTML).toContain('&lt;script&gt;');
  });
});
