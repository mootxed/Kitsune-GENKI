import { describe, it, expect } from 'vitest';
import {
  recordJournalAction,
  getRecentJournalActions,
  getUndoableJournalAction,
  undoLastJournalAction,
  exportRedactedDiagnosticsJournal,
  ACTION_TYPES,
} from '../src/action-journal.js';

describe('Local Action Journal & Undo Policy', () => {
  it('records actions and maintains retention cap', () => {
    const state = { actionJournal: [] };
    recordJournalAction(state, {
      type: ACTION_TYPES.PLAN_DAILY_LOAD_ADJUSTED,
      summary: { previous: 30, next: 20 },
      undoable: true,
      undoState: { previousDailyCapacityMinutes: 30 },
    });

    expect(state.actionJournal.length).toBe(1);
    const recent = getRecentJournalActions(state, 10);
    expect(recent[0].type).toBe(ACTION_TYPES.PLAN_DAILY_LOAD_ADJUSTED);
  });

  it('performs Undo for supported daily load adjustment action', () => {
    const state = {
      dailyCapacityMinutes: 20,
      actionJournal: [],
    };
    recordJournalAction(state, {
      type: ACTION_TYPES.PLAN_DAILY_LOAD_ADJUSTED,
      summary: { previous: 30, next: 20 },
      undoable: true,
      undoState: { previousDailyCapacityMinutes: 30 },
    });

    const undoable = getUndoableJournalAction(state);
    expect(undoable).not.toBeNull();

    const res = undoLastJournalAction(state);
    expect(res.success).toBe(true);
    expect(state.dailyCapacityMinutes).toBe(30);
  });

  it('exports privacy-redacted journal logs for diagnostics', () => {
    const state = { actionJournal: [] };
    recordJournalAction(state, {
      type: ACTION_TYPES.FSRS_REVIEW,
      summary: { apiKey: 'secret-key-12345', cardId: 'card-1' },
    });

    const exported = exportRedactedDiagnosticsJournal(state, 10);
    expect(exported[0].summary.apiKey).toBe('[REDACTED]');
    expect(exported[0].summary.cardId).toBe('card-1');
  });
});
