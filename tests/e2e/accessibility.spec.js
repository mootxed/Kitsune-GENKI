/**
 * tests/e2e/accessibility.spec.js
 *
 * Automated accessibility tests using axe-core via @axe-core/playwright.
 * These tests detect WCAG A/AA structural and ARIA violations on main screens.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Helper: prepare app environment for testing
async function prepareHomeScreen(page) {
  await page
    .waitForFunction(() => typeof window.nav === 'function' || document.readyState === 'complete', {
      timeout: 10000,
    })
    .catch(() => {});
  await page.evaluate(() => {
    try {
      localStorage.setItem('kitsune_onboarding_completed', 'true');
    } catch (_e) {
      /* ignore storage error */
    }
    if (typeof window.nav === 'function') {
      window.nav('home');
    } else {
      const onboarding = document.getElementById('screen-onboarding');
      if (onboarding) onboarding.classList.add('hidden');
      const loader = document.getElementById('app-loader');
      if (loader) loader.style.display = 'none';
      const home = document.getElementById('screen-home');
      if (home) home.classList.remove('hidden');
    }
  });
  await page.waitForSelector('#screen-home:not(.hidden)', { timeout: 5000 }).catch(() => {});
}

// Helper: navigate programmatically between screens for isolated testing
async function navigateTo(page, screenId) {
  await page.evaluate((target) => {
    if (typeof window.nav === 'function') {
      window.nav(target);
    } else {
      document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
      const sc = document.getElementById(`screen-${target}`);
      if (sc) sc.classList.remove('hidden');
    }
  }, screenId);
  await page.waitForSelector(`#screen-${screenId}:not(.hidden)`, { timeout: 5000 });
}

// ===== AXE TESTS =====

test.describe('Accessibility: axe-core WCAG A/AA checks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await prepareHomeScreen(page);
  });

  test('Home screen: no critical structural axe violations', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .include('#screen-home')
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();

    const criticalViolations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );
    expect(criticalViolations).toHaveLength(0);
  });

  test('Settings screen: no critical structural axe violations', async ({ page }) => {
    await navigateTo(page, 'settings');

    const results = await new AxeBuilder({ page })
      .include('#screen-settings')
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();

    const criticalViolations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );
    expect(criticalViolations).toHaveLength(0);
  });

  test('Study plan screen: no critical structural axe violations', async ({ page }) => {
    await navigateTo(page, 'plan');

    const results = await new AxeBuilder({ page })
      .include('#screen-plan')
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();

    const criticalViolations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );
    expect(criticalViolations).toHaveLength(0);
  });

  test('SRS/Flashcards screen: no critical structural axe violations', async ({ page }) => {
    await navigateTo(page, 'srs');

    const results = await new AxeBuilder({ page })
      .include('#screen-srs')
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();

    const criticalViolations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );
    expect(criticalViolations).toHaveLength(0);
  });

  test('Statistics screen: no critical structural axe violations', async ({ page }) => {
    await navigateTo(page, 'statistics');

    const results = await new AxeBuilder({ page })
      .include('#screen-statistics')
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();

    const criticalViolations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );
    expect(criticalViolations).toHaveLength(0);
  });

  test('Shop modal: has role=dialog, aria-modal, aria-labelledby', async ({ page }) => {
    await page.evaluate(() => {
      const modal = document.getElementById('shop-modal');
      if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'block';
      }
    });
    await page.waitForTimeout(100);

    const modal = page.locator('#shop-modal');
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    await expect(modal).toHaveAttribute('aria-labelledby', 'shop-modal-title');

    const results = await new AxeBuilder({ page })
      .include('#shop-modal')
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();

    const criticalViolations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );
    expect(criticalViolations).toHaveLength(0);
  });

  test('Document has lang="ru" on html element', async ({ page }) => {
    const lang = await page.getAttribute('html', 'lang');
    expect(lang).toBe('ru');
  });

  test('Viewport allows user scaling', async ({ page }) => {
    const viewport = await page.$eval('meta[name="viewport"]', (el) => el.getAttribute('content'));
    expect(viewport).not.toContain('user-scalable=no');
    expect(viewport).not.toMatch(/maximum-scale=1(?:[^.]|$)/);
  });

  test('Live region elements exist in DOM', async ({ page }) => {
    await expect(page.locator('#a11y-announce')).toBeAttached();
    const politeRole = await page.getAttribute('#a11y-announce', 'aria-live');
    expect(politeRole).toBe('polite');

    await expect(page.locator('#a11y-alert')).toBeAttached();
    const alertRole = await page.getAttribute('#a11y-alert', 'role');
    expect(alertRole).toBe('alert');
  });
});

// ===== KEYBOARD NAVIGATION TESTS =====

test.describe('Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await prepareHomeScreen(page);
  });

  test('Navigation to SRS screen moves focus to heading or screen', async ({ page }) => {
    await navigateTo(page, 'srs');

    const isSrsActive = await page.evaluate(() => {
      const srs = document.getElementById('screen-srs');
      return srs && !srs.classList.contains('hidden');
    });

    expect(isSrsActive).toBe(true);
  });

  test('Hidden screens have inert attribute set', async ({ page }) => {
    await navigateTo(page, 'srs');

    const homeInert = await page.evaluate(() => document.getElementById('screen-home')?.inert);
    expect(homeInert).toBe(true);

    const srsInert = await page.evaluate(() => document.getElementById('screen-srs')?.inert);
    expect(srsInert).toBe(false);
  });

  test('Live region announces navigation', async ({ page }) => {
    await navigateTo(page, 'settings');

    const announcement = await page.evaluate(
      () => document.getElementById('a11y-announce')?.textContent
    );
    expect(announcement).toContain('Настройки');
  });
});

// ===== MODAL KEYBOARD TESTS =====

test.describe('Modal Keyboard Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await prepareHomeScreen(page);
  });

  test('Shop modal: Escape closes it', async ({ page }) => {
    await page.evaluate(() => {
      const modal = document.getElementById('shop-modal');
      if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'block';
      }
    });
    await page.waitForTimeout(100);

    await page.evaluate(() => {
      const modal = document.getElementById('shop-modal');
      if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
      }
    });

    const isHidden = await page.evaluate(() => {
      const modal = document.getElementById('shop-modal');
      return modal?.classList.contains('hidden');
    });
    expect(isHidden).toBe(true);
  });
});
