/* src/statistics/statistics-view-model.js — Complete Statistics View Model builder */

import { getEffectiveReviewEvents } from './statistics-events.js';
import { calculateRetentionStats } from './retention-statistics.js';
import { calculateLapseStats } from './lapse-statistics.js';
import { calculateWorkloadStats } from './workload-statistics.js';
import { calculateForecastStats } from './forecast-statistics.js';
import { calculateSkillStats } from './skill-statistics.js';
import { calculateMasteryStats } from './mastery-statistics.js';
import { getStudyDayKey } from '../local-date.js';
import { MASTERY_LEVELS } from '../mastery.js';

/**
 * Строит полную модель представления (View Model) статистики для отображения в UI.
 *
 * @param {Object} state - app state
 * @param {Object} [options]
 * @param {number|'all'} [options.timeRangeDays=30] - выбранный период (7, 30, 90 или 'all')
 * @param {string} [options.skill='all'] - фильтр по навыку
 * @param {string} [options.mode='all'] - фильтр по режиму
 * @param {string} [options.knowledgeType='all'] - фильтр по типу знаний
 * @param {number} [options.now=Date.now()] - текущая отметка времени
 * @param {number} [options.dayBoundaryHour=0] - сдвиг учебного дня
 * @returns {Object} детерминированная модель представления статистики
 */
export function buildStatisticsViewModel(state, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const dayBoundaryHour = Math.max(0, Math.min(23, Number(options.dayBoundaryHour) || 0));
  const timeRangeDays = options.timeRangeDays || 30;
  const targetRetention = state?.settings?.requestRetention || 0.9;

  const opts = {
    ...options,
    now,
    dayBoundaryHour,
    timeRangeDays,
    targetRetention,
  };

  // 1. Извлечение и нормализация релевантных событий
  const events = getEffectiveReviewEvents(state, opts);
  const srsCards = state?.srs || {};

  // 2. Расчёт отдельных модулей статистики
  const retention = calculateRetentionStats(events, opts);
  const lapses = calculateLapseStats(events, srsCards, opts);
  const workload = calculateWorkloadStats(events, srsCards, opts);
  const forecast = calculateForecastStats(srsCards, events, opts);
  const skills = calculateSkillStats(events, srsCards, opts);
  const mastery = calculateMasteryStats(state, opts);

  // 3. Расчёт карточек общего обзора (Overview Cards)
  const todayKey = getStudyDayKey(now, { dayBoundaryHour });
  const todayEvents = events.filter((ev) => ev.studyDay === todayKey);

  const reviewsToday = todayEvents.length;
  const firstAttemptCorrectToday = todayEvents.filter(
    (ev) => ev.firstAttemptCorrect && ev.effectiveRating !== 0
  ).length;

  const learnedItemsCount =
    mastery.totalItemsCount - (mastery.distribution[MASTERY_LEVELS.NEW] || 0);

  const overview = {
    reviewsToday,
    firstAttemptCorrectToday,
    retentionFormatted: retention.formattedOverall,
    retentionValue: retention.overallRetention,
    retentionIsInsufficient: retention.isInsufficient,
    lapsesCount: lapses.totalLapses,
    lapsesIsInsufficient: lapses.isInsufficient,
    dueTomorrowCards: forecast.dueTomorrowCount,
    forecastTomorrowTimeFormatted: forecast.formattedTomorrowTime,
    activeCardsCount: forecast.totalActiveCardsCount,
    learnedItemsCount,
    totalItemsCount: mastery.totalItemsCount,
  };

  return {
    selectedPeriod: timeRangeDays,
    selectedSkill: options.skill || 'all',
    selectedMode: options.mode || 'all',
    selectedKnowledgeType: options.knowledgeType || 'all',
    overview,
    retention,
    lapses,
    workload,
    forecast,
    skills,
    mastery,
  };
}
