/* src/db.js — Promise-based обёртка над IndexedDB с graceful degradation */

const DB_NAME = 'KitsuneGenkiDB';
const DB_VERSION = 7;

// Object Stores
const STORES = {
  APP_STATE: 'app_state', // Основное состояние приложения
  CONTENT_CACHE: 'content_cache', // Кэш контента (уроки)
  UI_PREFERENCES: 'ui_preferences', // UI настройки (тема)
  REVIEW_LOG: 'review_log', // Append-only история FSRS review
  ACTIVE_SESSION: 'active_session', // Незавершённая учебная сессия для авто-восстановления
  USER_DICTIONARIES: 'userDictionaries',
  USER_DICTIONARY_ENTRIES: 'userDictionaryEntries',
  USER_DICTIONARY_IMPORT_PROFILES: 'userDictionaryImportProfiles',
};

/**
 * Единое декларативное описание схем IndexedDB stores и их key paths
 */
const STORE_SCHEMAS = {
  [STORES.APP_STATE]: { keyPath: 'id' },
  [STORES.CONTENT_CACHE]: { keyPath: 'key' },
  [STORES.UI_PREFERENCES]: { keyPath: 'key' },
  [STORES.ACTIVE_SESSION]: { keyPath: 'id' },
  [STORES.USER_DICTIONARIES]: {
    keyPath: 'id',
    indexes: [{ name: 'updatedAt', keyPath: 'updatedAt', options: { unique: false } }],
  },
  [STORES.USER_DICTIONARY_ENTRIES]: {
    keyPath: 'id',
    indexes: [
      { name: 'dictionaryId', keyPath: 'dictionaryId', options: { unique: false } },
      {
        name: 'dictionaryId_entryKey',
        keyPath: ['dictionaryId', 'entryKey'],
        options: { unique: false },
      },
      { name: 'learningEnabled', keyPath: 'learningEnabled', options: { unique: false } },
    ],
  },
  [STORES.USER_DICTIONARY_IMPORT_PROFILES]: {
    keyPath: 'id',
    indexes: [{ name: 'name', keyPath: 'name', options: { unique: false } }],
  },
  [STORES.REVIEW_LOG]: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: [
      { name: 'cardId', keyPath: 'cardId', options: { unique: false } },
      { name: 'timestamp', keyPath: 'timestamp', options: { unique: false } },
      { name: 'reviewedAt', keyPath: 'reviewedAt', options: { unique: false } },
      { name: 'cardId_timestamp', keyPath: ['cardId', 'timestamp'], options: { unique: false } },
      { name: 'cardId_reviewedAt', keyPath: ['cardId', 'reviewedAt'], options: { unique: false } },
      { name: 'itemId', keyPath: 'itemId', options: { unique: false } },
      { name: 'eventId', keyPath: 'eventId', options: { unique: true } },
    ],
  },
};

/**
 * Удаляет записи review_log для указанного itemId.
 * Использован индекс itemId (при наличии) либо полный cursor-обход.
 */
