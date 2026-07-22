import { describe, expect, it, vi } from 'vitest';
import {
  LEECH_THRESHOLD,
  UndoStack,
  adjustQualityByTime,
  handleLeech,
  isLeech,
  restoreCardState,
  undoReviewEvent,
} from '../src/card-behavior.js';

describe('card behavior', () => {
  describe('leech detection', () => {
    it('срабатывает только после достижения порога lapses', () => {
      expect(isLeech({ lapses: LEECH_THRESHOLD - 1 })).toBe(false);
      expect(isLeech({ lapses: LEECH_THRESHOLD })).toBe(true);
    });

    it('помечает карточку, не изменяя FSRS-поля', () => {
      const card = { lapses: LEECH_THRESHOLD, stability: 12, difficulty: 7 };

      expect(handleLeech(card)).toBe(true);
      expect(card).toMatchObject({
        isLeech: true,
        leechNotified: true,
        stability: 12,
        difficulty: 7,
      });
      expect(handleLeech(card)).toBe(false);
    });
  });

  describe('response time quality', () => {
    it.each([
      [4, 3_000, 'multiple-choice', 4],
      [4, 5_000, 'typing', 4],
      [4, 10_000, 'drawing', 4],
      [5, 10_000, 'multiple-choice', 4],
      [5, 15_000, 'typing', 4],
      [5, 30_000, 'drawing', 4],
    ])('корректирует quality=%i при %i мс в режиме %s', (quality, time, mode, expected) => {
      expect(adjustQualityByTime(quality, time, mode)).toBe(expected);
    });

    it('не меняет провал, неизвестный режим и отсутствующее время', () => {
      expect(adjustQualityByTime(0, 100, 'typing')).toBe(0);
      expect(adjustQualityByTime(4, 100, 'unknown')).toBe(4);
      expect(adjustQualityByTime(4, null, 'typing')).toBe(4);
    });

    it('не повышает быстрый multiple choice с Good до Easy', () => {
      expect(adjustQualityByTime(4, 500, 'multiple-choice')).toBe(4);
    });
  });

  describe('undo stack', () => {
    it('хранит глубокий снимок и восстанавливает последнюю карточку', () => {
      vi.setSystemTime(1_750_000_000_000);
      const stack = new UndoStack(2);
      const previous = { id: 'card-1', lapses: 2, nested: { progress: 10 } };
      const restore = vi.fn();

      stack.push('card-1', previous);
      previous.nested.progress = 99;

      expect(stack.undo(restore)).toBe(true);
      expect(restore).toHaveBeenCalledWith('card-1', {
        id: 'card-1',
        lapses: 2,
        nested: { progress: 10 },
      });
      expect(stack.undo(restore)).toBe(false);
    });

    it('атомарно восстанавливает карточку и помечает связанное событие', () => {
      const previousCard = { id: 'card-1', stability: 1, learning_steps: 0 };
      const appState = {
        srs: { 'card-1': { id: 'card-1', stability: 5, learning_steps: 1 } },
        reviewEvents: [{ eventId: 'event-1', cardId: 'card-1', previousCard, undoneAt: null }],
      };

      expect(undoReviewEvent(appState, 'event-1', 123)).toBe(true);
      expect(appState.srs['card-1']).toEqual(previousCard);
      expect(appState.reviewEvents[0].undoneAt).toBe(123);
      expect(undoReviewEvent(appState, 'event-1', 456)).toBe(false);
    });

    it('ограничивает историю и восстанавливает объект без остаточных полей', () => {
      const stack = new UndoStack(2);
      stack.push('first', { value: 1 });
      stack.push('second', { value: 2 });
      stack.push('third', { value: 3 });

      const ids = [];
      stack.undo((id) => ids.push(id));
      stack.undo((id) => ids.push(id));
      expect(ids).toEqual(['third', 'second']);

      const card = { id: 'x', lapses: 9, isLeech: true };
      expect(restoreCardState(card, { id: 'x', lapses: 7 })).toBe(true);
      expect(card).toEqual({ id: 'x', lapses: 7 });
    });
  });
});
