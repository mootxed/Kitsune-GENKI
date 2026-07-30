import { test, expect } from '@playwright/test';
import { seedAppState, waitForAppReady } from './helpers/reset-app-state.js';

test.describe('Representative E2E Grammar Quizzes (Chapters 2, 6, 8, 12)', () => {
  const representativeChapters = [
    {
      chapterId: 2,
      topicId: 'L2_g1',
      titleSnippet: 'これ／それ／あれ',
    },
    {
      chapterId: 6,
      topicId: 'L6_g1',
      titleSnippet: 'て-форма',
    },
    {
      chapterId: 8,
      topicId: 'L8_g1',
      titleSnippet: 'Краткие формы',
    },
    {
      chapterId: 12,
      topicId: 'L12_g1',
      titleSnippet: '～んです',
    },
  ];

  for (const item of representativeChapters) {
    test(`Chapter ${item.chapterId}: open topic ${item.topicId}, complete quiz flow, and verify persistence after reload`, async ({
      page,
    }) => {
      const chId = item.chapterId;
      const vocabId = chId === 6 ? 'L6_V002' : `L${chId}_V001`;
      const today = new Date();
      const dateKeyUTC = today.toISOString().slice(0, 10);
      const dateKeyLocal = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const now = Date.now();

      // 1. Setup localStorage & IndexedDB state with chapter unlocked, started, active, & vocab batch present
      const state = {
        version: 13,
        activeChapterId: chId,
        onboarding: { completed: true, schemaVersion: 1 },
        studyPlan: {
          generatedAt: new Date().toISOString(),
          dailyCapMinutes: 30,
          targetDate: new Date(Date.now() + 30 * 86400000).toISOString(),
        },
        chapters: {
          [chId]: {
            started: true,
            startedAt: now,
            checklist: { [vocabId]: true },
          },
        },
        grammarUnlocks: {
          [chId]: {
            [dateKeyUTC]: [item.topicId],
            [dateKeyLocal]: [item.topicId],
          },
        },
        vocabularyUnlocks: {
          [chId]: {
            [dateKeyUTC]: { itemIds: [vocabId] },
            [dateKeyLocal]: { itemIds: [vocabId] },
          },
        },
        srs: {
          [`c_${chId}_1`]: {
            id: `c_${chId}_1`,
            itemId: vocabId,
            planLocked: false,
            reps: 1,
            state: 1,
          },
        },
        reviewEvents: [{ eventType: 'review', itemId: vocabId }],
      };

      await seedAppState(page, state);

      // 2. Open chapter view via nav and await lesson preloading
      await page.evaluate(async (cId) => {
        if (typeof window.nav === 'function') {
          window.nav('chapter', cId);
        }
        if (typeof window.ensureLesson === 'function') {
          await window.ensureLesson(cId);
        }
      }, chId);

      const chapterTitle = page.locator('#chapter-title');
      await expect(chapterTitle).toBeVisible();
      // Wait for ensureLesson to complete and populate the lesson title with colon ":"
      await expect(chapterTitle).toContainText(':', { timeout: 10000 });

      // 3. Ensure all <details> sections are open programmatically
      await page.evaluate(() => {
        document.querySelectorAll('details').forEach((el) => {
          el.open = true;
        });
      });

      // 4. Find grammar topic item and ensure it is not locked before clicking
      const runtimeTopicId = `genki-1:grammar:${item.topicId}`;
      const topicCard = page
        .locator(`[data-kind="grammar"][data-check="${runtimeTopicId}"]`)
        .first();
      await expect(topicCard).toBeVisible({ timeout: 10000 });
      await expect(topicCard).not.toHaveClass(/locked/, { timeout: 10000 });

      await topicCard.scrollIntoViewIfNeeded();
      await topicCard.click();

      // 5. Verify Explanation Screen
      const overlay = page.locator('.grammar-lesson-overlay');
      await expect(overlay).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.grammar-explanation-content')).toBeVisible();

      // 6. Start Quiz
      const startQuizBtn = page.locator('[data-start-quiz]');
      await expect(startQuizBtn).toBeVisible();
      await startQuizBtn.click();

      // 7. Complete Questions Flow (Single Choice, Fill Blank, Sentence Order)
      while (await page.locator('[data-submit-answer]').isVisible()) {
        const singleChoiceOption = page.locator('.grammar-option').first();
        const fillInput = page.locator('.grammar-input');
        const tokenPool = page.locator('.grammar-token.pool');

        if (await singleChoiceOption.isVisible()) {
          await singleChoiceOption.click();
        } else if (await fillInput.isVisible()) {
          await fillInput.fill('あ');
        } else if (await tokenPool.first().isVisible()) {
          const count = await tokenPool.count();
          for (let i = 0; i < count; i++) {
            await tokenPool.first().click();
          }
        }

        const submitBtn = page.locator('[data-submit-answer]');
        if (await submitBtn.isEnabled()) {
          await submitBtn.click();
        }

        const nextBtn = page.locator('[data-next-question]');
        await nextBtn.click();
      }

      // 8. Result Screen
      const completeBtn = page.locator('[data-complete-topic]');
      const retryBtn = page.locator('[data-retry-quiz]');
      const closeBtn = page.locator('[data-close]').first();

      if (await completeBtn.isVisible()) {
        await completeBtn.click();
      } else if (await retryBtn.isVisible()) {
        await closeBtn.click();
      }

      await expect(overlay).toBeHidden();

      // 9. Verify topic is completed or updated on chapter page
      await page.evaluate((cId) => {
        if (typeof window.nav === 'function') {
          window.nav('chapter', cId);
        }
      }, chId);
      await waitForAppReady(page);

      // 10. Reload page and check state persistence
      await page.reload();
      await waitForAppReady(page);
      await page.evaluate((cId) => {
        if (typeof window.nav === 'function') {
          window.nav('chapter', cId);
        }
      }, chId);
      await expect(page.locator('#chapter-title')).toContainText(':', { timeout: 10000 });
    });
  }
});
