import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DB_VERSION, IndexedDBWrapper, STORES } from '../src/db.js';

describe('IndexedDBWrapper resilience and recovery', () => {
  let mockIDBRequest;
  let mockIDBDatabase;
  let originalIndexedDB;
  let originalAlert;

  beforeEach(() => {
    mockIDBDatabase = {
      close: vi.fn(),
      transaction: vi.fn(),
      objectStoreNames: {
        contains: vi.fn().mockReturnValue(true),
      },
    };

    mockIDBRequest = {
      onerror: null,
      onsuccess: null,
      onupgradeneeded: null,
      onblocked: null,
      result: mockIDBDatabase,
      error: null,
    };

    originalIndexedDB = window.indexedDB;
    originalAlert = window.alert;
    window.alert = vi.fn();

    window.indexedDB = {
      open: vi.fn(() => mockIDBRequest),
    };
  });

  afterEach(() => {
    window.indexedDB = originalIndexedDB;
    window.alert = originalAlert;
    vi.restoreAllMocks();
  });

  it('resets db, isInitialized and initializationPromise when onversionchange fires', async () => {
    const wrapper = new IndexedDBWrapper();
    const initTask = wrapper.initDB({ timeoutMs: 100, maxRetries: 0 });
    mockIDBRequest.onsuccess();
    await initTask;

    expect(wrapper.isInitialized).toBe(true);
    expect(wrapper.db).toBe(mockIDBDatabase);

    // Trigger versionchange event
    mockIDBDatabase.onversionchange();

    expect(mockIDBDatabase.close).toHaveBeenCalled();
    expect(wrapper.isInitialized).toBe(false);
    expect(wrapper.db).toBeNull();
    expect(wrapper.initializationPromise).toBeNull();
  });

  it('resets db, isInitialized and initializationPromise when onclose fires', async () => {
    const wrapper = new IndexedDBWrapper();
    const initTask = wrapper.initDB({ timeoutMs: 100, maxRetries: 0 });
    mockIDBRequest.onsuccess();
    await initTask;

    // Trigger onclose event
    mockIDBDatabase.onclose();

    expect(wrapper.isInitialized).toBe(false);
    expect(wrapper.db).toBeNull();
    expect(wrapper.initializationPromise).toBeNull();
  });

  it('shows alert "Закройте старую вкладку" when onblocked event fires', async () => {
    const wrapper = new IndexedDBWrapper();
    const initTask = wrapper.initDB({ timeoutMs: 100, maxRetries: 0 });

    mockIDBRequest.onblocked();

    expect(window.alert).toHaveBeenCalledWith('Закройте старую вкладку');

    mockIDBRequest.onsuccess();
    await initTask;
  });

  it('re-opens database via ensureInitialized after versionchange reset', async () => {
    const wrapper = new IndexedDBWrapper();
    const initTask = wrapper.initDB({ timeoutMs: 100, maxRetries: 0 });
    mockIDBRequest.onsuccess();
    await initTask;

    mockIDBDatabase.onversionchange();
    expect(wrapper.isInitialized).toBe(false);

    mockIDBDatabase.transaction.mockReturnValue({
      objectStore: () => ({
        get: () => {
          const req = { onsuccess: null, onerror: null, result: { value: 'test' } };
          setTimeout(() => req.onsuccess && req.onsuccess(), 0);
          return req;
        },
      }),
    });

    const getTask = wrapper.get(STORES.APP_STATE, 'test-key');
    await Promise.resolve();
    mockIDBRequest.onsuccess();
    await getTask;

    expect(wrapper.isInitialized).toBe(true);
  });

  it('handles timeout during open and resets state', async () => {
    const wrapper = new IndexedDBWrapper();
    const initTask = wrapper.initDB({ timeoutMs: 50, maxRetries: 0 });

    await expect(initTask).rejects.toThrow('IndexedDB open timeout');
    expect(wrapper.isInitialized).toBe(false);
    expect(wrapper.db).toBeNull();
    expect(wrapper.initializationPromise).toBeNull();
  });

  it('returns raw records for keyPath-id stores instead of assuming a value wrapper', async () => {
    const wrapper = new IndexedDBWrapper();
    const initTask = wrapper.initDB({ timeoutMs: 100, maxRetries: 0 });
    mockIDBRequest.onsuccess();
    await initTask;

    const rawRecord = { id: 'user-dict:12345678', name: 'Raw dictionary' };
    const getRequest = { onsuccess: null, onerror: null, result: rawRecord, error: null };
    mockIDBDatabase.transaction.mockReturnValue({
      objectStore: () => ({ get: () => getRequest }),
    });
    const readTask = wrapper.get(STORES.USER_DICTIONARIES, rawRecord.id);
    await Promise.resolve();
    getRequest.onsuccess();
    await expect(readTask).resolves.toEqual(rawRecord);
  });
});

describe('user dictionary IndexedDB migration metadata', () => {
  it('bumps the legacy database in place and exposes normalized stores', () => {
    expect(DB_VERSION).toBe(7);
    expect(STORES.USER_DICTIONARIES).toBe('userDictionaries');
    expect(STORES.USER_DICTIONARY_ENTRIES).toBe('userDictionaryEntries');
    expect(STORES.USER_DICTIONARY_IMPORT_PROFILES).toBe('userDictionaryImportProfiles');
  });
});
