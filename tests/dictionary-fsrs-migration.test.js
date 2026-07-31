import { describe, expect, it } from 'vitest';
import {
  migrateDictionaryReviewLogEntriesV16,
  migrateDictionaryStateV16,
} from '../src/dictionary/state-v16.js';
import { ensureVocabularySkillCards } from '../src/chapter-vocabulary.js';

const FIRST_REFERENCE = 'genki-1:vocabulary:L1_V022';
const SECOND_REFERENCE = 'genki-1:vocabulary:L1_V026';
const DICTIONARY_ID = 'jp-word:先生:せんせい';

describe('global dictionary FSRS identity', () => {
  it('creates one FSRS card for two course references to the same dictionary entry', () => {
    const state = { srs: {}, reviewEvents: [], masteryArchive: {} };
    const first = {
      id: FIRST_REFERENCE,
      dictionaryId: DICTIONARY_ID,
      knowledgeItemId: DICTIONARY_ID,
      reading: 'せんせい',
      writtenForm: 'せんせい',
    };
    const second = { ...first, id: SECOND_REFERENCE, courseMeaning: 'teacher' };

    expect(ensureVocabularySkillCards(state, first)).toBe(true);
    expect(ensureVocabularySkillCards(state, second)).toBe(false);
    expect(Object.keys(state.srs)).toEqual([DICTIONARY_ID]);
    expect(state.srs[DICTIONARY_ID].itemId).toBe(DICTIONARY_ID);
  });
});

describe('state v16 dictionary migration', () => {
  it('merges colliding cards deterministically and preserves every event', () => {
    const oldState = {
      version: 15,
      xp: 91,
      srs: {
        [FIRST_REFERENCE]: {
          id: FIRST_REFERENCE,
          itemId: FIRST_REFERENCE,
          lastReview: 100,
          reps: 8,
          stability: 20,
          difficulty: 2,
        },
        [SECOND_REFERENCE]: {
          id: SECOND_REFERENCE,
          itemId: SECOND_REFERENCE,
          lastReview: 200,
          reps: 2,
          stability: 4,
          difficulty: 7,
        },
      },
      reviewEvents: [
        { eventId: 'event-a', cardId: FIRST_REFERENCE, itemId: FIRST_REFERENCE },
        { eventId: 'event-b', cardId: SECOND_REFERENCE, itemId: SECOND_REFERENCE },
      ],
      pendingReviewLogs: [{ eventId: 'event-c', cardId: FIRST_REFERENCE, itemId: FIRST_REFERENCE }],
      activeSession: { itemIds: [FIRST_REFERENCE, SECOND_REFERENCE] },
      masteryArchive: {
        [FIRST_REFERENCE]: { successfulDays: { recognition: ['2026-07-01'] } },
        [SECOND_REFERENCE]: { successfulDays: { recognition: ['2026-07-02'] } },
      },
    };

    const migrated = migrateDictionaryStateV16(oldState);

    expect(migrated.version).toBe(16);
    expect(migrated.xp).toBe(91);
    expect(Object.keys(migrated.srs)).toEqual([DICTIONARY_ID]);
    expect(migrated.srs[DICTIONARY_ID]).toMatchObject({
      id: DICTIONARY_ID,
      itemId: DICTIONARY_ID,
      lastReview: 200,
      reps: 2,
      stability: 4,
      difficulty: 7,
      mergedFromCardIds: [FIRST_REFERENCE, SECOND_REFERENCE],
    });
    expect(migrated.reviewEvents.map((event) => event.eventId)).toEqual(['event-a', 'event-b']);
    expect(migrated.reviewEvents.every((event) => event.itemId === DICTIONARY_ID)).toBe(true);
    expect(migrated.pendingReviewLogs[0].cardId).toBe(DICTIONARY_ID);
    expect(migrated.activeSession.itemIds).toEqual([DICTIONARY_ID, DICTIONARY_ID]);
    expect(migrated.masteryArchive[DICTIONARY_ID].successfulDays.recognition).toEqual([
      '2026-07-01',
      '2026-07-02',
    ]);
    expect(
      migrated.dictionaryMigrationArchive.mergedCards[DICTIONARY_ID].discardedCards
    ).toHaveLength(1);
  });

  it('is idempotent and migrates review-log payloads without dropping event IDs', () => {
    const state = migrateDictionaryStateV16({
      version: 15,
      srs: {},
      masteryArchive: {},
      reviewEvents: [{ eventId: 'stable-event', itemId: FIRST_REFERENCE }],
    });
    expect(migrateDictionaryStateV16(state)).toEqual(state);
    expect(
      migrateDictionaryReviewLogEntriesV16([
        { eventId: 'stable-event', itemId: FIRST_REFERENCE, cardId: FIRST_REFERENCE },
      ])
    ).toEqual([{ eventId: 'stable-event', itemId: DICTIONARY_ID, cardId: DICTIONARY_ID }]);
  });

  it('migrates every skill suffix plus leech, undo, outbox and hardest-card references', () => {
    const skills = ['recall', 'reading-writing', 'context-production'];
    const srs = Object.fromEntries(
      skills.map((skill, index) => {
        const cardId = `${FIRST_REFERENCE}::${skill}`;
        return [
          cardId,
          {
            id: cardId,
            itemId: FIRST_REFERENCE,
            skill,
            reps: index + 1,
            stability: index + 2,
            leech: skill === 'recall',
            suspendedReason: skill === 'recall' ? 'leech' : undefined,
          },
        ];
      })
    );
    const migrated = migrateDictionaryStateV16({
      version: 15,
      srs,
      masteryArchive: {},
      undoStack: [
        {
          cardId: `${FIRST_REFERENCE}::recall`,
          itemId: FIRST_REFERENCE,
          previousCard: { id: `${FIRST_REFERENCE}::recall`, itemId: FIRST_REFERENCE },
        },
      ],
      pendingReviewLogs: [
        {
          eventId: 'outbox-event',
          cardId: `${FIRST_REFERENCE}::reading-writing`,
          itemId: FIRST_REFERENCE,
        },
      ],
      statistics: {
        hardestCardIds: [`${FIRST_REFERENCE}::context-production`],
        hardestItemIds: [FIRST_REFERENCE],
      },
    });

    for (const skill of skills) {
      const cardId = `${DICTIONARY_ID}::${skill}`;
      expect(migrated.srs[cardId]).toMatchObject({
        id: cardId,
        itemId: DICTIONARY_ID,
        skill,
      });
    }
    expect(migrated.srs[`${DICTIONARY_ID}::recall`]).toMatchObject({
      leech: true,
      suspendedReason: 'leech',
    });
    expect(migrated.undoStack[0]).toMatchObject({
      cardId: `${DICTIONARY_ID}::recall`,
      itemId: DICTIONARY_ID,
      previousCard: {
        id: `${DICTIONARY_ID}::recall`,
        itemId: DICTIONARY_ID,
      },
    });
    expect(migrated.pendingReviewLogs[0]).toMatchObject({
      eventId: 'outbox-event',
      cardId: `${DICTIONARY_ID}::reading-writing`,
      itemId: DICTIONARY_ID,
    });
    expect(migrated.statistics).toEqual({
      hardestCardIds: [`${DICTIONARY_ID}::context-production`],
      hardestItemIds: [DICTIONARY_ID],
    });
  });
});
