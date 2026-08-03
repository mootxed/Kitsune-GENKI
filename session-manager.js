/* session-manager.js — Intra-session learning logic for SRS & active session persistence */

import { db, STORES } from './src/db.js';
import { broadcastSessionEnded } from './src/tab-sync.js';
import { canonicalizeCardId, canonicalLessonId } from './src/courses/course-context.js';

let sessionPersistenceGeneration = 0;
let sessionSaveQueue = Promise.resolve();

export async function saveSessionToDB(sessionData) {
  if (!db) return;
  const currentGen = sessionPersistenceGeneration;
  sessionSaveQueue = sessionSaveQueue
    .catch(() => undefined)
    .then(async () => {
      if (currentGen !== sessionPersistenceGeneration) {
        return;
      }
      try {
        const record = {
          id: 'current',
          data: sessionData,
          updatedAt: Date.now(),
        };
        if (typeof db.putRecord === 'function') {
          await db.putRecord(STORES.ACTIVE_SESSION, record);
        } else if (typeof db.set === 'function') {
          await db.set(STORES.ACTIVE_SESSION, 'current', record);
        }
      } catch (err) {
        console.warn('[SessionManager] Failed to save active session to DB:', err);
      }
    });
  return sessionSaveQueue;
}

export async function loadSessionFromDB() {
  if (!db || typeof db.get !== 'function') return null;
  try {
    const record = await db.get(STORES.ACTIVE_SESSION, 'current');
    return record ? normalizeSessionCourseReferences(record.data) : null;
  } catch (err) {
    console.warn('[SessionManager] Failed to load active session from DB:', err);
    return null;
  }
}

export function normalizeSessionCourseReferences(record) {
  if (!record || typeof record !== 'object') return record;
  const result =
    typeof globalThis.structuredClone === 'function'
      ? globalThis.structuredClone(record)
      : JSON.parse(JSON.stringify(record));
  if (result.chapterId != null) result.chapterId = canonicalLessonId(result.chapterId);
  if (result.sessionOrigin?.chapterId != null) {
    result.sessionOrigin.chapterId = canonicalLessonId(result.sessionOrigin.chapterId);
  }
  if (Array.isArray(result.sessionOrigin?.initialCardIds)) {
    result.sessionOrigin.initialCardIds =
      result.sessionOrigin.initialCardIds.map(canonicalizeCardId);
  }
  for (const item of result.managerState?.queue || []) {
    if (item.cardId) item.cardId = canonicalizeCardId(item.cardId);
    if (item.card?.id) {
      item.card.id = canonicalizeCardId(item.card.id);
      if (item.card.itemId) {
        item.card.itemId = canonicalizeCardId(item.card.itemId);
      }
    }
  }
  const normalizeSessionCard = (card) => {
    if (typeof card === 'string') return canonicalizeCardId(card);
    if (card && typeof card === 'object') {
      if (card?.id) card.id = canonicalizeCardId(card.id);
      if (card?.itemId) card.itemId = canonicalizeCardId(card.itemId);
    }
    return card;
  };
  for (const batch of result.batcherState?.batches || []) {
    const cards = batch?.cards || batch || [];
    if (!Array.isArray(cards)) continue;
    const normalizedCards = cards.map(normalizeSessionCard);
    if (Array.isArray(batch)) {
      batch.splice(0, batch.length, ...normalizedCards);
    } else {
      batch.cards = normalizedCards;
    }
  }
  if (Array.isArray(result.batcherState?.totalCards)) {
    result.batcherState.totalCards = result.batcherState.totalCards.map(normalizeSessionCard);
  }
  return result;
}

export function clearSessionFromDB() {
  sessionPersistenceGeneration++;
  broadcastSessionEnded();
  if (!db) return Promise.resolve();

  sessionSaveQueue = sessionSaveQueue
    .catch(() => undefined)
    .then(async () => {
      if (typeof db.delete !== 'function') return;
      try {
        await db.delete(STORES.ACTIVE_SESSION, 'current');
      } catch (err) {
        console.warn('[SessionManager] Failed to clear active session from DB:', err);
      }
    });

  return sessionSaveQueue;
}

