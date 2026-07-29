/**
 * src/ai/review-memory-context.js
 *
 * Локальное преобразование FSRS-данных в агрегированный контекст памяти.
 * Точные значения stability, difficulty, retrievability НЕ экспортируются.
 *
 * Зависит только от публичных card-полей — не импортирует FSRS-модули.
 */

import { isLeech, LEECH_THRESHOLD } from '../card-behavior.js';
import { RESPONSE_TIME_THRESHOLDS } from '../card-behavior.js';

// Порог для «недавнего провала» — 30 дней
const RECENT_LAPSE_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * Преобразует stability (дни) в качественную стадию памяти.
 * Точные числа stability не уходят дальше этой функции.
 *
 * @param {object} srsCard — запись SRS карточки
 * @param {number} lapseThreshold — порог leech
 * @returns {'new'|'fragile'|'developing'|'stable'|'leech'}
 */
export function computeMemoryStage(srsCard, lapseThreshold = LEECH_THRESHOLD) {
  if (!srsCard) return 'new';

  if (isLeech(srsCard, lapseThreshold)) return 'leech';

  const reps = Number(srsCard.reps) || 0;
  if (reps === 0) return 'new';

  const stability = Number(srsCard.stability) || 0;

  // fragile: < 7 дней
  if (stability < 7) return 'fragile';
  // developing: 7–30 дней
  if (stability < 30) return 'developing';
  // stable: >= 30 дней
  return 'stable';
}

/**
 * Определяет, был ли недавний провал (lapse) за последние N дней.
 *
 * @param {object} srsCard
 * @param {number} withinDays
 * @param {number} now
 * @returns {boolean}
 */
export function hasRecentLapse(srsCard, withinDays = RECENT_LAPSE_DAYS, now = Date.now()) {
  if (!srsCard || !Number.isInteger(srsCard.lapses) || srsCard.lapses === 0) return false;

  // Если последнее событие было провалом (Again=0) — проверяем дату
  const lastReview = srsCard.last_review ?? srsCard.lastReview;
  if (!lastReview) return false;

  const reviewTime = typeof lastReview === 'string' ? new Date(lastReview).getTime() : lastReview;
  if (!Number.isFinite(reviewTime)) return false;

  // last_review был недавно + есть хотя бы один lapse
  const daysSinceReview = (now - reviewTime) / DAY_MS;
  return daysSinceReview <= withinDays && srsCard.lapses > 0;
}

/**
 * Строит memoryContext для ReviewAttemptSnapshot.
 * Никакие точные FSRS-числа не выходят за пределы этой функции.
 *
 * @param {object} srsCard — запись из state.srs
 * @param {number} lapseThreshold
 * @returns {{ stage: string, isLeech: boolean, recentLapse: boolean }}
 */
export function buildMemoryContext(srsCard, lapseThreshold = LEECH_THRESHOLD) {
  return {
    stage: computeMemoryStage(srsCard, lapseThreshold),
    isLeech: isLeech(srsCard, lapseThreshold),
    recentLapse: hasRecentLapse(srsCard),
  };
}

/**
 * Преобразует responseTimeMs в qualitative band.
 * Использует те же пороги что и card-behavior.js.
 *
 * @param {number|null} responseTimeMs
 * @param {string} mode
 * @returns {'fast'|'normal'|'slow'|'unknown'}
 */
export function computeResponseTimeBand(responseTimeMs, mode) {
  if (!Number.isFinite(responseTimeMs) || responseTimeMs < 0) return 'unknown';

  const thresholds = RESPONSE_TIME_THRESHOLDS[mode];
  if (!thresholds) return 'unknown';

  if (responseTimeMs <= thresholds.fast) return 'fast';
  if (responseTimeMs >= thresholds.slow) return 'slow';
  return 'normal';
}
