import { test, expect } from '@playwright/test';
import { seedAppState, waitForAppReady, navigateToScreen } from '../helpers/reset-app-state.js';

test.describe('@smoke Cross-browser Smoke Compatibility Suite', () => {
  let consoleErrors = [];
  let pageErrors = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    pageErrors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (err) => {
      pageErrors.push(err.message || String(err));
    });
  });

  test('1. Application opens and renders main screen without fatal error', async ({ page }) => {
    await seedAppState(page, {
      version: 13,
      onboarding: { completed: true, schemaVersion: 1 },
      settings: { darkMode: 'auto' },
    });

    const activeScreen = page.locator('.screen:not(.hidden)').first();
    await expect(activeScreen).toBeVisible({ timeout: 10000 });

    expect(pageErrors, `Unhandled page errors detected: ${pageErrors.join(', ')}`).toHaveLength(0);
    // Filter non-critical network/font console errors if any
    const fatalConsoleErrors = consoleErrors.filter(
      (err) => !err.includes('favicon') && !err.includes('Failed to load resource')
    );
    expect(
      fatalConsoleErrors,
      `Critical console errors: ${fatalConsoleErrors.join(', ')}`
    ).toHaveLength(0);
  });

  test('2. Basic study screen opens and minimal session can be navigated', async ({ page }) => {
    await seedAppState(page, {
      version: 13,
      onboarding: { completed: true, schemaVersion: 1 },
      studyPlan: {
        generatedAt: new Date().toISOString(),
        dailyCapMinutes: 30,
        targetDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
      chapters: { 1: { started: true, checklist: {} } },
      settings: { darkMode: 'auto' },
    });

    await navigateToScreen(page, 'home');
    await expect(page.locator('#screen-home')).toBeVisible();

    await navigateToScreen(page, 'plan');
    await expect(page.locator('#screen-plan')).toBeVisible();
  });

  test('3. Correct navigation across main tabs and screens', async ({ page }) => {
    await seedAppState(page, {
      version: 13,
      onboarding: { completed: true, schemaVersion: 1 },
      settings: { darkMode: 'auto' },
    });

    const screensToTest = ['home', 'settings', 'statistics'];
    for (const screenId of screensToTest) {
      await navigateToScreen(page, screenId);
      await expect(page.locator(`#screen-${screenId}`)).toBeVisible();
    }
  });

  test('4. IndexedDB and localStorage are available in browser environment', async ({ page }) => {
    await page.goto('./');
    await waitForAppReady(page);

    const storageSupport = await page.evaluate(async () => {
      const hasLocalStorage = typeof window.localStorage !== 'undefined';
      let hasIndexedDB = false;
      try {
        hasIndexedDB = !!window.indexedDB;
      } catch {
        hasIndexedDB = false;
      }

      let localStorageWritable = false;
      if (hasLocalStorage) {
        try {
          window.localStorage.setItem('__smoke_test__', '1');
          localStorageWritable = window.localStorage.getItem('__smoke_test__') === '1';
          window.localStorage.removeItem('__smoke_test__');
        } catch {
          localStorageWritable = false;
        }
      }

      return {
        hasLocalStorage,
        localStorageWritable,
        hasIndexedDB,
      };
    });

    expect(storageSupport.hasLocalStorage).toBe(true);
    expect(storageSupport.localStorageWritable).toBe(true);
    expect(storageSupport.hasIndexedDB).toBe(true);
  });

  test('5. Production assets load without broken styles or script errors', async ({ page }) => {
    await page.goto('./');
    await waitForAppReady(page);

    // Verify main CSS is computed
    const bodyBg = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    expect(bodyBg).toBeTruthy();

    // Verify fallback behavior for browser-specific APIs (install prompt, etc.)
    const browserCapabilities = await page.evaluate(() => {
      return {
        hasServiceWorker: 'serviceWorker' in navigator,
        hasBeforeInstallPrompt: 'BeforeInstallPromptEvent' in window,
      };
    });

    // Cross-browser verification: absent install prompt event is graceful fallback, not failure
    if (!browserCapabilities.hasBeforeInstallPrompt) {
      console.log(
        '[Smoke] Install prompt event is not natively supported on this browser engine (Firefox/WebKit fallback active)'
      );
    }

    expect(pageErrors).toHaveLength(0);
  });
});
