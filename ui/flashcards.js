// ui/flashcards.js - Модуль для работы с карточками SRS и словарём

import { $, $$ } from '../src/utils.js';
import { wordById, cardChapter, isWordUnlocked, getUnlockedParticles } from '../src/srs-helpers.js';
import { allCards } from '../src/srs-helpers.js';
import { SRS } from '../srs.js';
import { speakJapanese } from '../src/audio-helper.js';
import { SessionBatcher } from '../src/session-batcher.js';
import { SessionManager } from '../session-manager.js';
import { UndoStack, adjustQualityByTime, isLeech, undoReviewEvent } from '../src/card-behavior.js';
import {
  cardsForItem,
  modeCanSchedule,
  parseCardIdentity,
  vocabularySkills,
} from '../src/knowledge-model.js';
import { calculateMastery } from '../src/mastery.js';
import { compactReviewJournal, enqueueReviewLog } from '../src/review-journal.js';
import { productionContext } from '../src/production-context.js';
import {
  MAX_TYPING_UNIQUE_CHARS,
  hiraganaToKatakana,
  katakanaToHiragana,
  normalizeKanaAnswer,
  typingCapability,
} from '../src/typing-capability.js';
import {
  CURATED_PARTICLE_SENTENCES,
  SMART_PARTICLE_TEMPLATES,
  SLOT_CATEGORIES,
  FORBIDDEN_CATEGORIES,
} from '../src/particle-templates.js';
import { conjugateVerb } from '../src/verb-conjugator.js';
import { ExamplesDB } from '../src/examples-db.js';
import {
  generateExample,
  nextSeed,
  highlightWord,
  EXAMPLE_SOURCES,
} from '../src/example-generator.js';
import HanziWriter from 'hanzi-writer';
import { localCharDataLoader } from '../src/kanji-loader.js';

// Локальный контекст зависимостей
let deps = null;

// Глобальные переменные модуля
let flashQueue = [];
let flashIdx = 0;
let flashRevealed = false;
let flashCtx = null;
let sessionManager = null;
let activeReviewTiming = null;
let activeReviewState = null;
let activeReviewDependencies = null;
let activePracticeMode = null;
const reviewUndoStack = new UndoStack(10);

// Глобальные переменные для батчинга сессий
let sessionBatcher = null;
let currentBatchIndex = 0;

// Глобальная переменная для HanziWriter
let currentWriter = null;
let drawingMistakes = 0;
let totalDrawingMistakes = 0;

// Переменные для последовательного рисования
let kanjiSequence = [];
let currentKanjiIndex = 0;

// Типы режимов карточек
export const CARD_MODES = {
  DRAWING: 'drawing',
  TYPING: 'typing',
  MULTIPLE_CHOICE: 'multiple-choice',
  REVERSE_MULTIPLE_CHOICE: 'reverse-multiple-choice',
  CONTEXT_SENTENCE: 'context-sentence',
  CONTEXT_PRODUCTION: 'context-production',
  PARTICLE_QUIZ: 'particle-quiz',
  SENTENCE_BUILDING: 'sentence-building',
};

export function isDebugSkipEnabled(env = import.meta.env) {
  return env?.DEV === true;
}

function monotonicNow() {
  return typeof globalThis.performance !== 'undefined' &&
    typeof globalThis.performance.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

function startReviewTiming(cardId, mode) {
  activeReviewTiming = {
    cardId,
    mode,
    startedAt: monotonicNow(),
    answeredAt: null,
  };
  renderCardBehaviorControls(cardId);
}

function markReviewAnswered(cardId) {
  if (activeReviewTiming?.cardId === cardId && activeReviewTiming.answeredAt === null) {
    activeReviewTiming.answeredAt = monotonicNow();
  }
}

function consumeReviewContext(cardId, fallbackMode = 'unknown') {
  if (activeReviewTiming?.cardId !== cardId) {
    return { mode: fallbackMode, responseTimeMs: null };
  }

  const finishedAt = activeReviewTiming.answeredAt ?? monotonicNow();
  const context = {
    mode: activeReviewTiming.mode,
    responseTimeMs: Math.max(0, Math.round(finishedAt - activeReviewTiming.startedAt)),
  };
  activeReviewTiming = null;
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
    sessionManager?.skipCard(card.id);
    return quality;
  }

  const mistakes = Number.isInteger(reviewContext.mistakes) ? reviewContext.mistakes : 0;
  const hintUsed = reviewContext.hintUsed === true;
  let adjustedQuality = adjustQualityByTime(quality, reviewContext.responseTimeMs, mode);
  // A hint or retry cannot be evidence for Easy.
  if ((hintUsed || mistakes > 0) && adjustedQuality === SRS.Quality.Easy) {
    adjustedQuality = SRS.Quality.Good;
  }
  const wasLeech = isLeech(srsCard);
  const sessionSnapshot = sessionManager?.createSnapshot() || null;
  const previousCard = SRS.serializeCard(srsCard);
  const isFirstAttempt = sessionManager?.getCardState(card.id)?.isFirstAttempt ?? true;
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
  }

  if (!wasLeech && isLeech(srsCard)) {
    activeReviewDependencies?.toast?.(
      '🩸 Карточка часто забывается. Добавьте к ней мнемонику или личную подсказку.'
    );
  }

  return adjustedQuality;
}

function latestUndoableEvent(state) {
  return (
    [...(state.reviewEvents || [])]
      .reverse()
      .find((event) => !event.undoneAt && event.previousCard && event.nextCard) || null
  );
}

async function undoLastReview(state, dependencies) {
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

  flashIdx = previous?.flashIdx ?? flashIdx;
  flashRevealed = previous?.flashRevealed ?? false;
  activeReviewTiming = null;
  kanjiSequence = [];
  currentKanjiIndex = 0;
  totalDrawingMistakes = 0;

  document.getElementById('completion-overlay')?.classList.add('hidden');
  await dependencies.save(true);
  dependencies.updateSrsBadge?.();
  dependencies.toast?.('↩️ Последний ответ отменён');
  renderFlash(state, dependencies);
  return true;
}

function createUndoButton(state, dependencies) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn-ghost review-undo-btn';
  button.dataset.testid = 'review-undo';
  button.textContent = '↩️ Отменить ответ';
  button.onclick = async () => undoLastReview(state, dependencies);
  return button;
}

