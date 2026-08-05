import { test, expect } from '@playwright/test';
import { waitForAppReady } from '../helpers/reset-app-state.js';

test.describe('@smoke Release Base Path Smoke Suite (/KotoKitsu/)', () => {
  let consoleErrors = [];
  let pageErrors = [];
  let failedRequests = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    pageErrors = [];
    failedRequests = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (err) => {
      pageErrors.push(err.message || String(err));
    });

    page.on('response', (response) => {
      if (response.status() >= 400) {
        failedRequests.push({
          url: response.url(),
          status: response.status(),
        });
      }
    });
  });

  test('Production bundle loads cleanly under /KotoKitsu/ base path', async ({ page, baseURL }) => {
    const targetUrl = new URL('/KotoKitsu/', baseURL || 'http://127.0.0.1:3000').href;

    await page.goto(targetUrl);
    await waitForAppReady(page);

    // 1. Page opens at /KotoKitsu/
    expect(page.url()).toContain('/KotoKitsu/');

    // 2. Main interface renders
    const activeScreen = page.locator('.screen:not(.hidden)').first();
    await expect(activeScreen).toBeVisible({ timeout: 10000 });

    // 3. Main JS and CSS loaded without 404
    const missingAssets = failedRequests.filter(
      (r) => r.status === 404 && (r.url.includes('.js') || r.url.includes('.css'))
    );
    expect(missingAssets, `404 asset failures: ${JSON.stringify(missingAssets)}`).toHaveLength(0);

    // 4. Manifest is accessible
    const manifestResponse = await page.request.get(
      new URL('/KotoKitsu/manifest.json', baseURL || 'http://127.0.0.1:3000').href
    );
    expect(manifestResponse.ok(), 'manifest.json should be accessible').toBe(true);

    // 5. Service Worker scope check (if SW supported in this browser engine)
    const swInfo = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { supported: false };
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        if (registrations.length === 0) return { supported: true, registered: false };
        return {
          supported: true,
          registered: true,
          scope: registrations[0].scope,
        };
      } catch (e) {
        return { supported: true, error: e.message };
      }
    });

    if (swInfo.supported && swInfo.registered) {
      expect(swInfo.scope).toContain('/KotoKitsu/');
    }

    // 6. No module script or critical console errors
    const fatalConsoleErrors = consoleErrors.filter(
      (err) =>
        !err.includes('favicon') && !err.includes('Failed to load resource') && !err.includes('404')
    );
    expect(pageErrors, `Page errors: ${pageErrors.join(', ')}`).toHaveLength(0);
    expect(fatalConsoleErrors, `Console errors: ${fatalConsoleErrors.join(', ')}`).toHaveLength(0);

    // 7. Page reload works without 404
    await page.reload();
    await waitForAppReady(page);
    await expect(page.locator('.screen:not(.hidden)').first()).toBeVisible({ timeout: 10000 });
  });
});
