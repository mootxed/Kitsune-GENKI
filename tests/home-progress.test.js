import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { countCompletedReviewsForDate, renderHomeTodayCard } from '../ui/home.js';
import { State } from 'ts-fsrs';

describe('home daily progress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Устанавливаем системное время на полдень 23 июля 2026 года
    const mockDate = new Date(2026, 6, 23, 12);
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('не принимает dailyCards и общую активность за решённые карточки', () => {
    const reviewedAt = new Date(2026, 6, 23, 12).getTime();
    const state = {
      dailyCards: 99,
      reviewEvents: [
        {
          eventId: 'valid',
          eventType: 'review',
          reviewedAt,
          undoneAt: null,
        },
        {
          eventId: 'undone',
          eventType: 'review',
          reviewedAt,
          undoneAt: reviewedAt + 1,
        },
        {
          eventId: 'chapter-open',
          eventType: 'chapter-started',
          reviewedAt,
          undoneAt: null,
        },
      ],
    };
    expect(countCompletedReviewsForDate(state, '2026-07-23')).toBe(1);
  });

  it('формирует задачу повторения при наличии due-карточек', () => {
    // В SRS есть due карточки
    const appState = {
      studyPlan: {
        segments: [],
        completedChapters: [],
        studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6], // все дни учебные
        paused: false,
      },
      srs: {
        card1: {
          id: 'card1',
          suspended: false,
          due: Date.now() - 1000,
          state: State.Review,
          reps: 1,
          stability: 1,
          difficulty: 5,
          lapses: 0,
          lastReview: Date.now() - 86400000,
        },
        card2: {
          id: 'card2',
          suspended: false,
          due: Date.now() - 2000,
          state: State.Review,
          reps: 1,
          stability: 1,
          difficulty: 5,
          lapses: 0,
          lastReview: Date.now() - 86400000,
        },
      },
      reviewEvents: [],
      learningEvents: [],
      chapters: {},
    };

    const html = renderHomeTodayCard(appState, null, null);

    // Проверяем, что отображается FSRS задача
    expect(html).toContain('Повторить 2 карточек');
    expect(html).toContain('0 из 2 выполнено');
    expect(html).toContain('primary'); // первая обязательная задача
    expect(html).toContain('data-action="review"');
  });

  it('показывает просроченные карточки отдельно, если они есть', () => {
    const startOfToday = new Date(2026, 6, 23, 0).getTime();
    const appState = {
      studyPlan: {
        segments: [],
        completedChapters: [],
        studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      },
      srs: {
        // card1 due вчера (просрочена)
        card1: {
          id: 'card1',
          suspended: false,
          due: startOfToday - 5000,
          state: State.Review,
          reps: 1,
          stability: 1,
          difficulty: 5,
          lapses: 0,
          lastReview: startOfToday - 86400000,
        },
        // card2 due сегодня в 11:00 (due, но не просрочена, т.к. сегодня)
        card2: {
          id: 'card2',
          suspended: false,
          due: startOfToday + 3600000 * 11,
          state: State.Review,
          reps: 1,
          stability: 1,
          difficulty: 5,
          lapses: 0,
          lastReview: startOfToday - 86400000,
        },
      },
      reviewEvents: [],
      learningEvents: [],
      chapters: {},
    };

    const html = renderHomeTodayCard(appState, null, null);
    expect(html).toContain('Повторить 2 карточек');
    expect(html).toContain('1 просрочено');
  });

  it('не показывает задачу повторения при нулевом due и отсутствии активности', () => {
    const appState = {
      studyPlan: {
        segments: [],
        completedChapters: [],
        studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      },
      srs: {},
      reviewEvents: [],
      learningEvents: [],
      chapters: {},
    };

    const html = renderHomeTodayCard(appState, null, null);

    // Нет due и нет ревью сегодня -> задача не создается
    expect(html).not.toContain('Повторить');
  });

  it('отображает задачу повторения как выполненную, если ревью сделаны, а due = 0', () => {
    const appState = {
      studyPlan: {
        segments: [],
        completedChapters: [],
        studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      },
      srs: {},
      reviewEvents: [
        { cardId: 'card1', eventType: 'review', reviewedAt: Date.now(), undoneAt: null },
      ],
      learningEvents: [],
      chapters: {},
    };

    const html = renderHomeTodayCard(appState, null, null);
    expect(html).toContain('Повторить 1 карточек');
    expect(html).toContain('1 из 1 выполнено');
    expect(html).toContain('✓ Выполнено');
    expect(html).not.toContain('today-action-button'); // Кнопки быть не должно
  });

  it('отображает текущий незавершенный раздел активной главы', () => {
    const appState = {
      studyPlan: {
        segments: [
          {
            type: 'chapter',
            chapterId: 2,
            assignedDates: ['2026-07-23'],
            status: 'planned',
            dateStatuses: {},
          },
        ],
        completedChapters: [],
        studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      },
      srs: {},
      reviewEvents: [],
      learningEvents: [],
      chapters: {
        2: { started: true, checklist: { vocab: true } }, // vocab завершен, grammar нет
      },
    };

    const activeChapter = {
      id: 2,
      title: 'Урок 2',
      estimatedMinutes: 50,
      checklist: ['vocab', 'grammar', 'dialog'],
    };

    // progress mock
    const progress = {
      chapterId: 2,
      completed: false,
      nextSection: { id: 'grammar', label: 'Грамматика' },
      completedCount: 1,
      totalCount: 3,
      ratio: 1 / 3,
    };

    const html = renderHomeTodayCard(appState, activeChapter, progress);
    expect(html).toContain('Глава 2 · Грамматика');
    expect(html).toContain('1 из 3 разделов');
    expect(html).toContain('осталось 2 · ~10 мин');
  });

  it('не показывает обязательную главу в день отдыха', () => {
    const appState = {
      studyPlan: {
        segments: [
          {
            type: 'chapter',
            chapterId: 2,
            assignedDates: ['2026-07-24'],
            status: 'planned',
            dateStatuses: {},
          }, // сегодня 23-е, сегмент на 24-е
        ],
        completedChapters: [],
        studyDaysOfWeek: [4], // только четверги (23 июля четверг, но мы настроим rest-day)
      },
      srs: {
        card1: {
          id: 'card1',
          suspended: false,
          due: Date.now() - 1000,
          state: State.Review,
          reps: 1,
          stability: 1,
          difficulty: 5,
          lapses: 0,
          lastReview: Date.now() - 86400000,
        },
      },
      reviewEvents: [],
      learningEvents: [],
      chapters: {},
    };

    const activeChapter = { id: 2, title: 'Урок 2' };
    const progress = { completed: false, nextSection: { id: 'vocab', label: 'Лексика' } };

    const html = renderHomeTodayCard(appState, activeChapter, progress);

    // В день отдыха глава не должна отображаться
    expect(html).not.toContain('Глава 2');
    expect(html).toContain('День отдыха');
    expect(html).toContain('Повторить 1 карточек');
  });

  it('правильно распределяет приоритеты CTA (primary, secondary)', () => {
    const appState = {
      studyPlan: {
        segments: [
          {
            type: 'chapter',
            chapterId: 2,
            assignedDates: ['2026-07-23'],
            status: 'planned',
            dateStatuses: {},
          },
        ],
        completedChapters: [],
        studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      },
      srs: {
        card1: {
          id: 'card1',
          suspended: false,
          due: Date.now() - 1000,
          state: State.Review,
          reps: 1,
          stability: 1,
          difficulty: 5,
          lapses: 0,
          lastReview: Date.now() - 86400000,
        },
      },
      reviewEvents: [],
      learningEvents: [],
      chapters: {},
    };

    const activeChapter = { id: 2, title: 'Урок 2' };
    const progress = {
      completed: false,
      nextSection: { id: 'vocab', label: 'Лексика' },
      completedCount: 0,
      totalCount: 3,
      ratio: 0,
    };

    const html = renderHomeTodayCard(appState, activeChapter, progress);

    // Оба дела не выполнены. FSRS первое -> primary. Глава вторая -> secondary.
    expect(html).toContain('class="today-action-button primary" data-action="review"');
    expect(html).toContain('class="today-action-button secondary" data-action="chapter"');

    // Если FSRS выполнен, то Глава должна получить primary
    const appStateCompletedFsrs = {
      ...appState,
      srs: {},
      reviewEvents: [
        { cardId: 'card1', eventType: 'review', reviewedAt: Date.now(), undoneAt: null },
      ],
    };
    const html2 = renderHomeTodayCard(appStateCompletedFsrs, activeChapter, progress);
    expect(html2).toContain('task-status-completed'); // для FSRS
    expect(html2).toContain('class="today-action-button primary" data-action="chapter"'); // Глава стала первой незавершенной -> primary!
  });

  it('предлагает бонусную задачу AI-истории при наличии слабых слов', () => {
    const appState = {
      studyPlan: {
        segments: [],
        completedChapters: [],
        studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      },
      // У card1 есть lapses, значит это слабое слово
      srs: {
        card1: {
          id: 'card1',
          suspended: false,
          due: Date.now() + 100000,
          state: State.Review,
          reps: 2,
          stability: 1,
          difficulty: 5,
          lapses: 2,
          lastReview: Date.now() - 86400000,
        },
      },
      reviewEvents: [],
      learningEvents: [],
      chapters: {},
    };

    const html = renderHomeTodayCard(appState, null, null);
    expect(html).toContain('Закрепить слабые слова в AI-истории');
    expect(html).toContain('class="today-action-button neutral" data-action="ai-story"');
  });

  it('показывает компактное завершенное состояние дня', () => {
    const appState = {
      studyPlan: {
        segments: [],
        completedChapters: [],
        studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      },
      srs: {},
      reviewEvents: [],
      learningEvents: [],
      chapters: {},
    };

    const html = renderHomeTodayCard(appState, null, null);
    expect(html).toContain('План на сегодня выполнен ✓');
    expect(html).toContain('today-completed-state');
  });
});
