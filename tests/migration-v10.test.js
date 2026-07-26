import { describe, it, expect } from 'vitest';
import { runMigrations, CURRENT_VERSION } from '../state/store.js';

describe('State Migration v10', () => {
  it('migrates state from v9 to v10 adding vocabularyUnlocks and normalizing lock state', () => {
    const v9State = {
      version: 9,
      srs: {
        L1_word_1: { id: 'L1_word_1', reps: 3, planLocked: true },
      },
    };

    const migrated = runMigrations(v9State);
    expect(migrated.version).toBe(CURRENT_VERSION);
    expect(migrated.vocabularyUnlocks).toEqual({});
    expect(migrated.srs['L1_word_1'].planLocked).toBe(false);
  });
});
