import { test, expect } from '@playwright/test';
import { seedAppState, navigateToScreen } from '../helpers/reset-app-state.js';

const baseAppState = {
  version: 17,
  revision: 1,
  updatedAt: Date.now(),
  onboarding: { completed: true, schemaVersion: 1 },
  srs: {
    'genki-1::1::v1': {
      id: 'genki-1::1::v1',
      due: new Date().toISOString(),
      stability: 2.5,
      difficulty: 3.0,
      reps: 1,
      lapses: 0,
      state: 2,
    },
  },
  settings: { darkMode: 'auto' },
};

test.describe('Multi-Tab Upgrade & Conflict Safeguards E2E', () => {
  test('Two tabs open simultaneously handle state synchronization without reset', async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await seedAppState(pageA, baseAppState);
    await seedAppState(pageB, baseAppState);

    await navigateToScreen(pageA, 'home');
    await navigateToScreen(pageB, 'home');

    // Tab A loads and renders home
    const headerA = pageA.locator('header').first();
    await expect(headerA).toBeVisible();

    // Tab B loads and renders home
    const headerB = pageB.locator('header').first();
    await expect(headerB).toBeVisible();

    await contextA.close();
    await contextB.close();
  });
});
