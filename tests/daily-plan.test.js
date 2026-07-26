import { describe, it, expect, beforeEach } from 'vitest';
import { defaultState } from '../state/store.js';
import {
  generateDailyPlan,
  getDailyCapacity,
  getNextStudyAction,
  getOrGenerateDailyPlan,
} from '../src/daily-plan.js';

const MOCK_LESSON = {
  id: 2,
  lesson_id: 2,
  title: 'Урок 2',
  words: [{ id: 'L2_V001' }, { id: 'L2_V002' }, { id: 'L2_V003' }],
  notes: [{ note_id: 1, title: 'Грамматика 1' }],
  practice: [{ id: 'p1', title: 'Практика 1', estimatedMinutes: 10, required: true }],
};

describe('Task 6: Atomic Daily Plan & Time Budget (src/daily-plan.js)', () => {
  let appState;

  beforeEach(() => {
    appState = defaultState();
    appState.dailyCapacityMinutes = 30;
    appState.chapters[2] = { started: true, checklist: {} };
    appState.activeChapterId = 2;
    appState.studyPlan = {
      capacityMinutes: 30,
      studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      segments: [
        {
          type: 'chapter',
          chapterId: 2,
          assignedDates: ['2026-07-26', '2026-07-27'],
          dateStatuses: {},
        },
      ],
    };
  });

  it('1. Извлекает дневной бюджет пользователя с запасным значением 30 мин', () => {
    expect(getDailyCapacity(appState)).toBe(30);

    appState.dailyCapacityMinutes = 15;
    expect(getDailyCapacity(appState)).toBe(15);
  });

  it('2. Формирует атомарные задачи дня в порядке приоритета с учетом бюджета', () => {
    appState.srs = {
      card1: { id: 'L2_V001:reading', due: Date.now() - 10000, reps: 1, state: 2 },
      card2: { id: 'L2_V002:reading', due: Date.now() - 10000, reps: 1, state: 2 },
    };

    const dailyPlan = generateDailyPlan(appState, {
      dateKey: '2026-07-26',
      capacityMinutes: 30,
      chapterMeta: MOCK_LESSON,
    });

    expect(dailyPlan).toBeDefined();
    expect(dailyPlan.dateKey).toBe('2026-07-26');
    expect(dailyPlan.capacityMinutes).toBe(30);
    expect(dailyPlan.tasks.length).toBeGreaterThan(0);

    // В первой позиции — SRS повторения (приоритет 1)
    expect(dailyPlan.tasks[0].type).toBe('review');
    expect(dailyPlan.tasks[0].priority).toBe(1);
  });

  it('3. Большое число повторений забирает время бюджета', () => {
    // 100 повторений = 20 минут
    const mockSrs = {};
    for (let i = 0; i < 100; i++) {
      mockSrs[`card_${i}`] = { id: `L2_V${i}:reading`, due: Date.now() - 1000, reps: 1, state: 2 };
    }
    appState.srs = mockSrs;

    const plan15 = generateDailyPlan(appState, {
      dateKey: '2026-07-26',
      capacityMinutes: 15,
      chapterMeta: MOCK_LESSON,
    });

    expect(plan15.tasks[0].type).toBe('review');
    expect(plan15.estimatedMinutes).toBeGreaterThanOrEqual(15);
  });

  it('4. Не создаёт задачи в день отдыха', () => {
    appState.studyPlan.segments[0].dateStatuses['2026-07-26'] = 'rest-day';

    const restPlan = generateDailyPlan(appState, {
      dateKey: '2026-07-26',
      capacityMinutes: 30,
      chapterMeta: MOCK_LESSON,
    });

    expect(restPlan.isRestDay).toBe(true);
    expect(restPlan.tasks.filter((t) => t.type !== 'review')).toHaveLength(0);
  });

  it('5. getOrGenerateDailyPlan сохраняет стабильность и историю плана', () => {
    const plan1 = getOrGenerateDailyPlan(appState, {
      dateKey: '2026-07-26',
      capacityMinutes: 45,
      chapterMeta: MOCK_LESSON,
    });

    expect(appState.dailyPlan).toBeDefined();
    expect(appState.dailyPlanHistory).toHaveLength(1);
    expect(appState.dailyPlanHistory[0].dateKey).toBe('2026-07-26');

    // Повторный вызов в тот же день возвращает тот же план
    const plan2 = getOrGenerateDailyPlan(appState, {
      dateKey: '2026-07-26',
      capacityMinutes: 45,
      chapterMeta: MOCK_LESSON,
    });

    expect(plan2).toBe(plan1);
    expect(appState.dailyPlanHistory[0].tasks.map((task) => task.id)).toEqual(
      plan1.tasks.map((task) => task.id)
    );
  });

  it('6. Не добавляет новую 12-минутную грамматику, если осталось только 5 минут', () => {
    appState.dailyCapacityMinutes = 10;
    appState.srs = Object.fromEntries(
      Array.from({ length: 25 }, (_, index) => [
        `L2_due_${index}`,
        {
          id: `L2_due_${index}`,
          due: Date.now() - 1000,
          reps: 1,
          state: 2,
        },
      ])
    );
    appState.vocabularyUnlocks[2] = {
      '2026-07-25': { itemIds: ['L2_V001'] },
    };
    appState.reviewEvents = [{ eventType: 'review', itemId: 'L2_V001' }];

    const plan = generateDailyPlan(appState, {
      dateKey: '2026-07-26',
      capacityMinutes: 10,
      chapterMeta: MOCK_LESSON,
    });
    expect(plan.requiredMinutes).toBe(5);
    expect(plan.tasks.some((task) => task.type === 'grammar')).toBe(false);
    expect(plan.deferredTaskIds).toContain('grammar-L2_g1');
  });

  it('7. Undo/review revision replaces only today snapshot and finalizes past history', () => {
    const first = getOrGenerateDailyPlan(appState, {
      dateKey: '2026-07-26',
      chapterMeta: MOCK_LESSON,
    });
    appState.reviewEvents.push({
      eventId: 'review-1',
      eventType: 'review',
      reviewedAt: Date.now(),
    });
    const refreshed = getOrGenerateDailyPlan(appState, {
      dateKey: '2026-07-26',
      chapterMeta: MOCK_LESSON,
    });
    expect(refreshed).not.toBe(first);
    expect(appState.dailyPlanHistory).toHaveLength(1);

    getOrGenerateDailyPlan(appState, {
      dateKey: '2026-07-27',
      chapterMeta: MOCK_LESSON,
    });
    expect(appState.dailyPlanHistory[0].finalizedAt).not.toBeNull();
  });

  it('8. Следующее действие является тонким selector поверх tasks', () => {
    const dailyPlan = {
      tasks: [
        { id: 'done', status: 'completed' },
        { id: 'locked', status: 'locked' },
        { id: 'next', status: 'available' },
      ],
    };
    expect(getNextStudyAction(dailyPlan)?.id).toBe('next');
  });

  it('9. Создаёт daily-plan-completed, когда обязательные задачи снимка выполнены', () => {
    appState.srs = {};
    appState.reviewEvents = [
      {
        eventId: 'review-finished',
        eventType: 'review',
        reviewedAt: new Date(2026, 6, 26, 12).getTime(),
        undoneAt: null,
      },
    ];
    appState.dailyPlanHistory = [
      {
        dateKey: '2026-07-26',
        chapterId: 2,
        tasks: [{ id: 'review-2026-07-26', type: 'review' }],
        generatedAt: 100,
        finalizedAt: null,
      },
    ];

    getOrGenerateDailyPlan(appState, {
      dateKey: '2026-07-26',
      now: 200,
      chapterMeta: MOCK_LESSON,
    });

    expect(appState.learningEvents).toContainEqual(
      expect.objectContaining({
        eventId: 'daily-plan-completed:2:2026-07-26',
        eventType: 'daily-plan-completed',
        chapterId: 2,
        dateKey: '2026-07-26',
      })
    );
    expect(appState.dailyPlanHistory[0].finalizedAt).toBe(200);
  });
});
