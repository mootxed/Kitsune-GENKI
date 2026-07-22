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
    it('должен содержать поле version со значением 6', () => {
      const state = defaultState();
      expect(state.version).toBe(6);
    });

    it('должен содержать все необходимые поля', () => {
      const state = defaultState();

      expect(state).toHaveProperty('version');
      expect(state).toHaveProperty('initialized');
      expect(state).toHaveProperty('chapters');
      expect(state).toHaveProperty('srs');
      expect(state).toHaveProperty('reviewEvents');
      expect(state).toHaveProperty('masteryArchive');
      expect(state).toHaveProperty('pendingReviewLogs');
      expect(state).toHaveProperty('settings');
      expect(state).toHaveProperty('unlockedAchievements');
      expect(state).toHaveProperty('claimedAchievements');
      expect(state).toHaveProperty('quests');
      expect(state).toHaveProperty('chatHistory');
    });
  });

  describe('Миграции', () => {
    it('должен создать новое состояние с версией 6 при первой загрузке', async () => {
      await loadState();
      expect(state.version).toBe(6);
    });

    it('должен мигрировать старое состояние без версии → версия 6', async () => {
      const oldState = {
        initialized: true,
        xp: 500,
        level: 5,
        coins: 200,
        chapters: { '1-1': { started: true, checklist: {} } },
      };

      localStorage.setItem(LS_STATE, JSON.stringify(oldState));
      await loadState();

      // Проверяем что версия проставлена
      expect(state.version).toBe(6);

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

    it('должен сохранять существующие достижения при миграции', async () => {
      const oldState = {
        xp: 100,
        unlockedAchievements: ['first_steps', 'quick_learner'],
        claimedAchievements: ['first_steps'],
      };

      localStorage.setItem(LS_STATE, JSON.stringify(oldState));
      await loadState();

      expect(state.version).toBe(6);
      expect(state.unlockedAchievements).toEqual(['first_steps', 'quick_learner']);
      expect(state.claimedAchievements).toEqual(['first_steps']);
    });

    it('должен мерджить настройки при миграции', async () => {
      const oldState = {
        settings: {
          openrouterKey: 'test_key',
          darkMode: 'dark',
        },
      };

      localStorage.setItem(LS_STATE, JSON.stringify(oldState));
      await loadState();

      expect(state.version).toBe(6);
      expect(state.settings.openrouterKey).toBe('test_key');
      expect(state.settings.darkMode).toBe('dark');
      // Проверяем что дефолтные настройки добавлены
      expect(state.settings.model).toBe('deepseek/deepseek-v4-flash');
      expect(state.settings.notifyEnabled).toBe(false);
    });

    it('сохраняет данные версии 3 при добавлении полной FSRS-схемы', async () => {
      const currentState = {
        version: 3,
        xp: 1000,
        level: 10,
        unlockedAchievements: ['achievement1', 'achievement2'],
      };

      localStorage.setItem(LS_STATE, JSON.stringify(currentState));
      await loadState();

      expect(state.version).toBe(6);
      expect(state.xp).toBe(1000);
      expect(state.level).toBe(10);
      expect(state.unlockedAchievements).toEqual(['achievement1', 'achievement2']);
    });

    it('должен мигрировать SM-2 карточки в FSRS при переходе на версию 3', async () => {
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
      await loadState();

      expect(state.version).toBe(6);

      const card = state.srs.L1_w1;
      // FSRS-схема
      expect(typeof card.stability).toBe('number');
      expect(card.stability).toBeGreaterThan(0);
      expect(card.difficulty).toBeGreaterThanOrEqual(1);
      expect(card.difficulty).toBeLessThanOrEqual(10);
      expect(card).not.toHaveProperty('ef');
      expect(card).not.toHaveProperty('interval');
      expect(card.learning_steps).toBe(0);
      expect(card.legacyMasteryEstimated).toBe(true);
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

      expect(migrated.version).toBe(6);
      expect(migrated.reviewEvents).toEqual([]);
      expect(migrated.srs.L1_w9).toMatchObject({
        learning_steps: 0,
        progress: 88,
        legacyMasteryEstimated: true,
        itemId: 'L1_w9',
        skill: 'recognition',
      });
    });

    it('миграция v4 ограничивает review journal и создаёт mastery archive', () => {
      const reviewEvents = Array.from({ length: 21 }, (_, index) => ({
        eventId: `event-${index}`,
        eventType: 'review',
        itemId: 'L1_V001',
        cardId: 'L1_V001::recall',
        skill: 'recall',
        mode: 'typing',
        firstAttemptCorrect: true,
        effectiveRating: 4,
        reviewedAt: new Date(2026, 0, index + 1).getTime(),
        undoneAt: null,
      }));

      const migrated = runMigrations({ version: 4, srs: {}, reviewEvents });

      expect(migrated.version).toBe(6);
      expect(migrated.pendingReviewLogs).toEqual([]);
      expect(migrated.reviewEvents).toHaveLength(20);
      expect(migrated.masteryArchive.L1_V001).toMatchObject({
        evidenceCount: 1,
        successfulSkills: { recall: true },
      });
    });
  });

  describe('Pub/Sub система', () => {
    it('должен позволять подписаться на изменения', () => {
      const callback = vi.fn();
      const unsubscribe = subscribe(callback);

      expect(typeof unsubscribe).toBe('function');
    });

    it('должен вызывать подписчиков при сохранении', async () => {
      await loadState();

      const callback = vi.fn();

      const unsubscribe = subscribe(callback);

      state.xp = 100;
      await save(true);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(state);
      unsubscribe();
    });

    it('должен поддерживать несколько подписчиков', async () => {
      await loadState();

      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      const unsubscribers = [subscribe(callback1), subscribe(callback2), subscribe(callback3)];

      state.level = 5;
      await save(true);

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(callback3).toHaveBeenCalledTimes(1);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    });

    it('должен позволять отписаться от изменений', async () => {
      await loadState();

      const callback = vi.fn();
      const unsubscribe = subscribe(callback);

      state.xp = 50;
      await save(true);
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();
      state.xp = 100;
      await save(true);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('должен обрабатывать ошибки в подписчиках', async () => {
      await loadState();

      const errorCallback = vi.fn(() => {
        throw new Error('Test error');
      });
      const normalCallback = vi.fn();

      const unsubscribeError = subscribe(errorCallback);
      const unsubscribeNormal = subscribe(normalCallback);

      state.coins = 50;
      await save(true);

      expect(errorCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();
      unsubscribeError();
      unsubscribeNormal();
    });

    it('должен выбрасывать ошибку если callback не функция', () => {
      expect(() => subscribe('not a function')).toThrow();
      expect(() => subscribe(null)).toThrow();
      expect(() => subscribe(undefined)).toThrow();
      expect(() => subscribe(123)).toThrow();
    });
  });

  describe('Обратная совместимость', () => {
    it('должен корректно работать с полностью пустым localStorage', async () => {
      await loadState();

      const defaultData = defaultState();
      expect(state.version).toBe(defaultData.version);
      expect(state.xp).toBe(defaultData.xp);
      expect(state.level).toBe(defaultData.level);
    });

    it('должен восстанавливаться из битых данных', async () => {
      localStorage.setItem(LS_STATE, 'invalid json {{{');

      await loadState();

      // Должен вернуться к defaultState
      expect(state.version).toBe(6);
      expect(state.xp).toBe(0);
      expect(state.level).toBe(1);
    });
  });

  describe('Интеграция с save/load', () => {
    it('должен сохранять и загружать состояние с версией', async () => {
      await loadState();

      state.xp = 999;
      state.level = 15;
      state.coins = 500;

      await save(true);

      await loadState();
      expect(state.version).toBe(6);
      expect(state.xp).toBe(999);
      expect(state.level).toBe(15);
      expect(state.coins).toBe(500);
    });
  });
});
