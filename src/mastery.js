/* Derived mastery depth and current readiness are deliberately separate. */

import { SKILLS, modeSkill, parseCardIdentity } from './knowledge-model.js';
import { localDateKey } from './local-date.js';

export const MASTERY_LEVELS = Object.freeze({
  NEW: 'Новое',
  FAMILIAR: 'Знакомо',
  REMEMBERING: 'Вспоминаю',
  CONFIDENT: 'Уверенно',
  MASTERED: 'Освоено',
});

export const READINESS = Object.freeze({
  NEW: 'Ещё не проверено',
  READY: 'Готово',
  REFRESH: 'Пора освежить',
  ESTIMATED: 'Требуется подтверждение',
});

export const MASTERY_RULES = Object.freeze({
  accuracyWindow: 20,
  recentLapseDays: 30,
  rememberingStabilityDays: 7,
  confidentStabilityDays: 30,
  masteredStabilityDays: 90,
  confidentAccuracy: 0.8,
  productionAccuracy: 0.8,
});

const DAY = 86_400_000;
const EXCLUDED_MODES = new Set(['system-fallback', 'preview', 'debug-skip']);

export function validMasteryEvents(events, itemId) {
  return (events || []).filter(
    (event) =>
      event &&
      event.itemId === itemId &&
      !event.undoneAt &&
      event.eventType === 'review' &&
      !EXCLUDED_MODES.has(event.mode) &&
      Object.values(SKILLS).includes(event.skill) &&
      modeSkill(event.mode) === event.skill &&
      [0, 3, 4, 5].includes(event.effectiveRating) &&
      Number.isInteger(event.reviewedAt)
  );
}

function retrievabilityForCard(card, now, getRetrievability) {
  if (!card || card.reps === 0 || !Number.isFinite(card.stability) || card.stability <= 0) return 0;
  const result = getRetrievability(card, now);
  const numeric = typeof result === 'string' ? Number.parseFloat(result) / 100 : result;
  return Number.isFinite(numeric) ? numeric : 0;
}

function metricForSkill({ skill, cards, events, archive, now, getRetrievability }) {
  const archivedOutcomes = (archive?.recentOutcomes?.[skill] || []).map((outcome) => ({
    firstAttemptCorrect: outcome.correct === true,
    effectiveRating: outcome.correct === true ? 4 : 0,
    reviewedAt: outcome.reviewedAt,
  }));
  const skillEvents = [...archivedOutcomes, ...events.filter((event) => event.skill === skill)]
    .sort((a, b) => (a.reviewedAt || 0) - (b.reviewedAt || 0))
    .slice(-MASTERY_RULES.accuracyWindow);
  const successes = skillEvents.filter(
    (event) => event.firstAttemptCorrect && event.effectiveRating !== 0
  );
  const archivedDays = archive?.successfulDays?.[skill] || [];
  const successfulDays = new Set([
    ...archivedDays,
    ...successes.map((event) => localDateKey(event.reviewedAt)),
  ]);
  const matchingCards = cards.filter((card) => parseCardIdentity(card).skill === skill);
  const card = matchingCards.sort(
    (a, b) => (Number(b.stability) || 0) - (Number(a.stability) || 0)
  )[0];

  return {
    skill,
    card,
    stability: Math.max(0, Number(card?.stability) || 0),
    retrievability: retrievabilityForCard(card, now, getRetrievability),
    accuracy: skillEvents.length === 0 ? 0 : successes.length / skillEvents.length,
    hasSuccess: successes.length > 0 || archive?.successfulSkills?.[skill] === true,
    successCount: successes.length + (archive?.successfulCount?.[skill] || 0),
    successfulDays: successfulDays.size,
  };
}

function progressRatio(value, target) {
  return Math.max(0, Math.min(1, value / target));
}

