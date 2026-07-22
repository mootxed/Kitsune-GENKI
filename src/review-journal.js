/* Bounded in-state review journal with compact mastery evidence. */

import { modeSkill } from './knowledge-model.js';
import { localDateKey } from './local-date.js';

export const REVIEW_EVENTS_PER_ITEM = 20;
export const UNDO_SNAPSHOT_LIMIT = 10;

export function enqueueReviewLog(appState, entry) {
  if (!appState || !entry || typeof entry.eventId !== 'string' || !entry.eventId) return false;
  if (!Array.isArray(appState.pendingReviewLogs)) appState.pendingReviewLogs = [];
  if (appState.pendingReviewLogs.some((pending) => pending?.eventId === entry.eventId)) {
    return false;
  }
  appState.pendingReviewLogs.push(entry);
  return true;
}

export function acknowledgeReviewLogs(appState, eventIds) {
  if (!appState || !Array.isArray(appState.pendingReviewLogs)) return appState;
  const acknowledged = new Set(eventIds || []);
  appState.pendingReviewLogs = appState.pendingReviewLogs.filter(
    (entry) => !acknowledged.has(entry?.eventId)
  );
  return appState;
}

function emptyArchiveEntry() {
  return {
    evidenceCount: 0,
    successfulSkills: {},
    successfulDays: {},
    successfulCount: {},
    recentOutcomes: {},
    recentLapseAt: null,
  };
}

function isValidEvidenceEvent(event) {
  return Boolean(
    event &&
    !event.undoneAt &&
    event.eventType === 'review' &&
    Number.isInteger(event.reviewedAt) &&
    modeSkill(event.mode) === event.skill
  );
}

function archiveEvent(archive, event) {
  if (!isValidEvidenceEvent(event) || !event.itemId) return;
  const entry = archive[event.itemId] || emptyArchiveEntry();
  entry.successfulSkills ||= {};
  entry.successfulDays ||= {};
  entry.successfulCount ||= {};
  entry.recentOutcomes ||= {};
  entry.evidenceCount = (Number(entry.evidenceCount) || 0) + 1;
  const outcomes = entry.recentOutcomes[event.skill] || [];
  outcomes.push({
    correct: event.firstAttemptCorrect === true && event.effectiveRating !== 0,
    reviewedAt: event.reviewedAt,
  });
  entry.recentOutcomes[event.skill] = outcomes.slice(-REVIEW_EVENTS_PER_ITEM);

  if (event.effectiveRating === 0) {
    entry.recentLapseAt = Math.max(entry.recentLapseAt || 0, event.reviewedAt);
  }

  if (event.firstAttemptCorrect && event.effectiveRating !== 0) {
    entry.successfulSkills[event.skill] = true;
    entry.successfulCount[event.skill] = (entry.successfulCount[event.skill] || 0) + 1;
    const day = localDateKey(event.reviewedAt);
    const days = new Set(entry.successfulDays[event.skill] || []);
    days.add(day);
    entry.successfulDays[event.skill] = [...days].sort().slice(-2);
  }

  archive[event.itemId] = entry;
}

export function compactReviewJournal(appState) {
  if (!appState || typeof appState !== 'object') return appState;
  const events = Array.isArray(appState.reviewEvents) ? appState.reviewEvents : [];
  const archive = { ...(appState.masteryArchive || {}) };
  const retainedIndexes = new Set();
  const archivedEvents = [];
  const perItemCount = new Map();

  for (let index = events.length - 1; index >= 0; index--) {
    const itemId = events[index]?.itemId || '__legacy__';
    const count = perItemCount.get(itemId) || 0;
    if (count < REVIEW_EVENTS_PER_ITEM) {
      retainedIndexes.add(index);
      perItemCount.set(itemId, count + 1);
    } else {
      archivedEvents.push(events[index]);
    }
  }

  archivedEvents
    .sort((a, b) => (a?.reviewedAt || 0) - (b?.reviewedAt || 0))
    .forEach((event) => archiveEvent(archive, event));

  const retained = events.filter((_, index) => retainedIndexes.has(index));
  const snapshotIndexes = new Set();
  for (let index = retained.length - 1; index >= 0; index--) {
    const event = retained[index];
    if (event?.undoneAt || !event?.previousCard || !event?.nextCard) continue;
    if (snapshotIndexes.size >= UNDO_SNAPSHOT_LIMIT) break;
    snapshotIndexes.add(index);
  }

  appState.reviewEvents = retained.map((event, index) => {
    if (snapshotIndexes.has(index)) return event;
    const compact = { ...event };
    delete compact.previousCard;
    delete compact.nextCard;
    return compact;
  });
  appState.masteryArchive = archive;
  return appState;
}
