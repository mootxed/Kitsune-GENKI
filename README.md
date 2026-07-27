# 🦊 KotoKitsu

> KotoKitsu — независимый оффлайн-ориентированный PWA-тренажёр для изучения японского языка с системой интервальных повторений (FSRS).

> [!WARNING]
> Проект находится в фазе **alpha-разработки** (`v0.1.0-alpha`). Перед масштабным обновлением кода рекомендуется создавать резервную копию данных из экрана настроек.

---

## ⚖️ Описание проекта / Project Overview

**Русский:**

> KotoKitsu — независимый открытый проект для изучения японского языка. Разработка ведётся физическим лицом из Российской Федерации. Приложение можно использовать самостоятельно или вместе с внешними учебными материалами.

**English:**

> KotoKitsu is an independent open-source project for Japanese language learning developed by a physical person based in the Russian Federation.

---

## 📖 Документация Проекта

Полная документация разработчика и юридическая архитектура поддерживаются в директории **[`/docs`](docs/README.md)**.

- 🚀 [**Overview**](docs/overview/project-overview.md): Архитектура, слои, жизненный цикл и структура репозитория.
- ⚖️ [**Legal Documentation**](docs/legal/README.md): Модель лицензирования, происхождение ресурсов и юридический статус.
- 🛠️ [**Development**](docs/development/getting-started.md): Быстрый запуск, Vitest тесты, Playwright E2E, стандарты кода и CI/CD.
- 💾 [**Data & Persistence**](docs/data/application-state.md): Схема состояния (State v13), IndexedDB (`KitsuneGenkiDB` v4), миграции и бэкапы.
- 🧠 [**Learning System**](docs/learning/learning-system-overview.md): Работа FSRS v5 (`ts-fsrs`), подсистема Mastery (0..4), учебный план и SessionManager.
- 🎯 [**Study Modes**](docs/modes/overview.md): 7 учебных режимов.
- 📚 [**Content System**](docs/content/content-system.md): Схемы JSON-файлов и уроков.
- 📱 [**PWA & SW**](docs/pwa/pwa-overview.md): Service Worker, кеширование и обновление PWA.

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

# 3. Запуск тестов
npm test

# 4. Проверка юридических метаданных
npm run legal:check

# 5. Продашен сборка
npm run build
```

---

## 📄 Лицензирование и Правовая Информация

Права на материалы проекта разделены по типам ресурсов:

- 💻 **Программный код**: Распространяется под лицензией **[GPL-3.0-or-later](LICENSE)**. См. [LEGAL.md](LEGAL.md).
- 📚 **Учебный контент**: Оригинальный учебный контент и структура выделены из GPL-3.0. См. [CONTENT_LICENSE.md](CONTENT_LICENSE.md).
- 🎨 **Сторонние ресурсы и графика**:
  - Иконки рангов: Vector Ranks by RhosGFX ([CC0 1.0 Universal](public/licenses/CC0-1.0.txt)). См. [docs/legal/asset-provenance.md](docs/legal/asset-provenance.md).
  - Анимации черт кандзи: hanzi-writer & @k1low/hanzi-writer-data-jp. См. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- 🔒 **Конфиденциальность**: Приложение работает локально. Правила взаимодействия с AI описаны в [PRIVACY.md](PRIVACY.md).
- 🏷️ **Товарные знаки**: Регистрация товарного знака не заявляется. См. [TRADEMARKS.md](TRADEMARKS.md).