function renderCardBehaviorControls(cardId) {
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

function renderCompletionUndo(state, dependencies) {
  const rewards = document.getElementById('completion-rewards');
  if (!rewards) return;
  rewards.parentElement?.querySelector('.review-undo-btn')?.remove();
  if (!reviewUndoStack.canUndo && !latestUndoableEvent(state)) return;
  rewards.insertAdjacentElement('afterend', createUndoButton(state, dependencies));
}

// Короткая форма перевода: первая часть до пояснения в скобках/после ';'
function shortT(word) {
  const t = (word && word.translation) || '';
  return t.split(/[(;]/)[0].trim();
}

// Конвертер Хирагана → Катакана (переиспользование из кроссвордов)
const HIRAGANA_TO_KATAKANA = {
  あ: 'ア',
  い: 'イ',
  う: 'ウ',
  え: 'エ',
  お: 'オ',
  か: 'カ',
  き: 'キ',
  く: 'ク',
  け: 'ケ',
  こ: 'コ',
  さ: 'サ',
  し: 'シ',
  す: 'ス',
  せ: 'セ',
  そ: 'ソ',
  た: 'タ',
  ち: 'チ',
  つ: 'ツ',
  て: 'テ',
  と: 'ト',
  な: 'ナ',
  に: 'ニ',
  ぬ: 'ヌ',
  ね: 'ネ',
  の: 'ノ',
  は: 'ハ',
  ひ: 'ヒ',
  ふ: 'フ',
  へ: 'ヘ',
  ほ: 'ホ',
  ま: 'マ',
  み: 'ミ',
  む: 'ム',
  め: 'メ',
  も: 'モ',
  や: 'ヤ',
  ゆ: 'ユ',
  よ: 'ヨ',
  ら: 'ラ',
  り: 'リ',
  る: 'ル',
  れ: 'レ',
  ろ: 'ロ',
  わ: 'ワ',
  を: 'ヲ',
  ん: 'ン',
  が: 'ガ',
  ぎ: 'ギ',
  ぐ: 'グ',
  げ: 'ゲ',
  ご: 'ゴ',
  ざ: 'ザ',
  じ: 'ジ',
  ず: 'ズ',
  ぜ: 'ゼ',
  ぞ: 'ゾ',
  だ: 'ダ',
  ぢ: 'ヂ',
  づ: 'ヅ',
  で: 'デ',
  ど: 'ド',
  ば: 'バ',
  び: 'ビ',
  ぶ: 'ブ',
  べ: 'ベ',
  ぼ: 'ボ',
  ぱ: 'パ',
  ぴ: 'ピ',
  ぷ: 'プ',
  ぺ: 'ペ',
  ぽ: 'ポ',
  ゃ: 'ャ',
  ゅ: 'ュ',
  ょ: 'ョ',
  っ: 'ッ',
  ー: 'ー',
};

// Вспомогательная функция перемешивания массива
function shuffleArray(array, random = Math.random) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function normalizeChoiceLabel(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('ru')
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim();
}

export function canonicalLexeme(word) {
  const japanese = katakanaToHiragana(word?.writing || word?.kanji || '')
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .trim();
  if (japanese) return `surface:${japanese}`;
  if (word?.lexemeId) return `id:${word.lexemeId}`;
  return `label:${normalizeChoiceLabel(shortT(word))}`;
}

export function buildMultipleChoiceOptions(
  word,
  allWords,
  optionLabel,
  { isEligible = () => true, random = Math.random } = {}
) {
  const correctLabel = normalizeChoiceLabel(optionLabel(word));
  const correctLexeme = canonicalLexeme(word);
  const usedLabels = new Set([correctLabel]);
  const usedLexemes = new Set([correctLexeme]);
  const distractors = [];
  const candidates = [
    ...(allWords || []).filter((candidate) => candidate.category === word.category),
    ...(allWords || []).filter((candidate) => candidate.category !== word.category),
  ];

  for (const candidate of shuffleArray(candidates, random)) {
    if (candidate.id === word.id || !isEligible(candidate)) continue;
    const label = normalizeChoiceLabel(optionLabel(candidate));
    const lexeme = canonicalLexeme(candidate);
    if (!label || usedLabels.has(label) || usedLexemes.has(lexeme)) continue;
    distractors.push(candidate);
    usedLabels.add(label);
    usedLexemes.add(lexeme);
    if (distractors.length === 3) break;
  }

  return shuffleArray([word, ...distractors], random);
}

// Вспомогательная функция для получения текста прогресса
function getProgressText() {
  if (sessionManager) {
    const stats = sessionManager.getStats();
    // Показываем: (пройдено попыток + 1) / всего
    // attempted считает карточки, по которым была первая попытка — и правильная, и ошибочная.
    // +1 потому что текущая карточка ещё не засчитана
    const attempted = stats.attempted !== undefined ? stats.attempted : stats.reviewed;
    const current = Math.min(attempted + 1, stats.total);
    return `${current} / ${stats.total}`;
  }
  return `${flashIdx + 1} / ${flashQueue.length}`;
}

// Функция генерации particle quiz с использованием новой системы шаблонов
function generateParticleQuiz(particle, lessonData, state, LESSONS) {
  // ШАГ 1: Попытка использовать готовые предложения (CURATED_PARTICLE_SENTENCES)
  const curatedSentences = CURATED_PARTICLE_SENTENCES[particle];
  if (curatedSentences && curatedSentences.length > 0) {
    const example = curatedSentences[Math.floor(Math.random() * curatedSentences.length)];

    // Генерируем дистракторы
    let unlockedParticles = getUnlockedParticles(state.chapters, LESSONS);
    unlockedParticles = unlockedParticles.filter((p) => p !== particle);

    if (unlockedParticles.length < 3) {
      const basicParticles = ['は', 'の', 'に', 'で', 'を', 'が', 'と', 'も', 'か'];
      unlockedParticles = basicParticles.filter((p) => p !== particle);
    }

    const distractors = shuffleArray(unlockedParticles).slice(0, 3);
    const options = shuffleArray([example.correct, ...distractors]);

    return {
      sentence: example.sentence,
      correctParticle: example.correct,
      options,
      russianHint: example.hint,
      words: [],
    };
  }

  // ШАГ 2: Использование умных шаблонов (SMART_PARTICLE_TEMPLATES)
  const templateDef = SMART_PARTICLE_TEMPLATES[particle];
  if (!templateDef) {
    console.warn(`[particle-quiz] Нет шаблона для частицы: ${particle}`);
    return null;
  }

  const { slots, template, hint, prohibitedCombinations } = templateDef;

  // Собираем все разблокированные слова из всех уроков
  const allWords = LESSONS.flatMap((l) => l.words || l.vocabulary || []).filter((w) =>
    isWordUnlocked(w.id, state.chapters)
  );

  // Подбор слова для слота с учетом запрещенных комбинаций
  const findWordForSlot = (slotDef, excludeIds = [], previousWords = []) => {
    const roles = Array.isArray(slotDef) ? slotDef : [slotDef];
    for (const role of roles) {
      const categories = SLOT_CATEGORIES[role] || SLOT_CATEGORIES.noun;
      const candidates = allWords.filter(
        (w) =>
          categories.includes(w.category) &&
          !excludeIds.includes(w.id) &&
          !FORBIDDEN_CATEGORIES.includes(w.category)
      );

      // Фильтруем запрещенные комбинации
      const validCandidates = candidates.filter((candidate) => {
        if (previousWords.length === 0) return true;
        // Проверяем с каждым предыдущим словом
        return previousWords.every(
          (prevWord) => !prohibitedCombinations || !prohibitedCombinations(prevWord, candidate)
        );
      });

      if (validCandidates.length > 0) {
        return validCandidates[Math.floor(Math.random() * validCandidates.length)];
      }
    }
    return null;
  };

  // Подбираем разные слова для каждого слота
  const selectedWords = [];
  for (const slot of slots) {
    const word = findWordForSlot(
      slot,
      selectedWords.map((w) => w.id),
      selectedWords
    );

    if (!word) {
      // Откат к готовым предложениям если они есть
      if (curatedSentences && curatedSentences.length > 0) {
        const example = curatedSentences[Math.floor(Math.random() * curatedSentences.length)];
        let unlockedParticles = getUnlockedParticles(state.chapters, LESSONS);
        unlockedParticles = unlockedParticles.filter((p) => p !== particle);
        if (unlockedParticles.length < 3) {
          const basicParticles = ['は', 'の', 'に', 'で', 'を', 'が', 'と', 'も', 'か'];
          unlockedParticles = basicParticles.filter((p) => p !== particle);
        }
        const distractors = shuffleArray(unlockedParticles).slice(0, 3);
        const options = shuffleArray([example.correct, ...distractors]);
        return {
          sentence: example.sentence,
          correctParticle: example.correct,
          options,
          russianHint: example.hint,
          words: [],
        };
      }
      return null;
    }
    selectedWords.push(word);
  }

  // Генерируем предложение и подсказку через умные шаблоны
  const sentence = template(...selectedWords);
  const russianHint = hint(...selectedWords);

  // Генерируем дистракторы
  let unlockedParticles = getUnlockedParticles(state.chapters, LESSONS);
  unlockedParticles = unlockedParticles.filter((p) => p !== particle);

  if (unlockedParticles.length < 3) {
    const basicParticles = ['は', 'の', 'に', 'で', 'を', 'が', 'と', 'も', 'か'];
    unlockedParticles = basicParticles.filter((p) => p !== particle);
  }

  const distractors = shuffleArray(unlockedParticles).slice(0, 3);
  const options = shuffleArray([particle, ...distractors]);

  return {
    sentence,
    correctParticle: particle,
    options,
    russianHint,
    words: selectedWords,
  };
}

// Проверяет, содержит ли строка хотя бы один настоящий кандзи (CJK иероглиф)
export function hasKanjiChars(text) {
  return getAllKanji(text).length > 0;
}

// Очищает строку ответа от служебных символов (~, ～, пробелы, пунктуация, скобки),
// оставляя только символы, доступные на виртуальной клавиатуре (кана)
export function cleanKanaString(text) {
  return normalizeKanaAnswer(text);
}

// Максимальное количество уникальных символов каны для режима ввода с клавиатуры
export { MAX_TYPING_UNIQUE_CHARS };

// Проверяет, допустимо ли слово для режима ввода с клавиатуры:
// - после очистки должен остаться хотя бы один символ каны
// - уникальных символов каны должно быть не больше MAX_TYPING_UNIQUE_CHARS
export function isWordTypingEligible(word) {
  return typingCapability(word).canType;
}

// Функция генерации виртуальной клавиатуры для SRS
function generateSrsKeyboard(acceptedAnswers) {
  const correctLetters = [...new Set(acceptedAnswers.flatMap((answer) => [...answer]))];
  const allKana = [...new Set([...Object.keys(HIRAGANA_TO_KATAKANA), ...correctLetters])];

  // Собираем уникальные символы из ВСЕХ вариантов правильных ответов
  const limitedCorrect = correctLetters.slice(0, MAX_TYPING_UNIQUE_CHARS);

  // Добавляем отвлекающие символы до целевого компактного размера.
  const distractors = [];
  const targetTotal = Math.max(8, limitedCorrect.length);
  const distractorCount = targetTotal - limitedCorrect.length;

  while (distractors.length < distractorCount) {
    const randomKana = allKana[Math.floor(Math.random() * allKana.length)];
    if (!correctLetters.includes(randomKana) && !distractors.includes(randomKana)) {
      distractors.push(randomKana);
    }
  }

  return shuffleArray([...limitedCorrect, ...distractors]).slice(0, targetTotal);
}

export function weightedRandom(weights, random = Math.random) {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return CARD_MODES.MULTIPLE_CHOICE;

  let cursor = random() * total;
  for (const [mode, weight] of entries) {
    cursor -= weight;
    if (cursor < 0) return mode;
  }
  return entries.at(-1)[0];
}

export function getAdaptiveModeWeights(card, word) {
  const hasKanji = hasKanjiChars(word.kanji || word.writing);
  const canType = isWordTypingEligible(word);
  const isNewOrEarly = card?.state === SRS.State.New || (card?.reps ?? 0) <= 2;
  const isMature = !isNewOrEarly && (card?.stability ?? 0) >= 7;

  const weights = isNewOrEarly
    ? { multipleChoice: 0.7, typing: hasKanji ? 0.2 : 0.3, drawing: hasKanji ? 0.1 : 0 }
    : isMature
      ? { multipleChoice: 0.2, typing: hasKanji ? 0.3 : 0.8, drawing: hasKanji ? 0.5 : 0 }
      : { multipleChoice: 0.4, typing: hasKanji ? 0.3 : 0.6, drawing: hasKanji ? 0.3 : 0 };

  if (!canType) weights.typing = 0;
  return weights;
}

function hasWordContext(word) {
  return Boolean(generateWordContext(word));
}

function selectRecognitionMode(word, random) {
  const weights = hasWordContext(word)
    ? {
        [CARD_MODES.CONTEXT_SENTENCE]: 0.25,
        [CARD_MODES.REVERSE_MULTIPLE_CHOICE]: 0.3,
        [CARD_MODES.MULTIPLE_CHOICE]: 0.45,
      }
    : {
        [CARD_MODES.REVERSE_MULTIPLE_CHOICE]: 0.3,
        [CARD_MODES.MULTIPLE_CHOICE]: 0.7,
      };
  return weightedRandom(weights, random);
}

// Выбирает сложность упражнения по зрелости карточки: recognition → recall → production.
export function selectMode(card, word, random = Math.random) {
  const weights = getAdaptiveModeWeights(card, word);
  const baseMode = weightedRandom(weights, random);

  if (baseMode === 'multipleChoice') return selectRecognitionMode(word, random);
  if (baseMode === 'typing') return CARD_MODES.TYPING;
  if (baseMode === 'drawing') return CARD_MODES.DRAWING;
  return CARD_MODES.MULTIPLE_CHOICE;
}

// Функция определения режима карточки
function determineCardMode(card, word) {
  return selectMode(card, word);
}

// Контекст существует только при наличии валидного структурированного задания.
export function generateWordContext(word) {
  return productionContext(word);
}

// Функция проверки, является ли строка одиночным кандзи
function isSingleKanji(text) {
  if (!text || text.length === 0) return false;
  const code = text.charCodeAt(0);
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x20000 && code <= 0x2a6df)
  );
}

// Функция извлекает первый кандзи из текста
function getFirstKanji(text) {
  if (!text) return null;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df)
    ) {
      return text[i];
    }
  }
  return null;
}

// Функция извлечения всех кандзи из строки
export function getAllKanji(text) {
  if (!text) return [];
  const kanji = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df)
    ) {
      kanji.push(text[i]);
    }
  }
  return kanji;
}

// Отрисовка ячеек прогресса
function renderKanjiProgressCells() {
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

// Функция инициализации режима рисования с HanziWriter
function initDrawingMode(
  kanji,
  writing,
  translation,
  category,
  hideRomaji,
  romaji,
  state,
  dependencies
) {
  const {
    save,
    showCompletionScreen,
    XP_CARD,
    appAddXP,
    updateSrsBadge,
    nav,
    markActivity,
    toast,
  } = dependencies;

  const target = document.getElementById('kanji-writer-target');
  if (!target || !kanji) {
    toast('⚠️ Не удалось инициализировать режим рисования');
    return;
  }

  // Инициализация последовательности, если это первый кандзи
  if (kanjiSequence.length === 0) {
    const kanjiChars = getAllKanji(kanji);
    kanjiSequence = kanjiChars.map((k) => ({
      kanji: k,
      writing: writing,
      translation: translation,
      category: category,
      hideRomaji: hideRomaji,
      romaji: romaji,
    }));
    currentKanjiIndex = 0;
    totalDrawingMistakes = 0;
  }

  renderKanjiProgressCells();
  drawingMistakes = 0;

  // Если в слове нет кандзи - переключаемся на режим множественного выбора
  if (!kanjiSequence || kanjiSequence.length === 0) {
    console.warn('[initDrawingMode] No kanji found, switching to multiple choice mode');
    // Получаем текущую карточку и слово
    const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];
    const word = wordById(card.id, dependencies.LESSONS);

    if (word) {
      // Рендерим режим множественного выбора
      renderMultipleChoiceMode(word, state, dependencies);
    } else {
      // Если слово не найдено - пропускаем карточку
      toast('⚠️ Слово не найдено');
      if (sessionManager) {
        submitReview(card, SRS.Quality.Good, state, {
          mode: 'system-fallback',
          responseTimeMs: null,
        });
      } else {
        flashIdx += 1;
      }
      renderFlash(state, dependencies);
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
    drawingMistakes = 0;
    if (!currentWriter) return;

    currentWriter.quiz({
      leniency: 1.2,
      onMistake: (strokeData) => {
        drawingMistakes++;
        totalDrawingMistakes++;
        if (drawingMistakes >= 3) {
          currentWriter.updateColor('outlineColor', '#bbbbbb');
          currentWriter.showOutline();
          toast('💡 Слишком много ошибок. Дорисуйте по контуру');
        }
      },
      onComplete: (summaryData) => {
        currentKanjiIndex++;

        if (currentKanjiIndex < kanjiSequence.length) {
          const nextKanji = kanjiSequence[currentKanjiIndex];
          renderKanjiProgressCells();

          const target = document.getElementById('kanji-writer-target');
          if (target) target.innerHTML = '';
          currentWriter = null;
          drawingMistakes = 0;

          initDrawingMode(
            nextKanji.kanji,
            nextKanji.writing,
            nextKanji.translation,
            nextKanji.category,
            nextKanji.hideRomaji,
            nextKanji.romaji,
            state,
            dependencies
          );
          return;
        }

        // Все кандзи нарисованы
        const quality = SRS.qualityFromDrawingMistakes(totalDrawingMistakes);
        const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];
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

        submitReview(card, quality, state, {
          mistakes: totalDrawingMistakes,
          hintUsed: totalDrawingMistakes >= 3,
        });
        if (!sessionManager) flashIdx += 1;

        appAddXP(XP_CARD);
        save(true);
        markActivity(toast);
        flashRevealed = false;

        kanjiSequence = [];
        currentKanjiIndex = 0;

        setTimeout(() => {
          renderFlash(state, dependencies);
          updateSrsBadge();
        }, 300);
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

    currentWriter = HanziWriter.create(target, currentKanji, {
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

        if (word) {
          toast(`⚠️ Режим рисования недоступен для "${cleanChar}". Переключаем на выбор варианта.`);
          kanjiSequence = [];
          currentKanjiIndex = 0;
          renderMultipleChoiceMode(word, state, dependencies);
        } else {
          toast('⚠️ Слово не найдено, пропускаем карточку');
          if (sessionManager) {
            submitReview(card, SRS.Quality.Good, state, {
              mode: 'system-fallback',
              responseTimeMs: null,
            });
          } else {
            flashIdx += 1;
          }
          kanjiSequence = [];
          currentKanjiIndex = 0;
          renderFlash(state, dependencies);
        }
      },
    });

    const undoBtn = document.getElementById('drawing-undo');
    if (undoBtn) {
      undoBtn.onclick = () => {
        if (currentWriter) {
          currentWriter.updateColor('outlineColor', '#f2f2f2');
          startQuiz();
        }
      };
    }

    const skipBtn = import.meta.env.DEV ? document.getElementById('debug-skip-btn') : null;
    if (skipBtn) {
      skipBtn.onclick = () => {
        kanjiSequence = [];
        currentKanjiIndex = 0;
        totalDrawingMistakes = 0;

        const quality = SRS.Quality.Good; // Simulate correct completion
        const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];

        submitReview(card, quality, state, { mode: 'debug-skip', responseTimeMs: null });
        if (!sessionManager) flashIdx += 1;

        appAddXP(XP_CARD);
        save(true);
        markActivity(toast);
        flashRevealed = false;

        setTimeout(() => {
          renderFlash(state, dependencies);
          updateSrsBadge();
        }, 100);
      };
    }
    // === END DEBUG SKIP BUTTON HANDLER ===

    startQuiz();
  } catch (error) {
    console.error('Ошибка инициализации HanziWriter:', error);
    toast('⚠️ Ошибка загрузки кандзи: ' + error.message);
    flashRevealed = true;
    renderFlash(state, dependencies);
  }
}

// Функция показа карточки после завершения рисования
function showCardAfterDrawing(
  kanji,
  writing,
  translation,
  category,
  hideRomaji,
  romaji,
  state,
  dependencies
) {
  const { save, showCompletionScreen, XP_CARD, appAddXP, updateSrsBadge, nav, markActivity } =
    dependencies;

  const body = $('#srs-body');
  const activeCard = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];
  if (activeCard) startReviewTiming(activeCard.id, CARD_MODES.DRAWING);

  body.innerHTML = `
    <div class="flash-wrap">
      <div class="flash-top">
        <span class="flash-count" data-testid="flash-progress">${getProgressText()}</span>
        <button class="btn-ghost" id="flash-exit">Выйти</button>
      </div>
      <div class="flash-card-3d" id="flash-card" data-testid="flash-card">
        <div class="flash-inner flipped">
          <div class="flash-front">
            <button class="flash-speak" id="flash-speak" aria-label="Озвучить">🔊</button>
            <div class="flash-cat">${category}</div>
            <p class="flash-jp">${kanji}</p>
            <p class="flash-tap-hint">Нажмите, чтобы показать ответ</p>
          </div>
          <div class="flash-back">
            <p class="flash-tr">${translation}</p>
            ${kanji !== writing ? `<p class="flash-reading">${writing}</p>` : ''}
            ${hideRomaji ? '' : `<p class="flash-romaji">${romaji}</p>`}
          </div>
        </div>
      </div>
      <div id="rate" class="">
        <div class="rate-row">
          <button class="rate-btn rate-again" data-q="0" data-testid="rate-again">Снова</button>
          <button class="rate-btn rate-hard" data-q="3" data-testid="rate-hard">Трудно</button>
          <button class="rate-btn rate-good" data-q="4" data-testid="rate-good">Хорошо</button>
          <button class="rate-btn rate-easy" data-q="5" data-testid="rate-easy">Легко</button>
        </div>
      </div>
    </div>`;

  speakJapanese(writing);
  const speakBtn = $('#flash-speak');
  if (speakBtn)
    speakBtn.onclick = (e) => {
      e.stopPropagation();
      speakJapanese(writing);
    };

  const exitBtn = $('#flash-exit');
  if (exitBtn) {
    exitBtn.onclick = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();

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
              sessionManager = null;
              flashCtx ? nav('chapter', flashCtx) : nav('srs');
            },
          });
          return;
        }
      }
      sessionManager = null;
      flashCtx ? nav('chapter', flashCtx) : nav('srs');
    };
  }

  $$('#rate .rate-btn').forEach((b) => {
    b.onclick = () => {
      const quality = parseInt(b.dataset.q, 10);
      const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];
      markReviewAnswered(card.id);

      submitReview(card, quality, state);
      if (!sessionManager) flashIdx += 1;

      appAddXP(XP_CARD);
      save(true);
      markActivity();
      flashRevealed = false;
      renderFlash(state, dependencies);
      updateSrsBadge();
    };
  });
}

