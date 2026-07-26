import { describe, expect, it } from 'vitest';
import { defaultState } from '../state/store.js';
import { getOrGenerateDailyPlan } from '../src/daily-plan.js';
import { countRemainingLockedWords } from '../src/vocabulary-unlock-plan.js';
import { getPlanDateAvailability, StudyPlan } from '../studyplan.js';
import { reflowFutureVocabularySchedule } from '../src/vocabulary-schedule.js';
import { evaluateChapterCompletion, isChapterCompleted } from '../src/chapter-progress.js';
import { completeGrammarTopicWithCheck } from '../src/grammar-plan.js';
import { canUnlockPracticeTask } from '../src/practice-plan.js';

describe('Critical Issues & Domain Fixes', () => {
  it('1. Generates start-chapter task for unstarted chapters', () => {
    const state = defaultState();
    state.activeChapterId = 1;
    state.chapters[1] = { started: false, checklist: {} };
    state.studyPlan = {
      startDate: '2026-07-26',
      studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      segments: [{ type: 'chapter', chapterId: 1, assignedDates: ['2026-07-26'] }],
    };

    const chapterMeta = { id: 1, words: [{ id: 'w1' }], notes: [], practice: [] };
    const plan = getOrGenerateDailyPlan(state, { dateKey: '2026-07-26', chapterMeta });
    const startTask = plan.tasks.find((t) => t.type === 'start-chapter');
    expect(startTask).toBeDefined();
    expect(startTask.action).toEqual({ type: 'start-chapter', chapterId: 1 });
  });

  it('2. Counts words without SRS cards in incomplete chapters as locked', () => {
    const state = defaultState();
    state.chapters[1] = { started: false, checklist: {} };
    const lockedCount = countRemainingLockedWords(state, 1, [{ id: 'w1' }, { id: 'w2' }]);
    expect(lockedCount).toBe(2);
  });

  it('3. getPlanDateAvailability correctly identifies non-study days and paused state', () => {
    const plan = {
      paused: false,
      segments: [
        {
          type: 'chapter',
          chapterId: 1,
          assignedDates: ['2026-07-26', '2026-07-27'],
          dateStatuses: { '2026-07-27': 'rest-day' },
        },
      ],
    };

    expect(getPlanDateAvailability(plan, 1, '2026-07-26').isStudyDay).toBe(true);
    expect(getPlanDateAvailability(plan, 1, '2026-07-27').isStudyDay).toBe(false);
    expect(getPlanDateAvailability(plan, 1, '2026-07-27').reason).toBe('rest-day');

    expect(getPlanDateAvailability(plan, 1, '2026-07-28').isStudyDay).toBe(false);
    expect(getPlanDateAvailability(plan, 1, '2026-07-28').reason).toBe('not-assigned-date');

    plan.paused = true;
    expect(getPlanDateAvailability(plan, 1, '2026-07-26').isStudyDay).toBe(false);
    expect(getPlanDateAvailability(plan, 1, '2026-07-26').reason).toBe('plan-paused');
  });

  it('4. Reflows future vocabulary schedule on daily shortfall', () => {
    const segment = {
      assignedDates: ['2026-07-26', '2026-07-27', '2026-07-28'],
      vocabularySchedule: { '2026-07-26': 10, '2026-07-27': 10, '2026-07-28': 10 },
    };

    const reflowed = reflowFutureVocabularySchedule({
      segment,
      dateKey: '2026-07-26',
      scheduledCount: 10,
      actuallyUnlockedCount: 5,
      remainingLockedWords: 25,
    });

    expect(reflowed['2026-07-26']).toBe(5);
    expect(reflowed['2026-07-27'] + reflowed['2026-07-28']).toBe(25);
  });

  it('5. Reopens completed chapter when checklist items are undone', () => {
    const state = defaultState();
    state.chapters[1] = {
      started: true,
      completedAt: 100,
      checklist: { vocab: true, grammar: true, dialog: true, listening: true, reading: true },
    };
    state.studyPlan = {
      completedChapters: [1],
      segments: [{ type: 'chapter', chapterId: 1, status: 'completed' }],
    };

    const meta = {
      id: 1,
      sections: ['vocab', 'grammar', 'dialog', 'listening', 'reading'],
    };

    // Checklist complete
    expect(isChapterCompleted(state.chapters[1], meta, state)).toBe(true);

    // Undo an item
    state.chapters[1].checklist.reading = false;

    const result = evaluateChapterCompletion(state, 1, { chapters: [meta] });
    expect(result.reopened).toBe(true);
    expect(state.chapters[1].completedAt).toBeNull();
    expect(state.studyPlan.completedChapters).not.toContain(1);
    expect(state.studyPlan.segments[0].status).toBe('planned');
  });

  it('6. Rejects plan when workload exceeds time capacity', () => {
    const lessons = Array.from({ length: 3 }, (_, i) => ({
      id: i + 1,
      vocabCount: 50,
      grammarCount: 5,
      practiceCount: 5,
    }));

    const plan = StudyPlan.generatePlan(
      {
        startDate: '2026-07-26',
        totalDays: 20,
        studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        dailyGoalMinutes: 15,
      },
      lessons,
      []
    );

    expect(plan.error).toBeDefined();
    expect(plan.code).toBe('infeasible-workload');
  });

  it('7. Domain checks prevent completing locked grammar or practice tasks', () => {
    const state = defaultState();
    state.chapters[1] = { started: true, checklist: {} };

    // Locked grammar topic (prerequisites not met)
    const topic = { id: 'g2', prereqs: ['g1'] };
    const grammarRes = completeGrammarTopicWithCheck(
      state,
      1,
      'g2',
      { passed: true, score: 100 },
      { chapterMeta: { notes: [topic] } }
    );
    expect(grammarRes.reason).toBe('topic-locked');

    // Locked practice task (vocabulary not completed)
    const practiceTask = { id: 'p1', section: 'conversation-grammar' };
    const practiceRes = canUnlockPracticeTask(state, 1, practiceTask);
    expect(practiceRes.canUnlock).toBe(false);
    expect(practiceRes.reason).toBe('vocabulary-prerequisite-not-met');
  });
});
