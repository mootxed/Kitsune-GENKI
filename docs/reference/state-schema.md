# State Schema Reference — Справочник Схемы State

Документ опиcывает JSON Схему корневого объекта состояния `state`.

---

## 📑 Верхнеуровневая структура

- `version` (number, required): Версия схемы (актуальная версия указана в [справочнике версий](generated-versions.md)).
- `onboardingCompleted` (boolean, required).
- `xp` (number, integer, min: 0).
- `streak` (number, integer, min: 0).
- `lastActivityDate` (string, ISO date YYYY-MM-DD).
- `srs` (object): Словарь объектов FSRS карточек.
- `vocabularyUnlocks` (object): Словарь статусов открытия словарных элементов.
- `userPlan` (object): Настройки и этапы учебного плана.
- `dailySnapshot` (object): Снапшот задач текущего дня.
- `settings` (object): Настройки приложения.
