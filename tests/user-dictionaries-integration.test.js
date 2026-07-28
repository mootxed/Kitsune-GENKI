// tests/user-dictionaries-integration.test.js
import { beforeEach, describe, expect, it } from 'vitest';
import { initializeDB, STORES } from '../src/db.js';
import {
  createUserDictionaryModel,
  UserDictionaryRepository,
  createKnowledgeItemFromUserEntry,
} from '../src/user-dictionaries/index.js';
import {
  deleteUserEntriesWithProgress,
  deleteUserDictionaryWithProgress,
  setUserEntriesLearningEnabled,
  syncUserEntryCards,
  updateUserEntryWithSync,
} from '../src/user-dictionaries/learning-service.js';
import {
  createImportPreview,
  commitDictionaryImport,
  parseDictionaryJson,
} from '../src/dictionary-import/index.js';
import { createUserDictionaryExport } from '../src/user-dictionaries/export.js';
import { defaultState } from '../state/store.js';
import { normalizeUserDictionaryEntry } from '../src/user-dictionaries/normalize.js';
import { findIntraFileDuplicates } from '../src/user-dictionaries/duplicate-detector.js';

const TEST_DICT_ID = 'user-dict:test-dict-abc';

function makeEntry(overrides = {}) {
  return normalizeUserDictionaryEntry(
    {
      writing: '食べる',
      reading: 'たべる',
      meanings: ['есть', 'кушать'],
      ...overrides,
    },
    { dictionaryId: TEST_DICT_ID, sourceType: 'manual' }
  );
}

function makeState() {
  return { ...defaultState(), srs: {} };
}

// --------------------------------------------------------------------------
// #1: translation в knowledge item
// --------------------------------------------------------------------------

describe('knowledge-item-adapter: translation field', () => {
  it('exposes translation equal to russian for card-mode compatibility', () => {
    const entry = makeEntry();
    const item = createKnowledgeItemFromUserEntry(entry);
    expect(item.translation).toBeDefined();
    expect(item.translation).toBe(item.russian);
    expect(item.translation).toBe('есть; кушать');
  });

  it('includes writing in kanji and reading in kana fields', () => {
    const entry = makeEntry();
    const item = createKnowledgeItemFromUserEntry(entry);
    expect(item.kanji).toBe('食べる');
    expect(item.kana).toBe('たべる');
  });

  it('works for entry without writing (kana-only)', () => {
    const entry = makeEntry({ writing: '', reading: 'こんにちは', meanings: ['привет'] });
    const item = createKnowledgeItemFromUserEntry(entry);
    expect(item.translation).toBe('привет');
    expect(item.russian).toBe('привет');
  });
});

// --------------------------------------------------------------------------
// #2: Удаление suspended-записи очищает прогресс
// --------------------------------------------------------------------------

