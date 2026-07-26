// ui/flashcards.js - Модуль-фасад для карточек SRS, словарного запаса и сессий

import { $, $$ } from '../src/utils.js';
import { wordById, cardChapter } from '../src/srs-helpers.js';
import { markCardIntroduced } from '../src/srs-limits.js';
import { SRS } from '../srs.js';

import {
  flashQueue,
  flashIdx,
  setFlashIdx,
  flashCtx,
  sessionManager,
  setSessionManager,
  setActiveReviewState,
  setActiveReviewDependencies,
} from './flashcards/state.js';

import { CARD_MODES, determineCardMode, shortT } from './flashcards/mode-selector.js';

import { startReviewTiming, submitReview, renderCompletionUndo } from './flashcards/review-fsrs.js';

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

import { startNextBatchIfAny } from './flashcards/session.js';

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

// Главная функция рендеринга карточки
export function renderFlash(state, dependencies) {
  const { save, showCompletionScreen, nav, LESSONS } = dependencies;

  setActiveReviewState(state);
  setActiveReviewDependencies(dependencies);

  // Скрываем .tabbar при входе в режим SRS-карточек
  const tabbar = document.querySelector('.tabbar');
  if (tabbar) tabbar.style.display = 'none';

  const body = $('#srs-body');
  if (!body) {
    console.error('[renderFlash] #srs-body not found!');
    return;
  }

  // Убедимся, что контейнер видим
  body.style.display = 'block';

  let card;

  if (sessionManager) {
    card = sessionManager.getNextCard();

    if (!card) {
      // Батч завершён: если есть следующий — запускаем его и продолжаем сессию
      if (startNextBatchIfAny(state, dependencies)) {
        renderFlash(state, dependencies);
        return;
      }

      const stats = sessionManager.getStats();
      showCompletionScreen({
        title: 'おめでとう！',
        subtitle: 'Сессия завершена!',
        desc: 'Отличная работа! Вы справились со всеми карточками.',
        theme: 'success',
        rewards: [
          { icon: '📚', label: `${stats.reviewed} карточек` },
          { icon: '✨', label: `${stats.perfect} без ошибок` },
          { icon: '🎯', label: `${Math.round(stats.accuracy)}% точность` },
          { icon: '🪙', label: `+${stats.reviewed} XP` },
        ],
        onContinue: () => {
          setSessionManager(null);
          flashCtx ? nav('chapter', flashCtx) : nav('srs');
        },
      });
      renderCompletionUndo(state, dependencies, renderFlash);
      return;
    }
  } else {
    if (flashIdx >= flashQueue.length) {
      const count = flashQueue.length;
      showCompletionScreen({
        title: 'おめでとう！',
        subtitle: 'Повторение завершено!',
        desc: 'Вы успешно повторили все карточки.',
        theme: 'success',
        rewards: [
          { icon: '📚', label: `${count} карточек` },
          { icon: '🪙', label: `+${count} XP` },
        ],
        onContinue: () => {
          flashCtx ? nav('chapter', flashCtx) : nav('srs');
        },
      });
      renderCompletionUndo(state, dependencies, renderFlash);
      return;
    }
    card = flashQueue[flashIdx];
  }

  if (card && card.id) {
    const srsCard = state.srs?.[card.id];
    if (srsCard && !srsCard.introducedOn) {
      markCardIntroduced(srsCard);
      card.introducedOn = srsCard.introducedOn;
      if (typeof save === 'function') save();
    }
  }

  // Проверяем, является ли карточка particle quiz
  if (card.id && card.id.startsWith('PARTICLE_')) {
    renderParticleQuizMode(card, state, dependencies, renderFlash);
    return;
  }
  const word = wordById(card.id, LESSONS);

  if (!word) {
    console.warn('[renderFlash] Word not found, skipping card:', card.id);
    if (sessionManager) {
      submitReview(card, SRS.Quality.Good, state, {
        mode: 'system-fallback',
        responseTimeMs: null,
      });
    } else {
      setFlashIdx(flashIdx + 1);
    }
    renderFlash(state, dependencies);
    return;
  }

  const displayKanji = word.kanji || word.writing;
  const displayWriting = word.writing;
  const displayTranslation = word.translation;
  const displayCategory = word.category || 'Слово';
  const hideRomaji = state.settings?.hideRomaji || false;
  const displayRomaji = word.romaji || '';

  const cardMode = card.forcedMode || determineCardMode(card, word);

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
                setSessionManager(null);
                flashCtx ? nav('chapter', flashCtx) : nav('srs');
              },
            });
            return;
          }
        }
        setSessionManager(null);
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
