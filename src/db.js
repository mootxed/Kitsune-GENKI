/* src/db.js — Promise-based обёртка над IndexedDB с graceful degradation */

const DB_NAME = 'KitsuneGenkiDB';
const DB_VERSION = 3;

// Object Stores
const STORES = {
  APP_STATE: 'app_state', // Основное состояние приложения
  CONTENT_CACHE: 'content_cache', // Кэш контента (уроки)
  UI_PREFERENCES: 'ui_preferences', // UI настройки (тема)
  REVIEW_LOG: 'review_log', // Append-only история FSRS review
};

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
      } catch (_) {
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
            } catch (_) {
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
            } catch (_) {
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

          let reviewLogStore;
          if (!db.objectStoreNames.contains(STORES.REVIEW_LOG)) {
            reviewLogStore = db.createObjectStore(STORES.REVIEW_LOG, {
              keyPath: 'id',
              autoIncrement: true,
            });
            reviewLogStore.createIndex('cardId', 'cardId', { unique: false });
            reviewLogStore.createIndex('timestamp', 'timestamp', { unique: false });
            reviewLogStore.createIndex('cardId_timestamp', ['cardId', 'timestamp'], {
              unique: false,
            });
            reviewLogStore.createIndex('eventId', 'eventId', { unique: true });
            console.log('[DB] Создан store:', STORES.REVIEW_LOG);
          } else if (event.target.transaction) {
            reviewLogStore = event.target.transaction.objectStore(STORES.REVIEW_LOG);
            if (!reviewLogStore.indexNames.contains('eventId')) {
              reviewLogStore.createIndex('eventId', 'eventId', { unique: true });
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
          resolve(result ? result.value : result);
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

        // Для app_state используем id, для остальных — key
        const data = storeName === STORES.APP_STATE ? { id: key, value } : { key, value };

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
  async atomicImport({ state, lessonVersion, lastActivityDay, theme, reviewLog }) {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      try {
        const stores = [
          STORES.APP_STATE,
          STORES.CONTENT_CACHE,
          STORES.UI_PREFERENCES,
          STORES.REVIEW_LOG,
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
            const { id: _id, ...cleanEntry } = entry;
            reviewLogStore.add(cleanEntry);
          }
        }
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
    return this.storage.get(storeKey);
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

  async delete(storeName, key) {
    const storeKey = `${storeName}:${key}`;
    this.storage.delete(storeKey);
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

  async atomicImport({ state, lessonVersion, lastActivityDay, theme, reviewLog }) {
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
  return db;
}

// Экспорт имён stores и обёртки для использования в других модулях и тестах
export { DB_NAME, DB_VERSION, STORES, IndexedDBWrapper };