describe('deleteUserEntriesWithProgress: cleans up suspended entries', () => {
  let database;
  let repository;

  beforeEach(async () => {
    database = await initializeDB();
    for (const store of [STORES.USER_DICTIONARIES, STORES.USER_DICTIONARY_ENTRIES]) {
      await database.clear(store);
    }
    repository = new UserDictionaryRepository(database);
  });

  it('removes SRS cards even when learningEnabled is false (suspended)', async () => {
    const dict = await repository.saveDictionary({ name: 'Test' });
    const entry = await repository.saveEntry({
      dictionaryId: dict.id,
      writing: '猫',
      meanings: ['кошка'],
      source: { type: 'manual', label: '', externalId: null },
    });

    let state = makeState();
    const enableResult = await setUserEntriesLearningEnabled({
      repository,
      entries: [{ ...entry, learningEnabled: false }],
      enabled: true,
      state,
    });
    Object.assign(state, enableResult.state);
    expect(Object.keys(state.srs).length).toBeGreaterThan(0);

    const disableResult = await setUserEntriesLearningEnabled({
      repository,
      entries: [enableResult.entries[0]],
      enabled: false,
      state,
    });
    Object.assign(state, disableResult.state);

    const cardIds = Object.keys(state.srs).filter((id) => state.srs[id].itemId === entry.id);
    expect(cardIds.length).toBeGreaterThan(0);
    expect(cardIds.every((id) => state.srs[id].suspended)).toBe(true);

    const result = await deleteUserEntriesWithProgress({
      repository,
      entries: [disableResult.entries[0]],
      state,
    });
    const remaining = Object.keys(result.state.srs).filter(
      (id) => result.state.srs[id].itemId === entry.id
    );
    expect(remaining).toHaveLength(0);
    expect(await repository.listEntries(dict.id)).toHaveLength(0);
  });

  it('removes dictionary and all entry SRS cards in one operation', async () => {
    const dict = await repository.saveDictionary({ name: 'Весь словарь' });
    let state = makeState();
    const rawEntries = [];
    for (const writing of ['猫', '犬', '鳥']) {
      rawEntries.push(
        await repository.saveEntry({
          dictionaryId: dict.id,
          writing,
          meanings: ['перевод'],
          source: { type: 'manual', label: '', externalId: null },
        })
      );
    }
    const enableResult = await setUserEntriesLearningEnabled({
      repository,
      entries: rawEntries.map((e) => ({ ...e, learningEnabled: false })),
      enabled: true,
      state,
    });
    Object.assign(state, enableResult.state);
    expect(Object.keys(state.srs).length).toBeGreaterThan(0);

    const result = await deleteUserDictionaryWithProgress({
      repository,
      dictionaryId: dict.id,
      entries: enableResult.entries,
      state,
    });

    expect(Object.keys(result.state.srs)).toHaveLength(0);
    expect(await repository.listDictionaries()).toHaveLength(0);
  });
});

// --------------------------------------------------------------------------
// #3: Strict KotoKitsu round-trip
// --------------------------------------------------------------------------

describe('strict KotoKitsu import round-trip', () => {
  let database;
  let repository;

  beforeEach(async () => {
    database = await initializeDB();
    for (const store of [STORES.USER_DICTIONARIES, STORES.USER_DICTIONARY_ENTRIES]) {
      await database.clear(store);
    }
    repository = new UserDictionaryRepository(database);
  });

  it('imports exported dictionary without field loss and with fresh IDs', async () => {
    const dict = await repository.saveDictionary({ name: 'Японский базовый' });
    await repository.saveEntry({
      dictionaryId: dict.id,
      writing: 'Tシャツ',
      reading: '',
      meanings: ['футболка'],
      tags: ['одежда'],
      source: { type: 'manual', label: '', externalId: null },
    });
    await repository.saveEntry({
      dictionaryId: dict.id,
      writing: '食べる',
      reading: 'たべる',
      meanings: ['есть'],
      source: { type: 'manual', label: '', externalId: null },
    });

    const entries = await repository.listEntries(dict.id);
    // createUserDictionaryExport принимает (dictionary, entries) позиционно
    const exported = createUserDictionaryExport(dict, entries);
    const exportedJson = JSON.stringify(exported);

    const parsedJson = parseDictionaryJson(exportedJson);
    expect(parsedJson.isStrict).toBe(true);
    expect(parsedJson.records.length).toBe(2);

    const newDict = createUserDictionaryModel({ name: 'Импортированный', sourceType: 'import' });
    const preview = createImportPreview({
      records: parsedJson.records,
      mapping: {},
      options: { dictionaryId: newDict.id },
      isStrict: true,
    });

    expect(preview.isStrict).toBe(true);
    expect(preview.ready).toBe(2);

    await commitDictionaryImport({
      repository,
      dictionary: newDict,
      preview,
      learningMode: 'dictionary-only',
      state: defaultState(),
    });

    const importedEntries = await repository.listEntries(newDict.id);
    expect(importedEntries).toHaveLength(2);
    const tShirt = importedEntries.find((e) => e.writing === 'Tシャツ');
    expect(tShirt).toBeDefined();
    expect(tShirt.meanings).toEqual(['футболка']);
    expect(tShirt.tags).toEqual(['одежда']);

    // ID должны быть новыми
    const originalIds = new Set(entries.map((e) => e.id));
    for (const ie of importedEntries) {
      expect(originalIds.has(ie.id)).toBe(false);
    }
  });
});

