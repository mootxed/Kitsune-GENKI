# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: accessibility.spec.js >> Accessibility: axe-core WCAG A/AA checks >> Study plan screen: no critical structural axe violations
- Location: tests/e2e/accessibility.spec.js:82:3

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
        - spinbutton [ref=f1e20]: "90"
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
        - text: "Завершено: 0 из 12 глав"
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
  - generic [ref=f1e57]: "Экран: План обучения"
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
  59  |       .analyze();
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
> 94  |     expect(criticalViolations).toHaveLength(0);
      |                                ^ Error: expect(received).toHaveLength(expected)
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
  160 |     const viewport = await page.$eval(
  161 |       'meta[name="viewport"]',
  162 |       (el) => el.getAttribute('content')
  163 |     );
  164 |     expect(viewport).not.toContain('user-scalable=no');
  165 |     expect(viewport).not.toMatch(/maximum-scale=1(?:[^.]|$)/);
  166 |   });
  167 | 
  168 |   test('Live region elements exist in DOM', async ({ page }) => {
  169 |     await expect(page.locator('#a11y-announce')).toBeAttached();
  170 |     const politeRole = await page.getAttribute('#a11y-announce', 'aria-live');
  171 |     expect(politeRole).toBe('polite');
  172 | 
  173 |     await expect(page.locator('#a11y-alert')).toBeAttached();
  174 |     const alertRole = await page.getAttribute('#a11y-alert', 'role');
  175 |     expect(alertRole).toBe('alert');
  176 |   });
  177 | });
  178 | 
  179 | // ===== KEYBOARD NAVIGATION TESTS =====
  180 | 
  181 | test.describe('Keyboard Navigation', () => {
  182 |   test.beforeEach(async ({ page }) => {
  183 |     await page.goto('./');
  184 |     await prepareHomeScreen(page);
  185 |   });
  186 | 
  187 |   test('Navigation to SRS screen moves focus to heading or screen', async ({ page }) => {
  188 |     await navigateTo(page, 'srs');
  189 | 
  190 |     const isSrsActive = await page.evaluate(() => {
  191 |       const srs = document.getElementById('screen-srs');
  192 |       return srs && !srs.classList.contains('hidden');
  193 |     });
  194 | 
```