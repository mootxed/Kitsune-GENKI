# 🦊 Kitsune Genki

> Автономный PWA-тренажёр для изучения японского языка по материалам учебников Genki I & II.

> [!WARNING]
> Проект находится в фазе **alpha-разработки** (`v0.1.0-alpha`).Перед масштабным обновлением кода рекомендуется создавать резервную копию данных из экрана настроек.

---

## 📖 Полная Техническая Документация

Вся системная и архитектурная документация разработчика перенесена и поддерживается в директории **[`/docs`](docs/README.md)**.

👉 **[Перейти к Полной Документации Разработчика (`docs/README.md`)](docs/README.md)**

В документации вы найдёте:

- 🚀 [**Overview**](docs/overview/project-overview.md): Архитектура, слои, жизненный цикл и структура репозитория.
- 🛠️ [**Development**](docs/development/getting-started.md): Быстрый запуск, Vitest тесты, Playwright E2E, стандарты кода и CI/CD.
- 💾 [**Data & Persistence**](docs/data/application-state.md): Схема состояния (State v13), IndexedDB (`KitsuneGenkiDB` v4), миграции и бэкапы.
- 🧠 [**Learning System**](docs/learning/learning-system-overview.md): Работа FSRS v5 (`ts-fsrs`), подсистема Mastery (0..4), учебный план и SessionManager.
- 🎯 [**Study Modes**](docs/modes/overview.md): 7 учебных режимов (Multiple Choice, Active Typing, Drawing, Context Production и др.).
- 📚 [**Content System**](docs/content/content-system.md): Схемы JSON-файлов, валидация и добавление новых глав/слов.
- 🎮 [**Minigames**](docs/minigames/overview.md): Кроссворд, Поиск слов, Частицы и выбор слабых слов.
- 📱 [**PWA & SW**](docs/pwa/pwa-overview.md): Service Worker, стратегии кеширования и цикл обновления PWA.

---

## 🚀 Быстрый запуск

### Требования

- Node.js `>= 22.0.0`
- npm `>= 10`

### Команды

```bash
# 1. Установка зависимостей
npm install

# 2. Запуск сервера разработки
npm run dev

# 3. Запуск юнит- и интеграционных тестов
npm test

# 4. Проверка документации
npm run docs:check

# 5. Продашин сборка
npm run build
```

---

## 📄 Лицензия

Проект распространяется под лицензией **GPL-3.0-or-later**.