// --------------------------------------------------------------------------
// #4: Intra-file дубликаты
// --------------------------------------------------------------------------

describe('intra-file duplicate detection', () => {
  it('detects identical entryKey within a single import batch', () => {
    const e1 = makeEntry({ writing: '猫', reading: 'ねこ', meanings: ['кошка'] });
    const e2 = makeEntry({ writing: '猫', reading: 'ねこ', meanings: ['кот'] });
    const e3 = makeEntry({ writing: '犬', reading: 'いぬ', meanings: ['собака'] });

    const dups = findIntraFileDuplicates([e1, e2, e3]);
    expect(dups).toHaveLength(1);
    expect(dups[0].first.meanings).toEqual(['кошка']);
    expect(dups[0].duplicate.meanings).toEqual(['кот']);
  });

  it('normalises katakana/hiragana for entryKey comparison', () => {
    const e1 = makeEntry({ writing: 'ねこ', reading: 'ねこ', meanings: ['кошка'] });
    const e2 = makeEntry({ writing: 'ネコ', reading: 'ネコ', meanings: ['кот'] });
    // Обе нормализуются к одному ключу
    const dups = findIntraFileDuplicates([e1, e2]);
    expect(dups).toHaveLength(1);
  });

  it('creates import preview with intraFileDuplicateCount', () => {
    const records = [
      { value: { word: '猫', reading: 'ねこ', meaning: 'кошка' }, sourceIndex: 1 },
      { value: { word: '猫', reading: 'ねこ', meaning: 'кот' }, sourceIndex: 2 },
      { value: { word: '犬', reading: 'いぬ', meaning: 'собака' }, sourceIndex: 3 },
    ];
    // dictionaryId должен соответствовать шаблону user-dict:... минимум 8 символов
    const preview = createImportPreview({
      records,
      mapping: { writing: 'word', reading: 'reading', meanings: 'meaning' },
      options: { dictionaryId: 'user-dict:test-dict-001' },
    });

    expect(preview.intraFileDuplicateCount).toBe(1);
    expect(preview.intraFileDuplicates).toHaveLength(1);
  });

  it('skips intra-file duplicates by default in commit', async () => {
    const database2 = await initializeDB();
    await database2.clear(STORES.USER_DICTIONARIES);
    await database2.clear(STORES.USER_DICTIONARY_ENTRIES);
    const repo2 = new UserDictionaryRepository(database2);

    const dict = createUserDictionaryModel({ name: 'Повторы' });
    const records = [
      { value: { word: '猫', meaning: 'кошка' }, sourceIndex: 1 },
      { value: { word: '猫', meaning: 'кот' }, sourceIndex: 2 },
    ];
    const preview = createImportPreview({
      records,
      mapping: { writing: 'word', meanings: 'meaning' },
      options: { dictionaryId: dict.id },
    });
    const result = await commitDictionaryImport({
      repository: repo2,
      dictionary: dict,
      preview,
      conflictStrategy: 'skip',
      state: defaultState(),
    });

    expect(result.imported).toBe(1);
    const imported = await repo2.listEntries(dict.id);
    expect(imported).toHaveLength(1);
    expect(imported[0].meanings).toEqual(['кошка']);
  });
});

// --------------------------------------------------------------------------
// #7: Reconcile capabilities
// --------------------------------------------------------------------------

