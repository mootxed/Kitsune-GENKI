# Пользовательские словари

## Модель и версия схемы

Пользовательский словарь — самостоятельная сущность, а не FSRS-очередь и не часть
встроенного курса. Текущая публичная и внутренняя `schemaVersion` — `1`.

Словарь содержит namespaced `id` (`user-dict:<uuid>`), название, описание, даты,
`sourceType` и `schemaVersion`. Запись содержит `id` (`user-word:<uuid>`),
`dictionaryId`, `writing`, `reading`, массивы `meanings`, вариантов, частей речи и
тегов, примеры, заметку, источник, `learningEnabled`, даты и версию схемы.

AI-запись дополнительно имеет стабильный глобальный `globalDictionaryId` вида
`user-word:<form>:<reading>`, token forms, confidence и verified. Она хранится
отдельно от curated-базы. Если глобальная curated-статья уже существует, она
побеждает, а пользовательская запись не перезаписывает её.

Минимум записи: непустое `writing` или `reading` и хотя бы один непустой meaning.
Приложение не придумывает чтение, перевод или пример. `entryKey` и `searchText` —
производные внутренние поля и пересчитываются из отображаемых данных.

Все канонические модели проверяются строгими Zod-схемами: неизвестные поля в них не
принимаются.

## IndexedDB

Имя legacy-базы остаётся `KitsuneGenkiDB`. Версия IndexedDB поднята до `7`; миграция v6 → v7
добавляет индекс `review_log.itemId` для существующих установок без очистки прежних данных:

- `userDictionaries`, key path `id`, индекс `updatedAt`;
- `userDictionaryEntries`, key path `id`, индексы `dictionaryId`,
  `dictionaryId_entryKey` и `learningEnabled`;
- `userDictionaryImportProfiles`, key path `id`, индекс `name`;
- `review_log`, индекс `itemId` (добавлен в v7 для существующих и новых баз).

Полные записи не помещаются в state snapshot. Массовый import записывает словарь,
entries и, только при явном выборе обучения, обновлённый state в одной транзакции.

## Нормализация и поиск

`normalizeUserDictionaryEntry` преобразует внешнюю запись в каноническую модель.
`normalizeMeanings` и `normalizeTags` принимают массивы и строки с разделителями.
`normalizeJapaneseForComparison` выполняет NFKC, приводит катакану к хирагане и
убирает нейтральную пунктуацию. Исходное отображаемое написание сохраняется.

Поиск использует заранее рассчитанный `searchText`, debounce 180 мс и пагинацию по
100 записей. Индекс включает написание, чтение, значения, варианты, теги и заметку.

## Импорт

Поддерживаются `.json`, `.csv`, `.tsv`. Pipeline:

1. проверка размера и определение формата;
2. безопасный parse и выбор JSON-коллекции;
3. предложение mapping по aliases;
4. применение преобразований;
5. нормализация и Zod-валидация;
6. preview с исходным номером и точной причиной ошибки;
7. разрешение конфликтов;
8. единый транзакционный commit.

JSON может быть корневым массивом, содержать `entries`, `words`, `items`, `data` или
`dictionary.entries`, либо быть object dictionary. Пользователь может выбрать другой
найденный путь и использовать ключ объекта как `writing`.

CSV/TSV parser поддерживает BOM, quoted fields, удвоенные кавычки, пустые колонки и
переносы строк внутри quoted field. Разделитель — запятая, точка с запятой или tab.

Mapping поддерживает `writing`, `reading`, `meanings`, `alternativeWritings`,
`partOfSpeech`, `tags`, `examples.japanese`, `examples.translation`, `notes` и
`externalId`. Автоматическое сопоставление — только предложение, доступное для
ручного исправления.

Преобразования первой версии: разделители значений и тегов, удаление HTML и ключ объекта как написание. Настройки trim и emptyAsMissing исключены из схемы профилей, так как пробелы обрезаются безусловно при нормализации. Профиль сохраняет формат, путь коллекции `collectionPath`, mapping и преобразования; его можно повторно применить или удалить. При повторном импорте `collectionPath` применяется автоматически.

### Ограничения и защита

- максимум 10 МБ на файл;
- максимум 20 000 записей;
- максимум 20 уровней JSON;
- длины и количества полей заданы в `USER_DICTIONARY_LIMITS`;
- `writing` поддерживает смешанный Unicode (ASCII + японский, например `Tシャツ`, `3つ`), но отклоняет управляющие символы (0x00–0x1F, 0x7F–0x9F); `reading` строго ограничен японскими символами;
- отклоняются `__proto__`, `prototype`, `constructor`, чрезмерные строки и типы;
- пользовательский текст выводится через `textContent`;
- CSV export добавляет апостроф перед `=`, `+`, `-`, `@`.

