/* srs.test.js — Тесты для алгоритма интервальных повторений SM-2 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SRS } from '../srs.js';

describe('SRS Algorithm - SM-2 Spaced Repetition', () => {
  let card;
  const testCardId = 'test-card-123';

  beforeEach(() => {
    // Очищаем все моки и создаём свежую карточку перед каждым тестом
    vi.clearAllMocks();
    card = SRS.newCard(testCardId);
  });

  describe('newCard - Создание новой карточки', () => {
    it('должна создать карточку с корректными начальными значениями', () => {
      expect(card.id).toBe(testCardId);
      expect(card.ef).toBe(2.5);
      expect(card.interval).toBe(0);
      expect(card.reps).toBe(0);
      expect(card.lastReview).toBeNull();
      expect(card.due).toBeDefined();
      expect(typeof card.due).toBe('number');
    });

    it('должна установить due в текущее время', () => {
      const now = Date.now();
      const newCard = SRS.newCard('test-123');
      expect(newCard.due).toBeGreaterThanOrEqual(now - 100);
      expect(newCard.due).toBeLessThanOrEqual(now + 100);
    });
  });

  describe('review - Логика повторения с разными оценками', () => {
    describe('Again (quality=0) - Неправильный ответ', () => {
      it('должна сбросить прогресс и показать карточку немедленно', () => {
        // Сначала делаем несколько правильных ответов
        card.reps = 3;
        card.interval = 15;
        card.ef = 2.3;

        const now = Date.now();
        vi.setSystemTime(now);

        SRS.review(card, 0);

        expect(card.reps).toBe(0);
        expect(card.interval).toBe(0);
        expect(card.due).toBe(now);
        expect(card.lastReview).toBe(now);
      });

      it('не должна изменять EF при неправильном ответе', () => {
        const originalEF = card.ef;
        SRS.review(card, 0);
        expect(card.ef).toBe(originalEF);
      });
    });

    describe('Hard (quality=3) - Сложный ответ', () => {
      it('должна увеличить интервал на первом повторении', () => {
        SRS.review(card, 3);
        expect(card.reps).toBe(1);
        expect(card.interval).toBe(1);
      });

      it('должна установить интервал 6 дней на втором повторении', () => {
        SRS.review(card, 3);
        SRS.review(card, 3);
        expect(card.reps).toBe(2);
        expect(card.interval).toBe(6);
      });

      it('должна уменьшить EF при сложном ответе', () => {
        const originalEF = card.ef;
        SRS.review(card, 3);
        expect(card.ef).toBeLessThan(originalEF);
      });

      it('должна установить корректную дату следующего повторения', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        SRS.review(card, 3);
        const expectedDue = now + 1 * SRS.DAY;
        expect(card.due).toBe(expectedDue);
      });
    });

    describe('Good (quality=4) - Хороший ответ', () => {
      it('должна увеличить счётчик повторений', () => {
        SRS.review(card, 4);
        expect(card.reps).toBe(1);
      });

      it('должна установить интервал 1 день при первом повторении', () => {
        SRS.review(card, 4);
        expect(card.interval).toBe(1);
      });

      it('должна установить интервал 6 дней при втором повторении', () => {
        SRS.review(card, 4);
        SRS.review(card, 4);
        expect(card.interval).toBe(6);
      });

      it('должна умножать интервал на EF после второго повторения', () => {
        SRS.review(card, 4); // reps=1, interval=1
        SRS.review(card, 4); // reps=2, interval=6
        const efBeforeThird = card.ef;
        SRS.review(card, 4); // reps=3, interval=6*EF

        const expectedInterval = Math.round(6 * efBeforeThird);
        expect(card.interval).toBe(expectedInterval);
      });

      it('должна слегка увеличить EF при хорошем ответе', () => {
        const originalEF = card.ef;
        SRS.review(card, 4);
        expect(card.ef).toBeGreaterThanOrEqual(originalEF - 0.01);
      });
    });

    describe('Easy (quality=5) - Лёгкий ответ', () => {
      it('должна максимально увеличить EF', () => {
        const originalEF = card.ef;
        SRS.review(card, 5);
        expect(card.ef).toBeGreaterThanOrEqual(originalEF);
      });

      it('должна увеличить интервал при лёгком ответе', () => {
        SRS.review(card, 5);
        SRS.review(card, 5);
        SRS.review(card, 5);
        expect(card.interval).toBeGreaterThan(6);
      });

      it('должна установить корректное время due', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        SRS.review(card, 5);
        expect(card.due).toBeGreaterThan(now);
      });
    });

    describe('Граничные проверки EF', () => {
      it('должна ограничивать EF минимальным значением 1.3', () => {
        // Делаем много сложных ответов, чтобы снизить EF
        for (let i = 0; i < 20; i++) {
          SRS.review(card, 3);
        }
        expect(card.ef).toBeGreaterThanOrEqual(1.3);
      });

      it('должна ограничивать EF максимальным значением 2.5', () => {
        // Делаем много лёгких ответов, чтобы повысить EF
        for (let i = 0; i < 20; i++) {
          SRS.review(card, 5);
        }
        expect(card.ef).toBeLessThanOrEqual(2.5);
      });

      it('должна сохранять EF в пределах [1.3, 2.5] при любой оценке', () => {
        const qualities = [0, 3, 4, 5];
        for (let i = 0; i < 50; i++) {
          const quality = qualities[Math.floor(Math.random() * qualities.length)];
          SRS.review(card, quality);
          expect(card.ef).toBeGreaterThanOrEqual(1.3);
          expect(card.ef).toBeLessThanOrEqual(2.5);
        }
      });
    });

    describe('Обновление lastReview', () => {
      it('должна обновить lastReview при каждом повторении', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        SRS.review(card, 4);
        expect(card.lastReview).toBe(now);

        const later = now + 10000;
        vi.setSystemTime(later);

        SRS.review(card, 4);
        expect(card.lastReview).toBe(later);
      });
    });
  });

  describe('isDue - Проверка необходимости повторения', () => {
    it('должна вернуть true, если карточка готова к повторению', () => {
      const now = Date.now();
      card.due = now - 1000; // Карточка просрочена на 1 секунду
      expect(SRS.isDue(card, now)).toBe(true);
    });

    it('должна вернуть false, если карточка ещё не готова', () => {
      const now = Date.now();
      card.due = now + 10000; // Карточка будет готова через 10 секунд
      expect(SRS.isDue(card, now)).toBe(false);
    });

    it('должна вернуть true, если время due точно совпадает', () => {
      const now = Date.now();
      card.due = now;
      expect(SRS.isDue(card, now)).toBe(true);
    });

    it('должна использовать текущее время, если ref не передан', () => {
      const now = Date.now();
      card.due = now - 1000;
      expect(SRS.isDue(card)).toBe(true);
    });
  });

  describe('Интеграционные тесты - Полный цикл повторений', () => {
    it('должна корректно обработать последовательность: Good -> Good -> Good', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      SRS.review(card, 4); // reps=1, interval=1
      expect(card.reps).toBe(1);
      expect(card.interval).toBe(1);
      expect(card.due).toBe(now + 1 * SRS.DAY);

      vi.setSystemTime(now + 1 * SRS.DAY);
      SRS.review(card, 4); // reps=2, interval=6
      expect(card.reps).toBe(2);
      expect(card.interval).toBe(6);

      vi.setSystemTime(now + 7 * SRS.DAY);
      const efBeforeThird = card.ef;
      SRS.review(card, 4); // reps=3, interval=6*EF
      expect(card.reps).toBe(3);
      expect(card.interval).toBe(Math.round(6 * efBeforeThird));
    });

    it('должна корректно обработать сброс после ошибки', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // Делаем прогресс
      SRS.review(card, 4);
      SRS.review(card, 4);
      expect(card.reps).toBe(2);

      // Ошибка - сброс прогресса
      SRS.review(card, 0);
      expect(card.reps).toBe(0);
      expect(card.interval).toBe(0);
      expect(card.due).toBe(now);

      // Начинаем заново
      SRS.review(card, 4);
      expect(card.reps).toBe(1);
      expect(card.interval).toBe(1);
    });

    it('должна корректно обработать смешанные оценки', () => {
      SRS.review(card, 4); // Good
      expect(card.reps).toBe(1);

      SRS.review(card, 3); // Hard
      expect(card.reps).toBe(2);

      SRS.review(card, 5); // Easy
      expect(card.reps).toBe(3);

      // EF должен остаться в пределах нормы
      expect(card.ef).toBeGreaterThanOrEqual(1.3);
      expect(card.ef).toBeLessThanOrEqual(2.5);
    });
  });

  describe('Константы', () => {
    it('DAY должна быть равна 86400000 миллисекунд (24 часа)', () => {
      expect(SRS.DAY).toBe(86400000);
      expect(SRS.DAY).toBe(24 * 60 * 60 * 1000);
    });
  });
});