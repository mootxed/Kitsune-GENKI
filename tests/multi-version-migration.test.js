import { describe, it, expect } from 'vitest';
import { runMigrations, CURRENT_VERSION, defaultState } from '../state/store.js';

describe('Multi-Version Sequential State Migration Safety', () => {
  it('migrates from v1 raw state to v13 maintaining progress', () => {
    const v1State = {
      xp: 120,
      level: 2,
      history: { '2025-01-01': 10 },
      srs: {
        item_1: { id: 'item_1', reps: 3, interval: 5, ease: 2.5 },
      },
    };

    const migrated = runMigrations(v1State);
    expect(migrated.version).toBe(CURRENT_VERSION);
    expect(migrated.xp).toBe(120);
    expect(migrated.level).toBe(2);
    expect(migrated.history['2025-01-01']).toBe(10);
    expect(migrated.srs.item_1).toBeDefined();
  });

  it('migrates from v5 state to v13 with pending review logs', () => {
    const v5State = {
      version: 5,
      xp: 500,
      srs: {
        card_a: { id: 'card_a', reps: 1, stability: 2, difficulty: 5 },
      },
      reviewEvents: [{ cardId: 'card_a', eventType: 'review', reviewedAt: 1700000000000 }],
      pendingReviewLogs: [],
    };

    const migrated = runMigrations(v5State);
    expect(migrated.version).toBe(CURRENT_VERSION);
    expect(migrated.xp).toBe(500);
    expect(Array.isArray(migrated.pendingReviewLogs)).toBe(true);
  });

  it('migrates from v9 state preserving notification settings', () => {
    const v9State = {
      version: 9,
      settings: {
        openrouterKey: 'test-key',
        notifyEnabled: true,
        notifyDays: [1, 2, 3, 4, 5],
      },
    };

    const migrated = runMigrations(v9State);
    expect(migrated.version).toBe(CURRENT_VERSION);
    expect(migrated.settings.openrouterKey).toBe('test-key');
    expect(migrated.settings.notifyEnabled).toBe(true);
  });

  it('migrates from v12 state to v13 state preserving active chapter', () => {
    const v12State = {
      version: 12,
      activeChapterId: 4,
      chapters: {
        4: { started: true, checklist: { vocab: true } },
      },
    };

    const migrated = runMigrations(v12State);
    expect(migrated.version).toBe(CURRENT_VERSION);
    expect(migrated.activeChapterId).toBe(4);
    expect(migrated.chapters[4].started).toBe(true);
  });
});
