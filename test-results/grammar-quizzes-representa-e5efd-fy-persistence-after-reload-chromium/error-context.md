# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: grammar-quizzes-representative.spec.js >> Representative E2E Grammar Quizzes (Chapters 2, 6, 8, 12) >> Chapter 8: open topic L8_g1, complete quiz flow, and verify persistence after reload
- Location: tests/e2e/grammar-quizzes-representative.spec.js:28:5

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#chapter-title')
Expected substring: "Глава 8"
Received string:    "Глава"
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('#chapter-title')
    14 × locator resolved to <h1 class="app-title" id="chapter-title">Глава</h1>
       - unexpected value "Глава"

```

```yaml
- heading "Глава" [level=1]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test.describe('Representative E2E Grammar Quizzes (Chapters 2, 6, 8, 12)', () => {
  4   |   const representativeChapters = [
  5   |     {
  6   |       chapterId: 2,
  7   |       topicId: 'L2_g1',
  8   |       titleSnippet: 'これ／それ／あれ',
  9   |     },
  10  |     {
  11  |       chapterId: 6,
  12  |       topicId: 'L6_g1',
  13  |       titleSnippet: 'て-форма',
  14  |     },
  15  |     {
  16  |       chapterId: 8,
  17  |       topicId: 'L8_g1',
  18  |       titleSnippet: 'Краткие формы',
  19  |     },
  20  |     {
  21  |       chapterId: 12,
  22  |       topicId: 'L12_g1',
  23  |       titleSnippet: '～んです',
  24  |     },
  25  |   ];
  26  | 
  27  |   for (const item of representativeChapters) {
  28  |     test(`Chapter ${item.chapterId}: open topic ${item.topicId}, complete quiz flow, and verify persistence after reload`, async ({
  29  |       page,
  30  |     }) => {
  31  |       // 1. Setup localStorage state with chapter unlocked & started
  32  |       await page.goto('/');
  33  |       await page.evaluate(
  34  |         ({ chId, topId }) => {
  35  |           localStorage.clear();
  36  |           sessionStorage.clear();
  37  | 
  38  |           const state = {
  39  |             version: 13,
  40  |             chapters: {
  41  |               [chId]: {
  42  |                 started: true,
  43  |                 checklist: {},
  44  |               },
  45  |             },
  46  |             grammarUnlocks: {
  47  |               [chId]: {
  48  |                 '2026-07-26': [topId],
  49  |               },
  50  |             },
  51  |             vocabularyUnlocks: {
  52  |               [chId]: {
  53  |                 '2026-07-26': { itemIds: ['L1_V001'] },
  54  |               },
  55  |             },
  56  |             srs: {},
  57  |             reviewEvents: [],
  58  |           };
  59  |           localStorage.setItem('kitsune_genki_state', JSON.stringify(state));
  60  |         },
  61  |         { chId: item.chapterId, topId: item.topicId }
  62  |       );
  63  | 
  64  |       // 2. Open chapter view
  65  |       await page.goto(`/#chapter/${item.chapterId}`);
  66  |       await page.waitForSelector('#chapter-title');
> 67  |       await expect(page.locator('#chapter-title')).toContainText(`Глава ${item.chapterId}`);
      |                                                    ^ Error: expect(locator).toContainText(expected) failed
  68  | 
  69  |       // 3. Find and click the grammar topic item
  70  |       const topicCard = page.locator(`[data-kind="grammar"][data-check="${item.topicId}"]`);
  71  |       await expect(topicCard).toBeVisible();
  72  |       await topicCard.click();
  73  | 
  74  |       // 4. Verify Explanation Screen
  75  |       const overlay = page.locator('.grammar-lesson-overlay');
  76  |       await expect(overlay).toBeVisible();
  77  |       await expect(page.locator('.grammar-explanation-content')).toBeVisible();
  78  | 
  79  |       // 5. Start Quiz
  80  |       const startQuizBtn = page.locator('[data-start-quiz]');
  81  |       await expect(startQuizBtn).toBeVisible();
  82  |       await startQuizBtn.click();
  83  | 
  84  |       // 6. Complete Questions Flow (Single Choice, Fill Blank, Sentence Order)
  85  |       // Loop through all questions in quiz until result screen
  86  |       while (await page.locator('[data-submit-answer]').isVisible()) {
  87  |         const singleChoiceOption = page.locator('.grammar-option').first();
  88  |         const fillInput = page.locator('.grammar-input');
  89  |         const tokenPool = page.locator('.grammar-token.pool');
  90  | 
  91  |         if (await singleChoiceOption.isVisible()) {
  92  |           await singleChoiceOption.click();
  93  |         } else if (await fillInput.isVisible()) {
  94  |           await fillInput.fill('あ');
  95  |         } else if (await tokenPool.first().isVisible()) {
  96  |           const count = await tokenPool.count();
  97  |           for (let i = 0; i < count; i++) {
  98  |             await tokenPool.first().click();
  99  |           }
  100 |         }
  101 | 
  102 |         const submitBtn = page.locator('[data-submit-answer]');
  103 |         if (await submitBtn.isEnabled()) {
  104 |           await submitBtn.click();
  105 |         }
  106 | 
  107 |         const nextBtn = page.locator('[data-next-question]');
  108 |         await nextBtn.click();
  109 |       }
  110 | 
  111 |       // 7. Result Screen
  112 |       const completeBtn = page.locator('[data-complete-topic]');
  113 |       const retryBtn = page.locator('[data-retry-quiz]');
  114 |       const closeBtn = page.locator('[data-close]').first();
  115 | 
  116 |       if (await completeBtn.isVisible()) {
  117 |         await completeBtn.click();
  118 |       } else if (await retryBtn.isVisible()) {
  119 |         await closeBtn.click();
  120 |       }
  121 | 
  122 |       await expect(overlay).toBeHidden();
  123 | 
  124 |       // 8. Verify topic is completed or updated on chapter page
  125 |       await page.goto(`/#chapter/${item.chapterId}`);
  126 |       await page.waitForSelector('#chapter-title');
  127 | 
  128 |       // 9. Reload page and check state persistence
  129 |       await page.reload();
  130 |       await page.waitForSelector('#chapter-title');
  131 |       await expect(page.locator('#chapter-title')).toContainText(`Глава ${item.chapterId}`);
  132 |     });
  133 |   }
  134 | });
  135 | 
```