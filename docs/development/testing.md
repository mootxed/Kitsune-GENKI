# Testing Guide — Руководство по Тестированию

Проект **KotoKitsu** содержит развитую инфраструктуру тестирования, покрывающую доменную логику, состояние, интерфейс, доступность, стойкость хранилища и PWA/Service Worker сценарии.

---

## 🌐 Матрица поддерживаемых браузеров и наборов

| Набор              | Chromium Desktop | Chromium Mobile      | Firefox        | WebKit        |
| ------------------ | ---------------- | -------------------- | -------------- | ------------- |
| Unit / integration | ✅               | N/A                  | N/A            | N/A           |
| Full E2E           | ✅ (`chromium`)  | ✅ (`Mobile Chrome`) | ❌             | ❌            |
| Smoke E2E          | ✅ (`chromium`)  | при необходимости    | ✅ (`firefox`) | ✅ (`webkit`) |
| PWA install/update | ✅               | ✅                   | ограниченно    | ограниченно   |

> [!NOTE]
> Полный E2E-набор выполняется в Chromium desktop и mobile. Критические smoke-сценарии дополнительно проверяются в Firefox и WebKit.

---

## 🏃 Запуск тестов

### 1. Юнит- и Интеграционные тесты с обязательным покрытием (Vitest)

```bash
# Быстрый запуск юнит-тестов
npm test

# Запуск с проверкой порогов покрытия (mandatory coverage)
npm run test:coverage

# Watch mode при разработке
npm run test:watch
```

### 2. End-to-End тесты (Playwright)

```bash
# Полный прогон E2E тестов в Chromium
npm run test:e2e

# Запуск только кроссбраузерного smoke-набора (Chromium, Firefox, WebKit)
npm run test:e2e:smoke
npm run test:e2e:cross-browser

# Запуск PWA и устойчивости хранилища
npm run test:e2e:pwa
npm run test:e2e:offline
npm run test:e2e:storage
npm run test:e2e:multitab
```

### 3. Проверка артефактов и документации

```bash
# Проверка ссылок и структуры документации
npm run docs:check

# Проверка и сборка готового production-артефакта dist
npm run build
```

---

## 📊 Пороги покрытия кода (Coverage Policy)

Coverage запускается через `npm run test:coverage`. В `vitest.config.js` зафиксированы минимальные блокирующие пороги:

- **Глобальные пороги**: Lines 70%, Functions 60%, Branches 70%, Statements 70%
- **State (`state/**`)**: Lines 80%, Functions 70%, Branches 80%, Statements 80%
- **SRS/FSRS (`srs.js`, `src/srs-*.js`)**: Lines 85%, Functions 80%, Branches 80%, Statements 85%
- **Mastery (`src/mastery.js`, `achievements.js`, `quests.js`)**: Lines 85%, Functions 80%, Branches 80%, Statements 85%
- **Study Plan (`studyplan.js`, `src/study-plan-creation.js`, `src/daily-plan.js`)**: Lines 80%, Functions 75%, Branches 70%, Statements 80%
- **Migrations (`src/migration.js`, `src/courses/genki-1/migrations/**`)**: Lines 90%, Functions 80%, Branches 85%, Statements 90%
- **Dictionary (`src/dictionary/**`, `src/user-dictionaries/**`)**: Lines 75%, Functions 65%, Branches 75%, Statements 80%

---

## 🏗️ Принцип единого CI/CD артефакта

В GitHub Actions CI/CD развёртывается именно тот артефакт `dist`, который прошел сборку и все E2E тесты.
Deploy job **не выполняет** `npm install`, `npm test` или `npm run build` повторно.

---

## 📱 Чек-лист для ручного тестирования PWA установки

1. **Chromium Desktop**:
   - Открыть приложение по HTTPS / localhost.
   - Проверить появление иконки установки в адресной строке.
   - Установить приложение и запустить из ярлыка ярлык в автономном окне.
   - Отключить сеть и убедиться, что приложение открывается offline.

2. **Android Chromium**:
   - Открыть приложение в Chrome for Android.
   - Нажать «Добавить на главный экран» / «Установить PWA».
   - Убедиться, что при открытии из ярлыка отображается сплэш-скрин и приложение работает offline.
