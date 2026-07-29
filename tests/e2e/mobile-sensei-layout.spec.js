import { test, expect } from '@playwright/test';
import { seedAppState, navigateToScreen } from './helpers/reset-app-state.js';

test.describe('AI Sensei Mobile Layout & Responsiveness', () => {
  const viewports = [
    { width: 320, height: 568 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 422, height: 930 },
    { width: 1280, height: 800 },
  ];

  for (const vp of viewports) {
    test(`Sensei UI renders without horizontal overflow at ${vp.width}x${vp.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);

      const state = {
        version: 13,
        onboarding: { completed: true, schemaVersion: 1 },
        settings: {
          openrouterKey: 'sk-or-v1-1234567890123456789012345678901234567890',
          aiPrivacyAccepted: true,
        },
        chatHistory: [],
      };

      await seedAppState(page, state);
      await navigateToScreen(page, 'sensei');

      // Verify basic components exist and are visible
      await expect(page.locator('.sensei-header')).toBeVisible();
      await expect(page.locator('.sensei-tabs')).toBeVisible();
      await expect(page.locator('.sensei-composer')).toBeVisible();
      await expect(page.locator('#chat-input')).toBeVisible();
      await expect(page.locator('#chat-send')).toBeVisible();
      await expect(page.locator('#sensei-menu-trigger')).toBeVisible();

      // Measure horizontal overflow
      const isOverflowing = await page.evaluate(() => {
        const root = document.documentElement;
        const screen = document.getElementById('screen-sensei');
        return (
          root.scrollWidth > root.clientWidth ||
          (screen ? screen.scrollWidth > screen.clientWidth : false)
        );
      });
      expect(isOverflowing).toBe(false);

      // Verify popover menu opens and closes cleanly
      await page.locator('#sensei-menu-trigger').click();
      await expect(page.locator('#sensei-popover-menu')).toBeVisible();

      // Select explicit action "explain_grammar"
      await page.selectOption('#sensei-action-menu', 'explain_grammar');
      await expect(page.locator('.sensei-chip[data-chip-type="intent"]')).toBeVisible();
      await expect(page.locator('.sensei-chip[data-chip-type="intent"]')).toContainText(
        'Грамматика'
      );

      // Close popover menu
      await page.locator('#sensei-popover-close').click();
      await expect(page.locator('#sensei-popover-menu')).toBeHidden();

      // Clear chip
      await page.locator('[data-remove-chip="intent"]').click();
      await expect(page.locator('.sensei-chip[data-chip-type="intent"]')).toBeHidden();
    });
  }
});
