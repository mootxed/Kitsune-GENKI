// ui/flashcards/drawing-mode.js - Режим интерактивного рисования иероглифов с HanziWriter

import { wordById } from '../../src/srs-helpers.js';
import { SRS } from '../../srs.js';
import HanziWriter from 'hanzi-writer';
import { localCharDataLoader } from '../../src/kanji-loader.js';
import { getAllKanji } from './mode-selector.js';
import { markReviewAnswered, submitReview } from './review-fsrs.js';
import { adaptDrawingContext } from './review-context-adapters.js';
import { renderPostReviewSenseiActions } from './sensei-review-panel.js';
import { shouldShowSenseiAction } from './sensei-review-actions.js';
import { activeReviewAIContext, clearActiveReviewAIContext } from './state.js';
import { lockCurrentReviewUI } from './card-modes.js';

import {
  kanjiSequence,
  setKanjiSequence,
  currentKanjiIndex,
  setCurrentKanjiIndex,
  drawingMistakes,
  setDrawingMistakes,
  totalDrawingMistakes,
  setTotalDrawingMistakes,
  drawingHintUsed,
  setDrawingHintUsed,
  currentWriter,
  setCurrentWriter,
  sessionManager,
  flashQueue,
  flashIdx,
  setFlashIdx,
  setFlashRevealed,
} from './state.js';

export function cleanKanjiChar(char) {
  if (!char) return '';
  return char.replace(/[~～\s]/g, '').trim();
}

export function renderKanjiProgressCells() {
  const container = document.getElementById('kanji-progress-cells');
  if (!container || kanjiSequence.length === 0) {
    if (container) container.innerHTML = '';
    return;
  }

  container.innerHTML = kanjiSequence
    .map((k, idx) => {
      const classes = ['kanji-cell'];
      if (idx < currentKanjiIndex) classes.push('completed');
      if (idx === currentKanjiIndex) classes.push('current');

      const displayChar = idx < currentKanjiIndex ? k.kanji : '';
      return `<div class="${classes.join(' ')}">${displayChar}</div>`;
    })
    .join('');
}

