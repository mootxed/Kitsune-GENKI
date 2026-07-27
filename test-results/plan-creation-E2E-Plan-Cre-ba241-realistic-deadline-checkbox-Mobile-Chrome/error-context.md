# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: plan-creation.spec.js >> E2E Plan Creation & Form Flow >> Tight deadline requires confirming realistic deadline checkbox
- Location: tests/e2e/plan-creation.spec.js:66:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('#plan-warning')
Expected: visible
Received: hidden
Timeout:  5000ms

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('#plan-warning')
    14 × locator resolved to <div id="plan-warning" class="plan-warning hidden"></div>
       - unexpected value "hidden"

```

```yaml
- text: Шаг 1 из 7
- heading "Добро пожаловать в Kitsune Genki 🦊" [level=2]
- paragraph: "Приложение поможет пройти курс GENKI постепенно и эффективнее:"
- list:
  - listitem: ✨ Новые слова небольшими порциями
  - listitem: 🧠 Повторения по алгоритму FSRS
  - listitem: 📚 Грамматика строго по порядку
  - listitem: 📝 Задания и упражнения из Workbook
- paragraph: Давайте настроим ваш персональный учебный план.
- button "Начать настройку →"
- text: ЕЖЕДНЕВНЫЙ СТРИК 0/10 0 дней Решите 10 карточек, чтобы продлить стрик! Уровень 1 0 / 100 XP 🪙 0 🔥
- button "続 Начать главу 1 Открыть уроки и карточки новой главы →":
  - text: 続
  - strong: Начать главу 1
  - text: Открыть уроки и карточки новой главы →
- text: ПЛАН НА СЕГОДНЯ
- heading "Составить план обучения" [level=2]
- paragraph: Выберите учебные дни и срок — план свяжет главы с ежедневными повторениями.
- button "Составить план"
- button "Все главы курса"
- button "Назад": ‹
- heading "Курс" [level=1]
- paragraph: Все главы, включая завершённые
- text: 🦊
- heading "Профиль" [level=1]
- button "Магазин": 🛒
- button "Настройки": ⚙️
- text: 🦊
- heading "Квесты" [level=1]
- button "Назад": ‹
- button "Назад": ‹
- heading "Глава" [level=1]
- paragraph
- text: 🦊
- heading "Kitsune Genki" [level=1]
- paragraph: Система интервальных повторений
- button "Магазин": 🛒
- button "Настройки": ⚙️
- button "Повторение"
- button "Словарь"
- button "Частицы"
- text: 🦊
- heading "AI Сенсей" [level=1]
- button "Магазин": 🛒
- button "Настройки": ⚙️
- button "Чат"
- button "🛠️ Инструменты"
- button "Назад": ‹
- heading "AI-история" [level=1]
- paragraph: Генератор персонализированных историй
- button "Назад": ‹
- heading "🧩 Кроссворд" [level=1]
- paragraph: Закрепление изученных слов
- button "Назад": ‹
- heading "🔍 Охота на слова" [level=1]
- paragraph: Найдите японские слова по русскому переводу
- text: 🦊
- heading "Мини-учебник" [level=1]
- button "Магазин": 🛒
- button "Настройки": ⚙️
- button "Грамматика"
- button "Заметки"
- button "Истории"
- button "Назад": ‹
- heading "История" [level=1]
- paragraph
- text: 🦊
- heading "Настройки" [level=1]
- button "‹"
- heading "План обучения" [level=1]
- heading "Создать новый план" [level=3]
- text: Дата начала
- textbox
- text: Способ выбора срока
- button "Количество дней"
- button "Дата дедлайна"
- text: Количество учебных дней
- spinbutton: "12"
- text: Дата дедлайна
- textbox
- text: Дни недели
- button "Пн"
- button "Вт"
- button "Ср"
- button "Чт"
- button "Пт"
- button "Сб"
- button "Вс"
- text: Сколько времени вы готовы заниматься в учебный день?
- combobox:
  - option "15 минут" [selected]
  - option "30 минут"
  - option "45 минут"
  - option "60 минут"
- text: Уже изучено Загрузка прогресса...
- group: Дополнительные настройки
- button "Создать план"
- button "✏️ Изменить"
- button "🔄 Пересчитать"
- button "⏸️ Приостановить"
- button "🗑️ Удалить"
- button "📋 Таймлайн"
- button "📅 Календарь"
- button "←"
- text: Месяц
- button "→"
- text: Пн Вт Ср Чт Пт Сб Вс
- heading "Распределение времени" [level=3]
- paragraph: Рекомендации оптимального баланса
- paragraph
- status
- heading "🦊 Магазин Кицунэ" [level=2]
- button "Закрыть магазин": ✕
- button "🦊 Аватарки"
- button "🎴 Скины карточек"
- button "🎨 Темы"
- button "🏷️ Титулы"
- heading [level=2]
- paragraph
- paragraph
- text: 🎉
- heading "おめでとう!" [level=2]
- heading "Congratulations!" [level=3]
- paragraph: You completed the session!
- button "CONTINUE"
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
  70 |     await page.locator('[data-testid="plan-total-days"]').fill('12');
  71 |     await page.locator('[data-testid="plan-capacity-select"]').selectOption('15');
  72 | 
  73 |     // Trigger live preview / warning
  74 |     const createBtn = page.locator('[data-testid="plan-generate-btn"]');
  75 |     await createBtn.click();
  76 | 
  77 |     // Warning should show up
  78 |     const warning = page.locator('#plan-warning');
> 79 |     await expect(warning).toBeVisible();
     |                           ^ Error: expect(locator).toBeVisible() failed
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