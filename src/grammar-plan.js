/* src/grammar-plan.js — Gradual Grammar Delivery & Verification */

import { localDateKey, getLocalWeekday } from './local-date.js';
import { getChapterGrammarTopics } from './chapter-content-model.js';
import { isGrammarTopicCompleted, isPriorKnowledge } from './chapter-evidence.js';
import {
  getOldestIncompleteVocabularyBatch,
  getVocabularyBatchProgress,
  isVocabularyItemIntroduced,
} from './vocabulary-unlock-plan.js';
import { dueCards } from './srs-helpers.js';

export const HEAVY_VOCABULARY_DUE_THRESHOLD = 25;

export function normalizeGrammarState(state) {
  if (!state) return state;
  state.grammarUnlocks ||= {};

  if (state.chapters && typeof state.chapters === 'object') {
    for (const cs of Object.values(state.chapters)) {
      if (!cs || !cs.checklist) continue;
      if (cs.checklist.grammar === true) {
        cs.checklist.grammar = true;
      }
    }
  }
  return state;
}

export function isFirstVocabularyBatchCompleted(state, chapterId, _dateKey = localDateKey()) {
  const chId = Number(chapterId);
  const cs = state?.chapters?.[chId];
  if (cs?.legacyVocabularyCompleted || cs?.checklist?.vocab) return true;
  if (isPriorKnowledge(state, chId)) return true;

  const unlocks = state?.vocabularyUnlocks?.[chId];
  if (!unlocks || typeof unlocks !== 'object') return false;

  const dates = Object.keys(unlocks).sort();
  if (dates.length === 0) return false;

  const firstDate = dates[0];
  const progress = getVocabularyBatchProgress(state, chId, firstDate);
  if (progress.total > 0 && progress.isCompleted) return true;

  return Boolean(cs?.started && dates.length > 0);
}

export function getUnlockedGrammarTopicIds(state, chapterId) {
  const chId = Number(chapterId);
  const unlocks = state?.grammarUnlocks?.[chId] || state?.grammarUnlocks?.[String(chId)] || {};
  const topicIds = new Set();

  for (const list of Object.values(unlocks)) {
    if (Array.isArray(list)) {
      list.forEach((id) => topicIds.add(id));
    }
  }

  return topicIds;
}

export function getGrammarTopicStatus(state, chapterId, topicId, _chapterMeta = null) {
  const chId = Number(chapterId);
  const cs = state?.chapters?.[chId] || state?.chapters?.[String(chId)];

  if (isPriorKnowledge(state, chId) || isGrammarTopicCompleted(cs, topicId)) {
    return 'completed';
  }

  const unlockedIds = getUnlockedGrammarTopicIds(state, chapterId);
  if (unlockedIds.has(topicId)) {
    if (state?.grammarProgress?.[chId]?.[topicId]?.attempts > 0) return 'in_progress';
    return 'unlocked';
  }

  return 'locked';
}