export function validateSessionRecord(record) {
  if (!record || typeof record !== 'object') return false;
  if (record.schemaVersion !== 1) return false;
  if (!record.managerState || typeof record.managerState !== 'object') return false;
  if (!Array.isArray(record.managerState.queue)) return false;

  const stats = record.managerState.stats;
  if (stats && typeof stats === 'object') {
    for (const key of ['reviewed', 'remaining', 'total']) {
      if (stats[key] !== undefined && (!Number.isFinite(stats[key]) || stats[key] < 0)) {
        return false;
      }
    }
  }

  if (record.batcherState) {
    if (typeof record.batcherState !== 'object') return false;
    if (!Array.isArray(record.batcherState.batches)) return false;
    const currentIdx = record.currentBatchIndex ?? 0;
    if (
      !Number.isInteger(currentIdx) ||
      currentIdx < 0 ||
      currentIdx >= record.batcherState.batches.length
    ) {
      return false;
    }
  }

  return true;
}

/**
 * SessionManager управляет очередью карточек внутри одной сессии обучения.

 * Реализует логику краткосрочного повторения при ошибках.
 *
 * Основной принцип: "первая попытка" — только при первом показе карточки
 * в сессии применяется полный FSRS алгоритм. Последующие попытки
 * (если была ошибка) — только внутрисессионное переучивание.
 */
class SessionManager {
  constructor(cards, dependencies = {}) {
    // Извлекаем зависимости
    const {
      srs = null, // SRS объект с методом review()
      questsManager = null, // QuestsManager с методами trackCardCompleted() и trackStreak()
      state = null, // state объект (если нужен в будущем)
      onSave = null, // функция сохранения (если нужна в будущем)
    } = dependencies;

    // Сохраняем как свойства экземпляра
    this.srs = srs;
    this.questsManager = questsManager;
    this.state = state;
    this.onSave = onSave;

    // Очередь карточек с метаданными для сессии
    this.queue = cards.map((card) => ({
      card, // оригинальная карточка из state.srs
      forcedMode: card.forcedMode || null, // принудительный режим карточки (для 4-блочной структуры)
      sessionLapses: 0, // количество ошибок в текущей сессии
      isFirstAttempt: true, // флаг первой попытки
      completed: false, // завершена ли карточка в сессии
    }));

    // Статистика сессии
    this.stats = {
      total: cards.length,
      reviewed: 0,
      attempted: 0, // уникальных карточек, по которым была попытка (первая попытка)
      perfect: 0, // без ошибок
      relearned: 0, // с ошибками, но выучены
      remaining: cards.length,
    };

    // Базовые шаги откидывания в зависимости от качества ответа
    this.backtrackSteps = {
      0: 10, // Again → 10 позиций назад
    };

    this.currentIndex = 0;
  }

  /**
   * Получить следующую карточку для показа
   * @returns {Object|null} карточка или null если сессия завершена
   */
  getNextCard() {
    // Фильтруем только незавершённые карточки
    const activeQueue = this.queue.filter((item) => !item.completed);

    if (activeQueue.length === 0) {
      return null; // сессия завершена
    }

    // Берём первую незавершённую карточку
    const item = activeQueue[0];
    return {
      ...item.card,
      forcedMode: item.forcedMode,
      sessionLapses: item.sessionLapses,
      isFirstAttempt: item.isFirstAttempt,
    };
  }

  /**
   * Получить состояние карточки в текущей сессии
   * @param {string} cardId - ID карточки
   * @returns {Object|null} метаданные карточки или null если не найдена
   */
  getCardState(cardId) {
    const item = this.queue.find((item) => item.card.id === cardId && !item.completed);
    if (!item) {
      return null;
    }
    return {
      sessionLapses: item.sessionLapses,
      isFirstAttempt: item.isFirstAttempt,
      completed: item.completed,
    };
  }

