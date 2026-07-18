import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  XP_PER_LEVEL,
  COINS_PER_LEVEL,
  addXP,
  getUserRankData,
  xpToNextLevel,
} from '../src/xp-system.js';

describe('App - XP and Level System', () => {
  let state;
  let levelUpCallbacks;

  beforeEach(() => {
    state = {
      level: 1,
      xp: 0,
      coins: 0,
    };
    levelUpCallbacks = [];
  });

  function testAddXP(amount) {
    addXP(amount, state, {
      onLevelUp: (level) => levelUpCallbacks.forEach(cb => cb(level)),
    });
  }

  describe('addXP', () => {
    it('должен добавлять XP к текущему значению', () => {
      testAddXP(50);
      expect(state.xp).toBe(50);
    });

    it('должен повышать уровень при достижении XP_PER_LEVEL', () => {
      testAddXP(100);
      expect(state.level).toBe(2);
      expect(state.xp).toBe(0);
    });

    it('должен добавлять монеты при повышении уровня', () => {
      testAddXP(100);
      expect(state.coins).toBe(COINS_PER_LEVEL);
    });

    it('должен переносить остаток XP на следующий уровень', () => {
      testAddXP(150);
      expect(state.level).toBe(2);
      expect(state.xp).toBe(50);
    });

    it('должен повышать несколько уровней за раз', () => {
      testAddXP(350);
      expect(state.level).toBe(4); // 1 + 3 уровня
      expect(state.xp).toBe(50); // Остаток от 350
      expect(state.coins).toBe(COINS_PER_LEVEL * 3);
    });

    it('должен корректно работать с дробными значениями XP', () => {
      testAddXP(99.5);
      expect(state.level).toBe(1);
      expect(state.xp).toBe(99.5);

      testAddXP(0.5);
      expect(state.level).toBe(2);
      expect(state.xp).toBe(0);
    });

    it('должен вызывать колбэки при повышении уровня', () => {
      const levelUpSpy = vi.fn();
      levelUpCallbacks.push(levelUpSpy);

      testAddXP(250); // Должно быть 2 повышения уровня

      expect(levelUpSpy).toHaveBeenCalledTimes(2);
      expect(levelUpSpy).toHaveBeenNthCalledWith(1, 2);
      expect(levelUpSpy).toHaveBeenNthCalledWith(2, 3);
    });

    it('должен корректно работать при добавлении малого количества XP', () => {
      for (let i = 0; i < 100; i++) {
        testAddXP(1);
      }
      expect(state.level).toBe(2);
      expect(state.xp).toBe(0);
    });
  });

  describe('XP прогрессия', () => {
    it('должен правильно рассчитывать процент прогресса к следующему уровню', () => {
      const calculateProgressPercent = (xp) => Math.min((xp / XP_PER_LEVEL) * 100, 100);

      state.xp = 0;
      expect(calculateProgressPercent(state.xp)).toBe(0);

      state.xp = 50;
      expect(calculateProgressPercent(state.xp)).toBe(50);

      state.xp = 100;
      expect(calculateProgressPercent(state.xp)).toBe(100);
    });

    it('должен рассчитывать сколько XP нужно до следующего уровня', () => {
      state.xp = 0;
      expect(xpToNextLevel(state.xp)).toBe(100);

      state.xp = 75;
      expect(xpToNextLevel(state.xp)).toBe(25);

      state.xp = 99;
      expect(xpToNextLevel(state.xp)).toBe(1);
    });
  });
});

