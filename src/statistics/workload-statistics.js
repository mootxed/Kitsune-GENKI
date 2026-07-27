/* src/statistics/workload-statistics.js — Calculation of study workload, time estimates, and activity calendar */

import { getStudyDayKey, addLocalDays } from '../local-date.js';
import { SKILLS } from '../knowledge-model.js';

export const MAX_VALID_RESPONSE_TIME_MS = 120_000; // 2 минуты максимум на одну карточку

/**
 * Вспомогательная функция расчёта медианы для массива чисел.
 */
export function calculateMedian(numbers = []) {
  const valid = numbers.filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 !== 0) return valid[mid];
  return Math.round((valid[mid - 1] + valid[mid]) / 2);
}

/**
 * Рассчитывает историческую нагрузку и статистику времени обучения.
 *
 * @param {Array<Object>} events - валидные review events
 * @param {Object} srsCards - словарь карточек state.srs
 * @param {Object} [options]
 * @param {number|'all'} [options.timeRangeDays=30]
 * @param {number} [options.now=Date.now()]
 * @param {number} [options.dayBoundaryHour=0]
 * @returns {Object} результат расчёта нагрузки
 */
export function calculateWorkloadStats(events = [], srsCards = {}, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const dayBoundaryHour = Math.max(0, Math.min(23, Number(options.dayBoundaryHour) || 0));
  const timeRangeDays = options.timeRangeDays || 30;

  // 1. Фильтрация и защита времени от выбросов
  const validTimeEvents = events.filter((ev) => {
    const t = ev.responseTimeMs;
    return Number.isFinite(t) && t >= 0 && t <= MAX_VALID_RESPONSE_TIME_MS;
  });

  const responseTimesAll = validTimeEvents.map((ev) => ev.responseTimeMs);
  const globalMedianResponseTimeMs = calculateMedian(responseTimesAll);
  const totalActiveTimeMs = responseTimesAll.reduce((acc, val) => acc + val, 0);
  const totalActiveMinutes = Math.round(totalActiveTimeMs / 60000);

  // 2. Распределение времени по режимам и навыкам
  const timeByMode = {};
  const timeBySkill = {};

  for (const ev of validTimeEvents) {
    const mode = ev.mode || 'unknown';
    const skill = ev.skill || 'unknown';

    if (!timeByMode[mode]) timeByMode[mode] = [];
    timeByMode[mode].push(ev.responseTimeMs);

    if (!timeBySkill[skill]) timeBySkill[skill] = [];
    timeBySkill[skill].push(ev.responseTimeMs);
  }

  const modeMedianTimes = {};
  for (const [mode, times] of Object.entries(timeByMode)) {
    modeMedianTimes[mode] = calculateMedian(times);
  }

  const skillMedianTimes = {};
  for (const [skill, times] of Object.entries(timeBySkill)) {
    skillMedianTimes[skill] = calculateMedian(times);
  }

  // 3. Группировка нагрузки по дням
  const dayStatsMap = new Map();

  for (const ev of events) {
    const day = ev.studyDay || getStudyDayKey(ev.reviewedAt, { dayBoundaryHour });
    if (!dayStatsMap.has(day)) {
      dayStatsMap.set(day, {
        dateKey: day,
        reviewsCount: 0,
        relearningCount: 0,
        uniqueCards: new Set(),
        times: [],
      });
    }

    const d = dayStatsMap.get(day);
    d.reviewsCount++;
    if (ev.cardId) d.uniqueCards.add(ev.cardId);

    const isRelearning = ev.previousCard?.state === 3 || ev.fsrs?.state === 3 || ev.state === 3;
    if (isRelearning) d.relearningCount++;

    if (
      Number.isFinite(ev.responseTimeMs) &&
      ev.responseTimeMs >= 0 &&
      ev.responseTimeMs <= MAX_VALID_RESPONSE_TIME_MS
    ) {
      d.times.push(ev.responseTimeMs);
    }
  }

  // Считаем карточки, введённые впервые в каждый день
  const newCardsByDay = new Map();
  for (const card of Object.values(srsCards || {})) {
    if (card && card.introducedOn) {
      newCardsByDay.set(card.introducedOn, (newCardsByDay.get(card.introducedOn) || 0) + 1);
    }
  }

  const todayKey = getStudyDayKey(now, { dayBoundaryHour });
  const range = typeof timeRangeDays === 'number' ? timeRangeDays : 30;

  const dailyWorkload = [];
  let startDateKey = addLocalDays(todayKey, -(range - 1));
  let currentKey = startDateKey;

  while (currentKey <= todayKey) {
    const stat = dayStatsMap.get(currentKey);
    const newCards = newCardsByDay.get(currentKey) || 0;

    if (stat) {
      const dayTotalTime = stat.times.reduce((a, b) => a + b, 0);
      dailyWorkload.push({
        dateKey: currentKey,
        reviewsCount: stat.reviewsCount,
        newCardsCount: newCards,
        relearningCount: stat.relearningCount,
        uniqueCardsCount: stat.uniqueCards.size,
        totalTimeMs: dayTotalTime,
        activeMinutes: Math.round(dayTotalTime / 60000),
        medianResponseTimeMs: calculateMedian(stat.times),
      });
    } else {
      dailyWorkload.push({
        dateKey: currentKey,
        reviewsCount: 0,
        newCardsCount: newCards,
        relearningCount: 0,
        uniqueCardsCount: 0,
        totalTimeMs: 0,
        activeMinutes: 0,
        medianResponseTimeMs: null,
      });
    }
    currentKey = addLocalDays(currentKey, 1);
  }

  // 4. Построение календаря активности (Heatmap) за последние 16 недель (112 дней)
  const heatmap = buildActivityHeatmap(dayStatsMap, newCardsByDay, {
    weeks: 16,
    now,
    dayBoundaryHour,
  });

  return {
    totalEventsCount: events.length,
    totalActiveTimeMs,
    totalActiveMinutes,
    globalMedianResponseTimeMs,
    formattedGlobalMedian: globalMedianResponseTimeMs
      ? `${(globalMedianResponseTimeMs / 1000).toFixed(1)} сек`
      : '—',
    modeMedianTimes,
    skillMedianTimes,
    dailyWorkload,
    heatmap,
  };
}

function buildActivityHeatmap(dayStatsMap, newCardsByDay, { weeks = 16, now, dayBoundaryHour }) {
  const todayKey = getStudyDayKey(now, { dayBoundaryHour });
  const totalDays = weeks * 7;
  const startDateKey = addLocalDays(todayKey, -(totalDays - 1));

  const cells = [];
  let currentKey = startDateKey;

  while (currentKey <= todayKey) {
    const stat = dayStatsMap.get(currentKey);
    const newCards = newCardsByDay.get(currentKey) || 0;
    const reviews = stat ? stat.reviewsCount : 0;
    const activeMins = stat ? Math.round(stat.times.reduce((a, b) => a + b, 0) / 60000) : 0;

    // Определение уровня интенсивности 0..4
    let level = 0;
    if (reviews > 0) {
      if (reviews <= 5) level = 1;
      else if (reviews <= 15) level = 2;
      else if (reviews <= 30) level = 3;
      else level = 4;
    }

    const label = `${currentKey}: ${reviews} повторений, ${newCards} новых (${activeMins} мин)`;

    cells.push({
      dateKey: currentKey,
      reviewsCount: reviews,
      newCardsCount: newCards,
      activeMinutes: activeMins,
      level,
      label,
    });

    currentKey = addLocalDays(currentKey, 1);
  }

  return cells;
}
