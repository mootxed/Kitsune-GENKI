import { test, expect } from '@playwright/test';
import { seedAppState, waitForAppReady } from './helpers/reset-app-state.js';

test.describe('@performance Lazy Loading & Performance Budgets E2E Suite', () => {
  test('Initial launch loads only core bundle and does NOT request lazy feature chunks', async ({
    page,
  }) => {
    const requestedJsFiles = [];
    const modulePreloadUrls = new Set();

    page.on('request', (request) => {
      const url = request.url();
      if (!url.endsWith('.js')) return;
      // Modulepreload is a browser background hint injected by Vite's polyfill —
      // it is NOT a lazy module loaded on demand by user action.
      if (request.resourceType() === 'script' && request.headers()['purpose'] === 'prefetch') {
        modulePreloadUrls.add(url);
        return;
      }
      // Also exclude requests initiated by a modulepreload <link> element
      const initiator = request.headers()['sec-fetch-mode'];
      if (initiator === 'no-cors') {
        // modulepreload links use no-cors mode
        modulePreloadUrls.add(url);
        return;
      }
      requestedJsFiles.push(url);
    });

    await seedAppState(page, {
      version: 13,
      xp: 100,
      onboarding: { completed: true, schemaVersion: 1 },
      studyPlan: { generatedAt: new Date().toISOString() },
      settings: { darkMode: 'auto' },
    });

    // Verify no lazy screen chunks were EAGERly executed during initial startup.
    // Note: modulepreload background hints from Vite polyfill are excluded.
    const isLazyFetched = (chunks) =>
      requestedJsFiles.some((u) => chunks.some((c) => u.includes(c)));

    expect(isLazyFetched(['shop-']), 'shop chunk eagerly loaded').toBe(false);
    expect(isLazyFetched(['statistics-']), 'statistics chunk eagerly loaded').toBe(false);
    expect(isLazyFetched(['dev-tools-']), 'dev-tools chunk eagerly loaded').toBe(false);
    expect(isLazyFetched(['vendor-hanziwriter-']), 'hanziwriter chunk eagerly loaded').toBe(false);

    // Verify home screen is fully visible
    await expect(page.locator('#screen-home')).toBeVisible();
  });

  test('Navigating to Shop dynamically loads shop chunk on demand', async ({ page }) => {
    await seedAppState(page, {
      version: 13,
      onboarding: { completed: true, schemaVersion: 1 },
    });

    await page.goto('./');
    await waitForAppReady(page);

    const shopChunkPromise = page.waitForRequest((req) => req.url().includes('shop-'));
    await page.click('[data-nav="shop"]');
    await shopChunkPromise;

    await expect(page.locator('#shop-modal')).not.toHaveClass(/hidden/);
  });
});
