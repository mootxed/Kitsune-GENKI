/* src/review-log.js — append-only журнал событий FSRS review */

import { db, initializeDB, STORES } from './db.js';

let writeQueue = Promise.resolve();

function validateReviewLogEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('[ReviewLog] Запись должна быть объектом');
  }
  if (typeof entry.cardId !== 'string' || entry.cardId.length === 0) {
    throw new Error('[ReviewLog] cardId обязателен');
  }
  if (![0, 3, 4, 5].includes(entry.quality)) {
    throw new Error(`[ReviewLog] Некорректный quality: ${entry.quality}`);
  }
  if (typeof entry.mode !== 'string' || entry.mode.length === 0) {
    throw new Error('[ReviewLog] mode обязателен');
  }
  if (
    entry.responseTimeMs !== null &&
    (!Number.isInteger(entry.responseTimeMs) || entry.responseTimeMs < 0)
  ) {
    throw new Error(`[ReviewLog] Некорректное время ответа: ${entry.responseTimeMs}`);
  }
  if (!Number.isInteger(entry.timestamp) || entry.timestamp < 0) {
    throw new Error(`[ReviewLog] Некорректный timestamp: ${entry.timestamp}`);
  }
  if (!Number.isFinite(entry.previousStability) || entry.previousStability < 0) {
    throw new Error(`[ReviewLog] Некорректная previousStability: ${entry.previousStability}`);
  }
  if (!Number.isFinite(entry.previousDifficulty) || entry.previousDifficulty < 0) {
    throw new Error(`[ReviewLog] Некорректная previousDifficulty: ${entry.previousDifficulty}`);
  }
  if (!Number.isInteger(entry.previousState) || entry.previousState < 0) {
    throw new Error(`[ReviewLog] Некорректный previousState: ${entry.previousState}`);
  }
}

/**
 * Последовательно добавляет событие review, сохраняя порядок даже при быстрых ответах.
 */
export function appendReviewLog(entry) {
  const immutableEntry = { ...entry };
  validateReviewLogEntry(immutableEntry);

  writeQueue = writeQueue
    .catch(() => undefined)
    .then(async () => {
      const database = db || (await initializeDB());
      return database.add(STORES.REVIEW_LOG, immutableEntry);
    });

  return writeQueue;
}

/**
 * Возвращает журнал в хронологическом порядке для экспорта/обучения.
 */
export async function getReviewLogs() {
  await writeQueue.catch(() => undefined);
  const database = db || (await initializeDB());
  const entries = await database.getAll(STORES.REVIEW_LOG);
  return entries.sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
}

export async function getReviewLogsForCard(cardId) {
  const entries = await getReviewLogs();
  return entries.filter((entry) => entry.cardId === cardId);
}

export function clearReviewLogs() {
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(async () => {
      const database = db || (await initializeDB());
      await database.clear(STORES.REVIEW_LOG);
    });
  return writeQueue;
}

export function replaceReviewLogs(entries) {
  const normalizedEntries = Array.isArray(entries)
    ? entries.map(({ id: _id, ...entry }) => {
        validateReviewLogEntry(entry);
        return entry;
      })
    : [];

  writeQueue = writeQueue
    .catch(() => undefined)
    .then(async () => {
      const database = db || (await initializeDB());
      await database.clear(STORES.REVIEW_LOG);
      for (const entry of normalizedEntries) {
        await database.add(STORES.REVIEW_LOG, entry);
      }
    });

  return writeQueue;
}

export { validateReviewLogEntry };
