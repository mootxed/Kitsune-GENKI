/* tests/active-session-db.test.js — Round-trip test for saving/loading active session in IndexedDB */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveSessionToDB,
  loadSessionFromDB,
  clearSessionFromDB,
  SessionManager,
} from '../session-manager.js';
import { db, initializeDB, STORES } from '../src/db.js';

const defer = (cb) => Promise.resolve().then(cb);

function createMockIndexedDB() {
  const storesMap = new Map();

  const initStore = (name, keyPath, autoIncrement = false) => {
    storesMap.set(name, {
      options: { keyPath, autoIncrement },
      records: [],
    });
  };

  initStore(STORES.APP_STATE, 'id');
  initStore(STORES.ACTIVE_SESSION, 'id');

  const mockDb = {
    objectStoreNames: {
      contains: (name) => storesMap.has(name),
    },
    transaction(_storeNames) {
      let activeRequests = 0;
      let hasStarted = false;

      const tx = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
      };

      const checkComplete = () => {
        if (hasStarted && activeRequests === 0) {
          defer(() => {
            if (activeRequests === 0) {
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
          get(key) {
            const req = { result: undefined, error: null };
            track(() => {
              const kp = storeDef.options.keyPath || 'key';
              req.result = storeDef.records.find((r) => r[kp] === key);
              req.onsuccess?.({ target: req });
            });
            return req;
          },
          put(value) {
            const req = { result: undefined, error: null };
            track(() => {
              const kp = storeDef.options.keyPath || 'key';
              if (kp && !value[kp]) {
                const DOMEx = globalThis.DOMException || Error;
                const err = new DOMEx(
                  "Evaluating the object store's key path did not yield a value.",
                  'DataError'
                );
                req.error = err;
                tx.error = err;
                req.onerror?.({ target: req });
                tx.onerror?.({ target: tx });
                return;
              }
              const key = value[kp];
              const idx = storeDef.records.findIndex((r) => r[kp] === key);
              if (idx >= 0) storeDef.records[idx] = { ...value };
              else storeDef.records.push({ ...value });
              req.result = key;
              req.onsuccess?.({ target: req });
            });
            return req;
          },
          delete(key) {
            const req = { result: undefined, error: null };
            track(() => {
              const kp = storeDef.options.keyPath || 'key';
              storeDef.records = storeDef.records.filter((r) => r[kp] !== key);
              req.onsuccess?.({ target: req });
            });
            return req;
          },
        };
      };

      return tx;
    },
  };

  const openReq = {
    result: mockDb,
    onsuccess: null,
    onerror: null,
  };

  return {
    open: vi.fn(() => {
      defer(() => openReq.onsuccess?.({ target: openReq }));
      return openReq;
    }),
  };
}

describe('ACTIVE_SESSION IndexedDB Round-Trip Test', () => {
  let originalIndexedDB;

  beforeEach(async () => {
    originalIndexedDB = window.indexedDB;
    window.indexedDB = createMockIndexedDB();
    await initializeDB();
  });

  afterEach(() => {
    window.indexedDB = originalIndexedDB;
    if (db && typeof db.resetState === 'function') {
      db.resetState();
    }
    vi.restoreAllMocks();
  });

  it('directly verifies db.putRecord and db.get on ACTIVE_SESSION store', async () => {
    await db.putRecord(STORES.ACTIVE_SESSION, { id: 'current', data: { test: 1 } });
    const res = await db.get(STORES.ACTIVE_SESSION, 'current');
    expect(res).toEqual({ id: 'current', data: { test: 1 } });
  });

  it('successfully completes a round-trip: create session -> save -> destroy -> load -> restore state', async () => {
    const initialCards = [
      { id: 'card-1', itemId: 'word-1', word: { writing: '言葉1' } },
      { id: 'card-2', itemId: 'word-2', word: { writing: '言葉2' } },
      { id: 'card-3', itemId: 'word-3', word: { writing: '言葉3' } },
    ];

    let session = new SessionManager(initialCards, {
      srs: { review: () => ({}) },
      save: () => {},
    });

    const firstCard = session.getNextCard();
    expect(firstCard.id).toBe('card-1');
    session.answerCard('card-1', 3, {});

    const serializable = session.toSerializableState();
    await saveSessionToDB(serializable);

    const loadedData = await loadSessionFromDB();
    expect(loadedData).not.toBeNull();
    expect(loadedData.queue.length).toBe(3);

    const restoredSession = new SessionManager(initialCards, {
      srs: { review: () => ({}) },
      save: () => {},
    });
    restoredSession.restoreFromSerializableState(loadedData);

    expect(restoredSession.stats.reviewed).toBe(1);
    expect(restoredSession.stats.remaining).toBe(2);
    expect(restoredSession.queue[0].completed).toBe(true);

    const nextCard = restoredSession.getNextCard();
    expect(nextCard.id).toBe('card-2');
  });

  it('clears active session from IndexedDB when session finishes', async () => {
    await saveSessionToDB({
      schemaVersion: 2,
      sessionId: 'test_session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      managerState: { queue: [{ cardId: 'test_1' }], stats: { total: 1 } },
    });
    let loaded = await loadSessionFromDB();
    expect(loaded).not.toBeNull();

    await clearSessionFromDB();
    loaded = await loadSessionFromDB();
    expect(loaded).toBeNull();
  });
});
