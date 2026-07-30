import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Override global fetch to read real files
const originalFetch = global.fetch; // eslint-disable-line no-unused-vars
global.fetch = vi.fn(async (url) => {
  try {
    const filePath = path.resolve(__dirname, '..', 'public', url);
    const content = fs.readFileSync(filePath, 'utf-8');
    return {
      ok: true,
      json: async () => JSON.parse(content),
    };
  } catch (e) {
    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
    };
  }
});

import { db, STORES, initializeDB } from '../src/db.js';
import { loadLessons, getLesson, ensureLesson, LESSONS } from '../ui/home.js';
import { ExamplesDB } from '../src/examples-db.js';
import { generateExample } from '../src/example-generator.js';
import { renderDictionary } from '../ui/flashcards.js';
import { state, loadState, loadedChapters } from '../state/store.js';
import { normalizeWord } from '../src/normalize-word.js';
import { clearContentCache } from '../src/content-loader.js';

describe('Dictionary Integration', () => {
  beforeEach(async () => {
    document.body.innerHTML = '<div id="srs-body"></div>';
    await initializeDB();
    await db.clear(STORES.CONTENT_CACHE);
    await db.clear(STORES.APP_STATE);
    await db.clear(STORES.REVIEW_LOG);

    ExamplesDB.clear();
    clearContentCache();
    loadedChapters.clear();
    LESSONS.length = 0;

    await loadState();

    // Reset store state
    state.srs = {};
    state.reviewEvents = [];
    state.masteryArchive = {};
    state.chapters = {
      1: { started: true },
      2: { started: true },
      3: { started: true },
      4: { started: true },
      5: { started: true },
      6: { started: true },
      7: { started: true },
      8: { started: true },
      9: { started: true },
      10: { started: true },
      11: { started: true },
      12: { started: true },
    };
    state.activeChapterId = 3;

    // Clear LESSONS array (we can't re-assign imported bindings directly if they are read-only, but LESSONS is let in home.js and loadLessons mutates it).
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('migrates old cache with 飲む to new schema', async () => {
    // Inject an old cached lesson with '飲む' that doesn't have verbClass, topic, partOfSpeech, particlePatterns
    const oldLesson3 = {
      id: 3,
      title: 'Семья',
      words: [
        {
          id: 'L3_V035',
          kanji: '飲む',
          writing: 'のむ',
          translation: 'пить (～を)',
          category: 'u-verbs',
          lessonIds: [3],
          // Missing new fields
        },
      ],
    };
    await db.set(STORES.CONTENT_CACHE, 'lessons', [oldLesson3]);
    await db.set(STORES.CONTENT_CACHE, 'lesson_version', '1');
    await db.set(STORES.CONTENT_CACHE, 'schema_version', 0);

    // Call loadLessons, which should migrate cache
    await loadLessons();

    // Verify migration updated LESSONS
    const nomu = getLesson(3)?.words.find((w) => w.id === 'L3_V035');
    expect(nomu).toBeDefined();
    expect(nomu.partOfSpeech).toBe('verb');
    expect(nomu.verbClass).toBe('godan');
    expect(nomu.particlePatterns).toEqual(['を']);
    expect(nomu.topic).toBe(null); // Because category is 'u-verbs'

    // Check schema version updated to current version (4)
    const schemaVersion = await db.get(STORES.CONTENT_CACHE, 'schema_version');
    expect(schemaVersion).toBe(4);
  });

  it('keeps FSRS state after migration', async () => {
    const oldLesson3 = { id: 3, words: [{ id: 'L3_V035', kanji: '飲む', translation: 'пить' }] };
    await db.set(STORES.CONTENT_CACHE, 'lessons', [oldLesson3]);
    await db.set(STORES.CONTENT_CACHE, 'lesson_version', '1');
    await db.set(STORES.CONTENT_CACHE, 'schema_version', 0);

    state.srs['card_1'] = { id: 'card_1', reps: 5 };
    state.reviewEvents = [{ eventId: 'event_1' }];
    state.masteryArchive = { L3_V035: { score: 100 } };

    await loadLessons();

    expect(state.srs['card_1']).toBeDefined();
    expect(state.reviewEvents.length).toBe(1);
    expect(state.masteryArchive['L3_V035']).toBeDefined();
  });

  it('repeated migration does nothing when schema version matches', async () => {
    // Set schema_version to 4 (current) with already normalized lesson
    const normalizedLesson3 = {
      id: 3,
      words: [
        {
          id: 'L3_V035',
          kanji: '飲む',
          writing: 'のむ',
          translation: 'пить',
          partOfSpeech: 'verb',
          verbClass: 'godan',
          lessonIds: [3],
          _testFlag: 'already-normalized',
        },
      ],
    };
    await db.set(STORES.CONTENT_CACHE, 'lessons', [normalizedLesson3]);
    // Mock loadContentIndex to return version 1
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: 1, chapters: [] }),
    });
    await db.set(STORES.CONTENT_CACHE, 'lesson_version', '1');
    await db.set(STORES.CONTENT_CACHE, 'schema_version', 4);
    await db.set(STORES.CONTENT_CACHE, 'workbook_schema_version', 1);

    await loadLessons();

    // Since version is 1 and schema is 4, it should NOT migrate, so it should keep the normalized object
    const word = getLesson(3)?.words.find((w) => w.id === 'L3_V035');
    expect(word._testFlag).toBe('already-normalized');
  });

  it('loads all 12 lessons and registers 676 unique words', async () => {
    // We clear cache to force fetching
    await db.clear(STORES.CONTENT_CACHE);
    await loadLessons();

    for (let i = 1; i <= 12; i++) {
      await ensureLesson(i);
    }

    expect(ExamplesDB.vocabulary.size).toBe(676);
  });

  it('registers stories without cache blocking', async () => {
    await db.clear(STORES.CONTENT_CACHE);
    await loadLessons();

    // The stories should be registered
    const ch = await ensureLesson(3);
    expect(ch.story).toBeDefined();

    // The ExamplesDB index should have more than 0 examples
    expect(ExamplesDB.examples.length).toBeGreaterThan(0);
  });

  it('repeated registration does not duplicate examples', async () => {
    await db.clear(STORES.CONTENT_CACHE);
    await loadLessons();
    await ensureLesson(3);
    const initialExamplesCount = ExamplesDB.examples.length;
    const initialRawCount = ExamplesDB.rawSentences.length;

    // Register again
    await ensureLesson(3);

    expect(ExamplesDB.examples.length).toBe(initialExamplesCount);
    expect(ExamplesDB.rawSentences.length).toBe(initialRawCount);
  });

  it('generateExample returns working result for 飲む', async () => {
    await db.clear(STORES.CONTENT_CACHE);
    await loadLessons();
    await ensureLesson(3); // To get nomu

    const nomu = getLesson(3)?.words.find((w) => w.id === 'L3_V035');
    expect(nomu).toBeDefined();

    const ex = generateExample(nomu, { userMaxLesson: 12 });
    expect(ex).not.toBeNull();
    expect(ex.japanese).toBeDefined();
  });

  it('future examples are not revealed', async () => {
    await db.clear(STORES.CONTENT_CACHE);
    await loadLessons();
    await ensureLesson(3);
    await ensureLesson(12);

    const nomu = getLesson(3)?.words.find((w) => w.id === 'L3_V035');

    // Check with max lesson 3
    const ex1 = generateExample(nomu, { userMaxLesson: 3 });
    if (ex1) {
      // Either it's a corpus example with lessonRequired <= 3,
      // or it's a template example built from words <= 3.
      if (ex1.lessonRequired !== undefined) {
        expect(ex1.lessonRequired).toBeLessThanOrEqual(3);
      }
    }
  });
});
