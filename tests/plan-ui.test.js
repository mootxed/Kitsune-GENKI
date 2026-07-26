import { describe, expect, it } from 'vitest';
import { renderTodayPlan } from '../ui/plan.js';
import { renderHomeTodayCard } from '../ui/home.js';

describe('plan today card', () => {
  it('показывает обязательные FSRS-повторения и реальный раздел главы', () => {
    const html = renderTodayPlan(
      {
        dateKey: '2026-07-26',
        chapterId: 3,
        capacityMinutes: 30,
        estimatedMinutes: 15,
        warnings: [],
        tasks: [
          {
            id: 'review-2026-07-26',
            type: 'review',
            title: 'Повторение слов (SRS)',
            description: '14 карточек к повторению',
            estimatedMinutes: 3,
            status: 'planned',
          },
          {
            id: 'grammar-L3_g1',
            type: 'grammar',
            title: 'Грамматика',
            description: 'Объяснение и короткая проверка',
            estimatedMinutes: 12,
            status: 'available',
          },
        ],
      },
      { studyPlan: {} }
    );

    expect(html).toContain('14 карточек к повторению');
    expect(html).toContain('Грамматика');
    expect(html).toContain('15 из 30 мин');
    expect(html).not.toContain('dailyCards');
  });

  it('uses the same dailyPlan task IDs as the home card', () => {
    const dailyPlan = {
      dateKey: '2026-07-26',
      chapterId: 1,
      capacityMinutes: 30,
      estimatedMinutes: 10,
      warnings: [],
      tasks: [
        {
          id: 'practice-L01-wb-cg-01',
          type: 'practice',
          title: 'Workbook',
          description: 'Стр. 16',
          estimatedMinutes: 10,
          status: 'available',
        },
      ],
    };
    const state = { studyPlan: {} };
    const home = renderHomeTodayCard(state, dailyPlan);
    const plan = renderTodayPlan(dailyPlan, state);
    expect(home.match(/data-task-id="[^"]+"/g)).toEqual(plan.match(/data-task-id="[^"]+"/g));
  });
});
