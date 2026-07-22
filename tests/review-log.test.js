import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SRS } from '../srs.js';
import { undoReviewEvent } from '../src/card-behavior.js';

const defer = (callback) => Promise.resolve().then(callback);

function createFakeIndexedDB() {
  const stores = new Map();

  const database = {
    objectStoreNames: {
      contains: (name) => stores.has(name),
    },
    createObjectStore(name, options) {
      const definition = {
        options,
        indexes: new Map(),
        records: [],
        nextId: 1,
      };
      stores.set(name, definition);
      return {
        indexNames: { contains: (indexName) => definition.indexes.has(indexName) },
        createIndex(indexName, keyPath, indexOptions) {
          definition.indexes.set(indexName, { keyPath, options: indexOptions });
        },
      };
    },
    transaction([storeName]) {
      const transaction = { error: null };
      const definition = stores.get(storeName);

      transaction.objectStore = () => ({
        index(indexName) {
          return {
            get(key) {
              const request = { result: undefined, error: null };
              defer(() => {
                const keyPath = definition.indexes.get(indexName).keyPath;
                request.result = definition.records.find((record) => record[keyPath] === key);
                request.onsuccess?.();
                defer(() => transaction.oncomplete?.());
              });
              return request;
            },
          };
        },
        get(key) {
          const request = { result: undefined, error: null };
          defer(() => {
            const keyPath = definition.options.keyPath;
            request.result = definition.records.find((record) => record[keyPath] === key);
            request.onsuccess?.();
          });
          return request;
        },
        put(value) {
          const request = { result: undefined, error: null };
          defer(() => {
            const keyPath = definition.options.keyPath;
            const key = value[keyPath];
            const index = definition.records.findIndex((record) => record[keyPath] === key);
            if (index >= 0) definition.records[index] = { ...value };
            else definition.records.push({ ...value });
            request.result = key;
            request.onsuccess?.();
            defer(() => transaction.oncomplete?.());
          });
          return request;
        },
        add(value) {
          const request = { result: undefined, error: null };
          defer(() => {
            const id = definition.nextId++;
            definition.records.push({ ...value, id });
            request.result = id;
            request.onsuccess?.();
            defer(() => transaction.oncomplete?.());
          });
          return request;
        },
        getAll() {
          const request = { result: undefined, error: null };
          defer(() => {
            request.result = definition.records.map((record) => ({ ...record }));
            request.onsuccess?.();
          });
          return request;
        },
        clear() {
          const request = { error: null };
          defer(() => {
            definition.records = [];
            definition.nextId = 1;
            request.onsuccess?.();
          });
          return request;
        },
        delete(key) {
          const request = { error: null };
          defer(() => {
            const keyPath = definition.options.keyPath;
            definition.records = definition.records.filter((record) => record[keyPath] !== key);
            request.onsuccess?.();
          });
          return request;
        },
      });

      return transaction;
    },
  };

  const factory = {
    open: vi.fn((name, version) => {
      const request = {
        result: database,
        error: null,
        transaction: {
          objectStore(storeName) {
            const definition = stores.get(storeName);
            return {
              indexNames: { contains: (indexName) => definition.indexes.has(indexName) },
              createIndex(indexName, keyPath, indexOptions) {
                definition.indexes.set(indexName, { keyPath, options: indexOptions });
              },
            };
          },
        },
      };
      defer(() => {
        request.onupgradeneeded?.({ target: request, oldVersion: 0, newVersion: version });
        request.onsuccess?.();
      });
      return request;
    }),
  };

  return { factory, stores };
}

function makeEntry(overrides = {}) {
  return {
    cardId: 'L1_w1',
    quality: 4,
    mode: 'typing',
    responseTimeMs: 1250,
    timestamp: 1_750_000_000_000,
    previousStability: 2.5,
    previousDifficulty: 6.2,
    previousState: 2,
    ...overrides,
  };
}

function makeModernEntry(overrides = {}) {
  return {
    eventId: 'event-1',
    eventType: 'review',
    itemId: 'L1_V001',
    cardId: 'L1_V001::recall',
    skill: 'recall',
    mode: 'typing',
    firstAttemptCorrect: true,
    mistakes: 0,
    hintUsed: false,
    responseTimeMs: 800,
    rawRating: 4,
    effectiveRating: 4,
    reviewedAt: 1_750_000_000_000,
    undoneAt: null,
    fsrs: {
      rating: 3,
      state: 2,
      stability: 12,
      difficulty: 5,
      review: 1_750_000_000_000,
    },
    ...overrides,
  };
}

