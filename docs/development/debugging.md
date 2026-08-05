# Debugging & Diagnostics — Отладка и Диагностика

В этом документе приведены инструкции по отладке хранилища, состояния, Service Worker и сессий в проекте **KotoKitsu**.

---

## 🛠️ Инспекция состояния в Chrome DevTools

### 1. Просмотр текущего State

1. Откройте **Chrome DevTools** (`F12` или `Ctrl+Shift+I`).
2. Перейдите во вкладку **Application** (Приложение) → **IndexedDB** → `KitsuneGenkiDB` → `app_state`.
3. Запись с ключом `state` содержит полный JSON-снапшот текущего состояния приложения (см. [справочник версий](../reference/generated-versions.md)).

### 2. Сброс состояния разработки (Reset State)

Если вам необходимо сбросить данные к начальному состоянию:

- На экране настроек (`#/settings`) нажмите **«Сбросить весь прогресс»**.
- Либо выполните в консоли браузера:
  ```javascript
  indexedDB.deleteDatabase('KitsuneGenkiDB');
  localStorage.clear();
  location.reload();
  ```

---

## 📶 Отладка Service Worker и offline-режима

1. Откройте **DevTools** → **Application** → **Service Workers**.
2. Убедитесь, что `sw.js` зарегистрирован и находится в статусе `activated and is running`.
3. Для проверки работы офлайн включите чекбокс **Offline** во вкладке Network или Application.
4. Обновите страницу — приложение должно продолжить функционировать из кэша.

---

## 📜 Журнал диагностических логов (Review Logs)

Все произошедшие FSRS review записываются в store `review_log` в IndexedDB.
Вы можете просмореть историю через DevTools → IndexedDB → `KitsuneGenkiDB` → `review_log` или использовать модульные функции из `src/review-log.js`.

---

## 🚨 Ошибки непригодных карточек (UNRENDERABLE_SRS_CARD)

При появлении битых карточек приложение формирует структурированную запись диагностики `recordDiagnosticError`:

- **Коды причин**: `MISSING_WORD_DATA`, `MISSING_DICTIONARY_ENTRY`, `MISSING_DICTIONARY_ID`, `MISSING_KNOWLEDGE_ITEM`, `INVALID_CARD_ID`, `MISSING_TASK_DATA`.
- **Экспорт отчёта**: Пользователь может экспортировать диагностику через кнопку в уведомлении или экрана завершения, вызывая `exportDiagnosticReport(state)` из `src/diagnostics.js`.
- **Тестирование**: Модуль валидации `validateRenderableCard(card, context)` в `src/card-validator.js` тестируется в `tests/unrenderable-cards.test.js`.
