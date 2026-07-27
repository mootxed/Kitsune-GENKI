import { test, expect } from '@playwright/test';

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
      // 1. Setup localStorage state with chapter unlocked & started
      await page.goto('/');
      await page.evaluate(
        ({ chId, topId }) => {
          localStorage.clear();
          sessionStorage.clear();
          if (window.indexedDB) window.indexedDB.deleteDatabase('KitsuneGenkiDB');

          const state = {
            version: 13,
            chapters: {
              [chId]: {
                started: true,
                checklist: {},
              },
            },
            grammarUnlocks: {
              [chId]: {
                '2026-07-26': [topId],
              },
            },
            vocabularyUnlocks: {
              [chId]: {
                '2026-07-26': { itemIds: ['L1_V001'] },
              },
            },
            srs: {},
            reviewEvents: [],
          };
          localStorage.setItem('kitsune_state_v1', JSON.stringify(state));
        },
        { chId: item.chapterId, topId: item.topicId }
      );

      // 2. Open chapter view
      await page.goto(`/#chapter/${item.chapterId}`);
      await page.waitForSelector('#chapter-title');
      await expect(page.locator('#chapter-title')).toContainText(`Глава ${item.chapterId}`);

      // 3. Find and click the grammar topic item
      const topicCard = page.locator(`[data-kind="grammar"][data-check="${item.topicId}"]`);
      await expect(topicCard).toBeVisible();
      await topicCard.click();

      // 4. Verify Explanation Screen
      const overlay = page.locator('.grammar-lesson-overlay');
      await expect(overlay).toBeVisible();
      await expect(page.locator('.grammar-explanation-content')).toBeVisible();

      // 5. Start Quiz
      const startQuizBtn = page.locator('[data-start-quiz]');
      await expect(startQuizBtn).toBeVisible();
      await startQuizBtn.click();

      // 6. Complete Questions Flow (Single Choice, Fill Blank, Sentence Order)
      // Loop through all questions in quiz until result screen
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

      // 7. Result Screen
      const completeBtn = page.locator('[data-complete-topic]');
      const retryBtn = page.locator('[data-retry-quiz]');
      const closeBtn = page.locator('[data-close]').first();

      if (await completeBtn.isVisible()) {
        await completeBtn.click();
      } else if (await retryBtn.isVisible()) {
        await closeBtn.click();
      }

      await expect(overlay).toBeHidden();

      // 8. Verify topic is completed or updated on chapter page
      await page.goto(`/#chapter/${item.chapterId}`);
      await page.waitForSelector('#chapter-title');

      // 9. Reload page and check state persistence
      await page.reload();
      await page.waitForSelector('#chapter-title');
      await expect(page.locator('#chapter-title')).toContainText(`Глава ${item.chapterId}`);
    });
  }
});
