import { describe, expect, it, vi } from 'vitest';
import { DictionaryStore } from '../src/dictionary/dictionary-store.js';
import { normalizeDictionaryEntry } from '../src/dictionary/dictionary-contract.js';
import { resolveStoryTokens, isTokenCompatibleWithEntry } from '../src/ai/story-token-resolver.js';
import { StoryTokenSchema } from '../src/ai-story-schema.js';
import { getWeakWords } from '../ui/ai-story.js';
import { API } from '../services.js';

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
  it('Blocker 1 & 2: getWeakWords returns objects with dictionaryId, dictionaryForm, reading, meaning', () => {
    const store = new DictionaryStore({ loader: createMockLoader(), userRepository: null });
    globalThis.dictionaryStore = store;

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

    const weak = getWeakWords(state, 5, lessons);
    expect(weak.length).toBeGreaterThan(0);
    expect(weak[0]).toHaveProperty('dictionaryId');
    expect(weak[0]).toHaveProperty('dictionaryForm');
    expect(weak[0]).toHaveProperty('reading');
    expect(weak[0]).toHaveProperty('meaning');
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

  it('Blocker 3 & High Priority 10: Candidate ambiguity does NOT pick candidates[0] automatically', async () => {
    const store = new DictionaryStore({ loader: createMockLoader(), userRepository: null });

    const story = [
      {
        sentence_id: 1,
        speaker: 'Hero',
        translation: 'Что-то про はし',
        tokens: [{ surface: 'はし', reading: 'はし' }],
      },
    ];

    const res = await resolveStoryTokens({
      story,
      dictionaryStore: store,
      aiLexicalProvider: null, // No AI context provider supplied
    });

    expect(res.statistics.ambiguousTokens).toBe(1);
    expect(res.story[0].tokens[0].resolution.status).toBe('ambiguous');
    expect(res.story[0].tokens[0].dictionaryId).toBeNull();
  });

  it('Blocker 6: Batch fallback validates each entry separately without rejecting valid entries', async () => {
    const store = new DictionaryStore({ loader: createMockLoader(), userRepository: null });

    const aiProvider = {
      async enrichUnknownLexemes() {
        return {
          entries: [
            {
              tokenKey: 'unknown-1',
              dictionaryForm: '', // INVALID item
              reading: 'みわたす',
              meanings: [],
            },
            {
              tokenKey: 'unknown-2',
              dictionaryForm: '走る',
              reading: 'はしる',
              meanings: ['бежать'],
              partOfSpeech: 'verb',
              verbClass: 'godan',
              tokenForms: ['走る', 'はしる', '走りました'],
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
        translation: 'Бежал и оглядывался.',
        tokens: [
          { surface: '見渡す', reading: 'みわたす' },
          { surface: '走りました', reading: 'はしりました' },
        ],
      },
    ];

    const res = await resolveStoryTokens({
      story,
      dictionaryStore: store,
      aiLexicalProvider: aiProvider,
    });

    const runToken = res.story[0].tokens[1];
    // Valid item for 走る should be registered and resolved despite item 1 being corrupt!
    expect(runToken.resolution.status).toBe('resolved');
    expect(runToken.dictionaryId).toBe('user-word:走る:はしる');
  });

  it('Blocker 7: StoryTokenSchema accepts canonical surface/reading and validates dictionaryRef W<number>', () => {
    const canonicalToken = {
      surface: '食べる',
      reading: 'たべる',
      contextMeaning: 'есть',
      dictionaryRef: 'W1',
    };
    const parsed = StoryTokenSchema.parse(canonicalToken);
    expect(parsed.surface).toBe('食べる');
    expect(parsed.dictionaryRef).toBe('W1');

    const invalidRefToken = {
      surface: '食べる',
      dictionaryRef: 'invalidRefKey',
    };
    expect(() => StoryTokenSchema.parse(invalidRefToken)).toThrow();
  });

  it('High Priority 11: AI context resolution checks compatibility and tracks aiContextHits statistic', async () => {
    const store = new DictionaryStore({ loader: createMockLoader(), userRepository: null });

    const aiProvider = {
      async resolveAmbiguousToken() {
        return {
          selectedDictionaryId: chopsticksEntry.id,
          confidence: 0.95,
        };
      },
    };

    const story = [
      {
        sentence_id: 1,
        speaker: 'Hero',
        translation: 'Еда палочками.',
        tokens: [{ surface: 'はし', reading: 'はし' }],
      },
    ];

    const res = await resolveStoryTokens({
      story,
      dictionaryStore: store,
      aiLexicalProvider: aiProvider,
    });

    expect(res.statistics.aiContextHits).toBe(1);
    expect(res.story[0].tokens[0].resolution.status).toBe('resolved');
    expect(res.story[0].tokens[0].resolution.source).toBe('ai-context');
    expect(res.story[0].tokens[0].dictionaryId).toBe(chopsticksEntry.id);
  });
});
