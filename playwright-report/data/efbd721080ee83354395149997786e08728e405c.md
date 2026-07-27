# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: accessibility.spec.js >> Accessibility: axe-core WCAG A/AA checks >> Study plan screen: no critical structural axe violations
- Location: tests/e2e/accessibility.spec.js:88:3

# Error details

```
Error: expect(received).toHaveLength(expected)

Expected length: 0
Received length: 2
Received array:  [{"description": "Ensure every form element has a label", "help": "Form elements must have labels", "helpUrl": "https://dequeuniversity.com/rules/axe/4.12/label?application=playwright", "id": "label", "impact": "critical", "nodes": [{"all": [], "any": [{"data": null, "id": "implicit-label", "impact": "critical", "message": "Element does not have an implicit (wrapped) <label>", "relatedNodes": []}, {"data": null, "id": "explicit-label", "impact": "critical", "message": "Element does not have an explicit <label>", "relatedNodes": []}, {"data": null, "id": "aria-label", "impact": "critical", "message": "aria-label attribute does not exist or is empty", "relatedNodes": []}, {"data": null, "id": "aria-labelledby", "impact": "critical", "message": "aria-labelledby attribute does not exist, references elements that do not exist or references elements that are empty", "relatedNodes": []}, {"data": {"messageKey": "noAttr"}, "id": "non-empty-title", "impact": "critical", "message": "Element has no title attribute", "relatedNodes": []}, {"data": {"messageKey": "noAttr"}, "id": "non-empty-placeholder", "impact": "critical", "message": "Element has no placeholder attribute", "relatedNodes": []}, {"data": null, "id": "presentational-role", "impact": "critical", "message": "Element's default semantics were not overridden with role=\"none\" or role=\"presentation\"", "relatedNodes": []}], "failureSummary": "Fix any of the following:
  Element does not have an implicit (wrapped) <label>
  Element does not have an explicit <label>
  aria-label attribute does not exist or is empty
  aria-labelledby attribute does not exist, references elements that do not exist or references elements that are empty
  Element has no title attribute
  Element has no placeholder attribute
  Element's default semantics were not overridden with role=\"none\" or role=\"presentation\"", "html": "<input type=\"date\" id=\"plan-start-date\" class=\"form-input\" data-testid=\"plan-start-date\">", "impact": "critical", "none": [], "target": ["#plan-start-date"]}, {"all": [], "any": [{"data": null, "id": "implicit-label", "impact": "critical", "message": "Element does not have an implicit (wrapped) <label>", "relatedNodes": []}, {"data": null, "id": "explicit-label", "impact": "critical", "message": "Element does not have an explicit <label>", "relatedNodes": []}, {"data": null, "id": "aria-label", "impact": "critical", "message": "aria-label attribute does not exist or is empty", "relatedNodes": []}, {"data": null, "id": "aria-labelledby", "impact": "critical", "message": "aria-labelledby attribute does not exist, references elements that do not exist or references elements that are empty", "relatedNodes": []}, {"data": {"messageKey": "noAttr"}, "id": "non-empty-title", "impact": "critical", "message": "Element has no title attribute", "relatedNodes": []}, {"data": {"messageKey": "noAttr"}, "id": "non-empty-placeholder", "impact": "critical", "message": "Element has no placeholder attribute", "relatedNodes": []}, {"data": null, "id": "presentational-role", "impact": "critical", "message": "Element's default semantics were not overridden with role=\"none\" or role=\"presentation\"", "relatedNodes": []}], "failureSummary": "Fix any of the following:
  Element does not have an implicit (wrapped) <label>
  Element does not have an explicit <label>
  aria-label attribute does not exist or is empty
  aria-labelledby attribute does not exist, references elements that do not exist or references elements that are empty
  Element has no title attribute
  Element has no placeholder attribute
  Element's default semantics were not overridden with role=\"none\" or role=\"presentation\"", "html": "<input type=\"number\" id=\"plan-total-days\" class=\"form-input\" min=\"12\" value=\"90\" data-testid=\"plan-total-days\">", "impact": "critical", "none": [], "target": ["#plan-total-days"]}], "tags": ["cat.forms", "wcag2a", "wcag412", "section508", "section508.22.n", "TTv5", "TT5.c", "EN-301-549", "EN-9.4.1.2", "ACT", …]}, {"description": "Ensure select element has an accessible name", "help": "Select element must have an accessible name", "helpUrl": "https://dequeuniversity.com/rules/axe/4.12/select-name?application=playwright", "id": "select-name", "impact": "critical", "nodes": [{"all": [], "any": [{"data": null, "id": "implicit-label", "impact": "critical", "message": "Element does not have an implicit (wrapped) <label>", "relatedNodes": []}, {"data": null, "id": "explicit-label", "impact": "critical", "message": "Element does not have an explicit <label>", "relatedNodes": []}, {"data": null, "id": "aria-label", "impact": "critical", "message": "aria-label attribute does not exist or is empty", "relatedNodes": []}, {"data": null, "id": "aria-labelledby", "impact": "critical", "message": "aria-labelledby attribute does not exist, references elements that do not exist or references elements that are empty", "relatedNodes": []}, {"data": {"messageKey": "noAttr"}, "id": "non-empty-title", "impact": "critical", "message": "Element has no title attribute", "relatedNodes": []}, {"data": null, "id": "presentational-role", "impact": "critical", "message": "Element's default semantics were not overridden with role=\"none\" or role=\"presentation\"", "relatedNodes": []}], "failureSummary": "Fix any of the following:
  Element does not have an implicit (wrapped) <label>
  Element does not have an explicit <label>
  aria-label attribute does not exist or is empty
  aria-labelledby attribute does not exist, references elements that do not exist or references elements that are empty
  Element has no title attribute
  Element's default semantics were not overridden with role=\"none\" or role=\"presentation\"", "html": "<select id=\"plan-capacity-minutes\" class=\"form-input\" data-testid=\"plan-capacity-select\">", "impact": "critical", "none": [], "target": ["#plan-capacity-minutes"]}], "tags": ["cat.forms", "wcag2a", "wcag412", "section508", "section508.22.n", "TTv5", "TT5.c", "EN-301-549", "EN-9.4.1.2", "ACT", …]}]
```

