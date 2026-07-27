# Lesson Schema — Схема Файла Урока

В этом документе опиcана формальная схема JSON-файлов уроков (`public/data/lessons/genki-lesson-XX.json`).

---

## 📑 Корневая структура урока

```json
{
  "chapter": 1,
  "title": "New Friends",
  "titleJa": "新しいともだち",
  "description": "Greetings, Numbers, Time, Major",
  "vocabulary": [ ... ],
  "grammar": [ ... ],
  "kanji": [ ... ],
  "cultureNote": { ... }
}
```

---

## 🆔 Правила именования Идентификаторов (ID Rules)

- Идентификаторы элементов уникальны в рамках всего приложения.
- **Лексика**: `genki{Book}_l{Chapter}_v{Index}` (например, `genki1_l1_v1`).
- **Грамматика**: `genki{Book}_l{Chapter}_g{Index}` (например, `genki1_l1_g1`).
- **Кандзи**: `kanji_{CharacterHex}` или `kanji_{Index}`.
