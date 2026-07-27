# Kitsune-GENKI — Системная документация разработчика

Добро пожаловать в официальную техническую документацию проекта **Kitsune-GENKI** — офлайн-первого PWA-приложения для изучения японского языка (на базе учебников Genki I/II), построенного на Vanilla JavaScript (ES Modules), Vite, IndexedDB (`KitsuneGenkiDB` v4), системе состояний `state` (v13) и интервальном повторении `ts-fsrs` (v5.4.1).

> [!IMPORTANT]
> Настоящая документация отражает **фактическое текущее состояние исходного кода**, модулей, схем данных и проверенных тестов репозитория.

---

## 🧭 Навигация по документации

Документация структурирована по основным доменам системы:

| Раздел                                                         | Назначение                                                                                                                         |
| :------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| 🚀 [**Overview**](overview/project-overview.md)                | Назначение приложения, структура репозитория, архитектурные слои и жизненный цикл.                                                 |
| 🛠️ [**Development**](development/getting-started.md)           | Руководство по запуску, рабочий процесс, стандарты кода, тестирование, отладка и CI/CD.                                            |
| 💾 [**Data & State**](data/application-state.md)               | Модель состояния приложения (State v13), IndexedDB (v4), миграции, journal/outbox и бэкапы.                                        |
| 🧠 [**Learning System**](learning/learning-system-overview.md) | Knowledge model, FSRS, подсистема Mastery, учебный план, дневной план, SessionManager, XP и статистика.                            |
| 🎯 [**Study Modes**](modes/overview.md)                        | Поведение и алгоритмы оценивания 7 учебных режимов (Multiple Choice, Typing, Drawing, Context Sentence, Context Production и др.). |
| 📚 [**Content System**](content/content-system.md)             | Структура глав Genki, схема JSON-контента, валидаторы и пошаговые руководства по добавлению материалов.                            |
| 🎮 [**Minigames**](minigames/overview.md)                      | Вспомогательные мини-игры (Crossword, Word Search, Particles), алгоритмы выбора слабых слов и accessibility.                       |
| ✨ [**Features**](features/dictionary.md)                      | Интерактивный словарь, экран статистики, настройки, AI Story, TTS Audio, Onboarding.                                               |
| ⚖️ [**Legal & Licensing**](legal/README.md)                    | Модель лицензирования, происхождение ресурсов (RhosGFX, AI covers), third-party notices и disclaimers.                             |
| 📱 [**PWA & SW**](pwa/pwa-overview.md)                         | Service Worker, стратегии кеширования, offline-first fallback, жизненный цикл обновлений PWA.                                      |
| 📖 [**Reference**](reference/routes.md)                        | Справочники по маршрутам, конфигурации, npm-скриптам, схемам State/Events/Cards и Known Limitations.                               |
| 🏛️ [**Decisions (ADRs)**](decisions/README.md)                 | Архитектурные решения (ADR) по выбору технологии, хранилища, алгоритмов SRS и независимости мини-игр.                              |

---

## ⚡ Быстрый переход: «Я хочу...»

- **Запустить проект локально**: См. [Getting Started](development/getting-started.md) и [NPM Scripts](reference/npm-scripts.md).
- **Понять архитектуру и слои**: См. [Architecture & Layers](overview/architecture.md) и [Application Lifecycle](overview/application-lifecycle.md).
- **Разобраться в FSRS и интервальных повторениях**: См. [FSRS Integration](learning/fsrs.md) и [Ratings & Grading](learning/ratings-and-grading.md).
- **Понять разницу между SRS и Mastery**: См. [Mastery System](learning/mastery.md).
- **Добавить новый учебный режим**: См. [Modes Overview](modes/overview.md) и [Coding Conventions](development/coding-conventions.md).
- **Добавить слова или грамматику**: См. [Adding Content Guide](content/adding-content.md) и [Lesson Schema](content/lesson-schema.md).
- **Создать контекстно-продукционное задание**: См. [Context Production Mode](modes/context-production.md) и [Production Tasks Schema](content/production-tasks.md).
- **Изменить схему IndexedDB или State**: См. [Application State](data/application-state.md), [IndexedDB](data/indexeddb.md) и [State Migrations](data/migrations.md).
- **Создать или переработать мини-игру**: См. [Minigames Overview](minigames/overview.md) и [Weak Word Selection](minigames/weak-word-selection.md).
- **Отладить Service Worker или PWA**: См. [Service Worker](pwa/service-worker.md) и [Update Lifecycle](pwa/update-lifecycle.md).
- **Запустить и написать тесты**: См. [Testing Guide](development/testing.md).
- **Ознакомиться с известными ограничениями**: См. [Known Limitations](reference/known-limitations.md).

---

## 📚 Рекомендуемый порядок чтения

Для нового разработчика рекомендуется следующий порядок освоения репозитория:

1. [Project Overview](overview/project-overview.md) — Высокоуровневая концепция.
2. [Repository Structure](overview/repository-structure.md) — Структура каталогов и модулей.
3. [Architecture](overview/architecture.md) — Взаимодействие слоев и поток данных.
4. [Application State](data/application-state.md) & [IndexedDB](data/indexeddb.md) — Архитектура состояния и персистентности.
5. [Knowledge Model](learning/knowledge-model.md) & [FSRS](learning/fsrs.md) — Ключевые предметные модели обучения.
6. [Modes Overview](modes/overview.md) & [SessionManager](learning/session-manager.md) — Прохождение карточек и сессии.
7. [Testing Guide](development/testing.md) — Проверка изменений.
