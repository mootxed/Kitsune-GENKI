/* src/storage-status-ui.js — Clear App Status Messaging (Offline, Update Ready, Emergency Storage Fallback) */

import { db, IndexedDBWrapper } from './db.js';

export const SYSTEM_STATUSES = {
  OFFLINE: 'работаем офлайн',
  UPDATE_READY: 'обновление готово',
  EMERGENCY_STORAGE: 'хранилище работает в аварийном режиме',
  ONLINE: 'онлайн',
};

let currentStatusState = {
  isOffline: false,
  isUpdateReady: false,
  isEmergencyStorage: false,
};

const listeners = new Set();

/**
 * Получить список текущих сообщений состояния приложения
 * @returns {string[]}
 */
export function getActiveStatusMessages() {
  const messages = [];

  if (currentStatusState.isEmergencyStorage) {
    messages.push(SYSTEM_STATUSES.EMERGENCY_STORAGE);
  }
  if (currentStatusState.isOffline) {
    messages.push(SYSTEM_STATUSES.OFFLINE);
  }
  if (currentStatusState.isUpdateReady) {
    messages.push(SYSTEM_STATUSES.UPDATE_READY);
  }

  return messages;
}

/**
 * Оповестить подписчиков об изменении состояния
 */
function notifyListeners() {
  const messages = getActiveStatusMessages();
  listeners.forEach((fn) => {
    try {
      fn(messages, { ...currentStatusState });
    } catch (err) {
      console.warn('[StorageStatusUI] Listener error:', err);
    }
  });
}

/**
 * Обновить флаги состояния
 * @param {Partial<typeof currentStatusState>} nextState
 */
export function setSystemStatus(nextState) {
  currentStatusState = {
    ...currentStatusState,
    ...nextState,
  };
  notifyListeners();
}

/**
 * Подписаться на изменение состояния приложения
 * @param {Function} listener
 * @returns {Function} Unsubscribe handler
 */
export function subscribeSystemStatus(listener) {
  listeners.add(listener);
  listener(getActiveStatusMessages(), { ...currentStatusState });
  return () => listeners.delete(listener);
}

/**
 * Проверить состояние IndexedDB на предмет аварийного (in-memory) режима
 */
export function checkStorageHealth() {
  const isFallback = !db || !(db instanceof IndexedDBWrapper);
  setSystemStatus({ isEmergencyStorage: isFallback });
  return isFallback;
}

/**
 * Инициализировать обработчики состояния сети и системных статусов
 */
export function initSystemStatusListeners() {
  if (typeof window !== 'undefined') {
    const updateNetworkStatus = () => {
      setSystemStatus({ isOffline: !navigator.onLine });
    };

    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    updateNetworkStatus();

    checkStorageHealth();
  }
}