// Функция рендеринга режима ввода с клавиатуры
function renderTypingMode(word, state, dependencies, modeConfig = {}) {
  const { save, showCompletionScreen, XP_CARD, appAddXP, updateSrsBadge, nav, markActivity } =
    dependencies;

  const body = $('#srs-body');
  const displayWriting = word.writing;
  const displayTranslation = word.translation;
  const displayCategory = modeConfig.category || word.category || 'Слово';
  const displayQuestion = modeConfig.question || displayTranslation;
  const displayHint = modeConfig.hint || 'Введите слово на японском';
  const typingMode = modeConfig.mode || CARD_MODES.TYPING;

  let isChecked = false;
  let typingMistakes = 0;

  // Парсим допустимые варианты чтения и очищаем их от служебных символов
  // (~, ～, пробелы, пунктуация, скобки) — на клавиатуре есть только кана
  const capability = typingCapability(word, modeConfig.acceptedAnswers || null);
  if (!capability.canType) {
    throw new Error(`[Typing] Для ${word.id || displayWriting} нет проходимого ответа`);
  }
  const acceptedAnswers = capability.acceptedAnswers;

  // Скрываем tabbar во время SRS-сессии
  const tabbar = document.querySelector('.tabbar');
  if (tabbar) tabbar.style.display = 'none';

  // Генерируем виртуальную клавиатуру из ВСЕХ вариантов
  const keyboardLetters = generateSrsKeyboard(acceptedAnswers);

  body.innerHTML = `
    <div class="flash-wrap">
      <div class="flash-top">
        <span class="flash-count" data-testid="flash-progress">${getProgressText()}</span>
        <button class="btn-ghost" id="flash-exit">Выйти</button>
      </div>
      <div class="typing-mode-container">
        <div class="typing-prompt">
          <div class="flash-cat">${displayCategory}</div>
          <p class="typing-kanji">${displayQuestion}</p>
          <p class="typing-hint">${displayHint}</p>
        </div>
        <input 
          type="text" 
          class="typing-input" 
          id="typing-input"
          autocomplete="off"
          placeholder="например: だいがく"
        />
        <div class="srs-keyboard-container" id="srs-keyboard">
          ${keyboardLetters
            .map(
              (letter) => `
            <button class="srs-kana-key" data-letter="${letter}">
              <span class="key-hira">${letter}</span>
              <span class="key-kata">${hiraganaToKatakana(letter)}</span>
            </button>
          `
            )
            .join('')}
        </div>
        <div class="srs-keyboard-actions">
          <button class="srs-keyboard-backspace" id="srs-backspace">⌫ Стереть</button>
          <button class="btn-primary typing-check" id="typing-check">Проверить</button>
        </div>
        <div id="typing-hint-message" class="typing-hint hidden" style="color: var(--orange); font-weight: 700; margin-top: 8px;"></div>
      </div>
    </div>`;

  const reviewCardId = (sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx])?.id;
  startReviewTiming(reviewCardId || word.id, typingMode);

  const input = $('#typing-input');
  const checkBtn = $('#typing-check');
  const hintMessage = $('#typing-hint-message');
  const backspaceBtn = $('#srs-backspace');

  // Обработчики виртуальной клавиатуры
  $$('.srs-kana-key').forEach((btn) => {
    btn.onclick = () => {
      if (isChecked) return;
      const letter = btn.dataset.letter;
      input.value += letter;
    };
  });

  // Обработчик backspace
  if (backspaceBtn) {
    backspaceBtn.onclick = () => {
      if (isChecked) return;
      input.value = input.value.slice(0, -1);
    };
  }

  const handleCheck = () => {
    if (isChecked) return;

    const userAnswer = normalizeKanaAnswer(input.value);

    // Проверяем, соответствует ли ввод ЛЮБОМУ из допустимых вариантов
    const isCorrect = acceptedAnswers.some((answer) => answer === userAnswer);

    if (isCorrect) {
      input.classList.add('correct');
      input.classList.remove('incorrect', 'shake-error');

      const quality = SRS.qualityFromMistakes(typingMistakes);
      markReviewAnswered(reviewCardId || word.id);

      setTimeout(() => {
        handleRating(quality);
      }, 500);
    } else {
      typingMistakes++;

      if (typingMistakes === 1) {
        input.classList.add('shake-error', 'incorrect');
        input.classList.remove('correct');

        setTimeout(() => {
          input.classList.remove('shake-error');
        }, 500);

        // Подсказка: первый символ первого варианта
        hintMessage.textContent = `Подсказка: начинается на "${acceptedAnswers[0][0]}"`;
        hintMessage.classList.remove('hidden');

        isChecked = false;
      } else {
        input.classList.add('incorrect');
        input.classList.remove('correct', 'shake-error');
        input.disabled = true;
        checkBtn.disabled = true;

        // Показываем ВСЕ допустимые варианты через " или "
        const allAnswers = acceptedAnswers.join(' или ');
        hintMessage.innerHTML = `<p style="color: var(--danger); margin: 8px 0;">❌ Неправильно</p><p style="margin: 4px 0;">Правильный ответ: <strong style="color: var(--primary);">${allAnswers}</strong></p>`;
        hintMessage.classList.remove('hidden');
        markReviewAnswered(reviewCardId || word.id);

        setTimeout(() => {
          handleRating(SRS.Quality.Again);
        }, 1000);
      }
    }

    isChecked = typingMistakes >= 2 || isCorrect;
  };

  const handleRating = (quality) => {
    const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];

    submitReview(card, quality, state, {
      mistakes: typingMistakes,
      hintUsed: typingMistakes > 0,
    });
    if (!sessionManager) flashIdx += 1;

    appAddXP(XP_CARD);
    save(true);
    markActivity();
    flashRevealed = false;
    renderFlash(state, dependencies);
    updateSrsBadge();
  };

  if (checkBtn) {
    checkBtn.onclick = handleCheck;
  }

  if (input) {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleCheck();
      }
    });
  }

  const exitBtn = $('#flash-exit');
  if (exitBtn) {
    exitBtn.onclick = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      // Восстанавливаем tabbar, header и tabs SRS
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
              sessionManager = null;
              flashCtx ? nav('chapter', flashCtx) : nav('srs');
            },
          });
          return;
        }
      }
      sessionManager = null;
      flashCtx ? nav('chapter', flashCtx) : nav('srs');
    };
  }
}

function renderContextSentenceMode(word, state, dependencies) {
  const context = generateWordContext(word);
  if (!context) {
    renderMultipleChoiceMode(word, state, dependencies);
    return;
  }

  renderMultipleChoiceMode(word, state, dependencies, {
    mode: CARD_MODES.CONTEXT_SENTENCE,
    category: 'Контекст слова',
    question: context.prompt,
    hint: context.meaningCue,
    questionClass: 'context-sentence',
  });
}

function renderContextProductionMode(word, state, dependencies) {
  const context = generateWordContext(word);
  if (!context) {
    throw new Error(`[Production] Для ${word.id} нет структурированного задания`);
  }
  renderTypingMode(word, state, dependencies, {
    mode: CARD_MODES.CONTEXT_PRODUCTION,
    category: 'Активное воспроизведение',
    question: context.prompt,
    hint: `${context.meaningCue} · форма: ${context.requiredForm}`,
    acceptedAnswers: context.acceptedAnswers,
  });
}

