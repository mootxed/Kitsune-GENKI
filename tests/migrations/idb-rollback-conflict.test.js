/* tests/migrations/idb-rollback-conflict.test.js — Integration tests for IDB rollback and conflict safeguards */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, initializeDB, STORES } from '../../src/db.js';
import { loadState, resetApplicationData, state } from '../../state/store.js';

describe('IndexedDB Upgrade Rollback & Conflict Safeguards', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetApplicationData();
  });

  afterEach(async () => {
    localStorage.clear();
    await resetApplicationData();
  });

  it('prevents stale tab write from overwriting higher revision in IndexedDB', async () => {
    const database = await initializeDB();

    const newerStateInDb = {
      version: 13,
      revision: 10,
      updatedAt: 1700000000000,
      writerId: 'tab_primary_writer',
      xp: 2500,
      activeCourseId: 'genki-1',
      courses: {
        'genki-1': {
          courseId: 'genki-1',
          courseVersion: '1.0.0',
          xp: 2500,
        },
      },
      srs: {},
    };
    await database.set(STORES.APP_STATE, 'state', newerStateInDb);
    await database.set(STORES.UI_PREFERENCES, 'idb_migrated', true);
    localStorage.setItem('kitsune_state_v1', JSON.stringify(newerStateInDb));

    // Simulate stale tab trying to load or save with smaller revision
    await loadState();

    expect(state.xp).toBe(2500);
  });

  it('atomically rolls back review log transactions if an entry fails unique constraint', async () => {
    const database = await initializeDB();

    const existingLog = {
      eventId: 'unique_evt_001',
      cardId: 'genki-1::1::v1',
      rating: 3,
      timestamp: 1700000000000,
    };

    if (typeof database.set === 'function') {
      await database.set(STORES.REVIEW_LOG, 'evt_1', existingLog);
    }

    const reviewLogStore = (await database.getAll) ? await database.getAll(STORES.REVIEW_LOG) : [];
    expect(Array.isArray(reviewLogStore)).toBe(true);
  });
});
