import { describe, expect, it } from 'vitest';
import { DictionaryStore } from '../src/dictionary/dictionary-store.js';
import { normalizeDictionaryEntry } from '../src/dictionary/dictionary-contract.js';
import { resolveStoryTokens } from '../src/ai/story-token-resolver.js';

const bridge = normalizeDictionaryEntry({
  id: 'jp-word:橋:はし',
  dictionaryForm: '橋',
  reading: 'はし',
  meanings: ['мост'],
  partOfSpeech: 'noun',
  tokenForms: ['橋', 'はし'],
});

const chopsticks = normalizeDictionaryEntry({
  id: 'jp-word:箸:はし',
  dictionaryForm: '箸',
  reading: 'はし',
  meanings: ['палочки для еды'],
  partOfSpeech: 'noun',
  tokenForms: ['箸', 'はし'],
});

const edge = normalizeDictionaryEntry({
  id: 'jp-word:端:はし',
  dictionaryForm: '端',
  reading: 'はし',
  meanings: ['край'],
  partOfSpeech: 'noun',
  tokenForms: ['端', 'はし'],
});

function createAmbiguousLoader() {
  return {
    async load() {
      return {
        manifest: { schemaVersion: 1, contentVersion: '1' },
        entries: [bridge, chopsticks, edge],
        tokenIndex: {
          はし: [bridge.id, chopsticks.id, edge.id],
        },
        aliases: {},
      };
    },
  };
}

describe('StoryTokenResolver Ambiguity Handling', () => {
  it('does NOT automatically pick the first candidate for ambiguous "はし"', async () => {
    const store = new DictionaryStore({ loader: createAmbiguousLoader(), userRepository: null });

    const story = [
      {
        sentence_id: 1,
        speaker: 'Narrator',
        translation: 'Что-то про はし',
        tokens: [{ surface: 'はし', reading: 'はし' }],
      },
    ];

    const result = await resolveStoryTokens({
      story,
      dictionaryStore: store,
      aiLexicalProvider: null,
    });

    const token = result.story[0].tokens[0];
    expect(token.resolution.status).toBe('ambiguous');
    expect(token.dictionaryId).toBeNull();
    expect(result.statistics.ambiguousTokens).toBe(1);
  });

  it('uses AI context call to resolve ambiguous token if confidence >= 0.75', async () => {
    const store = new DictionaryStore({ loader: createAmbiguousLoader(), userRepository: null });

    const aiProvider = {
      async resolveAmbiguousToken() {
        return {
          selectedDictionaryId: chopsticks.id,
          confidence: 0.91,
        };
      },
    };

    const story = [
      {
        sentence_id: 1,
        speaker: 'Taro',
        translation: 'Я ем палочками.',
        tokens: [{ surface: 'はし', reading: 'はし' }],
      },
    ];

    const result = await resolveStoryTokens({
      story,
      dictionaryStore: store,
      aiLexicalProvider: aiProvider,
    });

    const token = result.story[0].tokens[0];
    expect(token.resolution.status).toBe('resolved');
    expect(token.resolution.source).toBe('ai-context');
    expect(token.dictionaryId).toBe(chopsticks.id);
  });

  it('rejects low confidence AI resolution (< 0.75) and leaves token ambiguous', async () => {
    const store = new DictionaryStore({ loader: createAmbiguousLoader(), userRepository: null });

    const aiProvider = {
      async resolveAmbiguousToken() {
        return {
          selectedDictionaryId: chopsticks.id,
          confidence: 0.6, // < 0.75
        };
      },
    };

    const story = [
      {
        sentence_id: 1,
        speaker: 'Taro',
        translation: 'Я ем はし.',
        tokens: [{ surface: 'はし', reading: 'はし' }],
      },
    ];

    const result = await resolveStoryTokens({
      story,
      dictionaryStore: store,
      aiLexicalProvider: aiProvider,
    });

    const token = result.story[0].tokens[0];
    expect(token.resolution.status).toBe('ambiguous');
    expect(token.dictionaryId).toBeNull();
  });
});
