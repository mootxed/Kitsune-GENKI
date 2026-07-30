# Глобальная словарная база

Глобальный словарь — независимый от курсов источник языковых данных. Курс хранит
только ссылку на словарную статью и собственный учебный контекст; FSRS, mastery,
примеры и токены связываются через один `dictionaryId`.

## Контракты и ID

`DictionaryEntry` содержит стабильный ID вида
`jp-word:<dictionary-form>:<reading>`, словарную форму, каноническое чтение
хираганой, значения, часть речи, классы глагола/прилагательного, переходность,
формы токенов, семантические теги и provenance. Перевод не входит в ID. При
реальной омонимии разрешён детерминированный четвёртый сегмент-disambiguator.

`CourseVocabularyReference` содержит namespaced course ID, `localId`,
`courseId`, `dictionaryId`, `introducedIn`, `courseMeaning`, tags и
контекстные задания. Лингвистические поля в course JSON запрещены.

Пользовательская AI-статья получает ID
`user-word:<dictionary-form>:<reading>`. Она хранится отдельно в
`userDictionaryEntries`; встроенный curated-контент неизменяем и всегда имеет
приоритет при конфликте.

## Артефакты

`public/data/dictionary/` содержит:

- `manifest.json` — версия схемы/контента и пути ресурсов;
- `entries.json` — curated `DictionaryEntry`;
- `token-index.json` — нормализованная форма → массив кандидатов;
- `aliases.json` — legacy/course ID → `dictionaryId`;
- `report.json` — счётчики генерации, дублей и коллизий.

Генератор `scripts/build-dictionary.js` извлекает языковые данные из входного
контента, переписывает лексику курса в ссылки и генерирует формы глаголов через
общий conjugator. Проверка идемпотентности:

```bash
npm run build:dictionary
node scripts/build-dictionary.js --check
npm run validate:dictionary
```

Валидатор запрещает dangling references, циклы aliases, невалидные ID,
расхождение token index и course-specific поля в глобальных статьях.

## Runtime и поиск токенов

`DictionaryStore` загружает manifest и три ресурса одним promise, поэтому
параллельные запросы и переключение курса не дублируют загрузку. Store
регистрирует course references, разрешает aliases, отдаёт статью и список
контекстов введения.

Token index хранит все допустимые кандидаты. При неоднозначности выбирается
контекст активного курса/урока; без достаточных данных возвращается ambiguity,
а не случайная статья. Порядок источников для AI-токена: глобальная база,
локальный/course catalog, личный словарь, затем AI fallback.

## Примеры, FSRS и состояние

`ExamplesDB` индексирует примеры по `dictionaryId`. Очистка course scope при
переключении курса не удаляет глобальные примеры.

FSRS card ID строится из глобального knowledge item ID и skill. Два course
references одного слова используют одну карточку и один mastery archive.
`introducedIn` и локальный reference ID остаются атрибутами курса и учебного
плана.

State v16 переводит SRS, review events/logs, mastery archive, активные сессии и
очереди через generated aliases. При коллизии карточек побеждает запись с более
поздним `lastReview`, затем с большими `reps`, `stability` и лексически большим
исходным ID. Исходные карточки и mapping сохраняются в
`dictionaryMigrationArchive`; события не удаляются. Миграция идемпотентна.

Backup v7 содержит версию curated-базы и только пользовательские/AI-статьи,
aliases и token forms. Curated entries в backup не дублируются. Старые backup
2.0–6.0 импортируются без словарного раздела; невалидная user entry
игнорируется изолированно.

## Offline

Service Worker precache-ит manifest, entries, token index и aliases в отдельный
`CACHE_DICTIONARY`. Эти файлы защищены от LRU и обновляются
stale-while-revalidate независимо от course cache.
