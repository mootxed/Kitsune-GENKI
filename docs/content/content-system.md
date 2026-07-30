# Content System Overview — Обзор Контентной Системы

Контентная система KotoKitsu хранит общие справочники и независимые пакеты
курсов в статичных JSON-файлах.

---

## 📂 Структура каталога контента (`public/data/`)

```text
public/data/
├── dictionary/                     # Глобальные статьи, token index и aliases
├── courses/
│   └── genki-1/
│       ├── manifest.json           # Контракт, порядок и ресурсы курса
│       ├── content-index.json      # Лёгкие метаданные уроков
│       ├── lessons/                # Канонические уроки
│       ├── grammar/                # Индекс и интерактивная грамматика
│       ├── exercises/              # Метаданные внешней практики без ответов
│       ├── relations/              # Отношения и orthography capabilities
│       ├── migrations/             # Алиасы локальных ID
│       └── stories/                # Тексты для чтения
├── curated-word-examples.json      # Примерные предложения для слов
├── particles-dictionary.json       # Справочник частиц
└── kanji/                          # Общие данные начертания иероглифов
```

---

## ⚡ Ленивая загрузка (Lazy Loading)

Для снижения объёма первоначально загружаемых данных:

1. Registry выбирает descriptor курса и загружает его `manifest.json`.
2. DictionaryStore один раз загружает независимый глобальный словарь.
3. CourseLoader валидирует manifest и получает объявленные в `dataPaths`
   индексы.
4. Урок, грамматика и история загружаются по package-relative путям только при
   обращении к ним.
5. Vocabulary reference объединяется с `DictionaryEntry`; FSRS получает
   глобальный `dictionaryId`, а `localId` остаётся контекстом курса.
6. Загруженные уроки кешируются в IndexedDB store `content-cache`, а JSON
   пакетов — Service Worker.

Полный контракт и инструкция по добавлению курса:
[course-packages.md](../course-packages.md).
Словарный контракт: [global-dictionary.md](global-dictionary.md).
