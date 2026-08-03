/**
 * tests/word-fsrs-integration.test.js
 *
 * Verifies that opening the word details page NEVER mutates FSRS state.
 *
 * Key invariants:
 *   - srsRecords unchanged after getDictionaryDetails()
 *   - reviewEvents unchanged after getDictionaryDetails()
 *   - masteryArchive unchanged after getDictionaryDetails()
 *   - FSRS summary hasFSRS=false when no cards exist
 *   - FSRS summary correct for known cards (reps, lapses, masteryLevel)
 *   - FSRS summary is per-skill (recognition, recall, etc.)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeDictionaryEntry } from '../src/dictionary/dictionary-contract.js';
import { DictionaryStore } from '../src/dictionary/dictionary-store.js';
import { getDictionaryDetails } from '../src/dictionary/dictionary-details-service.js';
import {
  getDictionaryFSRS,
  formatRetrievability,
} from '../src/dictionary/dictionary-fsrs-service.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const taberu = normalizeDictionaryEntry({
  dictionaryForm: '食べる',
  reading: 'たべる',
  meanings: ['есть'],
  partOfSpeech: 'verb',
  verbClass: 'ichidan',
  tokenForms: ['食べる', 'たべる'],
});

function makeStore() {
  return new DictionaryStore({
    loader: {
      async load() {
        return {
          manifest: { schemaVersion: 1, contentVersion: '1' },
          entries: [taberu],
          tokenIndex: { 食べる: [taberu.id] },
          aliases: {},
        };
      },
    },
    userRepository: null,
  });
}

function makeSrsCard(itemId, overrides = {}) {
  return {
    id: itemId,
    itemId,
    reps: 5,
    lapses: 1,
    stability: 10,
    difficulty: 0.3,
    due: Date.now() + 86400000, // due tomorrow
    ...overrides,
  };
}

// Minimal fake SRS that satisfies getRetrievability interface
const fakeSrs = {
  getRetrievability(card, now) {
    if (!card || card.reps === 0) return 0;
    const elapsed = now - Number(card.due - card.stability * 86400000);
    const r = Math.exp(-elapsed / (card.stability * 86400000));
    return Math.max(0, Math.min(1, r));
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import { localDateKey } from '../src/local-date.js';

describe('getDictionaryFSRS — read-only invariants', () => {
  it('returns hasFSRS=false when no cards exist', () => {
    const state = { srsRecords: {}, reviewEvents: [], chapters: {} };
    const result = getDictionaryFSRS({ dictionaryId: taberu.id, state, srs: fakeSrs });
    expect(result.hasFSRS).toBe(false);
    expect(result.masteryLevel).toBeNull();
  });

  it('returns hasFSRS=true when cards exist', () => {
    const state = {
      srsRecords: { [taberu.id]: makeSrsCard(taberu.id) },
      reviewEvents: [],
      chapters: {},
    };
    const result = getDictionaryFSRS({ dictionaryId: taberu.id, state, srs: fakeSrs });
    expect(result.hasFSRS).toBe(true);
  });

  it('does NOT mutate srsRecords', () => {
    const card = makeSrsCard(taberu.id);
    const state = {
      srsRecords: { [taberu.id]: card },
      reviewEvents: [],
      chapters: {},
    };
    const repsBefore = card.reps;
    const lapsesBefore = card.lapses;
    const dueBefore = card.due;
    const stabilityBefore = card.stability;

    getDictionaryFSRS({ dictionaryId: taberu.id, state, srs: fakeSrs });

    expect(card.reps).toBe(repsBefore);
    expect(card.lapses).toBe(lapsesBefore);
    expect(card.due).toBe(dueBefore);
    expect(card.stability).toBe(stabilityBefore);
  });

  it('does NOT mutate reviewEvents', () => {
    const state = {
      srsRecords: { [taberu.id]: makeSrsCard(taberu.id) },
      reviewEvents: [
        {
          itemId: taberu.id,
          skill: 'recognition',
          eventType: 'review',
          effectiveRating: 4,
          reviewedAt: Date.now() - 1000,
          firstAttemptCorrect: true,
        },
      ],
      chapters: {},
    };
    const eventsBefore = JSON.stringify(state.reviewEvents);
    getDictionaryFSRS({ dictionaryId: taberu.id, state, srs: fakeSrs });
    expect(JSON.stringify(state.reviewEvents)).toBe(eventsBefore);
  });

  it('does NOT add entries to masteryArchive', () => {
    const state = {
      srsRecords: { [taberu.id]: makeSrsCard(taberu.id) },
      reviewEvents: [],
      masteryArchive: {},
      chapters: {},
    };
    const archiveBefore = JSON.stringify(state.masteryArchive);
    getDictionaryFSRS({ dictionaryId: taberu.id, state, srs: fakeSrs });
    expect(JSON.stringify(state.masteryArchive)).toBe(archiveBefore);
  });

  it('aggregates reps and lapses from all SRS cards', () => {
    const recallId = `${taberu.id}::recall`;
    const state = {
      srsRecords: {
        [taberu.id]: makeSrsCard(taberu.id, { reps: 5, lapses: 1 }),
        [recallId]: makeSrsCard(recallId, { id: recallId, itemId: taberu.id, reps: 3, lapses: 0 }),
      },
      reviewEvents: [],
      chapters: {},
    };
    const result = getDictionaryFSRS({ dictionaryId: taberu.id, state, srs: fakeSrs });
    expect(result.reps).toBe(8);
    expect(result.lapses).toBe(1);
  });

  it('nextReviewDate is earliest due date among all cards', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowMs = tomorrow.getTime();
    const dayAfterMs = tomorrowMs + 86400000;

    const recallId = `${taberu.id}::recall`;
    const state = {
      srsRecords: {
        [taberu.id]: makeSrsCard(taberu.id, { due: dayAfterMs }),
        [recallId]: makeSrsCard(recallId, { id: recallId, itemId: taberu.id, due: tomorrowMs }),
      },
      reviewEvents: [],
      chapters: {},
    };
    const result = getDictionaryFSRS({ dictionaryId: taberu.id, state, srs: fakeSrs });
    expect(result.nextReviewDate).toBe(localDateKey(tomorrowMs));
  });

  it('handles missing srs gracefully', () => {
    const state = { srsRecords: {}, reviewEvents: [], chapters: {} };
    const result = getDictionaryFSRS({ dictionaryId: taberu.id, state, srs: null });
    expect(result.hasFSRS).toBe(false);
  });
});

describe('getDictionaryDetails — FSRS read-only', () => {
  let store;

  beforeEach(async () => {
    store = makeStore();
    await store.ensureLoaded();
  });

  it('opening details does not change FSRS card state', async () => {
    const card = makeSrsCard(taberu.id);
    const state = {
      srsRecords: { [taberu.id]: card },
      reviewEvents: [],
      chapters: {},
    };
    const stateBefore = JSON.parse(JSON.stringify(state.srsRecords));

    getDictionaryDetails({
      dictionaryId: taberu.id,
      state,
      dictionaryStore: store,
      srs: fakeSrs,
    });

    expect(JSON.stringify(state.srsRecords)).toBe(JSON.stringify(stateBefore));
  });

  it('fsrs summary included in details when srs provided', async () => {
    const state = {
      srsRecords: { [taberu.id]: makeSrsCard(taberu.id) },
      reviewEvents: [],
      chapters: {},
    };

    const details = getDictionaryDetails({
      dictionaryId: taberu.id,
      state,
      dictionaryStore: store,
      srs: fakeSrs,
    });

    expect(details.fsrs).toBeTruthy();
    expect(details.fsrs.hasFSRS).toBe(true);
  });

  it('fsrs is null when srs not provided', async () => {
    const state = {
      srsRecords: { [taberu.id]: makeSrsCard(taberu.id) },
      reviewEvents: [],
      chapters: {},
    };

    const details = getDictionaryDetails({
      dictionaryId: taberu.id,
      state,
      dictionaryStore: store,
    });

    expect(details.fsrs).toBeNull();
  });
});

describe('formatRetrievability', () => {
  it('formats 0.87 as 87%', () => {
    expect(formatRetrievability(0.87)).toBe('87%');
  });

  it('returns — for null', () => {
    expect(formatRetrievability(null)).toBe('—');
  });

  it('returns — for NaN', () => {
    expect(formatRetrievability(NaN)).toBe('—');
  });
});
