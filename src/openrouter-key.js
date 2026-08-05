/* src/openrouter-key.js — Isolated OpenRouter API key management (BYOK, memory/tab lifetime) */

import { db, STORES } from './db.js';
import { safeStorage } from './safe-storage.js';

const LS_KEY = 'kitsune_openrouter_key';
const DB_PREF_KEY = 'openrouter_api_key';
const SS_KEY = 'kitsune_openrouter_key';

let cachedApiKey = null;

/**
 * Удалить легаси-копии API-ключа из localStorage и IndexedDB
 * @param {Object} [state]
 */
export async function purgeLegacyOpenRouterKeys(state) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LS_KEY);
    }
    safeStorage.removeItem(LS_KEY);
  } catch {
    // ignore storage errors
  }

  try {
    if (db && typeof db.delete === 'function') {
      await db.delete(STORES.UI_PREFERENCES, DB_PREF_KEY).catch(() => {});
    }
  } catch {
    // ignore DB errors
  }

  if (state?.settings?.openrouterKey) {
    delete state.settings.openrouterKey;
  }
}

/**
 * Получить API-ключ OpenRouter (только в памяти текущей вкладки / sessionStorage)
 * @returns {string}
 */
export function getOpenRouterKey() {
  if (cachedApiKey !== null) {
    return cachedApiKey;
  }
  try {
    if (typeof sessionStorage !== 'undefined') {
      const ssVal = sessionStorage.getItem(SS_KEY);
      if (ssVal) {
        cachedApiKey = ssVal.trim();
        return cachedApiKey;
      }
    }
  } catch {
    // ignore
  }
  return '';
}

/**
 * Асинхронно очистить легаси-копии из IndexedDB и возвратить ключ из памяти/sessionStorage
 * @param {Object} [state]
 * @returns {Promise<string>}
 */
export async function loadOpenRouterKeyFromDB(state) {
  await purgeLegacyOpenRouterKeys(state);
  return getOpenRouterKey();
}

/**
 * Сохранить API-ключ OpenRouter (в памяти и sessionStorage текущей вкладки)
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function setOpenRouterKey(key) {
  const trimmed = (key || '').trim();
  cachedApiKey = trimmed;

  try {
    if (typeof sessionStorage !== 'undefined') {
      if (trimmed) {
        sessionStorage.setItem(SS_KEY, trimmed);
      } else {
        sessionStorage.removeItem(SS_KEY);
      }
    }
  } catch {
    // ignore
  }

  await purgeLegacyOpenRouterKeys();
}

/**
 * Удалить API-ключ OpenRouter
 * @returns {Promise<void>}
 */
export async function clearOpenRouterKey() {
  cachedApiKey = '';
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(SS_KEY);
    }
  } catch {
    // ignore
  }
  await purgeLegacyOpenRouterKeys();
}

/**
 * Удаление легаси-ключа из state без сохранения в фоновое хранилище
 * @param {Object} state
 * @returns {boolean} true если легаси-ключ был удалён
 */
export function migrateLegacyOpenRouterKey(state) {
  let hadKey = false;
  if (state?.settings?.openrouterKey) {
    delete state.settings.openrouterKey;
    hadKey = true;
  }
  purgeLegacyOpenRouterKeys(state);
  return hadKey;
}
