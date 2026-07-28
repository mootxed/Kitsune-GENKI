# Пользовательские словари

## Модель и версия схемы

Пользовательский словарь — самостоятельная сущность, а не FSRS-очередь и не часть
встроенного курса. Текущая публичная и внутренняя `schemaVersion` — `1`.

Словарь содержит namespaced `id` (`user-dict:<uuid>`), название, описание, даты,
`sourceType` и `schemaVersion`. Запись содержит `id` (`user-word:<uuid>`),
`dictionaryId`, `writing`, `reading`, массивы `meanings`, вариантов, частей речи и
тегов, примеры, заметку, источник, `learningEnabled`, даты и версию схемы.

Минимум записи: непустое `writing` или `reading` и хотя бы один непустой meaning.
Приложение не придумывает чтение, перевод или пример. `entryKey` и `searchText` —
производные внутренние поля и пересчитываются из отображаемых данных.

Все канонические модели проверяются строгими Zod-схемами: неизвестные поля в них не
принимаются.

## IndexedDB

Имя legacy-базы остаётся `KitsuneGenkiDB`. Версия IndexedDB поднята до `6`; миграция
создаёт без очистки прежних данных:

- `userDictionaries`, key path `id`, индекс `updatedAt`;
- `userDictionaryEntries`, key path `id`, индексы `dictionaryId`,
  `dictionaryId_entryKey` и `learningEnabled`;
- `userDictionaryImportProfiles`, key path `id`, индекс `name`.

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

Преобразования первой версии: разделители значений и тегов, trim, пустое как
отсутствие, удаление HTML и ключ объекта как написание. Профиль сохраняет формат,
путь коллекции, mapping и преобразования; его можно повторно применить или удалить.

### Ограничения и защита

- максимум 10 МБ на файл;
- максимум 20 000 записей;
- максимум 20 уровней JSON;
- длины и количества полей заданы в `USER_DICTIONARY_LIMITS`;
- отклоняются `__proto__`, `prototype`, `constructor`, чрезмерные строки и типы;
- пользовательский текст выводится через `textContent`;
- CSV export добавляет апостроф перед `=`, `+`, `-`, `@`.

## Дубликаты

Ключ — нормализованные `writing + reading`; без чтения используется writing.
Перевод не является ключом. Доступны `skip`, `merge`, `replace`, `separate`.

Merge дедуплицирует meanings, tags, варианты и примеры, не стирает чтение пустым,
сохраняет существующую заметку и стабильный ID. Replace сохраняет существующие
`id`, `createdAt` и включённое обучение. Замены без выбранного правила нет.

## FSRS, capabilities и обучение

Обычный import оставляет `learningEnabled: false` и не меняет FSRS/state. Пользователь
отдельно выбирает импорт только в словарь, выбранные или все допустимые слова.

`createKnowledgeItemFromUserEntry` — граница между записью и knowledge item. ID
остаётся в namespace `user-word:`. Сначала создаётся recognition-карточка, затем
остальные навыки открываются общим `vocabularySkillsReadyForIntroduction`. Основная
FSRS-модель не менялась.

Capabilities:

- recognition — есть японское написание/чтение и meaning;
- recall/active production — typing capability создала проверяемый ответ;
- drawing — общее capability-правило обнаружило кандзи;
- context production — есть структурированное задание с prompt, meaning cue,
  accepted answers и required form.

Обычный пример не становится context-production заданием.

Исключение из обучения приостанавливает карточки и сохраняет прогресс. Удаление
обучаемой записи требует подтверждения и удаляет карточки, review events, pending
review logs и mastery archive, не оставляя dangling references.

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

Полный backup приложения версии `6.0` включает три пользовательских stores. Связанные
карточки и прогресс уже входят в state/review log. API-ключ обнуляется при export и
игнорируется при import. Restore заменяет stores и остальную backup-нагрузку в одной
транзакции; повторный restore идемпотентен по стабильным ID.

## Ограничения первой версии

Не поддерживаются APKG/Anki SQLite, ZIP Yomitan, облако и сложный язык выражений.
JSON parser не угадывает произвольную семантику. Выбор отдельных слов во время import
ограничен preview; после import доступен полный массовый выбор на экране словаря.
