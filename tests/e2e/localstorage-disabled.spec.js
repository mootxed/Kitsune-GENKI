/* global DOMException */
import { test, expect } from '@playwright/test';

test.describe('@storage localStorage Disabled / SecurityError Fallback E2E Suite', () => {
  test('App boots safely without fatal error when localStorage throws SecurityError', async ({
    page,
  }) => {
    // Inject script blocking localStorage access
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('localStorage is disabled by user policy', 'SecurityError');
        },
        configurable: true,
      });
    });

    await page.goto('./');

    // Check that app does not fatal crash
    const screenVisible = await page
      .evaluate(() => {
        const screen = document.querySelector('.screen:not(.hidden)');
        return !!screen;
      })
      .catch(() => false);

    expect(screenVisible).toBe(true);
  });
});
