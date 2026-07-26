import { localDateKey, getLocalWeekday } from './local-date.js';
import { parseCardIdentity } from './knowledge-model.js';
import { cardChapter, dueCards } from './srs-helpers.js';
import { countAvailableCardsForSession } from './srs-limits.js';
import { StudyPlan } from '../studyplan.js';
import { State } from 'ts-fsrs';

export const FALLBACK_DAILY_NEW_VOCABULARY_LIMIT = 17;
export const DEFAULT_DAILY_NEW_VOCABULARY_LIMIT = FALLBACK_DAILY_NEW_VOCABULARY_LIMIT;
export const MIN_DAILY_VOCABULARY_TARGET = 1;
export const MAX_DAILY_VOCABULARY_TARGET = 25;

/**
 * Calculates the daily vocabulary target based on remaining words and study days.
 */
export function calculateDailyVocabularyTarget({
  remainingWords = 0,
  remainingStudyDays = 0,
  reserveDays,
  previousBatchProgress = null,
} = {}) {
  const words = Math.max(0, Number(remainingWords) || 0);
  if (words === 0) {
    return {
      target: 0,
      reserveDays: 0,
      effectiveVocabularyDays: 0,
      insufficientDays: false,
      requiredDailyTarget: 0,
    };
  }

  const days = Math.max(1, Number(remainingStudyDays) || 0);
  let resDays;

  if (typeof reserveDays === 'number' && !Number.isNaN(reserveDays)) {
    resDays = Math.min(Math.max(0, reserveDays), Math.max(0, days - 1));
  } else {
    if (days <= 2) {
      resDays = 0;
    } else {
      const targetWithReserve = Math.ceil(words / (days - 1));
      const targetNoReserve = Math.ceil(words / days);
      if (
        targetWithReserve > MAX_DAILY_VOCABULARY_TARGET &&
        targetNoReserve <= MAX_DAILY_VOCABULARY_TARGET
      ) {
        resDays = 0;
      } else {
        resDays = 1;
      }
    }
  }

  const effectiveVocabularyDays = Math.max(1, days - resDays);
  const rawTarget = Math.ceil(words / effectiveVocabularyDays);

  if (rawTarget > MAX_DAILY_VOCABULARY_TARGET) {
    return {
      target: MAX_DAILY_VOCABULARY_TARGET,
      insufficientDays: true,
      requiredDailyTarget: rawTarget,
      reserveDays: resDays,
      effectiveVocabularyDays,
    };
  }

  const target = Math.max(MIN_DAILY_VOCABULARY_TARGET, rawTarget);
  return {
    target,
    insufficientDays: false,
    requiredDailyTarget: rawTarget,
    reserveDays: resDays,
    effectiveVocabularyDays,
  };
}

/**
 * Gets remaining study date keys for a chapter segment from a given date key.
 */
export function getRemainingChapterStudyDates(plan, chapterId, dateKey = localDateKey()) {
  if (!plan || !Array.isArray(plan.segments)) return [];
  const chId = Number(chapterId);

  const segment =
    plan.segments.find(
      (s) => s && s.type === 'chapter' && Number(s.chapterId) === chId && s.status !== 'completed'
    ) || plan.segments.find((s) => s && s.type === 'chapter' && Number(s.chapterId) === chId);

  if (!segment || !Array.isArray(segment.assignedDates)) return [];

  const weekdays = Array.isArray(plan.studyDaysOfWeek) ? plan.studyDaysOfWeek.map(Number) : null;

  const validDates = segment.assignedDates.filter((d) => {
    if (!d || d < dateKey) return false;

    const status = segment.dateStatuses?.[d];
    if (status === 'rest-day' || status === 'skipped' || status === 'postponed') {
      return false;
    }

    if (weekdays && weekdays.length > 0) {
      if (!weekdays.includes(getLocalWeekday(d))) return false;
    }

    return true;
  });

  return [...new Set(validDates)].sort();
}

/**
 * Distributes total words evenly across assigned date keys.
 */
