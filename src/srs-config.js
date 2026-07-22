/* src/srs-config.js — централизованные, редактируемые параметры нагрузки SRS */

// Сколько ещё не изученных карточек можно впервые показать за один календарный день.
export const DAILY_NEW_CARDS_LIMIT = 15;

// Сколько новых карточек может попасть в одну сессию. Повторения не ограничиваются.
export const SESSION_NEW_CARDS_LIMIT = 10;

// Верхняя граница интервала FSRS в днях.
export const MAX_INTERVAL = 365;

export const SRS_SCHEDULER_CONFIG = Object.freeze({
  requestRetention: 0.9,
  enableFuzz: true,
  maximumInterval: MAX_INTERVAL,
});

export const SRS_LOAD_CONFIG = Object.freeze({
  dailyNewCardsLimit: DAILY_NEW_CARDS_LIMIT,
  sessionNewCardsLimit: SESSION_NEW_CARDS_LIMIT,
});
