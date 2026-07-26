import { describe, test, expect } from 'vitest';
import { completePracticeTask } from '../src/practice-plan.js';
import { completeGrammarTopicWithCheck } from '../src/grammar-plan.js';

describe('Domain Safeguards for Practice & Grammar Completion', () => {
  const mockChapterMeta = {
    id: 1,
    lesson_id: 1,
    notes: [{ id: 'L1_g1', title: 'Topic 1' }],
    practice: [{ id: 'L1_p1', type: 'workbook', section: 'conversation-grammar', required: true }],
  };

  test('completePracticeTask fails with task-not-found for arbitrary unknown task IDs', () => {
    const state = {
      chapters: {
        1: { started: true, checklist: {} },
      },
      workbookSettings: { enabled: true },
    };

    const res = completePracticeTask(state, 1, 'NON_EXISTENT_TASK_ID_999', {
      chapterMeta: mockChapterMeta,
    });

    expect(res.changed).toBe(false);
    expect(res.completedNow).toBeUndefined();
    expect(res.reason).toBe('task-not-found');
    expect(state.chapters[1].checklist['NON_EXISTENT_TASK_ID_999']).toBeUndefined();
  });

  test('completePracticeTask fails when chapter is not started', () => {
    const state = {
      chapters: {
        1: { started: false, checklist: {} },
      },
    };

    const res = completePracticeTask(state, 1, 'dialog', {
      chapterMeta: mockChapterMeta,
    });

    expect(res.changed).toBe(false);
    expect(res.reason).toBe('chapter-not-started');
  });

  test('completeGrammarTopicWithCheck fails with topic-not-found for unknown topic IDs', () => {
    const state = {
      chapters: {
        1: { started: true, checklist: {} },
      },
    };

    const res = completeGrammarTopicWithCheck(
      state,
      1,
      'UNKNOWN_TOPIC_ID',
      { passed: true, score: 100 },
      { chapterMeta: mockChapterMeta }
    );

    expect(res.changed).toBe(false);
    expect(res.reason).toBe('topic-not-found');
    expect(state.chapters[1].checklist['UNKNOWN_TOPIC_ID']).toBeUndefined();
  });

  test('completeGrammarTopicWithCheck fails when chapter is not started', () => {
    const state = {
      chapters: {
        1: { started: false, checklist: {} },
      },
    };

    const res = completeGrammarTopicWithCheck(
      state,
      1,
      'L1_g1',
      { passed: true, score: 100 },
      { chapterMeta: mockChapterMeta }
    );

    expect(res.changed).toBe(false);
    expect(res.reason).toBe('chapter-not-started');
  });
});
