import { describe, expect, it } from 'vitest';
import { normalizeDictionaryEntry } from '../src/dictionary/dictionary-contract.js';
import { DictionaryStore } from '../src/dictionary/dictionary-store.js';

const cat = normalizeDictionaryEntry({
  dictionaryForm: '猫',
  reading: 'ねこ',
  meanings: ['кошка'],
  partOfSpeech: 'noun',
  tokenForms: ['猫', 'ねこ'],
});

function loader(overrides = {}) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async load() {
      calls++;
      if (overrides.load) return overrides.load(calls);
      return {
        manifest: { schemaVersion: 1, contentVersion: '1' },
        entries: [cat],
        tokenIndex: { 猫: [cat.id], ねこ: [cat.id] },
        aliases: { legacy_cat: cat.id },
      };
    },
  };
}

describe('DictionaryStore', () => {
  it('deduplicates concurrent loading and resolves aliases globally', async () => {
    const source = loader();
    const store = new DictionaryStore({ loader: source, userRepository: null });
    await Promise.all([store.ensureLoaded(), store.ensureLoaded(), store.ensureLoaded()]);
    expect(source.calls).toBe(1);
    expect(store.getDictionaryEntry('legacy_cat')).toMatchObject({ id: cat.id });
  });

  it('does not retain a rejected promise forever', async () => {
    const source = loader({
      load(calls) {
        if (calls === 1) throw new Error('temporary');
        return {
          manifest: { schemaVersion: 1, contentVersion: '1' },
          entries: [cat],
          tokenIndex: {},
          aliases: {},
        };
      },
    });
    const store = new DictionaryStore({ loader: source, userRepository: null });
    await expect(store.ensureLoaded()).rejects.toThrow('temporary');
    await expect(store.ensureLoaded()).resolves.toBe(store);
    expect(source.calls).toBe(2);
  });

  it('registers multiple course references without duplicating the entry', async () => {
    const source = loader();
    const store = new DictionaryStore({ loader: source, userRepository: null });
    await store.ensureLoaded();
    const first = store.resolveCourseVocabularyReference({
      id: 'genki-1:vocabulary:cat',
      localId: 'cat',
      courseId: 'genki-1',
      dictionaryId: cat.id,
      introducedIn: 'genki-1:lesson-1',
      courseMeaning: 'кошка',
    });
    const second = store.resolveCourseVocabularyReference({
      id: 'test-course:vocabulary:cat',
      localId: 'cat',
      courseId: 'test-course',
      dictionaryId: cat.id,
      introducedIn: 'test-course:lesson-alpha',
      courseMeaning: 'кот',
    });
    expect(store.getAllDictionaryEntries()).toHaveLength(1);
    expect(first.knowledgeItemId).toBe(second.knowledgeItemId);
    expect(store.findCourseReferencesForDictionary(cat.id)).toHaveLength(2);
    await store.ensureLoaded();
    expect(source.calls).toBe(1);
  });

  it('throws a diagnostic broken-reference error', async () => {
    const store = new DictionaryStore({ loader: loader(), userRepository: null });
    await store.ensureLoaded();
    expect(() =>
      store.resolveCourseVocabularyReference({
        id: 'broken:vocabulary:x',
        localId: 'x',
        courseId: 'broken',
        dictionaryId: 'jp-word:不存在:ふそんざい',
        introducedIn: 'broken:lesson-1',
        courseMeaning: 'broken',
      })
    ).toThrow(/courseId=broken.*lessonId=broken:lesson-1.*referenceId=.*dictionaryId=/u);
  });
});
