# Схема CourseVocabularyReference

Course reference отвечает только за учебный контекст:

```json
{
  "id": "genki-1:vocabulary:L3_V012",
  "localId": "L3_V012",
  "courseId": "genki-1",
  "dictionaryId": "jp-word:食べる:たべる",
  "introducedIn": "genki-1:lesson-3",
  "courseMeaning": "есть",
  "tags": ["verbs_ru"],
  "note": null,
  "contextProduction": null,
  "acceptedAnswers": null
}
```

Другой курс ссылается на тот же `dictionaryId`, но может задать собственные
`id`, `introducedIn`, meaning, tags, примеры и задания. Это не создаёт вторую
статью или новую FSRS-карточку.

`resolveCourseVocabulary(reference, entry)` — единственное место объединения.
Compatibility-поля `kanji`, `writtenForm`, `writing`, `translation`, `meaning`
и `lexemeId` пока возвращаются для старого UI, но их языковые значения берутся
из `DictionaryEntry`.

Broken reference является ошибкой course package; CourseLoader и
`validate:courses` не создают статью через AI fallback.