export function calculateMastery({
  itemId,
  cards = [],
  events = [],
  archive = null,
  applicableSkills = null,
  now = Date.now(),
  getRetrievability,
}) {
  if (typeof getRetrievability !== 'function') {
    throw new Error('[Mastery] getRetrievability обязателен');
  }

  const validEvents = validMasteryEvents(events, itemId).sort(
    (a, b) => a.reviewedAt - b.reviewedAt
  );
  const applicable = new Set(
    applicableSkills?.length ? applicableSkills : cards.map((card) => parseCardIdentity(card).skill)
  );
  const metrics = Object.fromEntries(
    Object.values(SKILLS).map((skill) => [
      skill,
      metricForSkill({ skill, cards, events: validEvents, archive, now, getRetrievability }),
    ])
  );
  const recognition = metrics[SKILLS.RECOGNITION];
  const recall = metrics[SKILLS.RECALL];
  const productionSkill = applicable.has(SKILLS.CONTEXT_PRODUCTION)
    ? SKILLS.CONTEXT_PRODUCTION
    : applicable.has(SKILLS.READING_WRITING)
      ? SKILLS.READING_WRITING
      : SKILLS.RECALL;
  const production = metrics[productionSkill];
  const applicableMetrics = [...applicable].map((skill) => metrics[skill]).filter(Boolean);
  const hasCleanSuccess = applicableMetrics.some((metric) => metric.hasSuccess);
  const hasLegacyEstimate = cards.some(
    (card) => card.legacyMasteryEstimated && card.reps > 0 && Number(card.stability) > 0
  );

  let level = MASTERY_LEVELS.NEW;
  if (hasCleanSuccess || hasLegacyEstimate) level = MASTERY_LEVELS.FAMILIAR;

  const remembering =
    level === MASTERY_LEVELS.FAMILIAR &&
    recall.hasSuccess &&
    recall.successfulDays >= 2 &&
    recall.stability >= MASTERY_RULES.rememberingStabilityDays;
  if (remembering) level = MASTERY_LEVELS.REMEMBERING;

  const confident =
    level === MASTERY_LEVELS.REMEMBERING &&
    recognition.hasSuccess &&
    recognition.stability >= MASTERY_RULES.confidentStabilityDays &&
    recall.stability >= MASTERY_RULES.confidentStabilityDays &&
    recall.accuracy >= MASTERY_RULES.confidentAccuracy;
  if (confident) level = MASTERY_LEVELS.CONFIDENT;

  const mastered =
    level === MASTERY_LEVELS.CONFIDENT &&
    production.hasSuccess &&
    production.successfulDays >= 2 &&
    production.accuracy >= MASTERY_RULES.productionAccuracy &&
    production.stability >= MASTERY_RULES.masteredStabilityDays &&
    recall.stability >= MASTERY_RULES.masteredStabilityDays;
  if (mastered) level = MASTERY_LEVELS.MASTERED;

  let score = 0;
  if (level === MASTERY_LEVELS.FAMILIAR) {
    const legacyStability = Math.max(...cards.map((card) => Number(card.stability) || 0), 0);
    const rememberingProgress = Math.min(
      progressRatio(recall.stability, MASTERY_RULES.rememberingStabilityDays),
      progressRatio(recall.successfulDays, 2)
    );
    score = Math.round(
      15 + 24 * (hasCleanSuccess ? rememberingProgress : progressRatio(legacyStability, 90))
    );
  } else if (level === MASTERY_LEVELS.REMEMBERING) {
    const confidentProgress = Math.min(
      progressRatio(recognition.stability, MASTERY_RULES.confidentStabilityDays),
      progressRatio(recall.stability, MASTERY_RULES.confidentStabilityDays),
      progressRatio(recall.accuracy, MASTERY_RULES.confidentAccuracy)
    );
    score = Math.round(40 + 29 * confidentProgress);
  } else if (level === MASTERY_LEVELS.CONFIDENT) {
    const masteredProgress = Math.min(
      progressRatio(recall.stability, MASTERY_RULES.masteredStabilityDays),
      progressRatio(production.stability, MASTERY_RULES.masteredStabilityDays),
      progressRatio(production.successfulDays, 2),
      progressRatio(production.accuracy, MASTERY_RULES.productionAccuracy)
    );
    score = Math.round(70 + 29 * masteredProgress);
  } else if (level === MASTERY_LEVELS.MASTERED) {
    score = 100;
  }

  const practicedMetrics = applicableMetrics.filter((metric) => metric.card?.reps > 0);
  const retrievability = practicedMetrics.length
    ? Math.min(...practicedMetrics.map((metric) => metric.retrievability))
    : 0;
  const due = practicedMetrics.some((metric) => Number(metric.card.due) <= now);
  const lapseAt = Math.max(
    archive?.recentLapseAt || 0,
    ...validEvents.filter((event) => event.effectiveRating === 0).map((event) => event.reviewedAt),
    0
  );
  const hasRecentLapse = lapseAt >= now - MASTERY_RULES.recentLapseDays * DAY;
  const readinessThreshold =
    level === MASTERY_LEVELS.MASTERED
      ? 0.9
      : level === MASTERY_LEVELS.CONFIDENT
        ? 0.85
        : level === MASTERY_LEVELS.REMEMBERING
          ? 0.75
          : 0.6;
  const lowRetrievability = practicedMetrics.some(
    (metric) => metric.hasSuccess && metric.retrievability < readinessThreshold
  );
  const isEstimated = hasLegacyEstimate && !recognition.hasSuccess;
  const readiness =
    level === MASTERY_LEVELS.NEW
      ? READINESS.NEW
      : isEstimated
        ? READINESS.ESTIMATED
        : due || hasRecentLapse || lowRetrievability
          ? READINESS.REFRESH
          : READINESS.READY;

  return {
    itemId,
    level,
    label: isEstimated ? 'Ранее изучалось' : level,
    readiness,
    readinessLabel: readiness,
    score,
    retrievability,
    skills: applicableMetrics.filter((metric) => metric.hasSuccess).map((metric) => metric.skill),
    skillMetrics: metrics,
    productionSkill,
    hasRecentLapse,
    lowRetrievability,
    needsRefresh: readiness === READINESS.REFRESH,
    evidenceCount: validEvents.length + (archive?.evidenceCount || 0),
    isEstimated,
  };
}
