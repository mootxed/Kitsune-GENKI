# Routes Reference — Справочник Маршрутов

В этом документе приведён полный реестр зарегистрированных маршрутов роутера (`router.js`, `ui/router.js`).

---

## 🗺️ Таблица маршрутов SPA

| Маршрут (Hash)  | Представление (View) | Назначение                       | Контроллер UI                 |
| :-------------- | :------------------- | :------------------------------- | :---------------------------- |
| `#/home`        | `HomeView`           | Главный экран, дашборд прогресса | `ui/home.js`                  |
| `#/plan`        | `PlanView`           | Детальный учебный план           | `ui/plan.js`                  |
| `#/chapter/:id` | `ChapterView`        | Просмотр материалов главы        | `ui/chapter.js`               |
| `#/flashcards`  | `FlashcardsView`     | Учебная сессия карточек          | `ui/flashcards/card-modes.js` |
| `#/dictionary`  | `DictionaryView`     | Интерактивный словарь            | `ui/flashcards/dictionary.js` |
| `#/statistics`  | `StatisticsView`     | Панель аналитики и графики       | `ui/statistics.js`            |
| `#/settings`    | `SettingsView`       | Настройки приложения             | `ui/settings.js`              |
| `#/onboarding`  | `OnboardingView`     | Начальный анкета-мастер          | `ui/onboarding.js`            |
| `#/crossword`   | `CrosswordView`      | Игра Кроссворд                   | `ui/crossword.js`             |
| `#/word-search` | `WordSearchView`     | Игра Поиск Слов                  | `ui/word-search.js`           |
| `#/particles`   | `ParticlesView`      | Игра Частицы                     | `ui/particles.js`             |
