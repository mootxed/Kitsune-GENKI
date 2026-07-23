import { describe, expect, it } from 'vitest';
import { addLocalDays, formatDateKey, getLocalWeekday, parseDateKey } from '../src/local-date.js';

describe('local calendar dates', () => {
  it('парсит YYYY-MM-DD как локальную полночь', () => {
    const date = parseDateKey('2026-01-05');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(5);
    expect(date.getHours()).toBe(0);
    expect(getLocalWeekday('2026-01-05')).toBe(1);
  });

  it('переходит через DST календарными днями без UTC-сдвига', () => {
    expect(addLocalDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addLocalDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addLocalDays('2026-11-01', 1)).toBe('2026-11-02');
  });

  it('форматирует локальную дату обратно в тот же ключ', () => {
    expect(formatDateKey(parseDateKey('2026-12-31'))).toBe('2026-12-31');
  });

  it('отклоняет несуществующую дату', () => {
    expect(() => parseDateKey('2026-02-30')).toThrow('Несуществующая дата');
  });
});
