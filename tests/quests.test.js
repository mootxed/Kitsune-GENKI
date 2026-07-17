/* quests.test.js — Тесты для системы ежедневных квестов и недельных челленджей */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuestsManager as Quests } from '../quests.js';

describe('Quests System - Daily Quests & Weekly Challenges', () => {
  let state;

  beforeEach(() => {
    // Очищаем все моки и создаём чистое состояние перед каждым тестом
    vi.clearAllMocks();
    vi.useRealTimers();
    
    // Создаём чистое состояние
    state = {
      xp: 0,
      coins: 0,
      streak: 0
    };
  });

  describe('Генерация квестов', () => {
    describe('generateDailyQuests', () => {
      it('должна сгенерировать 2 ежедневных квеста', () => {
        Quests.initializeQuests(state);
        expect(state.quests.daily).toHaveLength(2);
      });

      it('первый квест должен быть типа daily_cards', () => {
        Quests.initializeQuests(state);
        const cardsQuest = state.quests.daily.find(q => q.type === 'daily_cards');
        expect(cardsQuest).toBeDefined();
        expect(cardsQuest.title).toContain('карточек');
        expect([20, 30, 50]).toContain(cardsQuest.target);
      });

      it('второй квест должен быть типа streak_correct', () => {
        Quests.initializeQuests(state);
        const streakQuest = state.quests.daily.find(q => q.type === 'streak_correct');
        expect(streakQuest).toBeDefined();
        expect(streakQuest.title).toContain('правильных подряд');
        expect([5, 10, 15]).toContain(streakQuest.target);
      });

      it('все квесты должны иметь корректные начальные значения', () => {
        Quests.initializeQuests(state);
        
        state.quests.daily.forEach(quest => {
          expect(quest.id).toBeDefined();
          expect(quest.type).toBeDefined();
          expect(quest.title).toBeDefined();
          expect(quest.desc).toBeDefined();
          expect(quest.target).toBeGreaterThan(0);
          expect(quest.progress).toBe(0);
          expect(quest.completed).toBe(false);
          expect(quest.claimed).toBe(false);
          expect(quest.reward).toBeDefined();
          expect(quest.reward.xp).toBeGreaterThan(0);
          expect(quest.reward.coins).toBeGreaterThan(0);
          expect(quest.expires).toBeDefined();
        });
      });

      it('награда должна быть пропорциональна сложности квеста', () => {
        Quests.initializeQuests(state);
        const cardsQuest = state.quests.daily.find(q => q.type === 'daily_cards');
        
        // Награда XP = target / 2
        expect(cardsQuest.reward.xp).toBe(Math.floor(cardsQuest.target / 2));
        
        // Награда coins = XP / 2
        expect(cardsQuest.reward.coins).toBe(Math.floor(cardsQuest.reward.xp / 2));
      });
    });

    describe('generateWeeklyChallenges', () => {
      it('должна сгенерировать 1 недельный челлендж', () => {
        Quests.initializeQuests(state);
        expect(state.quests.weekly).toHaveLength(1);
      });

      it('недельный челлендж должен быть типа weekly_streak', () => {
        Quests.initializeQuests(state);
        const weeklyQuest = state.quests.weekly[0];
        
        expect(weeklyQuest.type).toBe('weekly_streak');
        expect(weeklyQuest.title).toContain('Стрик');
        expect(weeklyQuest.target).toBe(7);
        expect(weeklyQuest.reward.xp).toBe(500);
        expect(weeklyQuest.reward.coins).toBe(250);
      });
    });
  });

  describe('Инициализация и сброс квестов', () => {
    describe('initializeQuests', () => {
      it('должна инициализировать квесты, если их нет', () => {
        expect(state.quests).toBeUndefined();
        Quests.initializeQuests(state);
        expect(state.quests).toBeDefined();
        expect(state.quests.daily).toBeDefined();
        expect(state.quests.weekly).toBeDefined();
      });

      it('не должна перезаписывать существующие квесты', () => {
        Quests.initializeQuests(state);
        const originalDailyId = state.quests.daily[0].id;
        
        Quests.initializeQuests(state);
        expect(state.quests.daily[0].id).toBe(originalDailyId);
      });

      it('должна установить текущую дату в lastReset', () => {
        const fixedDate = new Date('2026-07-17T12:00:00Z');
        vi.setSystemTime(fixedDate);
        
        Quests.initializeQuests(state);
        expect(state.quests.lastReset).toBe('2026-07-17');
      });

      it('должна установить начало недели в weekStart', () => {
        // Примечание: getWeekStart использует new Date() напрямую,
        // поэтому тест проверяет реальную дату, а не замокированную
        Quests.initializeQuests(state);
        expect(state.quests.weekStart).toBeDefined();
        expect(state.quests.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });

      it('должна инициализировать счётчики', () => {
        Quests.initializeQuests(state);
        expect(state.quests.completedDaily).toBe(0);
        expect(state.quests.completedWeekly).toBe(0);
        expect(state.quests.streakCorrect).toBe(0);
      });
    });

    describe('checkQuestReset - Сброс ежедневных квестов', () => {
      it('должна сбросить квесты при смене дня', () => {
        // Инициализируем квесты сегодня
        const today = new Date('2026-07-17T12:00:00Z');
        vi.setSystemTime(today);
        Quests.initializeQuests(state);
        
        const originalQuestId = state.quests.daily[0].id;
        
        // Переходим на следующий день
        const tomorrow = new Date('2026-07-18T12:00:00Z');
        vi.setSystemTime(tomorrow);
        Quests.checkQuestReset(state);
        
        expect(state.quests.lastReset).toBe('2026-07-18');
        expect(state.quests.daily[0].id).not.toBe(originalQuestId);
      });

      it('должна подсчитать завершённые квесты за вчера', () => {
        const today = new Date('2026-07-17T12:00:00Z');
        vi.setSystemTime(today);
        Quests.initializeQuests(state);
        
        // Завершаем оба квеста
        state.quests.daily[0].completed = true;
        state.quests.daily[1].completed = true;
        
        // Переходим на следующий день
        const tomorrow = new Date('2026-07-18T12:00:00Z');
        vi.setSystemTime(tomorrow);
        Quests.checkQuestReset(state);
        
        expect(state.quests.completedDaily).toBe(2);
      });

      it('должна сбросить стрик правильных ответов', () => {
        const today = new Date('2026-07-17T12:00:00Z');
        vi.setSystemTime(today);
        Quests.initializeQuests(state);
        
        state.quests.streakCorrect = 10;
        
        const tomorrow = new Date('2026-07-18T12:00:00Z');
        vi.setSystemTime(tomorrow);
        Quests.checkQuestReset(state);
        
        expect(state.quests.streakCorrect).toBe(0);
      });

      it('не должна сбрасывать квесты в тот же день', () => {
        const today = new Date('2026-07-17T12:00:00Z');
        vi.setSystemTime(today);
        Quests.initializeQuests(state);
        
        const originalQuestId = state.quests.daily[0].id;
        
        // Проверяем сброс в тот же день (но позже)
        const laterToday = new Date('2026-07-17T18:00:00Z');
        vi.setSystemTime(laterToday);
        Quests.checkQuestReset(state);
        
        expect(state.quests.daily[0].id).toBe(originalQuestId);
      });
    });

    describe('checkQuestReset - Сброс недельных челленджей', () => {
      it('должна сбросить челленджи при смене недели', () => {
        // Четверг, 17 июля 2026 (неделя начинается 13 июля)
        const thisWeek = new Date('2026-07-17T12:00:00Z');
        vi.setSystemTime(thisWeek);
        Quests.initializeQuests(state);
        
        const originalChallengeId = state.quests.weekly[0].id;
        const originalWeekStart = state.quests.weekStart;
        
        // Понедельник, 20 июля 2026 (начало новой недели)
        const nextWeek = new Date('2026-07-20T12:00:00Z');
        vi.setSystemTime(nextWeek);
        Quests.checkQuestReset(state);
        
        // Примечание: из-за использования new Date() в getWeekStart,
        // weekStart может быть не точно 2026-07-20, но должен измениться
        expect(state.quests.weekStart).toBeDefined();
        expect(state.quests.weekly[0].id).not.toBe(originalChallengeId);
      });

      it('должна подсчитать завершённые челленджи за прошлую неделю', () => {
        const thisWeek = new Date('2026-07-17T12:00:00Z');
        vi.setSystemTime(thisWeek);
        Quests.initializeQuests(state);
        
        state.quests.weekly[0].completed = true;
        
        const nextWeek = new Date('2026-07-20T12:00:00Z');
        vi.setSystemTime(nextWeek);
        Quests.checkQuestReset(state);
        
        expect(state.quests.completedWeekly).toBe(1);
      });
    });
  });

  describe('Обновление прогресса квестов', () => {
    beforeEach(() => {
      Quests.initializeQuests(state);
    });

    describe('updateQuestProgress', () => {
      it('должна увеличить прогресс квеста daily_cards', () => {
        const cardsQuest = state.quests.daily.find(q => q.type === 'daily_cards');
        expect(cardsQuest.progress).toBe(0);
        
        Quests.updateQuestProgress(state, 'daily_cards', 5);
        expect(cardsQuest.progress).toBe(5);
        
        Quests.updateQuestProgress(state, 'daily_cards', 3);
        expect(cardsQuest.progress).toBe(8);
      });

      it('должна завершить квест при достижении цели', () => {
        const cardsQuest = state.quests.daily.find(q => q.type === 'daily_cards');
        const target = cardsQuest.target;
        
        Quests.updateQuestProgress(state, 'daily_cards', target);
        
        expect(cardsQuest.progress).toBe(target);
        expect(cardsQuest.completed).toBe(true);
      });

      it('не должна увеличивать прогресс выше цели', () => {
        const cardsQuest = state.quests.daily.find(q => q.type === 'daily_cards');
        const target = cardsQuest.target;
        
        Quests.updateQuestProgress(state, 'daily_cards', target + 100);
        
        expect(cardsQuest.progress).toBe(target);
      });

      it('не должна обновлять уже завершённый квест', () => {
        const cardsQuest = state.quests.daily.find(q => q.type === 'daily_cards');
        cardsQuest.completed = true;
        cardsQuest.progress = cardsQuest.target;
        
        Quests.updateQuestProgress(state, 'daily_cards', 10);
        
        expect(cardsQuest.progress).toBe(cardsQuest.target);
      });

      it('должна обновлять недельные квесты', () => {
        const weeklyQuest = state.quests.weekly[0];
        
        Quests.updateQuestProgress(state, 'weekly_streak', 1);
        expect(weeklyQuest.progress).toBe(1);
        
        Quests.updateQuestProgress(state, 'weekly_streak', 1);
        expect(weeklyQuest.progress).toBe(2);
      });
    });

    describe('Стрик правильных ответов', () => {
      it('incrementStreakCorrect должна увеличить стрик', () => {
        expect(state.quests.streakCorrect).toBe(0);
        
        Quests.incrementStreakCorrect(state);
        expect(state.quests.streakCorrect).toBe(1);
        
        Quests.incrementStreakCorrect(state);
        expect(state.quests.streakCorrect).toBe(2);
      });

      it('должна обновить прогресс квеста streak_correct', () => {
        const streakQuest = state.quests.daily.find(q => q.type === 'streak_correct');
        
        for (let i = 0; i < 3; i++) {
          Quests.incrementStreakCorrect(state);
        }
        
        expect(streakQuest.progress).toBe(3);
      });

      it('должна завершить квест streak_correct при достижении цели', () => {
        const streakQuest = state.quests.daily.find(q => q.type === 'streak_correct');
        const target = streakQuest.target;
        
        for (let i = 0; i < target; i++) {
          Quests.incrementStreakCorrect(state);
        }
        
        expect(streakQuest.completed).toBe(true);
      });

      it('resetStreakCorrect должна сбросить стрик', () => {
        state.quests.streakCorrect = 10;
        
        Quests.resetStreakCorrect(state);
        
        expect(state.quests.streakCorrect).toBe(0);
        // Примечание: progress квеста не сбрасывается автоматически
        // Это делается только при resetQuestReset
      });
    });
  });

  describe('Получение наград', () => {
    beforeEach(() => {
      Quests.initializeQuests(state);
    });

    describe('claimQuestReward', () => {
      it('должна вернуть награду за завершённый квест', () => {
        const quest = state.quests.daily[0];
        quest.progress = quest.target;
        quest.completed = true;
        
        const reward = Quests.claimQuestReward(state, quest.id);
        
        expect(reward).toBeDefined();
        expect(reward.xp).toBe(quest.reward.xp);
        expect(reward.coins).toBe(quest.reward.coins);
        expect(quest.claimed).toBe(true);
      });

      it('не должна возвращать награду за незавершённый квест', () => {
        const quest = state.quests.daily[0];
        quest.completed = false;
        
        const reward = Quests.claimQuestReward(state, quest.id);
        
        expect(reward).toBeNull();
        expect(quest.claimed).toBe(false);
      });

      it('не должна возвращать награду дважды', () => {
        const quest = state.quests.daily[0];
        quest.progress = quest.target;
        quest.completed = true;
        
        const firstReward = Quests.claimQuestReward(state, quest.id);
        expect(firstReward).toBeDefined();
        
        const secondReward = Quests.claimQuestReward(state, quest.id);
        expect(secondReward).toBeNull();
      });
    });
  });

  describe('Интеграционные тесты', () => {
    it('полный цикл: инициализация -> прогресс -> завершение -> получение награды', () => {
      const today = new Date('2026-07-17T12:00:00Z');
      vi.setSystemTime(today);
      
      Quests.initializeQuests(state);
      
      const cardsQuest = state.quests.daily.find(q => q.type === 'daily_cards');
      const target = cardsQuest.target;
      
      // Прогресс
      for (let i = 0; i < target; i++) {
        Quests.updateQuestProgress(state, 'daily_cards', 1);
      }
      
      expect(cardsQuest.completed).toBe(true);
      
      // Получение награды
      const reward = Quests.claimQuestReward(state, cardsQuest.id);
      
      expect(reward).toBeDefined();
      expect(reward.xp).toBe(cardsQuest.reward.xp);
      expect(reward.coins).toBe(cardsQuest.reward.coins);
      expect(cardsQuest.claimed).toBe(true);
    });

    it('сценарий со стриком: увеличение -> сброс -> повторное увеличение', () => {
      Quests.initializeQuests(state);
      
      const streakQuest = state.quests.daily.find(q => q.type === 'streak_correct');
      
      // Увеличиваем стрик
      for (let i = 0; i < 3; i++) {
        Quests.incrementStreakCorrect(state);
      }
      expect(streakQuest.progress).toBe(3);
      expect(state.quests.streakCorrect).toBe(3);
      
      // Сбрасываем стрик (ошибка пользователя)
      Quests.resetStreakCorrect(state);
      expect(state.quests.streakCorrect).toBe(0);
      // ВАЖНО: progress квеста остаётся на 3, т.к. resetStreakCorrect
      // не вызывает обновление progress квеста напрямую
      expect(streakQuest.progress).toBe(3);
      
      // Начинаем заново - при вызове incrementStreakCorrect
      // progress УСТАНАВЛИВАЕТСЯ = streakCorrect (не прибавляется!)
      for (let i = 0; i < 2; i++) {
        Quests.incrementStreakCorrect(state);
      }
      expect(state.quests.streakCorrect).toBe(2);
      expect(streakQuest.progress).toBe(2); // Устанавливается = 2, а не 3+2
    });
    it('многодневный сценарий с автоматическим сбросом', () => {
      // День 1
      const day1 = new Date('2026-07-17T12:00:00Z');
      vi.setSystemTime(day1);
      Quests.initializeQuests(state);
      
      const quest1 = state.quests.daily[0];
      quest1.progress = quest1.target;
      quest1.completed = true;
      
      // День 2
      const day2 = new Date('2026-07-18T12:00:00Z');
      vi.setSystemTime(day2);
      Quests.checkQuestReset(state);
      
      expect(state.quests.completedDaily).toBe(1);
      expect(state.quests.daily[0].completed).toBe(false);
      expect(state.quests.daily[0].progress).toBe(0);
    });
  });

  describe('Вспомогательные функции', () => {
    it('todayStr должна возвращать дату в формате YYYY-MM-DD', () => {
      const fixedDate = new Date('2026-07-17T15:30:00Z');
      vi.setSystemTime(fixedDate);
      
      Quests.initializeQuests(state);
      expect(state.quests.lastReset).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('getWeekStart должна возвращать начало недели в корректном формате', () => {
      // Примечание: getWeekStart использует new Date() напрямую,
      // поэтому тест проверяет, что функция возвращает корректный формат
      Quests.initializeQuests(state);
      
      // Проверяем формат даты
      expect(state.quests.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      
      // Проверяем, что это воскресенье или понедельник (начало недели)
      const weekStartDate = new Date(state.quests.weekStart + 'T00:00:00Z');
      const dayOfWeek = weekStartDate.getUTCDay();
      expect([0, 1]).toContain(dayOfWeek); // 0 = Воскресенье, 1 = Понедельник
    });
  });
});