// Функция рендеринга режима множественного выбора (4 варианта)
function renderMultipleChoiceMode(word, state, dependencies, modeConfig = {}) {
  const {
    save,
    showCompletionScreen,
    XP_CARD,
    appAddXP,
    updateSrsBadge,
    nav,
    markActivity,
    LESSONS,
  } = dependencies;

  const body = $('#srs-body');
  const displayKanji = word.kanji || word.writing;
  const displayTranslation = word.translation;
  const displayCategory = modeConfig.category || word.category || 'Слово';
  const displayQuestion = modeConfig.question || displayTranslation;
  const displayHint = modeConfig.hint || 'Выберите правильное слово';
  const questionClass = modeConfig.questionClass || '';
  const optionLabel = modeConfig.optionLabel || ((option) => option.kanji || option.writing);

  let mistakeCount = 0;

  // Скрываем tabbar во время SRS-сессии
  const tabbar = document.querySelector('.tabbar');
  if (tabbar) tabbar.style.display = 'none';

  const allWords = LESSONS.flatMap((l) => l.words || []);
  const options = buildMultipleChoiceOptions(word, allWords, optionLabel, {
    isEligible: (candidate) => isWordUnlocked(candidate.id, state.chapters),
  });

  body.innerHTML = `
    <div class="flash-wrap">
      <div class="flash-top">
        <span class="flash-count" data-testid="flash-progress">${getProgressText()}</span>
        <button class="btn-ghost" id="flash-exit">Выйти</button>
      </div>
      <div class="quiz-mode-container">
        <div class="quiz-prompt">
          <div class="flash-cat">${displayCategory}</div>
          <p class="quiz-question ${questionClass}">${displayQuestion}</p>
          <p class="quiz-hint">${displayHint}</p>
        </div>
        <div class="quiz-options-grid">
          ${options
            .map(
              (opt) => `
            <button class="quiz-option-btn" data-word-id="${opt.id}">
              ${optionLabel(opt)}
            </button>
          `
            )
            .join('')}
        </div>
      </div>
    </div>`;

  const reviewCardId = (sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx])?.id;
  startReviewTiming(reviewCardId || word.id, modeConfig.mode || CARD_MODES.MULTIPLE_CHOICE);

  const handleRating = (quality) => {
    const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];

    submitReview(card, quality, state, {
      mistakes: mistakeCount,
      hintUsed: false,
    });
    if (!sessionManager) flashIdx += 1;

    appAddXP(XP_CARD);
    save(true);
    markActivity();
    flashRevealed = false;
    renderFlash(state, dependencies);
    updateSrsBadge();
  };

  $$('.quiz-option-btn').forEach((btn) => {
    btn.onclick = () => {
      if (btn.disabled) return;

      const selectedWordId = btn.dataset.wordId;
      const isCorrect = selectedWordId === word.id;

      if (isCorrect) {
        btn.classList.add('correct');
        btn.disabled = true;

        // Вычисляем качество на основе ошибок
        const quality = SRS.qualityFromMistakes(mistakeCount);
        markReviewAnswered(reviewCardId || word.id);

        setTimeout(() => {
          handleRating(quality);
        }, 600);
      } else {
        btn.classList.add('incorrect');
        btn.disabled = true;
        mistakeCount++;

        // Если 2+ ошибки, автоматически завершаем с quality=0
        if (mistakeCount >= 2) {
          $$('.quiz-option-btn').forEach((b) => (b.disabled = true));

          // Подсвечиваем правильный ответ зелёным
          $$('.quiz-option-btn').forEach((b) => {
            if (b.dataset.wordId === word.id) {
              b.classList.add('correct');
            }
          });
          markReviewAnswered(reviewCardId || word.id);

          setTimeout(() => {
            handleRating(SRS.Quality.Again);
          }, 1000);
        }
      }
    };
  });

  const exitBtn = $('#flash-exit');
  if (exitBtn) {
    exitBtn.onclick = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      // Восстанавливаем tabbar, header и tabs SRS
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
              sessionManager = null;
              flashCtx ? nav('chapter', flashCtx) : nav('srs');
            },
          });
          return;
        }
      }
      sessionManager = null;
      flashCtx ? nav('chapter', flashCtx) : nav('srs');
    };
  }
}

// Функция рендеринга режима составления предложений (Sentence Building)
function renderSentenceBuilding(particleCard, state, dependencies) {
  const {
    save,
    showCompletionScreen,
    XP_CARD,
    appAddXP,
    updateSrsBadge,
    nav,
    markActivity,
    LESSONS,
  } = dependencies;

  const body = $('#srs-body');
  let mistakeCount = 0;
  let userSentence = []; // Массив выбранных слов пользователем

  // Скрываем tabbar во время SRS-сессии
  const tabbar = document.querySelector('.tabbar');
  if (tabbar) tabbar.style.display = 'none';

  // Откат на множественный выбор при невозможности построить sentence
  const fallbackToMultipleChoice = (reason) => {
    console.warn(`[sentence-building] ${reason}, fallback на multiple choice`);
    const word = wordById(particleCard.id, LESSONS);
    if (word) {
      renderMultipleChoiceMode(word, state, dependencies);
    } else {
      if (sessionManager) {
        submitReview(particleCard, SRS.Quality.Good, state, {
          mode: 'system-fallback',
          responseTimeMs: null,
        });
      } else {
        flashIdx += 1;
      }
      renderFlash(state, dependencies);
    }
  };

  // Генерируем предложение для частицы
  const lessonData = LESSONS.find((l) => l.id === particleCard.lessonId);
  if (!lessonData || !lessonData.particles || lessonData.particles.length === 0) {
    fallbackToMultipleChoice(`Нет частиц для урока ${particleCard.lessonId}`);
    return;
  }

  const particle = lessonData.particles[Math.floor(Math.random() * lessonData.particles.length)];
  const quizData = generateParticleQuiz(particle, lessonData, state, LESSONS);

  if (!quizData) {
    fallbackToMultipleChoice('Не удалось сгенерировать предложение');
    return;
  }

  const { sentence, correctParticle, russianHint } = quizData;

  // Разбиваем предложение на слова (удаляем [ _ ] и пробелы)
  const correctWords = sentence
    .replace(/\s*\[\s*_\s*\]\s*/g, ` ${correctParticle} `)
    .split(/\s+/)
    .filter(Boolean);

  // Перемешиваем слова для пула
  const shuffledWords = shuffleArray([...correctWords]);

  // Функция обновления UI
  const updateUI = () => {
    const userArea = $('#sentence-user-area');
    const poolArea = $('#sentence-word-pool');

    if (userArea) {
      userArea.innerHTML =
        userSentence.length === 0
          ? '<span class="sentence-placeholder">Нажмите на слова ниже</span>'
          : userSentence
              .map(
                (word, idx) =>
                  `<button class="word-chip selected" data-index="${idx}">${word}</button>`
              )
              .join('');
    }

    if (poolArea) {
      const remainingWords = shuffledWords.filter((w) => !userSentence.includes(w));
      poolArea.innerHTML =
        remainingWords.length === 0
          ? '<span class="sentence-placeholder">Все слова использованы</span>'
          : remainingWords
              .map((word) => `<button class="word-chip available">${word}</button>`)
              .join('');
    }

    // Обработчики для плашек в пуле (добавление в предложение)
    $$('#sentence-word-pool .word-chip.available').forEach((chip) => {
      chip.onclick = () => {
        const word = chip.textContent;
        userSentence.push(word);
        updateUI();
      };
    });

    // Обработчики для плашек в предложении (удаление обратно в пул)
    $$('#sentence-user-area .word-chip.selected').forEach((chip) => {
      chip.onclick = () => {
        const index = parseInt(chip.dataset.index);
        userSentence.splice(index, 1);
        updateUI();
      };
    });
  };

  body.innerHTML = `
    <div class="flash-wrap">
      <div class="flash-top">
        <span class="flash-count" data-testid="flash-progress">${getProgressText()}</span>
        <button class="btn-ghost" id="flash-exit">Выйти</button>
      </div>
      <div class="sentence-building-container">
        <div class="sentence-building-prompt">
          <div class="flash-cat">Составление предложения</div>
          <p class="sentence-building-hint">${russianHint}</p>
          <p class="sentence-building-instruction">Составьте предложение из слов ниже</p>
        </div>
        
        <div class="sentence-user-area" id="sentence-user-area">
          <span class="sentence-placeholder">Нажмите на слова ниже</span>
        </div>
        
        <div class="sentence-word-pool" id="sentence-word-pool"></div>
        
        <div class="sentence-building-actions">
          <button class="btn-secondary" id="sentence-clear-btn">Очистить</button>
          <button class="btn-primary" id="sentence-check-btn">Проверить</button>
        </div>
        
        <div id="sentence-feedback" class="sentence-feedback hidden"></div>
      </div>
    </div>`;

  startReviewTiming(particleCard.id, CARD_MODES.SENTENCE_BUILDING);

  updateUI();

  const clearBtn = $('#sentence-clear-btn');
  const checkBtn = $('#sentence-check-btn');
  const feedback = $('#sentence-feedback');

  if (clearBtn) {
    clearBtn.onclick = () => {
      userSentence = [];
      updateUI();
      if (feedback) {
        feedback.classList.add('hidden');
        feedback.textContent = '';
      }
    };
  }

  const handleRating = (quality) => {
    const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];

    submitReview(card, quality, state, {
      mistakes: mistakeCount,
      hintUsed: mistakeCount > 0,
    });
    if (!sessionManager) flashIdx += 1;

    appAddXP(XP_CARD);
    save(true);
    markActivity();
    flashRevealed = false;
    renderFlash(state, dependencies);
    updateSrsBadge();
  };

  if (checkBtn) {
    checkBtn.onclick = () => {
      if (userSentence.length === 0) {
        if (feedback) {
          feedback.textContent = '⚠️ Составьте предложение из слов';
          feedback.className = 'sentence-feedback warning';
          feedback.classList.remove('hidden');
        }
        return;
      }

      const userAnswer = userSentence.join(' ');
      const correctAnswer = correctWords.join(' ');
      const isCorrect = userAnswer === correctAnswer;

      if (isCorrect) {
        if (feedback) {
          feedback.innerHTML = '✅ Правильно!';
          feedback.className = 'sentence-feedback correct';
          feedback.classList.remove('hidden');
        }

        const quality = SRS.qualityFromMistakes(mistakeCount);
        markReviewAnswered(particleCard.id);
        setTimeout(() => handleRating(quality), 800);
      } else {
        mistakeCount++;

        if (mistakeCount === 1) {
          if (feedback) {
            feedback.innerHTML = `❌ Неправильно. Попробуйте ещё раз.<br><small>Подсказка: "${correctWords[0]}" — первое слово</small>`;
            feedback.className = 'sentence-feedback incorrect';
            feedback.classList.remove('hidden');
          }
        } else {
          if (feedback) {
            feedback.innerHTML = `❌ Неправильно.<br>Правильный порядок: <strong>${correctAnswer}</strong>`;
            feedback.className = 'sentence-feedback incorrect';
            feedback.classList.remove('hidden');
          }

          if (checkBtn) checkBtn.disabled = true;
          if (clearBtn) clearBtn.disabled = true;
          markReviewAnswered(particleCard.id);

          setTimeout(() => handleRating(SRS.Quality.Again), 2000);
        }
      }
    };
  }

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
              sessionManager = null;
              flashCtx ? nav('chapter', flashCtx) : nav('srs');
            },
          });
          return;
        }
      }
      sessionManager = null;
      flashCtx ? nav('chapter', flashCtx) : nav('srs');
    };
  }
}

// Функция рендеринга режима particle quiz
function renderParticleQuizMode(particleCard, state, dependencies) {
  const {
    save,
    showCompletionScreen,
    XP_CARD,
    appAddXP,
    updateSrsBadge,
    nav,
    markActivity,
    LESSONS,
  } = dependencies;

  const body = $('#srs-body');
  let mistakeCount = 0;

  // Скрываем tabbar во время SRS-сессии
  const tabbar = document.querySelector('.tabbar');
  if (tabbar) tabbar.style.display = 'none';

  // Если particle quiz невозможно построить — откатываемся на множественный выбор,
  // чтобы карточка не зависала и не пропадала из сессии
  const fallbackToMultipleChoice = (reason) => {
    console.warn(`[particle-quiz] ${reason}, fallback на multiple choice`);
    const word = wordById(particleCard.id, LESSONS);
    if (word) {
      renderMultipleChoiceMode(word, state, dependencies);
    } else {
      // Слова нет — завершаем карточку без штрафа
      if (sessionManager) {
        submitReview(particleCard, SRS.Quality.Good, state, {
          mode: 'system-fallback',
          responseTimeMs: null,
        });
      } else {
        flashIdx += 1;
      }
      renderFlash(state, dependencies);
    }
  };

  // Генерируем quiz данные
  const lessonData = LESSONS.find((l) => l.id === particleCard.lessonId);
  if (!lessonData || !lessonData.particles || lessonData.particles.length === 0) {
    fallbackToMultipleChoice(`Нет частиц для урока ${particleCard.lessonId}`);
    return;
  }

  const particle = lessonData.particles[Math.floor(Math.random() * lessonData.particles.length)];
  const quizData = generateParticleQuiz(particle, lessonData, state, LESSONS);

  if (!quizData) {
    fallbackToMultipleChoice('Не удалось сгенерировать particle quiz');
    return;
  }

  const { sentence, correctParticle, options, russianHint } = quizData;

  body.innerHTML = `
    <div class="flash-wrap">
      <div class="flash-top">
        <span class="flash-count" data-testid="flash-progress">${getProgressText()}</span>
        <button class="btn-ghost" id="flash-exit">Выйти</button>
      </div>
      <div class="particle-quiz-container">
        <div class="particle-quiz-prompt">
          <div class="flash-cat">Частица</div>
          <p class="particle-quiz-sentence">${sentence}</p>
          <p class="particle-quiz-hint">${russianHint}</p>
        </div>
        <div class="particle-quiz-options">
          ${options
            .map(
              (opt) => `
            <button class="quiz-option-btn" data-particle="${opt}">
              ${opt}
            </button>
          `
            )
            .join('')}
        </div>
      </div>
    </div>`;

  startReviewTiming(particleCard.id, CARD_MODES.PARTICLE_QUIZ);

  const handleRating = (quality) => {
    const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];

    submitReview(card, quality, state, {
      mistakes: mistakeCount,
      hintUsed: mistakeCount > 0,
    });
    if (!sessionManager) flashIdx += 1;

    appAddXP(XP_CARD);
    save(true);
    markActivity();
    flashRevealed = false;
    renderFlash(state, dependencies);
    updateSrsBadge();
  };

  $$('.quiz-option-btn').forEach((btn) => {
    btn.onclick = () => {
      if (btn.disabled) return;

      const selectedParticle = btn.dataset.particle;
      const isCorrect = selectedParticle === correctParticle;

      if (isCorrect) {
        btn.classList.add('correct');
        btn.disabled = true;

        // Вычисляем качество на основе ошибок
        const quality = SRS.qualityFromMistakes(mistakeCount);
        markReviewAnswered(particleCard.id);

        setTimeout(() => {
          handleRating(quality);
        }, 600);
      } else {
        btn.classList.add('incorrect');
        btn.disabled = true;
        mistakeCount++;

        // Если 2+ ошибки, автоматически завершаем с quality=0
        if (mistakeCount >= 2) {
          $$('.quiz-option-btn').forEach((b) => (b.disabled = true));

          // Подсвечиваем правильный ответ зелёным
          $$('.quiz-option-btn').forEach((b) => {
            if (b.dataset.particle === correctParticle) {
              b.classList.add('correct');
            }
          });
          markReviewAnswered(particleCard.id);

          setTimeout(() => {
            handleRating(SRS.Quality.Again);
          }, 1000);
        }
      }
    };
  });

  const exitBtn = $('#flash-exit');
  if (exitBtn) {
    exitBtn.onclick = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      // Восстанавливаем tabbar, header и tabs SRS
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
              sessionManager = null;
              flashCtx ? nav('chapter', flashCtx) : nav('srs');
            },
          });
          return;
        }
      }
      sessionManager = null;
      flashCtx ? nav('chapter', flashCtx) : nav('srs');
    };
  }
}

