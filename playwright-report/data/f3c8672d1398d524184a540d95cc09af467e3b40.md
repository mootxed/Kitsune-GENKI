# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: plan-creation.spec.js >> E2E Plan Creation & Form Flow >> Tight deadline requires confirming realistic deadline checkbox
- Location: tests/e2e/plan-creation.spec.js:66:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('[data-testid="plan-total-days"]')
    2 × locator resolved to <input min="12" value="90" type="number" class="form-input" id="plan-total-days" data-testid="plan-total-days"/>
    - fill("12")
  - attempting fill action
    2 × waiting for element to be visible, enabled and editable
      - element is not visible
    - retrying fill action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and editable
      - element is not visible
    - retrying fill action
      - waiting 100ms
    59 × waiting for element to be visible, enabled and editable
       - element is not visible
     - retrying fill action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=f3e2]:
  - generic [ref=f3e9]:
    - generic [ref=f3e10]: Шаг 1 из 7
    - heading "Добро пожаловать в Kitsune Genki 🦊" [active] [level=2] [ref=f3e11]
    - paragraph [ref=f3e12]: "Приложение поможет пройти курс GENKI постепенно и эффективнее:"
    - list [ref=f3e13]:
      - listitem [ref=f3e14]: ✨ Новые слова небольшими порциями
      - listitem [ref=f3e15]: 🧠 Повторения по алгоритму FSRS
      - listitem [ref=f3e16]: 📚 Грамматика строго по порядку
      - listitem [ref=f3e17]: 📝 Задания и упражнения из Workbook
    - paragraph [ref=f3e18]: Давайте настроим ваш персональный учебный план.
    - button "Начать настройку →" [ref=f3e20] [cursor=pointer]
  - status
  - generic [ref=f3e21]: "Экран: Введение"
  - alert [ref=f3e22]
  - dialog:
    - generic:
      - generic:
        - generic:
          - heading [level=2]
        - paragraph
        - paragraph
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('E2E Plan Creation & Form Flow', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await page.evaluate(() => {
  7  |       localStorage.clear();
  8  |       sessionStorage.clear();
  9  |       // Set onboarding as completed to open regular plan form directly
  10 |       localStorage.setItem(
  11 |         'kitsune_genki_state',
  12 |         JSON.stringify({
  13 |           onboardingCompleted: true,
  14 |           studyPlan: null,
  15 |         })
  16 |       );
  17 |     });
  18 |     await page.reload();
  19 |   });
  20 | 
  21 |   test('Regular plan creation closes form and displays plan view', async ({ page }) => {
  22 |     await page.goto('/#plan');
  23 | 
  24 |     const formContainer = page.locator('#plan-form-container');
  25 |     const viewContainer = page.locator('#plan-view-container');
  26 |     const createBtn = page.locator('[data-testid="plan-generate-btn"]');
  27 | 
  28 |     await expect(formContainer).toBeVisible();
  29 |     await expect(viewContainer).toBeHidden();
  30 | 
  31 |     await createBtn.click();
  32 | 
  33 |     // After clicking create, form should close and view should be visible
  34 |     await expect(formContainer).toBeHidden();
  35 |     await expect(viewContainer).toBeVisible();
  36 |     await expect(page.locator('[data-testid="plan-status-card"]')).toBeVisible();
  37 |   });
  38 | 
  39 |   test('Editing existing plan opens edit form, saving updates view', async ({ page }) => {
  40 |     await page.goto('/#plan');
  41 | 
  42 |     // Create initial plan
  43 |     await page.locator('[data-testid="plan-generate-btn"]').click();
  44 |     await expect(page.locator('#plan-view-container')).toBeVisible();
  45 | 
  46 |     // Click edit button
  47 |     const editBtn = page.locator('#plan-edit-btn');
  48 |     await expect(editBtn).toBeVisible();
  49 |     await editBtn.click();
  50 | 
  51 |     // Form should open
  52 |     await expect(page.locator('#plan-form-container')).toBeVisible();
  53 |     await expect(page.locator('#plan-form-title')).toHaveText('Редактировать план');
  54 | 
  55 |     // Change capacity
  56 |     await page.locator('[data-testid="plan-capacity-select"]').selectOption('60');
  57 | 
  58 |     // Click save
  59 |     await page.locator('[data-testid="plan-generate-btn"]').click();
  60 | 
  61 |     // Form closes and plan view returns
  62 |     await expect(page.locator('#plan-form-container')).toBeHidden();
  63 |     await expect(page.locator('#plan-view-container')).toBeVisible();
  64 |   });
  65 | 
  66 |   test('Tight deadline requires confirming realistic deadline checkbox', async ({ page }) => {
  67 |     await page.goto('/#plan');
  68 | 
  69 |     // Set 12 total days (tight for full course)
> 70 |     await page.locator('[data-testid="plan-total-days"]').fill('12');
     |                                                           ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  71 |     await page.locator('[data-testid="plan-capacity-select"]').selectOption('15');
  72 | 
  73 |     // Trigger live preview / warning
  74 |     const createBtn = page.locator('[data-testid="plan-generate-btn"]');
  75 |     await createBtn.click();
  76 | 
  77 |     // Warning should show up
  78 |     const warning = page.locator('#plan-warning');
  79 |     await expect(warning).toBeVisible();
  80 |     await expect(warning).toContainText('слишком короткий');
  81 | 
  82 |     // Check the accept deadline checkbox
  83 |     const acceptCheckbox = page.locator('[data-testid="plan-accept-deadline"]');
  84 |     await expect(acceptCheckbox).toBeVisible();
  85 |     await acceptCheckbox.check();
  86 | 
  87 |     // Click create again
  88 |     await createBtn.click();
  89 | 
  90 |     // Form should succeed and close
  91 |     await expect(page.locator('#plan-form-container')).toBeHidden();
  92 |     await expect(page.locator('#plan-view-container')).toBeVisible();
  93 |   });
  94 | });
  95 | 
```