describe('syncUserEntryCards: capability reconcile', () => {
  // Разделитель в cardId — '::' (CARD_SEPARATOR из knowledge-model.js)
  // Навык READING_WRITING = 'reading-writing'
  const CARD_SEP = '::';

  it('suspends cards for removed capabilities with suspendedReason capability-removed', () => {
    const entryWithKanji = makeEntry({
      writing: '食べる',
      reading: 'たべる',
      meanings: ['есть'],
      learningEnabled: true,
    });

    const state = makeState();
    // Симулируем уже существующую карточку reading-writing с правильным CARD_SEPARATOR
    const drawingCardId = `${entryWithKanji.id}${CARD_SEP}reading-writing`;
    state.srs[drawingCardId] = {
      id: drawingCardId,
      itemId: entryWithKanji.id,
      skill: 'reading-writing',
      suspended: false,
    };

    // Убираем кандзи — capability drawing/reading-writing исчезает
    const kanaEntry = makeEntry({
      ...entryWithKanji,
      writing: '',
      reading: 'たべる',
      learningEnabled: true,
    });

    syncUserEntryCards(kanaEntry, state);

    expect(state.srs[drawingCardId].suspended).toBe(true);
    expect(state.srs[drawingCardId].suspendedReason).toBe('capability-removed');
  });

  it('restores capability-removed card when capability is regained', () => {
    const entryWithKanji = makeEntry({
      writing: '食べる',
      reading: 'たべる',
      meanings: ['есть'],
      learningEnabled: true,
    });

    const state = makeState();
    const drawingCardId = `${entryWithKanji.id}${CARD_SEP}reading-writing`;
    // Карточка была suspended по capability-removed
    state.srs[drawingCardId] = {
      id: drawingCardId,
      itemId: entryWithKanji.id,
      skill: 'reading-writing',
      suspended: true,
      suspendedReason: 'capability-removed',
    };

    // Кандзи вернули — возобновляем
    syncUserEntryCards(entryWithKanji, state);

    expect(state.srs[drawingCardId].suspended).toBe(false);
    expect(state.srs[drawingCardId].suspendedReason).toBeUndefined();
  });

  it('does not restore learning-disabled suspended card during capability reconcile', () => {
    const entry = makeEntry({
      writing: '食べる',
      reading: 'たべる',
      meanings: ['есть'],
      learningEnabled: true,
    });

    const state = makeState();
    // recognition для user-word — это сам entry.id (без суффикса для recognition)
    const recognitionCardId = entry.id;
    state.srs[recognitionCardId] = {
      id: recognitionCardId,
      itemId: entry.id,
      skill: 'recognition',
      suspended: true,
      suspendedReason: 'learning-disabled',
    };

    syncUserEntryCards(entry, state);

    // Не должна восстанавливаться автоматически
    expect(state.srs[recognitionCardId].suspended).toBe(true);
    expect(state.srs[recognitionCardId].suspendedReason).toBe('learning-disabled');
  });
});

// --------------------------------------------------------------------------
// #9: Допустимые варианты writing
// --------------------------------------------------------------------------

describe('writing validation: allows mixed scripts', () => {
  it('allows Latin + Japanese mixed writing', () => {
    expect(() => makeEntry({ writing: 'Tシャツ', meanings: ['футболка'] })).not.toThrow();
    expect(() => makeEntry({ writing: '3つ', meanings: ['3 штуки'] })).not.toThrow();
    expect(() => makeEntry({ writing: 'A型', meanings: ['группа крови A'] })).not.toThrow();
    expect(() => makeEntry({ writing: 'iPhone', meanings: ['смартфон'] })).not.toThrow();
  });

  it('rejects control characters in writing', () => {
    expect(() => makeEntry({ writing: '猫\u0000犬', meanings: ['тест'] })).toThrow(
      'Написание не может содержать управляющие символы'
    );
  });

  it('still validates reading as Japanese-only', () => {
    expect(() => makeEntry({ reading: 'english' })).toThrow('Ожидался японский текст');
    expect(() => makeEntry({ reading: 'たべる' })).not.toThrow();
  });
});

// --------------------------------------------------------------------------
// #6: updateUserEntryWithSync — атомарное обновление
// --------------------------------------------------------------------------

