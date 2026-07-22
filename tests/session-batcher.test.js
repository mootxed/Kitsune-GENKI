/* tests/session-batcher.test.js — Unit tests for SessionBatcher */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionBatcher } from '../src/session-batcher.js';
import { CARD_MODES } from '../ui/flashcards.js';
import { SKILLS } from '../src/knowledge-model.js';

describe('SessionBatcher', () => {
  let mockCards;

  beforeEach(() => {
    const skills = Object.values(SKILLS);
    // Создаём 66 моковых карточек (3x20 + 1x6)
    mockCards = Array.from({ length: 66 }, (_, i) => ({
      id: `card-${i}`,
      itemId: `word-${i}`,
      skill: skills[i % skills.length],
      word: {
        id: `word-${i}`,
        kanji: i % 3 === 0 ? `漢${i}` : '', // каждая третья карточка с кандзи
        writing: `かな${i}`,
        translation: `Translation ${i}`,
      },
    }));
  });

  describe('splitIntoBatches', () => {
    it('должен разбить 66 карточек на 4 батча (20+20+20+6)', () => {
      const batcher = new SessionBatcher(mockCards, 20);

      expect(batcher.batches.length).toBe(4);
      expect(batcher.batches[0].cards.length).toBe(20);
      expect(batcher.batches[1].cards.length).toBe(20);
      expect(batcher.batches[2].cards.length).toBe(20);
      expect(batcher.batches[3].cards.length).toBe(6);
    });

    it('должен пометить последний батч как мини-спринт', () => {
      const batcher = new SessionBatcher(mockCards, 20);

      expect(batcher.batches[0].isMiniSprint).toBe(false);
      expect(batcher.batches[1].isMiniSprint).toBe(false);
      expect(batcher.batches[2].isMiniSprint).toBe(false);
      expect(batcher.batches[3].isMiniSprint).toBe(true);
    });

    it('должен корректно индексировать батчи', () => {
      const batcher = new SessionBatcher(mockCards, 20);

      expect(batcher.batches[0].index).toBe(0);
      expect(batcher.batches[1].index).toBe(1);
      expect(batcher.batches[2].index).toBe(2);
      expect(batcher.batches[3].index).toBe(3);
      expect(batcher.batches[0].total).toBe(4);
    });

    it('должен корректно работать с ровным количеством карточек', () => {
      const exactCards = mockCards.slice(0, 60); // ровно 3 батча
      const batcher = new SessionBatcher(exactCards, 20);

      expect(batcher.batches.length).toBe(3);
      expect(batcher.batches[2].isMiniSprint).toBe(false);
      expect(batcher.batches[2].cards.length).toBe(20);
    });
  });

  describe('organizeBatchInto4Blocks', () => {
    it('назначает режим по стабильному skill карточки', () => {
      const batcher = new SessionBatcher(mockCards, 20);
      const firstBatch = batcher.batches[0].cards;
      const organized = batcher.organizeBatchInto4Blocks(firstBatch);

      expect(organized.length).toBe(20);

      // Проверяем, что каждая карточка имеет forcedMode
      organized.forEach((card) => {
        expect(card.forcedMode).toBeDefined();
        expect([
          CARD_MODES.DRAWING,
          CARD_MODES.REVERSE_MULTIPLE_CHOICE,
          CARD_MODES.CONTEXT_PRODUCTION,
          CARD_MODES.TYPING,
          CARD_MODES.MULTIPLE_CHOICE,
        ]).toContain(card.forcedMode);
      });
    });

    it('не назначает vocabulary-карточкам particle/grammar режимы', () => {
      const batcher = new SessionBatcher(mockCards, 20);
      const firstBatch = batcher.batches[0].cards;
      const organized = batcher.organizeBatchInto4Blocks(firstBatch);

      const modes = organized.map((c) => c.forcedMode);
      expect(modes).not.toContain(CARD_MODES.PARTICLE_QUIZ);
      expect(modes).not.toContain(CARD_MODES.SENTENCE_BUILDING);
      expect(organized.find((card) => card.skill === SKILLS.RECOGNITION).forcedMode).toBe(
        CARD_MODES.REVERSE_MULTIPLE_CHOICE
      );
      expect(organized.find((card) => card.skill === SKILLS.RECALL).forcedMode).toBe(
        CARD_MODES.TYPING
      );
    });

    it('НЕ должен назначать режим DRAWING карточкам без кандзи', () => {
      // Создаём батч только из карточек без кандзи
      const noKanjiCards = Array.from({ length: 20 }, (_, i) => ({
        id: `no-kanji-${i}`,
        itemId: `word-${i}`,
        skill: SKILLS.READING_WRITING,
        word: {
          id: `word-${i}`,
          kanji: '', // НЕТ КАНДЗИ
          writing: `かな${i}`,
          translation: `Translation ${i}`,
        },
      }));

      const batcher = new SessionBatcher(noKanjiCards, 20);
      const organized = batcher.organizeBatchInto4Blocks(noKanjiCards);

      // Ни одна карточка не должна иметь режим DRAWING
      const drawingCards = organized.filter((c) => c.forcedMode === CARD_MODES.DRAWING);
      expect(drawingCards.length).toBe(0);
    });

    it('должен назначать режим DRAWING только карточкам с кандзи', () => {
      const batcher = new SessionBatcher(mockCards, 20);
      const firstBatch = batcher.batches[0].cards;
      const organized = batcher.organizeBatchInto4Blocks(firstBatch);

      const drawingCards = organized.filter((c) => c.forcedMode === CARD_MODES.DRAWING);

      // Все карточки в режиме DRAWING должны иметь кандзи
      drawingCards.forEach((card) => {
        const word = card.word || card;
        expect(word.kanji).toBeTruthy();
        expect(word.kanji.trim()).not.toBe('');
      });
    });

    it('НЕ должен терять карточки, когда кандзи-карточек меньше targetPerBlock', () => {
      // 20 карточек, кандзи только у 2 — раньше 3 карточки молча выбрасывались
      const fewKanjiCards = Array.from({ length: 20 }, (_, i) => ({
        id: `few-kanji-${i}`,
        itemId: `word-${i}`,
        skill: SKILLS.READING_WRITING,
        word: {
          id: `word-${i}`,
          kanji: i < 2 ? `漢${i}` : '',
          writing: `かな${i}`,
          translation: `Translation ${i}`,
        },
      }));

      const batcher = new SessionBatcher(fewKanjiCards, 20);
      const organized = batcher.organizeBatchInto4Blocks(fewKanjiCards);

      expect(organized.length).toBe(20);
      expect(organized.filter((c) => c.forcedMode === CARD_MODES.DRAWING).length).toBe(2);
      // Каждая исходная карточка должна присутствовать ровно один раз
      const ids = organized.map((c) => c.id);
      expect(new Set(ids).size).toBe(20);
    });

    it('НЕ должен терять карточки при полном отсутствии кандзи в батче', () => {
      const noKanjiCards = Array.from({ length: 20 }, (_, i) => ({
        id: `no-kanji-${i}`,
        itemId: `word-${i}`,
        skill: SKILLS.READING_WRITING,
        word: {
          id: `word-${i}`,
          kanji: '',
          writing: `かな${i}`,
          translation: `Translation ${i}`,
        },
      }));

      const batcher = new SessionBatcher(noKanjiCards, 20);
      const organized = batcher.organizeBatchInto4Blocks(noKanjiCards);

      expect(organized.length).toBe(20);
      expect(new Set(organized.map((c) => c.id)).size).toBe(20);
    });

    it('должен корректно работать с мини-спринтом (6 карточек)', () => {
      const batcher = new SessionBatcher(mockCards, 20);
      const miniSprintBatch = batcher.batches[3].cards; // 6 карточек
      const organized = batcher.organizeBatchInto4Blocks(miniSprintBatch);

      expect(organized.length).toBe(6);

      // Все карточки должны иметь forcedMode
      organized.forEach((card) => {
        expect(card.forcedMode).toBeDefined();
      });
    });

    it('разносит skill одного knowledge item по round-robin очереди', () => {
      const cards = ['a', 'b', 'c'].flatMap((itemId) =>
        [SKILLS.RECOGNITION, SKILLS.RECALL].map((skill) => ({
          id: skill === SKILLS.RECOGNITION ? itemId : `${itemId}::${skill}`,
          itemId,
          skill,
          word: { id: itemId, writing: 'かな', category: 'nouns' },
        }))
      );
      const organized = new SessionBatcher(cards, cards.length).organizeBatchInto4Blocks(cards);

      expect(organized.map((card) => card.itemId)).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
      expect(organized[0].skill).toBe(SKILLS.RECOGNITION);
      expect(organized[3].skill).toBe(SKILLS.RECALL);
    });
  });

  describe('Navigation methods', () => {
    it('getCurrentBatch() должен возвращать первый батч изначально', () => {
      const batcher = new SessionBatcher(mockCards, 20);
      const current = batcher.getCurrentBatch();

      expect(current.index).toBe(0);
      expect(current.cards.length).toBe(20);
    });

    it('hasNextBatch() должен корректно определять наличие следующего батча', () => {
      const batcher = new SessionBatcher(mockCards, 20);

      expect(batcher.hasNextBatch()).toBe(true);

      batcher.moveToNextBatch();
      expect(batcher.hasNextBatch()).toBe(true);

      batcher.moveToNextBatch();
      expect(batcher.hasNextBatch()).toBe(true);

      batcher.moveToNextBatch();
      expect(batcher.hasNextBatch()).toBe(false); // последний батч
    });

    it('moveToNextBatch() должен переключать на следующий батч', () => {
      const batcher = new SessionBatcher(mockCards, 20);

      const second = batcher.moveToNextBatch();
      expect(second.index).toBe(1);
      expect(batcher.getCurrentBatchIndex()).toBe(1);

      const third = batcher.moveToNextBatch();
      expect(third.index).toBe(2);

      const fourth = batcher.moveToNextBatch();
      expect(fourth.index).toBe(3);
      expect(fourth.isMiniSprint).toBe(true);
    });

    it('moveToNextBatch() должен возвращать null после последнего батча', () => {
      const batcher = new SessionBatcher(mockCards, 20);

      batcher.moveToNextBatch();
      batcher.moveToNextBatch();
      batcher.moveToNextBatch();

      const afterLast = batcher.moveToNextBatch();
      expect(afterLast).toBe(null);
    });

    it('getTotalBatches() должен возвращать правильное количество батчей', () => {
      const batcher = new SessionBatcher(mockCards, 20);
      expect(batcher.getTotalBatches()).toBe(4);
    });
  });

  describe('Edge cases', () => {
    it('должен корректно работать с 1 карточкой', () => {
      const singleCard = [mockCards[0]];
      const batcher = new SessionBatcher(singleCard, 20);

      expect(batcher.batches.length).toBe(1);
      expect(batcher.batches[0].cards.length).toBe(1);
      expect(batcher.batches[0].isMiniSprint).toBe(true);
    });

    it('должен корректно работать с пустым массивом', () => {
      const batcher = new SessionBatcher([], 20);

      expect(batcher.batches.length).toBe(0);
      expect(batcher.hasNextBatch()).toBe(false);
    });

    it('должен корректно работать с batchSize = 10', () => {
      const batcher = new SessionBatcher(mockCards, 10);

      expect(batcher.batches.length).toBe(7); // 66 / 10 = 6 полных + 1 мини (6 карточек)
      expect(batcher.batches[6].cards.length).toBe(6);
      expect(batcher.batches[6].isMiniSprint).toBe(true);
    });
  });
});
