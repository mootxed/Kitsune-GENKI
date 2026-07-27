/* src/statistics/skill-statistics.js — Statistics per skill (recognition, recall, reading-writing, context-production) */

import { State } from 'ts-fsrs';
import { SKILLS, parseCardIdentity } from '../knowledge-model.js';
import { calculateMedian } from './workload-statistics.js';
import { getStudyDayKey } from '../local-date.js';

export const SKILL_LABELS = Object.freeze({
  [SKILLS.RECOGNITION]: 'Recognition (Распознавание)',
  [SKILLS.RECALL]: 'Recall (Воспроизведение)',
  [SKILLS.READING_WRITING]: 'Reading & Writing (Чтение/Письмо)',
  [SKILLS.CONTEXT_PRODUCTION]: 'Context-Production (Использование в контексте)',
});

/**
 * Рассчитывает статистику в разрезе каждого из 4 навыков.
 *
 * @param {Array<Object>} events - отфильтрованные review events
 * @param {Object} srsCards - словарь карточек state.srs
 * @param {Object} [options]
 * @param {number} [options.now=Date.now()]
 * @param {number} [options.dayBoundaryHour=0]
 * @returns {Object} результат по навыкам
 */
export function calculateSkillStats(events = [], srsCards = {}, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const dayBoundaryHour = Math.max(0, Math.min(23, Number(options.dayBoundaryHour) || 0));
  const todayKey = getStudyDayKey(now, { dayBoundaryHour });

  const allCards = Object.values(srsCards || {}).filter(Boolean);

  // Группировка карточек по навыкам
  const cardsBySkill = {
    [SKILLS.RECOGNITION]: [],
    [SKILLS.RECALL]: [],
    [SKILLS.READING_WRITING]: [],
    [SKILLS.CONTEXT_PRODUCTION]: [],
  };

  for (const card of allCards) {
    const identity = parseCardIdentity(card);
    const skill = identity.skill;
    if (cardsBySkill[skill]) {
      cardsBySkill[skill].push(card);
    }
  }

  // Все уникальные itemId в системе
  const allItemIds = new Set(allCards.map((c) => parseCardIdentity(c).itemId).filter(Boolean));
  const totalItemsCount = allItemIds.size || 1;

  // Группировка событий по навыкам
  const eventsBySkill = {
    [SKILLS.RECOGNITION]: [],
    [SKILLS.RECALL]: [],
    [SKILLS.READING_WRITING]: [],
    [SKILLS.CONTEXT_PRODUCTION]: [],
  };

  for (const ev of events) {
    const skill = ev.skill;
    if (eventsBySkill[skill]) {
      eventsBySkill[skill].push(ev);
    }
  }

  const skillStats = {};

  for (const skill of Object.values(SKILLS)) {
    const cards = cardsBySkill[skill];
    const skillEvents = eventsBySkill[skill];

    const activeCards = cards.filter((c) => c.planLocked !== true);
    const suspendedCards = activeCards.filter((c) => c.suspended === true);
    const nonSuspendedActive = activeCards.filter((c) => c.suspended !== true);

    const newCardsCount = nonSuspendedActive.filter(
      (c) => c.state === State.New || c.state === 0
    ).length;
    const learningCardsCount = nonSuspendedActive.filter(
      (c) => c.state === State.Learning || c.state === 1
    ).length;
    const reviewCardsCount = nonSuspendedActive.filter(
      (c) => c.state === State.Review || c.state === 2
    ).length;
    const relearningCardsCount = nonSuspendedActive.filter(
      (c) => c.state === State.Relearning || c.state === 3
    ).length;

    const dueTodayCount = nonSuspendedActive.filter((c) => {
      if (c.state === State.New || c.state === 0) return false;
      const dueTime = Number(c.due) || now;
      const dueDayKey = getStudyDayKey(dueTime, { dayBoundaryHour });
      return dueDayKey <= todayKey;
    }).length;

    // Retention для навыка
    const validFirstAttempts = skillEvents.filter((ev) => typeof ev.effectiveRating === 'number');
    const totalAttempts = validFirstAttempts.length;
    const successfulAttempts = validFirstAttempts.filter((ev) => ev.effectiveRating !== 0).length;

    const isInsufficient = totalAttempts === 0;
    const retention = isInsufficient ? null : successfulAttempts / totalAttempts;
    const formattedRetention = isInsufficient
      ? 'Недостаточно данных'
      : `${(retention * 100).toFixed(1)}%`;

    // Lapses для навыка (только на стадии Review)
    const lapsesCount = skillEvents.filter((ev) => {
      const prev = ev.previousCard?.state ?? ev.fsrs?.state ?? ev.state;
      return (prev === State.Review || prev === 2) && ev.effectiveRating === 0;
    }).length;

    // Медианы
    const stabilities = nonSuspendedActive.map((c) => Number(c.stability) || 0);
    const difficulties = nonSuspendedActive.map((c) => Number(c.difficulty) || 0);
    const responseTimes = skillEvents
      .map((ev) => ev.responseTimeMs)
      .filter((t) => Number.isFinite(t) && t >= 0 && t <= 120000);

    const medianStability = calculateMedian(stabilities);
    const medianDifficulty = calculateMedian(difficulties);
    const medianResponseTimeMs = calculateMedian(responseTimes);

    // Успешные дни
    const successfulDays = new Set(
      validFirstAttempts
        .filter((ev) => ev.effectiveRating !== 0)
        .map((ev) => ev.studyDay || getStudyDayKey(ev.reviewedAt, { dayBoundaryHour }))
    );

    // Доля доступности и подтверждённого evidence
    const skillItemIds = new Set(cards.map((c) => parseCardIdentity(c).itemId));
    const availabilityShare = skillItemIds.size / totalItemsCount;

    const confirmedEvidenceItems = new Set(
      validFirstAttempts.filter((ev) => ev.effectiveRating !== 0).map((ev) => ev.itemId)
    );
    const evidenceShare = confirmedEvidenceItems.size / totalItemsCount;

    // Чёткий статус наличия / проверки навыка
    let statusText = 'Навык проверен';
    let statusCode = 'verified';

    if (cards.length === 0) {
      if (skill === SKILLS.CONTEXT_PRODUCTION) {
        statusText = 'Задание для навыка недоступно';
        statusCode = 'task_unavailable';
      } else {
        statusText = 'Навык ещё не открыт';
        statusCode = 'unopened';
      }
    } else if (totalAttempts === 0) {
      statusText = 'Навык открыт, но ещё не проверен';
      statusCode = 'untested';
    }

    skillStats[skill] = {
      skill,
      label: SKILL_LABELS[skill] || skill,
      totalCardsCount: cards.length,
      activeCardsCount: activeCards.length,
      nonSuspendedActiveCount: nonSuspendedActive.length,
      newCardsCount,
      learningCardsCount,
      reviewCardsCount,
      relearningCardsCount,
      suspendedCardsCount: suspendedCards.length,
      dueTodayCount,
      isInsufficient,
      totalAttempts,
      successfulAttempts,
      retention,
      formattedRetention,
      lapsesCount,
      medianStability,
      medianDifficulty,
      medianResponseTimeMs,
      formattedResponseTime: medianResponseTimeMs
        ? `${(medianResponseTimeMs / 1000).toFixed(1)} сек`
        : '—',
      successfulDaysCount: successfulDays.size,
      availabilityShare,
      formattedAvailabilityShare: `${(availabilityShare * 100).toFixed(0)}%`,
      evidenceShare,
      formattedEvidenceShare: `${(evidenceShare * 100).toFixed(0)}%`,
      statusText,
      statusCode,
    };
  }

  return skillStats;
}