describe('App - Rank System', () => {
  describe('getUserRankData', () => {
    it('должен возвращать Альфа лигу для уровней 1-24', () => {
      const rank1 = getUserRankData(1);
      expect(rank1.leagueName).toBe('Альфа');
      expect(rank1.icon).toBe('alpha_01.png');

      const rank24 = getUserRankData(24);
      expect(rank24.leagueName).toBe('Альфа');
      expect(rank24.icon).toBe('alpha_12.png');
    });

    it('должен возвращать Бета лигу для уровней 25-48', () => {
      const rank25 = getUserRankData(25);
      expect(rank25.leagueName).toBe('Бета');
      expect(rank25.icon).toBe('beta_01.png');

      const rank48 = getUserRankData(48);
      expect(rank48.leagueName).toBe('Бета');
      expect(rank48.icon).toBe('beta_12.png');
    });

    it('должен возвращать Гамма лигу для уровней 49-72', () => {
      const rank49 = getUserRankData(49);
      expect(rank49.leagueName).toBe('Гамма');
      expect(rank49.icon).toBe('gamma_01.png');

      const rank72 = getUserRankData(72);
      expect(rank72.leagueName).toBe('Гамма');
      expect(rank72.icon).toBe('gamma_12.png');
    });

    it('должен возвращать Дельта лигу для уровней 73-96', () => {
      const rank73 = getUserRankData(73);
      expect(rank73.leagueName).toBe('Дельта Мастер');
      expect(rank73.icon).toBe('delta_01.png');

      const rank96 = getUserRankData(96);
      expect(rank96.leagueName).toBe('Дельта Мастер');
      expect(rank96.icon).toBe('delta_12.png');
    });

    it('должен правильно рассчитывать номер ранга (каждые 2 уровня)', () => {
      expect(getUserRankData(1).icon).toBe('alpha_01.png');
      expect(getUserRankData(2).icon).toBe('alpha_01.png');
      expect(getUserRankData(3).icon).toBe('alpha_02.png');
      expect(getUserRankData(4).icon).toBe('alpha_02.png');
      expect(getUserRankData(5).icon).toBe('alpha_03.png');
    });

    it('должен ограничивать максимальный уровень 96', () => {
      const rank100 = getUserRankData(100);
      const rank96 = getUserRankData(96);

      expect(rank100).toEqual(rank96);
      expect(rank100.leagueName).toBe('Дельта Мастер');
      expect(rank100.icon).toBe('delta_12.png');
    });

    it('должен ограничивать минимальный уровень 1', () => {
      const rank0 = getUserRankData(0);
      const rank1 = getUserRankData(1);

      expect(rank0).toEqual(rank1);
      expect(rank0.leagueName).toBe('Альфа');
      expect(rank0.icon).toBe('alpha_01.png');
    });

    it('должен возвращать правильное полное имя', () => {
      const rank1 = getUserRankData(1);
      expect(rank1.name).toBe('Альфа — Ранг 1');

      const rank25 = getUserRankData(25);
      expect(rank25.name).toBe('Бета — Ранг 1');

      const rank50 = getUserRankData(50);
      expect(rank50.name).toBe('Гамма — Ранг 1');

      const rank73 = getUserRankData(73);
      expect(rank73.name).toBe('Дельта Мастер — Ранг 1');
    });

    it('должен добавлять ведущий ноль к номеру ранга', () => {
      const rank1 = getUserRankData(1);
      expect(rank1.icon).toContain('_01.png');

      const rank23 = getUserRankData(23);
      expect(rank23.icon).toContain('_12.png'); // 12-й ранг, не нужен ведущий ноль
    });
  });

  describe('Прогрессия рангов', () => {
    it('должен проходить все ранги Альфа лиги (1-12)', () => {
      for (let rank = 1; rank <= 12; rank++) {
        const level = (rank - 1) * 2 + 1;
        const rankData = getUserRankData(level);
        expect(rankData.leagueName).toBe('Альфа');
        expect(rankData.levelSuffix).toBe(`Ранг ${rank}`);
      }
    });

    it('должен проходить все 4 лиги последовательно', () => {
      const leagues = ['Альфа', 'Бета', 'Гамма', 'Дельта Мастер'];
      const leagueBoundaries = [1, 25, 49, 73];

      leagueBoundaries.forEach((startLevel, index) => {
        const rankData = getUserRankData(startLevel);
        expect(rankData.leagueName).toBe(leagues[index]);
      });
    });

    it('должен иметь 12 рангов в каждой лиге', () => {
      const leagues = [
        { name: 'alpha', start: 1, end: 24 },
        { name: 'beta', start: 25, end: 48 },
        { name: 'gamma', start: 49, end: 72 },
        { name: 'delta', start: 73, end: 96 },
      ];

      leagues.forEach(league => {
        const ranksInLeague = new Set();
        for (let level = league.start; level <= league.end; level++) {
          const rankData = getUserRankData(level);
          ranksInLeague.add(rankData.icon);
        }
        expect(ranksInLeague.size).toBe(12);
      });
    });
  });
});

describe('App - XP константы', () => {
  it('должен иметь корректные значения констант', () => {
    expect(XP_PER_LEVEL).toBe(100);
    expect(COINS_PER_LEVEL).toBe(50);
  });

  it('константы должны быть положительными числами', () => {
    expect(XP_PER_LEVEL).toBeGreaterThan(0);
    expect(COINS_PER_LEVEL).toBeGreaterThan(0);
  });
});

describe('Интеграционные сценарии', () => {
  it('должен корректно обрабатывать прогрессию от уровня 1 до 10', () => {
    const state = { level: 1, xp: 0, coins: 0 };

    // Симулируем накопление 900 XP
    addXP(900, state);

    expect(state.level).toBe(10);
    expect(state.xp).toBe(0);
    expect(state.coins).toBe(450); // 9 уровней × 50 монет
  });

  it('должен менять ранг при повышении уровня через границу лиги', () => {
    const rank24 = getUserRankData(24);
    expect(rank24.leagueName).toBe('Альфа');

    const rank25 = getUserRankData(25);
    expect(rank25.leagueName).toBe('Бета');
    expect(rank25.icon).toBe('beta_01.png'); // Начинается с ранга 1
  });

  it('должен обрабатывать типичный игровой цикл: XP → уровни → ранги → монеты', () => {
    const state = { level: 1, xp: 0, coins: 0 };

    // Игрок получает XP за задания
    addXP(50, state); // За карточки
    expect(state.xp).toBe(50);

    addXP(50, state); // Ещё задания
    expect(state.level).toBe(2);
    expect(state.coins).toBe(50);

    // Много активности
    addXP(2300, state); // 23 уровня
    expect(state.level).toBe(25); // Переход в Бета
    expect(state.coins).toBe(1200); // 24 × 50

    const rank = getUserRankData(state.level);
    expect(rank.leagueName).toBe('Бета');
  });
});
