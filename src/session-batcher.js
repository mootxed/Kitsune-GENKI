/* src/session-batcher.js — batching and skill-safe ordering for SRS sessions. */

import { CARD_MODES, hasKanjiChars } from '../ui/flashcards.js';
import { SKILLS, parseCardIdentity } from './knowledge-model.js';
import { typingCapability } from './typing-capability.js';

/**
 * SessionBatcher управляет разбиением большой очереди карточек на батчи по 20 карточек
 * и разносит навыки одного knowledge item по очереди.
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

  /** Assigns a mode by skill and spreads repeated knowledge items round-robin. */
  organizeBatch(cardBatch) {
    // Mode is a stable projection of the card skill. Vocabulary cards are never
    // repurposed as particle/grammar questions.
    const projected = cardBatch.map((card) => {
      const skill = parseCardIdentity(card).skill;
      const word = card.word || card;
      const typing = typingCapability(word);
      let forcedMode = CARD_MODES.REVERSE_MULTIPLE_CHOICE;

      if (skill === SKILLS.RECALL && typing.canType) forcedMode = CARD_MODES.TYPING;
      if (skill === SKILLS.READING_WRITING) {
        forcedMode = hasKanjiChars(word.kanji || word.writing)
          ? CARD_MODES.DRAWING
          : typing.canType
            ? CARD_MODES.TYPING
            : CARD_MODES.MULTIPLE_CHOICE;
      }
      if (skill === SKILLS.CONTEXT_PRODUCTION && typing.canType) {
        forcedMode = CARD_MODES.CONTEXT_PRODUCTION;
      }

      return { ...card, forcedMode };
    });

    // Round-robin by knowledge item. If several due skills of one word happen
    // to share a batch, recognition cannot reveal the immediately next answer.
    const groups = new Map();
    for (const card of projected) {
      const itemId = parseCardIdentity(card).itemId;
      if (!groups.has(itemId)) groups.set(itemId, []);
      groups.get(itemId).push(card);
    }

    const organized = [];
    let round = 0;
    while (organized.length < projected.length) {
      for (const cards of groups.values()) {
        if (cards[round]) organized.push(cards[round]);
      }
      round++;
    }
    return organized;
  }

  /** @deprecated Compatibility alias for older callers. */
  organizeBatchInto4Blocks(cardBatch) {
    return this.organizeBatch(cardBatch);
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
