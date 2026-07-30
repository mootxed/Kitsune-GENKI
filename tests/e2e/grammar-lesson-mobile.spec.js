import { test, expect } from '@playwright/test';
import { seedAppState } from './helpers/reset-app-state.js';

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
      const today = new Date();
      const dateKeyUTC = today.toISOString().slice(0, 10);
      const dateKeyLocal = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const now = Date.now();

      // Setup state with chapter 1 started and vocabulary batch unlocked
      const state = {
        version: 13,
        activeChapterId: 1,
        onboarding: { completed: true, schemaVersion: 1 },
        studyPlan: {
          generatedAt: new Date().toISOString(),
          dailyCapMinutes: 30,
          targetDate: new Date(Date.now() + 30 * 86400000).toISOString(),
        },
        chapters: {
          1: {
            started: true,
            startedAt: now,
            checklist: {
              L1_V017: true,
              L1_V023: true,
              L1_V024: true,
              L1_V025: true,
              L1_V026: true,
            },
          },
        },
        grammarUnlocks: {
          1: {
            [dateKeyUTC]: ['L1_g1', 'L1_g2', 'L1_g3', 'L1_g4', 'L1_g5'],
            [dateKeyLocal]: ['L1_g1', 'L1_g2', 'L1_g3', 'L1_g4', 'L1_g5'],
          },
        },
        vocabularyUnlocks: {
          1: {
            [dateKeyUTC]: { itemIds: ['L1_V017', 'L1_V023', 'L1_V024', 'L1_V025', 'L1_V026'] },
            [dateKeyLocal]: { itemIds: ['L1_V017', 'L1_V023', 'L1_V024', 'L1_V025', 'L1_V026'] },
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

      await seedAppState(page, state);

      // Go to Chapter 1 screen via nav
      await page.evaluate(async () => {
        if (typeof window.nav === 'function') {
          window.nav('chapter', 1);
        }
        if (typeof window.ensureLesson === 'function') {
          await window.ensureLesson(1);
        }
      });
      await expect(page.locator('#screen-chapter')).toBeVisible();

      const chapterTitle = page.locator('#chapter-title');
      await expect(chapterTitle).toBeVisible();
      await expect(chapterTitle).toContainText(':', { timeout: 10000 });

      // Ensure details are open programmatically
      await page.evaluate(() => {
        document.querySelectorAll('details').forEach((el) => {
          el.open = true;
        });
      });

      // CourseLoader exposes the local L1_g1 topic as a namespaced runtime ID.
      const grammarCard = page
        .locator('[data-kind="grammar"][data-check="genki-1:grammar:L1_g1"]')
        .first();
      await expect(grammarCard).toBeVisible({ timeout: 10000 });
      await expect(grammarCard).not.toHaveClass(/locked/, { timeout: 10000 });

      await grammarCard.scrollIntoViewIfNeeded();
      await grammarCard.click();

      // Check Explanation screen overlay visible
      const overlay = page.locator('.grammar-lesson-overlay');
      await expect(overlay).toBeVisible({ timeout: 10000 });

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
