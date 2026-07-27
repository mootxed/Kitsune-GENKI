/* src/statistics/retention-statistics.js — Calculation of observed retention & time series */

import { getStudyDayKey, parseDateKey, addLocalDays } from '../local-date.js';
import { SKILLS } from '../knowledge-model.js';

export const RETENTION_DESCRIPTION =
  'Retention показывает долю карточек, которые удалось вспомнить с первой попытки.';

/**
 * Рассчитывает статистику Retention по валидным событиям.
 *
 * @param {Array<Object>} events - отфильтрованные review events
 * @param {Object} [options]
 * @param {number|'all'} [options.timeRangeDays=30]
 * @param {number} [options.targetRetention=0.9] - целевой retention FSRS (из настроек)
 * @param {number} [options.now=Date.now()]
 * @param {number} [options.dayBoundaryHour=0]
 * @returns {Object} результат расчёта retention
 */
export function calculateRetentionStats(events = [], options = {}) {
  const timeRangeDays = options.timeRangeDays || 30;
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const dayBoundaryHour = Math.max(0, Math.min(23, Number(options.dayBoundaryHour) || 0));
  const targetRetention = Number.isFinite(options.targetRetention) ? options.targetRetention : 0.9;

  // Учитываем события для первого ответа
  const firstAttemptEvents = events.filter((ev) => ev && typeof ev.effectiveRating === 'number');

  const totalFirstAttempts = firstAttemptEvents.length;
  const successfulFirstAttempts = firstAttemptEvents.filter(
    (ev) => ev.effectiveRating !== 0
  ).length;

  const isInsufficient = totalFirstAttempts === 0;
  const overallRetention = isInsufficient ? null : successfulFirstAttempts / totalFirstAttempts;
  const formattedOverall = isInsufficient
    ? 'Недостаточно данных'
    : `${(overallRetention * 100).toFixed(1)}%`;

  // --- Retention по времени ---
  const timeSeries = buildRetentionTimeSeries(events, {
    timeRangeDays,
    now,
    dayBoundaryHour,
  });

  // --- Retention по навыкам ---
  const bySkill = {};
  for (const skill of Object.values(SKILLS)) {
    const skillEvents = firstAttemptEvents.filter((ev) => ev.skill === skill);
    const count = skillEvents.length;
    const success = skillEvents.filter((ev) => ev.effectiveRating !== 0).length;
    bySkill[skill] = {
      totalAttempts: count,
      successfulAttempts: success,
      retention: count > 0 ? success / count : null,
      formattedRetention:
        count > 0 ? `${((success / count) * 100).toFixed(1)}%` : 'Недостаточно данных',
      isInsufficient: count === 0,
    };
  }

  // --- Retention по режимам ---
  const byModeMap = new Map();
  for (const ev of firstAttemptEvents) {
    const m = ev.mode || 'unknown';
    if (!byModeMap.has(m)) byModeMap.set(m, { total: 0, success: 0 });
    const item = byModeMap.get(m);
    item.total++;
    if (ev.effectiveRating !== 0) item.success++;
  }

  const byMode = {};
  for (const [mode, item] of byModeMap.entries()) {
    const retention = item.total > 0 ? item.success / item.total : null;
    byMode[mode] = {
      totalAttempts: item.total,
      successfulAttempts: item.success,
      retention,
      formattedRetention:
        item.total > 0
          ? `${((item.success / item.total) * 100).toFixed(1)}%`
          : 'Недостаточно данных',
      isInsufficient: item.total === 0,
    };
  }

  // --- Retention по стадиям FSRS (Learning, Review, Relearning) ---
  const byFsrsState = {
    learning: { total: 0, success: 0 },
    review: { total: 0, success: 0 },
    relearning: { total: 0, success: 0 },
  };

  for (const ev of firstAttemptEvents) {
    const stateVal =
      ev.previousCard?.state ?? ev.fsrs?.state ?? (typeof ev.state === 'number' ? ev.state : null);

    let stateKey = 'review';
    if (stateVal === 0 || stateVal === 1) stateKey = 'learning';
    else if (stateVal === 3) stateKey = 'relearning';
    else if (stateVal === 2) stateKey = 'review';

    byFsrsState[stateKey].total++;
    if (ev.effectiveRating !== 0) byFsrsState[stateKey].success++;
  }

  const formattedByFsrsState = {};
  for (const [key, item] of Object.entries(byFsrsState)) {
    const retention = item.total > 0 ? item.success / item.total : null;
    formattedByFsrsState[key] = {
      totalAttempts: item.total,
      successfulAttempts: item.success,
      retention,
      formattedRetention:
        item.total > 0
          ? `${((item.success / item.total) * 100).toFixed(1)}%`
          : 'Недостаточно данных',
      isInsufficient: item.total === 0,
    };
  }

  return {
    description: RETENTION_DESCRIPTION,
    isInsufficient,
    totalFirstAttempts,
    successfulFirstAttempts,
    overallRetention,
    formattedOverall,
    targetRetention,
    timeSeries,
    bySkill,
    byMode,
    byFsrsState: formattedByFsrsState,
  };
}

function buildRetentionTimeSeries(events, { timeRangeDays, now, dayBoundaryHour }) {
  const todayKey = getStudyDayKey(now, { dayBoundaryHour });

  // Группировка событий по дню
  const dayMap = new Map();
  for (const ev of events) {
    const day = ev.studyDay || getStudyDayKey(ev.reviewedAt, { dayBoundaryHour });
    if (!dayMap.has(day)) dayMap.set(day, { total: 0, success: 0 });
    const d = dayMap.get(day);
    d.total++;
    if (ev.effectiveRating !== 0) d.success++;
  }

  const range = typeof timeRangeDays === 'number' ? timeRangeDays : 30;
  const points = [];

  // Генерация точек от начала периода до сегодняшнего дня
  let startDateKey = addLocalDays(todayKey, -(range - 1));
  let currentKey = startDateKey;

  while (currentKey <= todayKey) {
    const data = dayMap.get(currentKey);
    if (data && data.total > 0) {
      const retention = data.success / data.total;
      points.push({
        dateKey: currentKey,
        hasData: true,
        total: data.total,
        success: data.success,
        retention,
        formattedRetention: `${(retention * 100).toFixed(0)}%`,
      });
    } else {
      points.push({
        dateKey: currentKey,
        hasData: false,
        total: 0,
        success: 0,
        retention: null,
        formattedRetention: '—',
      });
    }
    currentKey = addLocalDays(currentKey, 1);
  }

  // Расчёт скользящего среднего (3-дневного) для точек с данными
  const pointsWithMovingAvg = points.map((pt, idx) => {
    if (!pt.hasData) return { ...pt, movingAverage: null };

    let sum = 0;
    let count = 0;
    for (let i = Math.max(0, idx - 2); i <= idx; i++) {
      if (points[i].hasData) {
        sum += points[i].retention;
        count++;
      }
    }
    const movingAverage = count > 0 ? sum / count : pt.retention;
    return {
      ...pt,
      movingAverage,
    };
  });

  return pointsWithMovingAvg;
}
