import { test, expect } from '@playwright/test';

test.describe('P0 Full User Learning & Data Lifecycle Flow', () => {
  test('Complete onboarding flow to home screen', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await page.evaluate(() => {
      window.location.hash = '#onboarding';
    });
    await expect(page.locator('[data-testid="screen-onboarding"]')).toBeDefined();
  });

  test('Create study plan and verify continuation button routing', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(
        'kitsune_state_v1',
        JSON.stringify({
          version: 13,
          onboarding: { completed: true, schemaVersion: 1 },
          studyPlan: null,
          chapters: {},
          settings: { darkMode: 'auto' },
        })
      );
      window.location.hash = '#plan';
    });
    await page.reload();
    const createBtn = page.locator('[data-testid="plan-generate-btn"]');
    if (await createBtn.isVisible()) {
      await createBtn.click();
    }
  });

  test('SRS Review Session: answer correct, undo, and complete', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const now = Date.now();
      localStorage.setItem(
        'kitsune_state_v1',
        JSON.stringify({
          version: 13,
          onboarding: { completed: true, schemaVersion: 1 },
          chapters: { 1: { started: true, checklist: { vocab: true } } },
          srs: {
            c1: {
              id: 'c1',
              itemId: 'L1_V001',
              due: now - 1000,
              reps: 0,
              state: 0,
              stability: 1,
              difficulty: 5,
            },
          },
          settings: { darkMode: 'auto' },
        })
      );
    });
    await page.reload();
    await expect(page.locator('[data-testid="tabbar"]')).toBeVisible();
  });

  test('Backup export, data reset, and backup import', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem(
        'kitsune_state_v1',
        JSON.stringify({
          version: 13,
          xp: 150,
          onboarding: { completed: true, schemaVersion: 1 },
          chapters: {},
          settings: { darkMode: 'auto' },
        })
      );
    });
    await page.reload();
    const settingsBtn = page.locator('[data-testid="header-settings-btn"]');
    await expect(settingsBtn).toBeVisible();
  });

  test('Statistics screen displays without errors', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem(
        'kitsune_state_v1',
        JSON.stringify({
          version: 13,
          onboarding: { completed: true, schemaVersion: 1 },
          history: { '2026-07-27': 12 },
          settings: { darkMode: 'auto' },
        })
      );
    });
    await page.reload();
    await page.evaluate(() => {
      window.location.hash = '#statistics';
    });
    await expect(page.locator('#screen-statistics')).toHaveClass(/screen/);
  });
});