describe('updateUserEntryWithSync: atomic edit', () => {
  let database;
  let repository;

  beforeEach(async () => {
    database = await initializeDB();
    for (const store of [STORES.USER_DICTIONARIES, STORES.USER_DICTIONARY_ENTRIES]) {
      await database.clear(store);
    }
    repository = new UserDictionaryRepository(database);
  });

  it('updates entry and SRS state atomically without resetting progress', async () => {
    const dict = await repository.saveDictionary({ name: 'Test' });
    const rawEntry = await repository.saveEntry({
      dictionaryId: dict.id,
      writing: '猫',
      reading: 'ねこ',
      meanings: ['кошка'],
      source: { type: 'manual', label: '', externalId: null },
    });

    let state = makeState();
    const enableResult = await setUserEntriesLearningEnabled({
      repository,
      entries: [{ ...rawEntry, learningEnabled: false }],
      enabled: true,
      state,
    });
    Object.assign(state, enableResult.state);
    const cardsBefore = Object.keys(state.srs).filter((id) => state.srs[id].itemId === rawEntry.id);
    expect(cardsBefore.length).toBeGreaterThan(0);

    const updatedEntry = { ...enableResult.entries[0], meanings: ['кошка', 'кот'] };
    const result = await updateUserEntryWithSync({ repository, entry: updatedEntry, state });

    const cardsAfter = Object.keys(result.state.srs).filter(
      (id) => result.state.srs[id].itemId === rawEntry.id
    );
    expect(cardsAfter.length).toBeGreaterThanOrEqual(cardsBefore.length);

    const dbEntries = await repository.listEntries(dict.id);
    expect(dbEntries[0].meanings).toEqual(['кошка', 'кот']);
    expect(dbEntries[0].id).toBe(rawEntry.id);
  });
});

// --------------------------------------------------------------------------
// Дополнительные тесты ревью
// --------------------------------------------------------------------------

describe('strict import: respects dictionary-only learningMode even when file entries have learningEnabled: true', () => {
  let database;
  let repository;

  beforeEach(async () => {
    database = await initializeDB();
    for (const store of [STORES.USER_DICTIONARIES, STORES.USER_DICTIONARY_ENTRIES]) {
      await database.clear(store);
    }
    repository = new UserDictionaryRepository(database);
  });

  it('sets learningEnabled: false for imported entries when learningMode is dictionary-only', async () => {
    const dict = await repository.saveDictionary({ name: 'Обучение' });
    const rawEntry = await repository.saveEntry({
      dictionaryId: dict.id,
      writing: '食べる',
      reading: 'たべる',
      meanings: ['есть'],
      source: { type: 'manual', label: '', externalId: null },
    });

    // Экспортируем словарь с записью, имеющей learningEnabled: true
    const enabledEntry = { ...rawEntry, learningEnabled: true };
    const exported = createUserDictionaryExport(dict, [enabledEntry]);
    const exportedJson = JSON.stringify(exported);

    const parsedJson = parseDictionaryJson(exportedJson);
    const newDict = createUserDictionaryModel({ name: 'Новый', sourceType: 'import' });
    const preview = createImportPreview({
      records: parsedJson.records,
      mapping: {},
      options: { dictionaryId: newDict.id },
      isStrict: true,
    });

    // Выбираем режим «Только импортировать в словарь»
    const state = makeState();
    const result = await commitDictionaryImport({
      repository,
      dictionary: newDict,
      preview,
      learningMode: 'dictionary-only',
      state,
    });

    const importedEntries = await repository.listEntries(newDict.id);
    expect(importedEntries).toHaveLength(1);
    expect(importedEntries[0].learningEnabled).toBe(false);
    expect(Object.keys(result.state?.srs || {})).toHaveLength(0);
  });
});

