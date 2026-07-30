/* src/minigame-weakness.js — Pure module for minigame word weakness calculation */

import { parseCardIdentity, SKILLS } from './knowledge-model.js';
import { validMasteryEvents } from './mastery.js';
import { normalizeKana } from './word-search-generator.js';
import { canonicalizeKnowledgeItemId } from './courses/course-context.js';

export const WEAKNESS_THRESHOLD = 50;
const DAY_MS = 86_400_000;

/**
 * Collects all SRS cards associated with a given itemId.
 *
 * @param {Object} state - App state
 * @param {string} itemId - Vocabulary item ID
 * @returns {Object} Cards by skill { recognition, recall, readingWriting, contextProduction }
 */
export function collectItemSkillCards(state, itemId) {
  const cards = {
    recognition: null,
    recall: null,
    readingWriting: null,
    contextProduction: null,
  };

  if (!state || !state.srs || typeof state.srs !== 'object' || !itemId) {
    return cards;
  }
  const canonicalItemId = canonicalizeKnowledgeItemId(itemId);

  for (const key in state.srs) {
    const card = state.srs[key];
    if (!card) continue;

    const identity = parseCardIdentity(card);
    if (canonicalizeKnowledgeItemId(identity.itemId) === canonicalItemId) {
      if (identity.skill === SKILLS.RECOGNITION) cards.recognition = card;
      else if (identity.skill === SKILLS.RECALL) cards.recall = card;
      else if (identity.skill === SKILLS.READING_WRITING) cards.readingWriting = card;
      else if (identity.skill === SKILLS.CONTEXT_PRODUCTION) cards.contextProduction = card;
    }
  }

  return cards;
}

/**
 * Calculates weakness profile and score for a single vocabulary item.
 *
 * @param {string} itemId - Vocabulary item ID
 * @param {Object} state - App state
 * @param {Object} [options]
 * @param {string} [options.gameId='wordSearch'] - 'crossword' | 'wordSearch'
 * @param {number} [options.now=Date.now()] - Current timestamp
 * @returns {Object} Weakness profile object
 */