export function initDrawingMode(
  kanji,
  writing,
  translation,
  category,
  hideRomaji,
  romaji,
  state,
  dependencies,
  renderFlashFn,
  renderMultipleChoiceModeFn
) {
  const reviewedCard = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];
  let reviewResolved = false;

  const { save, XP_CARD, appAddXP, updateSrsBadge, markActivity, toast } = dependencies;

  const target = document.getElementById('kanji-writer-target');
  if (!target || !kanji) {
    toast('⚠️ Не удалось инициализировать режим рисования');
    return;
  }

  // Инициализация последовательности, если это первый кандзи
  if (kanjiSequence.length === 0) {
    const kanjiChars = getAllKanji(kanji);
    setKanjiSequence(
      kanjiChars.map((k) => ({
        kanji: k,
        writing: writing,
        translation: translation,
        category: category,
        hideRomaji: hideRomaji,
        romaji: romaji,
      }))
    );
    setCurrentKanjiIndex(0);
    setTotalDrawingMistakes(0);
    setDrawingHintUsed(false);
  }

  renderKanjiProgressCells();
  setDrawingMistakes(0);

  // Если в слове нет кандзи - переключаемся на режим множественного выбора
  if (!kanjiSequence || kanjiSequence.length === 0) {
    console.warn('[initDrawingMode] No kanji found, switching to multiple choice mode');
    const card = reviewedCard;
    const word = wordById(card.id, dependencies.LESSONS);

    if (word && typeof renderMultipleChoiceModeFn === 'function') {
      renderMultipleChoiceModeFn(word, state, dependencies);
    } else {
      toast('⚠️ Слово не найдено');
      if (sessionManager) {
        submitReview(card, SRS.Quality.Good, state, {
          mode: 'system-fallback',
          responseTimeMs: null,
        });
      } else {
        setFlashIdx(flashIdx + 1);
      }
      if (typeof renderFlashFn === 'function') renderFlashFn(state, dependencies);
    }
    return;
  }

  if (!kanjiSequence[currentKanjiIndex]) {
    console.error('[initDrawingMode] kanjiSequence[currentKanjiIndex] is undefined');
    toast('⚠️ Ошибка: нет кандзи для рисования');
    return;
  }

  const currentKanji = kanjiSequence[currentKanjiIndex].kanji;

  function startQuiz() {
    setDrawingMistakes(0);
    if (!currentWriter) return;

    currentWriter.quiz({
      leniency: 1.2,
      onMistake: (_strokeData) => {
        const nextCharacterMistakes = drawingMistakes + 1;
        setDrawingMistakes(nextCharacterMistakes);
        setTotalDrawingMistakes(totalDrawingMistakes + 1);
        if (nextCharacterMistakes >= 6 && !drawingHintUsed) {
          setDrawingHintUsed(true);
          currentWriter.updateColor('outlineColor', '#bbbbbb');
          currentWriter.showOutline();
          toast('💡 Слишком много ошибок. Дорисуйте по контуру');
        }
      },
      onComplete: (_summaryData) => {
        setCurrentKanjiIndex(currentKanjiIndex + 1);

        if (currentKanjiIndex < kanjiSequence.length) {
          const nextKanji = kanjiSequence[currentKanjiIndex];
          renderKanjiProgressCells();

          const target = document.getElementById('kanji-writer-target');
          if (target) target.innerHTML = '';
          setCurrentWriter(null);
          setDrawingMistakes(0);

          initDrawingMode(
            nextKanji.kanji,
            nextKanji.writing,
            nextKanji.translation,
            nextKanji.category,
            nextKanji.hideRomaji,
            nextKanji.romaji,
            state,
            dependencies,
            renderFlashFn,
            renderMultipleChoiceModeFn
          );
          return;
        }

        // Все кандзи нарисованы
        if (reviewResolved) return;
        reviewResolved = true;
        lockCurrentReviewUI();

        const quality = SRS.qualityFromDrawingMistakes(totalDrawingMistakes, {
          hintUsed: drawingHintUsed,
        });
        const card = reviewedCard;
        markReviewAnswered(card.id);

        const resultText =
          quality === SRS.Quality.Easy
            ? '✅ Отлично! Нарисовано без ошибок'
            : quality === SRS.Quality.Good
              ? '✅ Хорошо! Нарисовано с небольшими ошибками'
              : quality === SRS.Quality.Hard
                ? '📝 Нарисовано с ошибками'
                : '📝 Нарисовано с подсказками';
        toast(resultText);

        const currentKanjiItem = kanjiSequence[currentKanjiIndex] || {};
        // Для слов с несколькими кандзи AI-разбор временно отключаем (до поддержке посимвольной телеметрии)
        const isMultiKanji = Array.isArray(kanjiSequence) && kanjiSequence.length > 1;
        const aiAttempt = isMultiKanji
          ? null
          : adaptDrawingContext({
              kanji,
              reading: currentKanjiItem.reading || romaji || '',
              translation,
              totalMistakes: totalDrawingMistakes,
              hintUsed: drawingHintUsed,
            });

        const reviewRes = submitReview(card, quality, state, {
          mistakes: totalDrawingMistakes,
          hintUsed: drawingHintUsed,
          ...(aiAttempt ? { aiAttempt } : {}),
        });
        if (!sessionManager) setFlashIdx(flashIdx + 1);

        if (reviewRes?.xpEligible) {
          appAddXP(XP_CARD);
        }
        save(true);
        markActivity(toast);
        setFlashRevealed(false);

        setKanjiSequence([]);
        setCurrentKanjiIndex(0);

        const showSensei =
          reviewRes?._snapshotReady &&
          reviewRes._cardSessionId &&
          shouldShowSenseiAction(activeReviewAIContext?.snapshot).show;

        if (showSensei) {
          renderPostReviewSenseiActions({
            snapshot: activeReviewAIContext?.snapshot,
            cardSessionId: reviewRes._cardSessionId,
            dependencies,
          });

          let container =
            document.getElementById('sensei-post-review-actions') ||
            document.getElementById('review-feedback-actions');
          if (container && !container.querySelector('.srp-continue-btn')) {
            const continueBtn = document.createElement('button');
            continueBtn.type = 'button';
            continueBtn.className = 'btn-primary srp-continue-btn';
            continueBtn.textContent = 'Продолжить ➔';
            continueBtn.style.marginTop = '12px';
            continueBtn.onclick = () => {
              container.innerHTML = '';
              clearActiveReviewAIContext();
              if (typeof renderFlashFn === 'function') renderFlashFn(state, dependencies);
              updateSrsBadge?.();
            };
            container.append(continueBtn);
          }
        } else {
          clearActiveReviewAIContext();
          if (typeof renderFlashFn === 'function') renderFlashFn(state, dependencies);
          updateSrsBadge?.();
        }
      },
    });
  }

  // Локальный загрузчик данных кандзи (без сетевых зависимостей)
  const loadKanjiData = (char) => {
    const cleanChar = cleanKanjiChar(char);
    if (!cleanChar) {
      return Promise.reject(new Error('Пустой символ после очистки'));
    }
    return localCharDataLoader(cleanChar);
  };

  try {
    target.innerHTML = '';

    const writer = HanziWriter.create(target, currentKanji, {
      width: 280,
      height: 280,
      padding: 10,
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 200,
      showOutline: false,
      showCharacter: false,

      strokeColor: '#1e293b',
      drawingColor: '#1e293b',
      radicalColor: '#168F16',
      outlineColor: '#f2f2f2',

      drawingWidth: 16,
      drawingFadeDuration: 150,
      strokeFadeDuration: 200,
      strokeMismatchThreshold: 0.85,
      leniency: 1.6,

      charDataLoader: loadKanjiData,
      onLoadCharDataError: (error) => {
        const cleanChar = cleanKanjiChar(currentKanji);
        console.warn(`Не удалось загрузить данные для "${cleanChar}":`, error);

        // Переключаемся на режим множественного выбора
        const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];
        const word = wordById(card.id, dependencies.LESSONS);

        if (word && typeof renderMultipleChoiceModeFn === 'function') {
          toast(`⚠️ Режим рисования недоступен для "${cleanChar}". Переключаем на выбор варианта.`);
          setKanjiSequence([]);
          setCurrentKanjiIndex(0);
          renderMultipleChoiceModeFn(word, state, dependencies);
        } else {
          toast('⚠️ Слово не найдено, пропускаем карточку');
          if (sessionManager) {
            submitReview(card, SRS.Quality.Good, state, {
              mode: 'system-fallback',
              responseTimeMs: null,
            });
          } else {
            setFlashIdx(flashIdx + 1);
          }
          setKanjiSequence([]);
          setCurrentKanjiIndex(0);
          if (typeof renderFlashFn === 'function') renderFlashFn(state, dependencies);
        }
      },
    });

    setCurrentWriter(writer);

    const undoBtn = document.getElementById('drawing-undo');
    if (undoBtn) {
      undoBtn.onclick = () => {
        if (currentWriter) {
          currentWriter.updateColor('outlineColor', '#f2f2f2');
          startQuiz();
        }
      };
    }

    const debugSkipBtn = document.getElementById('debug-skip-btn');
    if (debugSkipBtn) {
      debugSkipBtn.onclick = () => {
        console.log('[DEBUG] Skipping drawing mode for testing');
        toast('⏭️ Пропуск рисования (ТЕСТ)');
        setKanjiSequence([]);
        setCurrentKanjiIndex(0);
        const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];
        markReviewAnswered(card.id);
        submitReview(card, SRS.Quality.Good, state, {
          mode: 'debug-skip',
          responseTimeMs: null,
        });
        if (!sessionManager) setFlashIdx(flashIdx + 1);
        if (typeof renderFlashFn === 'function') renderFlashFn(state, dependencies);
      };
    }

    startQuiz();
  } catch (error) {
    console.error('[initDrawingMode] Error creating HanziWriter:', error);
    toast('⚠️ Ошибка инициализации рисования');
  }
}
