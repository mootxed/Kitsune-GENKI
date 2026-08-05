// ui/flashcards/state.js - Состояние сессий SRS-карточек и аксессоры

import { UndoStack } from '../../src/card-behavior.js';
export let activeReviewAIContext = null;

export function setActiveReviewAIContext(ctx) {
  activeReviewAIContext = ctx;
}

export function clearActiveReviewAIContext() {
  activeReviewAIContext = null;
}

// Локальный контекст зависимостей
export let deps = null;
export function setDeps(newDeps) {
  deps = newDeps;
}

// Глобальные переменные модуля
export let flashQueue = [];
export let flashIdx = 0;
export let flashRevealed = false;
export let flashCtx = null;
export let sessionManager = null;
export let activeReviewTiming = null;
export let activeReviewState = null;
export let activeReviewDependencies = null;
export let activePracticeMode = null;
export const reviewUndoStack = new UndoStack(10);

// Глобальные переменные для батчинга сессий
export let sessionBatcher = null;
export let currentBatchIndex = 0;

// Глобальная переменная для HanziWriter
export let currentWriter = null;
export let drawingMistakes = 0;
export let totalDrawingMistakes = 0;
export let drawingHintUsed = false;

// Переменные для последовательного рисования
export let kanjiSequence = [];
export let currentKanjiIndex = 0;

/**
 * Временный AI-контекст текущей карточки.
 *
 * Очищается при:
 *  - переходе к следующей карточке
 *  - Undo
 *  - смене сессии (setFlashQueue, setSessionManager)
 *
 * НЕ записывается в state приложения и НЕ вызывает save().
 * Ответы мини-квиза панели хранятся здесь же (quizAnswers).
 *
 * Поля:
 *  - snapshot: ReviewAttemptSnapshot
 *  - attemptId: string (UUID конкретного запроса)
 *  - cardSessionId: string (UUID конкретного показа карточки)
 *  - quizAnswers: Record<questionId, selectedIndex>
 */

export function setActiveReviewTiming(timing) {
  activeReviewTiming = timing;
}

export function setActiveReviewState(state) {
  activeReviewState = state;
}

export function setActiveReviewDependencies(dependencies) {
  activeReviewDependencies = dependencies;
}

export function setActivePracticeMode(mode) {
  activePracticeMode = mode;
}

export function setSessionBatcher(batcher) {
  sessionBatcher = batcher;
}

export function setCurrentBatchIndex(idx) {
  currentBatchIndex = idx;
}

export function setCurrentWriter(writer) {
  currentWriter = writer;
}

export function setDrawingMistakes(val) {
  drawingMistakes = val;
}

export function setTotalDrawingMistakes(val) {
  totalDrawingMistakes = val;
}

export function setDrawingHintUsed(val) {
  drawingHintUsed = val === true;
}

export function setKanjiSequence(seq) {
  kanjiSequence = seq;
}

export function setCurrentKanjiIndex(idx) {
  currentKanjiIndex = idx;
}

// Внешние аксессоры для app.js и других модулей
export function setFlashQueue(queue) {
  flashQueue = queue;
  reviewUndoStack.clear();
  clearActiveReviewAIContext();
}

export function setFlashIdx(idx) {
  flashIdx = idx;
}

export function setFlashRevealed(revealed) {
  flashRevealed = revealed;
}

export function setFlashCtx(ctx) {
  flashCtx = ctx;
}

export function setSessionManager(manager) {
  if (sessionManager !== manager) {
    reviewUndoStack.clear();
    clearActiveReviewAIContext();
  }
  sessionManager = manager;
  if (manager) activePracticeMode = null;
}

export function getFlashQueue() {
  return flashQueue;
}

export function getFlashIdx() {
  return flashIdx;
}

export function getFlashRevealed() {
  return flashRevealed;
}

export function getFlashCtx() {
  return flashCtx;
}

export function getSessionManager() {
  return sessionManager;
}
