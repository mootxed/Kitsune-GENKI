// ui/flashcards/session.js - Батчинг сессий и жизненный цикл повторений карточек

import { allCards, wordById } from '../../src/srs-helpers.js';
import { SRS } from '../../srs.js';
import { SessionBatcher } from '../../src/session-batcher.js';
import { SessionManager } from '../../session-manager.js';
import {
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
  reviewUndoStack,
} from './state.js';

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