export function distributeVocabularyAcrossDates(totalWords, dateKeys, options = {}) {
  if (!Array.isArray(dateKeys) || dateKeys.length === 0) return {};
  const words = Math.max(0, Number(totalWords) || 0);
  const n = dateKeys.length;
  const reserveDays = Math.min(Math.max(0, Number(options.reserveDays) || 0), n - 1);
  const activeCount = n - reserveDays;

  const result = {};
  if (words === 0 || activeCount <= 0) {
    for (const d of dateKeys) result[d] = 0;
    return result;
  }

  const base = Math.floor(words / activeCount);
  const remainder = words % activeCount;

  for (let i = 0; i < n; i++) {
    const d = dateKeys[i];
    if (i < activeCount) {
      result[d] = base + (i < remainder ? 1 : 0);
    } else {
      result[d] = 0;
    }
  }

  return result;
}

/**
 * Checks if a card is locked by the learning plan.
 */
export function isCardPlanLocked(card) {
  return card?.planLocked === true;
}

/**
 * Helper to get all SRS cards for a word.
 */
function cardsForWord(srsRecords, itemId) {
  if (!srsRecords || typeof srsRecords !== 'object') return [];
  return Object.values(srsRecords).filter((c) => {
    if (!c) return false;
    const identity = parseCardIdentity(c);
    return identity.itemId === itemId;
  });
}

/**
 * Helper to retrieve words for a chapter from passed list or SRS.
 */
function getChapterWords(state, chapterId, passedWords = null) {
  if (Array.isArray(passedWords) && passedWords.length > 0) {
    return passedWords;
  }
  const chId = Number(chapterId);
  const seenItemIds = new Set();
  const words = [];
  if (state?.srs) {
    for (const card of Object.values(state.srs)) {
      if (card && cardChapter(card.id) === chId) {
        const itemId = parseCardIdentity(card).itemId;
        if (!seenItemIds.has(itemId)) {
          seenItemIds.add(itemId);
          words.push({ id: itemId });
        }
      }
    }
  }
  return words;
}

/**
 * Normalizes state to ensure vocabularyUnlocks structure and safety migration.
 */
export function normalizeVocabularyLockState(state) {
  if (!state) return state;

  if (!state.vocabularyUnlocks || typeof state.vocabularyUnlocks !== 'object') {
    state.vocabularyUnlocks = {};
  }

  const priorKnowledge = new Set(
    Array.isArray(state.priorKnowledgeChapterIds) ? state.priorKnowledgeChapterIds.map(Number) : []
  );

  const reviewEvents = Array.isArray(state.reviewEvents) ? state.reviewEvents : [];
  const cardsWithReviews = new Set(
    reviewEvents
      .filter((ev) => ev && ev.eventType === 'review' && !ev.undoneAt)
      .map((ev) => ev.cardId)
  );

  if (state.srs && typeof state.srs === 'object') {
    for (const [cardId, card] of Object.entries(state.srs)) {
      if (!card) continue;
      const chapterId = cardChapter(cardId);
      const isStudied =
        card.reps > 0 ||
        card.state !== State.New ||
        card.lastReview != null ||
        card.legacyMasteryEstimated === true ||
        cardsWithReviews.has(cardId);

      const isPrior = chapterId !== null && priorKnowledge.has(chapterId);

      if (isStudied || isPrior) {
        if (card.planLocked === true) {
          card.planLocked = false;
        }
      }
    }
  }

  return state;
}

/**
 * Helper to count remaining locked words in a chapter.
 */
export function countRemainingLockedWords(state, chapterId, words = null) {
  const chWords = getChapterWords(state, chapterId, words);
  let lockedCount = 0;
  for (const word of chWords) {
    if (!word || !word.id) continue;
    const cards = cardsForWord(state?.srs, word.id);
    if (cards.length > 0 && cards.every((c) => c.planLocked === true)) {
      lockedCount++;
    }
  }
  return lockedCount;
}

/**
 * Checks if a vocabulary item has been introduced via a confirmed study review interaction.
 * Accounts for reviewEvents and Undo.
 */
