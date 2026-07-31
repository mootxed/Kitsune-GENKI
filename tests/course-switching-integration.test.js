import fs from 'node:fs';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearActiveCourse,
  ensureActiveCourse,
  getActiveCourse,
} from '../src/courses/course-context.js';
import {
  clearCourseRegistryCache,
  DEFAULT_COURSE_ID,
  registerCourseDescriptor,
} from '../src/courses/course-registry.js';
import { loadChapterData, loadContentIndex } from '../src/content-loader.js';
import { loadGrammarQuizIndex } from '../src/grammar-quiz-content.js';
import { getSupplementalPracticeForChapter } from '../src/supplemental-practice.js';
import { switchCourseRuntime } from '../ui/home.js';
import { loadState, state } from '../state/store.js';
import { db, initializeDB, STORES } from '../src/db.js';

const root = process.cwd();

function fileFetch(rootDirectory) {
  return async (input) => {
    const url = new URL(String(input));
    let relativePath = url.pathname.replace(/^\/+/u, '');
    try {
      let fullPath = path.join(rootDirectory, 'public', relativePath);
      if (!fs.existsSync(fullPath)) {
        fullPath = path.join(rootDirectory, relativePath);
      }
      const raw = await readFile(fullPath, 'utf8');
      return { ok: true, status: 200, json: async () => JSON.parse(raw) };
    } catch {
      return { ok: false, status: 404, json: async () => null };
    }
  };
}

