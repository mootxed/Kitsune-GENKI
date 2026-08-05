// ui/flashcards/review-fsrs.js - Логика FSRS-ответов, тайминга и Undo

import { markCardIntroduced } from '../../src/srs-limits.js';
import { SRS } from '../../srs.js';
import {
  adjustQualityByTime,
  isLeech,
  LEECH_THRESHOLD,
  undoReviewEvent,
} from '../../src/card-behavior.js';
import { wordById } from '../../src/srs-helpers.js';
import {
  modeCanSchedule,
  parseCardIdentity,
  SUPPLEMENTAL_PRACTICE_MODES,
} from '../../src/knowledge-model.js';
import { compactReviewJournal, enqueueReviewLog } from '../../src/review-journal.js';
import { buildReviewAttemptSnapshot } from '../../src/ai/review-context-builder.js';
import { secureRandomId } from '../../src/utils.js';
import {
  activeReviewTiming,
  setActiveReviewTiming,
  activeReviewState,
  activeReviewDependencies,
  activePracticeMode,
  sessionManager,
  reviewUndoStack,
  flashIdx,
  setFlashIdx,
  flashRevealed,
  setFlashRevealed,
  setKanjiSequence,
  setCurrentKanjiIndex,
  setTotalDrawingMistakes,
  setDrawingHintUsed,
  setActiveReviewAIContext,
  clearActiveReviewAIContext,
} from './state.js';

import { closeSenseiPanel } from './sensei-review-panel.js';
import { saveActiveSessionState } from './session.js';

