/* src/forecast-service.js — 7-Day Study Load Forecast Service */

import { addLocalDays, formatDateKey } from './local-date.js';
import { TIME_ESTIMATES, calculateReviewMinutes } from './time-estimates.js';
import { dueCards } from './srs-helpers.js';

/**
 * Calculates a 7-day study load forecast.
 *
 * @param {Object} params
 * @param {Object} params.state - Application state
 * @param {Object} [params.plan] - Study plan
 * @param {Object|Array} [params.cards] - FSRS cards collection or list
 * @param {Array} [params.reviewHistory] - Review events history
 * @param {number} [params.now=Date.now()] - Timestamp for deterministic execution
 * @param {Object} [params.limits] - Daily capacity/limits override
 * @returns {Object} Forecast object
 */
export function calculateSevenDayForecast({
  state,
  plan = state?.studyPlan,
  cards = state?.srs,
  reviewHistory = state?.reviewEvents || [],
  now = Date.now(),
  limits = {},
} = {}) {
  const todayKey = formatDateKey(now);
  const dailyCapacityMinutes = Number(
    limits.dailyCapacityMinutes || state?.dailyCapacityMinutes || 30
  );
  const maxNewCardsPerDay = Number(limits.maxNewCardsPerDay || 10);

  // Calculate historical median review time (minutes per card)
  let msPerCard = TIME_ESTIMATES.REVIEW_CARD_MINUTES * 60_000;
  const validTimes = (reviewHistory || [])
    .filter(
      (e) =>
        !e.undoneAt &&
        Number.isFinite(e.responseTimeMs) &&
        e.responseTimeMs > 500 &&
        e.responseTimeMs < 120_000
    )
    .slice(-100)
    .map((e) => e.responseTimeMs);

  if (validTimes.length >= 10) {
    const sorted = [...validTimes].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianMs = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    msPerCard = Math.max(10_000, Math.min(60_000, medianMs));
  }
  const minutesPerReview = msPerCard / 60_000;

  // Gather cards
  const allCardsList = Array.isArray(cards)
    ? cards
    : cards && typeof cards === 'object'
      ? Object.values(cards)
      : [];

  const studiedCards = allCardsList.filter(
    (c) => c && !c.suspended && (c.reps > 0 || c.state !== 0 || c.lastReview != null)
  );

  // Group due cards by target date key
  const dueByDate = new Map();
  for (let i = 0; i < 7; i++) {
    const dateKey = addLocalDays(todayKey, i);
    dueByDate.set(dateKey, 0);
  }

  // Backlog: overdue cards before today
  let backlogCount = 0;
  for (const card of studiedCards) {
    if (!card.due) continue;
    const cardDueMs = new Date(card.due).getTime();
    const cardDueKey = formatDateKey(cardDueMs);

    if (cardDueKey < todayKey) {
      backlogCount++;
    } else if (dueByDate.has(cardDueKey)) {
      dueByDate.set(cardDueKey, dueByDate.get(cardDueKey) + 1);
    }
  }

  // Today gets the current backlog + today's due cards
  const todayDue = (dueByDate.get(todayKey) || 0) + backlogCount;
  dueByDate.set(todayKey, todayDue);

  // Planned new cards per day
  const studyDaysOfWeek = new Set(plan?.studyDaysOfWeek || [1, 2, 3, 4, 5, 6, 0]);
  const isPlanPaused = plan?.paused === true;

  const forecastDays = [];
  let totalMinutesSum = 0;
  let peakDayKey = todayKey;
  let peakMinutes = 0;

  for (let i = 0; i < 7; i++) {
    const dateKey = addLocalDays(todayKey, i);
    const dateObj = new Date(now + i * 86400000);
    const dayOfWeek = dateObj.getDay();

    const dueReviews = dueByDate.get(dateKey) || 0;
    const isStudyDay = studyDaysOfWeek.has(dayOfWeek) && !isPlanPaused;

    // Estimate new cards
    let expectedNewCards = 0;
    if (isStudyDay) {
      const reviewMinutesForDay = dueReviews * minutesPerReview;
      const remainingCapacity = Math.max(0, dailyCapacityMinutes - reviewMinutesForDay);
      expectedNewCards = Math.min(maxNewCardsPerDay, Math.floor(remainingCapacity / 1.5));
    }

    const reviewMinutes = dueReviews * minutesPerReview;
    const newCardsMinutes = expectedNewCards * 1.5; // ~1.5 mins per new card (vocab + initial drill)
    const expectedMinutes = Math.max(1, Math.round(reviewMinutes + newCardsMinutes));

    totalMinutesSum += expectedMinutes;
    if (expectedMinutes > peakMinutes) {
      peakMinutes = expectedMinutes;
      peakDayKey = dateKey;
    }

    const confidence = validTimes.length >= 20 ? 'high' : validTimes.length >= 5 ? 'medium' : 'low';

    forecastDays.push({
      date: dateKey,
      dayOfWeek,
      dueReviews,
      expectedNewCards,
      expectedMinutes,
      confidence,
      isStudyDay,
    });
  }

  const averageMinutes = Math.round(totalMinutesSum / 7);

  // Assess overall plan risk level
  let risk = 'normal';
  if (backlogCount > 30) {
    risk = 'recovery';
  } else if (
    averageMinutes > dailyCapacityMinutes * 1.5 ||
    peakMinutes > dailyCapacityMinutes * 2
  ) {
    risk = 'unrealistic';
  } else if (
    averageMinutes > dailyCapacityMinutes * 1.1 ||
    peakMinutes > dailyCapacityMinutes * 1.3
  ) {
    risk = 'elevated';
  }

  return {
    days: forecastDays,
    peakDay: peakDayKey,
    peakMinutes,
    averageMinutes,
    totalMinutes: totalMinutesSum,
    backlogCount,
    dailyCapacityMinutes,
    risk,
  };
}
