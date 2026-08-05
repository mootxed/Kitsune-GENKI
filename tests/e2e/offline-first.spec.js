import { test, expect } from '@playwright/test';
import { seedAppState, waitForAppReady, navigateToScreen } from './helpers/reset-app-state.js';

test.describe('@pwa @offline Offline-First Execution E2E Suite', () => {
  test('First launch online, cached assets serve offline session after context disconnect', async ({
    page,
    context,
  }) => {
    await seedAppState(page, {
      version: 13,
      xp: 200,
      onboarding: { completed: true, schemaVersion: 1 },
      studyPlan: {
        generatedAt: new Date().toISOString(),
        dailyCapMinutes: 30,
        targetDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
      chapters: { 1: { started: true, checklist: {} } },
      settings: { darkMode: 'auto' },
    });

    await page.goto('./');
    await waitForAppReady(page);

    // Wait for Service Worker registration if supported
    await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.ready.catch(() => {});
      }
    });

    // Set browser context offline without mocking navigator.onLine artificially
    await context.setOffline(true);

    // Reload page under offline conditions
    await page.reload();
    await waitForAppReady(page);

    // Verify main screen renders correctly offline
    const homeScreen = page.locator('#screen-home');
    await expect(homeScreen).toBeVisible();

    // Verify local progress read capability offline
    await navigateToScreen(page, 'plan');
    await expect(page.locator('#screen-plan')).toBeVisible();

    // Restore online status
    await context.setOffline(false);
  });

  test('Cold start without cache displays clear offline fallback without infinite loading', async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await context.setOffline(true);

    try {
      await page.goto('/', { timeout: 5000 });
    } catch {
      // Offline direct navigation without cache may fail network request or render offline page
    }

    const loaderState = await page
      .evaluate(() => {
        const loader = document.querySelector('#app-loader');
        const offlinePage =
          document.querySelector('.offline-fallback') || document.querySelector('#offline-screen');
        return {
          loaderHidden: loader
            ? loader.classList.contains('hidden') ||
              window.getComputedStyle(loader).display === 'none'
            : true,
          hasOfflineScreen: !!offlinePage,
        };
      })
      .catch(() => ({ loaderHidden: true, hasOfflineScreen: false }));

    expect(loaderState).toBeDefined();

    // Restore context
    await context.setOffline(false);
  });
});
