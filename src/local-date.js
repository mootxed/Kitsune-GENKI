/* Calendar-day helpers that intentionally use the user's local timezone. */

export function localDateKey(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d); // локальный конструктор, не UTC
}
