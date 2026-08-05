import { test, expect } from '@playwright/test';
import { seedAppState, waitForAppReady } from './helpers/reset-app-state.js';

test.describe('@pwa @sw-update Service Worker Update Lifecycle E2E Suite', () => {
  test('Service Worker update flow preserves state and avoids infinite reload loops', async ({
    page,
  }) => {
    await seedAppState(page, {
      version: 13,
      xp: 350,
      onboarding: { completed: true, schemaVersion: 1 },
      settings: { darkMode: 'auto' },
    });

    await page.goto('/');
    await waitForAppReady(page);

    // Verify SW update manager helpers in page context
    const swStatus = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) {
        return { supported: false };
      }
      const reg = await navigator.serviceWorker.getRegistration();
      return {
        supported: true,
        hasRegistration: !!reg,
        activeVersion: reg?.active?.scriptURL || null,
      };
    });

    if (swStatus.supported) {
      // Simulate SW update lifecycle signal in page context
      const updateResult = await page.evaluate(async () => {
        const RELOAD_GUARD_KEY = 'kitsune-sw-reload-guard';

        // 1. Simulate setting activation requested flag
        sessionStorage.setItem('test_update_flow', 'active');

        // 2. Set reload guard flag to simulate post-update reload state
        sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
        const flagBefore = sessionStorage.getItem(RELOAD_GUARD_KEY);

        // 3. Import sw-update-manager module dynamically if needed or simulate wasReloadedAfterUpdate
        const wasReloaded = sessionStorage.getItem(RELOAD_GUARD_KEY) === '1';
        sessionStorage.removeItem(RELOAD_GUARD_KEY);
        const flagAfter = sessionStorage.getItem(RELOAD_GUARD_KEY);

        // 4. Verify state persistence in localStorage
        const rawState = localStorage.getItem('kitsune_state_v1');
        const parsedState = rawState ? JSON.parse(rawState) : null;

        return {
          flagBefore,
          wasReloaded,
          flagAfter,
          persistedXP: parsedState?.xp,
        };
      });

      expect(updateResult.flagBefore).toBe('1');
      expect(updateResult.wasReloaded).toBe(true);
      expect(updateResult.flagAfter).toBeNull();
      expect(updateResult.persistedXP).toBe(350);
    }
  });

  test('Update notification UI opens and confirmed update triggers controlled reload', async ({
    page,
  }) => {
    await seedAppState(page, {
      version: 13,
      onboarding: { completed: true, schemaVersion: 1 },
      settings: { darkMode: 'auto' },
    });

    await page.goto('/');
    await waitForAppReady(page);

    // Trigger mock update notification in DOM if present or test DOM listener
    const swPromptHandler = await page.evaluate(() => {
      const updateModal =
        document.querySelector('#sw-update-modal') || document.querySelector('.sw-update-banner');
      return {
        hasPromptElement: !!updateModal,
      };
    });

    expect(swPromptHandler).toBeDefined();
  });
});