export function canUnlockNextGrammarTopic(state, chapterId, options = {}) {
  const chId = Number(chapterId);
  const dateKey = options.dateKey || localDateKey(options.now ?? Date.now());
  const plan = options.plan ?? state?.studyPlan;
  const chapterMeta = options.chapterMeta;

  const cs = state?.chapters?.[chId];
  if (!cs || !cs.started) {
    return { canUnlock: false, reason: 'chapter-not-started' };
  }

  if (isPriorKnowledge(state, chId)) {
    return { canUnlock: false, reason: 'prior-knowledge' };
  }

  // Check rest day
  if (plan && Array.isArray(plan.segments)) {
    const segment = plan.segments.find(
      (s) => s && s.type === 'chapter' && Number(s.chapterId) === chId
    );
    if (segment) {
      const status = segment.dateStatuses?.[dateKey];
      const weekdays = Array.isArray(plan.studyDaysOfWeek)
        ? plan.studyDaysOfWeek.map(Number)
        : null;
      const isWeekdayMatch =
        !weekdays || weekdays.length === 0 || weekdays.includes(getLocalWeekday(dateKey));
      if (
        status === 'rest-day' ||
        status === 'skipped' ||
        status === 'postponed' ||
        !isWeekdayMatch
      ) {
        return { canUnlock: false, reason: 'rest-day' };
      }
    }
  }

  // Check if already unlocked a topic today
  const todaysUnlocks = state?.grammarUnlocks?.[chId]?.[dateKey] || [];
  if (todaysUnlocks.length > 0) {
    return { canUnlock: false, reason: 'already-unlocked-today', topicId: todaysUnlocks[0] };
  }

  // Rule 1: Must complete at least 1st vocabulary batch
  if (!isFirstVocabularyBatchCompleted(state, chId, dateKey)) {
    return { canUnlock: false, reason: 'vocabulary-prerequisite-not-met' };
  }

  // Rule 2: Heavy vocabulary load check
  const oldBatch = getOldestIncompleteVocabularyBatch(state, chId, dateKey);
  const srsDueCount = dueCards(state?.srs, chId).length;
  if (oldBatch || srsDueCount > HEAVY_VOCABULARY_DUE_THRESHOLD) {
    return { canUnlock: false, reason: 'heavy-vocabulary-load', dueCount: srsDueCount, oldBatch };
  }

  // Find topics for chapter
  const topics = getChapterGrammarTopics(chapterMeta);
  if (topics.length === 0) {
    return { canUnlock: false, reason: 'no-grammar-topics' };
  }

  // 1st topic auto-unlocks after 1st vocab batch, subsequent topics require previous topic to be completed
  let candidate = null;
  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    const status = getGrammarTopicStatus(state, chId, topic.id, chapterMeta);

    if (status === 'completed') continue;

    if (status === 'unlocked') {
      return { canUnlock: false, reason: 'previous-topic-incomplete', pendingTopic: topic };
    }

    if (status === 'locked') {
      if (i > 0) {
        const prevTopic = topics[i - 1];
        const prevStatus = getGrammarTopicStatus(state, chId, prevTopic.id, chapterMeta);
        if (prevStatus !== 'completed') {
          return { canUnlock: false, reason: 'previous-topic-incomplete', pendingTopic: prevTopic };
        }
      }
      candidate = topic;
      break;
    }
  }

  if (!candidate) {
    return { canUnlock: false, reason: 'all-topics-completed' };
  }

  return { canUnlock: true, nextTopic: candidate, reason: 'eligible' };
}

export function unlockDailyGrammarTopic(state, chapterId, options = {}) {
  const chId = Number(chapterId);
  const dateKey = options.dateKey || localDateKey(options.now ?? Date.now());

  state.grammarUnlocks ||= {};
  state.grammarUnlocks[chId] ||= {};

  const decision = canUnlockNextGrammarTopic(state, chId, { ...options, dateKey });

  if (!decision.canUnlock) {
    return {
      chapterId: chId,
      dateKey,
      unlocked: false,
      reason: decision.reason,
      topic: decision.pendingTopic || null,
    };
  }

  const topicToUnlock = decision.nextTopic;
  state.grammarUnlocks[chId][dateKey] ||= [];
  if (!state.grammarUnlocks[chId][dateKey].includes(topicToUnlock.id)) {
    state.grammarUnlocks[chId][dateKey].push(topicToUnlock.id);
  }

  const occurredAt = options.now ?? Date.now();
  state.learningEvents ||= [];
  const eventId = `grammar-topic-unlocked:${chId}:${topicToUnlock.id}:${dateKey}`;
  if (!state.learningEvents.some((e) => e.eventId === eventId)) {
    state.learningEvents.push({
      eventId,
      eventType: 'grammar-topic-unlocked',
      chapterId: chId,
      topicId: topicToUnlock.id,
      dateKey,
      occurredAt,
    });
  }

  return {
    chapterId: chId,
    dateKey,
    unlocked: true,
    topic: topicToUnlock,
    reason: 'unlocked-successfully',
  };
}

