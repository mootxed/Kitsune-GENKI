import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { state, defaultState, loadState, runMigrations, save, subscribe } from '../state/store.js';

describe('Store - Версионирование и миграции', () => {
  const LS_STATE = 'kitsune_state_v1';

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllTimers();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('defaultState', () => {
    it('должен содержать поле version со значением 4', () => {
      const state = defaultState();
      expect(state.version).toBe(4);
    });

    it('должен содержать все необходимые поля', () => {
      const state = defaultState();

      expect(state).toHaveProperty('version');
      expect(state).toHaveProperty('initialized');
      expect(state).toHaveProperty('chapters');
      expect(state).toHaveProperty('srs');
      expect(state).toHaveProperty('settings');
      expect(state).toHaveProperty('unlockedAchievements');
      expect(state).toHaveProperty('claimedAchievements');
      expect(state).toHaveProperty('quests');
      expect(state).toHaveProperty('chatHistory');
    });
  });

  describe('Миграции', () => {
    it('должен создать новое состояние с версией 4 при первой загрузке', () => {
      loadState();
      expect(state.version).toBe(4);
    });

    it('должен мигрировать старое состояние без версии → версия 4', () => {
      const oldState = {
        initialized: true,
        xp: 500,
        level: 5,
        coins: 200,
        chapters: { '1-1': { started: true, checklist: {} } },
      };

      localStorage.setItem(LS_STATE, JSON.stringify(oldState));
      loadState();

      // Проверяем что версия проставлена
      expect(state.version).toBe(4);

      // Проверяем что старые данные сохранились
      expect(state.xp).toBe(500);
      expect(state.level).toBe(5);
      expect(state.coins).toBe(200);
      expect(state.chapters['1-1'].started).toBe(true);

      // Проверяем что новые поля добавлены
      expect(state.unlockedAchievements).toEqual([]);
      expect(state.claimedAchievements).toEqual([]);
      expect(state.chatHistory).toEqual([]);
      expect(state.quests).toBeNull();
    });

    it('должен сохранять существующие достижения при миграции', () => {
      const oldState = {
        xp: 100,
        unlockedAchievements: ['first_steps', 'quick_learner'],
        claimedAchievements: ['first_steps'],
      };

      localStorage.setItem(LS_STATE, JSON.stringify(oldState));
      loadState();

      expect(state.version).toBe(4);
      expect(state.unlockedAchievements).toEqual(['first_steps', 'quick_learner']);
      expect(state.claimedAchievements).toEqual(['first_steps']);
    });

    it('должен мерджить настройки при миграции', () => {
      const oldState = {
        settings: {
          openrouterKey: 'test_key',
          darkMode: 'dark',
        },
      };

      localStorage.setItem(LS_STATE, JSON.stringify(oldState));
      loadState();

      expect(state.version).toBe(4);
      expect(state.settings.openrouterKey).toBe('test_key');
      expect(state.settings.darkMode).toBe('dark');
      // Проверяем что дефолтные настройки добавлены
      expect(state.settings.model).toBe('deepseek/deepseek-v4-flash');
      expect(state.settings.notifyEnabled).toBe(false);
    });

    it('сохраняет данные версии 3 при добавлении полной FSRS-схемы', () => {
      const currentState = {
        version: 3,
        xp: 1000,
        level: 10,
        unlockedAchievements: ['achievement1', 'achievement2'],
      };

      localStorage.setItem(LS_STATE, JSON.stringify(currentState));
      loadState();

      expect(state.version).toBe(4);
      expect(state.xp).toBe(1000);
      expect(state.level).toBe(10);
      expect(state.unlockedAchievements).toEqual(['achievement1', 'achievement2']);
    });

    it('должен мигрировать SM-2 карточки в FSRS при переходе на версию 3', () => {
      const legacyDue = 1700000000000;
      const oldState = {
        version: 2,
        srs: {
          L1_w1: {
            id: 'L1_w1',
            ef: 2.5,
            interval: 6,
            reps: 2,
            due: legacyDue,
            lastReview: 1699990000000,
          },
          L1_w2: {
            id: 'L1_w2',
            ef: 1.8,
            interval: 20,
            reps: 7,
            due: legacyDue + 1000,
            lastReview: null,
          },
        },
      };

      localStorage.setItem(LS_STATE, JSON.stringify(oldState));
      loadState();

      expect(state.version).toBe(4);

      const card = state.srs.L1_w1;
      // FSRS-схема
      expect(typeof card.stability).toBe('number');
      expect(card.stability).toBeGreaterThan(0);
      expect(card.difficulty).toBeGreaterThanOrEqual(1);
      expect(card.difficulty).toBeLessThanOrEqual(10);
      expect(card).not.toHaveProperty('ef');
      expect(card).not.toHaveProperty('interval');
      expect(card.learning_steps).toBe(0);
      // КРИТИЧНО: абсолютные метки времени не перезаписаны
      expect(card.due).toBe(legacyDue);
      expect(card.lastReview).toBe(1699990000000);

      const hardCard = state.srs.L1_w2;
      // Более низкий EF → более высокая сложность
      expect(hardCard.difficulty).toBeGreaterThan(card.difficulty);
      expect(hardCard.due).toBe(legacyDue + 1000);
    });

    it('мигрирует v3 карточку без learning_steps и сохраняет legacy progress только как данные', () => {
      const migrated = runMigrations({
        version: 3,
        srs: {
          L1_w9: {
            id: 'L1_w9',
            stability: 12,
            difficulty: 5,
            elapsed_days: 2,
            scheduled_days: 10,
            reps: 4,
            lapses: 1,
            state: 2,
            due: 1_750_000_000_000,
            lastReview: 1_749_000_000_000,
            progress: 88,
          },
        },
      });

      expect(migrated.version).toBe(4);
      expect(migrated.reviewEvents).toEqual([]);
      expect(migrated.srs.L1_w9).toMatchObject({
        learning_steps: 0,
        progress: 88,
        legacyMasteryEstimated: true,
        itemId: 'L1_w9',
        skill: 'recognition',
      });
    });
  });

  describe('Pub/Sub система', () => {
    it('должен позволять подписаться на изменения', () => {
      const callback = vi.fn();
      const unsubscribe = subscribe(callback);

      expect(typeof unsubscribe).toBe('function');
    });

    it('должен вызывать подписчиков при сохранении', (done) => {
      loadState();

      const callback = vi.fn((updatedState) => {
        expect(updatedState).toBe(state);
        expect(callback).toHaveBeenCalledTimes(1);
        done();
      });

      subscribe(callback);

      state.xp = 100;
      save(true); // immediate save
    });

    it('должен поддерживать несколько подписчиков', (done) => {
      loadState();

      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      subscribe(callback1);
      subscribe(callback2);
      subscribe(callback3);

      state.level = 5;
      save(true);

      setTimeout(() => {
        expect(callback1).toHaveBeenCalledTimes(1);
        expect(callback2).toHaveBeenCalledTimes(1);
        expect(callback3).toHaveBeenCalledTimes(1);
        done();
      }, 50);
    });

    it('должен позволять отписаться от изменений', (done) => {
      loadState();

      const callback = vi.fn();
      const unsubscribe = subscribe(callback);

      state.xp = 50;
      save(true);

      setTimeout(() => {
        expect(callback).toHaveBeenCalledTimes(1);

        // Отписываемся
        unsubscribe();

        state.xp = 100;
        save(true);

        setTimeout(() => {
          // Не должен вызваться второй раз
          expect(callback).toHaveBeenCalledTimes(1);
          done();
        }, 50);
      }, 50);
    });

    it('должен обрабатывать ошибки в подписчиках', (done) => {
      loadState();

      const errorCallback = vi.fn(() => {
        throw new Error('Test error');
      });
      const normalCallback = vi.fn();

      subscribe(errorCallback);
      subscribe(normalCallback);

      state.coins = 50;
      save(true);

      setTimeout(() => {
        expect(errorCallback).toHaveBeenCalled();
        expect(normalCallback).toHaveBeenCalled(); // Не должен сломаться из-за ошибки в первом
        done();
      }, 50);
    });

    it('должен выбрасывать ошибку если callback не функция', () => {
      expect(() => subscribe('not a function')).toThrow();
      expect(() => subscribe(null)).toThrow();
      expect(() => subscribe(undefined)).toThrow();
      expect(() => subscribe(123)).toThrow();
    });
  });

  describe('Обратная совместимость', () => {
    it('должен корректно работать с полностью пустым localStorage', () => {
      loadState();

      const defaultData = defaultState();
      expect(state.version).toBe(defaultData.version);
      expect(state.xp).toBe(defaultData.xp);
      expect(state.level).toBe(defaultData.level);
    });

    it('должен восстанавливаться из битых данных', () => {
      localStorage.setItem(LS_STATE, 'invalid json {{{');

      loadState();

      // Должен вернуться к defaultState
      expect(state.version).toBe(4);
      expect(state.xp).toBe(0);
      expect(state.level).toBe(1);
    });
  });

  describe('Интеграция с save/load', () => {
    it('должен сохранять и загружать состояние с версией', (done) => {
      loadState();

      state.xp = 999;
      state.level = 15;
      state.coins = 500;

      save(true);

      setTimeout(() => {
        // Эмулируем перезагрузку страницы
        loadState();

        expect(state.version).toBe(4);
        expect(state.xp).toBe(999);
        expect(state.level).toBe(15);
        expect(state.coins).toBe(500);
        done();
      }, 50);
    });
  });
});
