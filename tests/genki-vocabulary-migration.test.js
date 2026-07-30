import { describe, expect, it } from 'vitest';
import {
  canonicalGenkiVocabularyId,
  migrateGenkiVocabularyState,
} from '../src/genki-vocabulary-migration.js';
import { CURRENT_VERSION, runMigrations } from '../state/store.js';

describe('GENKI I vocabulary migration', () => {
  it('merges a late duplicate into the canonical card without resetting evidence', () => {
    expect(canonicalGenkiVocabularyId('L11_V013')).toBe('L3_V013');
    const oldState = {
      srs: {
        L11_V013: {
          id: 'L11_V013',
          itemId: 'L11_V013',
          reps: 8,
          stability: 9,
          lastReview: 200,
        },
        L3_V013: {
          id: 'L3_V013',
          itemId: 'L3_V013',
          reps: 2,
          stability: 2,
          lastReview: 100,
        },
      },
      reviewEvents: [{ cardId: 'L11_V013', itemId: 'L11_V013', reviewedAt: 200 }],
      masteryArchive: {
        L11_V013: {
          evidenceCount: 3,
          successfulSkills: { recall: true },
          successfulDays: { recall: ['2026-07-02'] },
          successfulCount: { recall: 2 },
          recentOutcomes: { recall: [{ correct: true, reviewedAt: 200 }] },
        },
        L3_V013: {
          evidenceCount: 2,
          successfulSkills: { recognition: true },
          successfulDays: { recall: ['2026-07-01'] },
          successfulCount: { recall: 1 },
          recentOutcomes: { recall: [{ correct: false, reviewedAt: 100 }] },
        },
      },
      vocabularyUnlocks: {
        11: { '2026-07-01': { itemIds: ['L11_V013'] } },
      },
    };
    const migrated = migrateGenkiVocabularyState(oldState);
    expect(Object.keys(migrated.srs)).toEqual(['L3_V013']);
    expect(migrated.srs.L3_V013.reps).toBe(8);
    expect(migrated.srs.L3_V013.stability).toBe(9);
    expect(migrated.reviewEvents[0]).toMatchObject({
      cardId: 'L3_V013',
      itemId: 'L3_V013',
    });
    expect(Object.keys(migrated.vocabularyMigrationArchive.mergedCards.L3_V013)).toEqual([
      'L11_V013',
      'L3_V013',
    ]);
    expect(migrated.masteryArchive.L3_V013).toMatchObject({
      evidenceCount: 5,
      successfulSkills: { recall: true, recognition: true },
      successfulDays: { recall: ['2026-07-01', '2026-07-02'] },
      successfulCount: { recall: 3 },
      recentOutcomes: {
        recall: [
          { correct: false, reviewedAt: 100 },
          { correct: true, reviewedAt: 200 },
        ],
      },
    });
  });

  it('archives removed cards and is idempotent', () => {
    const oldState = {
      srs: {
        L1_V029: { id: 'L1_V029', itemId: 'L1_V029', reps: 4, stability: 3 },
      },
      reviewEvents: [],
      masteryArchive: { L1_V029: { successfulDays: { recognition: ['2026-07-01'] } } },
    };
    const once = migrateGenkiVocabularyState(oldState);
    expect(once.srs.L1_V029).toBeUndefined();
    expect(once.vocabularyMigrationArchive.retiredCards.L1_V029.reps).toBe(4);
    expect(once.vocabularyMigrationArchive.retiredMastery.L1_V029).toBeDefined();
    expect(migrateGenkiVocabularyState(once)).toEqual(once);
  });

  it('runs as state migration v14 and remains a no-op when repeated', () => {
    const migrated = runMigrations({ version: 13, srs: {}, reviewEvents: [] });
    expect(CURRENT_VERSION).toBe(14);
    expect(migrated.version).toBe(14);
    expect(runMigrations(migrated)).toEqual(migrated);
  });
});
