# FSRS review journal

Актуальная схема и правила описаны в [srs-mastery-system.md](./srs-mastery-system.md).

Новые review-события находятся в `state.reviewEvents` рядом с `state.srs` и
сохраняются одной IndexedDB-записью `app_state`. Это обеспечивает согласованный Undo:
полный `previousCard` восстанавливается, а тому же `eventId` ставится `undoneAt`.

Событие содержит `itemId`, `cardId`, `skill`, `mode`, первую попытку, ошибки,
подсказку, время ответа, raw/effective rating, timestamps и полные снимки карточки
до/после. System fallback, preview и debug skip не создают успешный review.

IndexedDB store `review_log` остаётся для обратной совместимости старых бэкапов и
диагностических вызовов `SRS.review()`. Его старые записи с полями `quality`,
`timestamp` и `previous*` считаются legacy: они не имеют достаточной информации о
skill и Undo и потому не используются как доказательство mastery.

При будущем обучении параметров следует использовать только новые активные события,
исключить `undoneAt`, проверить непрерывность `previousCard → nextCard`, группировать
по `cardId` и преобразовывать шкалу приложения `0/3/4/5` в FSRS Rating `1/2/3/4`.
