/* srs.js — FSRS spaced repetition algorithm (на базе ts-fsrs) */

import { fsrs, generatorParameters, Rating, State } from 'ts-fsrs';
import { MAX_INTERVAL, SRS_SCHEDULER_CONFIG } from './src/srs-config.js';
import { handleLeech, isLeech, LEECH_THRESHOLD } from './src/card-behavior.js';
import { KNOWLEDGE_TYPES, SKILLS, parseCardIdentity } from './src/knowledge-model.js';

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
  if (!reviewLogger) return Promise.resolve();

  try {
    return Promise.resolve(reviewLogger(entry)).catch((error) => {
      console.warn('[SRS] Не удалось сохранить review log:', error);
    });
  } catch (error) {
    console.warn('[SRS] Не удалось сохранить review log:', error);
    return Promise.resolve();
  }
}

/*
 * Базовые автоматические упражнения по умолчанию дают Good за правильный ответ.
 * Easy зарезервирован для редких бонусных сценариев, например идеального рисования.
 */
function qualityFromMistakes(mistakeCount) {
  if (!Number.isInteger(mistakeCount) || mistakeCount < 0) {
    throw new Error(`[SRS] Некорректное количество ошибок: ${mistakeCount}`);
  }

  if (mistakeCount === 0) return Quality.Good;
  // In an objective exercise the first wrong attempt means retrieval failed.
  // Hard is reserved for a correct first attempt with explicit difficulty
  // (for example a slow answer adjusted by card-behavior).
  return Quality.Again;
}

/* Drawing is also an objective retrieval exercise: any wrong stroke means the
 * first reproduction was not correct. Easy is reserved for an ideal drawing. */
