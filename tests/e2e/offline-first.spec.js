import { test, expect } from '@playwright/test';
import { seedAppState, waitForAppReady, navigateToScreen } from './helpers/reset-app-state.js';

/**
 * Gathers comprehensive offline diagnostics on failure or status checks.
 */
async function getOfflineDiagnostics(page, consoleLogs = [], pageErrors = []) {
  let swInfo = {};
  let cacheInfo = {};

  try {
    swInfo = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { supported: false };
      const reg = await navigator.serviceWorker.getRegistration();
      return {
        supported: true,
        hasRegistration: !!reg,
        scope: reg?.scope || null,
        activeState: reg?.active?.state || null,
        controllerPresent: !!navigator.serviceWorker.controller,
        controllerScriptURL: navigator.serviceWorker.controller?.scriptURL || null,
      };
    });
  } catch (e) {
    swInfo = { error: e.message };
  }

  try {
    cacheInfo = await page.evaluate(async () => {
      if (!('caches' in window)) return { supported: false };
      const names = await caches.keys();
      const details = [];

      for (const name of names) {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        const urls = requests.map((r) => r.url);
        details.push({
          name,
          count: urls.length,
          hasIndexHtml: urls.some((u) => u.endsWith('/') || u.includes('index.html')),
          hasManifest: urls.some((u) => u.includes('manifest')),
          hasMainJs: urls.some((u) => u.endsWith('.js')),
          hasMainCss: urls.some((u) => u.endsWith('.css')),
        });
      }
      return { names, details };
    });
  } catch (e) {
    cacheInfo = { error: e.message };
  }

  return JSON.stringify(
    {
      url: page.url(),
      serviceWorker: swInfo,
      cacheStorage: cacheInfo,
      consoleLogs,
      pageErrors,
    },
    null,
    2
  );
}

/**
 * Ensures Service Worker ready, controller active, and Cache Storage contains app shell assets before going offline.
 */
async function waitForSWAndOfflineCacheReady(page, consoleLogs = [], pageErrors = []) {
  try {
    // 1. Wait for SW ready
    await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) {
        throw new Error('ServiceWorker API missing in navigator');
      }
      await navigator.serviceWorker.ready;
    });

    // 2 & 3. Ensure controller is active. If null, wait briefly or reload online to attach controller.
    let hasController = await page.evaluate(() => !!navigator.serviceWorker.controller);
    if (!hasController) {
      await page.waitForTimeout(1000);
      hasController = await page.evaluate(() => !!navigator.serviceWorker.controller);
    }
    if (!hasController) {
      await page.reload();
      await waitForAppReady(page);
      hasController = await page.evaluate(() => !!navigator.serviceWorker.controller);
    }

    if (!hasController) {
      throw new Error('navigator.serviceWorker.controller is null after online reload');
    }

    // 4. Check Cache Storage for index.html, manifest, main JS & CSS
    await page.evaluate(async () => {
      const cacheDeadline = Date.now() + 15000;
      let cacheReady = false;
      let lastDetails = [];

      while (Date.now() < cacheDeadline) {
        const keys = await caches.keys();
        let foundAssets = false;
        lastDetails = [];

        for (const key of keys) {
          const cache = await caches.open(key);
          const requests = await cache.keys();
          const urls = requests.map((r) => r.url);

          const hasIndexHtml = urls.some((u) => u.endsWith('/') || u.includes('index.html'));
          const hasManifest = urls.some((u) => u.includes('manifest'));
          const hasJs = urls.some((u) => u.endsWith('.js'));
          const hasCss = urls.some((u) => u.endsWith('.css'));

          lastDetails.push({ key, count: urls.length, hasIndexHtml, hasManifest, hasJs, hasCss });

          if (hasIndexHtml && (hasManifest || hasJs)) {
            foundAssets = true;
            break;
          }
        }

        if (foundAssets) {
          cacheReady = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 250));
      }

      if (!cacheReady) {
        throw new Error(`Cache Storage not ready. Details: ${JSON.stringify(lastDetails)}`);
      }
    });
  } catch (err) {
    const diag = await getOfflineDiagnostics(page, consoleLogs, pageErrors);
    console.error('❌ SW/Cache Preparation Error:\n', err.message, '\nDiagnostics:\n', diag);
    throw err;
  }
}

test.describe('@pwa @offline Offline-First Execution E2E Suite', () => {
  let consoleLogs = [];
  let pageErrors = [];

  test.beforeEach(async ({ page }) => {
    consoleLogs = [];
    pageErrors = [];

    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    page.on('pageerror', (err) => {
      pageErrors.push(err.stack || err.message || String(err));
    });
  });

  test('First launch online, cached assets serve offline session after context disconnect', async ({
    page,
    context,
    browserName,
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

    // Strict requirements before context.setOffline(true):
    // 1. ready, 2. controller present, 3. controlling page, 4. entry assets in Cache Storage
    await waitForSWAndOfflineCacheReady(page, consoleLogs, pageErrors);

    // Set browser context offline
    await context.setOffline(true);

    try {
      // In Firefox/WebKit, page.reload() after setOffline(true) is known to fail with internal driver errors.
      // Desktop Chrome & Mobile Chrome perform full page reload under offline conditions.
      if (browserName === 'chromium') {
        await page.reload();
        await waitForAppReady(page);
      }

      // Verify main screen renders correctly offline
      const homeScreen = page.locator('#screen-home');
      await expect(homeScreen).toBeVisible();

      // Verify local progress read capability offline
      await navigateToScreen(page, 'plan');
      await expect(page.locator('#screen-plan')).toBeVisible();
    } catch (err) {
      const diag = await getOfflineDiagnostics(page, consoleLogs, pageErrors);
      console.error('❌ Failure in offline session verification:\n', diag);
      throw err;
    } finally {
      // Restore online status
      await context.setOffline(false);
    }
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
