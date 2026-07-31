import { describe, expect, it } from 'vitest';
import { DictionaryStore } from '../src/dictionary/dictionary-store.js';
import { normalizeDictionaryEntry } from '../src/dictionary/dictionary-contract.js';
import { resolveStoryTokens, isTokenCompatibleWithEntry } from '../src/ai/story-token-resolver.js';
import { StoryTokenSchema } from '../src/ai-story-schema.js';
import { getWeakWords } from '../ui/ai-story.js';

const bridgeEntry = normalizeDictionaryEntry({
  id: 'jp-word:橋:はし',
  dictionaryForm: '橋',
  reading: 'はし',
  meanings: ['мост'],
  partOfSpeech: 'noun',
  tokenForms: ['橋', 'はし'],
});

const chopsticksEntry = normalizeDictionaryEntry({
  id: 'jp-word:箸:はし',
  dictionaryForm: '箸',
  reading: 'はし',
  meanings: ['палочки для еды'],
  partOfSpeech: 'noun',
  tokenForms: ['箸', 'はし'],
});

const catEntry = normalizeDictionaryEntry({
  id: 'jp-word:猫:ねこ',
  dictionaryForm: '猫',
  reading: 'ねこ',
  meanings: ['кошка'],
  partOfSpeech: 'noun',
  tokenForms: ['猫', 'ねこ'],
});

function createMockLoader() {
  return {
    async load() {
      return {
        manifest: { schemaVersion: 1, contentVersion: '1' },
        entries: [bridgeEntry, chopsticksEntry, catEntry],
        tokenIndex: {
          橋: [bridgeEntry.id],
          箸: [chopsticksEntry.id],
          はし: [bridgeEntry.id, chopsticksEntry.id],
          猫: [catEntry.id],
          ねこ: [catEntry.id],
        },
        aliases: {},
      };
    },
  };
}

