import { beforeEach, describe, expect, it } from 'vitest';
import { initializeDB, STORES } from '../src/db.js';
import { DictionaryStore } from '../src/dictionary/dictionary-store.js';
import { UserDictionaryRepository } from '../src/user-dictionaries/repository.js';
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

describe('Story Token IndexedDB Persistence & Cache Reuse', () => {
  let repository;

  beforeEach(async () => {
    const database = await initializeDB();
    await database.clear(STORES.USER_DICTIONARIES);
    await database.clear(STORES.USER_DICTIONARY_ENTRIES);
    repository = new UserDictionaryRepository(database);
  });

  it('saves AI fallback entry to IndexedDB and reuses it in second story without AI calls', async () => {
    const store = new DictionaryStore({
      loader: createEmptyLoader(),
      userRepository: repository,
    });
    await store.ensureLoaded();

    let aiCalls = 0;
    const aiProvider = {
      async enrichUnknownLexemes(items) {
        aiCalls++;
        return {
          entries: [
            {
              tokenKey: items[0].tokenKey,
              dictionaryForm: '見渡す',
              reading: 'みわたす',
              meanings: ['осматривать'],
              partOfSpeech: 'verb',
              verbClass: 'godan',
              tokenForms: ['見渡す', 'みわたす', '見渡しました', '見渡して'],
              confidence: 0.9,
            },
          ],
        };
      },
    };

    // Story 1: missing token '見渡しました'
    const story1 = [
      {
        sentence_id: 1,
        speaker: 'Hero',
        translation: 'Осмотрелся.',
        tokens: [{ surface: '見渡しました', reading: 'みわたしました' }],
      },
    ];

    const result1 = await resolveStoryTokens({
      story: story1,
      dictionaryStore: store,
      userDictionaryRepository: repository,
      aiLexicalProvider: aiProvider,
    });

    expect(aiCalls).toBe(1);
    expect(result1.statistics.generatedEntries).toBe(1);
    expect(result1.story[0].tokens[0].dictionaryId).toBe('user-word:見渡す:みわたす');

    // Story 2: another form '見渡して' of the same word
    const story2 = [
      {
        sentence_id: 1,
        speaker: 'Hero',
        translation: 'Осмотревшись, пошел.',
        tokens: [{ surface: '見渡して', reading: 'みわたして' }],
      },
    ];

    const result2 = await resolveStoryTokens({
      story: story2,
      dictionaryStore: store,
      userDictionaryRepository: repository,
      aiLexicalProvider: aiProvider,
    });

    expect(aiCalls).toBe(1); // 0 NEW lexical AI calls!
    expect(result2.statistics.userAiHits).toBe(1);
    expect(result2.story[0].tokens[0].dictionaryId).toBe('user-word:見渡す:みわたす');
    expect(result2.story[0].tokens[0].resolution.source).toBe('user-ai');

    // Reload DictionaryStore completely (simulating page reload / restart)
    const reloadedStore = new DictionaryStore({
      loader: createEmptyLoader(),
      userRepository: repository,
    });
    await reloadedStore.ensureLoaded();

    const story3 = [
      {
        sentence_id: 1,
        speaker: 'Hero',
        translation: 'Снова осмотрелся.',
        tokens: [{ surface: '見渡す', reading: 'みわたす' }],
      },
    ];

    const result3 = await resolveStoryTokens({
      story: story3,
      dictionaryStore: reloadedStore,
      userDictionaryRepository: repository,
      aiLexicalProvider: aiProvider,
    });

    expect(aiCalls).toBe(1); // Still 0 AI calls after store reload
    expect(result3.statistics.userAiHits).toBe(1);
    expect(result3.story[0].tokens[0].dictionaryId).toBe('user-word:見渡す:みわたす');
  });
});