  /**
   * Создать снимок изменяемого состояния сессии для отмены ответа.
   */
  createSnapshot() {
    return {
      queue: this.queue.map((item) => ({
        cardId: item.card.id,
        forcedMode: item.forcedMode,
        sessionLapses: item.sessionLapses,
        isFirstAttempt: item.isFirstAttempt,
        completed: item.completed,
      })),
      stats: { ...this.stats },
    };
  }

  /**
   * Восстановить очередь и статистику без замены ссылок на карточки.
   */
  restoreSnapshot(snapshot) {
    if (!snapshot?.queue || !snapshot?.stats) return false;

    const currentItems = new Map(this.queue.map((item) => [item.card.id, item]));
    const restoredQueue = [];

    for (const saved of snapshot.queue) {
      const item = currentItems.get(saved.cardId);
      if (!item) return false;
      restoredQueue.push({
        ...item,
        forcedMode: saved.forcedMode,
        sessionLapses: saved.sessionLapses,
        isFirstAttempt: saved.isFirstAttempt,
        completed: saved.completed,
      });
    }

    this.queue = restoredQueue;
    this.stats = { ...snapshot.stats };
    return true;
  }

  /**
   * Обработать ответ пользователя на карточку
   * @param {string} cardId - ID карточки
   * @param {number} quality - качество ответа (0-5)
   * @param {Object} srsCollection - коллекция карточек из state.srs (объект с ключами-ID)
   * @param {Object|null} reviewContext - mode и responseTimeMs для review log
   */
  answerCard(cardId, quality, srsCollection, reviewContext = null) {
    // Найти карточку в очереди
    const queueIndex = this.queue.findIndex((item) => item.card.id === cardId && !item.completed);

    if (queueIndex === -1) {
      console.warn('Карточка не найдена в очереди:', cardId);
      return null;
    }

    const item = this.queue[queueIndex];
    // Only Again means retrieval failed. Hard is a successful first recall
    // with explicit difficulty and must not enter the relearning loop.
    const isError = quality === 0;
    let reviewResult = null;

    // ===== ЛОГИКА ПЕРВОЙ ПОПЫТКИ =====
    if (item.isFirstAttempt) {
      // Применяем полный FSRS алгоритм
      const cardInSrs = srsCollection[cardId];
      if (cardInSrs && this.srs) {
        if (this.srs.applyReview) {
          reviewResult = this.srs.applyReview(cardInSrs, quality, reviewContext || {});
        } else if (reviewContext) {
          reviewResult = this.srs.review(cardInSrs, quality, reviewContext);
        } else {
          reviewResult = this.srs.review(cardInSrs, quality);
        }
      }

      item.isFirstAttempt = false;
      // Засчитываем факт прохождения карточки независимо от правильности ответа
      this.stats.attempted++;

      if (isError) {
        // Ошибка при первой попытке → переходим в цикл доучивания
        item.sessionLapses = 1;
        this.stats.relearned++;

        // Откидываем карточку назад в очередь
        this._moveCardBack(queueIndex, quality);

        // ❌ Сброс стрика "5 подряд" при ошибке
        if (this.questsManager && this.state) {
          this.questsManager.resetStreakCorrect(this.state);
        }
      } else {
        // Правильный ответ при первой попытке → карточка завершена
        item.completed = true;
        this.stats.reviewed++;
        this.stats.perfect++;
        this.stats.remaining--;

        // ✅ Трекинг квестов при успешном выполнении карточки
        if (this.questsManager && this.state) {
          this.questsManager.incrementStreakCorrect(this.state);
        }
      }

      return reviewResult;
    }

    // ===== ЛОГИКА ПОСЛЕДУЮЩИХ ПОПЫТОК (в цикле доучивания) =====
    if (isError) {
      // Очередная ошибка → увеличиваем счётчик и снова откидываем
      item.sessionLapses++;
      this._moveCardBack(queueIndex, quality);

      // ❌ Сброс стрика "5 подряд" при ошибке
      if (this.questsManager && this.state) {
        this.questsManager.resetStreakCorrect(this.state);
      }
    } else {
      // Правильный ответ → завершаем карточку
      // ВАЖНО: SRS.review() НЕ вызываем, т.к. штраф уже был при первой попытке
      item.completed = true;
      this.stats.reviewed++;
      this.stats.remaining--;

      // ✅ Трекинг квестов (но НЕ стрика, т.к. это не первая попытка)
      // Стрик НЕ трекаем, т.к. это повторная попытка после ошибки
    }

    return reviewResult;
  }

