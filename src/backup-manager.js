/* backup-manager.js — Полный экспорт/импорт localStorage */

// Константы ключей localStorage
const LS_STATE = "kitsune_state_v1";
const LS_LESSONS = "kitsune_lessons_v1";
const LS_LESSON_VERSION = "kitsune_lessons_version_v1";
const LS_LAST_ACTIVITY_DAY = "kitsune_last_activity_day";
const LS_THEME = "kitsune_theme";

// Версия схемы для совместимости при будущих изменениях
const SCHEMA_VERSION = "2.0";

/**
 * Экспортирует все данные из localStorage (кроме кэша уроков)
 * @returns {Object} Структурированные данные для экспорта
 */
export function exportFullProgress() {
  try {
    const exportData = {
      app: "kitsune_genki",
      exportType: "full_localstorage",
      schemaVersion: SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      data: {
        state: JSON.parse(localStorage.getItem(LS_STATE) || "null"),
        lessonVersion: localStorage.getItem(LS_LESSON_VERSION),
        lastActivityDay: localStorage.getItem(LS_LAST_ACTIVITY_DAY),
        theme: localStorage.getItem(LS_THEME)
      }
    };

    return exportData;
  } catch (error) {
    console.error("Ошибка экспорта:", error);
    throw new Error("Не удалось создать экспорт: " + error.message);
  }
}

/**
 * Валидирует структуру импортируемых данных
 * @param {Object} data Данные для импорта
 * @returns {Object} { valid: boolean, error: string }
 */
export function validateImportData(data) {
  // Проверка формата
  if (!data.exportType || data.exportType !== "full_localstorage") {
    return { valid: false, error: "Неверный тип экспорта" };
  }

  // Проверка версии схемы
  if (!data.schemaVersion || data.schemaVersion !== SCHEMA_VERSION) {
    return { valid: false, error: `Несовместимая версия схемы данных (требуется ${SCHEMA_VERSION})` };
  }

  // Проверка обязательных полей
  if (!data.data || !data.data.state) {
    return { valid: false, error: "Отсутствуют обязательные данные" };
  }

  return { valid: true };
}

/**
 * Импортирует данные в localStorage
 * @param {Object} data Валидированные данные для импорта
 * @param {boolean} preserveApiKey Сохранить текущий API-ключ
 */
export function importFullProgress(data, preserveApiKey = false) {
  try {
    const currentApiKey = preserveApiKey 
      ? JSON.parse(localStorage.getItem(LS_STATE) || "{}")?.settings?.openrouterKey 
      : null;

    // Восстанавливаем state
    if (data.data.state) {
      const stateToImport = { ...data.data.state };
      
      // Сохраняем текущий API-ключ если нужно
      if (preserveApiKey && currentApiKey) {
        if (!stateToImport.settings) stateToImport.settings = {};
        stateToImport.settings.openrouterKey = currentApiKey;
      }
      
      localStorage.setItem(LS_STATE, JSON.stringify(stateToImport));
    }

    // Восстанавливаем остальные ключи
    if (data.data.lessonVersion) {
      localStorage.setItem(LS_LESSON_VERSION, data.data.lessonVersion);
    }
    if (data.data.lastActivityDay) {
      localStorage.setItem(LS_LAST_ACTIVITY_DAY, data.data.lastActivityDay);
    }
    if (data.data.theme) {
      localStorage.setItem(LS_THEME, data.data.theme);
    }

    return { success: true };
  } catch (error) {
    console.error("Ошибка импорта:", error);
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
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
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
  const blob = new Blob([jsonString], { type: "application/json" });
  const file = new File([blob], filename, { type: "application/json" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: "Полный бэкап Kitsune Genki",
        text: "Экспорт всех данных приложения"
      });
      return true;
    } catch (error) {
      if (error.name === "AbortError") {
        return false; // Пользователь отменил
      }
      throw error;
    }
  }
  
  return false; // Web Share API недоступен
}