describe('parseDictionaryJson: collectionPath fallback & UserDictionaryExportSchema validation', () => {
  it('throws error when strict JSON schema is invalid', () => {
    const invalidStrictJson = JSON.stringify({
      format: 'kotokitsu-dictionary',
      schemaVersion: 1,
      // отсутствует dictionary и exportedAt
      entries: [{ id: 'user-word:12345678', writing: '猫' }],
    });
    expect(() => parseDictionaryJson(invalidStrictJson)).toThrow(
      'Некорректная структура строгого экспорта KotoKitsu'
    );
  });

  it('fallback gracefully when saved collectionPath is not in JSON file', () => {
    const jsonWithoutCustomPath = JSON.stringify({
      items: [{ word: '猫', meaning: 'кошка' }],
    });
    const savedPath = 'non_existent_path';

    let parsed;
    let warning = null;
    try {
      parsed = parseDictionaryJson(jsonWithoutCustomPath, { collectionPath: savedPath });
    } catch {
      parsed = parseDictionaryJson(jsonWithoutCustomPath);
      warning = 'Путь коллекции не найден';
    }

    expect(parsed).toBeDefined();
    expect(parsed.records).toHaveLength(1);
    expect(warning).not.toBeNull();
  });
});

describe('intra-file duplicate merge and replace strategies', () => {
  let database;
  let repository;

  beforeEach(async () => {
    database = await initializeDB();
    for (const store of [STORES.USER_DICTIONARIES, STORES.USER_DICTIONARY_ENTRIES]) {
      await database.clear(store);
    }
    repository = new UserDictionaryRepository(database);
  });

  it('merges intra-file duplicates when strategy is merge', async () => {
    const dict = createUserDictionaryModel({ name: 'Мердж повторов' });
    const records = [
      { value: { word: '猫', reading: 'ねこ', meaning: 'кошка' }, sourceIndex: 1 },
      { value: { word: '猫', reading: 'ねこ', meaning: 'кот' }, sourceIndex: 2 },
    ];
    const preview = createImportPreview({
      records,
      mapping: { writing: 'word', reading: 'reading', meanings: 'meaning' },
      options: { dictionaryId: dict.id },
    });

    await commitDictionaryImport({
      repository,
      dictionary: dict,
      preview,
      conflictStrategy: 'merge',
      state: defaultState(),
    });

    const entries = await repository.listEntries(dict.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].meanings).toEqual(['кошка', 'кот']);
  });

  it('replaces intra-file duplicate with second entry when strategy is replace', async () => {
    const dict = createUserDictionaryModel({ name: 'Замена повторов' });
    const records = [
      { value: { word: '猫', reading: 'ねこ', meaning: 'кошка' }, sourceIndex: 1 },
      { value: { word: '猫', reading: 'ねこ', meaning: 'кот' }, sourceIndex: 2 },
    ];
    const preview = createImportPreview({
      records,
      mapping: { writing: 'word', reading: 'reading', meanings: 'meaning' },
      options: { dictionaryId: dict.id },
    });

    await commitDictionaryImport({
      repository,
      dictionary: dict,
      preview,
      conflictStrategy: 'replace',
      state: defaultState(),
    });

    const entries = await repository.listEntries(dict.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].meanings).toEqual(['кот']);
  });
});

