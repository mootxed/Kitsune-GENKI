# Lesson Schema — GENKI I

Уроки 1–12 хранятся в `public/data/lessons/lesson-XX.json`. XLSX не читаются приложением во время работы.

```json
{
  "schemaVersion": 2,
  "version": 1,
  "lesson": {
    "lesson_id": 3,
    "title": "Урок 3",
    "vocabulary": [],
    "notes": [],
    "cultural_notes": []
  }
}
```

`vocabulary` — канонический словарь урока. Runtime преобразует его в `lesson.words`, но второго контентного источника не существует.

`notes` содержит грамматические темы с ID вида `L3_g1`. Полный интерактивный материал загружается из `public/data/grammar-quizzes/lesson-XX.json` и объединяется по тому же ID.

Метаданные Workbook загружаются отдельно и не содержат ответов.

Автоматические инварианты проверяет `npm run validate:genki`.
