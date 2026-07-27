# Vocabulary Schema — Схема Словарных Записей

Документ описывает структуру записей лексики в массиве `vocabulary` файлов уроков.

---

## 📝 Пример структуры словарной единицы

```json
{
  "id": "genki1_l1_v5",
  "kanji": "学生",
  "kana": "がくせい",
  "romaji": "gakusei",
  "english": "student",
  "russian": "студент",
  "category": "noun",
  "chapter": 1,
  "audio": "audio/genki1/l1/gakusei.mp3",
  "examples": [
    {
      "japanese": "わたしは学生です。",
      "english": "I am a student.",
      "russian": "Я студент."
    }
  ]
}
```

---

## ⚙️ Обязательные поля

- `id` (string): Уникальный ID.
- `kana` (string): Чтение на хирагане/катакане.
- `english` или `russian` (string): Значение на английском или русском языке.
- `category` (string): Часть речи (`noun`, `verb-u`, `verb-ru`, `verb-irr`, `adj-i`, `adj-na`, `adverb`, `expression`).
