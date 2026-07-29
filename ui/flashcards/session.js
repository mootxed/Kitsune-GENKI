// ui/flashcards/session.js - Батчинг сессий и жизненный цикл повторений карточек

import { allCards, wordById } from '../../src/srs-helpers.js';
import { SRS } from '../../srs.js';
import { SessionBatcher } from '../../src/session-batcher.js';
import {
  SessionManager,
  saveSessionToDB,
  clearSessionFromDB,
  validateSessionRecord,
} from '../../session-manager.js';
import {
  activePracticeMode,
  sessionBatcher,
  setSessionBatcher,
  currentBatchIndex,
  setCurrentBatchIndex,
  setFlashQueue,
  setFlashIdx,
  setFlashRevealed,
  setFlashCtx,
  setSessionManager,
  setActivePracticeMode,
  getSessionManager,
  getFlashQueue,
  getFlashIdx,
  getFlashRevealed,
  getFlashCtx,
  reviewUndoStack,
  clearActiveReviewAIContext,
} from './state.js';

export let activeSessionOrigin = null;
let sessionCreatedAt = null;

export function setSessionOrigin(origin) {
  activeSessionOrigin = origin;
}

export function getSessionOrigin() {
  return activeSessionOrigin;
}

/**
 * Единая функция явного выхода из активной сессии.
 * Сбрасывает SessionManager, SessionBatcher, весь flash-state и удаляет запись из IndexedDB.
 * Используется во всех card-режимах вместо дублированной очистки по каждому обработчику.
 */
export function abandonActiveSession() {
  setSessionManager(null);
  setSessionBatcher(null);
  setCurrentBatchIndex(0);
  setFlashQueue([]);
  setFlashIdx(0);
  setFlashRevealed(false);
  setActivePracticeMode(null);
  clearActiveReviewAIContext();
  setSessionOrigin(null);
  sessionCreatedAt = null;
  // flashCtx сохраняем — нужен для nav('chapter', flashCtx) после выхода
  return clearSessionFromDB();
}

export function startExtraReview(state, dependencies, renderFlashFn) {
  const { toast } = dependencies;

  const all = allCards(state.srs).filter((card) => card.reps > 0 || card.state !== SRS.State.New);
  if (all.length === 0) {
    toast('Нет изученных карточек для дополнительной практики.');
    return;
  }

  const shuffled = [...all];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const selected = shuffled.slice(0, Math.min(10, shuffled.length)).map((card) => ({
    ...card,
    preview: true,
  }));

  toast(`🍀 Дополнительная практика: ${selected.length} карточек (без изменения расписания)`);

  document.getElementById('completion-overlay')?.classList.add('hidden');

  const tabsContainer = document.getElementById('srs-tabs-container');
  if (tabsContainer) tabsContainer.classList.add('hidden');

  setSessionManager(null);
  setActivePracticeMode('preview');
  reviewUndoStack.clear();
  setFlashCtx(null);
  setFlashRevealed(false);
  setFlashIdx(0);
  setFlashQueue(selected);

  if (typeof renderFlashFn === 'function') {
    renderFlashFn(state, dependencies);
  }
}

export function initSessionBatching(dueCardsQueue, lessonsData, batchSize = 20) {
  setActivePracticeMode(null);
  const lessons = lessonsData || [];
  const batcher = new SessionBatcher(dueCardsQueue, batchSize);
  setSessionBatcher(batcher);
  setCurrentBatchIndex(0);

  const firstBatch = batcher.getCurrentBatch();
  if (!firstBatch) return null;

  const enrichedCards = firstBatch.cards.map((card) => {
    const word = wordById(card.id, lessons);
    return { ...card, word };
  });

  const organizedCards = batcher.organizeBatch(enrichedCards);

  setFlashQueue(organizedCards);
  setFlashIdx(0);

  return {
    batcher,
    currentBatch: firstBatch,
    organizedCards,
    totalBatches: batcher.getTotalBatches(),
  };
}

export function completeBatchAndMoveNext(state, dependencies) {
  if (!sessionBatcher || !sessionBatcher.hasNextBatch()) {
    return null;
  }

  const nextBatch = sessionBatcher.moveToNextBatch();
  setCurrentBatchIndex(sessionBatcher.getCurrentBatchIndex());

  const lessons = dependencies?.LESSONS || [];
  const enrichedCards = nextBatch.cards.map((card) => {
    const word = wordById(card.id, lessons);
    return { ...card, word };
  });

  const organizedCards = sessionBatcher.organizeBatch(enrichedCards);

  setFlashQueue(organizedCards);
  setFlashIdx(0);
  setFlashRevealed(false);

  return {
    batch: nextBatch,
    organizedCards,
    totalBatches: sessionBatcher.getTotalBatches(),
    currentIndex: currentBatchIndex,
  };
}

export function startNextBatchIfAny(state, dependencies) {
  if (!sessionBatcher || !sessionBatcher.hasNextBatch()) return false;

  const result = completeBatchAndMoveNext(state, dependencies);
  if (!result || !result.organizedCards) return false;

  reviewUndoStack.clear();

  const manager = new SessionManager(result.organizedCards, {
    srs: SRS,
    questsManager: dependencies.QuestsManager || window.QuestsManager || null,
    state,
    onSave: dependencies.save,
  });
  setSessionManager(manager);
  saveActiveSessionState();
  return true;
}

export function getCurrentBatchInfo() {
  if (!sessionBatcher) return null;

  const currentBatch = sessionBatcher.getCurrentBatch();
  return {
    index: currentBatch.index,
    total: currentBatch.total,
    isMiniSprint: currentBatch.isMiniSprint,
    cardsCount: currentBatch.cards.length,
  };
}

