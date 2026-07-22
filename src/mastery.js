/* Derived mastery: never persisted as an incremented percentage. */

import { SKILLS, parseCardIdentity } from './knowledge-model.js';
import { localDateKey } from './local-date.js';

export const MASTERY_LEVELS = Object.freeze({
  NEW: 'Новое',
  FAMILIAR: 'Знакомо',
  REMEMBERING: 'Вспоминаю',
  CONFIDENT: 'Уверенно',
  MASTERED: 'Освоено',
});

export const MASTERY_RULES = Object.freeze({
  accuracyWindow: 20,
  recentLapseDays: 30,
  rememberingStabilityDays: 7,
  confidentStabilityDays: 30,
  masteredStabilityDays: 90,
  confidentRetrievability: 0.85,
  masteredRetrievability: 0.9,
  confidentAccuracy: 0.8,
});

const DAY = 86_400_000;
const EXCLUDED_MODES = new Set(['system-fallback', 'preview', 'debug-skip']);

export function validMasteryEvents(events, itemId) {
  return (events || []).filter(
    (event) =>
      event &&
      event.itemId === itemId &&
      !event.undoneAt &&
      event.eventType !== 'system' &&
      event.eventType !== 'preview' &&
      !EXCLUDED_MODES.has(event.mode) &&
      Object.values(SKILLS).includes(event.skill) &&
      Number.isInteger(event.reviewedAt)
  );
}

function retrievabilityForCard(card, now, getRetrievability) {
  if (!card || card.reps === 0 || !Number.isFinite(card.stability) || card.stability <= 0) return 0;
  const result = getRetrievability(card, now);
  const numeric = typeof result === 'string' ? Number.parseFloat(result) / 100 : result;
  return Number.isFinite(numeric) ? numeric : 0;
}

export function calculateMastery({
  itemId,
  cards = [],
  events = [],
  now = Date.now(),
  getRetrievability,
}) {
  if (typeof getRetrievability !== 'function') {
    throw new Error('[Mastery] getRetrievability обязателен');
  }

  const validEvents = validMasteryEvents(events, itemId).sort(
    (a, b) => a.reviewedAt - b.reviewedAt
  );
  const recent = validEvents.slice(-MASTERY_RULES.accuracyWindow);
  const successes = recent.filter(
    (event) => event.firstAttemptCorrect && event.effectiveRating >= 4
  );
  const accuracy = recent.length === 0 ? 0 : successes.length / recent.length;
  const successfulSkills = new Set(successes.map((event) => event.skill));
  const successfulDays = new Set(successes.map((event) => localDateKey(event.reviewedAt)));

  const evidencedCards = cards.filter((card) =>
    successfulSkills.has(parseCardIdentity(card).skill)
  );
  // Conservative aggregation: the weakest evidenced skill card is the durability gate.
  const stability = evidencedCards.length
    ? Math.min(...evidencedCards.map((card) => Math.max(0, Number(card.stability) || 0)))
    : 0;
  const retrievabilities = evidencedCards.map((card) =>
    retrievabilityForCard(card, now, getRetrievability)
  );
  const retrievability = retrievabilities.length ? Math.min(...retrievabilities) : 0;
  const recentLapseCutoff = now - MASTERY_RULES.recentLapseDays * DAY;
  const hasRecentLapse = validEvents.some(
    (event) => event.reviewedAt >= recentLapseCutoff && event.effectiveRating === 0
  );

  let level = MASTERY_LEVELS.NEW;
  if (successes.length > 0) level = MASTERY_LEVELS.FAMILIAR;
  if (
    stability >= MASTERY_RULES.rememberingStabilityDays &&
    successfulDays.size >= 2 &&
    successfulSkills.has(SKILLS.RECALL)
  ) {
    level = MASTERY_LEVELS.REMEMBERING;
  }
  if (
    stability >= MASTERY_RULES.confidentStabilityDays &&
    retrievability >= MASTERY_RULES.confidentRetrievability &&
    accuracy >= MASTERY_RULES.confidentAccuracy &&
    successfulSkills.size >= 2
  ) {
    level = MASTERY_LEVELS.CONFIDENT;
  }
  if (
    level === MASTERY_LEVELS.CONFIDENT &&
    stability >= MASTERY_RULES.masteredStabilityDays &&
    retrievability >= MASTERY_RULES.masteredRetrievability &&
    successfulSkills.has(SKILLS.CONTEXT_PRODUCTION) &&
    !hasRecentLapse
  ) {
    level = MASTERY_LEVELS.MASTERED;
  }

  let streak = 0;
  for (let index = recent.length - 1; index >= 0; index--) {
    if (!recent[index].firstAttemptCorrect || recent[index].effectiveRating < 4) break;
    streak++;
  }
  const durabilityScore = Math.min(1, stability / MASTERY_RULES.masteredStabilityDays);
  const skillScore = (successfulSkills.size / Object.keys(SKILLS).length) * accuracy;
  const consistencyScore = Math.min(1, streak / 5);
  const score = Math.round(
    (durabilityScore * 0.5 + skillScore * 0.35 + consistencyScore * 0.15) * 100
  );
  const needsRefresh = cards.some((card) => Number(card.due) <= now && card.reps > 0);

  return {
    itemId,
    level,
    label: `${level}${level === MASTERY_LEVELS.MASTERED && needsRefresh ? ' · пора освежить' : ''}`,
    score,
    accuracy,
    stability,
    retrievability,
    skills: [...successfulSkills],
    successfulDays: successfulDays.size,
    hasRecentLapse,
    needsRefresh,
    evidenceCount: validEvents.length,
  };
}