export function getMiniGameWeaknessProfile(itemId, state, options = {}) {
  const gameId = options.gameId || 'wordSearch';
  const now = typeof options.now === 'number' ? options.now : Date.now();
  const knowledgeItemId = canonicalizeKnowledgeItemId(itemId);

  const skills = collectItemSkillCards(state, itemId);
  const cardList = Object.values(skills).filter(Boolean);

  // Filter valid review events for this itemId
  const events = state?.reviewEvents ? validMasteryEvents(state.reviewEvents, knowledgeItemId) : [];

  // Determine if there is actual review evidence
  const reviewedCards = cardList.filter((c) => (c.reps || 0) > 0);
  const hasReviewedCards = reviewedCards.length > 0;
  const hasReviewEvents = events.length > 0;
  const reviewed = hasReviewedCards || hasReviewEvents;

  if (!reviewed) {
    return {
      itemId,
      reviewed: false,
      isWeak: false,
      weaknessScore: 0,
      reasons: [],
      skills,
    };
  }

  const reasons = new Set();
  let baseScore = 0;

  // 1. Relearning check
  const hasRelearning = cardList.some((c) => c.state === 3 || c.state === 'Relearning');
  if (hasRelearning) {
    baseScore += 100;
    reasons.add('relearning');
  }

  // 2. Recent Again event (last 30 days)
  const thirtyDaysAgo = now - 30 * DAY_MS;
  const recentAgainEvents = events.filter(
    (e) => e.effectiveRating === 0 && e.reviewedAt >= thirtyDaysAgo
  );
  if (recentAgainEvents.length > 0) {
    baseScore += 90;
    reasons.add('recent-again');
  }

  // 3. Recent lapse (lapse timestamp or card lapses with recent event)
  const totalLapses = cardList.reduce((sum, c) => sum + (c.lapses || 0), 0);
  const hasRecentLapse =
    recentAgainEvents.length > 0 ||
    cardList.some((c) => (c.lapses || 0) > 0 && (c.lastReview || 0) >= thirtyDaysAgo);

  if (hasRecentLapse) {
    baseScore += 80;
    reasons.add('recent-lapse');
  }

  if (totalLapses > 0) {
    baseScore += Math.min(60, totalLapses * 20);
    reasons.add('has-lapses');
  }

  // 4. Recent Hard events (last 30 days)
  const recentHardEvents = events.filter(
    (e) => e.effectiveRating === 3 && e.reviewedAt >= thirtyDaysAgo
  );
  if (recentHardEvents.length >= 2) {
    baseScore += 30;
    reasons.add('multiple-hards');
  } else if (recentHardEvents.length === 1) {
    baseScore += 15;
    reasons.add('recent-hard');
  }

  // 5. Accuracy check (recent events, min 3 events required)
  if (events.length >= 3) {
    const correctCount = events.filter(
      (e) => e.firstAttemptCorrect && e.effectiveRating !== 0
    ).length;
    const accuracy = correctCount / events.length;
    if (accuracy < 0.6) {
      baseScore += 70;
      reasons.add('low-accuracy');
    } else if (accuracy < 0.8) {
      baseScore += 35;
      reasons.add('low-accuracy');
    }
  }

  // 6. Low recall stability check
  const recallCard = skills.recall;
  if (recallCard && (recallCard.reps || 0) > 0) {
    const stability = Number(recallCard.stability) || 0;
    if (stability < 3) {
      baseScore += 50;
      reasons.add('low-recall-stability');
    } else if (stability < 7) {
      baseScore += 25;
      reasons.add('low-recall-stability');
    }
  }

  // 7. Weak reading-writing card check
  const rwCard = skills.readingWriting;
  if (rwCard && (rwCard.reps || 0) > 0) {
    if ((rwCard.lapses || 0) > 0 || (Number(rwCard.stability) || 0) < 3) {
      baseScore += 20;
      reasons.add('weak-reading-writing');
    }
  }

  // Game-specific skill multipliers
  let multiplier = 1.0;
  if (gameId === 'crossword') {
    // Priority: recall > reading-writing > recognition > context-production
    if (reasons.has('low-recall-stability') || (recallCard && (recallCard.lapses || 0) > 0)) {
      multiplier *= 1.25;
    } else if (reasons.has('weak-reading-writing')) {
      multiplier *= 1.15;
    }
  } else {
    // wordSearch priority: recall > recognition > reading-writing > context-production
    if (reasons.has('low-recall-stability') || (recallCard && (recallCard.lapses || 0) > 0)) {
      multiplier *= 1.25;
    } else if (skills.recognition && (skills.recognition.lapses || 0) > 0) {
      multiplier *= 1.15;
    }
  }

  const finalScore = Math.round(baseScore * multiplier);

  // Critical indicators automatically mark a word as weak
  const hasLowRecallStability = Boolean(
    recallCard && (recallCard.reps || 0) > 0 && (Number(recallCard.stability) || 0) < 3
  );

  const hasCriticalSignal =
    hasRelearning ||
    recentAgainEvents.length > 0 ||
    hasRecentLapse ||
    totalLapses > 0 ||
    hasLowRecallStability;

  const isWeak = Boolean(reviewed && (finalScore >= WEAKNESS_THRESHOLD || hasCriticalSignal));

  return {
    itemId,
    reviewed,
    isWeak,
    weaknessScore: isWeak ? finalScore : 0,
    reasons: Array.from(reasons),
    skills,
  };
}

/**
 * Pure predicate helper to check if a profile is weak.
 *
 * @param {Object} profile
 * @returns {boolean} True if word is weak
 */
export function isWeakMiniGameWord(profile) {
  return Boolean(profile && profile.reviewed && profile.isWeak);
}

/**
 * Filters and ranks available candidate words for Weak Words minigame mode.
 *
 * @param {Array} candidates - Candidate words array (e.g. from getAvailableMiniGameCandidates)
 * @param {Object} state - Global app state
 * @param {Object} [options]
 * @param {string} [options.gameId='wordSearch'] - 'crossword' | 'wordSearch'
 * @returns {Array} Filtered weak candidates sorted descending by weaknessScore
 */
export function getWeakMiniGameCandidates(candidates, state, options = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0 || !state) {
    return [];
  }

  const kanaMap = new Map();

  for (const cand of candidates) {
    if (!cand || !cand.id) continue;

    // Reject grammar, particles, sentences, or invalid words
    const kana = cand.writing || cand.kana || cand.reading || '';
    const translation = cand.translation || cand.russian || cand.meaning || '';
    if (!kana || !translation) continue;

    const profile = getMiniGameWeaknessProfile(cand.id, state, options);
    if (!isWeakMiniGameWord(profile)) continue;

    const weakWordObj = {
      ...cand,
      priorityScore: profile.weaknessScore,
      weaknessProfile: profile,
    };

    // Deduplicate by normalized kana (keep highest weaknessScore)
    const normKana = normalizeKana(kana);
    const existing = kanaMap.get(normKana);
    if (!existing || weakWordObj.priorityScore > existing.priorityScore) {
      kanaMap.set(normKana, weakWordObj);
    }
  }

  const result = Array.from(kanaMap.values());
  result.sort((a, b) => b.priorityScore - a.priorityScore);
  return result;
}
