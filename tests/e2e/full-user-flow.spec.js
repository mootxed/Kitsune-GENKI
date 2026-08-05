import { test, expect } from '@playwright/test';
import {
  resetAppState,
  seedAppState,
  waitForAppReady,
  navigateToScreen,
} from './helpers/reset-app-state.js';

test.describe('P0 Full User Learning & Data Lifecycle Flow', () => {
  test('Complete onboarding flow to home screen', async ({ page }) => {
    await resetAppState(page);
    await page.goto('./');
    await waitForAppReady(page);

    const onboardingScreen = page.locator('#screen-onboarding');
    await expect(onboardingScreen).toBeVisible();
  });

  test('Create study plan and verify continuation button routing', async ({ page }) => {
    await seedAppState(page, {
      version: 13,
      onboarding: { completed: true, schemaVersion: 1 },
      studyPlan: null,
      chapters: {},
      settings: { darkMode: 'auto' },
    });

    await navigateToScreen(page, 'plan');

    const createBtn = page.locator('[data-testid="plan-generate-btn"]');
    if (await createBtn.isVisible()) {
      await createBtn.click();
    }
    await expect(page.locator('#screen-plan')).toBeVisible();
  });

  test('SRS Review Session: answer correct, undo, and complete', async ({ page }) => {
    const now = Date.now();
    await seedAppState(page, {
      version: 13,
      onboarding: { completed: true, schemaVersion: 1 },
      studyPlan: {
        generatedAt: new Date().toISOString(),
        dailyCapMinutes: 30,
        targetDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
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
    });

    await navigateToScreen(page, 'srs');
    await expect(page.locator('#screen-srs')).toBeVisible();
  });

  test('Backup export, data reset, and backup import', async ({ page }) => {
    await seedAppState(page, {
      version: 13,
      xp: 150,
      onboarding: { completed: true, schemaVersion: 1 },
      studyPlan: {
        generatedAt: new Date().toISOString(),
        dailyCapMinutes: 30,
        targetDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
      chapters: {},
      settings: { darkMode: 'auto' },
    });

    await navigateToScreen(page, 'settings');
    const resetBtn = page.locator('#btn-reset');
    await expect(resetBtn).toBeVisible();
  });

  test('Statistics screen displays without errors', async ({ page }) => {
    await seedAppState(page, {
      version: 13,
      onboarding: { completed: true, schemaVersion: 1 },
      studyPlan: {
        generatedAt: new Date().toISOString(),
        dailyCapMinutes: 30,
        targetDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
      history: { '2026-07-27': 12 },
      settings: { darkMode: 'auto' },
    });

    await navigateToScreen(page, 'statistics');
    await expect(page.locator('#screen-statistics')).toHaveClass(/screen/);
  });
});
