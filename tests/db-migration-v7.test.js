import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DB_NAME, DB_VERSION, IndexedDBWrapper, STORES } from '../src/db.js';

const defer = (cb) => Promise.resolve().then(cb);

function createMockIDB({ initialVersion = 6, hasItemIdIndex = false } = {}) {
  const storesMap = new Map();

  const initStore = (name, keyPath, autoIncrement = false) => {
    storesMap.set(name, {
      options: { keyPath, autoIncrement },
      indexes: new Map(),
      records: [],
      nextId: 1,
    });
  };

  initStore(STORES.APP_STATE, 'id');
  initStore(STORES.CONTENT_CACHE, 'key');
  initStore(STORES.UI_PREFERENCES, 'key');
  initStore(STORES.ACTIVE_SESSION, 'id');

  const dictStore = { options: { keyPath: 'id' }, indexes: new Map(), records: [], nextId: 1 };
  dictStore.indexes.set('updatedAt', { keyPath: 'updatedAt', options: { unique: false } });
  storesMap.set(STORES.USER_DICTIONARIES, dictStore);

  const entryStore = { options: { keyPath: 'id' }, indexes: new Map(), records: [], nextId: 1 };
  entryStore.indexes.set('dictionaryId', { keyPath: 'dictionaryId', options: { unique: false } });
  entryStore.indexes.set('dictionaryId_entryKey', {
    keyPath: ['dictionaryId', 'entryKey'],
    options: { unique: false },
  });
  entryStore.indexes.set('learningEnabled', {
    keyPath: 'learningEnabled',
    options: { unique: false },
  });
  storesMap.set(STORES.USER_DICTIONARY_ENTRIES, entryStore);

  const profileStore = { options: { keyPath: 'id' }, indexes: new Map(), records: [], nextId: 1 };
  profileStore.indexes.set('name', { keyPath: 'name', options: { unique: false } });
  storesMap.set(STORES.USER_DICTIONARY_IMPORT_PROFILES, profileStore);

  const reviewLogStore = {
    options: { keyPath: 'id', autoIncrement: true },
    indexes: new Map(),
    records: [],
    nextId: 1,
  };
  reviewLogStore.indexes.set('cardId', { keyPath: 'cardId', options: { unique: false } });
  reviewLogStore.indexes.set('timestamp', { keyPath: 'timestamp', options: { unique: false } });
  reviewLogStore.indexes.set('reviewedAt', { keyPath: 'reviewedAt', options: { unique: false } });
  reviewLogStore.indexes.set('cardId_timestamp', {
    keyPath: ['cardId', 'timestamp'],
    options: { unique: false },
  });
  reviewLogStore.indexes.set('cardId_reviewedAt', {
    keyPath: ['cardId', 'reviewedAt'],
    options: { unique: false },
  });
  reviewLogStore.indexes.set('eventId', { keyPath: 'eventId', options: { unique: true } });

  if (hasItemIdIndex) {
    reviewLogStore.indexes.set('itemId', { keyPath: 'itemId', options: { unique: false } });
  }

  storesMap.set(STORES.REVIEW_LOG, reviewLogStore);

  let currentVersion = initialVersion;

  const db = {
    objectStoreNames: {
      contains: (name) => storesMap.has(name),
    },
    transaction(storeNames) {
      let aborted = false;
      let activeRequests = 0;
      let hasStarted = false;

      const storeSnapshots = new Map(
        [...storesMap].map(([name, store]) => [name, [...store.records]])
      );

      const tx = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        abort: vi.fn(() => {
          if (aborted) return;
          aborted = true;
          for (const [name, recordsSnapshot] of storeSnapshots) {
            storesMap.get(name).records = [...recordsSnapshot];
          }
          defer(() => tx.onabort?.());
        }),
      };

      const checkComplete = () => {
        if (hasStarted && activeRequests === 0 && !aborted) {
          defer(() => {
            if (activeRequests === 0 && !aborted) {
              tx.oncomplete?.();
            }
          });
        }
      };

      const track = (fn) => {
        hasStarted = true;
        activeRequests++;
        defer(() => {
          try {
            fn();
          } finally {
            activeRequests--;
            checkComplete();
          }
        });
      };

      tx.objectStore = (targetName) => {
        const storeDef = storesMap.get(targetName);
        if (!storeDef) throw new Error(`Store not found: ${targetName}`);

        return {
          indexNames: {
            contains: (idxName) => storeDef.indexes.has(idxName),
          },
          createIndex(idxName, keyPath, options) {
            storeDef.indexes.set(idxName, { keyPath, options });
          },
          get(key) {
            const req = { result: undefined, error: null };
            track(() => {
              const kp = storeDef.options.keyPath;
              req.result = storeDef.records.find((r) => r[kp] === key);
              req.onsuccess?.();
            });
            return req;
          },
          put(value) {
            const req = { result: undefined, error: null };
            track(() => {
              if (aborted) return;
              const kp = storeDef.options.keyPath;
              const key = value[kp];
              const idx = storeDef.records.findIndex((r) => r[kp] === key);
              if (idx >= 0) storeDef.records[idx] = { ...value };
              else storeDef.records.push({ ...value });
              req.result = key;
              req.onsuccess?.();
            });
            return req;
          },
          delete(key) {
            const req = { error: null };
            track(() => {
              if (aborted) return;
              const kp = storeDef.options.keyPath;
              storeDef.records = storeDef.records.filter((r) => r[kp] !== key);
              req.onsuccess?.();
            });
            return req;
          },
          openCursor() {
            const req = { result: null, error: null };
            track(() => {
              if (aborted) return;
              let idx = 0;
              const records = [...storeDef.records];
              const step = () => {
                if (idx >= records.length || aborted) {
                  req.result = null;
                  req.onsuccess?.({ target: req });
                  return;
                }
                const currentRecord = records[idx];
                req.result = {
                  value: currentRecord,
                  delete() {
                    const delReq = { error: null };
                    storeDef.records = storeDef.records.filter((r) => r !== currentRecord);
                    track(() => delReq.onsuccess?.({ target: delReq }));
                    return delReq;
                  },
                  continue() {
                    idx++;
                    track(step);
                  },
                };
                req.onsuccess?.({ target: req });
              };
              step();
            });
            return req;
          },
          index(idxName) {
            const idxDef = storeDef.indexes.get(idxName);
            if (!idxDef) throw new Error(`Index not found: ${idxName}`);
            return {
              openCursor(range) {
                const req = { result: null, error: null };
                track(() => {
                  if (aborted) return;
                  const targetKey =
                    range && typeof range === 'object' && 'lower' in range ? range.lower : range;
                  const matchingRecords = storeDef.records.filter(
                    (r) => r[idxDef.keyPath] === targetKey
                  );
                  let idx = 0;
                  const step = () => {
                    if (idx >= matchingRecords.length || aborted) {
                      req.result = null;
                      req.onsuccess?.({ target: req });
                      return;
                    }
                    const currentRecord = matchingRecords[idx];
                    req.result = {
                      value: currentRecord,
                      delete() {
                        const delReq = { error: null };
                        storeDef.records = storeDef.records.filter((r) => r !== currentRecord);
                        track(() => delReq.onsuccess?.({ target: delReq }));
                        return delReq;
                      },
                      continue() {
                        idx++;
                        track(step);
                      },
                    };
                    req.onsuccess?.({ target: req });
                  };
                  step();
                });
                return req;
              },
            };
          },
        };
      };

      defer(() => {
        hasStarted = true;
        checkComplete();
      });

      return tx;
    },
  };

  const factory = {
    open: vi.fn((name, version) => {
      const request = {
        result: db,
        error: null,
        transaction: {
          objectStore(targetName) {
            return db.transaction(targetName).objectStore(targetName);
          },
        },
      };

      defer(() => {
        if (version > currentVersion) {
          request.onupgradeneeded?.({
            target: request,
            oldVersion: currentVersion,
            newVersion: version,
          });
          currentVersion = version;
        }
        request.onsuccess?.();
      });

      return request;
    }),
  };

  return { factory, db, storesMap };
}