  /** Завершает технически непригодную/preview-карточку без FSRS и статистики успеха. */
  skipCard(cardId) {
    const item = this.queue.find((entry) => entry.card.id === cardId && !entry.completed);
    if (!item) return false;
    item.completed = true;
    item.skipped = true;
    item.isFirstAttempt = false;
    this.stats.reviewed++;
    this.stats.skipped = (this.stats.skipped || 0) + 1;
    this.stats.remaining = Math.max(0, this.stats.remaining - 1);
    return true;
  }

  /**
   * Завершает карточку в режиме supplemental practice без вызова FSRS алгоритма и review events.
   * @param {string} cardId - ID карточки
   * @param {Object} options - { correct: boolean }
   */
  completeSupplementalPractice(cardId, { correct = true } = {}) {
    const item = this.queue.find((entry) => entry.card.id === cardId && !entry.completed);
    if (!item) return false;

    const wasFirst = item.isFirstAttempt;
    item.completed = true;
    item.isFirstAttempt = false;

    if (wasFirst) {
      this.stats.attempted++;
      if (correct) {
        this.stats.perfect++;
      } else {
        this.stats.relearned++;
      }
    }
    this.stats.reviewed++;
    this.stats.remaining = Math.max(0, this.stats.remaining - 1);
    return true;
  }

  /**
   * Откинуть карточку назад в очереди
   * @private
   * @param {number} currentIndex - текущий индекс карточки
   * @param {number} quality - качество ответа (0 или 3)
   */
  _moveCardBack(currentIndex, quality) {
    const item = this.queue[currentIndex];

    // Определяем базовый шаг на основе качества ответа
    const baseSteps = this.backtrackSteps[quality] || 10; // по умолчанию 10

    // Применяем динамическое сокращение при повторных ошибках
    // Формула: baseSteps / sessionLapses, но минимум 1
    const backSteps = Math.max(1, Math.floor(baseSteps / item.sessionLapses));

    // Находим незавершённые карточки после текущей позиции (ДО удаления)
    const afterCurrent = this.queue.slice(currentIndex + 1).filter((i) => !i.completed);

    // Убираем карточку из текущей позиции
    this.queue.splice(currentIndex, 1);

    // Вычисляем новую позицию: минимум на 1 позицию вперёд от текущей
    // После удаления: currentIndex указывает на следующий элемент
    const desiredPosition = currentIndex + Math.max(1, backSteps);

    // Если afterCurrent пуст (карточка была последней незавершённой),
    // вставляем перед последней завершённой карточкой, чтобы гарантировать сдвиг
    let maxPosition;
    if (afterCurrent.length === 0) {
      // Ищем последнюю завершённую карточку
      let lastCompletedIndex = -1;
      for (let i = this.queue.length - 1; i >= 0; i--) {
        if (this.queue[i].completed) {
          lastCompletedIndex = i;
          break;
        }
      }
      // Вставляем перед ней, или в конец если завершённых нет
      maxPosition = lastCompletedIndex >= 0 ? lastCompletedIndex : this.queue.length;
    } else {
      maxPosition = currentIndex + afterCurrent.length;
    }

    const newPosition = Math.min(desiredPosition, maxPosition);

    // Вставляем карточку на новую позицию
    this.queue.splice(newPosition, 0, item);
  }

