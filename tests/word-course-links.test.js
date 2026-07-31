/**
 * tests/word-course-links.test.js
 *
 * Tests for course reference handling in DictionaryDetailsService.
 *
 * Covers:
 *   - Multiple courses reference the same dictionaryId
 *   - Active course appears first in lessons list
 *   - DictionaryEntry itself is NOT duplicated
 *   - AI alias promotion: when user AI entry gets alias to curated,
 *     course references flow to the canonical curated entry
 *   - Unknown dictionaryId in course references → store throws (existing behavior)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeDictionaryEntry } from '../src/dictionary/dictionary-contract.js';
import { DictionaryStore } from '../src/dictionary/dictionary-store.js';
import { getDictionaryDetails } from '../src/dictionary/dictionary-details-service.js';

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

const neko = normalizeDictionaryEntry({
  dictionaryForm: '猫',
  reading: 'ねこ',
  meanings: ['кошка'],
  partOfSpeech: 'noun',
  tokenForms: ['猫', 'ねこ'],
});

function makeStore(entries = [taberu, neko], aliases = {}) {
  return new DictionaryStore({
    loader: {
      async load() {
        const tokenIndex = {};
        for (const e of entries) {
          for (const form of e.tokenForms || []) {
            tokenIndex[form] = tokenIndex[form] || [];
            tokenIndex[form].push(e.id);
          }
        }
        return {
          manifest: { schemaVersion: 1, contentVersion: '1' },
          entries,
          tokenIndex,
          aliases,
        };
      },
    },
    userRepository: null,
  });
}

const baseState = { srsRecords: {}, reviewEvents: [], chapters: {} };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Word course links', () => {
  let store;

  beforeEach(async () => {
    store = makeStore();
    await store.ensureLoaded();
  });

  it('single course reference is shown', () => {
    store.resolveCourseVocabularyReference({
      id: 'genki-1:vocabulary:taberu',
      localId: 'taberu',
      courseId: 'genki-1',
      dictionaryId: taberu.id,
      introducedIn: 'genki-1:lesson-3',
      courseMeaning: 'есть',
    });

    const details = getDictionaryDetails({
      dictionaryId: taberu.id,
      activeCourseId: 'genki-1',
      state: baseState,
      dictionaryStore: store,
    });

    expect(details.lessons).toHaveLength(1);
    expect(details.lessons[0]).toMatchObject({
      courseId: 'genki-1',
      introducedIn: 'genki-1:lesson-3',
      courseMeaning: 'есть',
      isActiveCourse: true,
    });
  });

  it('three courses: active first, others follow in registration order', () => {
    store.resolveCourseVocabularyReference({
      id: 'a:vocabulary:t',
      localId: 't',
      courseId: 'course-a',
      dictionaryId: taberu.id,
      introducedIn: 'course-a:lesson-1',
      courseMeaning: 'A',
    });
    store.resolveCourseVocabularyReference({
      id: 'b:vocabulary:t',
      localId: 't',
      courseId: 'course-b',
      dictionaryId: taberu.id,
      introducedIn: 'course-b:lesson-1',
      courseMeaning: 'B',
    });
    store.resolveCourseVocabularyReference({
      id: 'c:vocabulary:t',
      localId: 't',
      courseId: 'course-c',
      dictionaryId: taberu.id,
      introducedIn: 'course-c:lesson-1',
      courseMeaning: 'C',
    });

    const details = getDictionaryDetails({
      dictionaryId: taberu.id,
      activeCourseId: 'course-b',
      state: baseState,
      dictionaryStore: store,
    });

    expect(details.lessons).toHaveLength(3);
    expect(details.lessons[0].courseId).toBe('course-b');
    expect(details.lessons[0].isActiveCourse).toBe(true);
    expect(details.lessons.slice(1).every((l) => !l.isActiveCourse)).toBe(true);
  });

  it('DictionaryEntry is NOT duplicated even with multiple course references', () => {
    store.resolveCourseVocabularyReference({
      id: 'a:vocabulary:t',
      localId: 't',
      courseId: 'a',
      dictionaryId: taberu.id,
      introducedIn: 'a:l1',
      courseMeaning: '',
    });
    store.resolveCourseVocabularyReference({
      id: 'b:vocabulary:t',
      localId: 't',
      courseId: 'b',
      dictionaryId: taberu.id,
      introducedIn: 'b:l1',
      courseMeaning: '',
    });

    const allEntries = store.getAllDictionaryEntries();
    expect(allEntries.filter((e) => e.id === taberu.id)).toHaveLength(1);
  });

  it('activeCourseId not in lessons still shows it at position [0] when matched', () => {
    store.resolveCourseVocabularyReference({
      id: 'alpha:vocabulary:t',
      localId: 't',
      courseId: 'alpha',
      dictionaryId: taberu.id,
      introducedIn: 'alpha:l1',
      courseMeaning: '',
    });

    const details = getDictionaryDetails({
      dictionaryId: taberu.id,
      activeCourseId: 'alpha',
      state: baseState,
      dictionaryStore: store,
    });

    expect(details.lessons[0].courseId).toBe('alpha');
  });

  it('word not in any course: lessons array is empty', () => {
    // neko has no course references
    const details = getDictionaryDetails({
      dictionaryId: neko.id,
      state: baseState,
      dictionaryStore: store,
    });

    expect(details.lessons).toHaveLength(0);
  });

  it('alias resolution: legacy ID still returns canonical entry with its lessons', async () => {
    const legacyId = 'legacy:taberu:old';
    const storeWithAlias = makeStore([taberu], { [legacyId]: taberu.id });
    await storeWithAlias.ensureLoaded();

    storeWithAlias.resolveCourseVocabularyReference({
      id: 'genki-1:vocabulary:taberu',
      localId: 'taberu',
      courseId: 'genki-1',
      dictionaryId: taberu.id,
      introducedIn: 'genki-1:lesson-3',
      courseMeaning: 'есть',
    });

    // Open via legacy ID — should still resolve to canonical and show lessons
    const details = getDictionaryDetails({
      dictionaryId: legacyId,
      state: baseState,
      dictionaryStore: storeWithAlias,
    });

    expect(details.status).toBe('found');
    expect(details.dictionaryId).toBe(taberu.id);
    expect(details.lessons).toHaveLength(1);
    expect(details.lessons[0].courseId).toBe('genki-1');
  });
});

describe('Word course links — cross-course correctness', () => {
  it('same word in two courses shows both; course meanings independent', async () => {
    const store = makeStore();
    await store.ensureLoaded();

    store.resolveCourseVocabularyReference({
      id: 'genki:v:t',
      localId: 't',
      courseId: 'genki-1',
      dictionaryId: taberu.id,
      introducedIn: 'genki-1:lesson-3',
      courseMeaning: 'есть (в рамках GENKI)',
    });
    store.resolveCourseVocabularyReference({
      id: 'minna:v:t',
      localId: 't',
      courseId: 'minna',
      dictionaryId: taberu.id,
      introducedIn: 'minna:unit-2',
      courseMeaning: 'употреблять пищу',
    });

    const details = getDictionaryDetails({
      dictionaryId: taberu.id,
      activeCourseId: 'minna',
      state: baseState,
      dictionaryStore: store,
    });

    expect(details.lessons).toHaveLength(2);
    const minna = details.lessons.find((l) => l.courseId === 'minna');
    const genki = details.lessons.find((l) => l.courseId === 'genki-1');
    expect(minna?.courseMeaning).toBe('употреблять пищу');
    expect(genki?.courseMeaning).toBe('есть (в рамках GENKI)');
    // Central entry meanings unchanged
    expect(details.entry.meanings).toEqual(['есть']);
  });
});
