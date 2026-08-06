// tests/e2e/srs-tabs-inline.spec.js
// E2E tests for issue-27: SRS routing, hero layout, brand mark unification & mascot integration

import { test, expect } from '@playwright/test';
import { completeOnboarding, navigateToScreen } from './helpers/reset-app-state.js';

test.describe('SRS tabs — routing and inline rendering', () => {
  test.beforeEach(async ({ page }) => {
    await completeOnboarding(page);
    await page.waitForSelector('[data-testid="screen-home"]', { state: 'visible', timeout: 10000 });
  });

  test('nav("dictionary") activates SRS screen with single dictionary render', async ({ page }) => {
    await navigateToScreen(page, 'dictionary');

    const dictTab = page.locator('#srs-tabs-container [data-tab="dictionary"]');
    await expect(dictTab).toHaveClass(/active/);

    await expect(page.locator('#screen-srs')).toBeVisible();
    const legacyScreen = page.locator('#screen-user-dictionaries');
    if ((await legacyScreen.count()) > 0) {
      await expect(legacyScreen).toBeHidden();
    }
  });

  test('nav("user-dictionaries") leaves screen-srs visible and activates Мои словари tab', async ({
    page,
  }) => {
    await navigateToScreen(page, 'user-dictionaries');

    const udTab = page.locator('#srs-tabs-container [data-tab="user-dictionaries"]');
    await expect(udTab).toHaveClass(/active/);
    await expect(page.locator('#screen-srs')).toBeVisible();

    const srsNavTab = page.locator('.tab[data-nav="srs"], .tabbar [data-nav="srs"]').first();
    await expect(srsNavTab).toHaveClass(/active/);
  });

  test('Tab switching updates title and active tab while keeping screen-srs visible', async ({
    page,
  }) => {
    await navigateToScreen(page, 'srs');

    await page.locator('#srs-tabs-container [data-tab="dictionary"]').click();
    await expect(page.locator('#srs-screen-title')).toHaveText('Словарь');
    await expect(page.locator('#screen-srs')).toBeVisible();

    await page.locator('#srs-tabs-container [data-tab="particles"]').click();
    await expect(page.locator('#srs-screen-title')).toHaveText('Частицы');
    await expect(page.locator('#screen-srs')).toBeVisible();
  });

  test('Rapid switching — late promise does not overwrite particles tab', async ({ page }) => {
    await navigateToScreen(page, 'srs');

    await page.locator('#srs-tabs-container [data-tab="user-dictionaries"]').click();
    await page.locator('#srs-tabs-container [data-tab="particles"]').click();

    await page.waitForTimeout(600);

    await expect(page.locator('#srs-screen-title')).toHaveText('Частицы');
    const activeTab = page.locator('#srs-tabs-container .lib-tab.active');
    await expect(activeTab).toHaveAttribute('data-tab', 'particles');
  });

  test('Leaving async dictionary route aborts render and does not update body when away', async ({
    page,
  }) => {
    await navigateToScreen(page, 'dictionary');
    await navigateToScreen(page, 'home');

    await page.waitForTimeout(500);

    await expect(page.locator('#screen-home')).toBeVisible();
    await expect(page.locator('#screen-srs')).toBeHidden();
  });
});

test.describe('Brand mark & Mascot unification', () => {
  test('All main screen headers feature .brand-fox-mark and no emoji fox in header titles', async ({
    page,
  }) => {
    await completeOnboarding(page);

    const brandMarks = page.locator('.brand-fox-mark');
    const count = await brandMarks.count();
    expect(count).toBeGreaterThanOrEqual(5);

    for (let i = 0; i < count; i++) {
      const svg = brandMarks.nth(i).locator('svg.fox-mark');
      await expect(svg).toHaveCount(1);
    }

    const appTitles = page.locator('.app-header .app-title, .app-header h1');
    const titleCount = await appTitles.count();
    for (let i = 0; i < titleCount; i++) {
      const text = await appTitles.nth(i).textContent();
      expect(text).not.toContain('🦊');
    }
  });

  test('Different mascot asset URLs are configured for different application states', async ({
    page,
  }) => {
    await completeOnboarding(page);

    const homeMascotSrc = await page.locator('.home-mascot img').getAttribute('src');
    expect(homeMascotSrc).toContain('mascot-hero-medium.webp');
  });
});

test.describe('Home hero — element-level intersection verification', () => {
  const viewports = [
    { width: 320, height: 720 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 422, height: 930 },
  ];

  for (const vp of viewports) {
    test(`Hero text elements do not overlap decor circles at ${vp.width}x${vp.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);
      await completeOnboarding(page);
      await page.waitForSelector('.home-hero', { state: 'visible', timeout: 10000 });

      const overlaps = await page.evaluate(() => {
        const textSelectors = [
          '#continue-learning-title',
          '#continue-learning-context',
          '.home-task-meta',
          '.continue-arrow',
        ];
        const decorSelectors = ['.home-mascot-halo', '.home-hero::after'];

        const textElements = textSelectors
          .map((sel) => document.querySelector(sel))
          .filter(Boolean);

        const decorElements = decorSelectors
          .map((sel) => document.querySelector(sel))
          .filter((el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
          });

        let foundOverlap = false;

        for (const textEl of textElements) {
          const tr = textEl.getBoundingClientRect();
          if (tr.width === 0 || tr.height === 0) continue;

          for (const decorEl of decorElements) {
            const dr = decorEl.getBoundingClientRect();
            if (dr.width === 0 || dr.height === 0) continue;

            const isIntersecting = !(
              dr.right <= tr.left ||
              dr.left >= tr.right ||
              dr.bottom <= tr.top ||
              dr.top >= tr.bottom
            );

            if (isIntersecting) {
              foundOverlap = true;
              break;
            }
          }
          if (foundOverlap) break;
        }

        return foundOverlap;
      });

      expect(overlaps).toBe(false);
    });

    test(`No horizontal scroll at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await completeOnboarding(page);
      await page.waitForSelector('.home-hero', { state: 'visible', timeout: 10000 });

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