export function isVocabularyItemIntroduced(state, itemId) {
  if (!state || !itemId) return false;
  const reviewEvents = Array.isArray(state.reviewEvents) ? state.reviewEvents : [];
  const srs = state.srs || {};

  const cards = cardsForWord(srs, itemId);
  const cardIds = new Set(cards.map((c) => c.id));

  // Check if there is an active (non-undone) review event for this itemId or any of its cardIds
  const hasActiveReview = reviewEvents.some((ev) => {
    if (!ev || ev.eventType !== 'review' || ev.undoneAt) return false;
    if (ev.itemId === itemId) return true;
    if (ev.cardId && cardIds.has(ev.cardId)) return true;
    return false;
  });

  if (hasActiveReview) return true;

  // If no active review events exist, check if SRS cards have non-undone reps/reviews
  if (cards.length === 0) return false;

  const hasUndoneReview = reviewEvents.some((ev) => {
    if (!ev || ev.eventType !== 'review' || !ev.undoneAt) return false;
    if (ev.itemId === itemId) return true;
    if (ev.cardId && cardIds.has(ev.cardId)) return true;
    return false;
  });

  for (const c of cards) {
    const isStudied = c.reps > 0 || c.state !== State.New || c.lastReview != null;
    if (!isStudied) continue;
    if (hasUndoneReview && c.reps === 0 && c.state === State.New) continue;
    return true;
  }

  return false;
}

/**
 * Returns progress of the daily vocabulary batch for today (or specified dateKey).
 */
export function getVocabularyBatchProgress(state, chapterId, dateKey = localDateKey()) {
  const chId = Number(chapterId);
  const entry = state?.vocabularyUnlocks?.[chId]?.[dateKey];
  const itemIds = Array.isArray(entry?.itemIds) ? entry.itemIds : [];

  if (itemIds.length === 0) {
    return {
      total: 0,
      started: 0,
      completed: 0,
      remaining: 0,
      ratio: 1,
      isCompleted: true,
    };
  }

  let introducedCount = 0;
  for (const itemId of itemIds) {
    if (isVocabularyItemIntroduced(state, itemId)) {
      introducedCount++;
    }
  }

  const total = itemIds.length;
  const completedCount = introducedCount;
  const remaining = total - completedCount;
  const ratio = total > 0 ? completedCount / total : 1;

  return {
    total,
    started: introducedCount,
    completed: completedCount,
    remaining,
    ratio,
    isCompleted: completedCount === total,
  };
}

/**
 * Gets decision for unlocking today's vocabulary batch.
 */
export function getTodayVocabularyUnlockDecision(state, chapterId, options = {}) {
  const chId = Number(chapterId);
  const dateKey = options.dateKey || localDateKey(options.now ?? Date.now());
  const plan = options.plan ?? state?.studyPlan;
  const words = getChapterWords(state, chId, options.words);

  const remainingWords = countRemainingLockedWords(state, chId, words);

  if (remainingWords === 0) {
    return {
      shouldUnlock: false,
      target: 0,
      remainingWords: 0,
      remainingStudyDates: [],
      reserveDays: 0,
      insufficientDays: false,
      requiredDailyTarget: 0,
      blockedByPreviousBatch: false,
      reason: 'chapter-completed',
    };
  }

  // Check for uncompleted previous batch
  const existingUnlocks = state?.vocabularyUnlocks?.[chId] || {};
  const previousDates = Object.keys(existingUnlocks)
    .filter((d) => d < dateKey)
    .sort();

  for (const prevDateKey of previousDates) {
    const progress = getVocabularyBatchProgress(state, chId, prevDateKey);
    if (progress.total > 0 && !progress.isCompleted) {
      return {
        shouldUnlock: false,
        target: 0,
        remainingWords,
        remainingStudyDates: [],
        reserveDays: 0,
        insufficientDays: false,
        requiredDailyTarget: 0,
        blockedByPreviousBatch: true,
        previousBatchDateKey: prevDateKey,
        previousBatchRemaining: progress.remaining,
        reason: 'blocked-by-previous-batch',
      };
    }
  }

  // Check if already unlocked today
  if (existingUnlocks[dateKey]) {
    const unlockedItemIds = Array.isArray(existingUnlocks[dateKey].itemIds)
      ? existingUnlocks[dateKey].itemIds
      : [];
    const remainingStudyDates = getRemainingChapterStudyDates(plan, chId, dateKey);
    return {
      shouldUnlock: false,
      alreadyUnlockedToday: true,
      target: unlockedItemIds.length,
      remainingWords,
      remainingStudyDates,
      reserveDays: 0,
      insufficientDays: false,
      requiredDailyTarget: unlockedItemIds.length,
      blockedByPreviousBatch: false,
      reason: 'already-unlocked-today',
    };
  }

  const remainingStudyDates = getRemainingChapterStudyDates(plan, chId, dateKey);

  if (!plan || remainingStudyDates.length === 0) {
    const target = Math.min(remainingWords, FALLBACK_DAILY_NEW_VOCABULARY_LIMIT);
    return {
      shouldUnlock: target > 0,
      target,
      remainingWords,
      remainingStudyDates: [],
      reserveDays: 0,
      insufficientDays: false,
      requiredDailyTarget: target,
      blockedByPreviousBatch: false,
      reason: 'fallback-no-plan',
    };
  }

  const calc = calculateDailyVocabularyTarget({
    remainingWords,
    remainingStudyDays: remainingStudyDates.length,
  });

  const target = Math.min(remainingWords, calc.target);
  return {
    shouldUnlock: target > 0,
    target,
    remainingWords,
    remainingStudyDates,
    reserveDays: calc.reserveDays,
    insufficientDays: calc.insufficientDays,
    requiredDailyTarget: calc.requiredDailyTarget,
    blockedByPreviousBatch: false,
    reason: calc.insufficientDays ? 'insufficient-days' : 'plan-target',
  };
}

