# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: accessibility.spec.js >> Accessibility: axe-core WCAG A/AA checks >> Settings screen: no critical structural axe violations
- Location: tests/e2e/accessibility.spec.js:67:3

# Error details

```
Error: expect(received).toHaveLength(expected)

Expected length: 0
Received length: 1
Received array:  [{"description": "Ensure every form element has a label", "help": "Form elements must have labels", "helpUrl": "https://dequeuniversity.com/rules/axe/4.12/label?application=playwright", "id": "label", "impact": "critical", "nodes": [{"all": [], "any": [{"data": null, "id": "implicit-label", "impact": "critical", "message": "Element does not have an implicit (wrapped) <label>", "relatedNodes": []}, {"data": null, "id": "explicit-label", "impact": "critical", "message": "Element does not have an explicit <label>", "relatedNodes": []}, {"data": null, "id": "aria-label", "impact": "critical", "message": "aria-label attribute does not exist or is empty", "relatedNodes": []}, {"data": null, "id": "aria-labelledby", "impact": "critical", "message": "aria-labelledby attribute does not exist, references elements that do not exist or references elements that are empty", "relatedNodes": []}, {"data": {"messageKey": "noAttr"}, "id": "non-empty-title", "impact": "critical", "message": "Element has no title attribute", "relatedNodes": []}, {"data": {"messageKey": "noAttr"}, "id": "non-empty-placeholder", "impact": "critical", "message": "Element has no placeholder attribute", "relatedNodes": []}, {"data": null, "id": "presentational-role", "impact": "critical", "message": "Element's default semantics were not overridden with role=\"none\" or role=\"presentation\"", "relatedNodes": []}], "failureSummary": "Fix any of the following:
  Element does not have an implicit (wrapped) <label>
  Element does not have an explicit <label>
  aria-label attribute does not exist or is empty
  aria-labelledby attribute does not exist, references elements that do not exist or references elements that are empty
  Element has no title attribute
  Element has no placeholder attribute
  Element's default semantics were not overridden with role=\"none\" or role=\"presentation\"", "html": "<input type=\"time\" id=\"set-notify-time\" value=\"12:00\" data-testid=\"set-notify-time\">", "impact": "critical", "none": [], "target": ["#set-notify-time"]}], "tags": ["cat.forms", "wcag2a", "wcag412", "section508", "section508.22.n", "TTv5", "TT5.c", "EN-301-549", "EN-9.4.1.2", "ACT", …]}]
```

# Page snapshot

