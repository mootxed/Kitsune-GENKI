/* src/daily-study-digest.js — Canonical SRS daily study workload digest and duration estimation */
import { State } from 'ts-fsrs';
import { dueCards } from './srs-helpers.js';
import { limitNewCardsForSession, studyDay } from './srs-limits.js';
import { parseCardIdentity } from './knowledge-model.js';
import { localDateKey } from './local-date.js';

/**
 * Calculates Russian plural forms for minutes.
 * @param {number} n - Number of minutes
 * @returns {string} e.g. "1 минута", "2 минуты", "5 минут"
 */
export function formatMinutesPlural(n) {
  const absN = Math.abs(Math.round(n));
  const mod10 = absN % 10;
  const mod100 = absN % 100;

  if (mod100 >= 11 && mod100 <= 19) {
    return `${absN} минут`;
  }
  if (mod10 === 1) {
    return `${absN} минута`;
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return `${absN} минуты`;
  }
  return `${absN} минут`;
}

/**
 * Computes median of a numerical array.
 */
function getMedian(numbers) {
  if (!numbers || numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Computes canonical daily study digest metrics.
 * @param {Object} state - Application state object
 * @param {Object} [options] - Options (now, day, etc.)
 * @returns {Object} Digest result
 */
export function getDailyStudyDigest(state, options = {}) {
  const srsRecords = state?.srs || {};
  const now = options.now ?? Date.now();
  const day = options.day ?? studyDay(now);

  const due = dueCards(srsRecords, null, now);
  const sessionCards = limitNewCardsForSession(due, srsRecords, { now, day, ...options });

  // Separate due review cards and due new cards in session
  const dueReviewCardsList = due.filter((card) => card.state !== State.New);
  const sessionReviewCards = sessionCards.filter((card) => card.state !== State.New);
  const sessionNewCards = sessionCards.filter((card) => card.state === State.New);

  const dueReviewCards = sessionReviewCards.length;
  const totalDueReviewCards = dueReviewCardsList.length;

  // Group new session cards by knowledge item to get distinct new items count
  const availableNewItemsSet = new Set(
    sessionNewCards.map((card) => parseCardIdentity(card).itemId)
  );
  const availableNewItems = availableNewItemsSet.size;

  const allRecordsList = Object.values(srsRecords);
  const totalNewItemsSet = new Set(
    allRecordsList
      .filter((card) => card.state === State.New)
      .map((card) => parseCardIdentity(card).itemId)
  );
  const totalNewItems = totalNewItemsSet.size;

  const availableCardCount = sessionCards.length;
  const isComplete = availableCardCount === 0;

  // Daily goal calculation (default 20 cards per day or studyPlan daily goal)
  const todayCardsCount = state?.history?.[localDateKey(now)] || state?.dailyCards || 0;
  const targetCardsGoal = state?.studyPlan?.dailyGoal || 20;
  const cardsToDailyGoal = Math.max(0, targetCardsGoal - todayCardsCount);

  // Time Estimation: Extract response times from recent review events if available
  const reviewEvents = Array.isArray(state?.reviewEvents) ? state.reviewEvents : [];
  const reviewTimesSec = [];
  const newItemTimesSec = [];

  for (const event of reviewEvents) {
    if (!event || event.undoneAt) continue;
    const rawTime = event.responseTimeMs ?? event.responseTime;
    if (typeof rawTime === 'number' && Number.isFinite(rawTime) && rawTime > 0) {
      // Normalize to seconds: if value > 100, assume milliseconds
      const timeInSec = rawTime > 100 ? rawTime / 1000 : rawTime;
      if (event.stateBefore === State.New || event.isNew === true) {
        newItemTimesSec.push(timeInSec);
      } else {
        reviewTimesSec.push(timeInSec);
      }
    }
  }

  // Median calculation with clamping
  // Review fallback: 15s (clamped 5-60s)
  const rawReviewMedian = getMedian(reviewTimesSec);
  const reviewMedian = rawReviewMedian !== null ? Math.max(5, Math.min(60, rawReviewMedian)) : 15;

  // New item fallback: 30s (clamped 10-120s)
  const rawNewItemMedian = getMedian(newItemTimesSec);
  const newItemMedian =
    rawNewItemMedian !== null ? Math.max(10, Math.min(120, rawNewItemMedian)) : 30;

  const estimatedSeconds = Math.round(
    dueReviewCards * reviewMedian + availableNewItems * newItemMedian
  );

  let estimatedMinutes = 0;
  let durationText = '';

  if (isComplete || estimatedSeconds === 0) {
    estimatedMinutes = 0;
    durationText = 'Готово на сегодня';
  } else if (estimatedSeconds < 60) {
    estimatedMinutes = 1;
    durationText = '< 1 минуты';
  } else {
    const rawMinutes = Math.round(estimatedSeconds / 60);
    if (rawMinutes >= 15) {
      // Round to nearest 5 minutes
      estimatedMinutes = Math.max(15, Math.round(rawMinutes / 5) * 5);
    } else {
      estimatedMinutes = rawMinutes;
    }
    durationText = `≈ ${formatMinutesPlural(estimatedMinutes)}`;
  }

  // Summary Text formatting
  let summaryText = '';
  if (isComplete) {
    summaryText = 'На сегодня всё выполнено 🎉';
  } else if (dueReviewCards > 0 && availableNewItems > 0) {
    const reviewPlural =
      dueReviewCards === 1
        ? 'повторение'
        : dueReviewCards >= 2 && dueReviewCards <= 4
          ? 'повторения'
          : 'повторений';
    summaryText = `${dueReviewCards} ${reviewPlural} · ${availableNewItems} новых`;
  } else if (dueReviewCards > 0) {
    const reviewPlural =
      dueReviewCards === 1
        ? 'повторение'
        : dueReviewCards >= 2 && dueReviewCards <= 4
          ? 'повторения'
          : 'повторений';
    summaryText = `${dueReviewCards} ${reviewPlural}`;
  } else {
    summaryText = `${availableNewItems} новых слов`;
  }

  return {
    dueReviewCards,
    availableNewItems,
    availableCardCount,
    totalDueReviewCards,
    totalNewItems,
    estimatedMinutes,
    estimatedSeconds,
    isComplete,
    cardsToDailyGoal,
    summaryText,
    durationText,
  };
}
