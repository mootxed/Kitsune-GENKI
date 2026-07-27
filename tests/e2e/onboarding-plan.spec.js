import { test, expect } from '@playwright/test';
import { resetAppState, waitForAppReady } from './helpers/reset-app-state.js';

test.describe('E2E Onboarding & Chapter Flow', () => {
  test('Full E2E user flow: onboarding -> create plan -> chapter 1 check -> reset -> onboarding', async ({
    page,
  }) => {
    // 1. Clear storage cleanly and open app
    await resetAppState(page);
    await waitForAppReady(page);

    // 2. See onboarding step 1
    const startBtn = page.locator('[data-testid="onboarding-start-btn"]');
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // 3. Step 2 (Prior Knowledge) -> click Next
    const step2Next = page.locator('#ob-next');
    await expect(step2Next).toBeVisible();
    await step2Next.click();

    // 4. Step 3 (Start Date) -> click Next
    const step3Next = page.locator('#ob-next');
    await expect(step3Next).toBeVisible();
    await step3Next.click();

    // 5. Step 4 (Study Days) -> click Next
    const step4Next = page.locator('#ob-next');
    await expect(step4Next).toBeVisible();
    await step4Next.click();

    // 6. Step 5 (Target Goal) -> click Next
    const step5Next = page.locator('#ob-next');
    await expect(step5Next).toBeVisible();
    await step5Next.click();

    // 7. Step 6 (Workbook Settings) -> click Next
    const step6Next = page.locator('#ob-next');
    await expect(step6Next).toBeVisible();
    await step6Next.click();

    // 8. Step 7 (Summary & Commit) -> Click Create Plan
    const commitBtn = page.locator('[data-testid="create-plan-btn"]');
    await expect(commitBtn).toBeVisible();
    await commitBtn.click();

    // Verify screen visibility on home screen right after creating plan
    await expect(page.locator('#screen-onboarding')).toBeHidden({ timeout: 10000 });
    await expect(page.locator('#screen-home')).toBeVisible();

    // Reload page and verify screen visibility state persists
    await page.reload();
    await waitForAppReady(page);
    await expect(page.locator('#screen-onboarding')).toBeHidden();
    await expect(page.locator('#screen-home')).toBeVisible();

    // 9. Navigate to Chapter 1 via window.nav (not page.goto which causes full reload)
    await page.evaluate(() => {
      if (typeof window.nav === 'function') window.nav('chapter', 1);
    });
    await expect(page.locator('#screen-chapter')).toBeVisible({ timeout: 10000 });

    // Verify 0 done check items (chapter newly started)
    const doneItems = page.locator('.check-item.done');
    await expect(doneItems).toHaveCount(0);

    // 10. Navigate to Settings via window.nav (settings renders its content dynamically)
    await page.evaluate(() => {
      if (typeof window.nav === 'function') window.nav('settings');
    });
    await expect(page.locator('#screen-settings')).toBeVisible({ timeout: 10000 });

    // Wait for settings content to render (btn-reset is rendered by settings.js)
    const resetBtn = page.locator('#btn-reset');
    await expect(resetBtn).toBeVisible({ timeout: 8000 });

    // Accept confirm dialog
    page.once('dialog', (dialog) => dialog.accept());
    await resetBtn.click();

    // 11. After reset, navigate to home and verify onboarding is shown again
    await resetAppState(page);
    await waitForAppReady(page);
    await expect(page.locator('[data-testid="onboarding-start-btn"]')).toBeVisible({
      timeout: 10000,
    });
  });

  const viewports = [320, 360, 390, 422, 768];
  for (const width of viewports) {
    test(`Responsive layout check at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await resetAppState(page);
      await waitForAppReady(page);

      const isOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(isOverflowing).toBe(false);
    });
  }
});
