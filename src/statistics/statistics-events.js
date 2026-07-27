/* src/statistics/statistics-events.js — Normalization and filtering of FSRS review events */

import { getStudyDayKey } from '../local-date.js';
import { modeSkill, SKILLS } from '../knowledge-model.js';

const EXCLUDED_MODES = new Set(['system-fallback', 'preview', 'debug-skip']);
const VALID_RATINGS = new Set([0, 3, 4, 5]);

/**
 * Возвращает единый список валидных и эффективных review-событий из состояния.
 *
 * @param {Object} state - app state
 * @param {Object} [options]
 * @param {number|'all'} [options.timeRangeDays=30] - фильтр по периоду (дней)
 * @param {string} [options.skill] - фильтр по навыку
 * @param {string} [options.mode] - фильтр по режиму
 * @param {string} [options.knowledgeType] - фильтр по типу знаний
 * @param {number} [options.now=Date.now()] - опорная отметка времени
 * @param {number} [options.dayBoundaryHour=0] - час начала локального учебного дня
 * @returns {Array<Object>} массив нормализованных событий
 */
export function getEffectiveReviewEvents(state, options = {}) {
  if (!state || typeof state !== 'object') return [];

  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const dayBoundaryHour = Math.max(0, Math.min(23, Number(options.dayBoundaryHour) || 0));
  const rawEvents = Array.isArray(state.reviewEvents) ? state.reviewEvents : [];

  const seenEventIds = new Set();
  const validEvents = [];

  for (const raw of rawEvents) {
    if (!raw || typeof raw !== 'object') continue;

    // 1. Исключаем отменённые (undone) события
    if (raw.undoneAt != null) continue;

    // 2. Исключаем дубликаты по eventId
    const eventId = typeof raw.eventId === 'string' && raw.eventId ? raw.eventId : null;
    if (eventId) {
      if (seenEventIds.has(eventId)) continue;
      seenEventIds.add(eventId);
    }

    // 3. Пакетная валидация типа события
    const eventType = raw.eventType || 'review';
    if (eventType !== 'review') continue;

    // 4. Исключаем служебные / технические режимы
    const mode = typeof raw.mode === 'string' ? raw.mode : 'unknown';
    if (EXCLUDED_MODES.has(mode)) continue;

    // 5. Проверка полей карточки и времени
    const timestamp = Number.isInteger(raw.reviewedAt)
      ? raw.reviewedAt
      : Number.isInteger(raw.timestamp)
        ? raw.timestamp
        : null;

    if (timestamp === null || timestamp < 0 || timestamp > now + 86400000 * 2) continue;

    const cardId = typeof raw.cardId === 'string' && raw.cardId ? raw.cardId : null;
    const itemId = typeof raw.itemId === 'string' && raw.itemId ? raw.itemId : null;
    if (!cardId && !itemId) continue;

    // 6. Нормализация оценки
    const effectiveRating =
      Number.isInteger(raw.effectiveRating) && VALID_RATINGS.has(raw.effectiveRating)
        ? raw.effectiveRating
        : Number.isInteger(raw.quality) && VALID_RATINGS.has(raw.quality)
          ? raw.quality
          : null;

    if (effectiveRating === null) continue;

    // 7. Определение навыка (skill)
    let skill = typeof raw.skill === 'string' && raw.skill ? raw.skill : null;
    if (!skill || !Object.values(SKILLS).includes(skill)) {
      skill = modeSkill(mode);
    }

    // 8. Исключаем повторные внутрисессионные retry от FSRS review
    if (raw.isSessionRetry === true) continue;

    // 9. Нормализация полей попытки
    const hintUsed = raw.hintUsed === true;
    const mistakes = Number.isInteger(raw.mistakes) && raw.mistakes >= 0 ? raw.mistakes : 0;
    const firstAttemptCorrect =
      typeof raw.firstAttemptCorrect === 'boolean'
        ? raw.firstAttemptCorrect
        : effectiveRating !== 0 && mistakes === 0 && !hintUsed;

    const responseTimeMs =
      Number.isFinite(raw.responseTimeMs) && raw.responseTimeMs >= 0
        ? Math.round(raw.responseTimeMs)
        : null;

    const studyDay = getStudyDayKey(timestamp, { dayBoundaryHour });

    validEvents.push({
      ...raw,
      eventId: eventId || `event-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      cardId: cardId || itemId,
      itemId: itemId || cardId,
      skill,
      mode,
      effectiveRating,
      rawRating: Number.isInteger(raw.rawRating) ? raw.rawRating : effectiveRating,
      firstAttemptCorrect,
      mistakes,
      hintUsed,
      responseTimeMs,
      reviewedAt: timestamp,
      timestamp,
      studyDay,
      knowledgeType: raw.knowledgeType || 'vocabulary',
    });
  }

  // Сортировка по времени
  validEvents.sort((a, b) => a.reviewedAt - b.reviewedAt);

  // Фильтрация по диапазону дат
  let filtered = validEvents;
  const timeRangeDays = options.timeRangeDays;
  if (typeof timeRangeDays === 'number' && timeRangeDays > 0) {
    const cutoffMs = now - timeRangeDays * 86400000;
    filtered = filtered.filter((ev) => ev.reviewedAt >= cutoffMs);
  }

  // Фильтрация по skill
  if (options.skill && options.skill !== 'all') {
    filtered = filtered.filter((ev) => ev.skill === options.skill);
  }

  // Фильтрация по mode
  if (options.mode && options.mode !== 'all') {
    filtered = filtered.filter((ev) => ev.mode === options.mode);
  }

  // Фильтрация по knowledgeType
  if (options.knowledgeType && options.knowledgeType !== 'all') {
    filtered = filtered.filter((ev) => ev.knowledgeType === options.knowledgeType);
  }

  return filtered;
}
