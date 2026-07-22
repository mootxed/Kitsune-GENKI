/* Bounded in-state review journal with compact mastery evidence. */

import { modeSkill } from './knowledge-model.js';
import { localDateKey } from './local-date.js';

export const REVIEW_EVENTS_PER_ITEM = 20;
export const UNDO_SNAPSHOT_LIMIT = 10;

function emptyArchiveEntry() {
  return {
    evidenceCount: 0,
    successfulSkills: {},
    successfulDays: {},
    successfulCount: {},
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
  entry.evidenceCount += 1;

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
  const perItemCount = new Map();

  for (let index = events.length - 1; index >= 0; index--) {
    const itemId = events[index]?.itemId || '__legacy__';
    const count = perItemCount.get(itemId) || 0;
    if (count < REVIEW_EVENTS_PER_ITEM) {
      retainedIndexes.add(index);
      perItemCount.set(itemId, count + 1);
    } else {
      archiveEvent(archive, events[index]);
    }
  }

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