## Дубликаты

Ключ — нормализованные `writing + reading`; без чтения используется writing.
Перевод не является ключом. Доступны `skip`, `merge`, `replace`, `separate`.

Детекция дубликатов выполняется как для имеющихся записей в БД, так и внутри самого импортируемого файла (`intraFileDuplicates`). По умолчанию дубликаты внутри файла пропукаются (сохраняется только первое вхождение).

Merge дедуплицирует meanings, tags, варианты и примеры, не стирает чтение пустым,
сохраняет существующую заметку и стабильный ID. Replace сохраняет существующие
`id`, `createdAt`, `globalDictionaryId` и включённое обучение. Замены без
выбранного правила нет.

## FSRS, capabilities и обучение

Обычный import оставляет `learningEnabled: false` и не меняет FSRS/state. Пользователь
отдельно выбирает импорт только в словарь, выбранные или все допустимые слова.

При строгом импорте `.kotokitsu.json` записи нормализуются напрямую без ручного mapping, создаются новые namespaced ID для предотвращения коллизий, а FSRS-состояние экспорта не переносится.

`createKnowledgeItemFromUserEntry` — граница между записью и knowledge item.
Создаёт как `russian`, так и `translation` для полной совместимости со всеми
типами карточек. Для AI-entry knowledge ID равен стабильному
`globalDictionaryId`; локальный record ID остаётся ключом IndexedDB. Сначала
создаётся recognition-карточка, затем остальные навыки открываются общим
`vocabularySkillsReadyForIntroduction`.

Capabilities:

- recognition — есть японское написание/чтение и meaning;
- recall/active production — typing capability создала проверяемый ответ;
- drawing — общее capability-правило обнаружило кандзи;
- context production — есть структурированное задание с prompt, meaning cue,
  accepted answers и required form.

Обычный пример не становится context-production заданием.

Динамическое изменение полей записи приводит к согласованию (reconcile) карточек в `syncUserEntryCards`: карточки недоступных навыков (например, при удалении кандзи из записи) приостанавливаются с причиной `suspendedReason: 'capability-removed'`. При повторном появлении навыка такие карточки автоматически возобновляются без потери накопленного FSRS-прогресса. Редактирование записи в UI выполняется атомарно через `updateUserEntryWithSync`.

Исключение из обучения приостанавливает карточки с `suspendedReason: 'learning-disabled'`. Удаление записи или словаря (независимо от текущего флага `learningEnabled`) полностью удаляет карточки, review events, pending review logs, записи `review_log` (через индекс `itemId` или fallback-cursor для связанных legacy `cardId`) и mastery archive в единой транзакции, не оставляя dangling references.

## Мини-игры

Пользовательские knowledge items добавляются в runtime-каталог. В мини-игры они
проходят только при `learningEnabled === true`, совместимых полях и существующем
mastery `Уверенно` или `Освоено`. Weak mode использует общий FSRS/weakness selector.
Результат мини-игры не создаёт review event и не меняет FSRS/mastery.

## Export и backup

Отдельный JSON export:

```json
{
  "format": "kotokitsu-dictionary",
  "schemaVersion": 1,
  "exportedAt": "2026-07-28T10:00:00.000Z",
  "dictionary": {},
  "entries": []
}
```

CSV содержит `writing`, `reading`, `meanings`, `tags`, `notes`, `learningEnabled`.
Отдельный export не содержит FSRS, API-ключ, настройки или несвязанный прогресс.

Полный backup приложения версии `7.0` включает три пользовательских stores и
словарный раздел с curated content version, AI/user entries, aliases и token
forms. Curated articles не копируются. Backup 2.0–6.0 остаются совместимыми, а
одна повреждённая AI-entry не блокирует остальные данные. Связанные карточки и
прогресс уже входят в state/review log. API-ключ обнуляется при export и
игнорируется при import. Restore заменяет stores и остальную backup-нагрузку в
одной транзакции; повторный restore идемпотентен по стабильным ID.

## Ограничения первой версии

Не поддерживаются APKG/Anki SQLite, ZIP Yomitan, облако и сложный язык выражений.
JSON parser не угадывает произвольную семантику. Выбор отдельных слов во время import
ограничен preview; после import доступен полный массовый выбор на экране словаря.
