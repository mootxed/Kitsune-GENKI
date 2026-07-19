/* srs.js — FSRS spaced repetition algorithm (на базе ts-fsrs) */

import { fsrs, generatorParameters, Rating, State } from 'ts-fsrs';

const DAY = 86400000;

// Планировщик FSRS с целевым запоминанием 90%
const scheduler = fsrs(generatorParameters({ request_retention: 0.9 }));

/*
 * Маппинг качества ответа (legacy-шкала приложения) на рейтинг FSRS:
 *   Again: quality 0 (или 1) -> Rating.Again (1)
 *   Hard:  quality 3 (или 2) -> Rating.Hard  (2)
 *   Good:  quality 4 (или 3) -> Rating.Good  (3)
 *   Easy:  quality 5 (или 4) -> Rating.Easy  (4)
 */
const QUALITY_TO_RATING = { 0: Rating.Again, 3: Rating.Hard, 4: Rating.Good, 5: Rating.Easy };

function toRating(quality) {
  if (QUALITY_TO_RATING[quality] !== undefined) return QUALITY_TO_RATING[quality];
  if (quality >= Rating.Again && quality <= Rating.Easy) return quality;
  throw new Error(`[SRS] Некорректная оценка ответа: ${quality}`);
}

// Создание новой карточки в формате FSRS
function newCard(id) {
  const now = Date.now();
  return {
    id,
    // --- поля FSRS ---
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: State.New,
    // --- временные метки (ms, числа — безопасны для JSON) ---
    due: now, // абсолютный timestamp следующего повторения
    lastReview: null,
  };
}

/*
 * Гидратация плоской записи из localStorage в объект Card для ts-fsrs.
 */
function hydrate(card) {
  return {
    due: new Date(card.due),
    stability: card.stability || 0,
    difficulty: card.difficulty || 0,
    elapsed_days: card.elapsed_days || 0,
    scheduled_days: card.scheduled_days || 0,
    reps: card.reps || 0,
    lapses: card.lapses || 0,
    state: card.state ?? State.New,
    last_review: card.lastReview ? new Date(card.lastReview) : undefined,
  };
}

/*
 * Обзор карточки по рейтингу FSRS.
 * quality: 0/3/4/5 (legacy) или 1..4 (Rating FSRS).
 * Мутирует и возвращает ту же запись карточки.
 */
function review(card, quality) {
  const now = Date.now();
  const rating = toRating(quality);

  const log = scheduler.repeat(hydrate(card), new Date(now));
  const next = log[rating].card;

  card.stability = next.stability;
  card.difficulty = next.difficulty;
  card.elapsed_days = next.elapsed_days;
  card.scheduled_days = next.scheduled_days;
  card.reps = next.reps;
  card.lapses = next.lapses;
  card.state = next.state;
  card.due = next.due.getTime();
  card.lastReview = now;
  return card;
}

function isDue(card, ref) {
  return card.due <= (ref || Date.now());
}

/*
 * Fail-safe миграция legacy-записи SM-2 → схема FSRS.
 * Карточки, уже содержащие поля FSRS, возвращаются без изменений.
 * КРИТИЧНО: абсолютный timestamp `due` (nextReview) не трогаем —
 * пользователь не должен получить внезапный завал просроченных карточек.
 */
function migrateSM2ToFSRS(card) {
  if (!card || typeof card !== 'object') return card;
  if (typeof card.stability === 'number' && typeof card.difficulty === 'number') {
    return card; // уже FSRS-схема
  }

  const ef = typeof card.ef === 'number' ? card.ef : 2.5;
  const reps = typeof card.reps === 'number' ? card.reps : 0;
  const interval = typeof card.interval === 'number' ? card.interval : 0;

  // Конверсия easiness factor [1.3, 2.5] → difficulty [10, 1] (линейно, инвертировано)
  const efClamped = Math.min(2.5, Math.max(1.3, ef));
  const difficulty = Math.min(10, Math.max(1, 10 - ((efClamped - 1.3) / 1.2) * 9));

  // Начальная стабильность ≈ историческому интервалу (дни), минимум 1 для изученных
  const stability = reps > 0 ? Math.max(1, interval) : 0;

  card.stability = stability;
  card.difficulty = difficulty;
  card.elapsed_days = 0;
  card.scheduled_days = interval;
  card.reps = reps;
  card.lapses = 0;
  card.state = reps === 0 ? State.New : State.Review;

  // `due` и `lastReview` сохраняем как есть
  if (typeof card.due !== 'number') card.due = Date.now();
  if (card.lastReview === undefined) card.lastReview = null;

  // Удаляем legacy-поля SM-2
  delete card.ef;
  delete card.interval;

  return card;
}

export const SRS = { newCard, review, isDue, migrateSM2ToFSRS, Rating, State, DAY };