describe('Issue #31 hardiness verification tests', () => {
  it('Blocker 1 & 2: getWeakWords returns objects with dictionaryId, dictionaryForm, reading, meaning', async () => {
    const store = new DictionaryStore({ loader: createMockLoader(), userRepository: null });

    const lessons = [
      {
        id: 1,
        words: [{ id: 'jp-word:猫:ねこ', kanji: '猫', kana: 'ねこ', english: 'cat' }],
      },
    ];

    const state = {
      chapters: { 1: { started: true } },
      srs: {
        'vocab::jp-word:猫:ねこ::recognition': {
          itemId: 'jp-word:猫:ねこ',
          skill: 'recognition',
          reps: 5,
          state: 3,
          lapses: 5,
          interval: 1,
          lastReviewDate: '2026-07-30',
        },
      },
    };

    const weak = await getWeakWords(state, 5, lessons, { dictionaryStore: store });
    expect(weak.length).toBeGreaterThan(0);
    expect(weak[0]).toHaveProperty('dictionaryId');
    expect(weak[0]).toHaveProperty('dictionaryForm');
    expect(weak[0]).toHaveProperty('reading');
    expect(weak[0]).toHaveProperty('meaning');
    expect(store.getDictionaryEntry(weak[0].dictionaryId)).not.toBeNull();
  });

  it('Blocker 4 & 5: isTokenCompatibleWithEntry prevents kanji homonym mismatches and validates dictionaryRef', async () => {
    const store = new DictionaryStore({ loader: createMockLoader(), userRepository: null });

    // Surface 橋 with dictionaryId for 箸 must fail compatibility!
    const tokenMismatch = { surface: '橋', reading: 'はし' };
    expect(isTokenCompatibleWithEntry(tokenMismatch, chopsticksEntry)).toBe(false);
    expect(isTokenCompatibleWithEntry(tokenMismatch, bridgeEntry)).toBe(true);

    // Kana-only surface はし is compatible with either reading match
    const tokenKana = { surface: 'はし', reading: 'はし' };
    expect(isTokenCompatibleWithEntry(tokenKana, chopsticksEntry)).toBe(true);
    expect(isTokenCompatibleWithEntry(tokenKana, bridgeEntry)).toBe(true);

    // Explicit dictionaryRef W1 points to cat, but token surface is 犬 -> compatibility check fails
    const selectedWordRefs = { W1: catEntry.id };
    const story = [
      {
        sentence_id: 1,
        speaker: 'Hero',
        translation: 'Собака.',
        tokens: [{ surface: '犬', reading: 'いぬ', dictionaryRef: 'W1' }],
      },
    ];

    const res = await resolveStoryTokens({
      story,
      selectedWordRefs,
      dictionaryStore: store,
    });

    // Explicit ref hit should NOT occur because 犬 is incompatible with 猫
    expect(res.statistics.explicitReferenceHits).toBe(0);
    expect(res.story[0].tokens[0].dictionaryId).toBeNull();
  });

  it('1. Existing ambiguity does NOT create new AI entry when AI enrichment returns kana lemma for kanji homonyms', async () => {
    const store = new DictionaryStore({ loader: createMockLoader(), userRepository: null });

    // Test A: No context provider supplied
    const aiProviderNoContext = {
      async enrichUnknownLexemes() {
        return {
          entries: [
            {
              tokenKey: 'unknown-1',
              dictionaryForm: 'はし',
              reading: 'はし',
              meanings: ['палочки или мост'],
              partOfSpeech: 'noun',
              confidence: 0.9,
            },
          ],
        };
      },
    };

    const story = [
      {
        sentence_id: 1,
        speaker: 'Hero',
        translation: 'Перейти はし',
        tokens: [{ surface: 'はし', reading: 'はし' }],
      },
    ];

    const resNoContext = await resolveStoryTokens({
      story,
      dictionaryStore: store,
      aiLexicalProvider: aiProviderNoContext,
    });

    expect(resNoContext.story[0].tokens[0].resolution.status).toBe('ambiguous');
    expect(resNoContext.story[0].tokens[0].dictionaryId).toBeNull();
    expect(resNoContext.statistics.generatedEntries).toBe(0);
    expect(store.getDictionaryEntry('user-word:はし:はし')).toBeNull();

    // Test B: Context provider returns low confidence (0.5)
    const aiProviderLowContext = {
      ...aiProviderNoContext,
      async resolveAmbiguousToken() {
        return {
          selectedDictionaryId: bridgeEntry.id,
          confidence: 0.5,
        };
      },
    };

    const resLowContext = await resolveStoryTokens({
      story,
      dictionaryStore: store,
      aiLexicalProvider: aiProviderLowContext,
    });

    expect(resLowContext.story[0].tokens[0].resolution.status).toBe('ambiguous');
    expect(resLowContext.story[0].tokens[0].dictionaryId).toBeNull();
    expect(resLowContext.statistics.generatedEntries).toBe(0);
    expect(store.getDictionaryEntry('user-word:はし:はし')).toBeNull();
  });

  it('2 & 3. Confidence thresholds: confidence < 0.6 is not saved; confidence >= 0.6 is saved', async () => {
    const store = new DictionaryStore({ loader: createMockLoader(), userRepository: null });

    const aiProviderLow = {
      async enrichUnknownLexemes() {
        return {
          entries: [
            {
              tokenKey: 'unknown-1',
              dictionaryForm: '泳ぐ',
              reading: 'およぐ',
              meanings: ['плавать'],
              partOfSpeech: 'verb',
              verbClass: 'godan',
              confidence: 0.59, // Below AI_LEXICAL_ENTRY_MIN_CONFIDENCE
            },
          ],
        };
      },
    };

    const storyLow = [
      {
        sentence_id: 1,
        speaker: 'Hero',
        translation: 'Плавать.',
        tokens: [{ surface: '泳ぐ', reading: 'およぐ' }],
      },
    ];

    const resLow = await resolveStoryTokens({
      story: storyLow,
      dictionaryStore: store,
      aiLexicalProvider: aiProviderLow,
    });

    expect(resLow.statistics.generatedEntries).toBe(0);
    expect(resLow.statistics.lowConfidenceEntries).toBe(1);
    expect(resLow.story[0].tokens[0].dictionaryId).toBeNull();
    expect(resLow.story[0].tokens[0].resolution.status).toBe('missing');

    const aiProviderValid = {
      async enrichUnknownLexemes() {
        return {
          entries: [
            {
              tokenKey: 'unknown-1',
              dictionaryForm: '泳ぐ',
              reading: 'およぐ',
              meanings: ['плавать'],
              partOfSpeech: 'verb',
              verbClass: 'godan',
              confidence: 0.6, // Threshold confidence
            },
          ],
        };
      },
    };

    const resValid = await resolveStoryTokens({
      story: storyLow,
      dictionaryStore: store,
      aiLexicalProvider: aiProviderValid,
    });

    expect(resValid.statistics.generatedEntries).toBe(1);
    expect(resValid.story[0].tokens[0].resolution.status).toBe('resolved');
    expect(resValid.story[0].tokens[0].dictionaryId).toBe('user-word:泳ぐ:およぐ');
  });

  it('4, 5, 6. getWeakWords skips ambiguous candidates, resolves direct global ID, and never returns non-existent IDs', async () => {
    const store = new DictionaryStore({ loader: createMockLoader(), userRepository: null });

    const lessons = [
      {
        id: 1,
        words: [
          { id: 'jp-word:猫:ねこ', kanji: '猫', kana: 'ねこ', english: 'cat' },
          { id: 'legacy-hashi', kanji: 'はし', kana: 'はし', english: 'hashi' },
        ],
      },
    ];

    const state = {
      chapters: { 1: { started: true } },
      srs: {
        'vocab::jp-word:猫:ねこ::recognition': {
          itemId: 'jp-word:猫:ねこ',
          skill: 'recognition',
          reps: 5,
          lapses: 5,
        },
        'vocab::legacy-hashi::recognition': {
          itemId: 'legacy-hashi',
          skill: 'recognition',
          reps: 5,
          lapses: 5,
        },
        'vocab::nonexistent-id::recognition': {
          itemId: 'nonexistent-id',
          skill: 'recognition',
          reps: 5,
          lapses: 5,
        },
      },
    };

    const weakWords = await getWeakWords(state, 10, lessons, { dictionaryStore: store });
    // Cat is resolved directly; legacy-hashi is ambiguous and skipped; nonexistent-id is missing and skipped
    expect(weakWords.length).toBe(1);
    expect(weakWords[0].dictionaryId).toBe('jp-word:猫:ねこ');
    expect(store.getDictionaryEntry(weakWords[0].dictionaryId)).not.toBeNull();
  });

  it('7, 8, 9. Duplicate, unknown, and missing tokenKeys handling in batch fallback', async () => {
    const store = new DictionaryStore({ loader: createMockLoader(), userRepository: null });

    const aiProvider = {
      async enrichUnknownLexemes() {
        return {
          entries: [
            {
              tokenKey: 'unknown-1',
              dictionaryForm: '走る',
              reading: 'はしる',
              meanings: ['бежать'],
              partOfSpeech: 'verb',
              confidence: 0.9,
            },
            {
              tokenKey: 'unknown-1', // Duplicate tokenKey!
              dictionaryForm: '走る',
              reading: 'はしる',
              meanings: ['бежать дубль'],
              partOfSpeech: 'verb',
              confidence: 0.9,
            },
            {
              tokenKey: 'bogus-key-99', // Unknown tokenKey!
              dictionaryForm: '飛ぶ',
              reading: 'とぶ',
              meanings: ['летать'],
              partOfSpeech: 'verb',
              confidence: 0.9,
            },
          ],
        };
      },
    };

    const story = [
      {
        sentence_id: 1,
        speaker: 'Hero',
        translation: 'Тест.',
        tokens: [
          { surface: '走る', reading: 'はしる' },
          { surface: '歩く', reading: 'あるく' }, // missing from AI response
        ],
      },
    ];

    const res = await resolveStoryTokens({
      story,
      dictionaryStore: store,
      aiLexicalProvider: aiProvider,
    });

    expect(res.statistics.duplicateTokenKeys).toBe(1);
    expect(res.statistics.unknownTokenKeys).toBe(1);
    expect(res.statistics.missingLexicalResponses).toBe(1);
    expect(res.story[0].tokens[0].resolution.status).toBe('missing');
    expect(res.story[0].tokens[1].resolution.status).toBe('missing');
  });

  it('10 & 11. StoryTokenSchema enforces character limits, dictionaryRef regex ^W[1-9]\\d*$, and form schema', () => {
    // Oversized surface (> 200 chars)
    expect(() =>
      StoryTokenSchema.parse({
        surface: 'a'.repeat(201),
        reading: 'あ',
      })
    ).toThrow();

    // Invalid dictionaryRefs: W0, W01, w-1, huge numbers
    expect(() => StoryTokenSchema.parse({ surface: '猫', dictionaryRef: 'W0' })).toThrow();
    expect(() => StoryTokenSchema.parse({ surface: '猫', dictionaryRef: 'W01' })).toThrow();
    expect(() => StoryTokenSchema.parse({ surface: '猫', dictionaryRef: 'W-1' })).toThrow();
    expect(() =>
      StoryTokenSchema.parse({ surface: '猫', dictionaryRef: 'W999999999999999999999' })
    ).toThrow();

    // Valid dictionaryRef
    const validRef = StoryTokenSchema.parse({ surface: '猫', dictionaryRef: 'W1' });
    expect(validRef.dictionaryRef).toBe('W1');

    // Arbitrary nested form object stripped into StoryTokenFormSchema
    const tokenWithNestedForm = StoryTokenSchema.parse({
      surface: '食べる',
      form: {
        tense: 'past',
        politeness: 'polite',
        polarity: 'affirmative',
        conjugation: 'たべました',
        randomExtraField: 'should be stripped',
      },
    });

    expect(tokenWithNestedForm.form).toEqual({
      tense: 'past',
      politeness: 'polite',
      polarity: 'affirmative',
      conjugation: 'たべました',
    });
  });

  it('12 & 13. Story ID stability and namespacing', async () => {
    const store = new DictionaryStore({ loader: createMockLoader(), userRepository: null });

    const story = [
      {
        sentence_id: 1,
        speaker: 'Hero',
        translation: 'Кошка.',
        tokens: [{ surface: '猫', reading: 'ねこ' }],
      },
    ];

    const res1 = await resolveStoryTokens({
      story,
      dictionaryStore: store,
      storyId: 'ai-story-stable-123',
    });

    const res2 = await resolveStoryTokens({
      story,
      dictionaryStore: store,
      storyId: 'ai-story-stable-123',
    });

    expect(res1.story[0].tokens[0].id).toBe(res2.story[0].tokens[0].id);

    const resGenki = await resolveStoryTokens({
      story,
      dictionaryStore: store,
      activeCourseId: 'genki-1',
      storyId: 'genki-1:story:1',
    });

    const resTestCourse = await resolveStoryTokens({
      story,
      dictionaryStore: store,
      activeCourseId: 'test-course',
      storyId: 'test-course:story:1',
    });

    expect(resGenki.story[0].tokens[0].id).not.toBe(resTestCourse.story[0].tokens[0].id);
  });

  it('14. Persistence failure rollback does not corrupt runtime store', async () => {
    const failingRepo = {
      async listDictionaries() {
        return [];
      },
      async saveDictionary() {},
      async listEntries() {
        return [];
      },
      async saveEntry() {
        throw new Error('IndexedDB failure');
      },
    };

    const store = new DictionaryStore({ loader: createMockLoader(), userRepository: failingRepo });

    const aiProvider = {
      async enrichUnknownLexemes() {
        return {
          entries: [
            {
              tokenKey: 'unknown-1',
              dictionaryForm: '走る',
              reading: 'はしる',
              meanings: ['бежать'],
              partOfSpeech: 'verb',
              confidence: 0.9,
            },
          ],
        };
      },
    };

    const story = [
      {
        sentence_id: 1,
        speaker: 'Hero',
        translation: 'Бежать.',
        tokens: [{ surface: '走る', reading: 'はしる' }],
      },
    ];

    const res = await resolveStoryTokens({
      story,
      dictionaryStore: store,
      aiLexicalProvider: aiProvider,
    });

    expect(res.statistics.generatedEntries).toBe(0);
    expect(res.story[0].tokens[0].resolution.status).toBe('missing');
    expect(store.userEntries.has('user-word:走る:はしる')).toBe(false);
  });

  it('15. Separate AI-call metrics tracks lexicalEnrichmentCalls and ambiguityAiCalls correctly', async () => {
    const store = new DictionaryStore({ loader: createMockLoader(), userRepository: null });

    const aiProvider = {
      async enrichUnknownLexemes() {
        return {
          entries: [
            {
              tokenKey: 'unknown-1',
              dictionaryForm: '走る',
              reading: 'はしる',
              meanings: ['бежать'],
              partOfSpeech: 'verb',
              confidence: 0.9,
            },
          ],
        };
      },
      async resolveAmbiguousToken() {
        return {
          selectedDictionaryId: bridgeEntry.id,
          confidence: 0.9,
        };
      },
    };

    const story = [
      {
        sentence_id: 1,
        speaker: 'Hero',
        translation: 'Бежать через はし.',
        tokens: [
          { surface: '走る', reading: 'はしる' },
          { surface: 'はし', reading: 'はし' },
        ],
      },
    ];

    const res = await resolveStoryTokens({
      story,
      dictionaryStore: store,
      aiLexicalProvider: aiProvider,
    });

    expect(res.statistics.lexicalEnrichmentCalls).toBe(1);
    expect(res.statistics.ambiguityAiCalls).toBe(1);
    expect(res.statistics.lexicalAiCalls).toBe(2);
  });
});
