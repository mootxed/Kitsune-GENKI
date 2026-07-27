# Content System Overview — Обзор Контентной Системы

Контентная система **Kitsune-GENKI** хранит учебные материалы в формате статичных JSON-файлов в директории `public/data/`.

---

## 📂 Структура каталога контента (`public/data/`)

```text
public/data/
├── content-index.json              # Манифест контента и метаданные глав
├── curated-word-examples.json      # Примерные предложения для слов
├── supplemental-practice.json      # Внешние сопроводительные упражнения
├── particles-dictionary.json       # Справочник частиц
├── lessons/                        # Файлы уроков по главам (genki-lesson-01.json ...)
├── grammar-quizzes/                # Грамматические интерактивные тесты
├── kanji/                          # Данные начертания иероглифов
└── stories/                        # Тексты для чтения
```

---

## ⚡ Ленивая загрузка (Lazy Loading)

Для снижения объёма первоначально загружаемых данных:

1. Загружается только легкий файл `content-index.json`.
2. Файлы конкретных уроков (`lessons/genki-lesson-XX.json`) загружаются динамически функцией `loadLesson(chapterNum)` из `src/content-loader.js` при переходе пользователя к соответствующей главе или карточкам.
3. Загруженные уроки кешируются в IndexedDB store `content-cache` и Service Worker.