describe('IndexedDB review_log', () => {
  let fakeIndexedDB;

  beforeEach(() => {
    vi.resetModules();
    fakeIndexedDB = createFakeIndexedDB();
    vi.stubGlobal('indexedDB', fakeIndexedDB.factory);
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: fakeIndexedDB.factory,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('создаёт v3 store с autoIncrement и индексами', async () => {
    const { DB_NAME, DB_VERSION, STORES, initializeDB } = await import('../src/db.js');
    const existingAppState = {
      options: { keyPath: 'id' },
      indexes: new Map(),
      records: [{ id: 'state', value: { xp: 42 } }],
      nextId: 1,
    };
    fakeIndexedDB.stores.set(STORES.APP_STATE, existingAppState);

    await initializeDB();

    expect(fakeIndexedDB.factory.open).toHaveBeenCalledWith(DB_NAME, DB_VERSION);
    expect(DB_VERSION).toBe(3);
    const store = fakeIndexedDB.stores.get(STORES.REVIEW_LOG);
    expect(store.options).toEqual({ keyPath: 'id', autoIncrement: true });
    expect([...store.indexes.keys()]).toEqual([
      'cardId',
      'timestamp',
      'cardId_timestamp',
      'eventId',
    ]);
    expect(fakeIndexedDB.stores.get(STORES.APP_STATE)).toBe(existingAppState);
    expect(existingAppState.records).toEqual([{ id: 'state', value: { xp: 42 } }]);
  });

  it('добавляет уникальный eventId index при обновлении существующего review_log', async () => {
    const { STORES, initializeDB } = await import('../src/db.js');
    const existingReviewLog = {
      options: { keyPath: 'id', autoIncrement: true },
      indexes: new Map([
        ['cardId', { keyPath: 'cardId', options: { unique: false } }],
        ['timestamp', { keyPath: 'timestamp', options: { unique: false } }],
        ['cardId_timestamp', { keyPath: ['cardId', 'timestamp'], options: { unique: false } }],
      ]),
      records: [],
      nextId: 1,
    };
    fakeIndexedDB.stores.set(STORES.REVIEW_LOG, existingReviewLog);

    await initializeDB();

    expect(existingReviewLog.indexes.get('eventId')).toEqual({
      keyPath: 'eventId',
      options: { unique: true },
    });
  });

  it('добавляет записи без перезаписи и читает их в стабильном порядке', async () => {
    const { initializeDB } = await import('../src/db.js');
    const { appendReviewLog, getReviewLogs } = await import('../src/review-log.js');
    await initializeDB();

    await appendReviewLog(makeEntry());
    await appendReviewLog(makeEntry({ quality: 3, mode: 'drawing' }));

    const entries = await getReviewLogs();
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.id)).toEqual([1, 2]);
    expect(entries[0]).toMatchObject(makeEntry());
    expect(entries[1]).toMatchObject(makeEntry({ quality: 3, mode: 'drawing' }));
  });

  it('идемпотентно повторяет append по eventId', async () => {
    const { initializeDB } = await import('../src/db.js');
    const { appendReviewLog, getReviewLogs } = await import('../src/review-log.js');
    await initializeDB();

    await appendReviewLog(makeModernEntry());
    await appendReviewLog(makeModernEntry());

    expect(await getReviewLogs()).toEqual([expect.objectContaining(makeModernEntry())]);
  });

  it('при загрузке доставляет сохранённый outbox и очищает его после подтверждения', async () => {
    const dbModule = await import('../src/db.js');
    const storeModule = await import('../state/store.js');
    const { getReviewLogs } = await import('../src/review-log.js');
    await dbModule.initializeDB();

    const savedState = storeModule.defaultState();
    savedState.pendingReviewLogs = [makeModernEntry()];
    await dbModule.db.set(dbModule.STORES.APP_STATE, 'state', savedState);

    await storeModule.loadState();

    expect(storeModule.state.pendingReviewLogs).toEqual([]);
    expect((await dbModule.db.get(dbModule.STORES.APP_STATE, 'state')).pendingReviewLogs).toEqual(
      []
    );
    expect(await getReviewLogs()).toEqual([expect.objectContaining(makeModernEntry())]);
  });

  it('заменяет и очищает журнал для импорта и полного сброса', async () => {
    const { initializeDB } = await import('../src/db.js');
    const { appendReviewLog, clearReviewLogs, getReviewLogs, replaceReviewLogs } =
      await import('../src/review-log.js');
    await initializeDB();

    await appendReviewLog(makeEntry());
    await replaceReviewLogs([makeEntry({ id: 99, cardId: 'L2_w3', timestamp: 20 })]);

    expect(await getReviewLogs()).toEqual([
      expect.objectContaining({ id: 1, cardId: 'L2_w3', timestamp: 20 }),
    ]);

    await clearReviewLogs();
    expect(await getReviewLogs()).toEqual([]);
  });

  it('включает review_log в полный бэкап и восстанавливает его', async () => {
    const dbModule = await import('../src/db.js');
    const { appendReviewLog, getReviewLogs } = await import('../src/review-log.js');
    const { exportFullProgress, importFullProgress } = await import('../src/backup-manager.js');
    await dbModule.initializeDB();
    await dbModule.db.set(dbModule.STORES.APP_STATE, 'state', { version: 3, xp: 10 });
    await appendReviewLog(makeEntry());

    const backup = await exportFullProgress();
    expect(backup.data.reviewLog).toEqual([expect.objectContaining(makeEntry())]);

    const replacement = makeEntry({ id: 40, cardId: 'L3_w2', timestamp: 30 });
    const result = await importFullProgress({
      exportType: 'full_indexeddb',
      data: { state: { version: 3, xp: 20 }, reviewLog: [replacement] },
    });

    expect(result).toEqual({ success: true });
    expect(await getReviewLogs()).toEqual([
      expect.objectContaining({ id: 1, cardId: 'L3_w2', timestamp: 30 }),
    ]);
  });

  it('отклоняет неполные или некорректные записи', async () => {
    const { validateReviewLogEntry } = await import('../src/review-log.js');

    expect(() => validateReviewLogEntry(makeEntry())).not.toThrow();
    expect(() => validateReviewLogEntry(makeEntry({ cardId: '' }))).toThrow();
    expect(() => validateReviewLogEntry(makeEntry({ quality: 2 }))).toThrow();
    expect(() => validateReviewLogEntry(makeEntry({ responseTimeMs: -1 }))).toThrow();
    expect(() => validateReviewLogEntry(makeEntry({ previousStability: undefined }))).toThrow();
  });

  it('Undo после асинхронной записи восстанавливает карточку и связанное событие', async () => {
    const dbModule = await import('../src/db.js');
    await dbModule.initializeDB();
    const card = SRS.newCard('L4_w1');
    const previous = JSON.parse(JSON.stringify(card));
    const { event } = SRS.applyReview(card, SRS.Quality.Good, {
      mode: 'reverse-multiple-choice',
      reviewedAt: 1_750_000_000_000,
    });
    const appState = { version: 4, srs: { [card.id]: card }, reviewEvents: [event] };

    await dbModule.db.set(dbModule.STORES.APP_STATE, 'state', appState);
    expect(undoReviewEvent(appState, event.eventId, 1_750_000_001_000)).toBe(true);
    await dbModule.db.set(dbModule.STORES.APP_STATE, 'state', appState);

    const reloaded = await dbModule.db.get(dbModule.STORES.APP_STATE, 'state');
    expect(reloaded.srs[card.id]).toEqual(previous);
    expect(reloaded.reviewEvents[0]).toMatchObject({
      eventId: event.eventId,
      undoneAt: 1_750_000_001_000,
    });
  });

  it('обычный applyReview пишет компактную полную FSRS-историю без snapshot', async () => {
    const dbModule = await import('../src/db.js');
    const { appendReviewLog, getReviewLogs } = await import('../src/review-log.js');
    await dbModule.initializeDB();
    SRS.setReviewLogger(appendReviewLog);
    const card = SRS.newCard('L5_w1');

    SRS.applyReview(card, SRS.Quality.Good, {
      mode: 'reverse-multiple-choice',
      reviewedAt: 1_750_000_000_000,
    });
    const [entry] = await getReviewLogs();
    SRS.setReviewLogger(null);

    expect(entry).toMatchObject({
      cardId: 'L5_w1',
      effectiveRating: SRS.Quality.Good,
      fsrs: { rating: SRS.Rating.Good, state: SRS.State.New, learning_steps: 0 },
    });
    expect(entry.previousCard).toBeUndefined();
    expect(entry.nextCard).toBeUndefined();
  });
});