function monotonicNow() {
  return typeof globalThis.performance !== 'undefined' &&
    typeof globalThis.performance.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

export function startReviewTiming(cardId, mode) {
  setActiveReviewTiming({
    cardId,
    mode,
    startedAt: monotonicNow(),
    answeredAt: null,
  });
  renderCardBehaviorControls(cardId);
}

export function markReviewAnswered(cardId) {
  if (activeReviewTiming?.cardId === cardId && activeReviewTiming.answeredAt === null) {
    activeReviewTiming.answeredAt = monotonicNow();
  }
}

export function consumeReviewContext(cardId, fallbackMode = 'unknown') {
  if (activeReviewTiming?.cardId !== cardId) {
    return { mode: fallbackMode, responseTimeMs: null };
  }

  const finishedAt = activeReviewTiming.answeredAt ?? monotonicNow();
  const context = {
    mode: activeReviewTiming.mode,
    responseTimeMs: Math.max(0, Math.round(finishedAt - activeReviewTiming.startedAt)),
  };
  setActiveReviewTiming(null);
  return context;
}

export function submitReview(card, quality, state, context = null) {
  const timedContext = consumeReviewContext(card.id, context?.mode || 'unknown');
  const reviewContext = {
    ...timedContext,
    ...(context || {}),
    mode: context?.mode || timedContext.mode,
    responseTimeMs:
      context && Object.hasOwn(context, 'responseTimeMs')
        ? context.responseTimeMs
        : timedContext.responseTimeMs,
  };

  const srsCard = state.srs[card.id];
  const mode = activePracticeMode === 'preview' ? 'preview' : reviewContext.mode;
  if (!srsCard || !modeCanSchedule(srsCard, mode)) {
    const isSupplemental = SUPPLEMENTAL_PRACTICE_MODES.includes(mode);
    if (!isSupplemental) {
      sessionManager?.skipCard(card.id);
      return {
        accepted: false,
        firstAttempt: false,
        cardCompleted: false,
        reviewEvent: null,
        xpEligible: false,
        quality,
      };
    }

    if (sessionManager) {
      sessionManager.completeSupplementalPractice(card.id, {
        correct: quality !== SRS.Quality.Again,
      });
    }

    // Supplemental practice: FSRS schedule / state IS NOT MUTATED and no SRS review event is stored
    const submitResult = {
      accepted: false,
      supplementalAccepted: true,
      firstAttempt: false,
      cardCompleted: true,
      reviewEvent: null,
      xpEligible: false,
      quality,
    };

    if (reviewContext.aiAttempt && srsCard) {
      const identity = parseCardIdentity(srsCard);
      const word =
        _wordFromStateById(state, identity.itemId) ||
        (activeReviewState ? _wordFromStateById(activeReviewState, identity.itemId) : null);
      if (word) {
        const cardSessionId = secureRandomId();
        const snapshot = buildReviewAttemptSnapshot({
          card: srsCard,
          word,
          mode,
          submitResult,
          aiAttempt: reviewContext.aiAttempt,
          srsCard,
          reviewEvents: state.reviewEvents || [],
          responseTimeMs: reviewContext.responseTimeMs ?? timedContext.responseTimeMs,
        });
        if (snapshot) {
          const aiCtx = { snapshot, cardSessionId, attemptId: null, quizAnswers: {} };
          setActiveReviewAIContext(aiCtx);
          submitResult._snapshotReady = true;
          submitResult._cardSessionId = cardSessionId;
        }
      }
    }

    return submitResult;
  }

  markCardIntroduced(srsCard);

  const mistakes = Number.isInteger(reviewContext.mistakes) ? reviewContext.mistakes : 0;
  const hintUsed = reviewContext.hintUsed === true;
  let adjustedQuality = adjustQualityByTime(quality, reviewContext.responseTimeMs, mode);
  // A hint or retry cannot be evidence for Easy.
  if ((hintUsed || mistakes > 0) && adjustedQuality === SRS.Quality.Easy) {
    adjustedQuality = SRS.Quality.Good;
  }
  const wasLeech = isLeech(srsCard);
  const reviewEventsBefore = [...(state.reviewEvents || [])];
  const sessionSnapshot = sessionManager?.createSnapshot() || null;
  const previousCard = SRS.serializeCard(srsCard);
  const cardStateBefore = sessionManager?.getCardState(card.id);
  const isFirstAttempt = cardStateBefore?.isFirstAttempt ?? true;
  const wasCompletedBefore = cardStateBefore?.completed ?? false;
  const identity = parseCardIdentity(srsCard);
  const fullContext = {
    ...reviewContext,
    mode,
    skill: identity.skill,
    mistakes,
    hintUsed,
    rawRating: quality,
    firstAttemptCorrect: isFirstAttempt && mistakes === 0 && !hintUsed,
  };

  let result;
  if (sessionManager) {
    result = sessionManager.answerCard(card.id, adjustedQuality, state.srs, fullContext);
  } else {
    result = SRS.applyReview(srsCard, adjustedQuality, fullContext);
  }

  if (result?.event) {
    if (!Array.isArray(state.reviewEvents)) state.reviewEvents = [];
    state.reviewEvents.push(result.event);
    enqueueReviewLog(state, result.logEntry);
    compactReviewJournal(state);
    reviewUndoStack.push(
      card.id,
      {
        card: previousCard,
        session: sessionSnapshot,
        flashIdx,
        flashRevealed,
      },
      { eventId: result.event.eventId }
    );
    state.dailyPlan = null;
    activeReviewDependencies?.onReviewCommitted?.(srsCard, result.event);
  }

  const postSrsCard = state.srs?.[card.id] || srsCard;
  const nowLeech = isLeech(postSrsCard);
  if (!wasLeech && nowLeech) {
    activeReviewDependencies?.toast?.(
      '🩸 Карточка часто забывается. Добавьте к ней мнемонику или личную подсказку.'
    );
  }

  const cardStateAfter = sessionManager ? sessionManager.getCardState(card.id) : null;
  const cardCompleted = sessionManager ? cardStateAfter === null || cardStateAfter.completed : true;
  const xpEligible = !wasCompletedBefore && cardCompleted;

  const submitResult = {
    accepted: true,
    firstAttempt: isFirstAttempt,
    cardCompleted,
    reviewEvent: result?.event || null,
    xpEligible,
    quality: adjustedQuality,
  };

  saveActiveSessionState();

  // Строим AI-снапшот ТОЛЬКО при accepted/supplementalAccepted review и достаточном task context.
  // Передаём previousCard (состояние ДО ответа, либо с isLeech=true при nowLeech) и pre-review журнал reviewEvents.
  if (result?.event && reviewContext.aiAttempt) {
    const { aiAttempt, mode: reviewMode, responseTimeMs } = reviewContext;
    const word = activeReviewState ? _wordFromStateById(activeReviewState, identity.itemId) : null;
    if (word) {
      const cardSessionId = secureRandomId();
      const snapshotCard =
        nowLeech && !wasLeech ? { ...previousCard, lapses: LEECH_THRESHOLD } : previousCard;
      const snapshot = buildReviewAttemptSnapshot({
        card: snapshotCard,
        word,
        mode: reviewMode || mode,
        submitResult,
        aiAttempt,
        srsCard: snapshotCard,
        reviewEvents: reviewEventsBefore,
        responseTimeMs: responseTimeMs ?? timedContext.responseTimeMs,
      });
      if (snapshot) {
        const aiCtx = { snapshot, cardSessionId, attemptId: null, quizAnswers: {} };
        setActiveReviewAIContext(aiCtx);
        submitResult._snapshotReady = true;
        submitResult._cardSessionId = cardSessionId;
      }
    }
  }

  return submitResult;
}

/**
 * Находит слово по itemId из LESSONS через activeReviewDependencies.
 * Используется только для построения AI-снапшота.
 */
function _wordFromStateById(state, itemId) {
  if (Array.isArray(state?.dictionary)) {
    const w = state.dictionary.find((x) => x.id === itemId);
    if (w) return w;
  }
  if (Array.isArray(state?.vocabulary)) {
    const w = state.vocabulary.find((x) => x.id === itemId);
    if (w) return w;
  }
  const lessons = activeReviewDependencies?.LESSONS || state?.lessons || [];
  for (const lesson of lessons) {
    const wordList = lesson.words || lesson.vocabulary || [];
    const w = wordList.find((x) => x.id === itemId);
    if (w) return w;
  }
  try {
    const w = wordById(itemId);
    if (w) return w;
  } catch {
    // wordById throws if dictionary isn't initialized yet
  }
  return null;
}

export function latestUndoableEvent(state) {
  return (
    [...(state.reviewEvents || [])]
      .reverse()
      .find((event) => !event.undoneAt && event.previousCard && event.nextCard) || null
  );
}

export async function undoLastReview(state, dependencies, renderFlashFn) {
  const stackEntry = reviewUndoStack.pop();
  const persistedEvent = stackEntry
    ? (state.reviewEvents || []).find((event) => event.eventId === stackEntry.eventId)
    : latestUndoableEvent(state);
  if (!persistedEvent) return false;

  const cardId = persistedEvent.cardId;
  const previous = stackEntry?.state;
  const card = state.srs[cardId];
  if (!card) return false;
  if (previous?.session && !sessionManager?.restoreSnapshot(previous.session)) return false;
  if (previous?.card) persistedEvent.previousCard = previous.card;
  if (!undoReviewEvent(state, persistedEvent.eventId)) return false;
  state.dailyPlan = null;
  dependencies.onReviewUndone?.(persistedEvent);
  const undoneAt = persistedEvent.undoneAt;
  enqueueReviewLog(state, {
    eventId: `undo-${persistedEvent.eventId}-${undoneAt}`,
    eventType: 'undo',
    targetEventId: persistedEvent.eventId,
    itemId: persistedEvent.itemId,
    cardId: persistedEvent.cardId,
    skill: persistedEvent.skill,
    mode: persistedEvent.mode,
    firstAttemptCorrect: false,
    mistakes: 0,
    hintUsed: false,
    responseTimeMs: null,
    rawRating: persistedEvent.rawRating,
    effectiveRating: persistedEvent.effectiveRating,
    reviewedAt: undoneAt,
    undoneAt,
  });

  setFlashIdx(previous?.flashIdx ?? flashIdx);
  setFlashRevealed(previous?.flashRevealed ?? false);
  setActiveReviewTiming(null);
  // При Undo очищаем AI-снапшот и закрываем панель
  clearActiveReviewAIContext();
  closeSenseiPanel();
  setKanjiSequence([]);
  setCurrentKanjiIndex(0);
  setTotalDrawingMistakes(0);
  setDrawingHintUsed(false);

  document.getElementById('completion-overlay')?.classList.add('hidden');
  await dependencies.save(true);
  saveActiveSessionState();
  dependencies.updateSrsBadge?.();
  dependencies.toast?.('↩️ Последний ответ отменён');
  if (typeof renderFlashFn === 'function') {
    renderFlashFn(state, dependencies);
  }
  return true;
}

export function createUndoButton(state, dependencies, renderFlashFn) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn-ghost review-undo-btn';
  button.dataset.testid = 'review-undo';
  button.textContent = '↩️ Отменить ответ';
  button.onclick = async () => undoLastReview(state, dependencies, renderFlashFn);
  return button;
}