// Главная функция рендеринга карточки
export function renderFlash(state, dependencies) {
  const {
    save,
    showCompletionScreen,
    XP_CARD,
    appAddXP,
    updateSrsBadge,
    nav,
    LESSONS,
    markActivity,
  } = dependencies;

  activeReviewState = state;
  activeReviewDependencies = dependencies;

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
          sessionManager = null;
          flashCtx ? nav('chapter', flashCtx) : nav('srs');
        },
      });
      renderCompletionUndo(state, dependencies);
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
      renderCompletionUndo(state, dependencies);
      return;
    }
    card = flashQueue[flashIdx];
  }

  // Проверяем, является ли карточка particle quiz
  if (card.id && card.id.startsWith('PARTICLE_')) {
    renderParticleQuizMode(card, state, dependencies);
    return;
  }
  const word = wordById(card.id, LESSONS);

  if (!word) {
    console.warn('[renderFlash] Word not found, skipping card:', card.id);
    // При использовании sessionManager помечаем карточку как завершённую
    if (sessionManager) {
      submitReview(card, SRS.Quality.Good, state, {
        mode: 'system-fallback',
        responseTimeMs: null,
      });
    } else {
      flashIdx += 1;
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

  // В SRS-батче forcedMode закреплён за skill карточки; вне батча остаётся адаптивный режим.
  const cardMode = card.forcedMode || determineCardMode(card, word);

  // Режим квиза по частицам (блок 2 сессии)
  if (cardMode === CARD_MODES.PARTICLE_QUIZ) {
    renderParticleQuizMode({ ...card, lessonId: cardChapter(card.id) }, state, dependencies);
    return;
  }

  // Режим составления предложений (блок 2 сессии, 30% вероятность)
  if (cardMode === CARD_MODES.SENTENCE_BUILDING) {
    renderSentenceBuilding({ ...card, lessonId: cardChapter(card.id) }, state, dependencies);
    return;
  }

  if (cardMode === CARD_MODES.CONTEXT_SENTENCE) {
    renderContextSentenceMode(word, state, dependencies);
    return;
  }

  if (cardMode === CARD_MODES.CONTEXT_PRODUCTION) {
    renderContextProductionMode(word, state, dependencies);
    return;
  }

  if (cardMode === CARD_MODES.REVERSE_MULTIPLE_CHOICE) {
    renderMultipleChoiceMode(word, state, dependencies, {
      mode: CARD_MODES.REVERSE_MULTIPLE_CHOICE,
      category: 'Японский → русский',
      question: displayKanji,
      hint: 'Выберите правильный перевод',
      questionClass: 'reverse-question',
      optionLabel: (option) => shortT(option),
    });
    return;
  }

  // Режим рисования
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

        // Восстанавливаем tabbar, header и tabs SRS
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
                sessionManager = null;
                flashCtx ? nav('chapter', flashCtx) : nav('srs');
              },
            });
            return;
          }
        }
        sessionManager = null;
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
      dependencies
    );
    return;
  }

  // Режим ввода с клавиатуры
  if (cardMode === CARD_MODES.TYPING) {
    renderTypingMode(word, state, dependencies);
    return;
  }

  // Режим множественного выбора (4 варианта)
  if (cardMode === CARD_MODES.MULTIPLE_CHOICE) {
    renderMultipleChoiceMode(word, state, dependencies);
    return;
  }
}

// Состояние фильтрации словаря
let dictSearchQuery = '';
let dictFilter = 'all';