export function getGrammarTopicPrerequisiteStatus(state, chapterId, topic, chapterMeta = null) {
  const chId = Number(chapterId);
  const cs = state?.chapters?.[chId];
  if (!cs || !cs.started) {
    return {
      satisfied: false,
      missingVocabularyIds: [],
      missingGrammarIds: [],
      reason: 'chapter-not-started',
    };
  }

  const topicId = typeof topic === 'string' ? topic : topic?.id;
  if (!topicId) {
    return {
      satisfied: false,
      missingVocabularyIds: [],
      missingGrammarIds: [],
      reason: 'invalid-topic',
    };
  }

  const status = getGrammarTopicStatus(state, chId, topicId, chapterMeta);
  if (status === 'locked') {
    return {
      satisfied: false,
      missingVocabularyIds: [],
      missingGrammarIds: [],
      reason: 'topic-locked',
    };
  }

  const prereqGrammarIds = Array.isArray(topic?.prerequisiteGrammarIds)
    ? topic.prerequisiteGrammarIds
    : [];
  const missingGrammarIds = [];

  for (const gId of prereqGrammarIds) {
    const gStatus = getGrammarTopicStatus(state, chId, gId, chapterMeta);
    if (gStatus !== 'completed') {
      missingGrammarIds.push(gId);
    }
  }

  const reqVocabIds = Array.isArray(topic?.requiredVocabularyIds)
    ? topic.requiredVocabularyIds
    : [];
  const missingVocabularyIds = [];

  const srs = state?.srs || {};
  for (const vId of reqVocabIds) {
    const cards = Object.values(srs).filter((c) => c && (c.itemId === vId || c.wordId === vId));
    const allLocked = cards.length > 0 && cards.every((c) => c.planLocked === true);
    const isIntroduced = isVocabularyItemIntroduced(state, vId);

    const isMet =
      isPriorKnowledge(state, chId) ||
      cs?.legacyVocabularyCompleted === true ||
      (isIntroduced && !allLocked);

    if (!isMet) {
      missingVocabularyIds.push(vId);
    }
  }

  const satisfied = missingGrammarIds.length === 0 && missingVocabularyIds.length === 0;
  let reason = null;
  if (!satisfied) {
    reason =
      missingGrammarIds.length > 0
        ? 'missing-grammar-prerequisites'
        : 'missing-vocabulary-prerequisites';
  }

  return {
    satisfied,
    missingVocabularyIds,
    missingGrammarIds,
    reason,
  };
}

export function completeGrammarTopicWithCheck(
  state,
  chapterId,
  topicId,
  checkResult,
  options = {}
) {
  if (checkResult?.canceled === true) {
    return { changed: false, completed: false, canceled: true, reason: 'canceled' };
  }

  const chId = Number(chapterId);
  if (!Number.isInteger(chId) || chId <= 0) {
    return { changed: false, completed: false, reason: 'invalid-chapter-id' };
  }

  const cs = state?.chapters?.[chId];
  if (!cs || !cs.started) {
    return { changed: false, completed: false, reason: 'chapter-not-started' };
  }

  const chapterMeta =
    options.chapterMeta ||
    (Array.isArray(options.chapters)
      ? options.chapters.find((c) => Number(c.id || c.lesson_id) === chId)
      : null);
  const topicFound = chapterMeta
    ? getChapterGrammarTopics(chapterMeta).some((t) => t.id === topicId)
    : Object.values(state?.grammarUnlocks?.[chId] || {}).some(
        (arr) => Array.isArray(arr) && arr.includes(topicId)
      ) ||
      (typeof topicId === 'string' &&
        (topicId.startsWith(`L${chId}_g`) || topicId.startsWith(`g${chId}_`))) ||
      Boolean(state?.chapters?.[chId]?.checklist?.[topicId]);

  if (!topicFound) {
    return { changed: false, completed: false, reason: 'topic-not-found' };
  }

  const status = getGrammarTopicStatus(state, chId, topicId, options.chapterMeta);
  if (status === 'locked') {
    return { completed: false, changed: false, reason: 'topic-locked' };
  }

  const occurredAt = options.now ?? Date.now();
  const dateKey = options.dateKey || localDateKey(occurredAt);

  if (!checkResult || checkResult.passed !== true) {
    state.grammarProgress ||= {};
    state.grammarProgress[chId] ||= {};
    const progress = (state.grammarProgress[chId][topicId] ||= { attempts: 0 });
    progress.attempts += 1;
    progress.lastScore = checkResult?.score ?? 0;
    progress.updatedAt = occurredAt;
    return { completed: false, reason: 'check-failed' };
  }

  cs.checklist ||= {};
  if (isGrammarTopicCompleted(cs, topicId)) {
    return { completed: false, changed: false, alreadyCompleted: true };
  }
  cs.checklist[topicId] = true;
  cs.updatedAt = occurredAt;

  state.learningEvents ||= [];
  const eventId = `grammar-topic-completed:${chId}:${topicId}`;
  const rewardGranted = !state.learningEvents.some((e) => e.eventId === eventId);
  if (rewardGranted) {
    state.learningEvents.push({
      eventId,
      eventType: 'grammar-topic-completed',
      chapterId: chId,
      topicId,
      dateKey,
      score: checkResult.score ?? 100,
      occurredAt,
    });
  }

  return {
    completed: true,
    changed: true,
    rewardGranted,
    chapterId: chId,
    topicId,
    dateKey,
    occurredAt,
  };
}
