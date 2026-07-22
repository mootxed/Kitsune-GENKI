/* srs.js — FSRS spaced repetition algorithm (на базе ts-fsrs) */

import { fsrs, generatorParameters, Rating, State } from 'ts-fsrs';
import { MAX_INTERVAL, SRS_SCHEDULER_CONFIG } from './src/srs-config.js';
import { handleLeech, isLeech, LEECH_THRESHOLD } from './src/card-behavior.js';

const DAY = 86400000;

// Планировщик FSRS. Fuzz разносит близкие интервалы, а maximum_interval
// не позволяет стабильности отправить карточку в многолетний перерыв.
const scheduler = fsrs(
  generatorParameters({
    request_retention: SRS_SCHEDULER_CONFIG.requestRetention,
    enable_fuzz: SRS_SCHEDULER_CONFIG.enableFuzz,
    maximum_interval: SRS_SCHEDULER_CONFIG.maximumInterval,
  })
);

// Единая шкала качества ответа внутри приложения (совместима с прежними данными SM-2).
const Quality = Object.freeze({ Again: 0, Hard: 3, Good: 4, Easy: 5 });

const QUALITY_TO_RATING = Object.freeze({
  [Quality.Again]: Rating.Again,
  [Quality.Hard]: Rating.Hard,
  [Quality.Good]: Rating.Good,
  [Quality.Easy]: Rating.Easy,
});

let reviewLogger = null;

/*
 * Явный маппинг шкалы приложения 0/3/4/5 на шкалу ts-fsrs 1/2/3/4.
 * SRS.review принимает только Quality: прямые Rating неоднозначны, потому что
 * числовые значения 3 и 4 пересекаются с Quality.Hard и Quality.Good.
 */
function mapQualityToFSRS(quality) {
  if (typeof quality === 'number' && Object.hasOwn(QUALITY_TO_RATING, quality)) {
    return QUALITY_TO_RATING[quality];
  }
  throw new Error(`[SRS] Некорректная оценка ответа: ${quality}`);
}

/**
 * Подключает хранилище журнала, не связывая ядро FSRS с IndexedDB.
 */
function setReviewLogger(logger) {
  if (logger !== null && typeof logger !== 'function') {
    throw new Error('[SRS] review logger должен быть функцией или null');
  }
  reviewLogger = logger;
}

function emitReviewLog(entry) {
  if (!reviewLogger) return;

  try {
    Promise.resolve(reviewLogger(entry)).catch((error) => {
      console.warn('[SRS] Не удалось сохранить review log:', error);
    });
  } catch (error) {
    console.warn('[SRS] Не удалось сохранить review log:', error);
  }
}

/*
 * Базовые автоматические упражнения по умолчанию дают Good за правильный ответ.
 * Easy зарезервирован для редких бонусных сценариев, например идеального рисования.
 */
function qualityFromMistakes(mistakeCount, againAt = 2) {
  if (!Number.isInteger(mistakeCount) || mistakeCount < 0) {
    throw new Error(`[SRS] Некорректное количество ошибок: ${mistakeCount}`);
  }
  if (!Number.isInteger(againAt) || againAt < 2) {
    throw new Error(`[SRS] Некорректный порог Again: ${againAt}`);
  }

  if (mistakeCount === 0) return Quality.Good;
  if (mistakeCount < againAt) return Quality.Hard;
  return Quality.Again;
}

/*
 * Рисование допускает больше попыток из-за сложности ввода штрихов.
 * Easy выдаётся только за идеальное прохождение; основной успешный результат — Good.
 */
function qualityFromDrawingMistakes(mistakeCount) {
  if (!Number.isInteger(mistakeCount) || mistakeCount < 0) {
    throw new Error(`[SRS] Некорректное количество ошибок рисования: ${mistakeCount}`);
  }

  if (mistakeCount === 0) return Quality.Easy;
  if (mistakeCount <= 2) return Quality.Good;
  if (mistakeCount <= 5) return Quality.Hard;
  return Quality.Again;
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
 * quality: 0/3/4/5 (шкала Quality приложения).
 * Мутирует и возвращает ту же запись карточки.
 */
function review(card, quality, context = {}) {
  const now = Date.now();
  const rating = mapQualityToFSRS(quality);

  // Снимок создаётся до scheduler.repeat() и до мутации исходной карточки.
  const reviewLogEntry = {
    cardId: String(card.id),
    quality,
    mode: typeof context.mode === 'string' && context.mode ? context.mode : 'unknown',
    responseTimeMs:
      Number.isFinite(context.responseTimeMs) && context.responseTimeMs >= 0
        ? Math.round(context.responseTimeMs)
        : null,
    timestamp: now,
    previousStability: card.stability ?? 0,
    previousDifficulty: card.difficulty ?? 0,
    previousState: card.state ?? State.New,
  };

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

  // Leech — метаданные приложения поверх FSRS. Планировщик и интервалы не меняем.
  handleLeech(card);

  // Пишем только успешно применённые review; снимок остаётся pre-review.
  emitReviewLog(reviewLogEntry);

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

export const SRS = {
  newCard,
  review,
  isDue,
  migrateSM2ToFSRS,
  mapQualityToFSRS,
  setReviewLogger,
  qualityFromMistakes,
  qualityFromDrawingMistakes,
  Quality,
  Rating,
  State,
  DAY,
  MAX_INTERVAL,
  schedulerConfig: SRS_SCHEDULER_CONFIG,
  isLeech,
  handleLeech,
  LEECH_THRESHOLD,
};
