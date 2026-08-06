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

  it('2. Full session undo flow: answer, decrement progress, re-answer, completion screen undo', async () => {
    const cards = [
      appState.srs['word:1'],
      appState.srs['word:2'],
      appState.srs['word:3'],
      appState.srs['word:4'],
    ];
    const sm = new SessionManager(cards);
    setSessionManager(sm);

    const snap0 = sm.createSnapshot();
    const rev1 = {
      eventId: 'rev-1',
      cardId: 'word:1',
      itemId: 'word:1',
      reviewedAt: Date.now(),
      rawRating: 3,
      effectiveRating: 3,
      previousCard: { ...appState.srs['word:1'] },
      nextCard: { ...appState.srs['word:1'] },
    };
    appState.reviewEvents.push(rev1);
    sm.answerCard('word:1', 3, appState.srs);
    expect(sm.getStats().reviewed).toBe(1);

    reviewUndoStack.push(
      'word:1',
      {
        card: { ...appState.srs['word:1'] },
        session: snap0,
        flashIdx: 0,
        flashRevealed: false,
      },
      { eventId: rev1.eventId }
    );

    const renderFlashFn = vi.fn();
    const deps = {
      save: vi.fn().mockResolvedValue(true),
      toast: vi.fn(),
      updateSrsBadge: vi.fn(),
      renderFlash: renderFlashFn,
    };

    // Undo first review
    const undone1 = await undoLastReview(appState, deps, renderFlashFn);
    expect(undone1).toBe(true);
    expect(sm.getStats().reviewed).toBe(0);
    expect(rev1.undoneAt).toBeDefined();

    // Re-answer card 1
    const snap0b = sm.createSnapshot();
    const rev1b = {
      eventId: 'rev-1b',
      cardId: 'word:1',
      itemId: 'word:1',
      reviewedAt: Date.now(),
      rawRating: 3,
      effectiveRating: 3,
      previousCard: { ...appState.srs['word:1'] },
      nextCard: { ...appState.srs['word:1'] },
    };
    appState.reviewEvents.push(rev1b);
    sm.answerCard('word:1', 3, appState.srs);
    expect(sm.getStats().reviewed).toBe(1);

    reviewUndoStack.push(
      'word:1',
      {
        card: { ...appState.srs['word:1'] },
        session: snap0b,
        flashIdx: 0,
        flashRevealed: false,
      },
      { eventId: rev1b.eventId }
    );

    // Complete remaining 3 cards
    ['word:2', 'word:3', 'word:4'].forEach((id, idx) => {
      const snap = sm.createSnapshot();
      const rev = {
        eventId: `rev-${idx + 2}`,
        cardId: id,
        itemId: id,
        reviewedAt: Date.now(),
        rawRating: 3,
        effectiveRating: 3,
        previousCard: { ...appState.srs[id] },
        nextCard: { ...appState.srs[id] },
      };
      appState.reviewEvents.push(rev);
      sm.answerCard(id, 3, appState.srs);
      reviewUndoStack.push(
        id,
        {
          card: { ...appState.srs[id] },
          session: snap,
          flashIdx: idx + 1,
          flashRevealed: false,
        },
        { eventId: rev.eventId }
      );
    });

    expect(sm.getStats().remaining).toBe(0);
    expect(sm.getStats().reviewed).toBe(4);

    // Undo from completion screen (restores last card of completed session)
    const undoneCompletion = await undoLastReview(appState, deps, renderFlashFn);
    expect(undoneCompletion).toBe(true);
    expect(sm.getStats().remaining).toBeGreaterThan(0);
    expect(sm.getStats().reviewed).toBe(3);
  });

  it('3. Disallows Undo after session restoration when reviewUndoStack is empty', async () => {
    const rev1 = {
      eventId: 'rev-restored',
      cardId: 'word:1',
      itemId: 'word:1',
      reviewedAt: Date.now(),
      rawRating: 3,
      effectiveRating: 3,
      previousCard: { ...appState.srs['word:1'] },
      nextCard: { ...appState.srs['word:1'] },
    };
    appState.reviewEvents.push(rev1);

    // reviewUndoStack is empty (e.g. after reload / session restoration)
    expect(reviewUndoStack.canUndo).toBe(false);

    const deps = {
      save: vi.fn().mockResolvedValue(true),
      toast: vi.fn(),
      updateSrsBadge: vi.fn(),
      renderFlash: vi.fn(),
    };

    const result = await undoLastReview(appState, deps, deps.renderFlash);
    expect(result).toBe(false);
    expect(rev1.undoneAt).toBeUndefined();
  });
});
