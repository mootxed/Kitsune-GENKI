# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: onboarding-plan.spec.js >> E2E Onboarding & Chapter Flow >> Full E2E user flow: onboarding -> create plan -> chapter 1 check -> reset -> onboarding
- Location: tests/e2e/onboarding-plan.spec.js:4:3

# Error details

```
Error: expect(locator).toBeHidden() failed

Locator:  locator('#screen-onboarding')
Expected: hidden
Received: visible
Timeout:  5000ms

Call log:
  - Expect "toBeHidden" with timeout 5000ms
  - waiting for locator('#screen-onboarding')
    - locator resolved to <section class="screen" id="screen-onboarding" data-testid="screen-onboarding">…</section>
    13 × unexpected value "visible"
       - locator resolved to <section class="screen hidden" id="screen-onboarding" data-testid="screen-onboarding">…</section>
    - unexpected value "visible"

```

```yaml
- text: Шаг 7 из 7
- heading "Проверка Учебного Плана" [level=2]
- paragraph: Проверьте сводку вашего учебного плана перед его созданием.
- text: "Начало обучения:2026-07-27 Учебные дни:Пн, Вт, Ср, Чт, Пт, Сб, Вс Дневная нагрузка:30 минут Стартовая глава:Глава 1 Workbook:Включен (Разговор, Грамматика, Чтение, Письмо) Количество учебных дней:158 дней Примерное завершение: 2026-12-31"
- button "← Назад"
- button "Создать план ✨" [disabled]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('E2E Onboarding & Chapter Flow', () => {
  4  |   test('Full E2E user flow: onboarding -> create plan -> chapter 1 check -> reset -> onboarding', async ({
  5  |     page,
  6  |   }) => {
  7  |     // 1. Clear storage and open app
  8  |     await page.goto('/');
  9  |     await page.evaluate(() => {
  10 |       localStorage.clear();
  11 |       sessionStorage.clear();
  12 |     });
  13 |     await page.reload();
  14 | 
  15 |     // 2. See onboarding step 1
  16 |     const startBtn = page.locator('[data-testid="onboarding-start-btn"]');
  17 |     await expect(startBtn).toBeVisible();
  18 |     await startBtn.click();
  19 | 
  20 |     // 3. Step 2 (Prior Knowledge) -> click Next
  21 |     const step2Next = page.locator('#ob-next');
  22 |     await expect(step2Next).toBeVisible();
  23 |     await step2Next.click();
  24 | 
  25 |     // 4. Step 3 (Start Date) -> click Next
  26 |     const step3Next = page.locator('#ob-next');
  27 |     await expect(step3Next).toBeVisible();
  28 |     await step3Next.click();
  29 | 
  30 |     // 5. Step 4 (Study Days) -> click Next
  31 |     const step4Next = page.locator('#ob-next');
  32 |     await expect(step4Next).toBeVisible();
  33 |     await step4Next.click();
  34 | 
  35 |     // 6. Step 5 (Target Goal) -> click Next
  36 |     const step5Next = page.locator('#ob-next');
  37 |     await expect(step5Next).toBeVisible();
  38 |     await step5Next.click();
  39 | 
  40 |     // 7. Step 6 (Workbook Settings) -> click Next
  41 |     const step6Next = page.locator('#ob-next');
  42 |     await expect(step6Next).toBeVisible();
  43 |     await step6Next.click();
  44 | 
  45 |     // 8. Step 7 (Summary & Commit) -> Click Create Plan
  46 |     const commitBtn = page.locator('[data-testid="create-plan-btn"]');
  47 |     await expect(commitBtn).toBeVisible();
  48 |     await commitBtn.click();
  49 | 
  50 |     // Verify screen visibility on home screen right after creating plan
> 51 |     await expect(page.locator('#screen-onboarding')).toBeHidden();
     |                                                      ^ Error: expect(locator).toBeHidden() failed
  52 |     await expect(page.locator('#screen-home')).toBeVisible();
  53 |     await expect(page.locator('.screen:not(.hidden)')).toHaveCount(1);
  54 |     await expect(page.locator('[data-testid="continue-learning-btn"]')).toBeVisible();
  55 | 
  56 |     // Reload page and verify screen visibility state persists
  57 |     await page.reload();
  58 |     await expect(page.locator('#screen-onboarding')).toBeHidden();
  59 |     await expect(page.locator('#screen-home')).toBeVisible();
  60 |     await expect(page.locator('.screen:not(.hidden)')).toHaveCount(1);
  61 | 
  62 |     // 9. Navigate to Chapter 1
  63 |     await page.goto('/#chapter/1');
  64 | 
  65 |     // Verify 0 done items
  66 |     const doneItems = page.locator('.check-item.done');
  67 |     await expect(doneItems).toHaveCount(0);
  68 | 
  69 |     // 10. Settings -> Reset Data
  70 |     await page.goto('/#settings');
  71 |     const resetBtn = page.locator('#btn-reset');
  72 |     await expect(resetBtn).toBeVisible();
  73 | 
  74 |     // Accept confirm dialog
  75 |     page.once('dialog', (dialog) => dialog.accept());
  76 |     await resetBtn.click();
  77 | 
  78 |     // 11. After reload, see onboarding again
  79 |     await expect(page.locator('[data-testid="onboarding-start-btn"]')).toBeVisible();
  80 |   });
  81 | 
  82 |   const viewports = [320, 360, 390, 422, 768];
  83 |   for (const width of viewports) {
  84 |     test(`Responsive layout check at ${width}px`, async ({ page }) => {
  85 |       await page.setViewportSize({ width, height: 800 });
  86 |       await page.goto('/');
  87 | 
  88 |       const isOverflowing = await page.evaluate(() => {
  89 |         return document.documentElement.scrollWidth > window.innerWidth;
  90 |       });
  91 |       expect(isOverflowing).toBe(false);
  92 |     });
  93 |   }
  94 | });
  95 | 
```