  /**
   * Проверить, завершена ли сессия
   * @returns {boolean}
   */
  isSessionComplete() {
    return this.queue.every((item) => item.completed);
  }

  /**
   * Получить статистику сессии
   * @returns {Object}
   */
  getStats() {
    const firstAttempts = this.stats.perfect + this.stats.relearned;
    const accuracy = firstAttempts > 0 ? (this.stats.perfect / firstAttempts) * 100 : 100;
    return { ...this.stats, accuracy };
  }

  /**
   * Получить прогресс сессии в процентах
   * @returns {number}
   */
  getProgress() {
    if (this.stats.total === 0) return 100;
    return Math.round(((this.stats.total - this.stats.remaining) / this.stats.total) * 100);
  }

  toSerializableState() {
    return {
      queue: this.queue.map((item) => ({
        cardId: item.card?.id || item.cardId,
        card: item.card?.id ? undefined : item.card,
        forcedMode: item.forcedMode,
        sessionLapses: item.sessionLapses,
        isFirstAttempt: item.isFirstAttempt,
        completed: item.completed,
        skipped: item.skipped === true,
      })),
      stats: { ...this.stats },
      currentIndex: this.currentIndex,
    };
  }

  restoreFromSerializableState(serialized, cardsMap = null) {
    if (!serialized || !Array.isArray(serialized.queue)) return false;

    if (!cardsMap && Array.isArray(this.queue) && this.queue.length > 0) {
      const fallbackMap = new Map();
      this.queue.forEach((item) => {
        const cardObj = item?.card || item;
        if (cardObj && cardObj.id) fallbackMap.set(cardObj.id, cardObj);
      });
      cardsMap = fallbackMap;
    }

    const restoredQueue = [];

    for (const savedItem of serialized.queue) {
      const cardId = canonicalizeCardId(savedItem.cardId || savedItem.card?.id);
      let card =
        typeof savedItem.card === 'object' && savedItem.card !== null ? savedItem.card : null;
      if (card?.id) {
        card = {
          ...card,
          id: canonicalizeCardId(card.id),
          itemId: card.itemId ? canonicalizeCardId(card.itemId) : card.itemId,
        };
      }

      if (cardsMap && cardId) {
        const actualCard =
          typeof cardsMap.get === 'function' ? cardsMap.get(cardId) : cardsMap[cardId];
        if (actualCard) {
          card = actualCard;
        }
      }

      if (!card) {
        // Skipped missing card per refinement #2
        continue;
      }

      restoredQueue.push({
        card,
        forcedMode: savedItem.forcedMode || null,
        sessionLapses: savedItem.sessionLapses || 0,
        isFirstAttempt: savedItem.isFirstAttempt !== false,
        completed: savedItem.completed === true,
        skipped: savedItem.skipped === true,
      });
    }

    if (restoredQueue.length === 0) {
      return false;
    }

    this.queue = restoredQueue;
    this.currentIndex = Math.min(serialized.currentIndex || 0, restoredQueue.length - 1);

    const total = restoredQueue.length;
    const reviewed = restoredQueue.filter((item) => item.completed).length;
    const skipped = restoredQueue.filter((item) => item.skipped).length;
    const remaining = total - reviewed;
    const relearned = restoredQueue.filter((item) => item.sessionLapses > 0).length;
    const perfect = restoredQueue.filter(
      (item) => item.completed && item.sessionLapses === 0 && !item.skipped
    ).length;
    const attempted = restoredQueue.filter((item) => !item.isFirstAttempt).length;

    this.stats = {
      total,
      reviewed,
      skipped,
      attempted: Math.max(attempted, perfect + relearned),
      perfect,
      relearned,
      remaining,
    };

    return true;
  }
}

// Экспортируем класс
export { SessionManager };
