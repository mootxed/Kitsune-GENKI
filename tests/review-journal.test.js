import { describe, expect, it } from 'vitest';
import { undoReviewEvent } from '../src/card-behavior.js';
import { SKILLS } from '../src/knowledge-model.js';
import {
  REVIEW_EVENTS_PER_ITEM,
  UNDO_SNAPSHOT_LIMIT,
  compactReviewJournal,
} from '../src/review-journal.js';

function event(index, itemId = 'L1_V001') {
  return {
    eventId: `${itemId}-${index}`,
    eventType: 'review',
    itemId,
    cardId: itemId,
    skill: SKILLS.RECALL,
    mode: 'typing',
    firstAttemptCorrect: true,
    mistakes: 0,
    hintUsed: false,
    rawRating: 4,
    effectiveRating: 4,
    reviewedAt: new Date(2026, 0, index + 1).getTime(),
    previousCard: { id: itemId, stability: index },
    nextCard: { id: itemId, stability: index + 1 },
    undoneAt: null,
  };
}

describe('bounded review journal', () => {
  it('оставляет 20 событий на item и только 10 полных Undo snapshot', () => {
    const state = {
      reviewEvents: Array.from({ length: 25 }, (_, index) => event(index)),
      masteryArchive: {},
    };

    compactReviewJournal(state);

    expect(state.reviewEvents).toHaveLength(REVIEW_EVENTS_PER_ITEM);
    expect(state.reviewEvents.filter((entry) => entry.previousCard)).toHaveLength(
      UNDO_SNAPSHOT_LIMIT
    );
    expect(state.reviewEvents.at(-1).previousCard).toBeDefined();
    expect(state.masteryArchive.L1_V001).toMatchObject({
      evidenceCount: 5,
      successfulSkills: { [SKILLS.RECALL]: true },
      successfulCount: { [SKILLS.RECALL]: 5 },
    });
    expect(state.masteryArchive.L1_V001.successfulDays[SKILLS.RECALL]).toHaveLength(2);

    const latest = state.reviewEvents.at(-1);
    state.srs = { L1_V001: { ...latest.nextCard } };
    expect(undoReviewEvent(state, latest.eventId, Date.now())).toBe(true);
    expect(state.srs.L1_V001).toEqual(latest.previousCard);
    expect(latest.undoneAt).not.toBeNull();
  });

  it('ограничивает журнал независимо для каждого knowledge item', () => {
    const state = {
      reviewEvents: [
        ...Array.from({ length: 24 }, (_, index) => event(index, 'L1_V001')),
        ...Array.from({ length: 23 }, (_, index) => event(index, 'L1_V002')),
      ],
    };

    compactReviewJournal(state);

    expect(state.reviewEvents.filter((entry) => entry.itemId === 'L1_V001')).toHaveLength(20);
    expect(state.reviewEvents.filter((entry) => entry.itemId === 'L1_V002')).toHaveLength(20);
    expect(state.masteryArchive.L1_V001.evidenceCount).toBe(4);
    expect(state.masteryArchive.L1_V002.evidenceCount).toBe(3);
  });
});