describe('review 3 fixes: REVIEW_LOG deletion, separate strategy learningMode, multi-merge accumulation, and suspendedReason', () => {
  let database;
  let repository;

  beforeEach(async () => {
    database = await initializeDB();
    for (const store of [
      STORES.USER_DICTIONARIES,
      STORES.USER_DICTIONARY_ENTRIES,
      STORES.REVIEW_LOG,
    ]) {
      await database.clear(store);
    }
    repository = new UserDictionaryRepository(database);
  });

  it('atomically deletes REVIEW_LOG entries when user entry is deleted', async () => {
    const dict = await repository.saveDictionary({ name: 'ReviewLog Test' });
    const entry = await repository.saveEntry({
      dictionaryId: dict.id,
      writing: '猫',
      reading: 'ねこ',
      meanings: ['кошка'],
      source: { type: 'manual', label: '', externalId: null },
    });

    // Добавляем тестовую запись в REVIEW_LOG
    await database.putRecord(STORES.REVIEW_LOG, {
      id: 'log-1',
      cardId: entry.id,
      itemId: entry.id,
      timestamp: Date.now(),
      reviewedAt: Date.now(),
      effectiveRating: 3,
    });

    const logsBefore = await database.getAll(STORES.REVIEW_LOG);
    expect(logsBefore.filter((log) => log.itemId === entry.id)).toHaveLength(1);

    // Удаляем запись
    await deleteUserEntriesWithProgress({
      repository,
      entries: [entry],
      state: makeState(),
    });

    const logsAfter = await database.getAll(STORES.REVIEW_LOG);
    expect(logsAfter.filter((log) => log.itemId === entry.id)).toHaveLength(0);
  });

  it('sets learningEnabled: false for separate strategy when learningMode is dictionary-only and existing entry is enabled', async () => {
    const dict = await repository.saveDictionary({ name: 'Separate Test' });
    const existingEntry = await repository.saveEntry({
      dictionaryId: dict.id,
      writing: '猫',
      reading: 'ねこ',
      meanings: ['кошка'],
      source: { type: 'manual', label: '', externalId: null },
    });

    // Включаем обучение для существующей записи в БД
    const enableResult = await setUserEntriesLearningEnabled({
      repository,
      entries: [{ ...existingEntry, learningEnabled: false }],
      enabled: true,
      state: makeState(),
    });

    const records = [{ value: { word: '猫', reading: 'ねこ', meaning: 'кот' }, sourceIndex: 1 }];
    const preview = createImportPreview({
      records,
      mapping: { writing: 'word', reading: 'reading', meanings: 'meaning' },
      options: { dictionaryId: dict.id },
      existingEntries: [enableResult.entries[0]],
    });

    // Импортируем с separate и dictionary-only
    await commitDictionaryImport({
      repository,
      dictionary: dict,
      preview,
      conflictStrategy: 'separate',
      learningMode: 'dictionary-only',
      state: makeState(),
    });

    const entries = await repository.listEntries(dict.id);
    expect(entries).toHaveLength(2);
    const separateEntry = entries.find((e) => e.id !== existingEntry.id);
    expect(separateEntry).toBeDefined();
    // Новая отдельная запись должна быть с learningEnabled: false
    expect(separateEntry.learningEnabled).toBe(false);
  });

  it('accumulates multiple incoming merge conflicts without losing data', async () => {
    const dict = await repository.saveDictionary({ name: 'Multi-Merge Test' });
    const existingEntry = await repository.saveEntry({
      dictionaryId: dict.id,
      writing: '猫',
      reading: 'ねこ',
      meanings: ['кошка'],
      source: { type: 'manual', label: '', externalId: null },
    });

    const records = [
      { value: { word: '猫', reading: 'ねこ', meaning: 'кот' }, sourceIndex: 1 },
      { value: { word: '猫', reading: 'ねこ', meaning: 'кошечка' }, sourceIndex: 2 },
    ];
    const preview = createImportPreview({
      records,
      mapping: { writing: 'word', reading: 'reading', meanings: 'meaning' },
      options: { dictionaryId: dict.id },
      existingEntries: [existingEntry],
    });

    await commitDictionaryImport({
      repository,
      dictionary: dict,
      preview,
      conflictStrategy: 'merge',
      state: makeState(),
    });

    const entries = await repository.listEntries(dict.id);
    expect(entries).toHaveLength(1);
    // Все 3 значения (кошка из БД + кот из строки 1 + кошечка из строки 2) должны сохраниться!
    expect(entries[0].meanings).toEqual(['кошка', 'кот', 'кошечка']);
  });

  it('sets suspendedReason: learning-disabled when bulk disabling learning', async () => {
    const entry = makeEntry({ learningEnabled: true });
    const state = makeState();
    // Инициализируем карточки
    syncUserEntryCards(entry, state);
    const cardId = entry.id;
    expect(state.srs[cardId]).toBeDefined();

    // Отключаем обучение через setUserEntriesLearningEnabled
    const result = await setUserEntriesLearningEnabled({
      repository: { db: async () => ({ atomicDictionaryCommit: async () => {} }) },
      entries: [entry],
      enabled: false,
      state,
    });

    expect(result.state.srs[cardId].suspended).toBe(true);
    expect(result.state.srs[cardId].suspendedReason).toBe('learning-disabled');
  });
});