# Page snapshot

```yaml
- generic [ref=f1e2]:
    - generic [ref=f1e4]:
        - generic [ref=f1e5]:
            - button "‹" [ref=f1e6] [cursor=pointer]
            - heading "План обучения" [active] [level=1] [ref=f1e7]
        - generic [ref=f1e8]:
            - heading "Создать новый план" [level=3] [ref=f1e9]
            - generic [ref=f1e10]:
                - generic [ref=f1e11]: Дата начала
                - textbox [ref=f1e12] [cursor=pointer]: 2026-07-27
            - generic [ref=f1e13]:
                - generic [ref=f1e14]: Способ выбора срока
                - generic [ref=f1e15]:
                    - button "Количество дней" [ref=f1e16] [cursor=pointer]
                    - button "Дата дедлайна" [ref=f1e17] [cursor=pointer]
            - generic [ref=f1e18]:
                - generic [ref=f1e19]: Количество учебных дней
                - spinbutton [ref=f1e20]: '90'
            - generic [ref=f1e21]:
                - generic [ref=f1e22]: Дни недели
                - generic [ref=f1e23]:
                    - button "Пн" [ref=f1e24] [cursor=pointer]
                    - button "Вт" [ref=f1e25] [cursor=pointer]
                    - button "Ср" [ref=f1e26] [cursor=pointer]
                    - button "Чт" [ref=f1e27] [cursor=pointer]
                    - button "Пт" [ref=f1e28] [cursor=pointer]
                    - button "Сб" [ref=f1e29] [cursor=pointer]
                    - button "Вс" [ref=f1e30] [cursor=pointer]
            - generic [ref=f1e31]:
                - generic [ref=f1e32]: Сколько времени вы готовы заниматься в учебный день?
                - combobox [ref=f1e33]:
                    - option "15 минут"
                    - option "30 минут" [selected]
                    - option "45 минут"
                    - option "60 минут"
            - generic [ref=f1e34]:
                - generic [ref=f1e35]: Уже изучено
                - text: 'Завершено: 0 из 12 глав'
            - group [ref=f1e37]:
                - generic "Дополнительные настройки" [ref=f1e38] [cursor=pointer]
            - button "Создать план" [ref=f1e40] [cursor=pointer]
    - navigation [ref=f1e41]:
        - button "🏠 Главная" [ref=f1e42] [cursor=pointer]:
            - generic [ref=f1e43]: 🏠
            - generic [ref=f1e44]: Главная
        - button "🎴 SRS" [ref=f1e45] [cursor=pointer]:
            - generic [ref=f1e46]: 🎴
            - generic [ref=f1e47]: SRS
        - button "🤖 Инструменты" [ref=f1e48] [cursor=pointer]:
            - generic [ref=f1e49]: 🤖
            - generic [ref=f1e50]: Инструменты
        - button "📖 Учебник" [ref=f1e51] [cursor=pointer]:
            - generic [ref=f1e52]: 📖
            - generic [ref=f1e53]: Учебник
        - button "👤 Профиль" [ref=f1e54] [cursor=pointer]:
            - generic [ref=f1e55]: 👤
            - generic [ref=f1e56]: Профиль
    - status
    - generic [ref=f1e57]: 'Экран: План обучения'
    - alert [ref=f1e58]
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
  13  |   await page
  14  |     .waitForFunction(() => typeof window.nav === 'function' || document.readyState === 'complete', {
  15  |       timeout: 10000,
  16  |     })
  17  |     .catch(() => {});
  18  |   await page.evaluate(() => {
  19  |     try {
  20  |       localStorage.setItem('kitsune_onboarding_completed', 'true');
  21  |     } catch (_e) {
  22  |       /* ignore storage error */
  23  |     }
  24  |     if (typeof window.nav === 'function') {
  25  |       window.nav('home');
  26  |     } else {
  27  |       const onboarding = document.getElementById('screen-onboarding');
  28  |       if (onboarding) onboarding.classList.add('hidden');
  29  |       const loader = document.getElementById('app-loader');
  30  |       if (loader) loader.style.display = 'none';
  31  |       const home = document.getElementById('screen-home');
  32  |       if (home) home.classList.remove('hidden');
  33  |     }
  34  |   });
  35  |   await page.waitForSelector('#screen-home:not(.hidden)', { timeout: 5000 }).catch(() => {});
  36  | }
  37  |
  38  | // Helper: navigate programmatically between screens for isolated testing
  39  | async function navigateTo(page, screenId) {
  40  |   await page.evaluate((target) => {
  41  |     if (typeof window.nav === 'function') {
  42  |       window.nav(target);
  43  |     } else {
  44  |       document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  45  |       const sc = document.getElementById(`screen-${target}`);
  46  |       if (sc) sc.classList.remove('hidden');
  47  |     }
  48  |   }, screenId);
  49  |   await page.waitForSelector(`#screen-${screenId}:not(.hidden)`, { timeout: 5000 });
  50  | }
  51  |
  52  | // ===== AXE TESTS =====
  53  |
  54  | test.describe('Accessibility: axe-core WCAG A/AA checks', () => {
  55  |   test.beforeEach(async ({ page }) => {
  56  |     await page.goto('./');
  57  |     await prepareHomeScreen(page);
  58  |   });
  59  |
  60  |   test('Home screen: no critical structural axe violations', async ({ page }) => {
  61  |     const results = await new AxeBuilder({ page })
  62  |       .include('#screen-home')
  63  |       .withTags(['wcag2a', 'wcag2aa'])
  64  |       .disableRules(['color-contrast'])
  65  |       .analyze();
  66  |
  67  |     const criticalViolations = results.violations.filter(
  68  |       (v) => v.impact === 'critical' || v.impact === 'serious'
  69  |     );
  70  |     expect(criticalViolations).toHaveLength(0);
  71  |   });
  72  |
  73  |   test('Settings screen: no critical structural axe violations', async ({ page }) => {
  74  |     await navigateTo(page, 'settings');
  75  |
  76  |     const results = await new AxeBuilder({ page })
  77  |       .include('#screen-settings')
  78  |       .withTags(['wcag2a', 'wcag2aa'])
  79  |       .disableRules(['color-contrast'])
  80  |       .analyze();
  81  |
  82  |     const criticalViolations = results.violations.filter(
  83  |       (v) => v.impact === 'critical' || v.impact === 'serious'
  84  |     );
  85  |     expect(criticalViolations).toHaveLength(0);
  86  |   });
  87  |
  88  |   test('Study plan screen: no critical structural axe violations', async ({ page }) => {
  89  |     await navigateTo(page, 'plan');
  90  |
  91  |     const results = await new AxeBuilder({ page })
  92  |       .include('#screen-plan')
  93  |       .withTags(['wcag2a', 'wcag2aa'])
  94  |       .disableRules(['color-contrast'])
  95  |       .analyze();
  96  |
  97  |     const criticalViolations = results.violations.filter(
  98  |       (v) => v.impact === 'critical' || v.impact === 'serious'
  99  |     );
> 100 |     expect(criticalViolations).toHaveLength(0);
      |                                ^ Error: expect(received).toHaveLength(expected)
  101 |   });
  102 |
  103 |   test('SRS/Flashcards screen: no critical structural axe violations', async ({ page }) => {
  104 |     await navigateTo(page, 'srs');
  105 |
  106 |     const results = await new AxeBuilder({ page })
  107 |       .include('#screen-srs')
  108 |       .withTags(['wcag2a', 'wcag2aa'])
  109 |       .disableRules(['color-contrast'])
  110 |       .analyze();
  111 |
  112 |     const criticalViolations = results.violations.filter(
  113 |       (v) => v.impact === 'critical' || v.impact === 'serious'
  114 |     );
  115 |     expect(criticalViolations).toHaveLength(0);
  116 |   });
  117 |
  118 |   test('Statistics screen: no critical structural axe violations', async ({ page }) => {
  119 |     await navigateTo(page, 'statistics');
  120 |
  121 |     const results = await new AxeBuilder({ page })
  122 |       .include('#screen-statistics')
  123 |       .withTags(['wcag2a', 'wcag2aa'])
  124 |       .disableRules(['color-contrast'])
  125 |       .analyze();
  126 |
  127 |     const criticalViolations = results.violations.filter(
  128 |       (v) => v.impact === 'critical' || v.impact === 'serious'
  129 |     );
  130 |     expect(criticalViolations).toHaveLength(0);
  131 |   });
  132 |
  133 |   test('Shop modal: has role=dialog, aria-modal, aria-labelledby', async ({ page }) => {
  134 |     await page.evaluate(() => {
  135 |       const modal = document.getElementById('shop-modal');
  136 |       if (modal) {
  137 |         modal.classList.remove('hidden');
  138 |         modal.style.display = 'block';
  139 |       }
  140 |     });
  141 |     await page.waitForTimeout(100);
  142 |
  143 |     const modal = page.locator('#shop-modal');
  144 |     await expect(modal).toHaveAttribute('role', 'dialog');
  145 |     await expect(modal).toHaveAttribute('aria-modal', 'true');
  146 |     await expect(modal).toHaveAttribute('aria-labelledby', 'shop-modal-title');
  147 |
  148 |     const results = await new AxeBuilder({ page })
  149 |       .include('#shop-modal')
  150 |       .withTags(['wcag2a', 'wcag2aa'])
  151 |       .disableRules(['color-contrast'])
  152 |       .analyze();
  153 |
  154 |     const criticalViolations = results.violations.filter(
  155 |       (v) => v.impact === 'critical' || v.impact === 'serious'
  156 |     );
  157 |     expect(criticalViolations).toHaveLength(0);
  158 |   });
  159 |
  160 |   test('Document has lang="ru" on html element', async ({ page }) => {
  161 |     const lang = await page.getAttribute('html', 'lang');
  162 |     expect(lang).toBe('ru');
  163 |   });
  164 |
  165 |   test('Viewport allows user scaling', async ({ page }) => {
  166 |     const viewport = await page.$eval('meta[name="viewport"]', (el) => el.getAttribute('content'));
  167 |     expect(viewport).not.toContain('user-scalable=no');
  168 |     expect(viewport).not.toMatch(/maximum-scale=1(?:[^.]|$)/);
  169 |   });
  170 |
  171 |   test('Live region elements exist in DOM', async ({ page }) => {
  172 |     await expect(page.locator('#a11y-announce')).toBeAttached();
  173 |     const politeRole = await page.getAttribute('#a11y-announce', 'aria-live');
  174 |     expect(politeRole).toBe('polite');
  175 |
  176 |     await expect(page.locator('#a11y-alert')).toBeAttached();
  177 |     const alertRole = await page.getAttribute('#a11y-alert', 'role');
  178 |     expect(alertRole).toBe('alert');
  179 |   });
  180 | });
  181 |
  182 | // ===== KEYBOARD NAVIGATION TESTS =====
  183 |
  184 | test.describe('Keyboard Navigation', () => {
  185 |   test.beforeEach(async ({ page }) => {
  186 |     await page.goto('./');
  187 |     await prepareHomeScreen(page);
  188 |   });
  189 |
  190 |   test('Navigation to SRS screen moves focus to heading or screen', async ({ page }) => {
  191 |     await navigateTo(page, 'srs');
  192 |
  193 |     const isSrsActive = await page.evaluate(() => {
  194 |       const srs = document.getElementById('screen-srs');
  195 |       return srs && !srs.classList.contains('hidden');
  196 |     });
  197 |
  198 |     expect(isSrsActive).toBe(true);
  199 |   });
  200 |
```
