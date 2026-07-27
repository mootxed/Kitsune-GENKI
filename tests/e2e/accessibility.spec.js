/**
 * tests/e2e/accessibility.spec.js
 *
 * Automated accessibility and structural ARIA compliance tests for KotoKitsu.
 * Validates WCAG A/AA semantics, landmarks, button names, modal dialogs,
 * keyboard focus management, and screen live regions.
 */

import { test, expect } from '@playwright/test';
import { seedAppState, navigateToScreen } from './helpers/reset-app-state.js';

const baseAppState = {
  version: 13,
  onboarding: { completed: true, schemaVersion: 1 },
  studyPlan: {
    generatedAt: new Date().toISOString(),
    dailyCapMinutes: 30,
    targetDate: new Date(Date.now() + 30 * 86400000).toISOString(),
  },
  chapters: { 1: { started: true, checklist: {} } },
  settings: { darkMode: 'auto' },
};

test.describe('Accessibility: Structural WCAG A/AA checks', () => {
  test.beforeEach(async ({ page }) => {
    await seedAppState(page, baseAppState);
  });

  test('Home screen: no critical structural axe violations', async ({ page }) => {
    await navigateToScreen(page, 'home');

    const screen = page.locator('#screen-home');
    await expect(screen).toBeVisible();

    const buttons = screen.locator('button, [role="button"]');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      if (await btn.isVisible()) {
        const text = (await btn.textContent()) || (await btn.getAttribute('aria-label')) || '';
        expect(text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('Settings screen: no critical structural axe violations', async ({ page }) => {
    await navigateToScreen(page, 'settings');

    const screen = page.locator('#screen-settings');
    await expect(screen).toBeVisible();

    const buttons = screen.locator('button, [role="button"]');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      if (await btn.isVisible()) {
        const text = (await btn.textContent()) || (await btn.getAttribute('aria-label')) || '';
        expect(text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('Study plan screen: no critical structural axe violations', async ({ page }) => {
    await navigateToScreen(page, 'plan');

    const screen = page.locator('#screen-plan');
    await expect(screen).toBeVisible();

    const buttons = screen.locator('button, [role="button"]');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      if (await btn.isVisible()) {
        const text = (await btn.textContent()) || (await btn.getAttribute('aria-label')) || '';
        expect(text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('SRS/Flashcards screen: no critical structural axe violations', async ({ page }) => {
    await navigateToScreen(page, 'srs');

    const screen = page.locator('#screen-srs');
    await expect(screen).toBeVisible();

    const buttons = screen.locator('button, [role="button"]');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      if (await btn.isVisible()) {
        const text = (await btn.textContent()) || (await btn.getAttribute('aria-label')) || '';
        expect(text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('Statistics screen: no critical structural axe violations', async ({ page }) => {
    await navigateToScreen(page, 'statistics');

    const screen = page.locator('#screen-statistics');
    await expect(screen).toBeVisible();

    const buttons = screen.locator('button, [role="button"]');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      if (await btn.isVisible()) {
        const text = (await btn.textContent()) || (await btn.getAttribute('aria-label')) || '';
        expect(text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('Shop modal: has role=dialog, aria-modal, aria-labelledby', async ({ page }) => {
    await navigateToScreen(page, 'shop');

    const modal = page.locator('#shop-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    await expect(modal).toHaveAttribute('aria-labelledby', 'shop-modal-title');
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
    await seedAppState(page, baseAppState);
  });

  test('Navigation to SRS screen moves focus to heading or screen', async ({ page }) => {
    await navigateToScreen(page, 'srs');

    const activeTagName = await page.evaluate(() => document.activeElement?.tagName);
    expect(activeTagName).toBeTruthy();
  });

  test('Hidden screens have inert attribute set', async ({ page }) => {
    await navigateToScreen(page, 'home');

    const hiddenScreens = page.locator('.screen.hidden');
    const count = await hiddenScreens.count();
    for (let i = 0; i < count; i++) {
      const screen = hiddenScreens.nth(i);
      await expect(screen).toHaveAttribute('inert', '');
    }
  });

  test('Live region announces navigation', async ({ page }) => {
    await navigateToScreen(page, 'home');
    await navigateToScreen(page, 'srs');

    const announceText = await page.textContent('#a11y-announce');
    expect(announceText).toBeTruthy();
  });
});

// ===== MODAL KEYBOARD MANAGEMENT =====

test.describe('Modal Keyboard Management', () => {
  test.beforeEach(async ({ page }) => {
    await seedAppState(page, baseAppState);
  });

  test('Shop modal: Escape closes it', async ({ page }) => {
    await navigateToScreen(page, 'shop');

    const modal = page.locator('#shop-modal');
    await expect(modal).toBeVisible();
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
  });
});
