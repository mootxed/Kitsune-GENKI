# FSRS review journal

Полный контракт описан в [srs-mastery-system.md](./srs-mastery-system.md).

Новый review сначала атомарно изменяет `state.srs` и добавляет событие в
`state.reviewEvents`. Событие содержит identity, skill/mode, первую попытку,
ошибки, hint, response time, raw/effective rating, timestamp и Card snapshots.

Перед сохранением применяется bounded compaction:

- максимум 20 событий на knowledge item;
- snapshots только у последних 10 активных событий для устойчивого Undo;
- старое evidence сворачивается в `state.masteryArchive`;
- undone и невалидные технические события не архивируются как mastery evidence.

Это ограничивает объём клонирования и записи основного `app_state`, не теряя данные,
необходимые для mastery. Последние 20 событий сохраняют точное окно accuracy, а
архив — историческое покрытие skills, успешные дни и последний lapse.

IndexedDB store `review_log` является legacy-совместимостью для старых бэкапов и
прямых диагностических вызовов `SRS.review()`. Записи без `itemId`, skill и полного
event contract не участвуют в mastery.
