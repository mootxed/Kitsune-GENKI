# Practice Modes Overview — Обзор Учебных Режимов

В **KotoKitsu** реализовано 7 специализированных режимов взаимодействия с обучающим контентом (`ui/flashcards/card-modes.js`).

---

## 🧭 Режимы FSRS vs Дополнительная практика

```text
Учебные режимы приложения
├── Основные FSRS режимы (Влияют на карточки повторений)
│   ├── Multiple Choice (Распознавание)
│   ├── Active Typing (Ввод с клавиатуры)
│   ├── Drawing Mode (Рукописный ввод кандзи)
│   ├── Context Sentence (Чтение в предложении)
│   ├── Context Production (Активное создание формы)
│   ├── Particle Quiz (Выбор частиц)
│   └── Sentence Building (Сборка предложений)
└── Вспомогательные мини-игры (Supplemental Practice, НЕ меняют FSRS)
    ├── Crossword
    ├── Word Search
    └── Particles Game
```

---

## 📋 Таблица соответствия режимов и навыков

| Режим UI (`mode`)    | Ограничение навыков (`skill`)              | Ввод пользователя                   | Основной файл реализации        |
| :------------------- | :----------------------------------------- | :---------------------------------- | :------------------------------ |
| `multiple-choice`    | `vocabulary-meaning`, `vocabulary-reading` | Клик по 1 из 4 вариантов            | `ui/flashcards/card-modes.js`   |
| `active-typing`      | `vocabulary-meaning`, `vocabulary-reading` | Набор текста (Romaji/Kana)          | `ui/flashcards/card-modes.js`   |
| `drawing`            | `kanji-writing`                            | Рисование штрихов иероглифа         | `ui/flashcards/drawing-mode.js` |
| `context-sentence`   | `vocabulary-reading`, `grammar`            | Чтение и ввод чтения                | `ui/flashcards/card-modes.js`   |
| `context-production` | `context-production`                       | Ввод требуемой грамматической формы | `ui/flashcards/card-modes.js`   |
| `particle-quiz`      | `particle-selection`                       | Выбор частицы в пропуске            | `ui/flashcards/card-modes.js`   |
| `sentence-building`  | `sentence-building`                        | Упорядочивание блоков слов          | `ui/flashcards/card-modes.js`   |
