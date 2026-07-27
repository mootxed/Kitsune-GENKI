import { test, expect } from '@playwright/test';

test.describe('E2E Grammar Lesson & Mobile Responsiveness', () => {
  const viewports = [
    { width: 320, height: 800 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 422, height: 930 },
    { width: 1280, height: 800 },
  ];

  for (const vp of viewports) {
    test(`Grammar quiz flow and no horizontal overflow at ${vp.width}x${vp.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);

      // Open app and initialize state
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
        // Initialize state with chapter 1 started and vocabulary introduced
        const state = {
          version: 13,
          chapters: {
            1: {
              started: true,
              checklist: {},
            },
          },
          grammarUnlocks: {
            1: {
              '2026-07-26': ['L1_g1', 'L1_g2', 'L1_g3', 'L1_g4', 'L1_g5'],
            },
          },
          srs: {
            c1: { id: 'c1', itemId: 'L1_V017', planLocked: false, reps: 1, state: 1 },
            c2: { id: 'c2', itemId: 'L1_V023', planLocked: false, reps: 1, state: 1 },
            c3: { id: 'c3', itemId: 'L1_V024', planLocked: false, reps: 1, state: 1 },
            c4: { id: 'c4', itemId: 'L1_V025', planLocked: false, reps: 1, state: 1 },
            c5: { id: 'c5', itemId: 'L1_V026', planLocked: false, reps: 1, state: 1 },
          },
          reviewEvents: [
            { eventType: 'review', itemId: 'L1_V017' },
            { eventType: 'review', itemId: 'L1_V023' },
            { eventType: 'review', itemId: 'L1_V024' },
            { eventType: 'review', itemId: 'L1_V025' },
            { eventType: 'review', itemId: 'L1_V026' },
          ],
        };
        localStorage.setItem('kitsune_state_v1', JSON.stringify(state));
      });

      // Go to Chapter 1
      await page.goto('/#chapter/1');
      await page.waitForSelector('#chapter-title');

      // Click first grammar check card (L1_g1)
      const grammarCard = page.locator('[data-kind="grammar"][data-check="L1_g1"]');
      await expect(grammarCard).toBeVisible();
      await grammarCard.click();

      // Check Explanation screen overlay visible
      const overlay = page.locator('.grammar-lesson-overlay');
      await expect(overlay).toBeVisible();

      // Verify no horizontal overflow on explanation screen
      const overflowExp = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(overflowExp).toBe(false);

      // Click "Перейти к проверке"
      const startQuizBtn = page.locator('[data-start-quiz]');
      await expect(startQuizBtn).toBeVisible();
      await startQuizBtn.click();

      // Question 1: single-choice
      const optionA = page.locator('.grammar-option').first();
      await optionA.click();

      const submitBtn = page.locator('[data-submit-answer]');
      await submitBtn.click();

      const nextBtn = page.locator('[data-next-question]');
      await nextBtn.click();

      // Question 2: fill-blank
      const fillInput = page.locator('.grammar-input');
      await fillInput.fill('は');
      await submitBtn.click();
      await nextBtn.click();

      // Question 3: sentence-order
      const tokens = page.locator('.grammar-token.pool');
      const count = await tokens.count();
      for (let i = 0; i < count; i++) {
        await tokens.first().click();
      }
      await submitBtn.click();

      // Click "Посмотреть результат"
      const showResultBtn = page.locator('[data-next-question]');
      await showResultBtn.click();

      // Result screen
      const scoreCircle = page.locator('.grammar-result-score');
      await expect(scoreCircle).toBeVisible();

      // Verify no horizontal overflow on result screen
      const overflowResult = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(overflowResult).toBe(false);

      // Click "Завершить тему"
      const completeBtn = page.locator('[data-complete-topic]');
      await expect(completeBtn).toBeVisible();
      await completeBtn.click();

      // Modal closed and returned to chapter
      await expect(overlay).toBeHidden();
    });
  }
});
