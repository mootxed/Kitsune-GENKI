/* tests/fsrs-undo-regression.test.js */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { undoLastReview } from '../ui/flashcards/review-fsrs.js';
import { reviewUndoStack, setSessionManager } from '../ui/flashcards/state.js';
import { SessionManager } from '../session-manager.js';
import { defaultState } from '../state/store.js';
import { undoReviewEvent } from '../src/card-behavior.js';

describe('FSRS Undo Regression & UI Refresh', () => {
  let appState;

  beforeEach(() => {
    reviewUndoStack.clear();
    appState = defaultState();
    appState.srs = {
      'word:1': { id: 'word:1', reps: 2, state: 2, due: Date.now() - 1000 },
      'word:2': { id: 'word:2', reps: 2, state: 2, due: Date.now() - 1000 },
      'word:3': { id: 'word:3', reps: 1, state: 1, due: Date.now() - 1000 },
      'word:4': { id: 'word:4', reps: 0, state: 0, due: Date.now() - 1000 },
    };
    appState.reviewEvents = [];
  });

  it('1. Undo restores card state, session progress, and triggers re-render callback', async () => {
    const cards = [
      appState.srs['word:1'],
      appState.srs['word:2'],
      appState.srs['word:3'],
      appState.srs['word:4'],
    ];
    const sm = new SessionManager(cards);
    setSessionManager(sm);

    sm.answerCard('word:1', 3, appState.srs);
    sm.answerCard('word:2', 3, appState.srs);
    expect(sm.getStats().reviewed).toBe(2);

    const snapBefore3 = sm.createSnapshot();

    const rev3 = {
      eventId: 'rev-3',
      cardId: 'word:3',
      itemId: 'word:3',
      reviewedAt: Date.now(),
      rawRating: 3,
      effectiveRating: 3,
      previousCard: { ...appState.srs['word:3'] },
      nextCard: { ...appState.srs['word:3'] },
    };
    appState.reviewEvents.push(rev3);
    sm.answerCard('word:3', 3, appState.srs);
    expect(sm.getStats().reviewed).toBe(3);

    reviewUndoStack.push(
      'word:3',
      {
        card: { ...appState.srs['word:3'] },
        session: snapBefore3,
        flashIdx: 2,
        flashRevealed: false,
      },
      { eventId: rev3.eventId }
    );

    const renderFlashFn = vi.fn();
    const deps = {
      save: vi.fn().mockResolvedValue(true),
      toast: vi.fn(),
      updateSrsBadge: vi.fn(),
      renderFlash: renderFlashFn,
    };

    const undone = await undoLastReview(appState, deps, renderFlashFn);
    expect(undone).toBe(true);
    expect(renderFlashFn).toHaveBeenCalled();
    expect(appState.reviewEvents[0].undoneAt).toBeDefined();
    expect(sm.getStats().reviewed).toBe(2);
  });
});