function deleteReviewLogsForItem(store, itemId, transaction, reject) {
  const matchesItem = (value) => {
    if (!value) return false;
    if (value.itemId === itemId) return true;
    if (!value.itemId && typeof value.cardId === 'string') {
      return value.cardId === itemId || value.cardId.startsWith(`${itemId}::`);
    }
    return false;
  };

  const handleCursorSuccess = (event) => {
    const cursor = event.target.result;
    if (!cursor) return;

    try {
      if (matchesItem(cursor.value)) {
        const deleteReq = cursor.delete();
        deleteReq.onerror = (e) => {
          try {
            transaction.abort();
          } catch {
            /* ignore */
          }
          reject(deleteReq.error || e?.target?.error || new Error('Ошибка удаления cursor'));
        };
      }
      cursor.continue();
    } catch (err) {
      try {
        transaction.abort();
      } catch {
        /* ignore */
      }
      reject(err);
    }
  };

  const handleCursorError = (event) => {
    try {
      transaction.abort();
    } catch {
      /* ignore */
    }
    reject(event?.target?.error || new Error('Ошибка запроса cursor'));
  };

  try {
    if (store.indexNames.contains('itemId')) {
      const keyRange = typeof IDBKeyRange !== 'undefined' ? IDBKeyRange.only(itemId) : itemId;
      const request = store.index('itemId').openCursor(keyRange);
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) {
          const legacyRequest = store.openCursor();
          legacyRequest.onsuccess = (legacyEvt) => {
            const legCursor = legacyEvt.target.result;
            if (!legCursor) return;
            try {
              if (!legCursor.value?.itemId && matchesItem(legCursor.value)) {
                const delReq = legCursor.delete();
                delReq.onerror = (err) => {
                  try {
                    transaction.abort();
                  } catch {
                    /* ignore */
                  }
                  reject(delReq.error || err?.target?.error);
                };
              }
              legCursor.continue();
            } catch (err) {
              try {
                transaction.abort();
              } catch {
                /* ignore */
              }
              reject(err);
            }
          };
          legacyRequest.onerror = handleCursorError;
          return;
        }
        try {
          const deleteReq = cursor.delete();
          deleteReq.onerror = (err) => {
            try {
              transaction.abort();
            } catch {
              /* ignore */
            }
            reject(deleteReq.error || err?.target?.error);
          };
          cursor.continue();
        } catch (err) {
          try {
            transaction.abort();
          } catch {
            /* ignore */
          }
          reject(err);
        }
      };
      request.onerror = handleCursorError;
    } else {
      const request = store.openCursor();
      request.onsuccess = handleCursorSuccess;
      request.onerror = handleCursorError;
    }
  } catch (err) {
    try {
      transaction.abort();
    } catch {
      /* ignore */
    }
    reject(err);
  }
}

/**
 * Класс для работы с IndexedDB
 */
