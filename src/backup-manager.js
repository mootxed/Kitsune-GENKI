/* backup-manager.js — Полный экспорт/импорт данных приложения */

import { db, STORES } from './db.js';
import { getReviewLogs, replaceReviewLogs } from './review-log.js';

// Константы ключей localStorage (для обратной совместимости со старыми бэкапами)
const LS_STATE = 'kitsune_state_v1';
const LS_LESSONS = 'kitsune_lessons_v1';
const LS_LESSON_VERSION = 'kitsune_lessons_version_v1';
const LS_LAST_ACTIVITY_DAY = 'kitsune_last_activity_day';
const LS_THEME = 'kitsune_theme';

// Версия схемы для совместимости при будущих изменениях
const SCHEMA_VERSION = '3.0'; // Версия формата бэкапа (не версия схемы IndexedDB)
const LEGACY_SCHEMA_VERSION = '2.0'; // localStorage версия

/**
 * Экспортирует все данные из IndexedDB (с фоллбэком на localStorage)
 * @returns {Promise<Object>} Структурированные данные для экспорта
 */
export async function exportFullProgress() {
  try {
    // Читаем данные из IndexedDB
    let state = await db.get(STORES.APP_STATE, 'state');
    let lessonVersion = await db.get(STORES.CONTENT_CACHE, 'lesson_version');
    let lastActivityDay = await db.get(STORES.CONTENT_CACHE, 'last_activity_day');
    let theme = await db.get(STORES.UI_PREFERENCES, 'theme');
    const reviewLog = await getReviewLogs();

    // Фоллбэк на localStorage если IndexedDB пустой
    if (!state) {
      console.warn('[Export] State не найден в IndexedDB, пробую localStorage...');
      const lsState = localStorage.getItem(LS_STATE);
      if (lsState) {
        try {
          state = JSON.parse(lsState);
          console.log('[Export] State восстановлен из localStorage');
        } catch (e) {
          console.error('[Export] Ошибка парсинга localStorage state:', e);
        }
      }
    }

    if (!lessonVersion) {
      lessonVersion = localStorage.getItem(LS_LESSON_VERSION);
    }
    if (!lastActivityDay) {
      lastActivityDay = localStorage.getItem(LS_LAST_ACTIVITY_DAY);
    }
    if (!theme) {
      theme = localStorage.getItem(LS_THEME);
    }

    // Проверяем, что хотя бы state есть
    if (!state) {
      throw new Error('Нет данных для экспорта. Попробуйте сначала пройти хотя бы один урок.');
    }

    console.log('[Export] Данные для экспорта:', {
      hasState: !!state,
      stateKeys: state ? Object.keys(state) : [],
      lessonVersion,
      lastActivityDay,
      theme,
    });

    const exportData = {
      app: 'kitsune_genki',
      exportType: 'full_indexeddb',
      schemaVersion: SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      data: {
        state,
        lessonVersion,
        lastActivityDay,
        theme,
        reviewLog,
      },
    };

    return exportData;
  } catch (error) {
    console.error('[Export] Ошибка экспорта:', error);
    throw new Error('Не удалось создать экспорт: ' + error.message);
  }
}

/**
 * Валидирует структуру импортируемых данных
 * @param {Object} data Данные для импорта
 * @returns {Object} { valid: boolean, error: string, isLegacy: boolean }
 */
export function validateImportData(data) {
  // Проверка формата
  const isIndexedDB = data.exportType === 'full_indexeddb';
  const isLocalStorage = data.exportType === 'full_localstorage';

  if (!isIndexedDB && !isLocalStorage) {
    return { valid: false, error: 'Неверный тип экспорта' };
  }

  // Проверка версии схемы
  const isCurrentVersion = data.schemaVersion === SCHEMA_VERSION;
  const isLegacyVersion = data.schemaVersion === LEGACY_SCHEMA_VERSION;

  if (!isCurrentVersion && !isLegacyVersion) {
    return {
      valid: false,
      error: `Несовместимая версия схемы данных (требуется ${SCHEMA_VERSION} или ${LEGACY_SCHEMA_VERSION})`,
    };
  }

  // Проверка обязательных полей
  if (!data.data || !data.data.state) {
    return { valid: false, error: 'Отсутствуют обязательные данные' };
  }

  return { valid: true, isLegacy: isLocalStorage };
}

/**
 * Импортирует данные в IndexedDB (с поддержкой старых localStorage бэкапов)
 * @param {Object} data Валидированные данные для импорта
 * @param {boolean} preserveApiKey Сохранить текущий API-ключ
 * @returns {Promise<Object>} { success: boolean, error?: string }
 */
export async function importFullProgress(data, preserveApiKey = false) {
  try {
    // Получаем текущий API-ключ если нужно сохранить
    let currentApiKey = null;
    if (preserveApiKey) {
      const currentState = await db.get(STORES.APP_STATE, 'state');
      currentApiKey = currentState?.settings?.openrouterKey;
    }

    // Восстанавливаем state
    if (data.data.state) {
      const stateToImport = { ...data.data.state };

      // Сохраняем текущий API-ключ если нужно
      if (preserveApiKey && currentApiKey) {
        if (!stateToImport.settings) stateToImport.settings = {};
        stateToImport.settings.openrouterKey = currentApiKey;
      }

      await db.set(STORES.APP_STATE, 'state', stateToImport);
    }

    // Восстанавливаем остальные данные
    if (data.data.lessonVersion) {
      await db.set(STORES.CONTENT_CACHE, 'lesson_version', data.data.lessonVersion);
    }
    if (data.data.lastActivityDay) {
      await db.set(STORES.CONTENT_CACHE, 'last_activity_day', data.data.lastActivityDay);
    }
    if (data.data.theme) {
      await db.set(STORES.UI_PREFERENCES, 'theme', data.data.theme);
    }

    // Старые бэкапы не содержат журнал: в этом случае импортируем пустую историю.
    await replaceReviewLogs(data.data.reviewLog);

    // Если импортируем старый бэкап (localStorage), также пишем в localStorage для совместимости
    if (data.exportType === 'full_localstorage') {
      try {
        if (data.data.state) {
          localStorage.setItem(LS_STATE, JSON.stringify(data.data.state));
        }
        if (data.data.lessonVersion) {
          localStorage.setItem(LS_LESSON_VERSION, data.data.lessonVersion);
        }
        if (data.data.lastActivityDay) {
          localStorage.setItem(LS_LAST_ACTIVITY_DAY, data.data.lastActivityDay);
        }
        if (data.data.theme) {
          localStorage.setItem(LS_THEME, data.data.theme);
        }
      } catch (e) {
        console.warn('Не удалось записать в localStorage (фоллбэк):', e);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Ошибка импорта:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Скачивает JSON файл
 * @param {Object} data Данные для скачивания
 * @param {string} filename Имя файла
 */
export function downloadJSON(data, filename) {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Делится файлом через Web Share API (для мобильных)
 * @param {Object} data Данные для отправки
 * @param {string} filename Имя файла
 * @returns {Promise<boolean>} true если поделились успешно
 */
export async function shareJSON(data, filename) {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const file = new File([blob], filename, { type: 'application/json' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Полный бэкап Kitsune Genki',
        text: 'Экспорт всех данных приложения',
      });
      return true;
    } catch (error) {
      if (error.name === 'AbortError') {
        return false; // Пользователь отменил
      }
      throw error;
    }
  }

  return false; // Web Share API недоступен
}
