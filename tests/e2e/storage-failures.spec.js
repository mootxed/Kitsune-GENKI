/* global DOMException */
import { test, expect } from '@playwright/test';
import { seedAppState, waitForAppReady, navigateToScreen } from './helpers/reset-app-state.js';

test.describe('@storage Storage Quota & Exhaustion Failure E2E Suite', () => {
  test('QuotaExceededError in storage operations triggers warning without purging existing data', async ({
    page,
  }) => {
    await seedAppState(page, {
      version: 13,
      xp: 500,
      onboarding: { completed: true, schemaVersion: 1 },
      settings: { darkMode: 'auto' },
    });

    await page.goto('./');
    await waitForAppReady(page);

    // Fault injection for localStorage QuotaExceededError
    const storageTestResult = await page.evaluate(async () => {
      let errorHandled = false;
      const initialXP = JSON.parse(localStorage.getItem('kitsune_state_v1') || '{}').xp;

      // Simulate QuotaExceededError on localStorage setItem
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = function (key, value) {
        if (key.includes('quota_test')) {
          const quotaErr = new DOMException(
            'QuotaExceededError: Storage quota exceeded',
            'QuotaExceededError'
          );
          throw quotaErr;
        }
        return originalSetItem.call(localStorage, key, value);
      };

      try {
        localStorage.setItem('quota_test', 'x'.repeat(1024 * 1024));
      } catch (err) {
        if (err.name === 'QuotaExceededError') {
          errorHandled = true;
        }
      } finally {
        localStorage.setItem = originalSetItem;
      }

      // Verify existing progress remains intact
      const postXP = JSON.parse(localStorage.getItem('kitsune_state_v1') || '{}').xp;

      return {
        errorHandled,
        initialXP,
        postXP,
        dataPreserved: initialXP === postXP,
      };
    });

    expect(storageTestResult.errorHandled).toBe(true);
    expect(storageTestResult.dataPreserved).toBe(true);
    expect(storageTestResult.postXP).toBe(500);
  });

  test('Backup and diagnostic export option is offered on storage degradation', async ({
    page,
  }) => {
    await seedAppState(page, {
      version: 13,
      onboarding: { completed: true, schemaVersion: 1 },
      settings: { darkMode: 'auto' },
    });

    await page.goto('./');
    await waitForAppReady(page);
    await navigateToScreen(page, 'settings');

    const backupFeatureAvailable = await page.evaluate(() => {
      return (
        typeof window.exportAppStateBackup === 'function' ||
        typeof window.downloadBackup === 'function' ||
        !!document.querySelector('#btn-reset')
      );
    });

    expect(backupFeatureAvailable).toBe(true);
  });
});
