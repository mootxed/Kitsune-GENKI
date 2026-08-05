// ui/flashcards.js - Модуль-фасад для карточек SRS, словарного запаса и сессий

import { $ } from '../src/utils.js';
import { wordById, cardChapter } from '../src/srs-helpers.js';
import { validateRenderableCard } from '../src/card-validator.js';
import { recordDiagnosticError } from '../state/store.js';
import { exportDiagnosticReport } from '../src/diagnostics.js';
import {
  APP_VERSION,
  INDEXED_DB_VERSION as DB_VERSION,
  STATE_SCHEMA_VERSION as CURRENT_VERSION,
} from '../src/app-metadata.js';
import { saveActiveSessionState, getSessionOrigin } from './flashcards/session.js';
import { markCardIntroduced } from '../src/srs-limits.js';
import { displayWordForm, isKanjiFormAvailable } from '../src/course-orthography.js';
export { getCardSchedulingReason } from '../src/reason-model.js';

import {
  flashQueue,
  flashIdx,
  setFlashIdx,
  flashCtx,
  sessionManager,
  setActiveReviewState,
  setActiveReviewDependencies,
} from './flashcards/state.js';

import { CARD_MODES, determineCardMode, shortT } from './flashcards/mode-selector.js';

import { startReviewTiming, renderCompletionUndo } from './flashcards/review-fsrs.js';

import { initDrawingMode } from './flashcards/drawing-mode.js';

import {
  getProgressText,
  renderTypingMode,
  renderContextSentenceMode,
  renderContextProductionMode,
  renderMultipleChoiceMode,
  renderSentenceBuilding,
  renderParticleQuizMode,
} from './flashcards/card-modes.js';

import { startNextBatchIfAny, abandonActiveSession } from './flashcards/session.js';

// Re-exports for 100% backward compatibility
export {
  CARD_MODES,
  isDebugSkipEnabled,
  normalizeChoiceLabel,
  canonicalLexeme,
  buildMultipleChoiceOptions,
  hasKanjiChars,
  cleanKanaString,
  MAX_TYPING_UNIQUE_CHARS,
  isWordTypingEligible,
  weightedRandom,
  getAdaptiveModeWeights,
  selectMode,
  generateWordContext,
  getAllKanji,
} from './flashcards/mode-selector.js';

export { submitReview } from './flashcards/review-fsrs.js';

export { dictionaryViewState, getWordStatus, renderDictionary } from './flashcards/dictionary.js';

export { openDictionaryModal } from './flashcards/dictionary-modal.js';

export {
  startExtraReview,
  initSessionBatching,
  completeBatchAndMoveNext,
  getCurrentBatchInfo,
  resetSessionBatching,
  startSessionWithCards,
} from './flashcards/session.js';

export {
  setFlashQueue,
  setFlashIdx,
  setFlashRevealed,
  setFlashCtx,
  setSessionManager,
  getFlashQueue,
  getFlashIdx,
  getFlashRevealed,
  getFlashCtx,
  getSessionManager,
} from './flashcards/state.js';

let currentSessionSkipCount = 0;
let consecutiveSkipCount = 0;

export function resetTechnicalSkipCounters() {
  currentSessionSkipCount = 0;
  consecutiveSkipCount = 0;
}

export function handleTechnicalSkip(card, validationResult, state, dependencies) {
  currentSessionSkipCount++;
  consecutiveSkipCount++;

  const details = validationResult.details || {};
  const record = {
    type: 'UNRENDERABLE_SRS_CARD',
    code: validationResult.code || 'UNRENDERABLE_CARD',
    severity: 'error',
    cardId: card?.id || details.cardId || null,
    itemId: card?.itemId || details.itemId || null,
    dictionaryId: card?.dictionaryId || details.dictionaryId || null,
    courseId: state?.activeCourseId || details.courseId || null,
    lessonId: details.lessonId || null,
    mode: card?.forcedMode || details.mode || null,
    sessionId: sessionManager ? 'active' : null,
    timestamp: Date.now(),
    message: validationResult.message || 'Card data could not be rendered',
    details,
    context: {
      appVersion: state?.appVersion || APP_VERSION,
      schemaVersion: state?.version || CURRENT_VERSION,
      dbVersion: DB_VERSION,
      activeCourse: state?.activeCourseId || null,
      sessionSource: getSessionOrigin()?.type || 'srs',
      queueIndex: sessionManager ? sessionManager.currentIndex : flashIdx,
      queueSize: sessionManager ? sessionManager.queue?.length : flashQueue?.length,
      isRestoredSession: Boolean(getSessionOrigin()?.isRestored),
      existsInSrs: Boolean(card?.id && state?.srs?.[card.id]),
    },
  };

  recordDiagnosticError(record);

  const toastFn = dependencies?.toast;
  if (currentSessionSkipCount === 1 && typeof toastFn === 'function') {
    toastFn(
      '⚠️ Не удалось открыть карточку. Она была безопасно пропущена и не повлияла на расписание.'
    );
  }

  if (consecutiveSkipCount >= 3) {
    console.warn(
      `[handleTechnicalSkip] ${consecutiveSkipCount} consecutive card skips encountered.`
    );
  }
}

