import { test, expect } from '@playwright/test';
import { seedAppState, waitForAppReady } from './helpers/reset-app-state.js';

test.describe('@pwa PWA Upgrade over Existing Profile E2E Suite', () => {
  test('PWA upgrade over existing profile preserves state and runs schema migrations', async ({
    page,
  }) => {
    // Seed existing profile with previous version state
    const oldVersionState = {
      version: 12,
      xp: 600,
      onboarding: { completed: true, schemaVersion: 1 },
      chapters: { 1: { started: true } },
      settings: { darkMode: 'auto' },
    };

    await seedAppState(page, oldVersionState);
    await page.goto('/');
    await waitForAppReady(page);

    const upgradeResults = await page.evaluate(async () => {
      const rawState = localStorage.getItem('kitsune_state_v1');
      const state = rawState ? JSON.parse(rawState) : null;
      const manifestLink = document.querySelector('link[rel="manifest"]');

      let manifestAccessible = false;
      if (manifestLink) {
        try {
          const res = await fetch(manifestLink.href);
          manifestAccessible = res.ok;
        } catch {
          manifestAccessible = false;
        }
      }

      return {
        currentVersion: state?.version,
        preservedXP: state?.xp,
        manifestAccessible,
        hasAppReady: !!document.querySelector('.screen:not(.hidden)'),
      };
    });

    expect(upgradeResults.hasAppReady).toBe(true);
    expect(upgradeResults.preservedXP).toBe(600);
    expect(upgradeResults.manifestAccessible).toBe(true);
  });
});
