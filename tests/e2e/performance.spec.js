import { test, expect } from '@playwright/test';
import { seedAppState, waitForAppReady } from './helpers/reset-app-state.js';

test.describe('@performance Lazy Loading & Performance Budgets E2E Suite', () => {
  test('Initial launch loads only core bundle and does NOT request lazy feature chunks', async ({
    page,
  }) => {
    const requestedJsFiles = [];

    page.on('request', (request) => {
      const url = request.url();
      if (url.endsWith('.js')) {
        requestedJsFiles.push(url);
      }
    });

    await seedAppState(page, {
      version: 13,
      xp: 100,
      onboarding: { completed: true, schemaVersion: 1 },
      studyPlan: { generatedAt: new Date().toISOString() },
      settings: { darkMode: 'auto' },
    });

    await page.goto('./');
    await waitForAppReady(page);

    // Verify no lazy screen chunks were requested during initial startup
    const hasShopChunk = requestedJsFiles.some((u) => u.includes('shop-'));
    const hasStatsChunk = requestedJsFiles.some((u) => u.includes('statistics-'));
    const hasDevToolsChunk = requestedJsFiles.some((u) => u.includes('dev-tools-'));
    const hasChatChunk = requestedJsFiles.some((u) => u.includes('chat-'));
    const hasHanziWriterChunk = requestedJsFiles.some((u) => u.includes('vendor-hanziwriter-'));

    expect(hasShopChunk).toBe(false);
    expect(hasStatsChunk).toBe(false);
    expect(hasDevToolsChunk).toBe(false);
    expect(hasChatChunk).toBe(false);
    expect(hasHanziWriterChunk).toBe(false);

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
