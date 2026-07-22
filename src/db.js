/* src/db.js — Promise-based обёртка над IndexedDB с graceful degradation */

const DB_NAME = 'KitsuneGenkiDB';
const DB_VERSION = 2;

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
   * Инициализация базы данных
   * @returns {Promise<void>}
   */
  async initDB() {
    if (this.isInitialized) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = new Promise((resolve, reject) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
          console.error('[DB] Ошибка открытия IndexedDB:', request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          this.db = request.result;
          this.db.onversionchange = () => this.db.close();
          this.isInitialized = true;
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

          if (!db.objectStoreNames.contains(STORES.REVIEW_LOG)) {
            const reviewLogStore = db.createObjectStore(STORES.REVIEW_LOG, {
              keyPath: 'id',
              autoIncrement: true,
            });
            reviewLogStore.createIndex('cardId', 'cardId', { unique: false });
            reviewLogStore.createIndex('timestamp', 'timestamp', { unique: false });
            reviewLogStore.createIndex('cardId_timestamp', ['cardId', 'timestamp'], {
              unique: false,
            });
            console.log('[DB] Создан store:', STORES.REVIEW_LOG);
          }
        };

        request.onblocked = () => {
          console.warn('[DB] Обновление схемы заблокировано другой открытой вкладкой');
        };
      } catch (error) {
        console.error('[DB] Исключение при открытии IndexedDB:', error);
        reject(error);
      }
    });

    return this.initializationPromise;
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

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          console.error(`[DB] Ошибка записи в ${storeName}:`, request.error);
          reject(request.error);
        };
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
  }
  return db;
}

// Экспорт имён stores для использования в других модулях
export { DB_NAME, DB_VERSION, STORES };
