import { describe, expect, it } from 'vitest';
import { renderTodayPlan } from '../ui/plan.js';

describe('plan today card', () => {
  it('показывает обязательные FSRS-повторения и реальный раздел главы', () => {
    const html = renderTodayPlan(
      {
        dateStatus: 'today',
        dueCount: 14,
        overdueCount: 3,
        reviewedToday: 4,
        reviewProgress: 4 / 18,
        chapterMastery: {
          avgScore: 56,
          needsRefreshCount: 2,
        },
      },
      { id: 3, title: 'Урок 3' },
      {
        nextSection: { id: 'grammar', label: 'Грамматика' },
        completedCount: 2,
        totalCount: 5,
      }
    );

    expect(html).toContain('14 повторений');
    expect(html).toContain('3 просрочено');
    expect(html).toContain('Глава 3: Грамматика');
    expect(html).toContain('2 из 5 разделов');
    expect(html).not.toContain('dailyCards');
  });
});