/**
 * Unlocks a daily batch of vocabulary cards for a specific chapter.
 * Idempotent per chapter per dateKey.
 */
export function unlockDailyVocabularyBatch(state, chapterId, options = {}) {
  const chId = Number(chapterId);
  const dateKey = options.dateKey || localDateKey(options.now ?? Date.now());

  const decision = getTodayVocabularyUnlockDecision(state, chId, {
    plan: options.plan,
    dateKey,
    words: options.words,
    now: options.now,
  });

  state.vocabularyUnlocks ||= {};
  state.vocabularyUnlocks[chId] ||= {};

  if (decision.alreadyUnlockedToday) {
    const existingEntry = state.vocabularyUnlocks[chId][dateKey];
    const unlockedItemIds = Array.isArray(existingEntry?.itemIds) ? existingEntry.itemIds : [];
    return {
      chapterId: chId,
      dateKey,
      requestedCount: options.limit ?? decision.target,
      unlockedCount: 0,
      unlockedItemIds: [],
      alreadyUnlockedToday: true,
      blockedByPreviousBatch: false,
      remainingLockedCount: decision.remainingWords,
      todaysItemIds: unlockedItemIds,
    };
  }

  if (decision.blockedByPreviousBatch) {
    return {
      chapterId: chId,
      dateKey,
      requestedCount: 0,
      unlockedCount: 0,
      unlockedItemIds: [],
      alreadyUnlockedToday: false,
      blockedByPreviousBatch: true,
      previousBatchDateKey: decision.previousBatchDateKey,
      previousBatchRemaining: decision.previousBatchRemaining,
      remainingLockedCount: decision.remainingWords,
      todaysItemIds: [],
    };
  }

  const limit =
    Number.isInteger(options.limit) && options.limit > 0 ? options.limit : decision.target;

  if (limit <= 0 || decision.remainingWords === 0) {
    return {
      chapterId: chId,
      dateKey,
      requestedCount: limit,
      unlockedCount: 0,
      unlockedItemIds: [],
      alreadyUnlockedToday: false,
      blockedByPreviousBatch: false,
      remainingLockedCount: decision.remainingWords,
      todaysItemIds: [],
    };
  }

  // Get words for this chapter
  const words = getChapterWords(state, chId, options.words);
  const lockedWords = [];

  for (const word of words) {
    if (!word || !word.id) continue;

    const cards = cardsForWord(state.srs, word.id);
    if (cards.length === 0) continue;

    const isAlreadyUnlocked = cards.some(
      (c) =>
        c.planLocked !== true ||
        c.reps > 0 ||
        c.state !== State.New ||
        c.lastReview != null ||
        c.legacyMasteryEstimated === true
    );

    if (isAlreadyUnlocked) {
      cards.forEach((c) => {
        if (c.planLocked === true) c.planLocked = false;
      });
      continue;
    }

    lockedWords.push(word);
  }

  const batchToUnlock = lockedWords.slice(0, limit);
  const unlockedItemIds = [];

  for (const word of batchToUnlock) {
    unlockedItemIds.push(word.id);
    const cards = cardsForWord(state.srs, word.id);
    cards.forEach((c) => {
      c.planLocked = false;
    });
  }

  const occurredAt = options.now ?? Date.now();
  state.vocabularyUnlocks[chId][dateKey] = {
    itemIds: unlockedItemIds,
    occurredAt,
  };

  // Add learning event
  state.learningEvents ||= [];
  const eventId = `vocabulary-batch-unlocked:${chId}:${dateKey}`;
  if (!state.learningEvents.some((e) => e.eventId === eventId)) {
    state.learningEvents.push({
      eventId,
      eventType: 'vocabulary-batch-unlocked',
      chapterId: chId,
      dateKey,
      itemIds: unlockedItemIds,
      occurredAt,
    });
  }

  const remainingLockedCount = countRemainingLockedWords(state, chId, words);

  return {
    chapterId: chId,
    dateKey,
    requestedCount: limit,
    unlockedCount: unlockedItemIds.length,
    unlockedItemIds,
    alreadyUnlockedToday: false,
    blockedByPreviousBatch: false,
    remainingLockedCount,
    todaysItemIds: unlockedItemIds,
    insufficientDays: decision.insufficientDays,
    requiredDailyTarget: decision.requiredDailyTarget,
  };
}

