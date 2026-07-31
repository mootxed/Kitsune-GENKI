/**
 * src/dictionary/dictionary-fsrs-service.js
 *
 * Read-only FSRS summary for a dictionaryId.
 *
 * Maps: dictionaryId → knowledgeItemId → FSRS cards → mastery summary
 *
 * IMPORTANT: Opening this summary MUST NOT mutate any FSRS state.
 * No reviews are created, no due dates changed, no reps incremented.
 *
 * Uses:
 *   - calculateMastery() from src/mastery.js
 *   - SRS.getRetrievability() from srs.js
 *   - cardsForItem() from src/knowledge-model.js
 *   - SKILLS from src/knowledge-model.js
 */

import { SKILLS, cardsForItem } from '../knowledge-model.js';
import { calculateMastery } from '../mastery.js';
import { resolveDictionaryAlias } from './dictionary-store.js';

/**
 * @typedef {Object} FSRSSummary
 * @property {string} dictionaryId
 * @property {string|null} masteryLevel    — e.g. 'Новое', 'Знакомо', 'Освоено'
 * @property {number} masteryScore         — 0..100
 * @property {number|null} retrievability  — 0..1 or null if no cards
 * @property {string|null} nextReviewDate  — ISO date string or null
 * @property {boolean} hasFSRS            — true if any FSRS cards exist
 * @property {Object} skills              — { recognition, recall, production } status per skill
 * @property {number} reps                — total successful reviews
 * @property {number} lapses              — total lapses
 */

/**
 * Get FSRS summary for a dictionaryId.
 *
 * @param {object} params
 * @param {string} params.dictionaryId
 * @param {object} params.state           — app state with srsRecords, reviewEvents, etc.
 * @param {object} params.srs             — SRS instance with getRetrievability()
 * @param {number} [params.now]           — current timestamp (default: Date.now())
 * @returns {FSRSSummary}
 */
export function getDictionaryFSRS({ dictionaryId, state, srs, now = Date.now() }) {
  const empty = {
    dictionaryId,
    masteryLevel: null,
    masteryScore: 0,
    retrievability: null,
    nextReviewDate: null,
    hasFSRS: false,
    skills: {},
    reps: 0,
    lapses: 0,
  };

  if (!dictionaryId || !state || !srs) return empty;

  const canonical = resolveDictionaryAlias(dictionaryId) || dictionaryId;

  // Collect all SRS cards for this dictionaryId
  const srsRecords = state.srsRecords || {};
  const cards = cardsForItem(srsRecords, canonical);

  if (cards.length === 0) {
    return { ...empty, dictionaryId: canonical };
  }

  // Collect review events
  const allEvents = state.reviewEvents || [];
  const events = allEvents.filter((e) => {
    if (!e || !e.itemId) return false;
    const resolvedItemId = resolveDictionaryAlias(e.itemId) || e.itemId;
    return resolvedItemId === canonical;
  });

  const archive = state.masteryArchive?.[canonical] || null;

  // Calculate mastery — PURELY READ ONLY, does not mutate state
  let masteryResult;
  try {
    masteryResult = calculateMastery({
      itemId: canonical,
      cards,
      events,
      archive,
      now,
      getRetrievability: (card, ts) => srs.getRetrievability(card, ts),
    });
  } catch {
    return { ...empty, dictionaryId: canonical, hasFSRS: true };
  }

  // Build skill status map
  const skillsStatus = {};
  for (const skill of Object.values(SKILLS)) {
    const metric = masteryResult.skillMetrics?.[skill];
    if (!metric) continue;
    skillsStatus[skill] = {
      hasCards: metric.card != null,
      hasSuccess: metric.hasSuccess,
      reps: metric.card?.reps || 0,
      stability: metric.stability,
      retrievability: metric.retrievability,
      due: metric.card ? Number(metric.card.due) <= now : false,
    };
  }

  // Aggregate reps and lapses across all cards
  const totalReps = cards.reduce((sum, c) => sum + (c.reps || 0), 0);
  const totalLapses = cards.reduce((sum, c) => sum + (c.lapses || 0), 0);

  // Next review: earliest due date among all cards
  const dueTimestamps = cards.map((c) => Number(c.due)).filter((d) => Number.isFinite(d) && d > 0);
  const earliestDue = dueTimestamps.length ? Math.min(...dueTimestamps) : null;
  const nextReviewDate = earliestDue ? new Date(earliestDue).toISOString().split('T')[0] : null;

  return {
    dictionaryId: canonical,
    masteryLevel: masteryResult.level,
    masteryLabel: masteryResult.label,
    masteryScore: masteryResult.score,
    retrievability:
      typeof masteryResult.retrievability === 'number' ? masteryResult.retrievability : null,
    nextReviewDate,
    hasFSRS: true,
    skills: skillsStatus,
    reps: totalReps,
    lapses: totalLapses,
    needsRefresh: masteryResult.needsRefresh,
    readiness: masteryResult.readiness,
    hasRecentLapse: masteryResult.hasRecentLapse,
  };
}

/**
 * Format confidence number as human-readable label.
 * @param {number} confidence  — 0..1
 * @returns {string}
 */
export function formatConfidence(confidence) {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return 'Неизвестно';
  if (confidence >= 0.85) return 'Высокая уверенность';
  if (confidence >= 0.5) return 'Средняя уверенность';
  return 'Низкая уверенность';
}

/**
 * Format retrievability as percentage string.
 * @param {number|null} retrievability  — 0..1 or null
 * @returns {string}
 */
export function formatRetrievability(retrievability) {
  if (retrievability == null || !Number.isFinite(retrievability)) return '—';
  return `${Math.round(retrievability * 100)}%`;
}
