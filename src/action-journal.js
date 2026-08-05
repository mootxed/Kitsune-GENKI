/* src/action-journal.js — Local Action Journal for Diagnostics & Undo */

import { STATE_SCHEMA_VERSION } from './app-metadata.js';

const generateUUID = () => 'act-' + Math.random().toString(36).slice(2, 11) + '-' + Date.now();

export const ACTION_TYPES = {
  FSRS_REVIEW: 'FSRS_REVIEW',
  REVIEW_UNDO: 'REVIEW_UNDO',
  PLAN_DAILY_LOAD_ADJUSTED: 'PLAN_DAILY_LOAD_ADJUSTED',
  PLAN_GOAL_CHANGED: 'PLAN_GOAL_CHANGED',
  AUTOMATIC_PLAN_ADAPTATION: 'AUTOMATIC_PLAN_ADAPTATION',
  CHAPTER_COMPLETED: 'CHAPTER_COMPLETED',
  SESSION_RESTORED: 'SESSION_RESTORED',
  SESSION_COMPLETED: 'SESSION_COMPLETED',
  BACKUP_RESTORED: 'BACKUP_RESTORED',
  TECHNICAL_CARD_SKIP: 'TECHNICAL_CARD_SKIP',
  DICTIONARY_ENTRY_CREATED: 'DICTIONARY_ENTRY_CREATED',
  DICTIONARY_ENTRY_DELETED: 'DICTIONARY_ENTRY_DELETED',
};

const MAX_JOURNAL_ENTRIES = 1000;

/**
 * Appends a new action record to state.actionJournal.
 *
 * @param {Object} state - Application state
 * @param {Object} actionSpec - Action parameters
 * @returns {Object} Created journal entry
 */
export function recordJournalAction(
  state,
  {
    type,
    source = 'user-action',
    entityIds = {},
    summary = {},
    undoable = false,
    undoState = null,
  } = {}
) {
  if (!state) return null;
  if (!Array.isArray(state.actionJournal)) {
    state.actionJournal = [];
  }

  const entry = {
    eventId: generateUUID(),
    type,
    timestamp: Date.now(),
    source,
    entityIds: {
      planId: entityIds.planId || null,
      sessionId: entityIds.sessionId || null,
      cardId: entityIds.cardId || null,
      chapterId: entityIds.chapterId || null,
    },
    summary,
    undoable: Boolean(undoable && undoState),
    undoState: undoable ? undoState : null,
    committed: true,
    appVersion: '0.1.0-alpha',
    stateVersion: state.version || STATE_SCHEMA_VERSION,
  };

  state.actionJournal.push(entry);

  if (state.actionJournal.length > MAX_JOURNAL_ENTRIES) {
    state.actionJournal = state.actionJournal.slice(-MAX_JOURNAL_ENTRIES);
  }

  return entry;
}

/**
 * Returns recent journal actions with optional category filtering.
 */
export function getRecentJournalActions(state, limit = 100, filterType = null) {
  const journal = Array.isArray(state?.actionJournal) ? state.actionJournal : [];
  let filtered = journal;
  if (filterType) {
    filtered = journal.filter((e) => e.type === filterType || e.source === filterType);
  }
  return filtered.slice(-limit).reverse();
}

/**
 * Checks if the most recent undoable action can be reverted.
 */
export function getUndoableJournalAction(state) {
  const journal = Array.isArray(state?.actionJournal) ? state.actionJournal : [];
  for (let i = journal.length - 1; i >= 0; i--) {
    const entry = journal[i];
    if (entry.undoable && !entry.undoneAt && entry.undoState) {
      return entry;
    }
  }
  return null;
}

/**
 * Executes Undo for the last supported action.
 */
export function undoLastJournalAction(state) {
  const actionToUndo = getUndoableJournalAction(state);
  if (!actionToUndo) {
    return { success: false, reason: 'NO_UNDOABLE_ACTION' };
  }

  const { type, undoState } = actionToUndo;

  if (type === ACTION_TYPES.PLAN_DAILY_LOAD_ADJUSTED && undoState?.previousDailyCapacityMinutes) {
    state.dailyCapacityMinutes = undoState.previousDailyCapacityMinutes;
  } else if (
    type === ACTION_TYPES.AUTOMATIC_PLAN_ADAPTATION &&
    undoState?.previousNewCards != null
  ) {
    if (state.dailyPlan) {
      state.dailyPlan.adaptedNewCards = undoState.previousNewCards;
    }
  } else if (type === ACTION_TYPES.PLAN_GOAL_CHANGED && undoState?.previousStudyPlan) {
    state.studyPlan = undoState.previousStudyPlan;
  } else {
    return { success: false, reason: 'UNSUPPORTED_UNDO_TYPE' };
  }

  actionToUndo.undoneAt = Date.now();
  recordJournalAction(state, {
    type: ACTION_TYPES.REVIEW_UNDO,
    source: 'undo-service',
    entityIds: actionToUndo.entityIds,
    summary: { undoneEventId: actionToUndo.eventId, undoneType: type },
  });

  return { success: true, undoneEntry: actionToUndo };
}

/**
 * Exports a privacy-redacted action journal snapshot for diagnostics export.
 */
export function exportRedactedDiagnosticsJournal(state, limit = 300) {
  const journal = Array.isArray(state?.actionJournal) ? state.actionJournal : [];
  const entries = journal.slice(-limit);

  return entries.map((entry) => ({
    eventId: entry.eventId,
    type: entry.type,
    timestamp: new Date(entry.timestamp).toISOString(),
    source: entry.source,
    entityIds: entry.entityIds,
    summary: redactSensitiveData(entry.summary),
    committed: entry.committed,
    undoneAt: entry.undoneAt ? new Date(entry.undoneAt).toISOString() : null,
  }));
}

function redactSensitiveData(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const copy = JSON.parse(JSON.stringify(obj));
  const sensitiveKeys = [
    'apiKey',
    'openrouterKey',
    'userNotes',
    'chatHistory',
    'privateText',
    'content',
  ];
  for (const key of Object.keys(copy)) {
    if (sensitiveKeys.includes(key)) {
      copy[key] = '[REDACTED]';
    }
  }
  return copy;
}