describe('Course Switching Integration & Facades', () => {
  let unregisterTestCourse = null;
  const customFetch = fileFetch(root);

  beforeEach(async () => {
    await initializeDB();
    await db.clear(STORES.CONTENT_CACHE);
    await db.clear(STORES.APP_STATE);

    await loadState();
    clearActiveCourse();
    clearCourseRegistryCache();

    unregisterTestCourse = registerCourseDescriptor({
      id: 'test-course',
      manifestUrl: 'tests/fixtures/courses/test-course/manifest.json',
      baseUrl: 'http://localhost/',
      fetchImpl: customFetch,
    });
  });

  afterEach(() => {
    if (typeof unregisterTestCourse === 'function') {
      unregisterTestCourse();
    }
    clearActiveCourse();
    clearCourseRegistryCache();
  });

  it('switches between GENKI I and test-course without reload:true and updates all public facades', async () => {
    // 1. Initial active course: genki-1
    await ensureActiveCourse(DEFAULT_COURSE_ID, { fetchImpl: customFetch });
    expect(getActiveCourse().id).toBe('genki-1');

    const genkiIndex = await loadContentIndex();
    expect(genkiIndex.courseId).toBe('genki-1');

    const genkiLesson = await loadChapterData('genki-1:lesson-1');
    expect(genkiLesson.lesson.id).toBe('genki-1:lesson-1');

    const genkiQuizIndex = await loadGrammarQuizIndex();
    expect(genkiQuizIndex.chapters[0].chapterId).toBe(1);

    const genkiPractice = await getSupplementalPracticeForChapter('genki-1:lesson-1');
    expect(genkiPractice.length).toBeGreaterThan(0);
    expect(genkiPractice[0].id).toContain('genki-1');

    // 2. Switch runtime to test-course via switchCourseRuntime
    await switchCourseRuntime('test-course');
    expect(getActiveCourse().id).toBe('test-course');
    expect(state.activeCourseId).toBe('test-course');

    // Verify all public facades now return test-course data
    const testIndex = await loadContentIndex();
    expect(testIndex.courseId).toBe('test-course');
    expect(testIndex.lessons[0].id).toBe('test-course:lesson-alpha');

    const testLesson = await loadChapterData('test-course:lesson-alpha');
    expect(testLesson.lesson.id).toBe('test-course:lesson-alpha');
    expect(testLesson.lesson.courseId).toBe('test-course');

    const testQuizIndex = await loadGrammarQuizIndex();
    const testChapters = testQuizIndex.chapters || testQuizIndex.lessons;
    expect(testChapters[0].lessonId).toBe('test-course:lesson-alpha');

    const testPractice = await getSupplementalPracticeForChapter('test-course:lesson-alpha');
    expect(testPractice.length).toBeGreaterThan(0);
    expect(testPractice[0].id).toContain('test-course');

    // 3. Switch runtime back to GENKI I without reload:true
    await switchCourseRuntime(DEFAULT_COURSE_ID);
    expect(getActiveCourse().id).toBe('genki-1');
    expect(state.activeCourseId).toBe('genki-1');

    const reGenkiIndex = await loadContentIndex();
    expect(reGenkiIndex.courseId).toBe('genki-1');

    const reGenkiLesson = await loadChapterData('genki-1:lesson-1');
    expect(reGenkiLesson.lesson.id).toBe('genki-1:lesson-1');
  });

  it('prevents race conditions during simultaneous course switching', async () => {
    const p1 = ensureActiveCourse(DEFAULT_COURSE_ID, { fetchImpl: customFetch });
    const p2 = ensureActiveCourse('test-course', { fetchImpl: customFetch });

    const [c1, c2] = await Promise.all([p1, p2]);
    expect(c1.id).toBe('genki-1');
    expect(c2.id).toBe('test-course');

    // The active course must match the last requested course ID ('test-course')
    expect(getActiveCourse().id).toBe('test-course');
  });

  it('prevents race conditions during simultaneous switchCourseRuntime calls', async () => {
    const slowGenkiFetch = async (input) => {
      const urlStr = String(input);
      if (urlStr.includes('genki-1')) {
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      return customFetch(input);
    };

    const pSlow = switchCourseRuntime(DEFAULT_COURSE_ID, { fetchImpl: slowGenkiFetch });
    const pFast = switchCourseRuntime('test-course', { fetchImpl: customFetch });

    const [resSlow, resFast] = await Promise.all([pSlow, pFast]);

    expect(resSlow).toBeNull();
    expect(resFast?.id).toBe('test-course');
    expect(getActiveCourse().id).toBe('test-course');
    expect(state.activeCourseId).toBe('test-course');

    const activeIndex = await loadContentIndex();
    expect(activeIndex.courseId).toBe('test-course');

    const activeLesson = await loadChapterData('test-course:lesson-alpha');
    expect(activeLesson.lesson.id).toBe('test-course:lesson-alpha');

    const { LESSONS, CONTENT_INDEX } = await import('../ui/home.js');
    expect(LESSONS.some((l) => l.courseId === DEFAULT_COURSE_ID)).toBe(false);
    expect(CONTENT_INDEX.some((c) => String(c.id).startsWith('genki-1'))).toBe(false);
  });

  it('early exits on re-switching to currently active course without reload: true', async () => {
    await switchCourseRuntime('test-course', { fetchImpl: customFetch });
    expect(getActiveCourse().id).toBe('test-course');

    const prevCourse = getActiveCourse();
    const result = await switchCourseRuntime('test-course', { fetchImpl: customFetch });
    expect(result).toBe(prevCourse);
  });

  it('prevents obsolete loadLessons() from polluting global runtime when a fast switch occurs during lesson pre-cache', async () => {
    let reachedGenkiLoadLessonsInner = false;
    let signalReachedGenkiInner;
    const reachedGenkiInnerPromise = new Promise((resolve) => {
      signalReachedGenkiInner = resolve;
    });

    let releaseGenkiInner;
    const genkiInnerBarrier = new Promise((resolve) => {
      releaseGenkiInner = resolve;
    });

    const controlledGenkiFetch = async (input) => {
      const urlStr = String(input);
      if (urlStr.includes('lesson-01.json') || urlStr.includes('lessons/1.json')) {
        reachedGenkiLoadLessonsInner = true;
        signalReachedGenkiInner();
        await genkiInnerBarrier;
      }
      return customFetch(input);
    };

    const pGenki = switchCourseRuntime(DEFAULT_COURSE_ID, { fetchImpl: controlledGenkiFetch });

    await reachedGenkiInnerPromise;
    expect(reachedGenkiLoadLessonsInner).toBe(true);

    const pTestCourse = switchCourseRuntime('test-course', { fetchImpl: customFetch });

    const testCourseRes = await pTestCourse;
    expect(testCourseRes?.id).toBe('test-course');
    expect(getActiveCourse().id).toBe('test-course');
    expect(state.activeCourseId).toBe('test-course');

    releaseGenkiInner();
    const genkiRes = await pGenki;

    expect(genkiRes).toBeNull();
    expect(getActiveCourse().id).toBe('test-course');
    expect(state.activeCourseId).toBe('test-course');

    const { LESSONS, CONTENT_INDEX, CH_NAMES } = await import('../ui/home.js');
    const { loadedChapters } = await import('../state/store.js');
    const { ExamplesDB } = await import('../src/examples-db.js');

    expect(LESSONS.every((l) => l.courseId === 'test-course')).toBe(true);
    expect(LESSONS.some((l) => l.courseId === DEFAULT_COURSE_ID)).toBe(false);
    expect(CONTENT_INDEX.every((c) => String(c.id).startsWith('test-course:'))).toBe(true);
    expect(Object.keys(CH_NAMES).every((id) => id.startsWith('test-course:'))).toBe(true);
    expect([...loadedChapters.keys()].some((id) => id.startsWith('genki-1:'))).toBe(false);

    const vocabularyList = [...ExamplesDB.vocabulary.values()].filter(
      (word) => word.courseId === DEFAULT_COURSE_ID || String(word.id).startsWith('genki-1:')
    );
    expect(vocabularyList).toHaveLength(0);

    expect(state.courses['test-course']?.lessonIds?.[0]).toMatch(/^test-course:/);
    expect(state.activeChapterId).toMatch(/^test-course:/);
  });
});
