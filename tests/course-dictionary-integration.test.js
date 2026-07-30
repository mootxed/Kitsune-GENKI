import { describe, expect, it } from 'vitest';
import { normalizeDictionaryEntry } from '../src/dictionary/dictionary-contract.js';
import { DictionaryStore } from '../src/dictionary/dictionary-store.js';

const entry = normalizeDictionaryEntry({
  dictionaryForm: '食べる',
  reading: 'たべる',
  meanings: ['есть', 'кушать'],
  partOfSpeech: 'verb',
  verbClass: 'ichidan',
  tokenForms: ['食べる', 'たべる', '食べます'],
});

function store() {
  return new DictionaryStore({
    userRepository: null,
    loader: {
      async load() {
        return {
          manifest: { schemaVersion: 1, contentVersion: '1' },
          entries: [entry],
          tokenIndex: { 食べる: [entry.id], 食べます: [entry.id] },
          aliases: {},
        };
      },
    },
  });
}

describe('course references share the global dictionary', () => {
  it('keeps linguistic fields shared and course context independent', async () => {
    const dictionary = store();
    await dictionary.ensureLoaded();
    const genki = dictionary.resolveCourseVocabularyReference({
      id: 'genki-1:vocabulary:taberu',
      localId: 'taberu',
      courseId: 'genki-1',
      dictionaryId: entry.id,
      introducedIn: 'genki-1:lesson-3',
      courseMeaning: 'есть',
    });
    const other = dictionary.resolveCourseVocabularyReference({
      id: 'test-course:vocabulary:taberu',
      localId: 'taberu',
      courseId: 'test-course',
      dictionaryId: entry.id,
      introducedIn: 'test-course:lesson-alpha',
      courseMeaning: 'принимать пищу',
    });

    expect(genki).toMatchObject({
      dictionaryId: entry.id,
      knowledgeItemId: entry.id,
      dictionaryForm: '食べる',
      reading: 'たべる',
      courseMeaning: 'есть',
    });
    expect(other).toMatchObject({
      dictionaryId: entry.id,
      knowledgeItemId: entry.id,
      dictionaryForm: '食べる',
      reading: 'たべる',
      courseMeaning: 'принимать пищу',
    });
    expect(dictionary.getAllDictionaryEntries()).toHaveLength(1);
    expect(dictionary.findCourseReferencesForDictionary(entry.id)).toHaveLength(2);
    expect(dictionary.getDictionaryEntry(entry.id)).toEqual(entry);
  });

  it('does not require a course reference for global lookup or token lookup', async () => {
    const dictionary = store();
    await dictionary.ensureLoaded();
    expect(dictionary.getDictionaryEntry(entry.id)).toEqual(entry);
    expect(dictionary.findDictionaryCandidatesByToken('食べます')).toMatchObject({
      candidates: [entry.id],
      exact: true,
      ambiguous: false,
    });
    expect(dictionary.findCourseReferencesForDictionary(entry.id)).toEqual([]);
  });
});
