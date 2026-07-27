# Event Schema Reference — Справочник Схемы Событий

Документ описывает структуры данных событий повторения и обучения.

---

## 📝 Review Event Schema

- `eventId` (string): Уникальный ID.
- `cardId` (string): Идентификатор карточки.
- `timestamp` (string, ISO 8601).
- `rating` (number: 1..4).
- `quality` (number: 1..4).
- `responseTimeMs` (number).
- `mode` (string).
- `stateBefore` (object).
- `stateAfter` (object).
