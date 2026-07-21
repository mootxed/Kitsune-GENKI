/* src/session-batcher.js — Батчинг SRS-сессий и организация в 4 блока упражнений */

import { CARD_MODES, hasKanjiChars, isWordTypingEligible } from '../ui/flashcards.js';

/**
 * SessionBatcher управляет разбиением большой очереди карточек на батчи по 20 карточек
 * и организацией каждого батча в 4 последовательных блока упражнений.
 */
export class SessionBatcher {
  constructor(totalCards, batchSize = 20) {
    this.totalCards = totalCards;
    this.batchSize = batchSize;
    this.batches = this.splitIntoBatches();
    this.currentBatchIndex = 0;
  }

  /**
   * Разбивает общую очередь карточек на батчи
   * @returns {Array} массив батчей с метаданными
   */
  splitIntoBatches() {
    const batches = [];
    const total = this.totalCards.length;

    for (let i = 0; i < total; i += this.batchSize) {
      const batch = this.totalCards.slice(i, i + this.batchSize);
      const isMiniSprint = batch.length < this.batchSize;

      batches.push({
        cards: batch,
        isMiniSprint,
        index: batches.length,
        total: Math.ceil(total / this.batchSize),
      });
    }

    return batches;
  }

  /**
   * Организует карточки батча в 4 последовательных блока упражнений.
   * Блок 1: Рисование (только для карточек с кандзи)
   * Блок 2: Квиз по частицам
   * Блок 3: Ввод каны
   * Блок 4: Множественный выбор
   *
   * КРИТИЧНО: Карточки без кандзи НЕ могут быть в режиме DRAWING.
   *
   * @param {Array} cardBatch - массив карточек для организации
   * @returns {Array} упорядоченный массив карточек с forcedMode
   */
  organizeBatchInto4Blocks(cardBatch) {
    const batchSize = cardBatch.length;

    // Разделяем карточки на "с кандзи" и "без кандзи"
    // ВАЖНО: проверяем наличие настоящих иероглифов (CJK), а не просто непустую строку —
    // поле kanji может содержать чистую кану (напр. "おはよう") или служебные символы ("～ちゃん")
    const cardsWithKanji = cardBatch.filter((card) => {
      const word = card.word || card;
      return hasKanjiChars(word.kanji || word.writing);
    });

    const cardsWithoutKanji = cardBatch.filter((card) => {
      const word = card.word || card;
      return !hasKanjiChars(word.kanji || word.writing);
    });

    // Инициализируем блоки
    const blocks = {
      [CARD_MODES.DRAWING]: [],
      [CARD_MODES.PARTICLE_QUIZ]: [],
      [CARD_MODES.TYPING]: [],
      [CARD_MODES.MULTIPLE_CHOICE]: [],
    };

    // Целевое количество карточек на блок (равномерное распределение)
    const targetPerBlock = Math.ceil(batchSize / 4);

    // === БЛОК 1: DRAWING (только карточки с кандзи, не больше targetPerBlock) ===
    const drawingCards = cardsWithKanji.slice(0, targetPerBlock);
    drawingCards.forEach((card) => {
      blocks[CARD_MODES.DRAWING].push({ ...card, forcedMode: CARD_MODES.DRAWING });
    });

    // Оставшиеся карточки с кандзи + все карточки без кандзи
    const remainingCards = [...cardsWithKanji.slice(targetPerBlock), ...cardsWithoutKanji];

    // === БЛОКИ 2, 3, 4: распределяем ВСЕ оставшиеся карточки равномерно ===
    // КРИТИЧНО: карточки не должны теряться, когда кандзи-карточек меньше
    // targetPerBlock — остаток делим между блоками 2-4 (избыток уходит в начало).
    const basePerBlock = Math.floor(remainingCards.length / 3);
    const extraCards = remainingCards.length % 3;

    // Размеры блоков: particle quiz → typing → multiple choice
    const particleBlockSize = basePerBlock + (extraCards > 0 ? 1 : 0);
    const typingBlockSize = basePerBlock + (extraCards > 1 ? 1 : 0);

    // === БЛОК 2: PARTICLE QUIZ (70%) + SENTENCE BUILDING (30%) ===
    const particleCards = remainingCards.slice(0, particleBlockSize);
    particleCards.forEach((card) => {
      // Вероятностное распределение: 70% PARTICLE_QUIZ, 30% SENTENCE_BUILDING
      const mode = Math.random() < 0.7 ? CARD_MODES.PARTICLE_QUIZ : CARD_MODES.SENTENCE_BUILDING;
      blocks[CARD_MODES.PARTICLE_QUIZ].push({ ...card, forcedMode: mode });
    });

    // === БЛОК 3: TYPING — только слова, помещающиеся на клавиатуру ===
    // (≤ MAX_TYPING_UNIQUE_CHARS уникальных символов каны после очистки от спецсимволов).
    // Неподходящие слова переправляются в блок множественного выбора.
    const restCards = remainingCards.slice(particleBlockSize);
    const typingEligible = restCards.filter((card) => isWordTypingEligible(card.word || card));
    const typingIneligible = restCards.filter((card) => !isWordTypingEligible(card.word || card));

    const typingCards = typingEligible.slice(0, typingBlockSize);
    typingCards.forEach((card) => {
      blocks[CARD_MODES.TYPING].push({ ...card, forcedMode: CARD_MODES.TYPING });
    });

    // === БЛОК 4: MULTIPLE CHOICE — всё, что не вошло в блоки 2 и 3 ===
    const multipleChoiceCards = [...typingEligible.slice(typingBlockSize), ...typingIneligible];
    multipleChoiceCards.forEach((card) => {
      blocks[CARD_MODES.MULTIPLE_CHOICE].push({ ...card, forcedMode: CARD_MODES.MULTIPLE_CHOICE });
    });

    // Собираем в единую последовательную очередь: Block 1 → Block 2 → Block 3 → Block 4
    return [
      ...blocks[CARD_MODES.DRAWING],
      ...blocks[CARD_MODES.PARTICLE_QUIZ],
      ...blocks[CARD_MODES.TYPING],
      ...blocks[CARD_MODES.MULTIPLE_CHOICE],
    ];
  }

  /**
   * Получить текущий батч
   * @returns {Object} текущий батч с метаданными
   */
  getCurrentBatch() {
    return this.batches[this.currentBatchIndex];
  }

  /**
   * Проверить, есть ли следующий батч
   * @returns {boolean}
   */
  hasNextBatch() {
    return this.currentBatchIndex < this.batches.length - 1;
  }

  /**
   * Перейти к следующему батчу
   * @returns {Object|null} следующий батч или null
   */
  moveToNextBatch() {
    if (this.hasNextBatch()) {
      this.currentBatchIndex++;
      return this.getCurrentBatch();
    }
    return null;
  }

  /**
   * Получить общее количество батчей
   * @returns {number}
   */
  getTotalBatches() {
    return this.batches.length;
  }

  /**
   * Получить индекс текущего батча (0-based)
   * @returns {number}
   */
  getCurrentBatchIndex() {
    return this.currentBatchIndex;
  }
}