```yaml
- generic [ref=f1e2]:
  - generic [ref=f1e3]:
    - generic [ref=f1e5]:
      - generic [ref=f1e6]: 🦊
      - heading "Настройки" [active] [level=1] [ref=f1e7]
    - generic [ref=f1e8]:
      - generic [ref=f1e9]:
        - generic [ref=f1e10]:
          - generic [ref=f1e11]:
            - generic [ref=f1e12]: 📅 План обучения
            - generic [ref=f1e13]: Расписание, дедлайн, нагрузка и управление планом.
          - button "Открыть" [ref=f1e14] [cursor=pointer]
        - generic [ref=f1e15]:
          - generic [ref=f1e16]:
            - generic [ref=f1e17]: 📚 Все главы
            - generic [ref=f1e18]: Открывайте начатые и уже завершённые главы курса.
          - button "Открыть" [ref=f1e19] [cursor=pointer]
      - generic [ref=f1e20]:
        - generic [ref=f1e21]:
          - generic [ref=f1e22]: 🔑 API-ключ OpenRouter
          - textbox "sk-or-v1-..." [ref=f1e23]
          - generic [ref=f1e24]: Получите ключ на openrouter.ai. Хранится только на этом устройстве.
          - generic [ref=f1e25]: ⚠️ Ключ хранится в браузере. Не делитесь файлом бэкапа, если используете платный ключ.
        - generic [ref=f1e26]:
          - generic [ref=f1e27]: 🤖 Модель
          - textbox "deepseek/deepseek-v4-flash" [ref=f1e28]
          - generic [ref=f1e29]: По умолчанию deepseek v4 flash. Можно указать любую модель OpenRouter (напр. добавить «:free»).
      - generic [ref=f1e31]:
        - generic [ref=f1e32]: 📦 Полный экспорт прогресса
        - generic [ref=f1e33]: Экспорт всех данных обучения, карточек, истории повторений и настроек.
        - generic [ref=f1e34] [cursor=pointer]:
          - checkbox "Включить API-ключ в резервную копию" [ref=f1e35]
          - generic [ref=f1e36]: Включить API-ключ в резервную копию
        - generic [ref=f1e37]:
          - button "📦 Скачать прогресс (.json)" [ref=f1e38] [cursor=pointer]
          - button "📥 Восстановить из файла" [ref=f1e39] [cursor=pointer]
      - generic [ref=f1e40]:
        - generic [ref=f1e42]:
          - generic [ref=f1e43]: 🔔 Ежедневное напоминание
          - generic [ref=f1e44]: Напомнить продолжить учёбу, если стрик под угрозой.
        - generic [ref=f1e47]:
          - generic [ref=f1e48]: Время напоминания
          - textbox [ref=f1e49]: 12:00
          - generic [ref=f1e50]: Напоминание работает, пока приложение открыто или доступно в фоне. Для гарантированных уведомлений при полностью закрытом приложении потребуется серверный Web Push.
        - generic [ref=f1e51]:
          - generic [ref=f1e52]: Дни недели
          - generic [ref=f1e53]:
            - button "Пн" [ref=f1e54] [cursor=pointer]
            - button "Вт" [ref=f1e55] [cursor=pointer]
            - button "Ср" [ref=f1e56] [cursor=pointer]
            - button "Чт" [ref=f1e57] [cursor=pointer]
            - button "Пт" [ref=f1e58] [cursor=pointer]
            - button "Сб" [ref=f1e59] [cursor=pointer]
            - button "Вс" [ref=f1e60] [cursor=pointer]
        - generic [ref=f1e61]:
          - button "Тестовое уведомление" [ref=f1e62] [cursor=pointer]
          - button "⏰ Напомнить через час" [ref=f1e63] [cursor=pointer]
      - generic [ref=f1e65]:
        - generic [ref=f1e66]: 🎨 Тема оформления
        - generic [ref=f1e67]:
          - button "Авто" [ref=f1e68] [cursor=pointer]
          - button "☀️ Светлая" [ref=f1e69] [cursor=pointer]
          - button "🌙 Тёмная" [ref=f1e70] [cursor=pointer]
          - button "🎨 Кастомная" [ref=f1e71] [cursor=pointer]
        - generic [ref=f1e72]: Авто — следует за системной темой устройства. Кастомная — выбранная в магазине тема.
      - generic [ref=f1e75]:
        - generic [ref=f1e76]: 🔤 Скрыть Ромадзи
        - generic [ref=f1e77]: В карточках будет скрыто латинское чтение.
      - button "Сбросить весь прогресс" [ref=f1e82] [cursor=pointer]
  - navigation [ref=f1e84]:
    - button "🏠 Главная" [ref=f1e85] [cursor=pointer]:
      - generic [ref=f1e86]: 🏠
      - generic [ref=f1e87]: Главная
    - button "🎴 SRS" [ref=f1e88] [cursor=pointer]:
      - generic [ref=f1e89]: 🎴
      - generic [ref=f1e90]: SRS
    - button "🤖 Инструменты" [ref=f1e91] [cursor=pointer]:
      - generic [ref=f1e92]: 🤖
      - generic [ref=f1e93]: Инструменты
    - button "📖 Учебник" [ref=f1e94] [cursor=pointer]:
      - generic [ref=f1e95]: 📖
      - generic [ref=f1e96]: Учебник
    - button "👤 Профиль" [ref=f1e97] [cursor=pointer]:
      - generic [ref=f1e98]: 👤
      - generic [ref=f1e99]: Профиль
  - status
  - generic [ref=f1e100]: "Экран: Настройки"
  - alert [ref=f1e101]
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
> 79  |     expect(criticalViolations).toHaveLength(0);
      |                                ^ Error: expect(received).toHaveLength(expected)
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
```