import { test, expect } from '@playwright/test';
import { waitForAppReady } from '../helpers/reset-app-state.js';

test.describe('@smoke Release Base Path Smoke Suite', () => {
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

  test('Production bundle loads cleanly under configured base path', async ({ page, baseURL }) => {
    const isCI = !!process.env.CI;
    const viteBase = process.env.VITE_BASE;

    if (isCI) {
      if (!viteBase) {
        throw new Error('VITE_BASE environment variable is required in CI mode');
      }
      if (viteBase !== '/KotoKitsu/') {
        throw new Error(
          `VITE_BASE in CI must strictly equal "/KotoKitsu/", received: "${viteBase}"`
        );
      }
    }

    const base = viteBase || '/';
    const targetUrl = new URL(base, baseURL || 'http://127.0.0.1:3000').href;

    await page.goto(targetUrl);
    await waitForAppReady(page);

    // 1. Page opens at target base path, URL pathname strictly contains base path
    const currentUrl = new URL(page.url());
    expect(
      currentUrl.pathname,
      `Page pathname "${currentUrl.pathname}" must contain "${base}"`
    ).toContain(base);

    // 2. Main interface renders
    const activeScreen = page.locator('.screen:not(.hidden)').first();
    await expect(activeScreen).toBeVisible({ timeout: 10000 });

    // 3. Main JS and CSS loaded without 404
    const missingAssets = failedRequests.filter(
      (r) => r.status === 404 && (r.url.includes('.js') || r.url.includes('.css'))
    );
    expect(missingAssets, `404 asset failures: ${JSON.stringify(missingAssets)}`).toHaveLength(0);

    // 4. Manifest is loaded from base path manifest.json
    const manifestUrl = new URL('manifest.json', targetUrl).href;
    expect(manifestUrl, 'Manifest URL must contain base path').toContain(`${base}manifest.json`);
    const manifestResponse = await page.request.get(manifestUrl);
    expect(manifestResponse.ok(), `manifest.json should be accessible at ${manifestUrl}`).toBe(
      true
    );

    // 5. Service Worker MUST be registered and scope must end with base path
    const swInfo = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) {
        throw new Error('Service Worker is not supported in this browser environment');
      }
      for (let i = 0; i < 50; i++) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        if (registrations.length > 0) {
          return { scope: registrations[0].scope };
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error('Service Worker failed to register within timeout');
    });

    const expectedScopeEnding = `${base.replace(/\/$/, '')}/`;
    expect(
      swInfo.scope.endsWith(expectedScopeEnding),
      `Service Worker scope "${swInfo.scope}" must end with "${expectedScopeEnding}"`
    ).toBe(true);

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
