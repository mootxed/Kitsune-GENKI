import { describe, expect, it } from 'vitest';
import {
  DictionaryEntrySchema,
  normalizeDictionaryEntry,
} from '../src/dictionary/dictionary-contract.js';
import { canonicalHiragana, dictionaryEntryId } from '../src/dictionary/dictionary-id.js';
import { resolveCourseVocabulary } from '../src/dictionary/dictionary-merge.js';

describe('global dictionary contracts', () => {
  it('uses writing and canonical reading only for a stable ID', () => {
    const left = dictionaryEntryId({
      dictionaryForm: ' 食べる ',
      reading: 'タベル',
      meanings: ['есть'],
      courseId: 'genki-1',
    });
    const right = dictionaryEntryId({
      dictionaryForm: '食べる',
      reading: 'たべる',
      meanings: ['кушать'],
      courseId: 'other-course',
    });
    expect(left).toBe('jp-word:食べる:たべる');
    expect(right).toBe(left);
    expect(canonicalHiragana('スポーツ')).toBe('すぽーつ');
  });

  it('keeps different readings and explicit collision disambiguators separate', () => {
    expect(dictionaryEntryId({ dictionaryForm: '生', reading: 'せい' })).not.toBe(
      dictionaryEntryId({ dictionaryForm: '生', reading: 'なま' })
    );
    expect(
      dictionaryEntryId(
        { dictionaryForm: 'はし', reading: 'はし' },
        { disambiguator: 'particle-use' }
      )
    ).toBe('jp-word:はし:はし:particle-use');
  });

  it('validates global fields and rejects course-specific data', () => {
    const entry = normalizeDictionaryEntry({
      dictionaryForm: '食べる',
      reading: 'たべる',
      meanings: ['есть'],
      partOfSpeech: 'verb',
      verbClass: 'ichidan',
      tokenForms: ['食べる', 'たべる'],
      source: 'curated',
      provenance: { sourceType: 'kotokitsu-content' },
    });
    expect(DictionaryEntrySchema.parse(entry).id).toBe('jp-word:食べる:たべる');
    expect(() => DictionaryEntrySchema.parse({ ...entry, courseId: 'genki-1' })).toThrow();
  });

  it('resolves two course references to one immutable linguistic entry', () => {
    const entry = normalizeDictionaryEntry({
      dictionaryForm: '食べる',
      reading: 'たべる',
      meanings: ['есть', 'кушать'],
      partOfSpeech: 'verb',
      verbClass: 'ichidan',
      tokenForms: ['食べる', '食べます'],
    });
    const first = resolveCourseVocabulary(
      {
        id: 'genki-1:vocabulary:taberu',
        localId: 'taberu',
        courseId: 'genki-1',
        dictionaryId: entry.id,
        introducedIn: 'genki-1:lesson-3',
        courseMeaning: 'есть',
      },
      entry
    );
    const second = resolveCourseVocabulary(
      {
        id: 'test-course:vocabulary:taberu',
        localId: 'taberu',
        courseId: 'test-course',
        dictionaryId: entry.id,
        introducedIn: 'test-course:lesson-alpha',
        courseMeaning: 'принимать пищу',
      },
      entry
    );
    expect(first.dictionaryId).toBe(second.dictionaryId);
    expect(first.dictionaryForm).toBe(second.dictionaryForm);
    expect(first.courseMeaning).not.toBe(second.courseMeaning);
    expect(Object.isFrozen(first)).toBe(true);
  });
});
