# Vocabulary Schema — GENKI I

Обязательный формат словарной записи:

```json
{
  "id": "L3_V001",
  "lesson": 3,
  "writtenForm": "映画",
  "reading": "えいが",
  "meaning": "фильм"
}
```

- `id` уникален во всём словаре и сохраняется при надёжном сопоставлении со старой записью.
- `lesson` — урок первого введения слова по канонической таблице.
- `writtenForm` — первая колонка XLSX. Для технического `-` используется `reading`.
- `reading` — чтение каной.
- `meaning` — перевод из XLSX без языковых исправлений по догадке.

Дополнительные проверенные метаданные (`category`, `romaji`, часть речи, примеры, context-production) могут присутствовать. Legacy-поля `kanji`, `writing`, `translation` запрещены в JSON и создаются только временным runtime-адаптером `normalizeWord`.

Поздние дубли перенаправляются через
`public/data/courses/genki-1/migrations/vocabulary-aliases.json`. Активный FSRS
использует namespaced ID вида `genki-1:vocabulary:L3_V001`; исходное состояние
объединённых или удалённых карточек хранится в
`state.vocabularyMigrationArchive`.

Порядок открытия кандзи задаётся исключительно
`public/data/courses/genki-1/relations/kanji-availability.json`.

Импорт:

```bash
node scripts/import-genki-i-data.js \
  --words "/path/to/words.xlsx" \
  --kanji "/path/to/kanji.xlsx" \
  --write
```

Повторный запуск с `--check` завершается ненулевым кодом, если артефакты устарели.
