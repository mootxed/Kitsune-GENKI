import { describe, expect, it, vi } from 'vitest';
import {
  completeChapter,
  ensureActiveChapterId,
  getChapterProgress,
  hasCompletedChecklist,
  isChapterAvailable,
  selectActiveChapterId,
  setChapterSection,
} from '../src/chapter-progress.js';

const CHECKLIST = ['vocab', 'grammar', 'dialog', 'listening', 'reading'];
const chapters = [1, 2, 3, 4].map((id) => ({
  id,
  title: `Урок ${id}`,
  checklist: CHECKLIST,
}));

function completeChecklist() {
  return Object.fromEntries(CHECKLIST.map((section) => [section, true]));
}

function appState(overrides = {}) {
  return {
    chapters: {},
    activeChapterId: null,
    learningEvents: [],
    studyPlan: null,
    ...overrides,
  };
}

describe('activeChapterId', () => {
  it('берёт главу текущего сегмента плана первой', () => {
    const state = appState({
      chapters: {
        1: { started: true, checklist: {} },
        2: { started: true, checklist: {} },
      },
      studyPlan: {
        activeSegmentId: 'chapter-2',
        segments: [
          {
            id: 'chapter-2',
            type: 'chapter',
            chapterId: 2,
            assignedDates: ['2026-07-23'],
          },
        ],
      },
    });
    expect(selectActiveChapterId(state, chapters, '2026-07-23')).toBe(2);
  });

  it('при нескольких начатых главах выбирает первую незавершённую, а не максимальную', () => {
    const state = appState({
      chapters: {
        1: { started: true, checklist: { vocab: true } },
        3: { started: true, checklist: {} },
      },
    });
    expect(selectActiveChapterId(state, chapters)).toBe(1);
  });

  it('после завершённых глав выбирает только первую доступную следующую', () => {
    const state = appState({
      chapters: {
        1: { started: true, checklist: completeChecklist(), completedAt: 1 },
      },
    });
    expect(ensureActiveChapterId(state, chapters)).toBe(2);
    expect(isChapterAvailable(state, chapters, 2)).toBe(true);
    expect(isChapterAvailable(state, chapters, 3)).toBe(false);
  });
});

describe('chapter completion', () => {
  it('пустой checklist не считается завершённым', () => {
    expect(hasCompletedChecklist({ checklist: {} })).toBe(false);
    expect(getChapterProgress(appState(), 1, chapters[0]).completed).toBe(false);
  });

  it('завершает главу идемпотентно, синхронизирует сегмент и выбирает следующую', () => {
    const state = appState({
      chapters: {
        1: { started: true, checklist: completeChecklist() },
      },
      studyPlan: {
        completedChapters: [],
        activeSegmentId: 'chapter-1',
        segments: [
          {
            id: 'chapter-1',
            type: 'chapter',
            chapterId: 1,
            assignedDates: ['2026-07-23', '2026-07-24'],
            dateStatuses: {},
          },
          {
            id: 'chapter-2',
            type: 'chapter',
            chapterId: 2,
            assignedDates: ['2026-07-25'],
            dateStatuses: {},
          },
        ],
        history: [],
      },
    });
    const recalculatePlan = vi.fn((plan) => plan);
    const first = completeChapter(state, 1, {
      chapters,
      now: new Date(2026, 6, 23, 12).getTime(),
      recalculatePlan,
    });
    const completedAt = state.chapters[1].completedAt;
    const second = completeChapter(state, 1, {
      chapters,
      now: new Date(2026, 6, 24, 12).getTime(),
      recalculatePlan,
    });

    expect(first).toMatchObject({ changed: true, rewardGranted: true, activeChapterId: 2 });
    expect(second).toMatchObject({ changed: false, alreadyCompleted: true });
    expect(state.chapters[1].completedAt).toBe(completedAt);
    expect(state.studyPlan.completedChapters).toEqual([1]);
    expect(state.studyPlan.segments[0]).toMatchObject({
      status: 'completed',
      completedAt,
    });
    expect(state.studyPlan.history).toHaveLength(1);
    expect(
      state.learningEvents.filter((event) => event.eventType === 'chapter-completed')
    ).toHaveLength(1);
    expect(recalculatePlan).toHaveBeenCalledTimes(1);
  });

  it('снятие и повторная установка последней отметки не выдаёт награду повторно', () => {
    const state = appState({
      chapters: {
        1: {
          started: true,
          checklist: completeChecklist(),
          completedAt: 100,
          completionRewardedAt: 100,
        },
      },
    });
    setChapterSection(state, 1, 'reading', false, { chapters, now: 200 });
    const restored = setChapterSection(state, 1, 'reading', true, { chapters, now: 300 });
    const completion = completeChapter(state, 1, { chapters, now: 300 });

    expect(restored.completedNow).toBe(false);
    expect(completion).toMatchObject({ changed: false, alreadyCompleted: true });
    expect(state.chapters[1].completionRewardedAt).toBe(100);
  });

  it('не завершает главу до выполнения всех обязательных частей', () => {
    const state = appState({
      chapters: {
        1: { started: true, checklist: { vocab: true } },
      },
    });
    expect(completeChapter(state, 1, { chapters })).toMatchObject({
      changed: false,
      reason: 'required-sections-incomplete',
    });
  });
});
