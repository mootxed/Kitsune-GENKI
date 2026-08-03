/* src/openrouter-key.js — Isolated OpenRouter API key management (BYOK) */

import { db, STORES } from './db.js';
import { safeStorage } from './safe-storage.js';

const LS_KEY = 'kitsune_openrouter_key';
const DB_PREF_KEY = 'openrouter_api_key';

let cachedApiKey = null;

/**
 * Получить API-ключ OpenRouter
 * @returns {string}
 */
export function getOpenRouterKey() {
  if (cachedApiKey !== null) {
    return cachedApiKey;
  }
  const lsVal = safeStorage.getItem(LS_KEY);
  if (lsVal) {
    cachedApiKey = lsVal.trim();
    return cachedApiKey;
  }
  return '';
}

/**
 * Асинхронно загрузить API-ключ из IndexedDB в кэш
 * @returns {Promise<string>}
 */
export async function loadOpenRouterKeyFromDB() {
  try {
    if (db && typeof db.get === 'function') {
      const dbVal = await db.get(STORES.UI_PREFERENCES, DB_PREF_KEY);
      if (typeof dbVal === 'string' && dbVal.trim()) {
        cachedApiKey = dbVal.trim();
        safeStorage.setItem(LS_KEY, cachedApiKey);
        return cachedApiKey;
      }
    }
  } catch (err) {
    console.warn('[OpenRouterKey] Ошибка чтения из IndexedDB:', err);
  }
  return getOpenRouterKey();
}

/**
 * Сохранить API-ключ OpenRouter в изолированном хранилище
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function setOpenRouterKey(key) {
  const trimmed = (key || '').trim();
  cachedApiKey = trimmed;

  if (trimmed) {
    safeStorage.setItem(LS_KEY, trimmed);
  } else {
    safeStorage.removeItem(LS_KEY);
  }

  try {
    if (db && typeof db.set === 'function') {
      if (trimmed) {
        await db.set(STORES.UI_PREFERENCES, DB_PREF_KEY, trimmed);
      } else {
        await db.delete(STORES.UI_PREFERENCES, DB_PREF_KEY);
      }
    }
  } catch (err) {
    console.warn('[OpenRouterKey] Ошибка сохранения в IndexedDB:', err);
  }
}

/**
 * Удалить API-ключ OpenRouter
 * @returns {Promise<void>}
 */
export async function clearOpenRouterKey() {
  await setOpenRouterKey('');
}

/**
 * Миграция легаси-ключа из state.settings.openrouterKey в изолированное хранилище
 * @param {Object} state
 * @returns {boolean} true если ключ был мигрирован
 */
export function migrateLegacyOpenRouterKey(state) {
  if (state?.settings?.openrouterKey) {
    const legacyKey = state.settings.openrouterKey.trim();
    if (legacyKey) {
      setOpenRouterKey(legacyKey);
    }
    delete state.settings.openrouterKey;
    return true;
  }
  return false;
}