/**
 * Finds the oldest incomplete vocabulary batch for a chapter strictly before specified dateKey.
 */
export function getOldestIncompleteVocabularyBatch(state, chapterId, beforeDateKey = null) {
  if (!state) return null;
  const chId = Number(chapterId);
  if (!chId) return null;

  const unlocks = state?.vocabularyUnlocks?.[chId];
  if (!unlocks || typeof unlocks !== 'object') return null;

  const dates = Object.keys(unlocks)
    .filter((d) => {
      if (!Array.isArray(unlocks[d]?.itemIds) || unlocks[d].itemIds.length === 0) return false;
      if (beforeDateKey && d >= beforeDateKey) return false;
      return true;
    })
    .sort();

  for (const dateKey of dates) {
    const progress = getVocabularyBatchProgress(state, chId, dateKey);
    if (progress.total > 0 && !progress.isCompleted) {
      return {
        chapterId: chId,
        dateKey,
        itemIds: unlocks[dateKey].itemIds,
        progress,
        remaining: progress.remaining,
      };
    }
  }

  return null;
}

/**
 * Application-level coordinator for daily vocabulary batch unlocking.
 * Checks chapter start status, completion status, study plan schedule, rest days,
 * and previous incomplete batches before calling unlockDailyVocabularyBatch.
 * Does NOT save state on its own.
 */