describe('IndexedDB v6 -> v7 migration and review log cleanup fallback', () => {
  let mockEnv;
  let originalIndexedDB;

  beforeEach(() => {
    originalIndexedDB = window.indexedDB;
  });

  afterEach(() => {
    window.indexedDB = originalIndexedDB;
    vi.restoreAllMocks();
  });

  it('migrates existing v6 database to v7, adding review_log.itemId index while preserving all data', async () => {
    mockEnv = createMockIDB({ initialVersion: 6, hasItemIdIndex: false });
    window.indexedDB = mockEnv.factory;

    // Seed v6 database with existing state and entries
    const appStateStore = mockEnv.storesMap.get(STORES.APP_STATE);
    appStateStore.records.push({ id: 'state', value: { version: 13, xp: 100 } });

    const dictStore = mockEnv.storesMap.get(STORES.USER_DICTIONARIES);
    dictStore.records.push({ id: 'user-dict:1', name: 'My Vocab', updatedAt: Date.now() });

    const entryStore = mockEnv.storesMap.get(STORES.USER_DICTIONARY_ENTRIES);
    entryStore.records.push({
      id: 'user-word:100',
      dictionaryId: 'user-dict:1',
      writing: '猫',
      reading: 'ねこ',
      meanings: ['кошка'],
    });

    const reviewLogStore = mockEnv.storesMap.get(STORES.REVIEW_LOG);
    reviewLogStore.records.push(
      {
        id: 1,
        eventId: 'evt-1',
        itemId: 'user-word:100',
        cardId: 'user-word:100',
        reviewedAt: 1000,
      },
      {
        id: 2,
        cardId: 'user-word:100::recall',
        timestamp: 1001,
        quality: 4,
        previousStability: 1,
        previousDifficulty: 5,
        previousState: 1,
      },
      {
        id: 3,
        eventId: 'evt-3',
        itemId: 'built-in:L1_V001',
        cardId: 'built-in:L1_V001',
        reviewedAt: 1002,
      }
    );

    expect(reviewLogStore.indexes.has('itemId')).toBe(false);

    const wrapper = new IndexedDBWrapper();
    await wrapper.initDB();

    expect(mockEnv.factory.open).toHaveBeenCalledWith(DB_NAME, 7);
    expect(reviewLogStore.indexes.has('itemId')).toBe(true);

    // Verify all existing records remain intact
    expect(appStateStore.records.find((r) => r.id === 'state' || r.key === 'state')).toBeDefined();
    expect(dictStore.records).toHaveLength(1);
    expect(entryStore.records).toHaveLength(1);
    expect(reviewLogStore.records).toHaveLength(3);

    // Verify post-migration atomic deletion uses index and clears matching review logs (both modern & legacy)
    await wrapper.atomicDictionaryCommit({
      deleteEntryIds: ['user-word:100'],
      state: { version: 13, xp: 100 },
    });

    expect(entryStore.records).toHaveLength(0);
    expect(reviewLogStore.records).toHaveLength(1);
    expect(reviewLogStore.records[0].itemId).toBe('built-in:L1_V001');
  });

  it('safely falls back to full cursor when review_log.itemId index is missing', async () => {
    mockEnv = createMockIDB({ initialVersion: 7, hasItemIdIndex: false });
    window.indexedDB = mockEnv.factory;

    const entryStore = mockEnv.storesMap.get(STORES.USER_DICTIONARY_ENTRIES);
    entryStore.records.push({ id: 'user-word:1', dictionaryId: 'user-dict:1', writing: '猫' });

    const reviewLogStore = mockEnv.storesMap.get(STORES.REVIEW_LOG);
    reviewLogStore.records.push(
      { id: 1, itemId: 'user-word:1', cardId: 'user-word:1', reviewedAt: 100 },
      {
        id: 2,
        cardId: 'user-word:1',
        timestamp: 200,
        quality: 4,
        previousStability: 1,
        previousDifficulty: 5,
        previousState: 1,
      },
      {
        id: 3,
        cardId: 'user-word:1::recall',
        timestamp: 300,
        quality: 3,
        previousStability: 1,
        previousDifficulty: 5,
        previousState: 1,
      },
      {
        id: 4,
        cardId: 'user-word:10',
        timestamp: 400,
        quality: 4,
        previousStability: 1,
        previousDifficulty: 5,
        previousState: 1,
      },
      { id: 5, itemId: 'user-word:2', cardId: 'user-word:2', reviewedAt: 500 },
      { id: 6, itemId: 'built-in:L1_V001', cardId: 'built-in:L1_V001', reviewedAt: 600 }
    );

    const wrapper = new IndexedDBWrapper();
    await wrapper.initDB();

    expect(reviewLogStore.indexes.has('itemId')).toBe(false);

    await wrapper.atomicDictionaryCommit({
      deleteEntryIds: ['user-word:1'],
    });

    expect(entryStore.records).toHaveLength(0);
    // user-word:1 entries (1, 2, 3) should be deleted.
    // user-word:10 (record 4), user-word:2 (record 5), built-in (record 6) must remain.
    const remainingIds = reviewLogStore.records.map((r) => r.id);
    expect(remainingIds).toEqual([4, 5, 6]);
  });

  it('deletes whole dictionary atomically including review logs via fallback cursor', async () => {
    mockEnv = createMockIDB({ initialVersion: 7, hasItemIdIndex: false });
    window.indexedDB = mockEnv.factory;

    const dictStore = mockEnv.storesMap.get(STORES.USER_DICTIONARIES);
    dictStore.records.push({ id: 'user-dict:99', name: 'ToDelete' });

    const entryStore = mockEnv.storesMap.get(STORES.USER_DICTIONARY_ENTRIES);
    entryStore.records.push(
      { id: 'user-word:A', dictionaryId: 'user-dict:99' },
      { id: 'user-word:B', dictionaryId: 'user-dict:99' }
    );

    const reviewLogStore = mockEnv.storesMap.get(STORES.REVIEW_LOG);
    reviewLogStore.records.push(
      { id: 10, itemId: 'user-word:A', cardId: 'user-word:A' },
      {
        id: 11,
        cardId: 'user-word:B::recall',
        timestamp: 100,
        quality: 4,
        previousStability: 1,
        previousDifficulty: 5,
        previousState: 1,
      },
      { id: 12, itemId: 'user-word:C', cardId: 'user-word:C' }
    );

    const wrapper = new IndexedDBWrapper();
    await wrapper.initDB();

    await wrapper.atomicDeleteDictionary({
      dictionaryId: 'user-dict:99',
      entryIds: ['user-word:A', 'user-word:B'],
      state: { srs: {} },
    });

    expect(dictStore.records).toHaveLength(0);
    expect(entryStore.records).toHaveLength(0);
    expect(reviewLogStore.records.map((r) => r.id)).toEqual([12]);
  });

  it('aborts transaction and rejects promise when cursor operation fails', async () => {
    mockEnv = createMockIDB({ initialVersion: 7, hasItemIdIndex: false });
    window.indexedDB = mockEnv.factory;

    const entryStore = mockEnv.storesMap.get(STORES.USER_DICTIONARY_ENTRIES);
    entryStore.records.push({ id: 'user-word:err', dictionaryId: 'user-dict:1' });

    const reviewLogStore = mockEnv.storesMap.get(STORES.REVIEW_LOG);
    reviewLogStore.records.push({ id: 1, itemId: 'user-word:err', cardId: 'user-word:err' });

    const wrapper = new IndexedDBWrapper();
    await wrapper.initDB();

    // Mock store.openCursor error
    const origTx = wrapper.db.transaction.bind(wrapper.db);
    vi.spyOn(wrapper.db, 'transaction').mockImplementation((stores, mode) => {
      const tx = origTx(stores, mode);
      const origObjectStore = tx.objectStore.bind(tx);
      tx.objectStore = (storeName) => {
        const storeObj = origObjectStore(storeName);
        if (storeName === STORES.REVIEW_LOG) {
          storeObj.openCursor = () => {
            const req = { result: null, error: new Error('Cursor failed') };
            defer(() => req.onerror?.({ target: req }));
            return req;
          };
        }
        return storeObj;
      };
      return tx;
    });

    await expect(
      wrapper.atomicDictionaryCommit({
        deleteEntryIds: ['user-word:err'],
      })
    ).rejects.toThrow('Cursor failed');

    // Verify entry was not deleted due to transaction rollback
    expect(entryStore.records).toHaveLength(1);
    expect(reviewLogStore.records).toHaveLength(1);
  });
});
