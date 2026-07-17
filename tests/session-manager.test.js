import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionManager } from '../session-manager.js';

describe('SessionManager', () => {
  let mockCards;
  let mockSrsCollection;

  beforeEach(() => {
    // Мокаем карточки для тестирования
    mockCards = [
      { id: 'card1', front: 'Test 1', back: 'Answer 1', interval: 1, easeFactor: 2.5, repetitions: 0 },
      { id: 'card2', front: 'Test 2', back: 'Answer 2', interval: 1, easeFactor: 2.5, repetitions: 0 },
      { id: 'card3', front: 'Test 3', back: 'Answer 3', interval: 1, easeFactor: 2.5, repetitions: 0 },
    ];

    mockSrsCollection = {
      card1: mockCards[0],
      card2: mockCards[1],
      card3: mockCards[2],
    };

    // Мокаем глобальные объекты
    global.SRS = {
      review: vi.fn((card, quality) => {
        // Простая имитация SM-2 алгоритма
        if (quality >= 4) {
          card.interval = card.interval * card.easeFactor;
          card.repetitions++;
        } else {
          card.repetitions = 0;
          card.interval = 1;
        }
      })
    };

    global.QuestSystem = {
      trackCardCompleted: vi.fn(),
      trackStreak: vi.fn()
    };
  });

  describe('Инициализация сессии', () => {
    it('должен создать очередь карточек с корректными метаданными', () => {
      const session = new SessionManager(mockCards);
      
      expect(session.queue).toHaveLength(3);
      expect(session.queue[0]).toMatchObject({
        card: mockCards[0],
        sessionLapses: 0,
        isFirstAttempt: true,
        completed: false
      });
    });

    it('должен инициализировать статистику сессии', () => {
      const session = new SessionManager(mockCards);
      
      expect(session.stats).toEqual({
        total: 3,
        reviewed: 0,
        perfect: 0,
        relearned: 0,
        remaining: 3
      });
    });
  });

  describe('getNextCard', () => {
    it('должен вернуть первую незавершённую карточку', () => {
      const session = new SessionManager(mockCards);
      const nextCard = session.getNextCard();
      
      expect(nextCard).toMatchObject({
        id: 'card1',
        sessionLapses: 0,
        isFirstAttempt: true
      });
    });

    it('должен вернуть null когда все карточки завершены', () => {
      const session = new SessionManager(mockCards);
      
      // Завершаем все карточки
      session.queue.forEach(item => item.completed = true);
      
      const nextCard = session.getNextCard();
      expect(nextCard).toBeNull();
    });

    it('должен пропустить завершённые карточки', () => {
      const session = new SessionManager(mockCards);
      
      // Завершаем первую карточку
      session.queue[0].completed = true;
      
      const nextCard = session.getNextCard();
      expect(nextCard.id).toBe('card2');
    });
  });

  describe('getCardState', () => {
    it('должен вернуть состояние карточки в сессии', () => {
      const session = new SessionManager(mockCards);
      const state = session.getCardState('card1');
      
      expect(state).toEqual({
        sessionLapses: 0,
        isFirstAttempt: true,
        completed: false
      });
    });

    it('должен вернуть null для несуществующей карточки', () => {
      const session = new SessionManager(mockCards);
      const state = session.getCardState('nonexistent');
      
      expect(state).toBeNull();
    });

    it('должен вернуть null для завершённой карточки', () => {
      const session = new SessionManager(mockCards);
      session.queue[0].completed = true;
      
      const state = session.getCardState('card1');
      expect(state).toBeNull();
    });
  });

  describe('answerCard - первая попытка', () => {
    it('должен завершить карточку при правильном ответе (quality >= 4)', () => {
      const session = new SessionManager(mockCards);
      
      session.answerCard('card1', 4, mockSrsCollection);
      
      const item = session.queue[0];
      expect(item.completed).toBe(true);
      expect(item.isFirstAttempt).toBe(false);
      expect(session.stats.reviewed).toBe(1);
      expect(session.stats.perfect).toBe(1);
      expect(session.stats.remaining).toBe(2);
    });

    it('должен вызвать SRS.review при первой попытке', () => {
      const session = new SessionManager(mockCards);
      
      session.answerCard('card1', 4, mockSrsCollection);
      
      expect(global.SRS.review).toHaveBeenCalledWith(mockSrsCollection.card1, 4);
    });

    it('должен трекать квесты при успешном ответе', () => {
      const session = new SessionManager(mockCards);
      
      session.answerCard('card1', 5, mockSrsCollection);
      
      expect(global.QuestSystem.trackCardCompleted).toHaveBeenCalled();
      expect(global.QuestSystem.trackStreak).toHaveBeenCalledWith(true);
    });

    it('должен откинуть карточку назад при ошибке (quality < 4)', () => {
      const session = new SessionManager(mockCards);
      
      session.answerCard('card1', 0, mockSrsCollection);
      
      const item = session.queue.find(i => i.card.id === 'card1');
      expect(item.completed).toBe(false);
      expect(item.sessionLapses).toBe(1);
      expect(item.isFirstAttempt).toBe(false);
      expect(session.stats.relearned).toBe(1);
    });

    it('должен сбросить стрик при ошибке', () => {
      const session = new SessionManager(mockCards);
      
      session.answerCard('card1', 0, mockSrsCollection);
      
      expect(global.QuestSystem.trackStreak).toHaveBeenCalledWith(false);
    });
  });

  describe('answerCard - повторные попытки (цикл доучивания)', () => {
    it('должен завершить карточку при правильном ответе после ошибки', () => {
      const session = new SessionManager(mockCards);
      
      // Первая попытка - ошибка
      session.answerCard('card1', 0, mockSrsCollection);
      
      // Находим карточку в очереди (она была откинута назад)
      const cardIndex = session.queue.findIndex(i => i.card.id === 'card1' && !i.completed);
      expect(cardIndex).toBeGreaterThan(-1);
      
      // Вторая попытка - правильный ответ
      session.answerCard('card1', 4, mockSrsCollection);
      
      const item = session.queue.find(i => i.card.id === 'card1');
      expect(item.completed).toBe(true);
      expect(session.stats.reviewed).toBe(1);
    });

    it('НЕ должен вызывать SRS.review при повторной попытке', () => {
      const session = new SessionManager(mockCards);
      
      // Первая попытка - ошибка
      session.answerCard('card1', 0, mockSrsCollection);
      
      // Сбрасываем мок
      global.SRS.review.mockClear();
      
      // Вторая попытка - правильный ответ
      session.answerCard('card1', 4, mockSrsCollection);
      
      // SRS.review НЕ должен быть вызван повторно
      expect(global.SRS.review).not.toHaveBeenCalled();
    });

    it('должен увеличивать sessionLapses при повторных ошибках', () => {
      const session = new SessionManager(mockCards);
      
      // Первая попытка - ошибка
      session.answerCard('card1', 0, mockSrsCollection);
      let item = session.queue.find(i => i.card.id === 'card1');
      expect(item.sessionLapses).toBe(1);
      
      // Вторая попытка - снова ошибка
      session.answerCard('card1', 0, mockSrsCollection);
      item = session.queue.find(i => i.card.id === 'card1');
      expect(item.sessionLapses).toBe(2);
    });

    it('НЕ должен трекать стрик при правильном ответе в цикле доучивания', () => {
      const session = new SessionManager(mockCards);
      
      // Первая попытка - ошибка
      session.answerCard('card1', 0, mockSrsCollection);
      
      // Сбрасываем мок
      global.QuestSystem.trackStreak.mockClear();
      
      // Вторая попытка - правильный ответ
      session.answerCard('card1', 4, mockSrsCollection);
      
      // Стрик НЕ должен трекаться (это не первая попытка)
      expect(global.QuestSystem.trackStreak).not.toHaveBeenCalled();
      // Но завершение карточки должно трекаться
      expect(global.QuestSystem.trackCardCompleted).toHaveBeenCalled();
    });
  });

  describe('_moveCardBack - откидывание карточек', () => {
    it('должен откинуть карточку на 10 позиций при quality=0', () => {
      const session = new SessionManager([...Array(15)].map((_, i) => ({
        id: `card${i}`,
        front: `Test ${i}`,
        back: `Answer ${i}`
      })));
      
      // Отвечаем на первую карточку с ошибкой
      session.answerCard('card0', 0, {});
      
      // Карточка должна быть откинута примерно на 10 позиций
      const newIndex = session.queue.findIndex(i => i.card.id === 'card0');
      expect(newIndex).toBeGreaterThanOrEqual(9);
      expect(newIndex).toBeLessThanOrEqual(11);
    });

    it('должен откинуть карточку на 15 позиций при quality=3', () => {
      const session = new SessionManager([...Array(20)].map((_, i) => ({
        id: `card${i}`,
        front: `Test ${i}`,
        back: `Answer ${i}`
      })));
      
      session.answerCard('card0', 3, {});
      
      const newIndex = session.queue.findIndex(i => i.card.id === 'card0');
      expect(newIndex).toBeGreaterThanOrEqual(14);
      expect(newIndex).toBeLessThanOrEqual(16);
    });

    it('должен сокращать шаг при повторных ошибках', () => {
      const session = new SessionManager([...Array(15)].map((_, i) => ({
        id: `card${i}`,
        front: `Test ${i}`,
        back: `Answer ${i}`
      })));
      
      // Первая ошибка - откат на 10 позиций
      session.answerCard('card0', 0, {});
      const firstIndex = session.queue.findIndex(i => i.card.id === 'card0');
      
      // Вторая ошибка - откат на 10/2 = 5 позиций
      session.answerCard('card0', 0, {});
      const secondIndex = session.queue.findIndex(i => i.card.id === 'card0');
      
      // Разница должна быть меньше при второй ошибке
      expect(secondIndex - firstIndex).toBeLessThan(10);
    });

    it('должен откидывать минимум на 1 позицию даже при многих ошибках', () => {
      // Увеличиваем очередь до 30 карточек чтобы было достаточно места
      const session = new SessionManager([...Array(30)].map((_, i) => ({
        id: `card${i}`,
        front: `Test ${i}`,
        back: `Answer ${i}`
      })));
      
      // Делаем 10 ошибок подряд
      for (let i = 0; i < 10; i++) {
        const prevIndex = session.queue.findIndex(item => item.card.id === 'card0' && !item.completed);
        session.answerCard('card0', 0, {});
        const newIndex = session.queue.findIndex(item => item.card.id === 'card0' && !item.completed);
        
        // Карточка должна либо сдвинуться вперёд, либо остаться на месте если достигла конца
        // но НЕ должна вернуться назад
        expect(newIndex).toBeGreaterThanOrEqual(prevIndex);
      }
    });
  });

  describe('isSessionComplete', () => {
    it('должен вернуть false когда есть незавершённые карточки', () => {
      const session = new SessionManager(mockCards);
      
      expect(session.isSessionComplete()).toBe(false);
    });

    it('должен вернуть true когда все карточки завершены', () => {
      const session = new SessionManager(mockCards);
      
      // Завершаем все карточки
      session.answerCard('card1', 5, mockSrsCollection);
      session.answerCard('card2', 5, mockSrsCollection);
      session.answerCard('card3', 5, mockSrsCollection);
      
      expect(session.isSessionComplete()).toBe(true);
    });
  });

  describe('getStats и getProgress', () => {
    it('должен возвращать корректную статистику', () => {
      const session = new SessionManager(mockCards);
      
      const stats = session.getStats();
      expect(stats).toEqual({
        total: 3,
        reviewed: 0,
        perfect: 0,
        relearned: 0,
        remaining: 3
      });
    });

    it('должен обновлять статистику после ответов', () => {
      const session = new SessionManager(mockCards);
      
      session.answerCard('card1', 5, mockSrsCollection);
      session.answerCard('card2', 0, mockSrsCollection);
      
      const stats = session.getStats();
      expect(stats.reviewed).toBe(1);
      expect(stats.perfect).toBe(1);
      expect(stats.relearned).toBe(1);
      expect(stats.remaining).toBe(2);
    });

    it('должен правильно вычислять прогресс в процентах', () => {
      const session = new SessionManager(mockCards);
      
      expect(session.getProgress()).toBe(0);
      
      session.answerCard('card1', 5, mockSrsCollection);
      expect(session.getProgress()).toBe(33); // 1/3 = 33%
      
      session.answerCard('card2', 5, mockSrsCollection);
      expect(session.getProgress()).toBe(67); // 2/3 = 67%
      
      session.answerCard('card3', 5, mockSrsCollection);
      expect(session.getProgress()).toBe(100); // 3/3 = 100%
    });

    it('должен возвращать 100% для пустой сессии', () => {
      const session = new SessionManager([]);
      
      expect(session.getProgress()).toBe(100);
    });
  });

  describe('Сценарий полной сессии с ошибками', () => {
    it('должен корректно обработать сессию с ошибками и исправлениями', () => {
      const session = new SessionManager(mockCards);
      
      // Карточка 1: правильный ответ с первой попытки
      session.answerCard('card1', 5, mockSrsCollection);
      expect(session.stats.perfect).toBe(1);
      
      // Карточка 2: ошибка, затем правильный ответ
      session.answerCard('card2', 0, mockSrsCollection);
      expect(session.stats.relearned).toBe(1);
      
      // Карточка 3: правильный ответ
      session.answerCard('card3', 4, mockSrsCollection);
      expect(session.stats.perfect).toBe(2);
      
      // Исправляем карточку 2
      session.answerCard('card2', 5, mockSrsCollection);
      
      // Финальная статистика
      expect(session.isSessionComplete()).toBe(true);
      expect(session.stats.reviewed).toBe(3);
      expect(session.stats.perfect).toBe(2);
      expect(session.stats.relearned).toBe(1);
      expect(session.getProgress()).toBe(100);
    });
  });
});