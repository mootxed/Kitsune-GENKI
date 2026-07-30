# Vocabulary References — GENKI I

Урок содержит не словарную статью, а ссылку на глобальную базу:

```json
{
  "id": "genki-1:vocabulary:L3_V001",
  "localId": "L3_V001",
  "courseId": "genki-1",
  "dictionaryId": "jp-word:映画:えいが",
  "introducedIn": "genki-1:lesson-3",
  "courseMeaning": "фильм",
  "tags": ["culture"]
}
```

- `id` уникален в package/runtime, а `localId` стабилен внутри курса.
- `dictionaryId` указывает на `public/data/dictionary/entries.json`.
- `introducedIn` и `courseMeaning` принадлежат только курсу.
- `writtenForm`, `reading`, часть речи и token forms принадлежат глобальной
  статье и запрещены в lesson JSON.

CourseLoader объединяет reference со статьёй только в runtime. Полный контракт,
ID-модель, генерация и миграции описаны в
[глобальной словарной базе](global-dictionary.md).

Поздние дубли перенаправляются через
`public/data/courses/genki-1/migrations/vocabulary-aliases.json`, а legacy и
course ID — через `public/data/dictionary/aliases.json`. Активный FSRS
использует глобальный `dictionaryId`.

Порядок открытия кандзи задаётся исключительно
`public/data/courses/genki-1/relations/kanji-availability.json`.

Импорт:

```bash
node scripts/import-genki-i-data.js \
  --words "/path/to/words.xlsx" \
  --kanji "/path/to/kanji.xlsx" \
  --write
```

Importer восстанавливает лингвистический baseline из глобальной базы. После
`--write` он автоматически запускает генератор словаря и возвращает lesson JSON
к reference-only форме.
