/* Calendar-day helpers that intentionally use the user's local timezone. */

export function formatDateKey(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const localDateKey = formatDateKey;
export const getTodayDateKey = () => formatDateKey();

/**
 * Парсит строку "YYYY-MM-DD" в локальный Date без UTC-сдвига.
 *
 * Проблема: new Date("2026-01-05") трактует строку как UTC-полночь.
 * В America/Los_Angeles (UTC-8) это Jan 4 в 16:00 → getDay() = воскресенье.
 * Эта функция всегда возвращает Jan 5 независимо от часового пояса.
 *
 * @param {string} dateStr - дата в формате "YYYY-MM-DD"
 * @returns {Date} локальный Date на начало указанного дня
 */
export function parseDateKey(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) {
    throw new Error(`[LocalDate] Неверный ключ даты: ${dateStr}`);
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const result = new Date(y, m - 1, d);
  if (result.getFullYear() !== y || result.getMonth() !== m - 1 || result.getDate() !== d) {
    throw new Error(`[LocalDate] Несуществующая дата: ${dateStr}`);
  }
  return result; // локальный конструктор, не UTC
}

export function addLocalDays(dateKey, amount) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + Number(amount || 0));
  return formatDateKey(date);
}

export function getLocalWeekday(dateKey) {
  return parseDateKey(dateKey).getDay();
}

export function startOfLocalDay(value = Date.now()) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}
