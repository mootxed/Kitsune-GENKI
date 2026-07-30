import fs from 'node:fs';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, initializeDB, STORES } from '../src/db.js';
import { clearActiveCourse, ensureActiveCourse } from '../src/courses/course-context.js';
import {
  clearCourseRegistryCache,
  DEFAULT_COURSE_ID,
  registerCourseDescriptor,
} from '../src/courses/course-registry.js';
import { loadLessons, switchCourseRuntime } from '../ui/home.js';
import { loadState } from '../state/store.js';

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

describe('IndexedDB Course Cache Namespacing & Migration', () => {
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

  it('stores content cache under course-namespaced keys in IndexedDB', async () => {
    await ensureActiveCourse(DEFAULT_COURSE_ID, { fetchImpl: customFetch });
    await loadLessons();

    const genkiCachedLessons = await db.get(STORES.CONTENT_CACHE, 'course:genki-1:lessons');
    expect(genkiCachedLessons).toBeDefined();
    expect(Array.isArray(genkiCachedLessons)).toBe(true);
    expect(genkiCachedLessons[0].id).toContain('genki-1');

    await switchCourseRuntime('test-course');

    const testCachedLessons = await db.get(STORES.CONTENT_CACHE, 'course:test-course:lessons');
    expect(testCachedLessons).toBeDefined();
    expect(Array.isArray(testCachedLessons)).toBe(true);
    expect(testCachedLessons[0].id).toContain('test-course');
  });

  it('migrates legacy unnamespaced genki-1 cache to namespaced keys once', async () => {
    const legacyLessons = [
      {
        id: 'genki-1:lesson-1',
        title: 'Legacy Genki Lesson',
        vocabulary: [],
        notes: [],
        grammar: [],
        practice: [],
        exercises: [],
      },
    ];
    await db.set(STORES.CONTENT_CACHE, 'lessons', legacyLessons);
    await db.set(STORES.CONTENT_CACHE, 'lesson_version', '4');

    await switchCourseRuntime(DEFAULT_COURSE_ID, { fetchImpl: customFetch });

    const namespacedLessons = await db.get(STORES.CONTENT_CACHE, 'course:genki-1:lessons');
    expect(namespacedLessons).toBeDefined();
    expect(namespacedLessons[0].id).toBe('genki-1:lesson-1');
  });
});
