# Схема DictionaryEntry

`DictionaryEntry` — одна глобальная японская лексема. Обязательные и
нормализованные поля описаны строгой Zod-схемой в
`src/dictionary/dictionary-contract.js`.

```json
{
  "schemaVersion": 1,
  "id": "jp-word:食べる:たべる",
  "dictionaryForm": "食べる",
  "reading": "たべる",
  "meanings": ["есть", "кушать"],
  "partOfSpeech": "verb",
  "verbClass": "ichidan",
  "adjectiveClass": null,
  "transitivity": null,
  "tokenForms": ["食べる", "たべる", "食べます", "食べて"],
  "semanticTags": [],
  "source": "curated",
  "confidence": 1,
  "provenance": { "sourceType": "kotokitsu-content" }
}
```

ID строится после NFKC и канонизации чтения в хирагану. Перевод, курс и урок в
ID не входят. Разные чтения остаются разными статьями. При доказанной омонимии
можно задать стабильный disambiguator:
`jp-word:<form>:<reading>:<sense-id>`. Его же можно использовать как отдельный
knowledge item для sense-aware FSRS; автоматического разделения по
`courseMeaning` нет.

Чтобы добавить слово, внесите его в проверенный content/import pipeline и
запустите `npm run build:dictionary`. Не редактируйте одновременно course JSON
и `entries.json`: course JSON хранит только reference.
