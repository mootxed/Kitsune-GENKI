import { z } from 'zod';
import { db, initializeDB, STORES } from './db.js';
import { getReviewLogs, syncReviewLogQueue } from './review-log.js';

// Константы ключей localStorage (для обратной совместимости со старыми бэкапами)
const LS_STATE = 'kitsune_state_v1';
const LS_LESSONS = 'kitsune_lessons_v1';
const LS_LESSON_VERSION = 'kitsune_lessons_version_v1';
const LS_LAST_ACTIVITY_DAY = 'kitsune_last_activity_day';
const LS_THEME = 'kitsune_theme';

// Версия схемы для совместимости при будущих изменениях
const SCHEMA_VERSION = '5.0'; // Версия формата бэкапа (не версия схемы IndexedDB)
const LEGACY_SCHEMA_VERSIONS = new Set(['2.0', '3.0', '4.0']);

// ---------- Zod Validation Schemas ----------

export const ReviewLogEntrySchema = z
  .object({
    cardId: z.string().min(1).max(300),
    eventId: z.string().max(300).optional(),
    itemId: z.string().max(300).optional(),
    skill: z.string().max(100).optional(),
    mode: z.string().max(100).optional(),
    firstAttemptCorrect: z.boolean().optional(),
    mistakes: z.number().int().min(0).optional(),
    hintUsed: z.boolean().optional(),
    responseTimeMs: z.number().int().min(0).nullable().optional(),
    rawRating: z.number().optional(),
    effectiveRating: z.number().optional(),
    reviewedAt: z.number().int().min(0).optional(),
    timestamp: z.number().int().min(0).optional(),
    quality: z.number().optional(),
    previousStability: z.number().optional(),
    previousDifficulty: z.number().optional(),
    previousState: z.number().optional(),
  })
  .passthrough();