function qualityFromDrawingMistakes(mistakeCount) {
  if (!Number.isInteger(mistakeCount) || mistakeCount < 0) {
    throw new Error(`[SRS] Некорректное количество ошибок рисования: ${mistakeCount}`);
  }

  if (mistakeCount === 0) return Quality.Easy;
  return Quality.Again;
}

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function timestamp(value, fallback) {
  if (value instanceof Date) return value.getTime();
  const parsed = typeof value === 'string' ? Date.parse(value) : value;
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Единый JSON-safe сериализатор Card из ts-fsrs 5.4.1.
 * Неизвестные прикладные метаданные сохраняются для обратной совместимости.
 */
function serializeCard(card, identityOverrides = {}) {
  if (!card || typeof card !== 'object') throw new Error('[SRS] Карточка должна быть объектом');
  const identity = { ...parseCardIdentity(card), ...identityOverrides };
  const now = Date.now();
  const serialized = {
    ...card,
    id: identity.cardId || String(card.id),
    itemId: identity.itemId,
    skill: identity.skill,
    knowledgeType: identity.knowledgeType || KNOWLEDGE_TYPES.VOCABULARY,
    due: timestamp(card.due, now),
    stability: finiteNumber(card.stability),
    difficulty: finiteNumber(card.difficulty),
    elapsed_days: finiteNumber(card.elapsed_days),
    scheduled_days: finiteNumber(card.scheduled_days),
    learning_steps:
      Number.isInteger(card.learning_steps) && card.learning_steps >= 0 ? card.learning_steps : 0,
    reps: Number.isInteger(card.reps) && card.reps >= 0 ? card.reps : 0,
    lapses: Number.isInteger(card.lapses) && card.lapses >= 0 ? card.lapses : 0,
    state: Number.isInteger(card.state) ? card.state : State.New,
    lastReview:
      card.lastReview == null && card.last_review == null
        ? null
        : timestamp(card.lastReview ?? card.last_review, null),
  };
  delete serialized.last_review;
  return serialized;
}

// Создание новой карточки в полном формате Card из ts-fsrs 5.4.1.
function newCard(id, metadata = {}) {
  const now = Date.now();
  const identity = parseCardIdentity({ id, ...metadata });
  return {
    id: String(id),
    itemId: identity.itemId,
    skill: identity.skill || SKILLS.RECOGNITION,
    knowledgeType: identity.knowledgeType || KNOWLEDGE_TYPES.VOCABULARY,
    // --- поля FSRS ---
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
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
  const normalized = serializeCard(card);
  return {
    due: new Date(normalized.due),
    stability: normalized.stability,
    difficulty: normalized.difficulty,
    elapsed_days: normalized.elapsed_days,
    scheduled_days: normalized.scheduled_days,
    learning_steps: normalized.learning_steps,
    reps: normalized.reps,
    lapses: normalized.lapses,
    state: normalized.state,
    last_review: normalized.lastReview == null ? undefined : new Date(normalized.lastReview),
  };
}

function createEventId(now = Date.now()) {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `review-${now}-${Math.random().toString(36).slice(2, 12)}`;
}

function replaceCard(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, source);
  return target;
}

/** Рассчитывает и применяет review, возвращая полное событие для атомарного журнала state. */
function applyReview(card, quality, context = {}) {
  const now = Number.isFinite(context.reviewedAt) ? context.reviewedAt : Date.now();
  const rating = mapQualityToFSRS(quality);
  const previousCard = serializeCard(card);
  const identity = parseCardIdentity(previousCard);
  const result = scheduler.repeat(hydrate(previousCard), new Date(now))[rating];
  const nextCard = serializeCard(
    {
      ...previousCard,
      ...result.card,
      due: result.card.due,
      lastReview: result.card.last_review ?? now,
    },
    identity
  );
  if (nextCard.scheduled_days > MAX_INTERVAL) {
    nextCard.scheduled_days = MAX_INTERVAL;
    nextCard.due = Math.min(nextCard.due, now + MAX_INTERVAL * DAY);
  }

  replaceCard(card, nextCard);
  handleLeech(card);

  const mistakes =
    Number.isInteger(context.mistakes) && context.mistakes >= 0 ? context.mistakes : 0;
  const hintUsed = context.hintUsed === true;
  const rawRating = context.rawRating ?? quality;
  const event = {
    eventId: context.eventId || createEventId(now),
    eventType: 'review',
    itemId: identity.itemId,
    cardId: identity.cardId,
    skill: identity.skill,
    mode: typeof context.mode === 'string' && context.mode ? context.mode : 'unknown',
    firstAttemptCorrect:
      context.firstAttemptCorrect ?? (quality !== Quality.Again && mistakes === 0 && !hintUsed),
    mistakes,
    hintUsed,
    responseTimeMs:
      Number.isFinite(context.responseTimeMs) && context.responseTimeMs >= 0
        ? Math.round(context.responseTimeMs)
        : null,
    rawRating,
    effectiveRating: quality,
    reviewedAt: now,
    previousCard,
    nextCard: serializeCard(card),
    undoneAt: null,
  };

  return { card, event, fsrsLog: result.log };
}

/*
 * Обзор карточки по рейтингу FSRS.
 * quality: 0/3/4/5 (шкала Quality приложения).
 * Мутирует и возвращает ту же запись карточки.
 */
function review(card, quality, context = {}) {
  const { event } = applyReview(card, quality, context);
  emitReviewLog(event);
  return card;
}

function getRetrievability(card, now = Date.now()) {
  const normalized = serializeCard(card);
  if (normalized.state === State.New || normalized.reps === 0 || normalized.stability <= 0)
    return 0;
  return scheduler.get_retrievability(hydrate(normalized), new Date(now), false);
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
    return replaceCard(card, serializeCard(card));
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
  card.learning_steps = 0;
  card.reps = reps;
  card.lapses = 0;
  card.state = reps === 0 ? State.New : State.Review;

  // `due` и `lastReview` сохраняем как есть
  if (typeof card.due !== 'number') card.due = Date.now();
  if (card.lastReview === undefined) card.lastReview = null;

  // Удаляем legacy-поля SM-2
  delete card.ef;
  delete card.interval;

  return replaceCard(card, serializeCard(card));
}

export const SRS = {
  newCard,
  serializeCard,
  hydrate,
  applyReview,
  review,
  getRetrievability,
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
