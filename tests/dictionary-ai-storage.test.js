import { beforeEach, describe, expect, it } from 'vitest';
import { initializeDB, STORES } from '../src/db.js';
import { normalizeDictionaryEntry } from '../src/dictionary/dictionary-contract.js';
import { DictionaryStore } from '../src/dictionary/dictionary-store.js';
import { UserDictionaryRepository } from '../src/user-dictionaries/repository.js';

const curated = normalizeDictionaryEntry({
  dictionaryForm: '食べる',
  reading: 'たべる',
  meanings: ['есть'],
  partOfSpeech: 'verb',
  verbClass: 'ichidan',
  tokenForms: ['食べる', 'たべる', '食べます'],
});

function builtinLoader() {
  return {
    async load() {
      return {
        manifest: { schemaVersion: 1, contentVersion: '1' },
        entries: [curated],
        tokenIndex: { 食べる: [curated.id], 食べます: [curated.id] },
        aliases: {},
      };
    },
  };
}

describe('global AI dictionary storage', () => {
  let repository;

  beforeEach(async () => {
    const database = await initializeDB();
    await database.clear(STORES.USER_DICTIONARIES);
    await database.clear(STORES.USER_DICTIONARY_ENTRIES);
    repository = new UserDictionaryRepository(database);
  });

  it('persists, reloads and deduplicates a stable global AI entry', async () => {
    const firstStore = new DictionaryStore({
      loader: builtinLoader(),
      userRepository: repository,
    });
    const first = await firstStore.registerUserDictionaryEntry({
      dictionaryForm: '見渡す',
      reading: 'みわたす',
      meanings: ['осматривать'],
      partOfSpeech: 'verb',
      verbClass: 'godan',
      tokenForms: ['見渡す', '見渡します'],
      confidence: 0.84,
    });
    const duplicate = await firstStore.registerUserDictionaryEntry({
      dictionaryForm: '見渡す',
      reading: 'みわたす',
      meanings: ['оглядывать'],
      partOfSpeech: 'verb',
      verbClass: 'godan',
      tokenForms: ['見渡す'],
    });
    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(duplicate.entry.id).toBe('user-word:見渡す:みわたす');
    expect(duplicate.entry.meanings).toEqual(['осматривать', 'оглядывать']);

    const reloadedStore = new DictionaryStore({
      loader: builtinLoader(),
      userRepository: repository,
    });
    await reloadedStore.ensureLoaded();
    expect(reloadedStore.getDictionaryEntry(first.entry.id)).toMatchObject({
      dictionaryForm: '見渡す',
      reading: 'みわたす',
      source: 'ai',
    });
    expect(reloadedStore.findDictionaryCandidatesByToken('見渡します').candidates).toContain(
      first.entry.id
    );
  });

  it('never overwrites a curated entry with AI data', async () => {
    const store = new DictionaryStore({
      loader: builtinLoader(),
      userRepository: repository,
    });
    const result = await store.registerUserDictionaryEntry({
      dictionaryForm: '食べる',
      reading: 'たべる',
      meanings: ['incorrect AI meaning'],
      partOfSpeech: 'verb',
      verbClass: 'ichidan',
    });
    expect(result).toMatchObject({
      created: false,
      conflict: 'curated-wins',
      entry: { id: curated.id, meanings: ['есть'] },
    });
    expect(await repository.listDictionaries()).toHaveLength(0);
  });
});