// Главная функция рендеринга карточки
export function renderFlash(state, dependencies) {
  const { save, showCompletionScreen, nav, LESSONS } = dependencies;

  setActiveReviewState(state);
  setActiveReviewDependencies(dependencies);

  const body = $('#srs-body');
  if (!body) {
    console.error('[renderFlash] #srs-body not found!');
    return;
  }

  // Убедимся, что контейнер видим
  body.style.display = 'block';

  let card = null;
  let validationResult = null;

  if (sessionManager) {
    while (true) {
      card = sessionManager.getNextCard();
      if (!card) break;

      validationResult = validateRenderableCard(card, { state, lessons: LESSONS });
      if (validationResult.valid) {
        consecutiveSkipCount = 0;
        break;
      }

      console.warn(
        '[renderFlash] Card validation failed, skipping card:',
        card.id,
        validationResult.code
      );
      handleTechnicalSkip(card, validationResult, state, dependencies);
      sessionManager.skipCard(card.id);
      saveActiveSessionState();
    }

    if (!card) {
      if (startNextBatchIfAny(state, dependencies)) {
        renderFlash(state, dependencies);
        return;
      }

      const stats = sessionManager.getStats();
      const skippedCount = stats.skipped || 0;
      const answeredCount = stats.answered ?? stats.reviewed - skippedCount;

      if (answeredCount === 0 && skippedCount > 0) {
        showCompletionScreen({
          title: 'Сессию не удалось провести',
          subtitle: 'Учебные данные недоступны',
          desc: 'Все карточки были пропущены из-за проблем с учебными данными. Расписание повторений не изменено.',
          theme: 'warning',
          rewards: [
            { icon: '⚠️', label: `${skippedCount} технически пропущено` },
            { icon: '🪙', label: '+0 XP' },
          ],
          actions: [
            {
              label: 'Экспортировать диагностику',
              onClick: () =>
                exportDiagnosticReport(state, { method: 'download', toastFn: dependencies?.toast }),
            },
          ],
          onContinue: () => {
            resetTechnicalSkipCounters();
            abandonActiveSession();
            flashCtx ? nav('chapter', flashCtx) : nav('srs');
          },
        });
        return;
      }

      const rewards = [
        { icon: '🧠', label: `FSRS-повторения / Выполнено: ${answeredCount}` },
        { icon: '✨', label: `${stats.perfect} без ошибок` },
      ];
      if (stats.relearned > 0) {
        rewards.push({ icon: '🔄', label: `${stats.relearned} переучено` });
      }
      if (skippedCount > 0) {
        rewards.push({ icon: '⚠️', label: `${skippedCount} пропущено` });
      }
      rewards.push({ icon: '🎯', label: `${Math.round(stats.accuracy)}% точность` });
      rewards.push({ icon: '🪙', label: `+${answeredCount} XP` });

      const actions =
        skippedCount > 0
          ? [
              {
                label: 'Экспортировать диагностику',
                onClick: () =>
                  exportDiagnosticReport(state, {
                    method: 'download',
                    toastFn: dependencies?.toast,
                  }),
              },
            ]
          : [];

      showCompletionScreen({
        title: 'おめでとう！',
        subtitle: 'Сессия завершена!',
        desc: 'Отличная работа! Ваш ежедневный прогресс сохранён.',
        theme: 'success',
        rewards,
        actions,
        onContinue: () => {
          resetTechnicalSkipCounters();
          abandonActiveSession();
          flashCtx ? nav('chapter', flashCtx) : nav('srs');
        },
      });
      renderCompletionUndo(state, dependencies, renderFlash);
      return;
    }
  } else {
    while (flashIdx < flashQueue.length) {
      card = flashQueue[flashIdx];
      validationResult = validateRenderableCard(card, { state, lessons: LESSONS });
      if (validationResult.valid) {
        consecutiveSkipCount = 0;
        break;
      }

      console.warn(
        '[renderFlash] Card validation failed, skipping index:',
        flashIdx,
        validationResult.code
      );
      handleTechnicalSkip(card, validationResult, state, dependencies);
      setFlashIdx(flashIdx + 1);
    }

    if (flashIdx >= flashQueue.length) {
      const count = flashQueue.length;
      const skippedCount = currentSessionSkipCount;
      const answeredCount = Math.max(0, count - skippedCount);

      if (answeredCount === 0 && skippedCount > 0) {
        showCompletionScreen({
          title: 'Сессию не удалось провести',
          subtitle: 'Учебные данные недоступны',
          desc: 'Все карточки были пропущены из-за проблем с учебными данными. Расписание повторений не изменено.',
          theme: 'warning',
          rewards: [
            { icon: '⚠️', label: `${skippedCount} технически пропущено` },
            { icon: '🪙', label: '+0 XP' },
          ],
          actions: [
            {
              label: 'Экспортировать диагностику',
              onClick: () =>
                exportDiagnosticReport(state, { method: 'download', toastFn: dependencies?.toast }),
            },
          ],
          onContinue: () => {
            resetTechnicalSkipCounters();
            flashCtx ? nav('chapter', flashCtx) : nav('srs');
          },
        });
        return;
      }

      const rewards = [{ icon: '📚', label: `${answeredCount} отвечено` }];
      if (skippedCount > 0) {
        rewards.push({ icon: '⚠️', label: `${skippedCount} технически пропущено` });
      }
      rewards.push({ icon: '🪙', label: `+${answeredCount} XP` });

      const actions =
        skippedCount > 0
          ? [
              {
                label: 'Экспортировать диагностику',
                onClick: () =>
                  exportDiagnosticReport(state, {
                    method: 'download',
                    toastFn: dependencies?.toast,
                  }),
              },
            ]
          : [];

      showCompletionScreen({
        title: 'おめでとう！',
        subtitle: 'Повторение завершено!',
        desc: 'Вы успешно повторили карточки.',
        theme: 'success',
        rewards,
        actions,
        onContinue: () => {
          resetTechnicalSkipCounters();
          flashCtx ? nav('chapter', flashCtx) : nav('srs');
        },
      });
      renderCompletionUndo(state, dependencies, renderFlash);
      return;
    }
  }

  if (!card || !card.id) {
    console.warn('[renderFlash] No active card to render, restoring dashboard');
    const srsScreen = document.getElementById('screen-srs');
    if (srsScreen) srsScreen.classList.remove('srs-session-active');
    const srsHeader = document.querySelector('#screen-srs .app-header');
    if (srsHeader) srsHeader.style.display = 'flex';
    const tabbarEl = document.querySelector('.tabbar');
    if (tabbarEl) tabbarEl.style.display = '';
    const tabsContainer = document.getElementById('srs-tabs-container');
    if (tabsContainer) {
      tabsContainer.classList.remove('hidden');
      tabsContainer.style.display = '';
    }
    return;
  }

  const srsScreen = document.getElementById('screen-srs');
  if (srsScreen) srsScreen.classList.add('srs-session-active');
  const srsHeader = document.querySelector('#screen-srs .app-header');
  if (srsHeader) srsHeader.style.display = 'none';
  const tabbarEl = document.querySelector('.tabbar');
  if (tabbarEl) tabbarEl.style.display = 'none';
  const tabsContainer = document.getElementById('srs-tabs-container');
  if (tabsContainer) tabsContainer.classList.add('hidden');

  const srsCard = state.srs?.[card.id];
  if (srsCard && !srsCard.introducedOn) {
    markCardIntroduced(srsCard);
    card.introducedOn = srsCard.introducedOn;
    if (typeof save === 'function') save();
  }

  // Проверяем, является ли карточка particle quiz
  if (card.id.startsWith('PARTICLE_')) {
    renderParticleQuizMode(card, state, dependencies, renderFlash);
    return;
  }
  const word = wordById(card.id, LESSONS);

  const displayKanji = displayWordForm(word, state);
  const displayWriting = word.reading || word.writing;
  const displayTranslation = word.meaning || word.translation;
  const displayCategory = word.category || 'Слово';
  const hideRomaji = state.settings?.hideRomaji || false;
  const displayRomaji = word.romaji || '';

  let cardMode = card.forcedMode || determineCardMode(card, word);
  if (cardMode === CARD_MODES.DRAWING && !isKanjiFormAvailable(word, state)) {
    cardMode = CARD_MODES.MULTIPLE_CHOICE;
  }

  if (cardMode === CARD_MODES.PARTICLE_QUIZ) {
    renderParticleQuizMode(
      { ...card, lessonId: cardChapter(card.id) },
      state,
      dependencies,
      renderFlash
    );
    return;
  }

  if (cardMode === CARD_MODES.SENTENCE_BUILDING) {
    renderSentenceBuilding(
      { ...card, lessonId: cardChapter(card.id) },
      state,
      dependencies,
      renderFlash
    );
    return;
  }

  if (cardMode === CARD_MODES.CONTEXT_SENTENCE) {
    renderContextSentenceMode(word, state, dependencies, renderFlash);
    return;
  }

  if (cardMode === CARD_MODES.CONTEXT_PRODUCTION) {
    renderContextProductionMode(word, state, dependencies, renderFlash);
    return;
  }

  if (cardMode === CARD_MODES.REVERSE_MULTIPLE_CHOICE) {
    renderMultipleChoiceMode(
      word,
      state,
      dependencies,
      {
        mode: CARD_MODES.REVERSE_MULTIPLE_CHOICE,
        category: 'Японский → русский',
        question: displayKanji,
        hint: 'Выберите правильный перевод',
        questionClass: 'reverse-question',
        optionLabel: (option) => shortT(option),
      },
      renderFlash
    );
    return;
  }

  if (cardMode === CARD_MODES.DRAWING) {
    body.innerHTML = `
      <div class="flash-wrap">
        <div class="flash-top">
        <span class="flash-count" data-testid="flash-progress">${getProgressText()}</span>
        <button class="btn-ghost" id="flash-exit">Выйти</button>
      </div>
      <div class="drawing-mode-container">
          <div class="drawing-hint">
            <p class="drawing-translation">${displayTranslation}</p>
            <p class="drawing-category">${displayCategory}</p>
          </div>
          <div id="kanji-progress-cells" class="kanji-progress-cells"></div>
          <div class="kanji-writer-wrap">
            <div id="kanji-writer-target"></div>
          </div>
          <div class="drawing-controls">
            <button class="btn-secondary" id="drawing-undo">↺ Сбросить</button>
            ${
              import.meta.env.DEV
                ? '<button class="btn-secondary" id="debug-skip-btn" style="background: var(--danger); color: white; margin-left: 8px;">⏭️ Skip (TEST)</button>'
                : ''
            }
          </div>
        </div>
      </div>`;

    startReviewTiming(card.id, CARD_MODES.DRAWING);

    const exitBtn = $('#flash-exit');
    if (exitBtn) {
      exitBtn.onclick = (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();

        const tabbar = document.querySelector('.tabbar');
        if (tabbar) tabbar.style.display = '';

        const srsHeader = document.querySelector('#screen-srs .app-header');
        if (srsHeader) srsHeader.style.display = '';

        const tabsContainer = document.getElementById('srs-tabs-container');
        if (tabsContainer) tabsContainer.classList.remove('hidden');

        if (sessionManager) {
          const stats = sessionManager.getStats();
          if (stats.reviewed > 0) {
            showCompletionScreen({
              title: 'おつかれさま!',
              subtitle: 'Хорошая работа!',
              desc: `Вы повторили часть карточек`,
              theme: 'success',
              rewards: [
                { icon: '📚', label: `${stats.reviewed} карточек` },
                { icon: '✨', label: `${stats.perfect} без ошибок` },
                { icon: '🪙', label: `+${stats.reviewed} XP` },
              ],
              onContinue: () => {
                abandonActiveSession();
                flashCtx ? nav('chapter', flashCtx) : nav('srs');
              },
            });
            return;
          }
        }
        abandonActiveSession();
        flashCtx ? nav('chapter', flashCtx) : nav('srs');
      };
    }

    initDrawingMode(
      displayKanji,
      displayWriting,
      displayTranslation,
      displayCategory,
      hideRomaji,
      displayRomaji,
      state,
      dependencies,
      renderFlash,
      renderMultipleChoiceMode
    );
    return;
  }

  if (cardMode === CARD_MODES.TYPING) {
    renderTypingMode(word, state, dependencies, {}, renderFlash);
    return;
  }

  if (cardMode === CARD_MODES.MULTIPLE_CHOICE) {
    renderMultipleChoiceMode(word, state, dependencies, {}, renderFlash);
    return;
  }
}
