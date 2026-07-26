import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  migrateFromLocalStorage,
  isMigrationComplete,
  resetMigrationFlag,
} from '../src/migration.js';
import { db, initializeDB, STORES } from '../src/db.js';

describe('LocalStorage to IndexedDB Migration', () => {
  beforeEach(async () => {
    localStorage.clear();
    const database = await initializeDB();
    await database.clear(STORES.APP_STATE);
    await database.clear(STORES.CONTENT_CACHE);
    await database.clear(STORES.UI_PREFERENCES);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('migrates data with standard keys (kitsune_lessons_v1, kitsune_lessons_version_v1)', async () => {
    const sampleState = { level: 3, xp: 150 };
    const sampleLessons = { lesson1: { id: 1, title: 'Lesson 1' } };
    const sampleVersion = '1.2.3';
    const sampleDay = '2026-07-26';
    const sampleTheme = 'dark';

    localStorage.setItem('kitsune_state_v1', JSON.stringify(sampleState));
    localStorage.setItem('kitsune_lessons_v1', JSON.stringify(sampleLessons));
    localStorage.setItem('kitsune_lessons_version_v1', sampleVersion);
    localStorage.setItem('kitsune_last_activity_day', sampleDay);
    localStorage.setItem('kitsune_theme', sampleTheme);

    await migrateFromLocalStorage();

    expect(await db.get(STORES.APP_STATE, 'state')).toEqual(sampleState);
    expect(await db.get(STORES.CONTENT_CACHE, 'lessons')).toEqual(sampleLessons);
    expect(await db.get(STORES.CONTENT_CACHE, 'lesson_version')).toBe(sampleVersion);
    expect(await db.get(STORES.CONTENT_CACHE, 'last_activity_day')).toBe(sampleDay);
    expect(await db.get(STORES.UI_PREFERENCES, 'theme')).toBe(sampleTheme);
    expect(await isMigrationComplete()).toBe(true);
  });

  it('migrates legacy fallback keys (kitsune_lessons, kitsune_lesson_version)', async () => {
    const sampleLessons = { legacy1: { id: 10, title: 'Legacy Lesson' } };
    const sampleVersion = '1.0.0';

    localStorage.setItem('kitsune_lessons', JSON.stringify(sampleLessons));
    localStorage.setItem('kitsune_lesson_version', sampleVersion);

    await migrateFromLocalStorage();

    expect(await db.get(STORES.CONTENT_CACHE, 'lessons')).toEqual(sampleLessons);
    expect(await db.get(STORES.CONTENT_CACHE, 'lesson_version')).toBe(sampleVersion);
    expect(await isMigrationComplete()).toBe(true);
  });

  it('does NOT set idb_migrated flag when parsing error occurs', async () => {
    localStorage.setItem('kitsune_state_v1', '{ corrupt_json: ');
    localStorage.setItem('kitsune_lessons_v1', JSON.stringify({ ok: true }));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await migrateFromLocalStorage();

    expect(consoleSpy).toHaveBeenCalled();
    // Verify that lessons were migrated despite state error
    expect(await db.get(STORES.CONTENT_CACHE, 'lessons')).toEqual({ ok: true });
    // BUT migration flag must NOT be set, so automatic retry is possible
    expect(await isMigrationComplete()).toBe(false);
  });

  it('does NOT set idb_migrated flag when parsing error occurs in lessons', async () => {
    localStorage.setItem('kitsune_state_v1', JSON.stringify({ level: 1 }));
    localStorage.setItem('kitsune_lessons_v1', 'NOT_JSON');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await migrateFromLocalStorage();

    expect(consoleSpy).toHaveBeenCalled();
    expect(await isMigrationComplete()).toBe(false);
  });

  it('resets migration flag with resetMigrationFlag', async () => {
    localStorage.setItem('kitsune_theme', 'light');
    await migrateFromLocalStorage();
    expect(await isMigrationComplete()).toBe(true);

    await resetMigrationFlag();
    expect(await isMigrationComplete()).toBe(false);
  });
});