export const StateSchema = z
  .object({
    level: z.number().int().min(0).max(100000).optional().default(1),
    xp: z.number().min(0).max(1000000000).optional().default(0),
    coins: z.number().min(0).max(1000000000).optional().default(0),
    streak: z
      .object({
        count: z.number().min(0).max(100000).optional().default(0),
        lastActive: z.union([z.string().max(100), z.number(), z.null()]).optional(),
      })
      .passthrough()
      .optional()
      .default({ count: 0, lastActive: null }),
    settings: z
      .object({
        openrouterKey: z.string().max(2000).optional().default(''),
        model: z.string().max(300).optional(),
        notifyEnabled: z.boolean().optional(),
        notifyTime: z.string().max(50).optional(),
        notifyDays: z.array(z.number().min(0).max(6)).max(7).optional(),
        darkMode: z.string().max(50).optional(),
        hideRomaji: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    savedNotes: z
      .array(
        z
          .object({
            id: z.union([z.string().max(200), z.number()]).optional(),
            title: z.string().max(1000).optional(),
            content: z.string().max(500000).optional(),
            date: z.union([z.string().max(200), z.number()]).optional(),
          })
          .passthrough()
      )
      .max(1000)
      .optional(),
    chatHistory: z
      .array(
        z
          .object({
            role: z.string().max(100).optional(),
            content: z.string().max(100000).optional(),
          })
          .passthrough()
      )
      .max(1000)
      .optional(),
    reviewEvents: z.array(z.unknown()).max(10000).optional(),
    pendingReviewLogs: z.array(z.unknown()).max(5000).optional(),
    priorKnowledgeChapterIds: z.array(z.number()).max(1000).optional(),
    learningEvents: z.array(z.unknown()).max(10000).optional(),
    unlockedAchievements: z
      .array(z.union([z.string().max(200), z.number()]))
      .max(2000)
      .optional(),
    claimedAchievements: z
      .array(z.union([z.string().max(200), z.number()]))
      .max(2000)
      .optional(),
    unlockedAvatars: z.array(z.string().max(200)).max(200).optional(),
    unlockedStreakSkins: z.array(z.string().max(200)).max(200).optional(),
    unlockedThemes: z.array(z.string().max(200)).max(200).optional(),
    unlockedTitles: z.array(z.string().max(200)).max(200).optional(),
    history: z.record(z.string(), z.number()).optional(),
    srs: z.record(z.string(), z.unknown()).optional(),
    chapters: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const BackupSchema = z
  .object({
    app: z.string().max(100).optional(),
    exportType: z.enum(['full_indexeddb', 'full_localstorage'], {
      errorMap: () => ({ message: 'Неверный тип экспорта' }),
    }),
    schemaVersion: z
      .string()
      .optional()
      .default(SCHEMA_VERSION)
      .refine((val) => val === SCHEMA_VERSION || LEGACY_SCHEMA_VERSIONS.has(val), {
        message: `Несовместимая версия схемы данных (поддерживаются ${SCHEMA_VERSION}, 4.0, 3.0 и 2.0)`,
      }),
    timestamp: z.string().max(100).optional(),
    data: z
      .object({
        state: StateSchema,
        lessonVersion: z.string().max(100).nullable().optional(),
        lastActivityDay: z.string().max(100).nullable().optional(),
        theme: z.string().max(100).nullable().optional(),
        reviewLog: z.array(ReviewLogEntrySchema).max(50000).optional(),
      })
      .passthrough(),
  })
  .passthrough();

/**
 * Экспортирует все данные из IndexedDB (с фоллбэком на localStorage)
 * @returns {Promise<Object>} Структурированные данные для экспорта
 */
export async function exportFullProgress() {
  try {
    const database = db || (await initializeDB());
    // Читаем данные из IndexedDB
    let state = await database.get(STORES.APP_STATE, 'state');
    let lessonVersion = await database.get(STORES.CONTENT_CACHE, 'lesson_version');
    let lastActivityDay = await database.get(STORES.CONTENT_CACHE, 'last_activity_day');
    let theme = await database.get(STORES.UI_PREFERENCES, 'theme');
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
      lessonVersion =
        localStorage.getItem(LS_LESSON_VERSION) || localStorage.getItem('kitsune_lesson_version');
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
 * Валидирует структуру импортируемых данных с использованием Zod-схемы
 * @param {Object} data Данные для импорта
 * @returns {Object} { valid: boolean, error?: string, isLegacy?: boolean, data?: Object }
 */
export function validateImportData(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Данные бэкапа должны быть объектом' };
  }

  const parseResult = BackupSchema.safeParse(data);
  if (!parseResult.success) {
    const issue = parseResult.error.issues[0];
    const fieldPath = issue.path.join('.');
    const detail = fieldPath ? `${fieldPath}: ${issue.message}` : issue.message;
    return { valid: false, error: `Неверный формат бэкапа (${detail})` };
  }

  const validData = parseResult.data;
  const isLocalStorage = validData.exportType === 'full_localstorage';

  return { valid: true, isLegacy: isLocalStorage, data: validData };
}

/**
 * Импортирует данные в IndexedDB (с поддержкой старых localStorage бэкапов)
 * @param {Object} data Валидированные данные для импорта
 * @param {boolean} preserveApiKey Сохранить текущий API-ключ
 * @returns {Promise<Object>} { success: boolean, error?: string }
 */
export async function importFullProgress(data, preserveApiKey = false) {
  try {
    const database = db || (await initializeDB());

    // 1. Предварительный snapshot текущей базы данных для возможности отката (rollback)
    const snapshot = {
      state: await database.get(STORES.APP_STATE, 'state'),
      lessonVersion: await database.get(STORES.CONTENT_CACHE, 'lesson_version'),
      lastActivityDay: await database.get(STORES.CONTENT_CACHE, 'last_activity_day'),
      theme: await database.get(STORES.UI_PREFERENCES, 'theme'),
      reviewLog: await database.getAll(STORES.REVIEW_LOG),
    };

    // Получаем текущий API-ключ если нужно сохранить
    let currentApiKey = null;
    if (preserveApiKey) {
      currentApiKey = snapshot.state?.settings?.openrouterKey;
    }

    const stateToImport = data.data?.state ? { ...data.data.state } : null;

    if (stateToImport && preserveApiKey && currentApiKey) {
      if (!stateToImport.settings) stateToImport.settings = {};
      stateToImport.settings.openrouterKey = currentApiKey;
    }

    const payload = {
      state: stateToImport,
      lessonVersion: data.data?.lessonVersion ?? null,
      lastActivityDay: data.data?.lastActivityDay ?? null,
      theme: data.data?.theme ?? null,
      reviewLog: Array.isArray(data.data?.reviewLog) ? data.data.reviewLog : [],
    };

    // 2. Выполняем атомарную запись всех хранилищ через единую IndexedDB транзакцию
    try {
      await syncReviewLogQueue(() => database.atomicImport(payload));
    } catch (atomicErr) {
      console.error(
        '[Import] Ошибка при исполнении транзакции импорта, откатываем snapshot:',
        atomicErr
      );
      try {
        await syncReviewLogQueue(() => database.atomicImport(snapshot));
        console.log('[Import] БД успешно восстановлена из snapshot');
      } catch (rollbackErr) {
        console.error('[Import] Ошибка при rollback snapshot:', rollbackErr);
      }
      return { success: false, error: 'Ошибка записи данных: ' + atomicErr.message };
    }

    // 3. Синхронизируем fallback localStorage если экспорт формата full_localstorage
    if (data.exportType === 'full_localstorage') {
      try {
        if (stateToImport) {
          localStorage.setItem(LS_STATE, JSON.stringify(stateToImport));
        }
        if (payload.lessonVersion) {
          localStorage.setItem(LS_LESSON_VERSION, payload.lessonVersion);
        }
        if (payload.lastActivityDay) {
          localStorage.setItem(LS_LAST_ACTIVITY_DAY, payload.lastActivityDay);
        }
        if (payload.theme) {
          localStorage.setItem(LS_THEME, payload.theme);
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
