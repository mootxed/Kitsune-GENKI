import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ACHIEVEMENTS, AchievementSystem } from '../achievements.js';

describe('AchievementSystem', () => {
  let mockState;

  beforeEach(() => {
    // Базовое состояние для тестирования
    mockState = {
      level: 1,
      xp: 0,
      coins: 0,
      dailyCards: 0,
      streak: { count: 0, lastDate: null },
      history: {},
      chapters: {},
      unlockedAchievements: [],
      quests: {
        daily: [],
        completedDaily: 0,
      },
    };
  });

  describe('ACHIEVEMENTS константа', () => {
    it('должен содержать массив достижений', () => {
      expect(Array.isArray(ACHIEVEMENTS)).toBe(true);
      expect(ACHIEVEMENTS.length).toBeGreaterThan(0);
    });

    it('каждое достижение должно иметь обязательные поля', () => {
      ACHIEVEMENTS.forEach((ach) => {
        expect(ach.id).toBeDefined();
        expect(typeof ach.id).toBe('string');
        expect(ach.emoji).toBeDefined();
        expect(ach.title).toBeDefined();
        expect(ach.desc).toBeDefined();
        expect(typeof ach.check).toBe('function');
        expect(ach.rewards).toBeDefined();
        expect(ach.rewards.xp).toBeGreaterThan(0);
        expect(ach.rewards.coins).toBeGreaterThan(0);
      });
    });

    it('все ID достижений должны быть уникальными', () => {
      const ids = ACHIEVEMENTS.map((ach) => ach.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('getAll', () => {
    it('должен вернуть все достижения', () => {
      const all = AchievementSystem.getAll();
      expect(all).toEqual(ACHIEVEMENTS);
      expect(all.length).toBe(ACHIEVEMENTS.length);
    });
  });

  describe('checkAll - Стартовые достижения', () => {
    it('должен разблокировать "Первый шаг" при начале главы', () => {
      mockState.chapters = {
        1: { checklist: {} },
      };

      const newUnlocks = AchievementSystem.checkAll(mockState);

      expect(newUnlocks.some((a) => a.id === 'first_step')).toBe(true);
      expect(mockState.unlockedAchievements).toContain('first_step');
    });

    it('должен разблокировать "Первая карточка" при повторении карточки', () => {
      mockState.dailyCards = 1;

      const newUnlocks = AchievementSystem.checkAll(mockState);

      expect(newUnlocks.some((a) => a.id === 'first_card')).toBe(true);
      expect(mockState.unlockedAchievements).toContain('first_card');
    });

    it('должен разблокировать "День первый" при начале стрика', () => {
      mockState.streak.count = 1;

      const newUnlocks = AchievementSystem.checkAll(mockState);

      expect(newUnlocks.some((a) => a.id === 'first_streak')).toBe(true);
      expect(mockState.unlockedAchievements).toContain('first_streak');
    });
  });

  describe('checkAll - Стрик достижения', () => {
    it('должен разблокировать достижения за стрики', () => {
      const streakTests = [
        { count: 3, id: 'streak_3' },
        { count: 7, id: 'streak_7' },
        { count: 30, id: 'streak_30' },
        { count: 100, id: 'streak_100' },
      ];

      streakTests.forEach((test) => {
        const state = { ...mockState, streak: { count: test.count }, unlockedAchievements: [] };
        const newUnlocks = AchievementSystem.checkAll(state);

        expect(state.unlockedAchievements).toContain(test.id);
      });
    });

    it('должен разблокировать все достижения стрика при большом стрике', () => {
      mockState.streak.count = 100;

      AchievementSystem.checkAll(mockState);

      expect(mockState.unlockedAchievements).toContain('first_streak');
      expect(mockState.unlockedAchievements).toContain('streak_3');
      expect(mockState.unlockedAchievements).toContain('streak_7');
      expect(mockState.unlockedAchievements).toContain('streak_30');
      expect(mockState.unlockedAchievements).toContain('streak_100');
    });
  });

  describe('checkAll - XP и уровни', () => {
    it('должен разблокировать достижения за уровни', () => {
      const levelTests = [
        { level: 5, id: 'level_5' },
        { level: 10, id: 'level_10' },
        { level: 20, id: 'level_20' },
      ];

      levelTests.forEach((test) => {
        const state = { ...mockState, level: test.level, unlockedAchievements: [] };
        AchievementSystem.checkAll(state);

        expect(state.unlockedAchievements).toContain(test.id);
      });
    });
  });

  describe('checkAll - SRS достижения', () => {
    it('должен разблокировать достижения за ежедневные карточки', () => {
      const cardTests = [
        { cards: 10, id: 'cards_10' },
        { cards: 50, id: 'cards_50' },
        { cards: 100, id: 'cards_100' },
      ];

      cardTests.forEach((test) => {
        const state = { ...mockState, dailyCards: test.cards, unlockedAchievements: [] };
        AchievementSystem.checkAll(state);

        expect(state.unlockedAchievements).toContain(test.id);
      });
    });

    it('должен разблокировать достижение за 500 повторений всего', () => {
      mockState.history = {
        '2026-01-01': 100,
        '2026-01-02': 150,
        '2026-01-03': 250,
      };

      AchievementSystem.checkAll(mockState);

      expect(mockState.unlockedAchievements).toContain('total_500');
    });
  });

  describe('checkAll - Прогресс глав', () => {
    it('должен разблокировать достижение за завершение главы 1', () => {
      mockState.chapters = {
        1: {
          checklist: {
            vocab: true,
            grammar: true,
            kanji: true,
          },
        },
      };

      AchievementSystem.checkAll(mockState);

      expect(mockState.unlockedAchievements).toContain('ch_1');
    });

    it('НЕ должен разблокировать если глава не полностью завершена', () => {
      mockState.chapters = {
        1: {
          checklist: {
            vocab: true,
            grammar: false, // Не завершена грамматика
            kanji: true,
          },
        },
      };

      AchievementSystem.checkAll(mockState);

      expect(mockState.unlockedAchievements).not.toContain('ch_1');
    });

    it('должен разблокировать достижение за 5 глав', () => {
      // Создаём 5 завершённых глав
      mockState.chapters = {};
      for (let i = 1; i <= 5; i++) {
        mockState.chapters[i] = {
          checklist: { vocab: true, grammar: true, kanji: true },
        };
      }

      AchievementSystem.checkAll(mockState);

      expect(mockState.unlockedAchievements).toContain('ch_5');
    });

    it('должен разблокировать достижение за все 12 глав', () => {
      // Создаём все 12 завершённых глав
      mockState.chapters = {};
      for (let i = 1; i <= 12; i++) {
        mockState.chapters[i] = {
          checklist: { vocab: true, grammar: true, kanji: true },
        };
      }

      AchievementSystem.checkAll(mockState);

      expect(mockState.unlockedAchievements).toContain('ch_12');
    });
  });

  describe('checkAll - Монеты', () => {
    it('должен разблокировать достижения за накопление монет', () => {
      const coinTests = [
        { coins: 100, id: 'coins_100' },
        { coins: 500, id: 'coins_500' },
        { coins: 1000, id: 'coins_1000' },
      ];

      coinTests.forEach((test) => {
        const state = { ...mockState, coins: test.coins, unlockedAchievements: [] };
        AchievementSystem.checkAll(state);

        expect(state.unlockedAchievements).toContain(test.id);
      });
    });
  });

  describe('checkAll - Квесты', () => {
    it('должен разблокировать достижение за первый квест', () => {
      mockState.quests = {
        daily: [{ id: 'quest1', completed: true }],
        completedDaily: 1,
      };

      AchievementSystem.checkAll(mockState);

      expect(mockState.unlockedAchievements).toContain('quest_1');
    });

    it('должен разблокировать достижение за 10 ежедневных квестов', () => {
      mockState.quests = {
        daily: [],
        completedDaily: 10,
      };

      AchievementSystem.checkAll(mockState);

      expect(mockState.unlockedAchievements).toContain('quest_daily_10');
    });
  });

  describe('checkAll - Специальные достижения', () => {
    it('должен разблокировать "Ранняя пташка" если флаг установлен', () => {
      mockState._earlyBirdUnlocked = true;

      AchievementSystem.checkAll(mockState);

      expect(mockState.unlockedAchievements).toContain('early_bird');
    });

    it('должен разблокировать "Полуночник" при занятиях после полуночи', () => {
      // Мокаем время между 00:00 и 05:00
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T02:00:00'));

      AchievementSystem.checkAll(mockState);

      expect(mockState.unlockedAchievements).toContain('night_owl');

      vi.useRealTimers();
    });

    it('НЕ должен разблокировать "Полуночник" днём', () => {
      // Мокаем дневное время
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T14:00:00'));

      AchievementSystem.checkAll(mockState);

      expect(mockState.unlockedAchievements).not.toContain('night_owl');

      vi.useRealTimers();
    });
  });

  describe('checkAll - Предотвращение дублирования', () => {
    it('НЕ должен дублировать разблокированные достижения', () => {
      mockState.dailyCards = 10;
      mockState.unlockedAchievements = ['first_card']; // Уже разблокировано

      const firstCheck = AchievementSystem.checkAll(mockState);

      // cards_10 должно разблокироваться, но first_card не должно дублироваться
      expect(firstCheck.some((a) => a.id === 'cards_10')).toBe(true);
      expect(firstCheck.some((a) => a.id === 'first_card')).toBe(false);

      // Проверяем что в массиве нет дубликатов
      const uniqueAchievements = new Set(mockState.unlockedAchievements);
      expect(uniqueAchievements.size).toBe(mockState.unlockedAchievements.length);
    });

    it('должен возвращать только новые разблокировки', () => {
      mockState.level = 10;
      mockState.unlockedAchievements = ['level_5']; // Уже было

      const newUnlocks = AchievementSystem.checkAll(mockState);

      // Должно вернуть только level_10, level_5 уже было
      expect(newUnlocks.some((a) => a.id === 'level_10')).toBe(true);
      expect(newUnlocks.some((a) => a.id === 'level_5')).toBe(false);
    });

    it('должен корректно работать при повторных вызовах', () => {
      mockState.dailyCards = 1;

      // Первый вызов
      let newUnlocks = AchievementSystem.checkAll(mockState);
      expect(newUnlocks.length).toBeGreaterThan(0);

      // Второй вызов без изменений
      newUnlocks = AchievementSystem.checkAll(mockState);
      expect(newUnlocks.length).toBe(0); // Новых разблокировок нет
    });
  });

  describe('getProgress', () => {
    it('должен вернуть прогресс достижений', () => {
      mockState.unlockedAchievements = ['first_step', 'first_card', 'streak_3'];

      const progress = AchievementSystem.getProgress(mockState);

      expect(progress.unlocked).toBe(3);
      expect(progress.total).toBe(ACHIEVEMENTS.length);
      expect(progress.percent).toBeGreaterThan(0);
      expect(progress.percent).toBeLessThanOrEqual(100);
    });

    it('должен вернуть 0% при отсутствии достижений', () => {
      mockState.unlockedAchievements = [];

      const progress = AchievementSystem.getProgress(mockState);

      expect(progress.unlocked).toBe(0);
      expect(progress.percent).toBe(0);
    });

    it('должен вернуть 100% при всех разблокированных достижениях', () => {
      mockState.unlockedAchievements = ACHIEVEMENTS.map((a) => a.id);

      const progress = AchievementSystem.getProgress(mockState);

      expect(progress.unlocked).toBe(ACHIEVEMENTS.length);
      expect(progress.percent).toBe(100);
    });

    it('должен инициализировать массив если его нет', () => {
      delete mockState.unlockedAchievements;

      const progress = AchievementSystem.getProgress(mockState);

      expect(mockState.unlockedAchievements).toEqual([]);
      expect(progress.unlocked).toBe(0);
    });
  });

  describe('Награды за достижения', () => {
    it('все достижения должны иметь положительные награды', () => {
      ACHIEVEMENTS.forEach((ach) => {
        expect(ach.rewards.xp).toBeGreaterThan(0);
        expect(ach.rewards.coins).toBeGreaterThan(0);
      });
    });

    it('более сложные достижения должны давать больше наград', () => {
      const streak3 = ACHIEVEMENTS.find((a) => a.id === 'streak_3');
      const streak100 = ACHIEVEMENTS.find((a) => a.id === 'streak_100');

      expect(streak100.rewards.xp).toBeGreaterThan(streak3.rewards.xp);
      expect(streak100.rewards.coins).toBeGreaterThan(streak3.rewards.coins);
    });
  });

  describe('Интеграционные сценарии', () => {
    it('должен разблокировать множественные достижения одновременно', () => {
      mockState.level = 5;
      mockState.streak.count = 7;
      mockState.dailyCards = 10;
      mockState.coins = 100;

      const newUnlocks = AchievementSystem.checkAll(mockState);

      // Должно разблокироваться минимум 4 достижения
      expect(newUnlocks.length).toBeGreaterThanOrEqual(4);
      expect(mockState.unlockedAchievements).toContain('level_5');
      expect(mockState.unlockedAchievements).toContain('streak_7');
      expect(mockState.unlockedAchievements).toContain('cards_10');
      expect(mockState.unlockedAchievements).toContain('coins_100');
    });

    it('должен корректно обрабатывать прогрессию пользователя', () => {
      // День 1: Начало
      mockState.chapters[1] = { checklist: {} };
      let newUnlocks = AchievementSystem.checkAll(mockState);
      expect(newUnlocks.some((a) => a.id === 'first_step')).toBe(true);

      // День 2: Первая карточка
      mockState.dailyCards = 1;
      mockState.streak.count = 1;
      newUnlocks = AchievementSystem.checkAll(mockState);
      expect(newUnlocks.some((a) => a.id === 'first_card')).toBe(true);
      expect(newUnlocks.some((a) => a.id === 'first_streak')).toBe(true);

      // Через неделю
      mockState.streak.count = 7;
      mockState.dailyCards = 50;
      newUnlocks = AchievementSystem.checkAll(mockState);
      expect(newUnlocks.some((a) => a.id === 'streak_7')).toBe(true);
      expect(newUnlocks.some((a) => a.id === 'cards_50')).toBe(true);

      // Проверяем общий прогресс
      const progress = AchievementSystem.getProgress(mockState);
      expect(progress.unlocked).toBeGreaterThan(5);
    });
  });
});