class IndexedDBWrapper {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.initializationPromise = null;
  }

  /**
   * Сброс состояния подключения к БД
   */
  resetState() {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        /* ignore */
      }
    }
    this.db = null;
    this.isInitialized = false;
    this.initializationPromise = null;
  }

  /**
   * Инициализация базы данных
   * @param {Object} [options]
   * @param {number} [options.timeoutMs=5000] - таймаут ожидания открытия в мс
   * @param {number} [options.maxRetries=2] - количество повторных попыток
   * @returns {Promise<void>}
   */
  async initDB(options = {}) {
    if (this.isInitialized) return;
    if (this.initializationPromise) return this.initializationPromise;

    const timeoutMs = options.timeoutMs ?? 5000;
    const maxRetries = options.maxRetries ?? 2;

    this.initializationPromise = (async () => {
      let lastError = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await this._openDatabase(timeoutMs);
          return;
        } catch (err) {
          lastError = err;
          this.resetState();

          if (attempt < maxRetries) {
            console.warn(`[DB] Попытка повторного открытия DB (${attempt + 1}/${maxRetries})...`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }

      this.resetState();
      throw lastError || new Error('Не удалось открыть IndexedDB');
    })();

    return this.initializationPromise;
  }

  /**
   * Внутренний метод открытия IndexedDB с подпиской на события и таймаутом
   * @private
   * @param {number} timeoutMs
   * @returns {Promise<void>}
   */
  _openDatabase(timeoutMs) {
    return new Promise((resolve, reject) => {
      let timer = null;
      let isSettled = false;
      let blockedAlertShown = false;

      const cleanup = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };

      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        if (timeoutMs > 0) {
          timer = setTimeout(() => {
            if (isSettled) return;
            isSettled = true;
            console.warn('[DB] Таймаут открытия IndexedDB');
            try {
              if (request.result) {
                request.result.close();
              }
            } catch {
              /* ignore */
            }
            reject(new Error('IndexedDB open timeout'));
          }, timeoutMs);
        }

        request.onerror = () => {
          if (isSettled) return;
          isSettled = true;
          cleanup();
          console.error('[DB] Ошибка открытия IndexedDB:', request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          if (isSettled) {
            try {
              if (request.result) request.result.close();
            } catch {
              /* ignore */
            }
            return;
          }
          isSettled = true;
          cleanup();

          this.db = request.result;
          this.isInitialized = true;

          this.db.onversionchange = () => {
            console.warn(
              '[DB] Обнаружено изменение версии схемы в другой вкладке, закрываем соединение'
            );
            this.resetState();
          };

          this.db.onclose = () => {
            console.warn('[DB] Соединение IndexedDB закрыто');
            this.resetState();
          };

          console.log('[DB] IndexedDB успешно инициализирована');
          resolve();
        };

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          console.log('[DB] Выполняется upgrade схемы БД');

          // Создаём Object Stores если их нет
          if (!db.objectStoreNames.contains(STORES.APP_STATE)) {
            db.createObjectStore(STORES.APP_STATE, { keyPath: 'id' });
            console.log('[DB] Создан store:', STORES.APP_STATE);
          }

          if (!db.objectStoreNames.contains(STORES.CONTENT_CACHE)) {
            db.createObjectStore(STORES.CONTENT_CACHE, { keyPath: 'key' });
            console.log('[DB] Создан store:', STORES.CONTENT_CACHE);
          }

          if (!db.objectStoreNames.contains(STORES.UI_PREFERENCES)) {
            db.createObjectStore(STORES.UI_PREFERENCES, { keyPath: 'key' });
            console.log('[DB] Создан store:', STORES.UI_PREFERENCES);
          }

          if (!db.objectStoreNames.contains(STORES.ACTIVE_SESSION)) {
            db.createObjectStore(STORES.ACTIVE_SESSION, { keyPath: 'id' });
            console.log('[DB] Создан store:', STORES.ACTIVE_SESSION);
          }

          if (!db.objectStoreNames.contains(STORES.USER_DICTIONARIES)) {
            const store = db.createObjectStore(STORES.USER_DICTIONARIES, { keyPath: 'id' });
            store.createIndex('updatedAt', 'updatedAt', { unique: false });
          }

          if (!db.objectStoreNames.contains(STORES.USER_DICTIONARY_ENTRIES)) {
            const store = db.createObjectStore(STORES.USER_DICTIONARY_ENTRIES, { keyPath: 'id' });
            store.createIndex('dictionaryId', 'dictionaryId', { unique: false });
            store.createIndex('dictionaryId_entryKey', ['dictionaryId', 'entryKey'], {
              unique: false,
            });
            store.createIndex('learningEnabled', 'learningEnabled', { unique: false });
          }

          if (!db.objectStoreNames.contains(STORES.USER_DICTIONARY_IMPORT_PROFILES)) {
            const store = db.createObjectStore(STORES.USER_DICTIONARY_IMPORT_PROFILES, {
              keyPath: 'id',
            });
            store.createIndex('name', 'name', { unique: false });
          }

          let reviewLogStore;
          if (!db.objectStoreNames.contains(STORES.REVIEW_LOG)) {
            reviewLogStore = db.createObjectStore(STORES.REVIEW_LOG, {
              keyPath: 'id',
              autoIncrement: true,
            });
            reviewLogStore.createIndex('cardId', 'cardId', { unique: false });
            reviewLogStore.createIndex('timestamp', 'timestamp', { unique: false });
            reviewLogStore.createIndex('reviewedAt', 'reviewedAt', { unique: false });
            reviewLogStore.createIndex('cardId_timestamp', ['cardId', 'timestamp'], {
              unique: false,
            });
            reviewLogStore.createIndex('cardId_reviewedAt', ['cardId', 'reviewedAt'], {
              unique: false,
            });
            reviewLogStore.createIndex('itemId', 'itemId', { unique: false });
            reviewLogStore.createIndex('eventId', 'eventId', { unique: true });
            console.log('[DB] Создан store:', STORES.REVIEW_LOG);
          } else if (event.target.transaction) {
            reviewLogStore = event.target.transaction.objectStore(STORES.REVIEW_LOG);
            if (!reviewLogStore.indexNames.contains('itemId')) {
              reviewLogStore.createIndex('itemId', 'itemId', { unique: false });
            }
            if (!reviewLogStore.indexNames.contains('eventId')) {
              reviewLogStore.createIndex('eventId', 'eventId', { unique: true });
            }
            if (!reviewLogStore.indexNames.contains('reviewedAt')) {
              reviewLogStore.createIndex('reviewedAt', 'reviewedAt', { unique: false });
            }
            if (!reviewLogStore.indexNames.contains('cardId_reviewedAt')) {
              reviewLogStore.createIndex('cardId_reviewedAt', ['cardId', 'reviewedAt'], {
                unique: false,
              });
            }
          }
        };

        request.onblocked = () => {
          console.warn('[DB] Обновление схемы заблокировано другой открытой вкладкой');
          if (!blockedAlertShown) {
            blockedAlertShown = true;
            if (typeof window !== 'undefined' && typeof window.alert === 'function') {
              window.alert('Закройте старую вкладку');
            }
          }
        };
      } catch (error) {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        console.error('[DB] Исключение при открытии IndexedDB:', error);
        reject(error);
      }
    });
  }

  /**
   * Получить значение из store
   * @param {string} storeName - имя Object Store
   * @param {string} key - ключ записи
   * @returns {Promise<any>}
   */
  async get(storeName, key) {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => {
          const result = request.result;
          // Если это объект с полем value, возвращаем его содержимое
          resolve(
            result && typeof result === 'object' && Object.hasOwn(result, 'value')
              ? result.value
              : result
          );
        };

        request.onerror = () => {
          console.error(`[DB] Ошибка чтения из ${storeName}:`, request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error(`[DB] Исключение при чтении из ${storeName}:`, error);
        reject(error);
      }
    });
  }

  /**
   * Записать значение в store
   * @param {string} storeName - имя Object Store
   * @param {string} key - ключ записи
   * @param {any} value - значение
   * @returns {Promise<void>}
   */
  async set(storeName, key, value) {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);

        // Сторы с keyPath: 'id'
        const storesWithIdKeyPath = [
          STORES.APP_STATE,
          STORES.ACTIVE_SESSION,
          STORES.USER_DICTIONARIES,
          STORES.USER_DICTIONARY_ENTRIES,
          STORES.USER_DICTIONARY_IMPORT_PROFILES,
        ];

        let data;
        if (storesWithIdKeyPath.includes(storeName)) {
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            data = { id: key, ...value };
          } else {
            data = { id: key, value };
          }
        } else {
          data = { key, value };
        }

        const request = store.put(data);

        request.onerror = () => {
          console.error(`[DB] Ошибка записи в ${storeName}:`, request.error);
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || request.error);
        transaction.onabort = () => reject(transaction.error || request.error);
      } catch (error) {
        console.error(`[DB] Исключение при записи в ${storeName}:`, error);
        reject(error);
      }
    });
  }

  /**
   * Добавить новую запись в append-only store.
   * @param {string} storeName - имя Object Store
   * @param {Object} value - сохраняемая запись
   * @returns {Promise<IDBValidKey>} сгенерированный ключ
   */
  async add(storeName, value) {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.add(value);
        let generatedKey;

        request.onsuccess = () => {
          generatedKey = request.result;
        };
        request.onerror = () => {
          console.error(`[DB] Ошибка добавления в ${storeName}:`, request.error);
        };
        transaction.oncomplete = () => resolve(generatedKey);
        transaction.onerror = () => reject(transaction.error || request.error);
        transaction.onabort = () => reject(transaction.error || request.error);
      } catch (error) {
        console.error(`[DB] Исключение при добавлении в ${storeName}:`, error);
        reject(error);
      }
    });
  }

  async putRecord(storeName, value) {
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const request = transaction.objectStore(storeName).put(value);
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error || request.error);
        transaction.onabort = () => reject(transaction.error || request.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  async atomicDictionaryCommit({ dictionary, entries, deleteEntryIds = [], state = undefined }) {
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      try {
        const stores = [
          STORES.USER_DICTIONARIES,
          STORES.USER_DICTIONARY_ENTRIES,
          STORES.REVIEW_LOG,
        ];
        if (state !== undefined) stores.push(STORES.APP_STATE);
        const transaction = this.db.transaction(stores, 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
          reject(transaction.error || new Error('Ошибка транзакции словаря'));
        transaction.onabort = () =>
          reject(transaction.error || new Error('Транзакция словаря прервана'));
        if (dictionary) {
          transaction.objectStore(STORES.USER_DICTIONARIES).put(dictionary);
        }
        const entryStore = transaction.objectStore(STORES.USER_DICTIONARY_ENTRIES);
        const reviewLogStore = transaction.objectStore(STORES.REVIEW_LOG);

        for (const id of deleteEntryIds) {
          entryStore.delete(id);
          deleteReviewLogsForItem(reviewLogStore, id, transaction, reject);
        }
        for (const entry of entries || []) entryStore.put(entry);
        if (state !== undefined) {
          transaction.objectStore(STORES.APP_STATE).put({ id: 'state', value: state });
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  async atomicDeleteDictionary({ dictionaryId, entryIds, state = undefined }) {
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      try {
        const stores = [
          STORES.USER_DICTIONARIES,
          STORES.USER_DICTIONARY_ENTRIES,
          STORES.REVIEW_LOG,
        ];
        if (state !== undefined) stores.push(STORES.APP_STATE);
        const transaction = this.db.transaction(stores, 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
          reject(transaction.error || new Error('Ошибка удаления словаря'));
        transaction.onabort = () =>
          reject(transaction.error || new Error('Транзакция удаления словаря прервана'));
        transaction.objectStore(STORES.USER_DICTIONARIES).delete(dictionaryId);
        const entryStore = transaction.objectStore(STORES.USER_DICTIONARY_ENTRIES);
        const reviewLogStore = transaction.objectStore(STORES.REVIEW_LOG);

        for (const entryId of entryIds || []) {
          entryStore.delete(entryId);
          deleteReviewLogsForItem(reviewLogStore, entryId, transaction, reject);
        }
        if (state !== undefined) {
          transaction.objectStore(STORES.APP_STATE).put({ id: 'state', value: state });
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Идемпотентно добавляет запись по значению уникального индекса.
   */
  async addUnique(storeName, indexName, key, value) {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const lookup = store.index(indexName).get(key);
        let resultKey;

        lookup.onsuccess = () => {
          if (lookup.result) {
            resultKey = lookup.result.id;
            return;
          }
          const request = store.add(value);
          request.onsuccess = () => {
            resultKey = request.result;
          };
          request.onerror = () => {
            console.error(`[DB] Ошибка добавления в ${storeName}:`, request.error);
          };
        };
        lookup.onerror = () => {
          console.error(`[DB] Ошибка поиска в ${storeName}:`, lookup.error);
        };
        transaction.oncomplete = () => resolve(resultKey);
        transaction.onerror = () => reject(transaction.error || lookup.error);
        transaction.onabort = () => reject(transaction.error || lookup.error);
      } catch (error) {
        console.error(`[DB] Исключение при добавлении в ${storeName}:`, error);
        reject(error);
      }
    });
  }

  /**
   * Получить записи по индексу из store.
   * @param {string} storeName - имя Object Store
   * @param {string} indexName - имя индекса
   * @param {any} [query=null] - ключ или IDBKeyRange
   * @returns {Promise<Array>}
   */
  async getAllByIndex(storeName, indexName, query = null) {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const idx = store.index(indexName);
        const request = query !== null ? idx.getAll(query) : idx.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Получить все записи из store.
   * @param {string} storeName - имя Object Store
   * @returns {Promise<Array>}
   */
  async getAll(storeName) {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => {
          console.error(`[DB] Ошибка чтения всех записей из ${storeName}:`, request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error(`[DB] Исключение при чтении всех записей из ${storeName}:`, error);
        reject(error);
      }
    });
  }

  /**
   * Удалить запись из store
   * @param {string} storeName - имя Object Store
   * @param {string} key - ключ записи
   * @returns {Promise<void>}
   */
  async delete(storeName, key) {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          console.error(`[DB] Ошибка удаления из ${storeName}:`, request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error(`[DB] Исключение при удалении из ${storeName}:`, error);
        reject(error);
      }
    });
  }

  /**
   * Очистить весь store
   * @param {string} storeName - имя Object Store
   * @returns {Promise<void>}
   */
  async clear(storeName) {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          console.error(`[DB] Ошибка очистки ${storeName}:`, request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error(`[DB] Исключение при очистке ${storeName}:`, error);
        reject(error);
      }
    });
  }

  /**
   * Выполнить атомарный импорт всех данных в единой транзакции
   * @param {Object} payload - { state, lessonVersion, lastActivityDay, theme, reviewLog }
   * @returns {Promise<void>}
   */
  async atomicImport({
    state,
    lessonVersion,
    lastActivityDay,
    theme,
    reviewLog,
    userDictionaries = [],
    userDictionaryEntries = [],
    userDictionaryImportProfiles = [],
  }) {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      try {
        const stores = [
          STORES.APP_STATE,
          STORES.CONTENT_CACHE,
          STORES.UI_PREFERENCES,
          STORES.REVIEW_LOG,
          STORES.USER_DICTIONARIES,
          STORES.USER_DICTIONARY_ENTRIES,
          STORES.USER_DICTIONARY_IMPORT_PROFILES,
        ];
        const transaction = this.db.transaction(stores, 'readwrite');

        transaction.onerror = () =>
          reject(transaction.error || new Error('Ошибка транзакции импорта'));
        transaction.onabort = () =>
          reject(transaction.error || new Error('Транзакция импорта прервана'));
        transaction.oncomplete = () => resolve();

        // 1. APP_STATE
        const appStateStore = transaction.objectStore(STORES.APP_STATE);
        if (state) {
          appStateStore.put({ id: 'state', value: state });
        } else {
          appStateStore.delete('state');
        }

        // 2. CONTENT_CACHE
        const contentCacheStore = transaction.objectStore(STORES.CONTENT_CACHE);
        if (lessonVersion !== undefined && lessonVersion !== null) {
          contentCacheStore.put({ key: 'lesson_version', value: lessonVersion });
        } else {
          contentCacheStore.delete('lesson_version');
        }
        if (lastActivityDay !== undefined && lastActivityDay !== null) {
          contentCacheStore.put({ key: 'last_activity_day', value: lastActivityDay });
        } else {
          contentCacheStore.delete('last_activity_day');
        }

        // 3. UI_PREFERENCES
        const uiPrefStore = transaction.objectStore(STORES.UI_PREFERENCES);
        if (theme !== undefined && theme !== null) {
          uiPrefStore.put({ key: 'theme', value: theme });
        } else {
          uiPrefStore.delete('theme');
        }

        // 4. REVIEW_LOG
        const reviewLogStore = transaction.objectStore(STORES.REVIEW_LOG);
        reviewLogStore.clear();

        if (Array.isArray(reviewLog)) {
          for (const entry of reviewLog) {
            const cleanEntry = { ...entry };
            delete cleanEntry.id;
            reviewLogStore.add(cleanEntry);
          }
        }

        const replaceRecords = (storeName, records) => {
          const store = transaction.objectStore(storeName);
          store.clear();
          for (const record of records || []) store.add(record);
        };
        replaceRecords(STORES.USER_DICTIONARIES, userDictionaries);
        replaceRecords(STORES.USER_DICTIONARY_ENTRIES, userDictionaryEntries);
        replaceRecords(STORES.USER_DICTIONARY_IMPORT_PROFILES, userDictionaryImportProfiles);
      } catch (error) {
        console.error('[DB] Исключение при атомарном импорте:', error);
        reject(error);
      }
    });
  }

  /**
   * Проверить доступность IndexedDB
   * @returns {boolean}
   */
  isAvailable() {
    return 'indexedDB' in window && this.isInitialized;
  }

  /**
   * Получить размер БД (приблизительный, для диагностики)
   * @returns {Promise<number>} размер в байтах
   */
  async getDBSize() {
    if (!this.isAvailable()) return 0;

    try {
      const estimate = await navigator.storage.estimate();
      return estimate.usage || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Убедиться что БД инициализирована
   * @private
   */
  async ensureInitialized() {
    if (!this.isInitialized) {
      await this.initDB();
    }
  }
}

/**
 * In-memory fallback для режимов где IndexedDB недоступен
 */
class InMemoryFallback {
  constructor() {
    this.storage = new Map();
    this.autoIncrement = new Map();
    console.warn('[DB] Используется In-Memory Fallback (данные не персистятся!)');
  }

  async initDB() {
    // Ничего не делаем
  }

  async get(storeName, key) {
    const storeKey = `${storeName}:${key}`;
    if (this.storage.has(storeKey)) return this.storage.get(storeKey);
    return (this.storage.get(`${storeName}:__records__`) || []).find((record) => record.id === key);
  }

  async set(storeName, key, value) {
    const storeKey = `${storeName}:${key}`;
    this.storage.set(storeKey, value);
  }

  async add(storeName, value) {
    const nextId = (this.autoIncrement.get(storeName) || 0) + 1;
    this.autoIncrement.set(storeName, nextId);

    const storeKey = `${storeName}:__records__`;
    const records = this.storage.get(storeKey) || [];
    records.push({ ...value, id: nextId });
    this.storage.set(storeKey, records);
    return nextId;
  }

  async putRecord(storeName, value) {
    if (!value?.id) throw new Error('Record id обязателен');
    const storeKey = `${storeName}:__records__`;
    const records = this.storage.get(storeKey) || [];
    const index = records.findIndex((record) => record.id === value.id);
    if (index >= 0) records[index] = { ...value };
    else records.push({ ...value });
    this.storage.set(storeKey, records);
    return value.id;
  }

  async atomicDictionaryCommit({ dictionary, entries, deleteEntryIds = [], state = undefined }) {
    const backupStorage = new Map(
      [...this.storage].map(([key, value]) => [
        key,
        Array.isArray(value) ? value.map((record) => ({ ...record })) : value,
      ])
    );
    const matchesItemInMemory = (record, itemId) => {
      if (!record) return false;
      if (record.itemId === itemId) return true;
      if (!record.itemId && typeof record.cardId === 'string') {
        return record.cardId === itemId || record.cardId.startsWith(`${itemId}::`);
      }
      return false;
    };
    try {
      if (dictionary) await this.putRecord(STORES.USER_DICTIONARIES, dictionary);
      for (const id of deleteEntryIds) {
        await this.delete(STORES.USER_DICTIONARY_ENTRIES, id);
        const reviewLogsKey = `${STORES.REVIEW_LOG}:__records__`;
        if (this.storage.has(reviewLogsKey)) {
          const logs = this.storage.get(reviewLogsKey) || [];
          this.storage.set(
            reviewLogsKey,
            logs.filter((record) => !matchesItemInMemory(record, id))
          );
        }
      }
      for (const entry of entries || []) {
        await this.putRecord(STORES.USER_DICTIONARY_ENTRIES, entry);
      }
      if (state !== undefined) this.storage.set(`${STORES.APP_STATE}:state`, state);
    } catch (error) {
      this.storage = backupStorage;
      throw error;
    }
  }

  async atomicDeleteDictionary({ dictionaryId, entryIds, state = undefined }) {
    const backupStorage = new Map(
      [...this.storage].map(([key, value]) => [
        key,
        Array.isArray(value) ? value.map((record) => ({ ...record })) : value,
      ])
    );
    const matchesItemInMemory = (record, itemId) => {
      if (!record) return false;
      if (record.itemId === itemId) return true;
      if (!record.itemId && typeof record.cardId === 'string') {
        return record.cardId === itemId || record.cardId.startsWith(`${itemId}::`);
      }
      return false;
    };
    try {
      const entryIdsArr = entryIds || [];
      for (const entryId of entryIdsArr) {
        await this.delete(STORES.USER_DICTIONARY_ENTRIES, entryId);
      }
      const reviewLogsKey = `${STORES.REVIEW_LOG}:__records__`;
      if (this.storage.has(reviewLogsKey)) {
        const logs = this.storage.get(reviewLogsKey) || [];
        this.storage.set(
          reviewLogsKey,
          logs.filter((record) => !entryIdsArr.some((id) => matchesItemInMemory(record, id)))
        );
      }
      await this.delete(STORES.USER_DICTIONARIES, dictionaryId);
      if (state !== undefined) this.storage.set(`${STORES.APP_STATE}:state`, state);
    } catch (error) {
      this.storage = backupStorage;
      throw error;
    }
  }

  async addUnique(storeName, _indexName, key, value) {
    const storeKey = `${storeName}:__records__`;
    const records = this.storage.get(storeKey) || [];
    const existing = records.find((record) => record.eventId === key);
    if (existing) return existing.id;
    return this.add(storeName, value);
  }

  async getAll(storeName) {
    const records = this.storage.get(`${storeName}:__records__`) || [];
    return records.map((record) => ({ ...record }));
  }

  async getAllByIndex(storeName, indexName, query = null) {
    const records = await this.getAll(storeName);
    if (query === null) return records;
    return records.filter((record) => {
      if (indexName === 'dictionaryId_entryKey') {
        return (
          Array.isArray(query) && record.dictionaryId === query[0] && record.entryKey === query[1]
        );
      }
      return record[indexName] === query;
    });
  }

  async delete(storeName, key) {
    const recordsKey = `${storeName}:__records__`;
    if (this.storage.has(recordsKey)) {
      const records = this.storage.get(recordsKey) || [];
      this.storage.set(
        recordsKey,
        records.filter((record) => record.id !== key)
      );
    }
    this.storage.delete(`${storeName}:${key}`);
  }

  async clear(storeName) {
    // Удаляем все ключи этого store
    const prefix = `${storeName}:`;
    for (const key of this.storage.keys()) {
      if (key.startsWith(prefix)) {
        this.storage.delete(key);
      }
    }
    this.autoIncrement.delete(storeName);
  }

  async atomicImport({
    state,
    lessonVersion,
    lastActivityDay,
    theme,
    reviewLog,
    userDictionaries = [],
    userDictionaryEntries = [],
    userDictionaryImportProfiles = [],
  }) {
    const backupStorage = new Map(this.storage);
    const backupAutoInc = new Map(this.autoIncrement);

    try {
      if (state) {
        this.storage.set(`${STORES.APP_STATE}:state`, state);
      } else {
        this.storage.delete(`${STORES.APP_STATE}:state`);
      }

      if (lessonVersion !== undefined && lessonVersion !== null) {
        this.storage.set(`${STORES.CONTENT_CACHE}:lesson_version`, lessonVersion);
      } else {
        this.storage.delete(`${STORES.CONTENT_CACHE}:lesson_version`);
      }

      if (lastActivityDay !== undefined && lastActivityDay !== null) {
        this.storage.set(`${STORES.CONTENT_CACHE}:last_activity_day`, lastActivityDay);
      } else {
        this.storage.delete(`${STORES.CONTENT_CACHE}:last_activity_day`);
      }

      if (theme !== undefined && theme !== null) {
        this.storage.set(`${STORES.UI_PREFERENCES}:theme`, theme);
      } else {
        this.storage.delete(`${STORES.UI_PREFERENCES}:theme`);
      }

      await this.clear(STORES.REVIEW_LOG);
      if (Array.isArray(reviewLog)) {
        for (const entry of reviewLog) {
          await this.add(STORES.REVIEW_LOG, entry);
        }
      }
      const replace = (storeName, records) => {
        this.storage.set(
          `${storeName}:__records__`,
          records.map((record) => ({ ...record }))
        );
      };
      replace(STORES.USER_DICTIONARIES, userDictionaries);
      replace(STORES.USER_DICTIONARY_ENTRIES, userDictionaryEntries);
      replace(STORES.USER_DICTIONARY_IMPORT_PROFILES, userDictionaryImportProfiles);
    } catch (error) {
      this.storage = backupStorage;
      this.autoIncrement = backupAutoInc;
      throw error;
    }
  }

  isAvailable() {
    return false; // Всегда false, т.к. это fallback
  }

  async getDBSize() {
    return 0;
  }
}

/**
 * Создать экземпляр DB с автоматическим fallback
 */
async function createDB() {
  // Проверяем доступность IndexedDB
  if (!('indexedDB' in window)) {
    console.warn('[DB] IndexedDB не поддерживается браузером');
    return new InMemoryFallback();
  }

  try {
    const wrapper = new IndexedDBWrapper();
    await wrapper.initDB();
    return wrapper;
  } catch (error) {
    console.error('[DB] Не удалось инициализировать IndexedDB, используем fallback:', error);
    return new InMemoryFallback();
  }
}

// Экспортируем singleton instance
export let db = null;

// Инициализация при импорте модуля (будет вызвана явно из app.js)
export async function initializeDB() {
  if (!db) {
    db = await createDB();
  } else if (db instanceof IndexedDBWrapper && !db.isInitialized) {
    try {
      await db.initDB();
    } catch (error) {
      console.error('[DB] Ошибка повторной инициализации DB, переключение на fallback:', error);
      db = new InMemoryFallback();
    }
  }
  window.db = db;
  return db;
}

// Экспорт имён stores, схем и обёртки для использования в других модулях и тестах
export { DB_NAME, DB_VERSION, STORES, STORE_SCHEMAS, IndexedDBWrapper };
