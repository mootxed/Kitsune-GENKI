# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: grammar-lesson-mobile.spec.js >> E2E Grammar Lesson & Mobile Responsiveness >> Grammar quiz flow and no horizontal overflow at 360x800
- Location: tests/e2e/grammar-lesson-mobile.spec.js:13:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForSelector: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('#chapter-title') to be visible

```

# Page snapshot

```yaml
- generic [ref=e3]:
    - generic [ref=e4]:
        - navigation [ref=e5]:
            - link "Home" [ref=e6] [cursor=pointer]:
                - /url: /
            - link "Tutorial" [ref=e7] [cursor=pointer]:
                - /url: /tutorial
            - link "Workflows" [ref=e8] [cursor=pointer]:
                - /url: /workflows
            - link "Launch" [ref=e9] [cursor=pointer]:
                - /url: /launch
            - link "Labaratory" [ref=e10] [cursor=pointer]:
                - /url: /batch-run
        - button "Settings" [ref=e12] [cursor=pointer]
    - main [ref=e16]:
        - generic [ref=e18]:
            - heading "ChatDev 2.0 DevAll" [level=1] [ref=e19]:
                - generic [ref=e20]: ChatDev 2.0
                - generic [ref=e21]: DevAll
            - paragraph [ref=e22]: ChatDev 2.0 - DevAll is a zero-code multi-agent platform for developing everything, with a workspace built for designing, visualizing, and running agent workflows.
            - button "Get Started →" [ref=e24] [cursor=pointer]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   |
  3   | test.describe('E2E Grammar Lesson & Mobile Responsiveness', () => {
  4   |   const viewports = [
  5   |     { width: 320, height: 800 },
  6   |     { width: 360, height: 800 },
  7   |     { width: 390, height: 844 },
  8   |     { width: 422, height: 930 },
  9   |     { width: 1280, height: 800 },
  10  |   ];
  11  |
  12  |   for (const vp of viewports) {
  13  |     test(`Grammar quiz flow and no horizontal overflow at ${vp.width}x${vp.height}`, async ({
  14  |       page,
  15  |     }) => {
  16  |       await page.setViewportSize(vp);
  17  |
  18  |       // Open app and initialize state
  19  |       await page.goto('/');
  20  |       await page.evaluate(() => {
  21  |         localStorage.clear();
  22  |         sessionStorage.clear();
  23  |         // Initialize state with chapter 1 started and vocabulary introduced
  24  |         const state = {
  25  |           version: 13,
  26  |           chapters: {
  27  |             1: {
  28  |               started: true,
  29  |               checklist: {},
  30  |             },
  31  |           },
  32  |           grammarUnlocks: {
  33  |             1: {
  34  |               '2026-07-26': ['L1_g1', 'L1_g2', 'L1_g3', 'L1_g4', 'L1_g5'],
  35  |             },
  36  |           },
  37  |           srs: {
  38  |             c1: { id: 'c1', itemId: 'L1_V017', planLocked: false, reps: 1, state: 1 },
  39  |             c2: { id: 'c2', itemId: 'L1_V023', planLocked: false, reps: 1, state: 1 },
  40  |             c3: { id: 'c3', itemId: 'L1_V024', planLocked: false, reps: 1, state: 1 },
  41  |             c4: { id: 'c4', itemId: 'L1_V025', planLocked: false, reps: 1, state: 1 },
  42  |             c5: { id: 'c5', itemId: 'L1_V026', planLocked: false, reps: 1, state: 1 },
  43  |           },
  44  |           reviewEvents: [
  45  |             { eventType: 'review', itemId: 'L1_V017' },
  46  |             { eventType: 'review', itemId: 'L1_V023' },
  47  |             { eventType: 'review', itemId: 'L1_V024' },
  48  |             { eventType: 'review', itemId: 'L1_V025' },
  49  |             { eventType: 'review', itemId: 'L1_V026' },
  50  |           ],
  51  |         };
  52  |         localStorage.setItem('kitsune_genki_state', JSON.stringify(state));
  53  |       });
  54  |
  55  |       // Go to Chapter 1
  56  |       await page.goto('/#chapter/1');
> 57  |       await page.waitForSelector('#chapter-title');
      |                  ^ Error: page.waitForSelector: Test timeout of 30000ms exceeded.
  58  |
  59  |       // Click first grammar check card (L1_g1)
  60  |       const grammarCard = page.locator('[data-kind="grammar"][data-check="L1_g1"]');
  61  |       await expect(grammarCard).toBeVisible();
  62  |       await grammarCard.click();
  63  |
  64  |       // Check Explanation screen overlay visible
  65  |       const overlay = page.locator('.grammar-lesson-overlay');
  66  |       await expect(overlay).toBeVisible();
  67  |
  68  |       // Verify no horizontal overflow on explanation screen
  69  |       const overflowExp = await page.evaluate(
  70  |         () => document.documentElement.scrollWidth > window.innerWidth
  71  |       );
  72  |       expect(overflowExp).toBe(false);
  73  |
  74  |       // Click "Перейти к проверке"
  75  |       const startQuizBtn = page.locator('[data-start-quiz]');
  76  |       await expect(startQuizBtn).toBeVisible();
  77  |       await startQuizBtn.click();
  78  |
  79  |       // Question 1: single-choice
  80  |       const optionA = page.locator('.grammar-option').first();
  81  |       await optionA.click();
  82  |
  83  |       const submitBtn = page.locator('[data-submit-answer]');
  84  |       await submitBtn.click();
  85  |
  86  |       const nextBtn = page.locator('[data-next-question]');
  87  |       await nextBtn.click();
  88  |
  89  |       // Question 2: fill-blank
  90  |       const fillInput = page.locator('.grammar-input');
  91  |       await fillInput.fill('は');
  92  |       await submitBtn.click();
  93  |       await nextBtn.click();
  94  |
  95  |       // Question 3: sentence-order
  96  |       const tokens = page.locator('.grammar-token.pool');
  97  |       const count = await tokens.count();
  98  |       for (let i = 0; i < count; i++) {
  99  |         await tokens.first().click();
  100 |       }
  101 |       await submitBtn.click();
  102 |
  103 |       // Click "Посмотреть результат"
  104 |       const showResultBtn = page.locator('[data-next-question]');
  105 |       await showResultBtn.click();
  106 |
  107 |       // Result screen
  108 |       const scoreCircle = page.locator('.grammar-result-score');
  109 |       await expect(scoreCircle).toBeVisible();
  110 |
  111 |       // Verify no horizontal overflow on result screen
  112 |       const overflowResult = await page.evaluate(
  113 |         () => document.documentElement.scrollWidth > window.innerWidth
  114 |       );
  115 |       expect(overflowResult).toBe(false);
  116 |
  117 |       // Click "Завершить тему"
  118 |       const completeBtn = page.locator('[data-complete-topic]');
  119 |       await expect(completeBtn).toBeVisible();
  120 |       await completeBtn.click();
  121 |
  122 |       // Modal closed and returned to chapter
  123 |       await expect(overlay).toBeHidden();
  124 |     });
  125 |   }
  126 | });
  127 |
```