export function resetSessionBatching() {
  setSessionBatcher(null);
  setCurrentBatchIndex(0);
}

export function saveActiveSessionState() {
  const manager = getSessionManager();
  if (!manager) {
    return;
  }
  if (manager.isSessionComplete()) {
    if (!sessionBatcher || !sessionBatcher.hasNextBatch()) {
      return clearSessionFromDB();
    }
  }

  const batcher = sessionBatcher;
  const flashQueue = getFlashQueue();
  const flashIdx = getFlashIdx();
  const flashRevealed = getFlashRevealed();
  const flashCtx = getFlashCtx();

  if (!sessionCreatedAt) {
    sessionCreatedAt = Date.now();
  }

  const sessionData = {
    schemaVersion: 1,
    sessionType: flashCtx ? 'chapter' : 'srs',
    chapterId: flashCtx || null,
    sessionOrigin: activeSessionOrigin || {
      type: flashCtx ? 'chapter' : 'srs',
      chapterId: flashCtx || null,
      initialCardIds: flashQueue.map((c) => c.id || c),
    },
    createdAt: sessionCreatedAt,
    updatedAt: Date.now(),
    managerState: manager.toSerializableState(),
    batcherState: batcher ? batcher.toSerializableState() : null,
    currentBatchIndex: batcher ? batcher.getCurrentBatchIndex() : 0,
    totalBatches: batcher ? batcher.getTotalBatches() : 1,
    flashState: {
      flashIdx,
      flashRevealed,
      activePracticeMode: activePracticeMode ?? null,
    },
  };

  return saveSessionToDB(sessionData);
}

export async function restoreActiveSessionRecord(sessionRecord, state, dependencies) {
  if (!validateSessionRecord(sessionRecord)) {
    console.warn('[SessionRecovery] Record failed schema/structural validation');
    await clearSessionFromDB();
    if (typeof dependencies?.recordDiagnosticError === 'function') {
      dependencies.recordDiagnosticError('Запись active session не прошла валидацию структуры');
    }
    return false;
  }

  const lessons = dependencies?.LESSONS || [];
  const srsCollection = state?.srs || {};

  const cardsMap = new Map();
  Object.values(srsCollection).forEach((card) => {
    if (card && card.id) {
      const word = wordById(card.id, lessons);
      cardsMap.set(card.id, { ...card, word });
    }
  });

  if (Array.isArray(sessionRecord.managerState.queue)) {
    sessionRecord.managerState.queue.forEach((item) => {
      const cardId = item.cardId || item.card?.id;
      if (cardId && !cardsMap.has(cardId)) {
        const word = wordById(cardId, lessons);
        const srsCard = srsCollection[cardId] || (typeof item.card === 'object' ? item.card : null);
        if (srsCard) {
          cardsMap.set(cardId, { ...srsCard, word });
        }
      }
    });
  }

  if (sessionRecord.batcherState) {
    const batcher = new SessionBatcher([]);
    batcher.restoreFromSerializableState(sessionRecord.batcherState);
    setSessionBatcher(batcher);
    setCurrentBatchIndex(sessionRecord.currentBatchIndex || 0);
  } else {
    setSessionBatcher(null);
    setCurrentBatchIndex(0);
  }

  const manager = new SessionManager([], {
    srs: SRS,
    questsManager: dependencies?.QuestsManager || window?.QuestsManager || null,
    state,
    onSave: dependencies?.save,
  });

  const success = manager.restoreFromSerializableState(sessionRecord.managerState, cardsMap);
  if (!success || manager.queue.length === 0) {
    console.warn('[SessionRecovery] Failed to restore session queue or all cards are missing');
    await clearSessionFromDB();
    if (typeof dependencies?.recordDiagnosticError === 'function') {
      dependencies.recordDiagnosticError(
        'Не удалось восстановить очередь SRS-сессии: все карточки отсутствуют'
      );
    }
    return false;
  }

  setSessionManager(manager);

  const organizedCards = manager.queue.map((item) => ({
    ...item.card,
    forcedMode: item.forcedMode,
  }));
  setFlashQueue(organizedCards);
  setFlashIdx(sessionRecord.flashState?.flashIdx || 0);
  setFlashRevealed(sessionRecord.flashState?.flashRevealed || false);
  setFlashCtx(sessionRecord.chapterId || null);
  setSessionOrigin(sessionRecord.sessionOrigin || null);
  reviewUndoStack.clear();

  return true;
}

export function startSessionWithCards(cards, chapterId = null, state = null, dependencies = {}) {
  if (!Array.isArray(cards) || cards.length === 0) return false;

  const manager = new SessionManager(cards, {
    srs: SRS,
    questsManager: dependencies?.QuestsManager || window?.QuestsManager || null,
    state: state || dependencies?.state || null,
    onSave: dependencies?.save,
  });

  setSessionManager(manager);
  setFlashQueue(cards);
  setFlashIdx(0);
  setFlashRevealed(false);
  setFlashCtx(chapterId);
  reviewUndoStack.clear();

  saveActiveSessionState();

  const tabsContainer = document.getElementById('srs-tabs-container');
  if (tabsContainer) tabsContainer.classList.add('hidden');

  const renderFn = dependencies?.renderFlash || window?.renderFlash;
  if (typeof renderFn === 'function') {
    renderFn(state || dependencies?.state, dependencies);
  } else if (typeof window?.nav === 'function') {
    window.nav('srs');
  }

  return true;
}
