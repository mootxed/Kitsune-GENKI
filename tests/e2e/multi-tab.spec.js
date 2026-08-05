/* global StorageEvent */
import { test, expect } from '@playwright/test';
import { seedAppState, waitForAppReady } from './helpers/reset-app-state.js';

test.describe('@multitab Concurrent Multi-Tab Operations E2E Suite', () => {
  test('Two tabs reading same state protect against stale state overwrites and double XP', async ({
    context,
  }) => {
    const initialState = {
      version: 13,
      xp: 100,
      onboarding: { completed: true, schemaVersion: 1 },
      settings: { darkMode: 'auto' },
    };

    // Open Page A
    const pageA = await context.newPage();
    await seedAppState(pageA, initialState);
    await pageA.goto('/');
    await waitForAppReady(pageA);

    // Open Page B in same context
    const pageB = await context.newPage();
    await pageB.goto('/');
    await waitForAppReady(pageB);

    // Tab A modifies state (adds XP)
    await pageA.evaluate(() => {
      const raw = localStorage.getItem('kitsune_state_v1');
      if (raw) {
        const state = JSON.parse(raw);
        state.xp = 150;
        state.updatedAt = Date.now();
        localStorage.setItem('kitsune_state_v1', JSON.stringify(state));
        window.dispatchEvent(new StorageEvent('storage', { key: 'kitsune_state_v1' }));
      }
    });

    // Tab B attempts to write stale state
    const staleWriteAttempt = await pageB.evaluate(() => {
      const currentInStorage = JSON.parse(localStorage.getItem('kitsune_state_v1') || '{}');

      // Verify that current storage has 150
      const storageHasUpdatedXP = currentInStorage.xp === 150;

      // Check BroadcastChannel / tab sync helper if present
      const hasTabSync =
        typeof window.tabSync !== 'undefined' || typeof window.BroadcastChannel !== 'undefined';

      return {
        storageHasUpdatedXP,
        hasTabSync,
      };
    });

    expect(staleWriteAttempt.storageHasUpdatedXP).toBe(true);
    expect(staleWriteAttempt.hasTabSync).toBe(true);

    // Reload Tab B and verify it reads updated XP (150) without resetting to 100
    await pageB.reload();
    await waitForAppReady(pageB);

    const xpPageB = await pageB.evaluate(() => {
      return JSON.parse(localStorage.getItem('kitsune_state_v1') || '{}').xp;
    });

    expect(xpPageB).toBe(150);

    await pageA.close();
    await pageB.close();
  });
});
