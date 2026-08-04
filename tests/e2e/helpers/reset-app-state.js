/**
 * tests/e2e/helpers/reset-app-state.js
 *
 * Clean, rock-solid helper functions for Playwright E2E state isolation,
 * teardown/setup, and onboarding completion.
 */

import { expect } from '@playwright/test';

/**
 * Purges localStorage, sessionStorage, and cookies.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function resetAppState(page) {
  try {
    await page.context().clearCookies();
  } catch {
    /* ignore cookie clearing error */
  }

  await page.addInitScript(() => {
    window.onbeforeunload = null;
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore storage clearing error */
    }
  });

  await page.goto('/');
  await waitForAppReady(page);
}

/**
 * Seeds the application with a specific state object in localStorage
 * via addInitScript before top-level navigation, ensuring atomic hydration.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} stateObject
 */
export async function seedAppState(page, stateObject) {
  try {
    await page.context().clearCookies();
  } catch {
    /* ignore cookie clearing error */
  }

  const seededState = {
    updatedAt: Date.now() + 10000,
    ...stateObject,
  };

  await page.addInitScript((state) => {
    window.onbeforeunload = null;
    try {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('kitsune_state_v1', JSON.stringify(state));
    } catch {
      /* ignore storage seeding error */
    }
  }, seededState);

  await page.goto('/');
  await waitForAppReady(page);
}

/**
 * Waits for the core application to hydrate, finish loading assets,
 * and present a non-hidden screen.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function waitForAppReady(page) {
  await page.waitForLoadState('domcontentloaded');

  // Wait for loading overlay to hide
  const loader = page.locator('#app-loader');
  if ((await loader.count()) > 0) {
    await expect(loader.first())
      .toBeHidden({ timeout: 10000 })
      .catch(() => {});
  }

  // Wait for at least one active screen
  await expect(page.locator('.screen:not(.hidden)').first()).toBeVisible({ timeout: 10000 });
}

/**
 * Programmatically navigate to a specific app screen via window.nav or fallback hash.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} screenId (e.g. 'home', 'settings', 'plan', 'srs', 'statistics', 'shop')
 */
export async function navigateToScreen(page, screenId) {
  if (screenId === 'shop') {
    await page.evaluate(() => {
      const btn = document.querySelector('[data-nav="shop"]');
      if (btn) {
        btn.click();
      } else {
        const modal = document.querySelector('#shop-modal');
        if (modal) modal.classList.remove('hidden');
      }
    });
    await expect(page.locator('#shop-modal')).toBeVisible({ timeout: 10000 });
    return;
  }

  await page.evaluate((target) => {
    if (typeof window.nav === 'function') {
      window.nav(target);
    } else {
      window.location.hash = `#${target}`;
    }
  }, screenId);

  const srsTabs = [
    'dictionary',
    'user-dictionaries',
    'particles',
    'repetition',
    'stats',
    'kanji',
    'srs',
  ];
  const targetScreenId = srsTabs.includes(screenId) ? 'srs' : screenId;
  await expect(page.locator(`#screen-${targetScreenId}`)).toBeVisible({ timeout: 10000 });
}

/**
 * Completes onboarding or seeds a valid completed onboarding state.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function completeOnboarding(page) {
  const completedState = {
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

  await seedAppState(page, completedState);
}
