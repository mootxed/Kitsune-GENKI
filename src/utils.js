/* src/utils.js — small, stateless helpers */

import { localDateKey } from './local-date.js';

export const $ = (s, r) => (r || document).querySelector(s);
export const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

export const todayStr = () => localDateKey();

export function formatTimeUntilReset() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const diff = tomorrow - now;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return `⏰ ${hours}ч ${minutes}м`;
}

export function pluralDays(n) {
  if (n % 10 === 1 && n % 100 !== 11) return 'день';
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'дня';
  return 'дней';
}

const MONTHS_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

export function monthLabel(date) {
  return `${MONTHS_RU[date.getMonth()]} ${date.getFullYear()}`;
}

export function heatmapLevel(count) {
  if (count === 0) return '0';
  if (count <= 2) return '1';
  if (count <= 5) return '2';
  if (count <= 10) return '3';
  return '4';
}
