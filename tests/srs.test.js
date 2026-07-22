/* srs.test.js — Тесты для алгоритма интервальных повторений FSRS */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SRS } from '../srs.js';
import { Rating, State } from 'ts-fsrs';

describe('SRS Algorithm - FSRS Spaced Repetition', () => {
  let card;
  const testCardId = 'test-card-123';

  beforeEach(() => {
    vi.clearAllMocks();
    SRS.setReviewLogger(null);
    card = SRS.newCard(testCardId);
  });

  describe('newCard - Создание новой карточки', () => {
    it('должна создать карточку с корректной схемой FSRS', () => {
      expect(card.id).toBe(testCardId);
      expect(card.stability).toBe(0);
      expect(card.difficulty).toBe(0);
      expect(card.reps).toBe(0);
      expect(card.lapses).toBe(0);
      expect(card.state).toBe(State.New);
      expect(card.lastReview).toBeNull();
      expect(card.due).toBeDefined();
      expect(typeof card.due).toBe('number');
    });

    it('не должна содержать legacy-поля SM-2', () => {
      expect(card).not.toHaveProperty('ef');
      expect(card).not.toHaveProperty('interval');
    });

    it('должна установить due в текущее время', () => {
      const now = Date.now();
      const newCard = SRS.newCard('test-123');
      expect(newCard.due).toBeGreaterThanOrEqual(now - 100);
      expect(newCard.due).toBeLessThanOrEqual(now + 100);
    });
  });

  describe('Scheduler configuration', () => {
    it('включает fuzz и ограничивает интервалы одним годом', () => {
      expect(SRS.schedulerConfig.enableFuzz).toBe(true);
      expect(SRS.schedulerConfig.maximumInterval).toBe(SRS.MAX_INTERVAL);
      expect(SRS.MAX_INTERVAL).toBe(365);
    });

    it('не назначает интервал дольше максимального', () => {
      const now = Date.now();
      const matureCard = SRS.migrateSM2ToFSRS({
        id: 'mature',
        ef: 2.5,
        interval: 365,
        reps: 50,
        due: now,
        lastReview: now - 365 * SRS.DAY,
      });

      SRS.review(matureCard, SRS.Quality.Easy);
      expect(matureCard.scheduled_days).toBeLessThanOrEqual(SRS.MAX_INTERVAL);
    });
  });

  describe('review - Логика повторения с разными оценками', () => {
    describe('Again (quality=0) - Неправильный ответ', () => {
      it('должна увеличить счётчик lapses и перевести карточку в переобучение', () => {
        // Выводим карточку в состояние Review через миграцию legacy-записи
        card = SRS.migrateSM2ToFSRS({
          id: testCardId,
          ef: 2.5,
          interval: 10,
          reps: 5,
          due: Date.now(),
          lastReview: Date.now() - 10 * SRS.DAY,
        });
        expect(card.state).toBe(State.Review);
        const lapsesBefore = card.lapses;

        const now = Date.now();
        vi.setSystemTime(now);

        SRS.review(card, 0);

        expect(card.lapses).toBe(lapsesBefore + 1);
        expect(card.state).toBe(State.Relearning);
        expect(card.lastReview).toBe(now);
        // Карточка показывается снова в ближайшее время (short-term шаг)
        expect(card.due - now).toBeLessThanOrEqual(SRS.DAY);
      });

      it('должна сохранять числовую стабильность после ошибки', () => {
        SRS.review(card, 4);
        SRS.review(card, 0);
        expect(typeof card.stability).toBe('number');
        expect(card.stability).toBeGreaterThan(0);
      });

      it('помечает leech на восьмом провале, не меняя политику scheduler', () => {
        card = SRS.migrateSM2ToFSRS({
          id: testCardId,
          ef: 2.5,
          interval: 10,
          reps: 5,
          due: Date.now(),
          lastReview: Date.now() - 10 * SRS.DAY,
        });
        card.lapses = SRS.LEECH_THRESHOLD - 1;

        SRS.review(card, SRS.Quality.Again);

        expect(card.lapses).toBe(SRS.LEECH_THRESHOLD);
        expect(card.isLeech).toBe(true);
        expect(card.leechNotified).toBe(true);
        expect(SRS.schedulerConfig.maximumInterval).toBe(SRS.MAX_INTERVAL);
      });
    });

    describe('Hard (quality=3) - Сложный ответ', () => {
      it('должна сохранить запись в валидной схеме FSRS', () => {
        SRS.review(card, 3);
        expect(card.stability).toBeGreaterThan(0);
        expect(card.difficulty).toBeGreaterThanOrEqual(1);
        expect(card.difficulty).toBeLessThanOrEqual(10);
        expect(card.due).toBeGreaterThan(Date.now() - 1000);
      });

      it('сложность должна быть выше, чем при Easy', () => {
        const hardCard = SRS.newCard('hard');
        const easyCard = SRS.newCard('easy');
        SRS.review(hardCard, 3);
        SRS.review(easyCard, 5);
        expect(hardCard.difficulty).toBeGreaterThan(easyCard.difficulty);
      });
    });

    describe('Good (quality=4) - Хороший ответ', () => {
      it('должна увеличить счётчик повторений', () => {
        SRS.review(card, 4);
        expect(card.reps).toBe(1);
      });

      it('должна назначить положительную стабильность и интервал', () => {
        const now = Date.now();
        vi.setSystemTime(now);
        SRS.review(card, 4);
        expect(card.stability).toBeGreaterThan(0);
        expect(card.due).toBeGreaterThan(now);
      });

      it('интервал должен расти при повторных успешных ответах', () => {
        const now = Date.now();
        // Карточка в состоянии Review — там интервалы дневные и растут
        card = SRS.migrateSM2ToFSRS({
          id: testCardId,
          ef: 2.5,
          interval: 5,
          reps: 4,
          due: now,
          lastReview: now - 5 * SRS.DAY,
        });
        vi.setSystemTime(now);

        SRS.review(card, 4);
        const interval1 = card.scheduled_days;
        expect(interval1).toBeGreaterThan(0);

        vi.setSystemTime(card.due + 1000);
        SRS.review(card, 4);
        const interval2 = card.scheduled_days;

        expect(interval2).toBeGreaterThan(interval1);
      });
    });

    describe('Easy (quality=5) - Лёгкий ответ', () => {
      it('должна давать больший интервал, чем Good', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const goodCard = SRS.newCard('good');
        const easyCard = SRS.newCard('easy');
        SRS.review(goodCard, 4);
        SRS.review(easyCard, 5);

        expect(easyCard.due).toBeGreaterThan(goodCard.due);
      });

      it('должна снизить сложность относительно Good', () => {
        const goodCard = SRS.newCard('good');
        const easyCard = SRS.newCard('easy');
        SRS.review(goodCard, 4);
        SRS.review(easyCard, 5);
        expect(easyCard.difficulty).toBeLessThan(goodCard.difficulty);
      });

      it('должна установить корректное время due', () => {
        const now = Date.now();
        vi.setSystemTime(now);
        SRS.review(card, 5);
        expect(card.due).toBeGreaterThan(now);
      });
    });

    describe('Граничные значения difficulty', () => {
      it('difficulty остаётся в диапазоне [1, 10] при любой последовательности оценок', () => {
        const qualities = [0, 3, 4, 5];
        for (let i = 0; i < 50; i++) {
          const quality = qualities[Math.floor(Math.random() * qualities.length)];
          SRS.review(card, quality);
          expect(card.difficulty).toBeGreaterThanOrEqual(1);
          expect(card.difficulty).toBeLessThanOrEqual(10);
          expect(card.stability).toBeGreaterThan(0);
        }
      });
    });

    describe('Маппинг рейтингов', () => {
      it('экспортирует Rating с корректными значениями', () => {
        expect(SRS.Rating.Again).toBe(1);
        expect(SRS.Rating.Hard).toBe(2);
        expect(SRS.Rating.Good).toBe(3);
        expect(SRS.Rating.Easy).toBe(4);
      });

      it.each([
        [SRS.Quality.Again, Rating.Again],
        [SRS.Quality.Hard, Rating.Hard],
        [SRS.Quality.Good, Rating.Good],
        [SRS.Quality.Easy, Rating.Easy],
      ])('явно преобразует quality=%i в Rating=%i', (quality, rating) => {
        expect(SRS.mapQualityToFSRS(quality)).toBe(rating);
      });

      it('не принимает однозначно чужие значения шкалы Rating', () => {
        expect(() => SRS.review(card, Rating.Again)).toThrow();
        expect(() => SRS.review(card, Rating.Hard)).toThrow();
      });

      it('выбрасывает ошибку на некорректной оценке', () => {
        expect(() => SRS.review(card, 99)).toThrow();
        expect(() => SRS.review(card, '4')).toThrow();
      });
    });

    describe('Автоматическая оценка упражнений', () => {
      it('назначает Good за правильный ответ без ошибок', () => {
        expect(SRS.qualityFromMistakes(0)).toBe(SRS.Quality.Good);
      });

      it('назначает Hard после одной ошибки и Again после двух', () => {
        expect(SRS.qualityFromMistakes(1)).toBe(SRS.Quality.Hard);
        expect(SRS.qualityFromMistakes(2)).toBe(SRS.Quality.Again);
      });

      it.each([
        [0, SRS.Quality.Easy],
        [1, SRS.Quality.Good],
        [2, SRS.Quality.Good],
        [3, SRS.Quality.Hard],
        [5, SRS.Quality.Hard],
        [6, SRS.Quality.Again],
      ])('оценивает рисование с %i ошибками как quality=%i', (mistakes, quality) => {
        expect(SRS.qualityFromDrawingMistakes(mistakes)).toBe(quality);
      });

      it('назначает Easy только за идеальное рисование', () => {
        expect(SRS.qualityFromMistakes(0)).not.toBe(SRS.Quality.Easy);
        expect(SRS.qualityFromDrawingMistakes(0)).toBe(SRS.Quality.Easy);
        expect(SRS.qualityFromDrawingMistakes(1)).not.toBe(SRS.Quality.Easy);
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

    describe('Review log', () => {
      it('передаёт логгеру состояние карточки до review', () => {
        const now = 1_750_000_000_000;
        vi.setSystemTime(now);
        const logger = vi.fn();
        SRS.setReviewLogger(logger);

        const previous = {
          stability: card.stability,
          difficulty: card.difficulty,
          state: card.state,
        };

        SRS.review(card, SRS.Quality.Good, {
          mode: 'typing',
          responseTimeMs: 1234.4,
        });

        expect(logger).toHaveBeenCalledTimes(1);
        expect(logger).toHaveBeenCalledWith({
          cardId: testCardId,
          quality: SRS.Quality.Good,
          mode: 'typing',
          responseTimeMs: 1234,
          timestamp: now,
          previousStability: previous.stability,
          previousDifficulty: previous.difficulty,
          previousState: previous.state,
        });
        expect(card.stability).not.toBe(previous.stability);
        expect(card.difficulty).not.toBe(previous.difficulty);
        expect(card.state).not.toBe(previous.state);
      });

      it('не создаёт запись при отклонённом quality', () => {
        const logger = vi.fn();
        SRS.setReviewLogger(logger);

        expect(() => SRS.review(card, 99, { mode: 'typing', responseTimeMs: 100 })).toThrow();
        expect(logger).not.toHaveBeenCalled();
      });

      it('не прерывает FSRS review при синхронной ошибке хранилища', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        SRS.setReviewLogger(() => {
          throw new Error('IndexedDB недоступна');
        });

        expect(() =>
          SRS.review(card, SRS.Quality.Good, { mode: 'typing', responseTimeMs: 500 })
        ).not.toThrow();
        expect(card.reps).toBe(1);
        expect(warn).toHaveBeenCalledWith(
          '[SRS] Не удалось сохранить review log:',
          expect.any(Error)
        );
      });
    });
  });

  describe('migrateSM2ToFSRS - Миграция legacy-карточек', () => {
    it('должна конвертировать SM-2 запись в схему FSRS', () => {
      const legacy = {
        id: 'L1_w1',
        ef: 2.5,
        interval: 6,
        reps: 2,
        due: 1700000000000,
        lastReview: 1699990000000,
      };
      const migrated = SRS.migrateSM2ToFSRS(legacy);

      expect(typeof migrated.stability).toBe('number');
      expect(migrated.stability).toBeGreaterThan(0);
      expect(migrated.difficulty).toBeGreaterThanOrEqual(1);
      expect(migrated.difficulty).toBeLessThanOrEqual(10);
      expect(migrated.state).toBe(State.Review);
      expect(migrated).not.toHaveProperty('ef');
      expect(migrated).not.toHaveProperty('interval');
    });

    it('НЕ должна перезаписывать абсолютный timestamp due', () => {
      const originalDue = 1700000000000;
      const legacy = {
        id: 'L1_w2',
        ef: 2.0,
        interval: 15,
        reps: 5,
        due: originalDue,
        lastReview: 1699000000000,
      };
      const migrated = SRS.migrateSM2ToFSRS(legacy);
      expect(migrated.due).toBe(originalDue);
      expect(migrated.lastReview).toBe(1699000000000);
    });

    it('высокий EF (лёгкая карточка) → низкая difficulty', () => {
      const easy = SRS.migrateSM2ToFSRS({ id: 'a', ef: 2.5, interval: 10, reps: 3, due: 1 });
      const hard = SRS.migrateSM2ToFSRS({ id: 'b', ef: 1.3, interval: 10, reps: 3, due: 1 });
      expect(easy.difficulty).toBeLessThan(hard.difficulty);
    });

    it('новая карточка (reps=0) получает state New и stability 0', () => {
      const migrated = SRS.migrateSM2ToFSRS({ id: 'n', ef: 2.5, interval: 0, reps: 0, due: 1 });
      expect(migrated.state).toBe(State.New);
      expect(migrated.stability).toBe(0);
    });

    it('идемпотентна: FSRS-карточка возвращается без изменений', () => {
      const fsrsCard = SRS.newCard('fsrs');
      SRS.review(fsrsCard, 4);
      const snapshot = { ...fsrsCard };
      const result = SRS.migrateSM2ToFSRS(fsrsCard);
      expect(result).toEqual(snapshot);
    });

    it('мигрированная карточка проходит полный цикл review без ошибок', () => {
      const legacy = {
        id: 'L2_w5',
        ef: 2.2,
        interval: 30,
        reps: 6,
        due: Date.now() - 1000,
        lastReview: Date.now() - 30 * SRS.DAY,
      };
      const migrated = SRS.migrateSM2ToFSRS(legacy);
      expect(() => SRS.review(migrated, 4)).not.toThrow();
      expect(migrated.due).toBeGreaterThan(Date.now());
    });
  });

  describe('isDue - Проверка необходимости повторения', () => {
    it('должна вернуть true, если карточка готова к повторению', () => {
      const now = Date.now();
      card.due = now - 1000;
      expect(SRS.isDue(card, now)).toBe(true);
    });

    it('должна вернуть false, если карточка ещё не готова', () => {
      const now = Date.now();
      card.due = now + 10000;
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
      // Стартуем из состояния Review — проверяем динамику стабильности
      card = SRS.migrateSM2ToFSRS({
        id: testCardId,
        ef: 2.5,
        interval: 5,
        reps: 4,
        due: now,
        lastReview: now - 5 * SRS.DAY,
      });
      vi.setSystemTime(now);

      const repsBefore = card.reps;
      SRS.review(card, 4);
      expect(card.reps).toBe(repsBefore + 1);
      expect(card.stability).toBeGreaterThan(0);

      vi.setSystemTime(card.due + 1000);
      SRS.review(card, 4);
      expect(card.reps).toBe(repsBefore + 2);

      vi.setSystemTime(card.due + 1000);
      const stabilityBefore = card.stability;
      SRS.review(card, 4);
      expect(card.reps).toBe(repsBefore + 3);
      expect(card.stability).toBeGreaterThan(stabilityBefore);
      expect(card.state).toBe(State.Review);
    });

    it('должна корректно обработать ошибку после прогресса', () => {
      card = SRS.migrateSM2ToFSRS({
        id: testCardId,
        ef: 2.5,
        interval: 10,
        reps: 5,
        due: Date.now(),
        lastReview: Date.now() - 10 * SRS.DAY,
      });
      const lapsesBefore = card.lapses;

      SRS.review(card, 0);
      expect(card.lapses).toBe(lapsesBefore + 1);

      // Карточка остаётся рабочей после переобучения
      expect(() => SRS.review(card, 4)).not.toThrow();
    });

    it('должна корректно обработать смешанные оценки', () => {
      SRS.review(card, 4);
      SRS.review(card, 3);
      SRS.review(card, 5);
      expect(card.reps).toBe(3);
      expect(card.difficulty).toBeGreaterThanOrEqual(1);
      expect(card.difficulty).toBeLessThanOrEqual(10);
      expect(card.stability).toBeGreaterThan(0);
    });
  });

  describe('Константы', () => {
    it('DAY должна быть равна 86400000 миллисекунд (24 часа)', () => {
      expect(SRS.DAY).toBe(86400000);
      expect(SRS.DAY).toBe(24 * 60 * 60 * 1000);
    });
  });
});
