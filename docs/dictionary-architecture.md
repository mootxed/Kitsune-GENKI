# Архитектура глобального словаря

Основное направление зависимостей:

```text
CourseVocabularyReference
        ↓ dictionaryId
DictionaryEntry
        ↓
knowledgeItemId / TokenIndex / ExamplesDB
```

`DictionaryStore` принадлежит KotoKitsu Core и загружается независимо от курса.
CourseLoader валидирует ссылку и получает единый merged runtime view. Курсовой
reference управляет введением, переводом и заданиями; статья владеет языковыми
данными; `knowledgeItemId = dictionaryId` владеет FSRS/mastery.

Встроенные статьи immutable. AI-статьи хранятся отдельно в пользовательском словарном хранилище (`user-dict:personal` и системном `user-dict:ai-cache`), переживают reload/смену курса и не могут перезаписать curated entry.
ExamplesDB хранит только примеры и их индекс по `dictionaryId`.

Подробности:

- [схема статьи](content/dictionary-schema.md);
- [гибридная токенизация историй](ai/story-tokenization.md);
- [ссылка курса](content/course-vocabulary-reference.md);
- [индекс и разрешение токенов](content/token-index.md);
- [генерация, миграция, backup и offline](content/global-dictionary.md).