export function ensureTodayVocabularyBatch(state, chapterId, options = {}) {
  if (!state) return { created: false, reason: 'no-state' };
  const chId = Number(chapterId);
  if (!chId) return { created: false, reason: 'invalid-chapter-id' };

  normalizeVocabularyLockState(state);

  const dateKey = options.dateKey || localDateKey(options.now ?? Date.now());
  const plan = options.plan ?? state.studyPlan;

  // 1. Check if chapter is started
  const cs = state.chapters?.[chId];
  const isStarted =
    cs?.started === true ||
    state.completedChapters?.includes(chId) ||
    state.priorKnowledgeChapterIds?.includes(chId);

  if (!isStarted) {
    return { created: false, reason: 'chapter-not-started' };
  }

  // 2. Check if chapter is completed or no locked words remain
  const remainingWords = countRemainingLockedWords(state, chId, options.words);
  if (remainingWords === 0) {
    return { created: false, reason: 'chapter-completed' };
  }

  // 3. Check if plan is paused
  if (plan?.paused === true) {
    return { created: false, reason: 'plan-paused' };
  }

  // 4. Check if date is a study day for the current segment
  if (plan && Array.isArray(plan.segments)) {
    const segment =
      plan.segments.find(
        (s) => s && s.type === 'chapter' && Number(s.chapterId) === chId && s.status !== 'completed'
      ) || plan.segments.find((s) => s && s.type === 'chapter' && Number(s.chapterId) === chId);

    if (segment) {
      const assigned = Array.isArray(segment.assignedDates) ? segment.assignedDates : [];
      const status = segment.dateStatuses?.[dateKey];
      const weekdays = Array.isArray(plan.studyDaysOfWeek)
        ? plan.studyDaysOfWeek.map(Number)
        : null;
      const isWeekdayMatch =
        !weekdays || weekdays.length === 0 || weekdays.includes(getLocalWeekday(dateKey));

      if (
        !assigned.includes(dateKey) ||
        !isWeekdayMatch ||
        status === 'rest-day' ||
        status === 'skipped' ||
        status === 'postponed'
      ) {
        return { created: false, reason: 'rest-day' };
      }
    }
  }

  // 5. Check for oldest incomplete previous batch
  const oldBatch = getOldestIncompleteVocabularyBatch(state, chId, dateKey);
  if (oldBatch) {
    return {
      created: false,
      blockedByPreviousBatch: true,
      previousBatchDateKey: oldBatch.dateKey,
      previousBatchRemaining: oldBatch.remaining,
      reason: 'blocked-by-previous-batch',
    };
  }

  // 6. Check if already unlocked today
  const existingEntry = state?.vocabularyUnlocks?.[chId]?.[dateKey];
  if (existingEntry) {
    const unlockedItemIds = Array.isArray(existingEntry.itemIds) ? existingEntry.itemIds : [];
    return {
      created: false,
      alreadyUnlockedToday: true,
      unlockedCount: 0,
      todaysItemIds: unlockedItemIds,
      reason: 'already-unlocked-today',
    };
  }

  // 7. Calculate portion size & unlock
  const decision = getTodayVocabularyUnlockDecision(state, chId, {
    plan,
    dateKey,
    words: options.words,
    now: options.now,
  });

  if (decision.target <= 0) {
    return { created: false, reason: decision.reason || 'no-words-to-unlock' };
  }

  const result = unlockDailyVocabularyBatch(state, chId, {
    limit: decision.target,
    dateKey,
    plan,
    words: options.words,
    now: options.now,
  });

  return {
    created: result.unlockedCount > 0,
    chapterId: chId,
    dateKey,
    unlockedCount: result.unlockedCount,
    unlockedItemIds: result.unlockedItemIds,
    alreadyUnlockedToday: false,
    blockedByPreviousBatch: false,
    remainingLockedCount: result.remainingLockedCount,
    reason: 'batch-created',
  };
}

/**
 * Single application-level decision function for main study CTA button and "Plan Today" card.
 */
