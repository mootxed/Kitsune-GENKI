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
  if (entry.eventId) {
    if (typeof entry.eventId !== 'string' || entry.eventId.length === 0) {
      throw new Error('[ReviewLog] eventId обязателен');
    }
    if (typeof entry.itemId !== 'string' || entry.itemId.length === 0) {
      throw new Error('[ReviewLog] itemId обязателен');
    }
    if (typeof entry.skill !== 'string' || entry.skill.length === 0) {
      throw new Error('[ReviewLog] skill обязателен');
    }
    if (typeof entry.mode !== 'string' || entry.mode.length === 0) {
      throw new Error('[ReviewLog] mode обязателен');
    }
    if (typeof entry.firstAttemptCorrect !== 'boolean') {
      throw new Error('[ReviewLog] firstAttemptCorrect обязателен');
    }
    if (!Number.isInteger(entry.mistakes) || entry.mistakes < 0) {
      throw new Error('[ReviewLog] Некорректное количество ошибок');
    }
    if (typeof entry.hintUsed !== 'boolean') {
      throw new Error('[ReviewLog] hintUsed обязателен');
    }
    if (
      entry.responseTimeMs !== null &&
      (!Number.isInteger(entry.responseTimeMs) || entry.responseTimeMs < 0)
    ) {
      throw new Error('[ReviewLog] Некорректное время ответа');
    }
    if (![0, 3, 4, 5].includes(entry.rawRating) || ![0, 3, 4, 5].includes(entry.effectiveRating)) {
      throw new Error('[ReviewLog] Некорректный rating');
    }
    if (!Number.isInteger(entry.reviewedAt) || entry.reviewedAt < 0) {
      throw new Error('[ReviewLog] Некорректный reviewedAt');
    }
    if (entry.eventType === 'undo') {
      if (typeof entry.targetEventId !== 'string' || entry.targetEventId.length === 0) {
        throw new Error('[ReviewLog] targetEventId обязателен для Undo');
      }
      if (!Number.isInteger(entry.reviewedAt) || entry.reviewedAt < 0) {
        throw new Error('[ReviewLog] Некорректный reviewedAt');
      }
      return;
    }
    const hasLegacySnapshots = entry.previousCard && entry.nextCard;
    const hasCompactFsrs =
      entry.fsrs &&
      [1, 2, 3, 4].includes(entry.fsrs.rating) &&
      Number.isInteger(entry.fsrs.state) &&
      Number.isFinite(entry.fsrs.stability) &&
      Number.isFinite(entry.fsrs.difficulty) &&
      Number.isInteger(entry.fsrs.review);
    if (!hasLegacySnapshots && !hasCompactFsrs) {
      throw new Error('[ReviewLog] FSRS-поля обязательны');
    }
    if (entry.undoneAt !== null && (!Number.isInteger(entry.undoneAt) || entry.undoneAt < 0)) {
      throw new Error('[ReviewLog] Некорректный undoneAt');
    }
    return;
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
      return immutableEntry.eventId
        ? database.addUnique(STORES.REVIEW_LOG, 'eventId', immutableEntry.eventId, immutableEntry)
        : database.add(STORES.REVIEW_LOG, immutableEntry);
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
  return entries.sort(
    (a, b) => (a.reviewedAt ?? a.timestamp) - (b.reviewedAt ?? b.timestamp) || a.id - b.id
  );
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
        if (entry.eventId) {
          await database.addUnique(STORES.REVIEW_LOG, 'eventId', entry.eventId, entry);
        } else {
          await database.add(STORES.REVIEW_LOG, entry);
        }
      }
    });

  return writeQueue;
}

export { validateReviewLogEntry };
