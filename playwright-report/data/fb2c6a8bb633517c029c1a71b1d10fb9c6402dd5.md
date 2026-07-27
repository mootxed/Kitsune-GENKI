# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: accessibility.spec.js >> Accessibility: axe-core WCAG A/AA checks >> Home screen: no critical structural axe violations
- Location: tests/e2e/accessibility.spec.js:54:3

# Error details

```
Error: page.evaluate: Execution context was destroyed, most likely because of a navigation
```

# Page snapshot

```yaml
- generic [ref=f1e2]:
  - generic [ref=f1e4]:
    - generic [ref=f1e5]: 🦊
    - generic [ref=f1e7]: Загрузка...
  - navigation [ref=f1e8]:
    - button "🏠 Главная" [ref=f1e9] [cursor=pointer]:
      - generic [ref=f1e10]: 🏠
      - generic [ref=f1e11]: Главная
    - button "🎴 SRS" [ref=f1e12] [cursor=pointer]:
      - generic [ref=f1e13]: 🎴
      - generic [ref=f1e14]: SRS
    - button "🤖 Инструменты" [ref=f1e15] [cursor=pointer]:
      - generic [ref=f1e16]: 🤖
      - generic [ref=f1e17]: Инструменты
    - button "📖 Учебник" [ref=f1e18] [cursor=pointer]:
      - generic [ref=f1e19]: 📖
      - generic [ref=f1e20]: Учебник
    - button "👤 Профиль" [ref=f1e21] [cursor=pointer]:
      - generic [ref=f1e22]: 👤
      - generic [ref=f1e23]: Профиль
  - status
  - alert [ref=f1e25]
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
  1   | /**
  2   |  * tests/e2e/accessibility.spec.js
  3   |  *
  4   |  * Automated accessibility tests using axe-core via @axe-core/playwright.
  5   |  * These tests detect WCAG A/AA structural and ARIA violations on main screens.
  6   |  */
  7   | 
  8   | import { test, expect } from '@playwright/test';
  9   | import AxeBuilder from '@axe-core/playwright';
  10  | 
  11  | // Helper: prepare app environment for testing
  12  | async function prepareHomeScreen(page) {
  13  |   await page.waitForFunction(() => typeof window.nav === 'function' || document.readyState === 'complete', { timeout: 10000 }).catch(() => {});
  14  |   await page.evaluate(() => {
  15  |     try {
  16  |       localStorage.setItem('kitsune_onboarding_completed', 'true');
  17  |     } catch (_e) {}
  18  |     if (typeof window.nav === 'function') {
  19  |       window.nav('home');
  20  |     } else {
  21  |       const onboarding = document.getElementById('screen-onboarding');
  22  |       if (onboarding) onboarding.classList.add('hidden');
  23  |       const loader = document.getElementById('app-loader');
  24  |       if (loader) loader.style.display = 'none';
  25  |       const home = document.getElementById('screen-home');
  26  |       if (home) home.classList.remove('hidden');
  27  |     }
  28  |   });
  29  |   await page.waitForSelector('#screen-home:not(.hidden)', { timeout: 5000 }).catch(() => {});
  30  | }
  31  | 
  32  | // Helper: navigate programmatically between screens for isolated testing
  33  | async function navigateTo(page, screenId) {
  34  |   await page.evaluate((target) => {
  35  |     if (typeof window.nav === 'function') {
  36  |       window.nav(target);
  37  |     } else {
  38  |       document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  39  |       const sc = document.getElementById(`screen-${target}`);
  40  |       if (sc) sc.classList.remove('hidden');
  41  |     }
  42  |   }, screenId);
  43  |   await page.waitForSelector(`#screen-${screenId}:not(.hidden)`, { timeout: 5000 });
  44  | }
  45  | 
  46  | // ===== AXE TESTS =====
  47  | 
  48  | test.describe('Accessibility: axe-core WCAG A/AA checks', () => {
  49  |   test.beforeEach(async ({ page }) => {
  50  |     await page.goto('./');
  51  |     await prepareHomeScreen(page);
  52  |   });
  53  | 
  54  |   test('Home screen: no critical structural axe violations', async ({ page }) => {
  55  |     const results = await new AxeBuilder({ page })
  56  |       .include('#screen-home')
  57  |       .withTags(['wcag2a', 'wcag2aa'])
  58  |       .disableRules(['color-contrast'])
> 59  |       .analyze();
      |        ^ Error: page.evaluate: Execution context was destroyed, most likely because of a navigation
  60  | 
  61  |     const criticalViolations = results.violations.filter(
  62  |       (v) => v.impact === 'critical' || v.impact === 'serious'
  63  |     );
  64  |     expect(criticalViolations).toHaveLength(0);
  65  |   });
  66  | 
  67  |   test('Settings screen: no critical structural axe violations', async ({ page }) => {
  68  |     await navigateTo(page, 'settings');
  69  | 
  70  |     const results = await new AxeBuilder({ page })
  71  |       .include('#screen-settings')
  72  |       .withTags(['wcag2a', 'wcag2aa'])
  73  |       .disableRules(['color-contrast'])
  74  |       .analyze();
  75  | 
  76  |     const criticalViolations = results.violations.filter(
  77  |       (v) => v.impact === 'critical' || v.impact === 'serious'
  78  |     );
  79  |     expect(criticalViolations).toHaveLength(0);
  80  |   });
  81  | 
  82  |   test('Study plan screen: no critical structural axe violations', async ({ page }) => {
  83  |     await navigateTo(page, 'plan');
  84  | 
  85  |     const results = await new AxeBuilder({ page })
  86  |       .include('#screen-plan')
  87  |       .withTags(['wcag2a', 'wcag2aa'])
  88  |       .disableRules(['color-contrast'])
  89  |       .analyze();
  90  | 
  91  |     const criticalViolations = results.violations.filter(
  92  |       (v) => v.impact === 'critical' || v.impact === 'serious'
  93  |     );
  94  |     expect(criticalViolations).toHaveLength(0);
  95  |   });
  96  | 
  97  |   test('SRS/Flashcards screen: no critical structural axe violations', async ({ page }) => {
  98  |     await navigateTo(page, 'srs');
  99  | 
  100 |     const results = await new AxeBuilder({ page })
  101 |       .include('#screen-srs')
  102 |       .withTags(['wcag2a', 'wcag2aa'])
  103 |       .disableRules(['color-contrast'])
  104 |       .analyze();
  105 | 
  106 |     const criticalViolations = results.violations.filter(
  107 |       (v) => v.impact === 'critical' || v.impact === 'serious'
  108 |     );
  109 |     expect(criticalViolations).toHaveLength(0);
  110 |   });
  111 | 
  112 |   test('Statistics screen: no critical structural axe violations', async ({ page }) => {
  113 |     await navigateTo(page, 'statistics');
  114 | 
  115 |     const results = await new AxeBuilder({ page })
  116 |       .include('#screen-statistics')
  117 |       .withTags(['wcag2a', 'wcag2aa'])
  118 |       .disableRules(['color-contrast'])
  119 |       .analyze();
  120 | 
  121 |     const criticalViolations = results.violations.filter(
  122 |       (v) => v.impact === 'critical' || v.impact === 'serious'
  123 |     );
  124 |     expect(criticalViolations).toHaveLength(0);
  125 |   });
  126 | 
  127 |   test('Shop modal: has role=dialog, aria-modal, aria-labelledby', async ({ page }) => {
  128 |     await page.evaluate(() => {
  129 |       const modal = document.getElementById('shop-modal');
  130 |       if (modal) {
  131 |         modal.classList.remove('hidden');
  132 |         modal.style.display = 'block';
  133 |       }
  134 |     });
  135 |     await page.waitForTimeout(100);
  136 | 
  137 |     const modal = page.locator('#shop-modal');
  138 |     await expect(modal).toHaveAttribute('role', 'dialog');
  139 |     await expect(modal).toHaveAttribute('aria-modal', 'true');
  140 |     await expect(modal).toHaveAttribute('aria-labelledby', 'shop-modal-title');
  141 | 
  142 |     const results = await new AxeBuilder({ page })
  143 |       .include('#shop-modal')
  144 |       .withTags(['wcag2a', 'wcag2aa'])
  145 |       .disableRules(['color-contrast'])
  146 |       .analyze();
  147 | 
  148 |     const criticalViolations = results.violations.filter(
  149 |       (v) => v.impact === 'critical' || v.impact === 'serious'
  150 |     );
  151 |     expect(criticalViolations).toHaveLength(0);
  152 |   });
  153 | 
  154 |   test('Document has lang="ru" on html element', async ({ page }) => {
  155 |     const lang = await page.getAttribute('html', 'lang');
  156 |     expect(lang).toBe('ru');
  157 |   });
  158 | 
  159 |   test('Viewport allows user scaling', async ({ page }) => {
```