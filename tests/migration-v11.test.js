import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, runMigrations } from '../state/store.js';

describe('State Migration v11', () => {
  it('migrates plan integration fields and preserves legacy vocabulary completion', () => {
    const migrated = runMigrations({
      version: 10,
      chapters: {
        1: { started: true, checklist: { vocab: true, grammar: true } },
      },
    });

    expect(migrated.version).toBe(CURRENT_VERSION);
    expect(migrated.chapters[1].legacyVocabularyCompleted).toBe(true);
    expect(migrated).toMatchObject({
      grammarUnlocks: {},
      practiceUnlocks: {},
      dailyPlan: null,
      dailyPlanHistory: [],
      dailyCapacityMinutes: 30,
      workbookSettings: { includeReadingWriting: true },
    });
  });

  it('is idempotent for current state', () => {
    const current = {
      version: CURRENT_VERSION,
      chapters: {},
      dailyCapacityMinutes: 20,
    };
    expect(runMigrations(current)).toBe(current);
  });
});
