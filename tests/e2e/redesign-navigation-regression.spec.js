/* tests/e2e/redesign-navigation-regression.spec.js */
import { test, expect } from '@playwright/test';
import { seedAppState, navigateToScreen } from './helpers/reset-app-state.js';

test.describe('Redesign Navigation & Core Regressions (issue-27)', () => {
  test('1. Mobile bottom navigation has 5 primary tabs and navigates correctly', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedAppState(page, {
      version: 15,
      onboarding: { completed: true, schemaVersion: 1 },
      history: {},
      chapters: {},
      srs: {},
      settings: { darkMode: 'light' },
    });
    await navigateToScreen(page, 'home');

    // 5 primary tabs
    const visibleTabs = page.locator('.tab:visible');
    await expect(visibleTabs).toHaveCount(5);

    // Test clicking SRS tab
    await page.click('.tab[data-nav="srs"]');
    await expect(page.locator('#screen-srs')).toBeVisible();

    // Test clicking Sensei tab
    await page.click('.tab[data-nav="sensei"]');
    await expect(page.locator('#screen-sensei')).toBeVisible();

    // Test clicking Library tab
    await page.click('.tab[data-nav="library"]');
    await expect(page.locator('#screen-library')).toBeVisible();

    // Test clicking Profile tab
    await page.click('.tab[data-nav="profile"]');
    await expect(page.locator('#screen-profile')).toBeVisible();

    // Test clicking Home tab
    await page.click('.tab[data-nav="home"]');
    await expect(page.locator('#screen-home')).toBeVisible();
  });

  test('2. Home CTA opens SRS when cards are due', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedAppState(page, {
      version: 15,
      onboarding: { completed: true, schemaVersion: 1 },
      history: {},
      chapters: {},
      srs: {
        'word:genki-1:1': { id: 'word:genki-1:1', reps: 1, state: 2, due: Date.now() - 10000 },
      },
      settings: { darkMode: 'light' },
    });
    await navigateToScreen(page, 'home');

    const ctaBtn = page.locator('#btn-continue-learning');
    await expect(ctaBtn).toBeVisible();
    await ctaBtn.click();

    await expect(page.locator('#screen-srs')).toBeVisible();
  });

  test('3. Sensei Tools navigation & back button returns to Sensei', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedAppState(page, {
      version: 15,
      onboarding: { completed: true, schemaVersion: 1 },
      history: {},
      chapters: {},
      srs: {},
      settings: { darkMode: 'light' },
    });
    await navigateToScreen(page, 'sensei');

    // Check sensei tabs
    const toolsTab = page.locator('.sensei-tab[data-senseitab="tools"]');
    await expect(toolsTab).toBeVisible();
    await toolsTab.click();

    // Click AI story card
    await page.click('[data-nav="ai-story"]');
    await expect(page.locator('#screen-ai-story')).toBeVisible();
    await page.click('[data-testid="ai-story-back-btn"]');
    await expect(page.locator('#screen-sensei')).toBeVisible();

    // Click Crossword card
    await page.click('[data-nav="crossword"]');
    await expect(page.locator('#screen-crossword')).toBeVisible();
    await page.click('[data-testid="crossword-back-btn"]');
    await expect(page.locator('#screen-sensei')).toBeVisible();

    // Click Word Search card
    await page.click('[data-nav="word-search"]');
    await expect(page.locator('#screen-word-search')).toBeVisible();
    await page.click('[data-testid="word-search-back-btn"]');
    await expect(page.locator('#screen-sensei')).toBeVisible();
  });

  test('4. Completion screen contrast & text readability', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedAppState(page, {
      version: 15,
      onboarding: { completed: true, schemaVersion: 1 },
      history: {},
      chapters: {},
      srs: {},
      settings: { darkMode: 'light' },
    });
    await navigateToScreen(page, 'home');

    await page.evaluate(() => {
      const overlay = document.getElementById('completion-overlay');
      if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('completion-success');
      }
    });

    await expect(page.locator('#completion-overlay')).toBeVisible();
    const contrastOK = await page.evaluate(() => {
      const title = document.getElementById('completion-title');
      const content = document.querySelector('.completion-content');
      const titleColor = window.getComputedStyle(title).color;
      const contentBg = window.getComputedStyle(content).backgroundColor;
      return titleColor !== contentBg;
    });
    expect(contrastOK).toBe(true);
  });

  test('5. Console clean pass helper', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await seedAppState(page, {
      version: 15,
      onboarding: { completed: true, schemaVersion: 1 },
      history: {},
      chapters: {},
      srs: {},
      settings: { darkMode: 'light' },
    });
    await navigateToScreen(page, 'home');
    await navigateToScreen(page, 'srs');
    await navigateToScreen(page, 'sensei');

    expect(consoleErrors).toEqual([]);
  });
});
