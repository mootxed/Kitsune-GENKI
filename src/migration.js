/* src/migration.js — Автоматическая миграция данных из localStorage в IndexedDB */

import { db, STORES } from './db.js';

// Ключи localStorage, используемые приложением
const LS_KEYS = {
  STATE: 'kitsune_state_v1',
  LESSONS: 'kitsune_lessons',
  LESSON_VERSION: 'kitsune_lesson_version',
  LAST_ACTIVITY_DAY: 'kitsune_last_activity_day',
  THEME: 'kitsune_theme',
};

/**
 * Выполнить миграцию данных из localStorage в IndexedDB
 * Вызывается один раз при первом запуске приложения с новой системой хранения
 *
 * @returns {Promise<void>}
 */
export async function migrateFromLocalStorage() {
  try {
    // 1. Проверяем флаг миграции
    const migrated = await db.get(STORES.UI_PREFERENCES, 'idb_migrated');

    if (migrated) {
      console.log('[Migration] Миграция уже выполнена ранее');
      return;
    }

    console.log('[Migration] Начинаем миграцию из localStorage...');

    let migratedCount = 0;

    // 2. Мигрируем основное состояние приложения
    const stateData = localStorage.getItem(LS_KEYS.STATE);
    if (stateData) {
      try {
        const parsedState = JSON.parse(stateData);
        await db.set(STORES.APP_STATE, 'state', parsedState);
        migratedCount++;
        console.log('[Migration] ✓ Основное состояние перенесено');
      } catch (err) {
        console.error('[Migration] Ошибка парсинга state:', err);
      }
    }

    // 3. Мигрируем кэш уроков
    const lessonsData = localStorage.getItem(LS_KEYS.LESSONS);
    if (lessonsData) {
      try {
        const parsedLessons = JSON.parse(lessonsData);
        await db.set(STORES.CONTENT_CACHE, 'lessons', parsedLessons);
        migratedCount++;
        console.log('[Migration] ✓ Кэш уроков перенесён');
      } catch (err) {
        console.error('[Migration] Ошибка парсинга lessons:', err);
      }
    }

    // 4. Мигрируем версию уроков
    const lessonVersion = localStorage.getItem(LS_KEYS.LESSON_VERSION);
    if (lessonVersion) {
      await db.set(STORES.CONTENT_CACHE, 'lesson_version', lessonVersion);
      migratedCount++;
      console.log('[Migration] ✓ Версия контента перенесена');
    }

    // 5. Мигрируем последний день активности
    const lastActivityDay = localStorage.getItem(LS_KEYS.LAST_ACTIVITY_DAY);
    if (lastActivityDay) {
      await db.set(STORES.CONTENT_CACHE, 'last_activity_day', lastActivityDay);
      migratedCount++;
      console.log('[Migration] ✓ Последний день активности перенесён');
    }

    // 6. Мигрируем тему
    const theme = localStorage.getItem(LS_KEYS.THEME);
    if (theme) {
      await db.set(STORES.UI_PREFERENCES, 'theme', theme);
      migratedCount++;
      console.log('[Migration] ✓ Тема перенесена');
    }

    // 7. Устанавливаем флаг успешной миграции
    await db.set(STORES.UI_PREFERENCES, 'idb_migrated', true);
    console.log(`[Migration] ✅ Миграция завершена. Перенесено записей: ${migratedCount}`);

    // 8. Опционально: очищаем localStorage (оставляем для совместимости)
    // Это можно раскомментировать в будущем, когда уверены что миграция работает стабильно
    // cleanupLocalStorage();
  } catch (error) {
    console.error('[Migration] Критическая ошибка миграции:', error);
    throw error;
  }
}

/**
 * Очистка старых ключей localStorage (опционально)
 * Вызывается только после успешной миграции
 *
 * @private
 */
function cleanupLocalStorage() {
  try {
    Object.values(LS_KEYS).forEach((key) => {
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
        console.log(`[Migration] Удалён старый ключ: ${key}`);
      }
    });
    console.log('[Migration] localStorage очищен');
  } catch (error) {
    console.warn('[Migration] Не удалось очистить localStorage:', error);
  }
}

/**
 * Проверить статус миграции
 * Полезно для диагностики
 *
 * @returns {Promise<boolean>}
 */
export async function isMigrationComplete() {
  try {
    const migrated = await db.get(STORES.UI_PREFERENCES, 'idb_migrated');
    return !!migrated;
  } catch {
    return false;
  }
}

/**
 * Сбросить флаг миграции (для тестирования)
 * НЕ использовать в продакшене!
 *
 * @returns {Promise<void>}
 */
export async function resetMigrationFlag() {
  try {
    await db.delete(STORES.UI_PREFERENCES, 'idb_migrated');
    console.warn('[Migration] Флаг миграции сброшен');
  } catch (error) {
    console.error('[Migration] Ошибка сброса флага:', error);
  }
}
