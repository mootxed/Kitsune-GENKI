import { test, expect } from '@playwright/test';

test.describe('@storage localStorage Disabled / SecurityError Fallback E2E Suite', () => {
  test('App boots safely without fatal error when localStorage throws SecurityError', async ({
    page,
  }) => {
    // Inject script blocking localStorage access (runs in browser context where DOMException exists)
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          // eslint-disable-next-line no-undef
          throw new DOMException('localStorage is disabled by user policy', 'SecurityError');
        },
        configurable: true,
      });
    });

    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).toBeVisible();

    const isMountedSafely = await page
      .evaluate(() => {
        const hasScreen = !!document.querySelector('.screen:not(.hidden)');
        const hasRecovery = document.body.textContent.includes('Хранилище недоступно');
        return hasScreen || hasRecovery;
      })
      .catch(() => false);

    expect(isMountedSafely).toBe(true);
  });
});
