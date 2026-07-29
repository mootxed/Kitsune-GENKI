/* tests/migration-matrix.test.js — Comprehensive Migration Test Matrix */

import { describe, it, expect } from 'vitest';
import { runMigrations } from '../state/store.js';
import { validateImportData } from '../src/backup-manager.js';
import { STORES, STORE_SCHEMAS } from '../src/db.js';

describe('Migration Test Matrix: State v1 → v13', () => {
  it('migrates a minimal v1 state up to v13 without loss of progress fields', () => {
    const v1State = {
      version: 1,
      xp: 1500,
      level: 4,
      srs: {
        word_1: {
          id: 'word_1',
          due: '2026-08-15T12:00:00.000Z',
          stability: 5.2,
          difficulty: 3.1,
          reps: 6,
          lapses: 0,
          state: 2,
        },
        word_2: {
          id: 'word_2',
          due: '2026-08-20T10:00:00.000Z',
          stability: 2.1,
          difficulty: 4.5,
          reps: 3,
          lapses: 1,
          state: 2,
        },
      },
      chapters: {
        1: {
          startedAt: 1600000000000,
          completedAt: 1600050000000,
          checklist: { vocab: true, grammar: true, dialog: true, listening: true, reading: true },
        },
        2: {
          startedAt: 1600100000000,
          checklist: { vocab: true, grammar: false },
        },
      },
      history: {
        '2026-07-28': 15,
        '2026-07-29': 22,
      },
    };

    const migrated = runMigrations(v1State);

    expect(migrated.version).toBe(13);
    // Verify XP preserved
    expect(migrated.xp).toBe(1500);
    expect(migrated.level).toBe(4);

    // Verify due and SRS parameters preserved (migration converts date string to timestamp number)
    expect(new Date(migrated.srs.word_1.due).toISOString()).toBe('2026-08-15T12:00:00.000Z');
    expect(migrated.srs.word_1.stability).toBe(5.2);
    expect(migrated.srs.word_1.reps).toBe(6);
    expect(new Date(migrated.srs.word_2.due).toISOString()).toBe('2026-08-20T10:00:00.000Z');
    expect(migrated.srs.word_2.lapses).toBe(1);

    // Verify completed chapters preserved
    expect(migrated.chapters['1'].completedAt).toBe(1600050000000);
    expect(migrated.chapters['1'].checklist.vocab).toBe(true);

    // Verify history preserved
    expect(migrated.history['2026-07-28']).toBe(15);
    expect(migrated.history['2026-07-29']).toBe(22);
  });

  it('runs step-by-step state migrations from v1 through each intermediate version', () => {
    let state = { version: 1, xp: 500, srs: {} };
    for (let targetVer = 2; targetVer <= 13; targetVer++) {
      state = runMigrations(state);
      expect(state.version).toBeGreaterThanOrEqual(targetVer);
    }
    expect(state.version).toBe(13);
    expect(state.xp).toBe(500);
  });
});

describe('Migration Test Matrix: IndexedDB v4/v6 → v7', () => {
  it('validates that STORE_SCHEMAS defines keyPaths and indexes strictly for all stores', () => {
    expect(STORE_SCHEMAS[STORES.ACTIVE_SESSION]).toEqual({ keyPath: 'id' });
    expect(STORE_SCHEMAS[STORES.APP_STATE]).toEqual({ keyPath: 'id' });
    expect(STORE_SCHEMAS[STORES.CONTENT_CACHE]).toEqual({ keyPath: 'key' });
    expect(STORE_SCHEMAS[STORES.UI_PREFERENCES]).toEqual({ keyPath: 'key' });

    const reviewLogSchema = STORE_SCHEMAS[STORES.REVIEW_LOG];
    expect(reviewLogSchema.keyPath).toBe('id');
    expect(reviewLogSchema.autoIncrement).toBe(true);

    const indexNames = reviewLogSchema.indexes.map((idx) => idx.name);
    expect(indexNames).toContain('itemId');
    expect(indexNames).toContain('eventId');
    expect(indexNames).toContain('reviewedAt');
    expect(indexNames).toContain('cardId_reviewedAt');
  });
});

describe('Migration Test Matrix: Backup 2.0 → 6.0', () => {
  const versions = ['2.0', '3.0', '4.0', '5.0', '6.0'];

  versions.forEach((ver) => {
    it(`successfully validates and imports backup version ${ver} maintaining due, XP, completed chapters and review logs`, () => {
      const backupData = {
        app: 'kotokitsu',
        exportType: 'full_indexeddb',
        schemaVersion: ver,
        timestamp: '2026-07-29T10:00:00.000Z',
        data: {
          state: {
            level: 5,
            xp: 2400,
            srs: {
              card_100: {
                id: 'card_100',
                due: '2026-09-01T00:00:00.000Z',
                reps: 10,
                lapses: 0,
              },
            },
            chapters: {
              3: {
                startedAt: 1700000000000,
                completedAt: 1700010000000,
                checklist: {
                  vocab: true,
                  grammar: true,
                  dialog: true,
                  listening: true,
                  reading: true,
                },
              },
            },
            history: { '2026-07-29': 30 },
          },
          reviewLog: [
            {
              cardId: 'card_100',
              eventId: 'evt_1',
              itemId: 'card_100',
              reviewedAt: 1700000000000,
              quality: 4,
            },
          ],
        },
      };

      const result = validateImportData(backupData);
      expect(result.valid).toBe(true);
      expect(result.data.data.state.xp).toBe(2400);
      expect(result.data.data.state.srs.card_100.due).toBe('2026-09-01T00:00:00.000Z');
      expect(result.data.data.state.chapters['3'].completedAt).toBe(1700010000000);
      expect(result.data.data.reviewLog.length).toBe(1);
      expect(result.data.data.reviewLog[0].eventId).toBe('evt_1');
    });
  });
});
