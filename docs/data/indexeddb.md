# IndexedDB & Persistence — Хранилище Данных

В этом документе описывается устройство клиентской базы данных **KitsuneGenkiDB** (`src/db.js`).

---

## 🗄️ Спецификация базы данных

- **Имя базы данных**: `KitsuneGenkiDB`
- **Текущая версия DB**: `DB_VERSION = 7`

---

## 📑 Object Stores (Таблицы)

`KitsuneGenkiDB` содержит 8 специализированных хранилищ (Object Stores):

| Object Store (`STORES`)        | Ключ (KeyPath) | Индексы                                                                     | Назначение                                                               |
| :----------------------------- | :------------- | :-------------------------------------------------------------------------- | :----------------------------------------------------------------------- |
| `app_state`                    | `id` (string)  | —                                                                           | Основное состояние приложения (ключ `'state'`).                          |
| `content_cache`                | `key` (string) | —                                                                           | Кэш загруженных глав Genki, грамматики и иероглифов.                     |
| `ui_preferences`               | `key` (string) | —                                                                           | Позабытые UI настройки (тема, флаг выполненной миграции `idb_migrated`). |
| `review_log`                   | `id` (auto)    | `cardId`, `timestamp`, `reviewedAt`, составные индексы, `itemId`, `eventId` | Append-only журнал FSRS повторений.                                      |
| `active_session`               | `id` (string)  | —                                                                           | Незавершённая учебная сессия.                                            |
| `userDictionaries`             | `id` (string)  | `updatedAt`                                                                 | Метаданные пользовательских словарей.                                    |
| `userDictionaryEntries`        | `id` (string)  | `dictionaryId`, `dictionaryId_entryKey`, `learningEnabled`                  | Нормализованные пользовательские записи.                                 |
| `userDictionaryImportProfiles` | `id` (string)  | `name`                                                                      | Сохранённые mapping-профили импорта.                                     |

---

## 🔄 Миграции и Очистка Данных

1. **Миграция v6 → v7**: Поднимает версию IndexedDB до 7 и гарантирует наличие индекса `itemId` у существующих Object Store `review_log` без удаления или сброса существующих журналов, `app_state` и пользовательских словарей.
2. **Атомарная очистка review_log**: Удаление пользовательского слова или словаря в единой транзакции очищает связанные записи `review_log`. Очистка использует индекс `itemId`, а при его отсутствии в нештатно мигрированных/legacy базах — fallback-cursor со строгой проверкой `itemId` и доказуемо связанных legacy `cardId` (`entryId` или `${entryId}::*`). Legacy-записи без надёжной связи с элементом намеренно не затрагиваются.

---

## 🔄 Graceful Degradation и Fallback

При недоступности IndexedDB (например, в приватном режиме старых браузеров или при фатальной ошибке открытии базы):

1. `src/db.js` автоматически переключается в режим **In-Memory / localStorage Fallback**.
2. Приложение продолжает полностью функционировать без потери текущей сессии.
3. В консоли фиксируется предупреждение `[DB] Falling back to memory storage`.
