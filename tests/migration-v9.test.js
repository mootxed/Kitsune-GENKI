import { describe, it, expect } from 'vitest';
import { runMigrations, CURRENT_VERSION } from '../state/store.js';

describe('State Migration v9', () => {
  it('migrates state from v8 to v9 adding notifyDays and notificationState', () => {
    const v8State = {
      version: 8,
      settings: {
        openrouterKey: 'sk-or-v1-1234567890123456789012345678901234567890',
        model: 'deepseek/deepseek-v4-flash',
        notifyEnabled: true,
        notifyTime: '09:00',
      },
      srs: {},
    };

    const migrated = runMigrations(v8State);
    expect(migrated.version).toBe(CURRENT_VERSION);
    expect(migrated.version).toBe(9);
    expect(migrated.settings.notifyEnabled).toBe(true);
    expect(migrated.settings.notifyTime).toBe('09:00');
    expect(migrated.settings.notifyDays).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(migrated.settings.notificationState).toEqual({
      lastDailyDigestDate: null,
      lastDailyDigestSlot: null,
    });
  });

  it('is idempotent when run on v9 state', () => {
    const v9State = {
      version: 9,
      settings: {
        openrouterKey: 'sk-or-v1-1234567890123456789012345678901234567890',
        notifyEnabled: true,
        notifyTime: '10:00',
        notifyDays: [1, 2, 3, 4, 5],
        notificationState: { lastDailyDigestDate: '2026-07-25', lastDailyDigestSlot: '10:00' },
      },
    };

    const migrated = runMigrations(v9State);
    expect(migrated.version).toBe(9);
    expect(migrated.settings.notifyDays).toEqual([1, 2, 3, 4, 5]);
    expect(migrated.settings.notificationState.lastDailyDigestDate).toBe('2026-07-25');
  });
});