export function getNextStudyAction(state, context = {}) {
  if (!state) {
    return {
      type: 'extra-practice',
      title: 'Продолжить обучение',
      contextText: '',
      buttonText: 'Начать',
      action: 'extra-practice',
    };
  }

  const today = context.today || localDateKey(context.now ?? Date.now());
  const plan = state.studyPlan;

  const dateStatus = plan
    ? StudyPlan.getDateStatus(plan, today, {
        today,
        learningEvents: state.learningEvents || [],
        reviewEvents: state.reviewEvents || [],
      })
    : null;
  const isRestDay = dateStatus === 'rest-day';

  // Priority 1: Mandatory due/overdue SRS reviews (studied cards due for repetition)
  const studiedDueCards = dueCards(state.srs).filter(
    (c) =>
      c &&
      !c.suspended &&
      !c.planLocked &&
      (c.reps > 0 || c.state !== State.New || c.lastReview != null)
  );
  const due = countAvailableCardsForSession(studiedDueCards, state.srs);
  if (due > 0) {
    return {
      type: 'review',
      title: isRestDay ? 'Повторить слабые знания' : 'Повторить SRS',
      contextText: isRestDay
        ? `По плану отдых, но накопилось ${due} повторений`
        : `${due} обязательных повторений накопилось — сначала разберём их`,
      buttonText: 'Повторить →',
      action: 'review',
      dueCount: due,
      isRestDay,
    };
  }

  if (isRestDay) {
    return {
      type: 'rest-day',
      title: 'День отдыха',
      contextText: 'Сегодня по плану отдых. Проведите день с пользой!',
      buttonText: 'Обзор курса',
      action: 'course',
      isRestDay: true,
    };
  }

  const activeChapterId = context.activeChapterId ?? state.activeChapterId ?? null;

  if (activeChapterId) {
    // Priority 2: Unfinished old batch
    const oldBatch = getOldestIncompleteVocabularyBatch(state, activeChapterId, today);
    if (oldBatch) {
      return {
        type: 'old-vocab-batch',
        title: 'Продолжить новые слова',
        contextText: `Продолжить слова за ${oldBatch.dateKey} · Осталось ${oldBatch.remaining}`,
        buttonText: 'Учить слова →',
        action: 'vocab-session',
        chapterId: activeChapterId,
        dateKey: oldBatch.dateKey,
        remaining: oldBatch.remaining,
      };
    }

    // Priority 3: Today's portion of new words
    const todaysProgress = getVocabularyBatchProgress(state, activeChapterId, today);
    if (todaysProgress.total > 0 && !todaysProgress.isCompleted) {
      return {
        type: 'today-vocab-batch',
        title: 'Новые слова',
        contextText: `Глава ${activeChapterId} · ${todaysProgress.completed} из ${todaysProgress.total} изучено`,
        buttonText: 'Продолжить слова →',
        action: 'vocab-session',
        chapterId: activeChapterId,
        dateKey: today,
        remaining: todaysProgress.remaining,
      };
    }

    // Priority 4: Chapter section / grammar
    const progress = context.chapterProgress || null;
    const remainingSections = Math.max(
      0,
      (progress?.totalCount || 0) - (progress?.completedCount || 0)
    );
    const sectionLabel = progress?.nextSection?.label || 'Раздел главы';

    if (!progress || !progress.completed) {
      return {
        type: 'chapter-section',
        title: 'Продолжить обучение',
        contextText: `Глава ${activeChapterId} · ${sectionLabel}`,
        buttonText: 'К главе →',
        action: 'chapter',
        chapterId: activeChapterId,
        remainingSections,
      };
    }
  }

  // Priority 5: Additional practice
  return {
    type: 'extra-practice',
    title: 'Все задачи на сегодня выполнены',
    contextText: 'Все главы и слова изучены — закрепите знания',
    buttonText: 'Практика →',
    action: 'extra-practice',
  };
}

/**
 * Builds card queue for a specific daily vocabulary batch.
 */
export function buildVocabularyBatchSessionQueue(state, chapterId, dateKey) {
  if (!state || !chapterId || !dateKey) return [];
  const chId = Number(chapterId);
  const entry = state?.vocabularyUnlocks?.[chId]?.[dateKey];
  const itemIds = Array.isArray(entry?.itemIds) ? entry.itemIds : [];

  if (itemIds.length === 0) return [];

  const itemIdSet = new Set(itemIds);
  const srs = state.srs || {};
  const batchCards = [];

  for (const card of Object.values(srs)) {
    if (!card || card.planLocked === true) continue;
    if (cardChapter(card.id) !== chId) continue;

    const identity = parseCardIdentity(card);
    if (itemIdSet.has(identity.itemId)) {
      batchCards.push(card);
    }
  }

  return batchCards;
}

/**
 * Starts a study session restricted strictly to itemIds of the specified batch dateKey.
 */
export function startVocabularyBatchSession(chapterId, dateKey, state, dependencies = {}) {
  const cards = buildVocabularyBatchSessionQueue(state, chapterId, dateKey);
  if (cards.length === 0) {
    if (typeof dependencies.toast === 'function') {
      dependencies.toast('Порция слов не найдена');
    }
    return false;
  }

  if (typeof dependencies.startSessionWithCards === 'function') {
    dependencies.startSessionWithCards(cards, chapterId, dateKey);
    return true;
  }

  return cards;
}
