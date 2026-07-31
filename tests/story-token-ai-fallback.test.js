import { describe, expect, it } from 'vitest';
import { DictionaryStore } from '../src/dictionary/dictionary-store.js';
import { resolveStoryTokens } from '../src/ai/story-token-resolver.js';

function createEmptyLoader() {
  return {
    async load() {
      return {
        manifest: { schemaVersion: 1, contentVersion: '1' },
        entries: [],
        tokenIndex: {},
        aliases: {},
      };
    },
  };
}

describe('StoryTokenResolver AI Fallback & Deduplication', () => {
  it('executes ONE batch call for multiple unknown tokens and deduplicates identical words', async () => {
    const store = new DictionaryStore({ loader: createEmptyLoader(), userRepository: null });

    let batchCalls = 0;
    let batchInputSize = 0;

    const aiProvider = {
      async enrichUnknownLexemes(items) {
        batchCalls++;
        batchInputSize = items.length;
        return {
          entries: [
            {
              tokenKey: items[0].tokenKey,
              dictionaryForm: '見渡す',
              reading: 'みわたす',
              meanings: ['осматривать', 'оглядывать'],
              partOfSpeech: 'verb',
              verbClass: 'godan',
              tokenForms: ['見渡す', 'みわたす', '見渡しました', '見渡して'],
              confidence: 0.85,
            },
          ],
        };
      },
    };

    const story = [
      {
        sentence_id: 1,
        speaker: 'Hero',
        translation: 'Осмотрелся.',
        tokens: [
          {
            surface: '見渡しました',
            reading: 'みわたしました',
            dictionaryForm: '見渡す',
            dictionaryReading: 'みわたす',
          },
          { surface: '、', type: 'Punctuation' },
          {
            surface: '見渡して',
            reading: 'みわたして',
            dictionaryForm: '見渡す',
            dictionaryReading: 'みわたす',
          },
        ],
      },
    ];

    const result = await resolveStoryTokens({
      story,
      dictionaryStore: store,
      aiLexicalProvider: aiProvider,
    });

    expect(batchCalls).toBe(1);
    expect(batchInputSize).toBe(1); // Deduplicated 2 occurrences of same word '見渡す' into 1 batch item
    expect(result.statistics.generatedEntries).toBe(1);

    const token1 = result.story[0].tokens[0];
    const token2 = result.story[0].tokens[2];

    expect(token1.dictionaryId).toBe('user-word:見渡す:みわたす');
    expect(token2.dictionaryId).toBe('user-word:見渡す:みわたす');
    expect(token1.resolution.status).toBe('resolved');
    expect(token1.resolution.source).toBe('user-ai');
  });

  it('rejects invalid AI response (missing dictionaryForm or meanings) without crashing story', async () => {
    const store = new DictionaryStore({ loader: createEmptyLoader(), userRepository: null });

    const aiProvider = {
      async enrichUnknownLexemes() {
        return {
          entries: [
            {
              tokenKey: 'unknown-1',
              dictionaryForm: '', // invalid empty
              reading: 'みわたす',
              meanings: [], // invalid empty
            },
          ],
        };
      },
    };

    const story = [
      {
        sentence_id: 1,
        speaker: 'Hero',
        translation: 'Осмотрелся.',
        tokens: [{ surface: '見渡しました', reading: 'みわたしました' }],
      },
    ];

    const result = await resolveStoryTokens({
      story,
      dictionaryStore: store,
      aiLexicalProvider: aiProvider,
    });

    const token = result.story[0].tokens[0];
    expect(token.dictionaryId).toBeNull();
    expect(token.resolution.status).toBe('missing');
    expect(result.statistics.unresolvedTokens).toBe(1);
  });
});
