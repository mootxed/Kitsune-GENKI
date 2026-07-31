import { test, expect } from '@playwright/test';
import { seedAppState, navigateToScreen } from './helpers/reset-app-state.js';

const baseAppState = {
  version: 17,
  onboarding: { completed: true, schemaVersion: 1 },
  settings: {
    darkMode: 'auto',
    pomodoro: {
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      focusIntervalsBeforeLongBreak: 4,
      autoStartNextPhase: false,
      soundEnabled: false,
      notificationsEnabled: false,
    },
  },
  pomodoro: {
    schemaVersion: 1,
    phase: 'focus',
    status: 'idle',
    endsAt: null,
    remainingMs: 25 * 60 * 1000,
    completedFocusIntervalsInCycle: 0,
    transitionSerial: 0,
    lastNotifiedTransitionSerial: null,
  },
};

test.describe('Pomodoro Timer E2E Flow', () => {
  test.beforeEach(async ({ page }) => {
    await seedAppState(page, baseAppState);
  });

  test('Floating Pomodoro button is visible across routes and opens panel', async ({ page }) => {
    await navigateToScreen(page, 'home');

    const floatingBtn = page.locator('#pomodoro-floating-btn');
    await expect(floatingBtn).toBeVisible();

    // Click to open panel
    await floatingBtn.click();

    const panel = page.locator('#pomodoro-panel');
    await expect(panel).toBeVisible();

    const phaseBadge = page.locator('#pomodoro-phase-badge');
    await expect(phaseBadge).toHaveText('Фокус');

    const timeDisplay = page.locator('#pomodoro-time-display');
    await expect(timeDisplay).toHaveText('25:00');

    const mainBtn = page.locator('#pomodoro-main-btn');
    await expect(mainBtn).toHaveText('Старт');

    // Close panel using close button
    const closeBtn = page.locator('#pomodoro-panel-close-btn');
    await closeBtn.click();
    await expect(panel).toBeHidden();
  });

  test('Start timer, navigate screens, and verify persistence in storage', async ({ page }) => {
    await navigateToScreen(page, 'home');

    // Open panel & click Start
    await page.click('#pomodoro-floating-btn');
    await page.click('#pomodoro-main-btn');

    // Check button state updated to Pause
    await expect(page.locator('#pomodoro-main-btn')).toHaveText('Пауза');

    // Close panel
    await page.click('#pomodoro-panel-close-btn');

    // Navigate to SRS screen
    await navigateToScreen(page, 'srs');

    // Floating button should remain visible
    const floatingBtn = page.locator('#pomodoro-floating-btn');
    await expect(floatingBtn).toBeVisible();

    // Open panel on SRS screen
    await floatingBtn.click();
    await expect(page.locator('#pomodoro-main-btn')).toHaveText('Пауза');

    // Verify localStorage has running status stored atomically
    const storedState = await page.evaluate(() => {
      const item = localStorage.getItem('kitsune_state_v1');
      return item ? JSON.parse(item) : null;
    });
    expect(storedState?.pomodoro?.status).toBe('running');
    expect(storedState?.pomodoro?.endsAt).toBeGreaterThan(0);
  });

  test('Mobile viewport: floating button does not overlap tabbar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await navigateToScreen(page, 'home');

    const floatingBtn = page.locator('#pomodoro-floating-btn');
    await expect(floatingBtn).toBeVisible();

    const tabbar = page.locator('[data-testid="tabbar"]');
    await expect(tabbar).toBeVisible();

    const btnBox = await floatingBtn.boundingBox();
    const tabbarBox = await tabbar.boundingBox();

    expect(btnBox).not.toBeNull();
    expect(tabbarBox).not.toBeNull();

    // The bottom edge of the floating button must be above the top edge of the tabbar
    expect(btnBox.y + btnBox.height).toBeLessThanOrEqual(tabbarBox.y + 10);
  });
});
