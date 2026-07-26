import { describe, expect, it } from 'vitest';
import { countCompletedReviewsForDate, renderHomeTodayCard } from '../ui/home.js';

describe('home daily plan rendering', () => {
  it('counts only active review evidence', () => {
    const reviewedAt = new Date(2026, 6, 23, 12).getTime();
    const state = {
      dailyCards: 99,
      reviewEvents: [
        { eventId: 'valid', eventType: 'review', reviewedAt, undoneAt: null },
        { eventId: 'undone', eventType: 'review', reviewedAt, undoneAt: reviewedAt + 1 },
        { eventId: 'chapter-open', eventType: 'chapter-started', reviewedAt },
      ],
    };
    expect(countCompletedReviewsForDate(state, '2026-07-23')).toBe(1);
  });

  it('renders the exact task IDs and metadata supplied by dailyPlan', () => {
    const dailyPlan = {
      dateKey: '2026-07-23',
      chapterId: 2,
      capacityMinutes: 30,
      estimatedMinutes: 15,
      isRestDay: false,
      warnings: [],
      tasks: [
        {
          id: 'review-2026-07-23',
          type: 'review',
          title: 'Повторение слов (SRS)',
          description: '2 карточки к повторению',
          estimatedMinutes: 1,
          status: 'planned',
        },
        {
          id: 'grammar-L2_g1',
          type: 'grammar',
          title: 'Грамматика 1',
          description: 'Объяснение и короткая проверка',
          estimatedMinutes: 12,
          status: 'available',
        },
      ],
    };

    const html = renderHomeTodayCard({ studyPlan: {} }, dailyPlan);
    expect(html).toContain('data-task-id="review-2026-07-23"');
    expect(html).toContain('data-task-id="grammar-L2_g1"');
    expect(html).toContain('2 карточки к повторению');
    expect(html).toContain('15 из 30 мин');
  });

  it('renders only due reviews on a rest day', () => {
    const dailyPlan = {
      dateKey: '2026-07-23',
      chapterId: 2,
      capacityMinutes: 15,
      estimatedMinutes: 2,
      isRestDay: true,
      warnings: [],
      tasks: [
        {
          id: 'review-2026-07-23',
          type: 'review',
          title: 'Повторить слабые знания',
          description: '5 карточек к повторению',
          estimatedMinutes: 2,
          status: 'planned',
        },
      ],
    };
    const html = renderHomeTodayCard({ studyPlan: {} }, dailyPlan);
    expect(html).toContain('День отдыха');
    expect(html).toContain('5 карточек к повторению');
    expect(html).not.toContain('ГРАММАТИКА');
  });

  it('shows the over-capacity warning from the canonical plan', () => {
    const html = renderHomeTodayCard(
      { studyPlan: {} },
      {
        dateKey: '2026-07-23',
        chapterId: 2,
        capacityMinutes: 15,
        estimatedMinutes: 20,
        isRestDay: false,
        warnings: ['Сегодня потребуется больше обычного: накопились обязательные повторения.'],
        tasks: [],
      }
    );
    expect(html).toContain('Сегодня потребуется больше обычного');
    expect(html).toContain('today-completed-state');
  });
});
