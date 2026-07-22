import { describe, expect, it } from 'vitest';
import { undoReviewEvent } from '../src/card-behavior.js';
import { SKILLS } from '../src/knowledge-model.js';
import {
  REVIEW_EVENTS_PER_ITEM,
  UNDO_SNAPSHOT_LIMIT,
  compactReviewJournal,
} from '../src/review-journal.js';
import { calculateMastery } from '../src/mastery.js';
import { SRS } from '../srs.js';

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

  it('компакция не меняет per-skill accuracy и рассчитанное mastery', () => {
    const itemId = 'L1_V003';
    const productionEvents = Array.from({ length: 10 }, (_, index) => ({
      ...event(index, itemId),
      eventId: `production-${index}`,
      cardId: `${itemId}::context-production`,
      skill: SKILLS.CONTEXT_PRODUCTION,
      mode: 'context-production',
      firstAttemptCorrect: index < 8,
      effectiveRating: index < 8 ? 4 : 0,
    }));
    const newerEvents = Array.from({ length: 20 }, (_, index) => ({
      ...event(index + 20, itemId),
      eventId: `recognition-${index}`,
      skill: SKILLS.RECOGNITION,
      mode: 'reverse-multiple-choice',
    }));
    const prerequisiteEvents = [
      {
        ...event(-3, itemId),
        eventId: 'old-recognition',
        skill: SKILLS.RECOGNITION,
        mode: 'reverse-multiple-choice',
      },
      { ...event(-2, itemId), eventId: 'old-recall-1' },
      { ...event(-1, itemId), eventId: 'old-recall-2' },
    ];
    const state = {
      reviewEvents: [...prerequisiteEvents, ...productionEvents, ...newerEvents],
      masteryArchive: {},
    };
    const cards = [
      { ...SRS.newCard(itemId), stability: 95, reps: 5 },
      {
        ...SRS.newCard(`${itemId}::recall`, { itemId, skill: SKILLS.RECALL }),
        stability: 95,
        reps: 5,
      },
      {
        ...SRS.newCard(`${itemId}::context-production`, {
          itemId,
          skill: SKILLS.CONTEXT_PRODUCTION,
        }),
        stability: 95,
        reps: 5,
      },
    ];
    const calculate = () =>
      calculateMastery({
        itemId,
        cards,
        events: state.reviewEvents,
        archive: state.masteryArchive[itemId],
        applicableSkills: [SKILLS.RECOGNITION, SKILLS.RECALL, SKILLS.CONTEXT_PRODUCTION],
        getRetrievability: () => 0.95,
      });

    const before = calculate();
    expect(before.level).toBe('Освоено');
    compactReviewJournal(state);
    const after = calculate();

    expect(after.skillMetrics[SKILLS.CONTEXT_PRODUCTION].accuracy).toBe(0.8);
    expect(after.skillMetrics[SKILLS.CONTEXT_PRODUCTION].accuracy).toBe(
      before.skillMetrics[SKILLS.CONTEXT_PRODUCTION].accuracy
    );
    expect(after.level).toBe(before.level);
    expect(after.score).toBe(before.score);
  });
});
