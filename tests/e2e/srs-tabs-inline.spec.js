// tests/e2e/srs-tabs-inline.spec.js
// E2E tests for issue-27: SRS tabs unified controller
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.describe('SRS tabs — unified inline controller', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    // Wait for app to init
    await page.waitForSelector('[data-testid="screen-home"]', { state: 'visible', timeout: 10000 });
    // Navigate to SRS
    const srsNavBtn = page.locator('.tab[data-nav="srs"], .tabbar [data-nav="srs"]').first();
    await srsNavBtn.click();
    await page.waitForSelector('[data-testid="screen-srs"]:not(.hidden)', { timeout: 5000 });
  });

  test('SRS screen loads with Repetition tab active', async ({ page }) => {
    const repetitionTab = page.locator('#srs-tabs-container [data-tab="repetition"]');
    await expect(repetitionTab).toHaveClass(/active/);
    await expect(repetitionTab).toHaveAttribute('aria-selected', 'true');

    // Exactly one tab should be active
    const activeTabs = page.locator('#srs-tabs-container .lib-tab.active');
    await expect(activeTabs).toHaveCount(1);
  });

  test('Clicking Dictionary tab shows dictionary content inside #srs-body', async ({ page }) => {
    await page.locator('#srs-tabs-container [data-tab="dictionary"]').click();
    // Dictionary tab becomes active
    const dictTab = page.locator('#srs-tabs-container [data-tab="dictionary"]');
    await expect(dictTab).toHaveClass(/active/);
    await expect(dictTab).toHaveAttribute('aria-selected', 'true');
    // Screen stays SRS
    await expect(page.locator('#screen-srs')).not.toHaveClass(/hidden/);
    // Content renders in #srs-body
    const body = page.locator('#srs-body');
    await expect(body).not.toBeEmpty({ timeout: 5000 });
    // Exactly one active tab
    await expect(page.locator('#srs-tabs-container .lib-tab.active')).toHaveCount(1);
  });

  test('Clicking Particles tab shows particles content inside #srs-body', async ({ page }) => {
    await page.locator('#srs-tabs-container [data-tab="particles"]').click();
    const particlesTab = page.locator('#srs-tabs-container [data-tab="particles"]');
    await expect(particlesTab).toHaveClass(/active/);
    await expect(particlesTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#screen-srs')).not.toHaveClass(/hidden/);
    await expect(page.locator('#srs-body')).not.toBeEmpty({ timeout: 5000 });
    await expect(page.locator('#srs-tabs-container .lib-tab.active')).toHaveCount(1);
  });

  test('Clicking Мои словари stays inline in #srs-body, NOT separate screen', async ({ page }) => {
    await page.locator('#srs-tabs-container [data-tab="user-dictionaries"]').click();
    const udTab = page.locator('#srs-tabs-container [data-tab="user-dictionaries"]');
    await expect(udTab).toHaveClass(/active/);
    await expect(udTab).toHaveAttribute('aria-selected', 'true');
    // Critical: SRS screen stays active
    await expect(page.locator('#screen-srs')).not.toHaveClass(/hidden/);
    // Bottom nav SRS button stays active
    const srsNavTab = page.locator('.tab[data-nav="srs"], .tabbar [data-nav="srs"]').first();
    await expect(srsNavTab).toHaveClass(/active/);
    // Content renders in #srs-body
    await expect(page.locator('#srs-body')).not.toBeEmpty({ timeout: 5000 });
    await expect(page.locator('#srs-tabs-container .lib-tab.active')).toHaveCount(1);
  });

  test('Header title updates with each tab', async ({ page }) => {
    const titleEl = page.locator('#srs-screen-title');

    // Default: repetition
    await expect(titleEl).toHaveText('Повторение');

    await page.locator('#srs-tabs-container [data-tab="dictionary"]').click();
    await expect(titleEl).toHaveText('Словарь');

    await page.locator('#srs-tabs-container [data-tab="particles"]').click();
    await expect(titleEl).toHaveText('Частицы');

    await page.locator('#srs-tabs-container [data-tab="user-dictionaries"]').click();
    await expect(titleEl).toHaveText('Мои словари');

    await page.locator('#srs-tabs-container [data-tab="repetition"]').click();
    await expect(titleEl).toHaveText('Повторение');
  });

  test('Rapid switching — last selected tab wins', async ({ page }) => {
    const tabs = ['dictionary', 'particles', 'repetition', 'user-dictionaries', 'particles'];
    for (const tab of tabs) {
      await page.locator(`#srs-tabs-container [data-tab="${tab}"]`).click();
    }
    // Wait for renders to settle
    await page.waitForTimeout(1000);
    // Last tab was 'particles'
    const particlesTab = page.locator('#srs-tabs-container [data-tab="particles"]');
    await expect(particlesTab).toHaveClass(/active/);
    await expect(particlesTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#srs-screen-title')).toHaveText('Частицы');
    await expect(page.locator('#srs-body')).not.toBeEmpty();
    await expect(page.locator('#srs-tabs-container .lib-tab.active')).toHaveCount(1);
  });

  test('Returning to Repetition from any tab restores dashboard', async ({ page }) => {
    await page.locator('#srs-tabs-container [data-tab="dictionary"]').click();
    await page.locator('#srs-tabs-container [data-tab="repetition"]').click();
    await expect(page.locator('#srs-tabs-container [data-tab="repetition"]')).toHaveClass(/active/);
    await expect(page.locator('#srs-screen-title')).toHaveText('Повторение');
    await expect(page.locator('[data-testid="srs-stat-row"]')).toBeVisible({ timeout: 5000 });
  });

  test('Keyboard navigation — ArrowRight moves focus', async ({ page }) => {
    const firstTab = page.locator('#srs-tabs-container [data-tab="repetition"]');
    await firstTab.focus();
    await page.keyboard.press('ArrowRight');
    const nextTab = page.locator('#srs-tabs-container [data-tab="dictionary"]');
    await expect(nextTab).toBeFocused();
  });

  test('Keyboard navigation — Home/End jump to first/last tab', async ({ page }) => {
    const tabs = page.locator('#srs-tabs-container [role="tab"]');
    await tabs.first().focus();
    await page.keyboard.press('End');
    await expect(tabs.last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(tabs.first()).toBeFocused();
  });
});

test.describe('SRS tabs — brand mark', () => {
  test('All main screen headers use SVG fox-mark instead of emoji', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('[data-testid="screen-home"]', { state: 'visible', timeout: 10000 });

    const brandMarks = page.locator('.brand-fox-mark');
    const count = await brandMarks.count();
    expect(count).toBeGreaterThan(3);

    for (let i = 0; i < count; i++) {
      const bm = brandMarks.nth(i);
      const svg = bm.locator('svg.fox-mark');
      await expect(svg).toHaveCount(1);
    }
  });
});

test.describe('Home hero — mascot halo layout', () => {
  const viewports = [
    { width: 320, height: 720 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 422, height: 930 },
  ];

  for (const vp of viewports) {
    test(`Halo does not overlap copy at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto(BASE_URL);
      await page.waitForSelector('.home-hero', { state: 'visible', timeout: 10000 });

      const overlap = await page.evaluate(() => {
        const halo = document.querySelector('.home-mascot-halo');
        const copy = document.querySelector('.home-hero-copy');
        if (!halo || !copy) return false;
        // If halo is hidden (display: none), no overlap
        const haloStyle = window.getComputedStyle(halo);
        if (haloStyle.display === 'none') return false;

        const hr = halo.getBoundingClientRect();
        const cr = copy.getBoundingClientRect();
        return !(
          hr.right <= cr.left ||
          hr.left >= cr.right ||
          hr.bottom <= cr.top ||
          hr.top >= cr.bottom
        );
      });

      expect(overlap).toBe(false);
    });

    test(`No horizontal scroll at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto(BASE_URL);
      await page.waitForSelector('.home-hero', { state: 'visible', timeout: 10000 });
      const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(vp.width + 1);
    });
  }
});
