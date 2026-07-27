# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: grammar-lesson-mobile.spec.js >> E2E Grammar Lesson & Mobile Responsiveness >> Grammar quiz flow and no horizontal overflow at 390x844
- Location: tests/e2e/grammar-lesson-mobile.spec.js:13:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-kind="grammar"][data-check="L1_g1"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('[data-kind="grammar"][data-check="L1_g1"]')

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
- spinbutton: "90"
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
  - option "15 минут"
  - option "30 минут" [selected]
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
  57  |       await page.waitForSelector('#chapter-title');
  58  | 
  59  |       // Click first grammar check card (L1_g1)
  60  |       const grammarCard = page.locator('[data-kind="grammar"][data-check="L1_g1"]');
> 61  |       await expect(grammarCard).toBeVisible();
      |                                 ^ Error: expect(locator).toBeVisible() failed
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