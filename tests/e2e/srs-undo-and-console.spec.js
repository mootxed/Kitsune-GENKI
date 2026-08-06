import { test, expect } from '@playwright/test';
import { seedAppState, navigateToScreen } from './helpers/reset-app-state.js';

test.describe('E2E Console Monitoring and SRS Undo Flow', () => {
  let consoleErrors = [];
  let consoleWarnings = [];
  let unhandledPageErrors = [];

  // Allowed warnings that are expected in test/headless browser environment
  const ALLOWED_WARNING_PATTERNS = [
    /IndexedDB/i,
    /In-Memory Fallback/i,
    /AudioContext/i,
    /autoplay/i,
    /TTS/i,
    /service worker/i,
  ];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    consoleWarnings = [];
    unhandledPageErrors = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error') {
        consoleErrors.push(text);
      } else if (msg.type() === 'warning') {
        const isAllowed = ALLOWED_WARNING_PATTERNS.some((pattern) => pattern.test(text));
        if (!isAllowed) {
          consoleWarnings.push(text);
        }
      }
    });

    page.on('pageerror', (err) => {
      unhandledPageErrors.push(err.message || String(err));
    });
  });

  test('1. Navigates across main app screens without unexpected console errors or warnings', async ({
    page,
  }) => {
    await seedAppState(page, {
      chapters: { 1: { started: true, completed: false } },
    });

    const screensToTest = [
      'home',
      'plan',
      'course',
      'dictionary',
      'statistics',
      'settings',
      'profile',
    ];

    for (const screen of screensToTest) {
      await navigateToScreen(page, screen);
      await page.waitForTimeout(100);
    }

    expect(consoleErrors, `Unexpected console errors: ${consoleErrors.join('; ')}`).toEqual([]);
    expect(consoleWarnings, `Unexpected console warnings: ${consoleWarnings.join('; ')}`).toEqual(
      []
    );
    expect(unhandledPageErrors, `Unhandled page errors: ${unhandledPageErrors.join('; ')}`).toEqual(
      []
    );
  });

  test('2. Single active navigation tab on desktop and mobile routes', async ({ page }) => {
    await seedAppState(page, {
      chapters: { 1: { started: true } },
    });

    await navigateToScreen(page, 'dictionary');
    const activeTabs = page.locator('.tab.active:visible');
    expect(await activeTabs.count()).toBe(1);

    await navigateToScreen(page, 'statistics');
    expect(await page.locator('.tab.active:visible').count()).toBe(1);

    await navigateToScreen(page, 'settings');
    expect(await page.locator('.tab.active:visible').count()).toBe(1);
  });
});