// Функция для генерации разметки пустого состояния
function emptyState(icon, title, desc) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <h3 class="empty-state-title">${title}</h3>
      <p class="empty-state-desc">${desc}</p>
    </div>
  `;
}

// Вспомогательная функция для определения статуса слова
export function getWordStatus(word, state) {
  const isUnlocked = isWordUnlocked(word.id, state.chapters);
  const chapterId = cardChapter(word.id);
  if (!isUnlocked) {
    return {
      status: 'locked',
      label: 'Закрыто',
      symbol: '🔒',
      title: `Заблокировано (Откроется в Главе ${chapterId})`,
    };
  }

  const itemCards = cardsForItem(state.srs, word.id);
  const mastery = calculateMastery({
    itemId: word.id,
    cards: itemCards,
    events: state.reviewEvents || [],
    archive: state.masteryArchive?.[word.id],
    applicableSkills: vocabularySkills(word),
    getRetrievability: (card, now) => SRS.getRetrievability(card, now),
  });

  const level = mastery.level;
  const needsRefresh = mastery.needsRefresh;

  if (level === 'Новое') {
    return {
      status: 'new',
      label: 'Новое',
      symbol: '•',
      title: 'Новое слово (ещё не изучалось)',
      score: mastery.score,
    };
  }

  if (needsRefresh) {
    return {
      status: 'refresh',
      label: 'Повторить',
      symbol: '↻',
      title: 'Пора освежить (нужно повторить)',
      score: mastery.score,
    };
  }

  if (level === 'Освоено') {
    return {
      status: 'mastered',
      label: 'Освоено',
      symbol: '★',
      title: 'Освоено (отличное знание)',
      score: mastery.score,
    };
  }

  if (level === 'Уверенно') {
    return {
      status: 'confident',
      label: 'Уверенно',
      symbol: '✓',
      title: 'Уверенно (хорошее знание)',
      score: mastery.score,
    };
  }

  return {
    status: 'learning',
    label: 'Изучается',
    symbol: '⚡',
    title: 'Изучается (в процессе освоения)',
    score: mastery.score,
  };
}

// Функция рендеринга словаря
export async function renderDictionary(state, dependencies) {
  const { CONTENT_INDEX, ensureLesson } = dependencies;

  const content = $('#srs-body');
  if (!content) return;

  // Словарь показывает слова всех глав — догружаем недостающие уроки
  ExamplesDB.registerCuratedParticleSentences(CURATED_PARTICLE_SENTENCES);
  ExamplesDB.rebuildIndex();
  if (CONTENT_INDEX && ensureLesson) {
    await Promise.all(CONTENT_INDEX.map((ch) => ensureLesson(ch.id).catch(() => null)));
  }

  dictSearchQuery = '';
  dictFilter = 'all';

  content.innerHTML = `
    <div class="dict-header-container">
      <div class="dict-search-wrap">
        <input 
          type="search" 
          id="dict-search" 
          class="dict-search-input" 
          placeholder="🔍 Поиск слов..."
          autocomplete="off"
          value=""
        />
      </div>
      <div class="dict-filters-wrap">
        <button class="dict-filter-btn active" data-filter="all">Все</button>
        <button class="dict-filter-btn" data-filter="verb">Глаголы</button>
        <button class="dict-filter-btn" data-filter="adjective">Прилагательные</button>
        <button class="dict-filter-btn" data-filter="other">Остальное</button>
      </div>
      <div class="dict-overall-mastery">
        <div class="dict-overall-label">Общий прогресс словаря: <span id="dict-overall-percent">0%</span></div>
        <div class="dict-overall-bar">
          <div class="dict-overall-fill" id="dict-overall-fill" style="width: 0%"></div>
        </div>
      </div>
    </div>
    <div id="dict-lessons-container"></div>
  `;

  renderDictionaryLessons(state, dependencies, dictSearchQuery, dictFilter);

  const searchInput = $('#dict-search');
  let searchTimeout;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        dictSearchQuery = e.target.value;
        renderDictionaryLessons(state, dependencies, dictSearchQuery, dictFilter);
      }, 300);
    });
  }

  $$('.dict-filter-btn').forEach((btn) => {
    btn.onclick = () => {
      $$('.dict-filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      dictFilter = btn.dataset.filter;
      renderDictionaryLessons(state, dependencies, dictSearchQuery, dictFilter);
    };
  });
}

// Функция рендеринга списка уроков и слов
function renderDictionaryLessons(state, dependencies, searchQuery = '', filterQuery = 'all') {
  const { LESSONS } = dependencies;

  const container = $('#dict-lessons-container');
  if (!container) return;

  const query = searchQuery.toLowerCase().trim();
  const activeLessonId = state.activeChapterId || 1;

  // 1. Calculate overall mastery score
  let totalMastery = 0;
  let totalWordsCount = 0;

  LESSONS.forEach((lesson) => {
    const words = lesson.words || [];
    words.forEach((word) => {
      totalWordsCount++;
      const isUnlocked = isWordUnlocked(word.id, state.chapters);
      if (isUnlocked) {
        const itemCards = cardsForItem(state.srs, word.id);
        const mastery = calculateMastery({
          itemId: word.id,
          cards: itemCards,
          events: state.reviewEvents || [],
          archive: state.masteryArchive?.[word.id],
          applicableSkills: vocabularySkills(word),
          getRetrievability: (card, now) => SRS.getRetrievability(card, now),
        });
        totalMastery += mastery.score;
      }
    });
  });

  const overallProgress = totalWordsCount > 0 ? Math.round(totalMastery / totalWordsCount) : 0;
  const overallFill = $('#dict-overall-fill');
  const overallPercent = $('#dict-overall-percent');
  if (overallFill && overallPercent) {
    overallFill.style.width = `${overallProgress}%`;
    overallPercent.textContent = `${overallProgress}%`;
  }

  let totalVisible = 0;

  container.innerHTML = LESSONS.map((lesson) => {
    const words = lesson.words || [];
    const isLessonUnlocked = state.chapters?.[lesson.id]?.started === true || lesson.id === 1;

    // Filter words based on search query and category filter
    const filteredWords = words.filter((word) => {
      // Apply search query
      const matchesSearch =
        !query ||
        (word.kanji && word.kanji.toLowerCase().includes(query)) ||
        (word.writing && word.writing.toLowerCase().includes(query)) ||
        (word.romaji && word.romaji.toLowerCase().includes(query)) ||
        (word.translation && word.translation.toLowerCase().includes(query));

      // Apply category/POS filter
      let matchesFilter = true;
      if (filterQuery === 'verb') {
        matchesFilter = word.partOfSpeech === 'verb';
      } else if (filterQuery === 'adjective') {
        matchesFilter = word.partOfSpeech === 'adjective';
      } else if (filterQuery === 'other') {
        matchesFilter = word.partOfSpeech !== 'verb' && word.partOfSpeech !== 'adjective';
      }

      return matchesSearch && matchesFilter;
    });

    if (filteredWords.length === 0 && (query || filterQuery !== 'all')) {
      return '';
    }

    totalVisible += filteredWords.length;

    // If lesson is locked, show it in a single line
    if (!isLessonUnlocked) {
      return `
        <div class="dict-lesson is-locked" data-lesson-id="${lesson.id}">
          <div class="dict-lesson-header" role="button" tabindex="0" aria-label="Урок ${lesson.id}: ${lesson.title}. Закрыто">
            <span class="dict-lesson-toggle-icon">🔒</span>
            <h3 class="dict-lesson-title">Урок ${lesson.id}: ${lesson.title}</h3>
            <span class="dict-lesson-count">${words.length} слов</span>
          </div>
        </div>
      `;
    }

    const wordsHtml = filteredWords
      .map((word) => {
        const isUnlocked = isWordUnlocked(word.id, state.chapters);
        const chapterId = cardChapter(word.id);
        const status = getWordStatus(word, state);

        const hasSeparateReading = word.kanji && word.kanji !== word.writing;
        const readingHtml = hasSeparateReading
          ? `<div class="dict-word-reading">${word.writing}</div>`
          : '';

        // If the word is locked, display '???' as the kanji/writing to hide closed answers
        const displayKanji = isUnlocked ? word.kanji || word.writing : '???';
        const displayReadingHtml = isUnlocked ? readingHtml : '・・・';
        const displayTranslation = isUnlocked ? word.translation : `Откроется в Главе ${chapterId}`;

        const lessonIds = word.lessonIds || [lesson.id];
        const lessonsBadge =
          isUnlocked && lessonIds.length > 1
            ? `<span class="dict-word-lessons-badge">Уроки ${lessonIds.join(', ')}</span>`
            : '';

        return `
          <div class="dict-word-card ${!isUnlocked ? 'word-locked' : ''}" data-word-id="${word.id}" data-chapter-id="${chapterId}" data-lexeme-id="${word.lexemeId || ''}">
            <div class="dict-word-main">
              <div class="dict-word-kanji">${displayKanji}</div>
              <div class="dict-word-info">
                ${displayReadingHtml}
                <div class="dict-word-translation">${displayTranslation} ${lessonsBadge}</div>
              </div>
            </div>
            <div class="dict-word-status">
              <span class="dict-status-indicator status-${status.status}" tabindex="0" title="${status.title}" aria-label="${status.title}">
                <span class="dict-status-icon">${status.symbol}</span>
              </span>
            </div>
          </div>
        `;
      })
      .join('');

    // Determine default expansion
    const isExpanded =
      query || filterQuery !== 'all' ? filteredWords.length > 0 : lesson.id === activeLessonId;

    return `
      <div class="dict-lesson is-unlocked ${isExpanded ? 'is-expanded' : 'is-collapsed'}" data-lesson-id="${lesson.id}">
        <div class="dict-lesson-header" role="button" tabindex="0" aria-label="Урок ${lesson.id}: ${lesson.title}. Нажмите для раскрытия">
          <span class="dict-lesson-toggle-icon">${isExpanded ? '▼' : '▶'}</span>
          <h3 class="dict-lesson-title">Урок ${lesson.id}: ${lesson.title}</h3>
          <span class="dict-lesson-count">${filteredWords.length} слов</span>
        </div>
        <div class="dict-words-list">
          ${wordsHtml}
        </div>
      </div>
    `;
  }).join('');

  if ((query || filterQuery !== 'all') && totalVisible === 0) {
    container.innerHTML = emptyState(
      '🔍',
      'Ничего не найдено',
      `По запросу "${searchQuery}" слова не найдены.`
    );
    return;
  }

  // Bind lesson header collapse/expand
  $$('.dict-lesson-header').forEach((header) => {
    header.onclick = () => {
      const lessonEl = header.closest('.dict-lesson');
      const lessonId = Number(lessonEl.dataset.lessonId);
      if (lessonEl.classList.contains('is-locked')) {
        toast(`🔒 Начните Главу ${lessonId}, чтобы разблокировать этот урок`);
        return;
      }
      const isExpanded = lessonEl.classList.contains('is-expanded');
      if (isExpanded) {
        lessonEl.classList.remove('is-expanded');
        lessonEl.classList.add('is-collapsed');
        const icon = lessonEl.querySelector('.dict-lesson-toggle-icon');
        if (icon) icon.textContent = '▶';
      } else {
        lessonEl.classList.remove('is-collapsed');
        lessonEl.classList.add('is-expanded');
        const icon = lessonEl.querySelector('.dict-lesson-toggle-icon');
        if (icon) icon.textContent = '▼';
      }
    };
    header.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        header.click();
      }
    };
  });

  // Bind card clicks (modal open)
  $$('.dict-word-card').forEach((card) => {
    card.onclick = () => {
      const wordId = card.dataset.wordId;

      if (card.classList.contains('word-locked')) {
        const chapterId = card.dataset.chapterId;
        toast(`🔒 Начните Главу ${chapterId}, чтобы разблокировать это слово`);
        return;
      }

      const word = wordById(wordId, LESSONS);
      if (word) openDictionaryModal(word, state, dependencies);
    };
  });

  // Bind lexemeId hover synchronization
  $$('.dict-word-card').forEach((card) => {
    const lexemeId = card.dataset.lexemeId;
    if (lexemeId) {
      card.onmouseenter = () => {
        $$(`.dict-word-card[data-lexeme-id="${lexemeId}"]`).forEach((c) => {
          c.classList.add('lexeme-highlight');
        });
      };
      card.onmouseleave = () => {
        $$(`.dict-word-card[data-lexeme-id="${lexemeId}"]`).forEach((c) => {
          c.classList.remove('lexeme-highlight');
        });
      };
    }
  });
}

// Функция очистки символа от служебных знаков (тильды, пробелы и т.д.)
function cleanKanjiChar(char) {
  if (!char) return '';
  // Удаляем тильды (обычную и полноширинную), пробелы, служебные символы
  return char.replace(/[~～\s]/g, '').trim();
}

// Функция открытия модального окна словаря

function getPartOfSpeechLabel(pos) {
  const mapping = {
    verb: 'Глагол',
    noun: 'Существительное',
    adjective: 'Прилагательное',
    adverb: 'Наречие',
    particle: 'Частица',
    expression: 'Выражение',
  };
  return mapping[pos] || pos || 'Неизвестно';
}

function getVerbClassLabel(vc) {
  const mapping = {
    godan: '1-й класс (godan)',
    ichidan: '2-й класс (ichidan)',
    irregular: 'Неправильный',
  };
  return mapping[vc] || vc || 'Неизвестно';
}

function getLessonsLabel(lessonIds) {
  if (!lessonIds || lessonIds.length === 0) return 'Вне уроков';
  return lessonIds.length > 1 ? `Уроки ${lessonIds.join(', ')}` : `Урок ${lessonIds[0]}`;
}

function renderSkillRow(skillKey, skillLabel, mastery, appSkills) {
  const isApplicable = appSkills.includes(skillKey);
  if (!isApplicable) {
    return `
      <div class="dict-skill-row skill-disabled">
        <div class="dict-skill-header">
          <span class="dict-skill-name">${skillLabel}</span>
          <span class="dict-skill-status-badge badge-not-required">Не требуется</span>
        </div>
      </div>
    `;
  }

  const metric = mastery.skillMetrics?.[skillKey];
  const hasStarted = metric && metric.card && metric.card.reps > 0;

  if (!hasStarted) {
    return `
      <div class="dict-skill-row skill-inactive">
        <div class="dict-skill-header">
          <span class="dict-skill-name">${skillLabel}</span>
          <span class="dict-skill-status-badge badge-queued">В очереди</span>
        </div>
      </div>
    `;
  }

  const accuracyPercent = Math.round((metric.accuracy || 0) * 100);
  const stabilityDays = Math.round(metric.stability || 0);
  const retrievabilityPercent = Math.round((metric.retrievability || 0) * 100);

  return `
    <div class="dict-skill-row skill-active">
      <div class="dict-skill-header">
        <span class="dict-skill-name">${skillLabel}</span>
        <span class="dict-skill-status-badge badge-active">Активно</span>
      </div>
      <div class="dict-skill-metrics-grid">
        <div class="dict-skill-metric-item">
          <span class="dict-metric-label">Точность:</span>
          <span class="dict-metric-value">${accuracyPercent}%</span>
        </div>
        <div class="dict-skill-metric-item">
          <span class="dict-metric-label">Стабильность:</span>
          <span class="dict-metric-value">${stabilityDays} дн.</span>
        </div>
        <div class="dict-skill-metric-item">
          <span class="dict-metric-label">Память:</span>
          <span class="dict-metric-value">${retrievabilityPercent}%</span>
        </div>
      </div>
    </div>
  `;
}

export function openDictionaryModal(word, state, dependencies) {
  const { nav } = dependencies;

  const body = $('#srs-body');
  if (!body) return;

  const kanjiChars = getAllKanji(word.kanji || word.writing);
  const hasKanji = kanjiChars.length > 0;

  const returnToDict = () => {
    nav('srs');
  };

  let currentKanjiIdx = 0;
  let isKanjiOpen = false;
  let isProgressOpen = false;
  // Seed для генератора примеров. Живёт в замыкании — перерисовка не меняет пример.
  // «Другой пример» вызывает nextSeed() и renderModalContent().
  let exampleSeed = 0;

  const renderModalContent = () => {
    const selectedKanji = hasKanji ? kanjiChars[currentKanjiIdx] : null;

    const kanjiTabsHtml =
      kanjiChars.length > 1
        ? `
      <div class="dict-kanji-tabs">
        ${kanjiChars
          .map(
            (k, idx) => `
          <button class="dict-kanji-tab ${idx === currentKanjiIdx ? 'active' : ''}" data-kanji-idx="${idx}">
            ${k}
          </button>
        `
          )
          .join('')}
      </div>
    `
        : '';

    const itemCards = cardsForItem(state.srs, word.id);
    const appSkills = vocabularySkills(word);
    const mastery = calculateMastery({
      itemId: word.id,
      cards: itemCards,
      events: state.reviewEvents || [],
      archive: state.masteryArchive?.[word.id],
      applicableSkills: appSkills,
      getRetrievability: (card, now) => SRS.getRetrievability(card, now),
    });

    const activeLessonId = state.activeChapterId || 1;
    let conjugationHtml = '';

    function getRussianMeaning(formId, translation) {
      const clean = translation
        .toLowerCase()
        .trim()
        .replace(/^то\s+/i, '');
      switch (formId) {
        case 'masu':
          return `${clean} (вежл.)`;
        case 'masen':
          return `не ${clean} (вежл.)`;
        case 'masenka':
          return `не хотите ли ${clean}?`;
        case 'mashita':
          return `${clean} (прош., вежл.)`;
        case 'masendeshita':
          return `не ${clean} (прош., вежл.)`;
        case 'mashou':
          return `давайте ${clean}!`;
        case 'mashouka':
          return `давайте я ${clean}?`;
        case 'dictionary':
          return `${clean} (непрошедшее время)`;
        case 'nai':
          return `не ${clean} (непрошедшее время)`;
        case 'ta':
          return `${clean} (прош. время)`;
        case 'nakatta':
          return `не ${clean} (прош. время)`;
        case 'te':
          return `деепричастный оборот`;
        case 'てください':
          return `пожалуйста, ${clean}`;
        case 'てもいいです':
          return `можно ${clean}`;
        case 'てはいけません':
          return `нельзя ${clean}`;
        case 'последовательность 〜て、〜':
          return `${clean} и затем...`;
        case 'ています':
          return `в процессе ${clean} / состояние`;
        case 'основа + に行く/来る/帰る':
          return `идти/приходить/возвращаться, чтобы ${clean}`;
        case 'ないдеください':
        case 'ないде-форма':
        case 'ないでください':
          return `пожалуйста, не ${clean}`;
        case 'と思います':
          return `думаю, что ${clean}`;
        case 'говорил':
        case 'говорила':
        case 'говорили':
        case 'сказал':
        case 'сказала':
        case 'сказали':
        case 'сказал(а), что':
        case 'сказал(а)':
        case 'говорят':
        case 'говорил(а), что':
        case 'сказали, что':
        case 'говорили, что':
        case 'сказано':
        case 'сказанное':
        case 'сказание':
        case 'говорить':
        case 'сказать':
        case 'скажет':
        case 'скажут':
        case 'говорит':
        case 'говорят, что':
        case 'говорили-говорили':
        case 'сказал-сделал':
        case 'рассказывал':
        case 'рассказывала':
        case 'рассказали':
        case 'рассказывает':
        case 'рассказывают':
        case 'рассказать':
        case 'рассказывать':
        case 'передавал':
        case 'передавала':
        case 'передавали':
        case 'передает':
        case 'передают':
        case 'передать':
        case 'передавать':
        case 'упоминал':
        case 'упоминала':
        case 'упомянул':
        case 'упомянула':
        case 'упомянули':
        case 'упоминает':
        case 'упомянет':
        case 'упоминают':
        case 'упомянуть':
        case 'упоминать':
        case 'сообщал':
        case 'сообщала':
        case 'сообщил':
        case 'сообщила':
        case 'сообщили':
        case 'сообщает':
        case 'сообщит':
        case 'сообщают':
        case 'сообщить':
        case 'сообщать':
        case 'заявлял':
        case 'заявляла':
        case 'заявил':
        case 'заявила':
        case 'заявили':
        case 'заявляет':
        case 'заявит':
        case 'заявляют':
        case 'заявить':
        case 'заявлять':
        case 'утверждал':
        case 'утверждала':
        case 'утвердил':
        case 'утвердила':
        case 'утвердили':
        case 'утверждает':
        case 'утвердит':
        case 'утверждают':
        case 'утвердить':
        case 'утверждать':
        case 'говорил(а)':
          return `говорил(а), что ${clean}`;
        case 'のが好きです':
          return `нравится ${clean}`;
        case 'つもりです':
          return `собираюсь ${clean}`;
        case 'たことがあります':
          return `доводилось ${clean}`;
        case 'たり〜たりします':
          return `то ${clean}, то делать другие вещи`;
        case 'たい':
          return `хочу ${clean}`;
        default:
          return clean;
      }
    }

    if (word.partOfSpeech === 'verb') {
      try {
        const baseForms = conjugateVerb(word);

        const masuForm = baseForms.find((f) => f.formId === 'masu');
        const stemKanji = masuForm ? masuForm.kanji.slice(0, -2) : '';
        const stemKana = masuForm ? masuForm.kana.slice(0, -2) : '';

        const isLocked = (lessonUnlocked) => {
          return lessonUnlocked > activeLessonId;
        };

        const formatJp = (kanjiVal, kanaVal) => {
          if (kanjiVal === kanaVal) return kanjiVal;
          return `${kanjiVal} (${kanaVal})`;
        };

        const politeGroup = [
          {
            name: 'Непрошедшее время (утвердительное)',
            lesson: 3,
            ru: getRussianMeaning('masu', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'masu').kanji,
            jpKana: baseForms.find((f) => f.formId === 'masu').kana,
          },
          {
            name: 'Непрошедшее время (отрицательное)',
            lesson: 3,
            ru: getRussianMeaning('masen', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'masen').kanji,
            jpKana: baseForms.find((f) => f.formId === 'masen').kana,
          },
          {
            name: 'Приглашение',
            lesson: 3,
            ru: getRussianMeaning('masenka', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'masenka').kanji,
            jpKana: baseForms.find((f) => f.formId === 'masenka').kana,
          },
          {
            name: 'Прошедшее время (утвердительное)',
            lesson: 4,
            ru: getRussianMeaning('mashita', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'mashita').kanji,
            jpKana: baseForms.find((f) => f.formId === 'mashita').kana,
          },
          {
            name: 'Прошедшее время (отрицательное)',
            lesson: 4,
            ru: getRussianMeaning('masendeshita', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'masendeshita').kanji,
            jpKana: baseForms.find((f) => f.formId === 'masendeshita').kana,
          },
          {
            name: 'Побудительное',
            lesson: 5,
            ru: getRussianMeaning('mashou', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'mashou').kanji,
            jpKana: baseForms.find((f) => f.formId === 'mashou').kana,
          },
          {
            name: 'Предложение помощи',
            lesson: 5,
            ru: getRussianMeaning('mashouka', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'mashouka').kanji,
            jpKana: baseForms.find((f) => f.formId === 'mashouka').kana,
          },
        ];

        const plainGroup = [
          {
            name: 'Простое непрошедшее утвердительное',
            lesson: 8,
            ru: getRussianMeaning('dictionary', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'dictionary').kanji,
            jpKana: baseForms.find((f) => f.formId === 'dictionary').kana,
          },
          {
            name: 'Простое непрошедшее отрицательное',
            lesson: 8,
            ru: getRussianMeaning('nai', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'nai').kanji,
            jpKana: baseForms.find((f) => f.formId === 'nai').kana,
          },
          {
            name: 'Простое прошедшее утвердительное',
            lesson: 9,
            ru: getRussianMeaning('ta', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'ta').kanji,
            jpKana: baseForms.find((f) => f.formId === 'ta').kana,
          },
          {
            name: 'Простое прошедшее отрицательное',
            lesson: 9,
            ru: getRussianMeaning('nakatta', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'nakatta').kanji,
            jpKana: baseForms.find((f) => f.formId === 'nakatta').kana,
          },
        ];

        const teGroup = [
          {
            name: 'て-форма',
            lesson: 6,
            ru: getRussianMeaning('te', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'te').kanji,
            jpKana: baseForms.find((f) => f.formId === 'te').kana,
          },
        ];

        const teFormKanji = baseForms.find((f) => f.formId === 'te').kanji;
        const teFormKana = baseForms.find((f) => f.formId === 'te').kana;
        const dictionaryKanji = baseForms.find((f) => f.formId === 'dictionary').kanji;
        const dictionaryKana = baseForms.find((f) => f.formId === 'dictionary').kana;
        const naiFormKanji = baseForms.find((f) => f.formId === 'nai').kanji;
        const naiFormKana = baseForms.find((f) => f.formId === 'nai').kana;
        const taFormKanji = baseForms.find((f) => f.formId === 'ta').kanji;
        const taFormKana = baseForms.find((f) => f.formId === 'ta').kana;

        const constructionsGroup = [
          {
            name: 'てください',
            lesson: 6,
            ru: getRussianMeaning('てください', word.translation),
            jpKanji: teFormKanji + 'ください',
            jpKana: teFormKana + 'ください',
          },
          {
            name: 'てもいいです',
            lesson: 6,
            ru: getRussianMeaning('てもいいです', word.translation),
            jpKanji: teFormKanji + 'もいいです',
            jpKana: teFormKana + 'もいいです',
          },
          {
            name: 'てはいけません',
            lesson: 6,
            ru: getRussianMeaning('てはいけません', word.translation),
            jpKanji: teFormKanji + 'はいけません',
            jpKana: teFormKana + 'はいけません',
          },
          {
            name: 'последовательность 〜て、〜',
            lesson: 6,
            ru: getRussianMeaning('последовательность 〜て、〜', word.translation),
            jpKanji: teFormKanji + '、...',
            jpKana: teFormKana + '、...',
          },
          {
            name: 'ています',
            lesson: 7,
            ru: getRussianMeaning('ています', word.translation),
            jpKanji: teFormKanji + 'います',
            jpKana: teFormKana + 'います',
          },
          {
            name: 'основа + に行く/来る/帰る',
            lesson: 7,
            ru: getRussianMeaning('основа + に行く/来る/帰る', word.translation),
            jpKanji: stemKanji + 'に行く/来る/帰る',
            jpKana: stemKana + 'にいく/くる/かえる',
          },
          {
            name: 'найдеください',
            lesson: 8,
            ru: getRussianMeaning('ないдеください', word.translation),
            jpKanji: naiFormKanji + 'でください',
            jpKana: naiFormKana + 'でください',
          },
          {
            name: 'と思います',
            lesson: 8,
            ru: getRussianMeaning('と思います', word.translation),
            jpKanji: dictionaryKanji + 'と思います',
            jpKana: dictionaryKana + 'とおもいます',
          },
          {
            name: '言っていました',
            lesson: 8,
            ru: getRussianMeaning('сказал', word.translation),
            jpKanji: dictionaryKanji + 'と言っていました',
            jpKana: dictionaryKana + 'といっていました',
          },
          {
            name: 'のが好きです',
            lesson: 8,
            ru: getRussianMeaning('のが好きです', word.translation),
            jpKanji: dictionaryKanji + 'のが好きです',
            jpKana: dictionaryKana + 'のが好きです',
          },
          {
            name: 'つもりです',
            lesson: 10,
            ru: getRussianMeaning('つもりです', word.translation),
            jpKanji: dictionaryKanji + 'つもりです',
            jpKana: dictionaryKana + 'つもりです',
          },
          {
            name: 'たことがあります',
            lesson: 11,
            ru: getRussianMeaning('たことがあります', word.translation),
            jpKanji: taFormKanji + 'ことがあります',
            jpKana: taFormKana + 'ことがあります',
          },
          {
            name: 'たり〜たりします',
            lesson: 11,
            ru: getRussianMeaning('たり〜たりします', word.translation),
            jpKanji: taFormKanji + 'り、...たりします',
            jpKana: taFormKana + 'り、...たりします',
          },
          {
            name: 'たい',
            lesson: 11,
            ru: getRussianMeaning('たい', word.translation),
            jpKanji: stemKanji + 'たい',
            jpKana: stemKana + 'たい',
          },
        ];

        const renderRowHtml = (item) => {
          const locked = isLocked(item.lesson);
          const formattedJp = formatJp(item.jpKanji, item.jpKana);
          return `
            <div class="dict-conj-row ${locked ? 'locked' : ''}">
              <div class="dict-conj-cell cell-name">
                <span class="dict-conj-name">${item.name}</span>
              </div>
              <div class="dict-conj-cell cell-badge">
                <span class="dict-conj-lesson-badge">Урок ${item.lesson}</span>
              </div>
              <div class="dict-conj-cell cell-value">
                <div class="dict-conj-value" ${locked ? '' : 'data-revealed="false"'}>
                  ${
                    locked
                      ? `
                    <span class="dict-conj-locked-text">Откроется в уроке ${item.lesson}</span>
                  `
                      : `
                    <button class="dict-conj-reveal-trigger">👁️ Показать</button>
                    <span class="dict-conj-actual-form">${formattedJp}</span>
                  `
                  }
                </div>
              </div>
              <div class="dict-conj-cell cell-translation">
                <span class="dict-conj-translation">${locked ? '—' : item.ru}</span>
              </div>
            </div>
          `;
        };

        conjugationHtml = `
          <div class="dict-section dict-conjugation">
            <h3 class="dict-section-title">Спряжение глагола</h3>
            <div class="dict-section-body">
              <div class="dict-conj-tabs">
                <button class="dict-conj-tab-btn active" data-tab="polite">Вежливые</button>
                <button class="dict-conj-tab-btn" data-tab="plain">Простые</button>
                <button class="dict-conj-tab-btn" data-tab="te">て-форма</button>
                <button class="dict-conj-tab-btn" data-tab="constructions">Конструкции</button>
              </div>
              
              <div class="dict-conj-panel" id="dict-conj-panel-polite" style="display: flex;">
                ${politeGroup.map(renderRowHtml).join('')}
              </div>
              <div class="dict-conj-panel" id="dict-conj-panel-plain" style="display: none;">
                ${plainGroup.map(renderRowHtml).join('')}
              </div>
              <div class="dict-conj-panel" id="dict-conj-panel-te" style="display: none;">
                ${teGroup.map(renderRowHtml).join('')}
              </div>
              <div class="dict-conj-panel" id="dict-conj-panel-constructions" style="display: none;">
                ${constructionsGroup.map(renderRowHtml).join('')}
              </div>
            </div>
          </div>
        `;
      } catch (err) {
        console.error('Ошибка при генерации спряжений:', err);
        conjugationHtml = `
          <div class="dict-section dict-conjugation">
            <h3 class="dict-section-title">Спряжение глагола</h3>
            <div class="dict-section-body">
              <div class="dict-empty-state">Не удалось построить таблицу спряжений</div>
            </div>
          </div>
        `;
      }
    }

    // Генерация контекстного примера через гибридный движок (corpus-first → template → null).
    // Просмотр примера НЕ записывает production evidence и НЕ меняет mastery/FSRS.
    const userMaxLesson = activeLessonId;
    const generatedExample = generateExample(word, { seed: exampleSeed, userMaxLesson });

    // Строим HTML блока «Примеры» с подсветкой слова и кнопками
    function buildExampleBlockHtml() {
      if (!generatedExample) {
        return `<div class="dict-empty-state">Примеры предложений пока отсутствуют</div>`;
      }
      const sourceBadge =
        generatedExample.source === EXAMPLE_SOURCES.CORPUS
          ? `<span class="dict-example-badge badge-corpus">Корпус</span>`
          : `<span class="dict-example-badge badge-template">Шаблон</span>`;
      const readingHtml = generatedExample.reading
        ? `<div class="dict-example-reading">${generatedExample.reading}</div>`
        : '';
      return `
        <div class="dict-example-card" id="dict-example-card">
          <div class="dict-example-header">
            ${sourceBadge}
            <button class="dict-example-speak btn-ghost-sm" id="dict-example-speak"
              aria-label="Озвучить пример">🔊</button>
          </div>
          <div class="dict-example-jp" id="dict-example-jp">${generatedExample.japaneseHighlighted}</div>
          ${readingHtml}
          <div class="dict-example-ru">${generatedExample.translation}</div>
          <div class="dict-example-footer">
            <button class="dict-example-next btn-secondary-sm" id="dict-example-next">
              🔄 Другой пример
            </button>
          </div>
        </div>
      `;
    }

    body.innerHTML = `
      <div class="dict-modal">
        <div class="dict-modal-header">
          <button class="btn-ghost" id="dict-modal-close">← Назад</button>
          <button class="dict-modal-speak" id="dict-modal-speak" aria-label="Озвучить">🔊</button>
        </div>
        
        <div class="dict-modal-content">
          <!-- Header Card -->
          <div class="dict-word-header-card">
            <div class="dict-word-main-info">
              <h2 class="dict-word-kanji">${word.kanji || word.writing}</h2>
              <p class="dict-word-reading">${word.writing}</p>
              ${word.romaji ? `<p class="dict-word-romaji">${word.romaji}</p>` : ''}
            </div>
            <div class="dict-word-translation-section">
              <p class="dict-word-translation">${word.translation}</p>
            </div>
            <div class="dict-word-meta-badges">
              <span class="dict-badge badge-pos">${getPartOfSpeechLabel(word.partOfSpeech)}</span>
              ${word.partOfSpeech === 'verb' && word.verbClass ? `<span class="dict-badge badge-verbclass">${getVerbClassLabel(word.verbClass)}</span>` : ''}
              <span class="dict-badge badge-lessons">${getLessonsLabel(word.lessonIds)}</span>
            </div>
          </div>

          <!-- Examples Block -->
          <div class="dict-section dict-examples">
            <h3 class="dict-section-title">Примеры предложений</h3>
            <div class="dict-section-body" id="dict-examples-body">
              ${buildExampleBlockHtml()}
            </div>
          </div>

          <!-- Conjugation Block (verbs only) -->
          ${word.partOfSpeech === 'verb' ? conjugationHtml : ''}

          <!-- Usage Block -->
          <div class="dict-section dict-usage">
            <h3 class="dict-section-title">Употребление</h3>
            <div class="dict-section-body dict-usage-grid">
              <div class="dict-usage-row">
                <span class="dict-usage-label">Частицы:</span>
                <span class="dict-usage-value">${word.particlePatterns && word.particlePatterns.length > 0 ? word.particlePatterns.map((p) => `<span class="dict-particle-tag">${p}</span>`).join(' ') : '<span class="dict-empty-inline">—</span>'}</span>
              </div>
              <div class="dict-usage-row">
                <span class="dict-usage-label">Переходность:</span>
                <span class="dict-usage-value">${word.transitivity === 'transitive' ? 'Переходный глагол' : word.transitivity === 'intransitive' ? 'Непереходный глагол' : '<span class="dict-empty-inline">неизвестно</span>'}</span>
              </div>
              <div class="dict-usage-row">
                <span class="dict-usage-label">Заметки:</span>
                <span class="dict-usage-value dict-usage-notes">${word.note || '<span class="dict-empty-inline">—</span>'}</span>
                <span class="dict-usage-value dict-usage-notes">${word.note || '<span class="dict-empty-inline">—</span>'}</span>
              </div>
            </div>
          </div>

          <!-- Kanji Accordion (conditional) -->
          ${
            hasKanji
              ? `
            <details class="dict-details-accordion" id="dict-kanji-details" ${isKanjiOpen ? 'open' : ''}>
              <summary class="dict-details-summary">Кандзи и написание</summary>
              <div class="dict-details-content">
                ${kanjiTabsHtml}
                <div class="dict-kanji-writer-container">
                  <div id="dict-kanji-writer-target"></div>
                </div>
                <div class="dict-kanji-controls">
                  <button class="btn-secondary" id="dict-animate-btn">🎬 Анимация черт</button>
                  <button class="btn-secondary" id="dict-quiz-btn">✍️ Пропись</button>
                </div>
              </div>
            </details>
          `
              : ''
          }

          <!-- Progress Accordion -->
          <details class="dict-details-accordion" id="dict-progress-details" ${isProgressOpen ? 'open' : ''}>
            <summary class="dict-details-summary">Прогресс изучения</summary>
            <div class="dict-details-content">
              <!-- Overall mastery info -->
              <div class="dict-mastery-overall">
                <div class="dict-mastery-score-row">
                  <span class="dict-mastery-level-label">Уровень освоения: <strong class="dict-mastery-level-value">${mastery.label}</strong></span>
                  <span class="dict-mastery-score-value">${mastery.score}%</span>
                </div>
                <div class="dict-mastery-progress-bar">
                  <div class="dict-mastery-progress-fill" style="width: ${mastery.score}%"></div>
                </div>
              </div>
              
              <!-- FSRS skills -->
              <div class="dict-skills-list">
                ${renderSkillRow('recognition', 'Узнавание (Recognition)', mastery, appSkills)}
                ${renderSkillRow('recall', 'Воспроизведение (Recall)', mastery, appSkills)}
                ${renderSkillRow('context-production', 'Использование (Production)', mastery, appSkills)}
              </div>
            </div>
          </details>
        </div>
      </div>
    `;

    const closeBtn = $('#dict-modal-close');
    if (closeBtn) closeBtn.onclick = returnToDict;

    const speakBtn = $('#dict-modal-speak');
    if (speakBtn) {
      speakBtn.onclick = (e) => {
        e.stopPropagation();
        speakJapanese(word.writing);
      };
    }

    // «Другой пример» — переключает seed; не затрагивает FSRS/mastery
    const nextExBtn = $('#dict-example-next');
    if (nextExBtn) {
      nextExBtn.onclick = (e) => {
        e.stopPropagation();
        exampleSeed = nextSeed(exampleSeed);
        renderModalContent();
      };
    }

    // Озвучить пример
    const exSpeakBtn = $('#dict-example-speak');
    if (exSpeakBtn && generatedExample) {
      exSpeakBtn.onclick = (e) => {
        e.stopPropagation();
        // Произносим чистый японский текст без HTML-разметки
        const cleanJp = generatedExample.japanese;
        speakJapanese(cleanJp);
      };
    }

    // Настройка табов и скрытия спряжений
    const conjSection = $('.dict-conjugation');
    if (conjSection) {
      const tabBtns = $$('.dict-conj-tab-btn');
      const panels = $$('.dict-conj-panel');
      tabBtns.forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const targetTab = btn.dataset.tab;
          tabBtns.forEach((b) => b.classList.toggle('active', b === btn));
          panels.forEach((p) => {
            const isTarget = p.id === `dict-conj-panel-${targetTab}`;
            p.style.display = isTarget ? 'flex' : 'none';
          });
        };
      });

      // Делегирование кликов для раскрытия японской формы
      conjSection.onclick = (e) => {
        const trigger = e.target.closest('.dict-conj-reveal-trigger');
        if (trigger) {
          e.stopPropagation();
          const valDiv = trigger.closest('.dict-conj-value');
          if (valDiv) {
            valDiv.dataset.revealed = 'true';
          }
        }
      };
    }

    if (kanjiChars.length > 1) {
      $$('.dict-kanji-tab').forEach((tab) => {
        tab.onclick = () => {
          currentKanjiIdx = parseInt(tab.dataset.kanjiIdx);
          renderModalContent();
        };
      });
    }

    if (hasKanji && selectedKanji) {
      initDictionaryKanjiWriter(selectedKanji);
    }
  };

  renderModalContent();
}

// Функция инициализации HanziWriter для словаря
async function initDictionaryKanjiWriter(kanji) {
  const target = document.getElementById('dict-kanji-writer-target');
  const container = target?.parentElement;
  const controls = document.querySelector('.dict-kanji-controls');

  if (!target) {
    console.warn('dict-kanji-writer-target not found');
    return;
  }

  target.innerHTML = '';
  target.style.touchAction = 'none';

  // Локальный загрузчик данных кандзи (без сетевых зависимостей)
  const loadKanjiData = (char) => {
    const cleanChar = cleanKanjiChar(char);
    if (!cleanChar) {
      return Promise.reject(new Error('Пустой символ после очистки'));
    }
    return localCharDataLoader(cleanChar);
  };

  try {
    const screenWidth = window.innerWidth;
    let writerSize = 280;
    if (screenWidth <= 400) {
      writerSize = 180;
    } else if (screenWidth <= 768) {
      writerSize = 200;
    }

    const writer = HanziWriter.create(target, kanji, {
      width: writerSize,
      height: writerSize,
      padding: 10,
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 200,
      showOutline: true,
      showCharacter: true,

      strokeColor: '#1e293b',
      radicalColor: '#168F16',
      outlineColor: '#DDD',
      drawingColor: '#1e293b',
      drawingWidth: 16,

      charDataLoader: loadKanjiData,
      onLoadCharDataError: (error) => {
        console.warn(`Не удалось загрузить данные для "${kanji}":`, error);
        if (container) container.style.display = 'none';
        if (controls) controls.style.display = 'none';
        if (container && container.parentElement) {
          const message = document.createElement('p');
          message.className = 'dict-no-kanji';
          message.textContent = `Данные для отрисовки символа "${kanji}" недоступны`;
          container.parentElement.insertBefore(message, container);
        }
      },
    });

    const animateBtn = $('#dict-animate-btn');
    if (animateBtn) {
      animateBtn.onclick = () => {
        writer.animateCharacter();
      };
    }

    const quizBtn = $('#dict-quiz-btn');
    if (quizBtn) {
      quizBtn.onclick = () => {
        writer.quiz({
          showOutline: true,
          leniency: 1.2,
          onComplete: () => {
            toast('✅ Отлично!');
          },
        });
      };
    }
  } catch (error) {
    console.error('Ошибка инициализации HanziWriter:', error);
    if (container) container.style.display = 'none';
    if (controls) controls.style.display = 'none';
    if (container && container.parentElement) {
      const message = document.createElement('p');
      message.className = 'dict-no-kanji';
      message.textContent = `Данные для отрисовки символа "${kanji}" недоступны`;
      container.parentElement.insertBefore(message, container);
    }
  }
}

// Функция запуска дополнительного повторения
export function startExtraReview(state, dependencies) {
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

  // Чистый старт сессии доп. повторения (без несуществующего startFlash)
  document.getElementById('completion-overlay')?.classList.add('hidden');

  // Скрываем табы SRS во время доп. повторения
  const tabsContainer = document.getElementById('srs-tabs-container');
  if (tabsContainer) tabsContainer.classList.add('hidden');

  sessionManager = null;
  activePracticeMode = 'preview';
  reviewUndoStack.clear();
  flashCtx = null;
  flashRevealed = false;
  flashIdx = 0;
  flashQueue = selected;
  renderFlash(state, dependencies);
}

// Функция инициализации батчинга сессий
export function initSessionBatching(dueCardsQueue, lessonsData, batchSize = 20) {
  activePracticeMode = null;
  const lessons = lessonsData || [];
  sessionBatcher = new SessionBatcher(dueCardsQueue, batchSize);
  currentBatchIndex = 0;

  const firstBatch = sessionBatcher.getCurrentBatch();
  if (!firstBatch) return null;

  // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: обогащаем карточки данными слов перед организацией
  const enrichedCards = firstBatch.cards.map((card) => {
    const word = wordById(card.id, lessons);
    return { ...card, word };
  });

  const organizedCards = sessionBatcher.organizeBatch(enrichedCards);

  flashQueue = organizedCards;
  flashIdx = 0;

  return {
    batcher: sessionBatcher,
    currentBatch: firstBatch,
    organizedCards,
    totalBatches: sessionBatcher.getTotalBatches(),
  };
}

// Функция завершения батча и перехода к следующему
export function completeBatchAndMoveNext(state, dependencies) {
  if (!sessionBatcher || !sessionBatcher.hasNextBatch()) {
    // Это был последний батч
    return null;
  }

  const nextBatch = sessionBatcher.moveToNextBatch();
  currentBatchIndex = sessionBatcher.getCurrentBatchIndex();

  // Обогащаем карточки данными слов (как в initSessionBatching),
  // иначе нельзя надёжно назначить skill-specific режим.
  const lessons = dependencies?.LESSONS || [];
  const enrichedCards = nextBatch.cards.map((card) => {
    const word = wordById(card.id, lessons);
    return { ...card, word };
  });

  const organizedCards = sessionBatcher.organizeBatch(enrichedCards);

  flashQueue = organizedCards;
  flashIdx = 0;
  flashRevealed = false;

  return {
    batch: nextBatch,
    organizedCards,
    totalBatches: sessionBatcher.getTotalBatches(),
    currentIndex: currentBatchIndex,
  };
}

// Запуск следующего батча, если он есть. Возвращает true, если батч стартовал.
function startNextBatchIfAny(state, dependencies) {
  if (!sessionBatcher || !sessionBatcher.hasNextBatch()) return false;

  const result = completeBatchAndMoveNext(state, dependencies);
  if (!result || !result.organizedCards) return false;

  reviewUndoStack.clear();

  sessionManager = new SessionManager(result.organizedCards, {
    srs: SRS,
    questsManager: dependencies.QuestsManager || window.QuestsManager || null,
    state,
    onSave: dependencies.save,
  });
  return true;
}

// Функция получения информации о текущем батче
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

// Функция сброса батчинга
export function resetSessionBatching() {
  sessionBatcher = null;
  currentBatchIndex = 0;
}

// Экспорт функций для установки глобальных переменных из app.js
export function setFlashQueue(queue) {
  flashQueue = queue;
  reviewUndoStack.clear();
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
  if (sessionManager !== manager) reviewUndoStack.clear();
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
