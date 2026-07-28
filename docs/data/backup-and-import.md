# Backup & Export/Import — Резервное копирование

Полный backup создаётся модулем `src/backup-manager.js`.

```json
{
  "app": "kotokitsu",
  "exportType": "full_indexeddb",
  "schemaVersion": "6.0",
  "timestamp": "2026-07-28T10:00:00.000Z",
  "data": {
    "state": {},
    "lessonVersion": "1.0",
    "lastActivityDay": "2026-07-28",
    "theme": "default",
    "reviewLog": [],
    "userDictionaries": [],
    "userDictionaryEntries": [],
    "userDictionaryImportProfiles": []
  }
}
```

OpenRouter API key в `state.settings.openrouterKey` при export всегда заменяется
пустой строкой. При import ключ из файла никогда не принимается.

`validateImportData()` выполняет:

1. Zod-валидацию формата, state, FSRS/review данных и пользовательских словарей.
2. Проверку версии `6.0` либо поддерживаемой legacy-версии `2.0`–`5.0`.
3. Атомарную замену связанных IndexedDB stores.
4. Rollback на предварительный snapshot при ошибке транзакции.

Отдельный экспорт пользовательского словаря описан в
[документе пользовательских словарей](../user-dictionaries.md) и не содержит FSRS.
