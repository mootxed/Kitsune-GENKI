/* src/session-batcher.js — Батчинг SRS-сессий и организация в 4 блока упражнений */

import { CARD_MODES } from '../ui/flashcards.js';

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
    const cardsWithKanji = cardBatch.filter((card) => {
      const word = card.word || card;
      return word.kanji && word.kanji.trim() !== '';
    });

    const cardsWithoutKanji = cardBatch.filter((card) => {
      const word = card.word || card;
      return !word.kanji || word.kanji.trim() === '';
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

    // === БЛОК 1: DRAWING (только карточки с кандзи) ===
    const drawingCards = cardsWithKanji.slice(0, targetPerBlock);
    drawingCards.forEach((card) => {
      blocks[CARD_MODES.DRAWING].push({ ...card, forcedMode: CARD_MODES.DRAWING });
    });

    // Оставшиеся карточки с кандзи + все карточки без кандзи
    const remainingCards = [...cardsWithKanji.slice(targetPerBlock), ...cardsWithoutKanji];

    // === БЛОКИ 2, 3, 4: распределяем оставшиеся карточки ===
    const otherModes = [CARD_MODES.PARTICLE_QUIZ, CARD_MODES.TYPING, CARD_MODES.MULTIPLE_CHOICE];

    let cardIndex = 0;
    otherModes.forEach((mode) => {
      const cardsForThisBlock = remainingCards.slice(cardIndex, cardIndex + targetPerBlock);
      cardsForThisBlock.forEach((card) => {
        blocks[mode].push({ ...card, forcedMode: mode });
      });
      cardIndex += targetPerBlock;
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
