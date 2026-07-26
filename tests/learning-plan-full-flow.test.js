import { describe, expect, it, vi } from 'vitest';
import { defaultState } from '../state/store.js';
import { ensureChapterVocabularyCards } from '../src/chapter-vocabulary.js';
import { getOrGenerateDailyPlan } from '../src/daily-plan.js';
import {
  ensureTodayVocabularyBatch,
  startVocabularyBatchSession,
} from '../src/vocabulary-unlock-plan.js';
import { completeGrammarTopicWithCheck, getGrammarTopicStatus } from '../src/grammar-plan.js';
import { completePracticeTask } from '../src/practice-plan.js';

const chapter1 = {
  id: 1,
  title: 'Chapter 1',
  words: [{ id: 'L1_word_1' }, { id: 'L1_word_2' }, { id: 'L1_word_3' }],
  notes: [{ note_id: 1, title: 'です' }],
  practice: [
    {
      id: 'L01-wb-cg-01',
      type: 'workbook',
      section: 'conversation-grammar',
      source: 'GENKI I Workbook, Third Edition',
      page: 16,
      exercise: '第1課-1',
      title: 'Связка です',
      relatedGrammarIds: ['L1_g1'],
      estimatedMinutes: 10,
      required: true,
      completionMode: 'manual',
    },
  ],
};
const chapter2 = { id: 2, title: 'Chapter 2', words: [], notes: [], practice: [] };

describe('full integrated learning-plan chapter flow', () => {
  it('moves from the first batch to the next chapter without rewriting history', () => {
    const state = defaultState();
    state.initialized = true;
    state.activeChapterId = 1;
    state.chapters[1] = { started: true, checklist: {} };
    state.studyPlan = {
      startDate: '2026-07-26',
      deadline: '2026-07-30',
      studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      completedChapters: [],
      activeSegmentId: 'chapter-1',
      history: [],
      segments: [
        {
          id: 'chapter-1',
          type: 'chapter',
          chapterId: 1,
          assignedDates: ['2026-07-26', '2026-07-27', '2026-07-28'],
          vocabularySchedule: {
            '2026-07-26': 1,
            '2026-07-27': 1,
            '2026-07-28': 1,
          },
          dateStatuses: {},
        },
        {
          id: 'chapter-2',
          type: 'chapter',
          chapterId: 2,
          assignedDates: ['2026-07-29', '2026-07-30'],
          vocabularySchedule: { '2026-07-29': 0, '2026-07-30': 0 },
          dateStatuses: {},
        },
      ],
    };
    ensureChapterVocabularyCards(state, chapter1, { planLocked: true });

    const firstDay = getOrGenerateDailyPlan(state, {
      dateKey: '2026-07-26',
      chapterMeta: chapter1,
    });
    const firstVocabulary = firstDay.tasks.find((task) => task.type === 'vocabulary');
    expect(firstVocabulary.count).toBe(1);
    ensureTodayVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      plan: state.studyPlan,
      words: chapter1.words,
      limit: firstVocabulary.count,
    });

    const startSession = vi.fn();
    const session = startVocabularyBatchSession({
      state,
      chapterId: 1,
      dateKey: '2026-07-26',
      startSession,
    });
    expect(session).toMatchObject({ started: true, itemCount: 1, cardCount: 1 });
    const firstItemId = state.vocabularyUnlocks[1]['2026-07-26'].itemIds[0];
    state.reviewEvents.push({ eventType: 'review', eventId: 'r1', itemId: firstItemId });
    state.dailyPlan = null;

    const afterFirstBatch = getOrGenerateDailyPlan(state, {
      dateKey: '2026-07-26',
      chapterMeta: chapter1,
    });
    expect(afterFirstBatch.tasks.some((task) => task.sourceId === 'L1_g1')).toBe(true);
    expect(getGrammarTopicStatus(state, 1, 'L1_g1', chapter1)).toBe('unlocked');
    expect(
      completeGrammarTopicWithCheck(state, 1, 'L1_g1', {
        passed: true,
        score: 100,
      }).completed
    ).toBe(true);

    state.dailyPlan = null;
    const afterGrammar = getOrGenerateDailyPlan(state, {
      dateKey: '2026-07-26',
      chapterMeta: chapter1,
    });
    expect(afterGrammar.tasks.some((task) => task.sourceId === 'L01-wb-cg-01')).toBe(true);
    completePracticeTask(state, 1, 'L01-wb-cg-01', { chapters: [chapter1, chapter2] });

    const firstDaySnapshot = JSON.parse(JSON.stringify(state.dailyPlanHistory[0]));
    for (const [index, dateKey] of ['2026-07-27', '2026-07-28'].entries()) {
      state.dailyPlan = null;
      const plan = getOrGenerateDailyPlan(state, { dateKey, chapterMeta: chapter1 });
      const task = plan.tasks.find((entry) => entry.type === 'vocabulary');
      ensureTodayVocabularyBatch(state, 1, {
        dateKey,
        plan: state.studyPlan,
        words: chapter1.words,
        limit: task.count,
      });
      const itemId = state.vocabularyUnlocks[1][dateKey].itemIds[0];
      state.reviewEvents.push({
        eventType: 'review',
        eventId: `r${index + 2}`,
        itemId,
      });
    }

    completePracticeTask(state, 1, 'dialog', { chapters: [chapter1, chapter2] });
    completePracticeTask(state, 1, 'listening', { chapters: [chapter1, chapter2] });
    const finalPractice = completePracticeTask(state, 1, 'reading', {
      chapters: [chapter1, chapter2],
      now: 300,
    });

    expect(finalPractice.chapterCompletion).toMatchObject({
      changed: true,
      rewardGranted: true,
      activeChapterId: 2,
    });
    expect(state.chapters[1].completedAt).toBe(300);
    expect(state.activeChapterId).toBe(2);
    expect(state.studyPlan.completedChapters).toEqual([1]);
    expect(state.dailyPlanHistory[0]).toMatchObject({
      ...firstDaySnapshot,
      finalizedAt: expect.any(Number),
    });
    expect(state.dailyPlanHistory[0].tasks).toEqual(firstDaySnapshot.tasks);
    expect(state.studyPlan.segments[0].vocabularySchedule).toEqual({
      '2026-07-26': 1,
      '2026-07-27': 1,
      '2026-07-28': 1,
    });
  });
});
