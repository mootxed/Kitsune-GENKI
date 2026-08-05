/* global DOMException */
import { test, expect } from '@playwright/test';
import { seedAppState, waitForAppReady } from './helpers/reset-app-state.js';

test.describe('@storage IndexedDB Disabled / SecurityError Fallback E2E Suite', () => {
  test('App handles blocked/disabled IndexedDB gracefully with degraded mode', async ({ page }) => {
    await seedAppState(page, {
      version: 13,
      xp: 420,
      onboarding: { completed: true, schemaVersion: 1 },
      settings: { darkMode: 'auto' },
    });

    // Mock IndexedDB SecurityError before page load
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', {
        get() {
          throw new DOMException('Access to IndexedDB is denied in this context', 'SecurityError');
        },
        configurable: true,
      });
    });

    await page.goto('./');
    await waitForAppReady(page);

    const appStateAfterInit = await page.evaluate(() => {
      const rawState = localStorage.getItem('kitsune_state_v1');
      const parsed = rawState ? JSON.parse(rawState) : null;
      return {
        xp: parsed?.xp,
        appRendered: !!document.querySelector('.screen:not(.hidden)'),
      };
    });

    expect(appStateAfterInit.appRendered).toBe(true);
    expect(appStateAfterInit.xp).toBe(420);
  });
});
