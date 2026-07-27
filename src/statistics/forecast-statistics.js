/* src/statistics/forecast-statistics.js — Calculation of upcoming card review forecast & time estimates */

import { State } from 'ts-fsrs';
import { getStudyDayKey, addLocalDays, parseDateKey } from '../local-date.js';
import { parseCardIdentity } from '../knowledge-model.js';
import { calculateWorkloadStats } from './workload-statistics.js';

export const FORECAST_DISCLAIMER =
  'Прогноз основан на текущем расписании карточек. После новых ответов даты могут измениться.';
export const DEFAULT_CARD_TIME_MS = 8000; // 8 секунд по умолчанию

/**
 * Рассчитывает прогноз повторений по текущему состоянию активных FSRS-карточек.
 *
 * @param {Object} srsCards - словарь карточек state.srs
 * @param {Array<Object>} events - исторические review events (для медианных откликов)
 * @param {Object} [options]
 * @param {number} [options.now=Date.now()]
 * @param {number} [options.dayBoundaryHour=0]
 * @returns {Object} результат прогноза
 */
export function calculateForecastStats(srsCards = {}, events = [], options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const dayBoundaryHour = Math.max(0, Math.min(23, Number(options.dayBoundaryHour) || 0));

  // Получаем медианное время ответов из workload-статистики
  const workloadStats = calculateWorkloadStats(events, srsCards, { now, dayBoundaryHour });
  const globalMedianMs = workloadStats.globalMedianResponseTimeMs || DEFAULT_CARD_TIME_MS;
  const modeMedians = workloadStats.modeMedianTimes || {};
  const skillMedians = workloadStats.skillMedianTimes || {};

  const todayKey = getStudyDayKey(now, { dayBoundaryHour });

  // 1. Отбираем валидные и активные карточки
  const activeCards = Object.values(srsCards || {}).filter(
    (c) => c && c.planLocked !== true && c.suspended !== true
  );

  // Разделяем на существующие повторения и новые карточки
  const reviewCards = [];
  const newCards = [];

  for (const card of activeCards) {
    if (card.state === State.New || card.state === 0) {
      newCards.push(card);
    } else {
      reviewCards.push(card);
    }
  }

  // 2. Группируем запланированные повторения по дням due
  const reviewsByDay = new Map();

  for (const card of reviewCards) {
    const dueTime = Number(card.due) || now;
    const dueDayKey = getStudyDayKey(dueTime, { dayBoundaryHour });

    // Просроченные карточки относим к сегодняшнему дню
    const targetKey = dueDayKey < todayKey ? todayKey : dueDayKey;

    if (!reviewsByDay.has(targetKey)) {
      reviewsByDay.set(targetKey, []);
    }
    reviewsByDay.get(targetKey).push(card);
  }

  // 3. Вычисляем основные агрегаты
  const todayDueCards = reviewsByDay.get(todayKey) || [];
  const tomorrowKey = addLocalDays(todayKey, 1);
  const tomorrowDueCards = reviewsByDay.get(tomorrowKey) || [];

  let days2to7Count = 0;
  for (let i = 2; i <= 7; i++) {
    const key = addLocalDays(todayKey, i);
    days2to7Count += (reviewsByDay.get(key) || []).length;
  }

  // 4. Дневной прогноз на ближайшие 14 дней
  const byDay14 = [];
  for (let i = 0; i < 14; i++) {
    const dayKey = addLocalDays(todayKey, i);
    const dayCards = reviewsByDay.get(dayKey) || [];
    const count = dayCards.length;

    // Оценка времени для каждой карточки на день
    let dayEstimatedMs = 0;
    for (const card of dayCards) {
      const identity = parseCardIdentity(card);
      const cardSkill = identity.skill;
      const cardMode = card.mode;

      const cardTime =
        (cardMode && modeMedians[cardMode]) ||
        (cardSkill && skillMedians[cardSkill]) ||
        globalMedianMs;

      dayEstimatedMs += cardTime;
    }

    byDay14.push({
      dateKey: dayKey,
      dayOffset: i,
      reviewsCount: count,
      estimatedTimeMs: dayEstimatedMs,
      estimatedMinutes: Math.round(dayEstimatedMs / 60000),
      formattedTime: formatEstimatedMinutes(Math.round(dayEstimatedMs / 60000)),
    });
  }

  // 5. Недельный прогноз на ближайшие 8–12 недель
  const byWeek12 = [];
  for (let w = 0; w < 12; w++) {
    let weekReviewsCount = 0;
    let weekEstimatedMs = 0;

    for (let d = 0; d < 7; d++) {
      const dayOffset = w * 7 + d;
      const dayKey = addLocalDays(todayKey, dayOffset);
      const dayCards = reviewsByDay.get(dayKey) || [];
      weekReviewsCount += dayCards.length;

      for (const card of dayCards) {
        const identity = parseCardIdentity(card);
        const cardSkill = identity.skill;
        const cardMode = card.mode;
        const cardTime =
          (cardMode && modeMedians[cardMode]) ||
          (cardSkill && skillMedians[cardSkill]) ||
          globalMedianMs;
        weekEstimatedMs += cardTime;
      }
    }

    byWeek12.push({
      weekIndex: w + 1,
      startKey: addLocalDays(todayKey, w * 7),
      endKey: addLocalDays(todayKey, w * 7 + 6),
      reviewsCount: weekReviewsCount,
      estimatedTimeMs: weekEstimatedMs,
      estimatedMinutes: Math.round(weekEstimatedMs / 60000),
      formattedTime: formatEstimatedMinutes(Math.round(weekEstimatedMs / 60000)),
    });
  }

  // Оценка времени на завтра
  const tomorrowEstimatedMs = byDay14[1]?.estimatedTimeMs || 0;
  const tomorrowEstimatedMinutes = Math.round(tomorrowEstimatedMs / 60000);

  return {
    disclaimer: FORECAST_DISCLAIMER,
    totalActiveCardsCount: activeCards.length,
    scheduledReviewsCount: reviewCards.length,
    plannedNewCardsCount: newCards.length,
    dueTodayCount: todayDueCards.length,
    dueTomorrowCount: tomorrowDueCards.length,
    dueDays2to7Count: days2to7Count,
    tomorrowEstimatedMinutes,
    formattedTomorrowTime: formatEstimatedMinutes(tomorrowEstimatedMinutes),
    byDay14,
    byWeek12,
  };
}

function formatEstimatedMinutes(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '< 1 мин';
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours} ч ${mins} мин` : `${hours} ч`;
}
