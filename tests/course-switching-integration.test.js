import { beforeEach, describe, expect, it } from 'vitest';
import { initializeDB, STORES } from '../src/db.js';
import { DictionaryStore } from '../src/dictionary/dictionary-store.js';
import { UserDictionaryRepository } from '../src/user-dictionaries/repository.js';
import { resolveStoryTokens } from '../src/ai/story-token-resolver.js';

function createMockLoader() {
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

describe('Course Switching & Global Token Lookup Integration', () => {
  let repository;

  beforeEach(async () => {
    const database = await initializeDB();
    await database.clear(STORES.USER_DICTIONARIES);
    await database.clear(STORES.USER_DICTIONARY_ENTRIES);
    repository = new UserDictionaryRepository(database);
  });

  it('preserves AI dictionary entries across active course switches', async () => {
    const store = new DictionaryStore({
      loader: createMockLoader(),
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
              dictionaryForm: '散歩',
              reading: 'さんぽ',
              meanings: ['прогулка'],
              partOfSpeech: 'noun',
              tokenForms: ['散歩', 'さんぽ'],
              confidence: 0.9,
            },
          ],
        };
      },
    };

    // Story under Genki 1
    const storyGenki = [
      {
        sentence_id: 1,
        speaker: 'Hero',
        translation: 'Гуляю.',
        tokens: [{ surface: '散歩', reading: 'さんぽ' }],
      },
    ];

    const res1 = await resolveStoryTokens({
      story: storyGenki,
      dictionaryStore: store,
      userDictionaryRepository: repository,
      aiLexicalProvider: aiProvider,
      activeCourseId: 'genki-1',
    });

    expect(aiCalls).toBe(1);
    expect(res1.story[0].tokens[0].dictionaryId).toBe('user-word:散歩:さんぽ');

    // Switch active course to 'test-course'
    const res2 = await resolveStoryTokens({
      story: storyGenki,
      dictionaryStore: store,
      userDictionaryRepository: repository,
      aiLexicalProvider: aiProvider,
      activeCourseId: 'test-course',
    });

    expect(aiCalls).toBe(1); // 0 new AI calls!
    expect(res2.statistics.userAiHits).toBe(1);
    expect(res2.story[0].tokens[0].dictionaryId).toBe('user-word:散歩:さんぽ');

    // Switch active course back to 'genki-1'
    const res3 = await resolveStoryTokens({
      story: storyGenki,
      dictionaryStore: store,
      userDictionaryRepository: repository,
      aiLexicalProvider: aiProvider,
      activeCourseId: 'genki-1',
    });

    expect(aiCalls).toBe(1);
    expect(res3.statistics.userAiHits).toBe(1);
  });
});