export function renderCardBehaviorControls(cardId) {
  const state = activeReviewState;
  const dependencies = activeReviewDependencies;
  if (!state || !dependencies) return;

  const top = document.querySelector('#srs-body .flash-top');
  if (!top) return;

  if (
    (reviewUndoStack.canUndo || latestUndoableEvent(state)) &&
    !top.querySelector('.review-undo-btn')
  ) {
    top.insertBefore(createUndoButton(state, dependencies), top.lastElementChild);
  }

  const card = state.srs[cardId];
  if (!isLeech(card)) return;

  const badge = document.createElement('span');
  badge.className = 'card-leech-badge';
  badge.title = `Карточка с ${card.lapses} провалами`;
  badge.textContent = '🩸 Сложная карточка';
  top.insertBefore(badge, top.lastElementChild);

  const wrap = top.closest('.flash-wrap');
  if (wrap && !wrap.querySelector('.card-leech-context')) {
    const context = document.createElement('div');
    context.className = 'card-leech-context';
    context.innerHTML =
      '<strong>Нужна другая ассоциация.</strong> Придумайте мнемонику, образ или короткий пример с этим словом.';
    top.insertAdjacentElement('afterend', context);
  }
}

export function renderCompletionUndo(state, dependencies, renderFlashFn) {
  const rewards = document.getElementById('completion-rewards');
  if (!rewards) return;
  rewards.parentElement?.querySelector('.review-undo-btn')?.remove();
  if (!reviewUndoStack.canUndo && !latestUndoableEvent(state)) return;
  rewards.insertAdjacentElement('afterend', createUndoButton(state, dependencies, renderFlashFn));
}
