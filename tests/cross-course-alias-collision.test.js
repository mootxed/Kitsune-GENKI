import { describe, expect, it } from 'vitest';
import { DictionaryStore } from '../src/dictionary/dictionary-store.js';

describe('cross-course localId collision safety', () => {
  it('prevents bare localId from creating global alias collisions between courses', () => {
    const store = new DictionaryStore({ fetchImpl: () => Promise.reject(new Error('Mock')) });

    const entryNeko = {
      schemaVersion: 1,
      id: 'jp-word:猫:ねこ',
      dictionaryForm: '猫',
      reading: 'ねこ',
      meanings: ['кошка'],
      partOfSpeech: 'noun',
      verbClass: null,
      adjectiveClass: null,
      transitivity: null,
      tokenForms: ['猫', 'ねこ'],
      semanticTags: ['animals'],
      romaji: 'neko',
      source: 'curated',
      confidence: 1,
      provenance: { sourceType: 'kotokitsu-content' },
    };

    const entryInu = {
      schemaVersion: 1,
      id: 'jp-word:犬:いぬ',
      dictionaryForm: '犬',
      reading: 'いぬ',
      meanings: ['собака'],
      partOfSpeech: 'noun',
      verbClass: null,
      adjectiveClass: null,
      transitivity: null,
      tokenForms: ['犬', 'いぬ'],
      semanticTags: ['animals'],
      romaji: 'inu',
      source: 'curated',
      confidence: 1,
      provenance: { sourceType: 'kotokitsu-content' },
    };

    store.builtinEntries.set(entryNeko.id, entryNeko);
    store.builtinEntries.set(entryInu.id, entryInu);

    // Register course 1 reference with localId = 'word-1'
    store.registerCourseVocabularyReference({
      id: 'genki-1:vocabulary:word-1',
      localId: 'word-1',
      courseId: 'genki-1',
      dictionaryId: entryNeko.id,
      introducedIn: 'genki-1:lesson-1',
      courseMeaning: 'кошка',
      tags: [],
    });

    // Register course 2 reference with same localId = 'word-1'
    store.registerCourseVocabularyReference({
      id: 'test-course:vocabulary:word-1',
      localId: 'word-1',
      courseId: 'test-course',
      dictionaryId: entryInu.id,
      introducedIn: 'test-course:lesson-1',
      courseMeaning: 'собака',
      tags: [],
    });

    // 1. Full namespaced reference IDs resolve independently
    expect(store.resolveAlias('genki-1:vocabulary:word-1')).toBe('jp-word:猫:ねこ');
    expect(store.resolveAlias('test-course:vocabulary:word-1')).toBe('jp-word:犬:いぬ');

    // 2. Course-scoped local lookups resolve independently
    expect(store.resolveAlias('word-1', 'genki-1')).toBe('jp-word:猫:ねこ');
    expect(store.resolveAlias('word-1', 'test-course')).toBe('jp-word:犬:いぬ');

    // 3. Bare localId without course namespace does NOT pollute global alias map
    expect(store.resolveAlias('word-1')).toBe('word-1');
  });
});
