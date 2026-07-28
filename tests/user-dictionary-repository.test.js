import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeDB, STORES } from '../src/db.js';
import {
  createUserDictionaryModel,
  UserDictionaryRepository,
} from '../src/user-dictionaries/index.js';
import { commitDictionaryImport, createImportPreview } from '../src/dictionary-import/index.js';
import { createImportProfile } from '../src/dictionary-import/import-profile.js';
import { defaultState } from '../state/store.js';

describe('UserDictionaryRepository and transactional import', () => {
  let database;
  let repository;

  beforeEach(async () => {
    database = await initializeDB();
    for (const store of [
      STORES.USER_DICTIONARIES,
      STORES.USER_DICTIONARY_ENTRIES,
      STORES.USER_DICTIONARY_IMPORT_PROFILES,
    ]) {
      await database.clear(store);
    }
    repository = new UserDictionaryRepository(database);
  });

  it('creates multiple dictionaries and indexes entries by dictionaryId', async () => {
    const first = await repository.saveDictionary({ name: 'Первый' });
    const second = await repository.saveDictionary({ name: 'Второй' });
    await repository.saveEntry({
      dictionaryId: first.id,
      writing: '猫',
      meanings: ['кошка'],
      source: { type: 'manual', label: '', externalId: null },
    });
    await repository.saveEntry({
      dictionaryId: second.id,
      writing: '犬',
      meanings: ['собака'],
      source: { type: 'manual', label: '', externalId: null },
    });
    expect(await repository.listDictionaries()).toHaveLength(2);
    expect((await repository.listEntries(first.id))[0].writing).toBe('猫');
    expect((await repository.listEntries(second.id))[0].writing).toBe('犬');
  });

  it('updates an entry while preserving id and createdAt', async () => {
    const dictionary = await repository.saveDictionary({ name: 'Редактирование' });
    const created = await repository.saveEntry({
      dictionaryId: dictionary.id,
      writing: '猫',
      meanings: ['кошка'],
      source: { type: 'manual', label: '', externalId: null },
    });
    const updated = await repository.saveEntry({ ...created, meanings: ['кот'] });
    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.meanings).toEqual(['кот']);
  });

  it('creates, edits and deletes import profiles', async () => {
    const profile = createImportProfile({
      name: 'Anki',
      format: 'csv',
      mapping: { writing: 'Expression', meanings: 'Meaning' },
      transforms: {},
    });
    await repository.saveProfile(profile);
    await repository.saveProfile({ ...profile, name: 'Anki edited', updatedAt: profile.updatedAt });
    expect((await repository.listProfiles())[0].name).toBe('Anki edited');
    await repository.deleteProfile(profile.id);
    expect(await repository.listProfiles()).toEqual([]);
  });

  it('imports dictionary-only without creating FSRS cards', async () => {
    const dictionary = createUserDictionaryModel({ name: 'CSV', sourceType: 'import' });
    const preview = createImportPreview({
      records: [{ value: { word: '猫', meaning: 'кошка' }, sourceIndex: 2 }],
      mapping: { writing: 'word', meanings: 'meaning' },
      options: { dictionaryId: dictionary.id },
    });
    const state = defaultState();
    const result = await commitDictionaryImport({
      repository,
      dictionary,
      preview,
      learningMode: 'dictionary-only',
      state,
    });
    expect(result.entries[0].learningEnabled).toBe(false);
    expect(Object.keys(result.state.srs)).toHaveLength(0);
  });

  it('creates only the initial recognition card after explicit learning confirmation', async () => {
    const dictionary = createUserDictionaryModel({ name: 'Учить', sourceType: 'import' });
    const preview = createImportPreview({
      records: [
        {
          value: { word: '食べる', reading: 'たべる', meaning: 'есть' },
          sourceIndex: 2,
        },
      ],
      mapping: { writing: 'word', reading: 'reading', meanings: 'meaning' },
      options: { dictionaryId: dictionary.id },
    });
    const result = await commitDictionaryImport({
      repository,
      dictionary,
      preview,
      learningMode: 'all',
      state: defaultState(),
    });
    expect(result.entries[0].learningEnabled).toBe(true);
    expect(Object.keys(result.state.srs)).toEqual([result.entries[0].id]);
  });

  it('does not duplicate an existing entry on repeated import with skip', async () => {
    const dictionary = await repository.saveDictionary({ name: 'Повтор' });
    await repository.saveEntry({
      dictionaryId: dictionary.id,
      writing: '猫',
      reading: 'ねこ',
      meanings: ['кошка'],
      source: { type: 'manual', label: '', externalId: null },
    });
    const preview = createImportPreview({
      records: [{ value: { word: '猫', reading: 'ねこ', meaning: 'кот' }, sourceIndex: 2 }],
      mapping: { writing: 'word', reading: 'reading', meanings: 'meaning' },
      options: { dictionaryId: dictionary.id },
      existingEntries: await repository.listEntries(dictionary.id),
    });
    await commitDictionaryImport({
      repository,
      dictionary,
      preview,
      conflictStrategy: 'skip',
      state: defaultState(),
    });
    expect(await repository.listEntries(dictionary.id)).toHaveLength(1);
  });

  it('leaves stores unchanged when the atomic commit rejects', async () => {
    const dictionary = await repository.saveDictionary({ name: 'До ошибки' });
    const preview = createImportPreview({
      records: [{ value: { word: '猫', meaning: 'кошка' }, sourceIndex: 2 }],
      mapping: { writing: 'word', meanings: 'meaning' },
      options: { dictionaryId: dictionary.id },
    });
    const originalCommit = database.atomicDictionaryCommit.bind(database);
    const spy = vi
      .spyOn(database, 'atomicDictionaryCommit')
      .mockRejectedValueOnce(new Error('transaction failed'));
    await expect(
      commitDictionaryImport({
        repository,
        dictionary,
        preview,
        state: defaultState(),
      })
    ).rejects.toThrow('transaction failed');
    expect(await repository.listEntries(dictionary.id)).toHaveLength(0);
    spy.mockRestore();
    database.atomicDictionaryCommit = originalCommit;
  });
});
