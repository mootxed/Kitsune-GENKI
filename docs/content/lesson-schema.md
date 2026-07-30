# Lesson Schema — GENKI I

Уроки 1–12 хранятся внутри пакета
`public/data/courses/genki-1/lessons/lesson-XX.json`. XLSX не читаются
приложением во время работы.

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

`notes` содержит локальные ID грамматических тем вида `L3_g1`. Полный
интерактивный материал загружается из
`public/data/courses/genki-1/grammar/lesson-XX.json` и объединяется по тому же
локальному ID. CourseLoader выдаёт runtime ID
`genki-1:grammar:L3_g1`.

Метаданные Workbook загружаются отдельно и не содержат ответов.

Resource paths in `manifest.json` and `content-index.json` can be declared as strings (`"./stories/story-01.json"`) or object descriptors (`{ "path": "./stories/story-01.json", "optional": true }`). String declarations are mandatory by default (`optional: false`). Absence of a resource declaration indicates that the lesson/course does not include that resource.

Автоматические инварианты проверяют `npm run validate:courses` и
`npm run validate:genki`.
