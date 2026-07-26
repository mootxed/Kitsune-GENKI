import { describe, it, expect, beforeEach } from 'vitest';
import { defaultState } from '../state/store.js';
import {
  canUnlockPracticeTask,
  completePracticeTask,
  getChapterPracticeTasks,
  undoPracticeTask,
} from '../src/practice-plan.js';
import { completeGrammarTopicWithCheck, unlockDailyGrammarTopic } from '../src/grammar-plan.js';

const MOCK_LESSON = {
  id: 2,
  lesson_id: 2,
  title: 'Урок 2',
  words: [{ id: 'L2_V001' }],
  notes: [
    { note_id: 1, title: 'Грамматика 1: これ, それ' },
    { note_id: 2, title: 'Грамматика 2: この, その' },
  ],
  practice: [
    {
      id: 'L02-workbook-1a',
      type: 'workbook',
      source: 'GENKI Workbook',
      page: 18,
      exercise: 'I-A',
      title: 'Закрепить これ / それ / あれ',
      relatedGrammarIds: ['L2_g1'],
      estimatedMinutes: 10,
      required: true,
    },
    {
      id: 'L02-workbook-1b',
      type: 'workbook',
      source: 'GENKI Workbook',
      page: 19,
      exercise: 'I-B',
      title: 'Практика この / その / あの',
      relatedGrammarIds: ['L2_g2'],
      estimatedMinutes: 10,
      required: true,
    },
  ],
};

describe('Task 5: GENKI Workbook & Practice Tasks (src/practice-plan.js)', () => {
  let appState;

  beforeEach(() => {
    appState = defaultState();
    appState.chapters[2] = { started: true, checklist: {} };
    appState.vocabularyUnlocks = {
      2: { '2026-07-26': { itemIds: ['L2_V001'] } },
    };
    appState.reviewEvents = [{ eventType: 'review', itemId: 'L2_V001' }];
  });

  it('1. Извлекает метаданные заданий GENKI Workbook из описания главы', () => {
    const tasks = getChapterPracticeTasks(MOCK_LESSON);
    expect(tasks).toHaveLength(5);
    expect(tasks.slice(2).map((task) => task.id)).toEqual(['dialog', 'listening', 'reading']);
    expect(tasks[0]).toMatchObject({
      id: 'L02-workbook-1a',
      type: 'workbook',
      source: 'GENKI Workbook',
      page: 18,
      exercise: 'I-A',
      relatedGrammarIds: ['L2_g1'],
    });
  });

  it('2. Не открывает задание практики, пока не пройдены связанные темы грамматики', () => {
    const task = MOCK_LESSON.practice[0];
    const resBefore = canUnlockPracticeTask(appState, 2, task, MOCK_LESSON);
    expect(resBefore.canUnlock).toBe(false);
    expect(resBefore.reason).toBe('grammar-prerequisite-not-met');

    // Проходим тему L2_g1
    unlockDailyGrammarTopic(appState, 2, { dateKey: '2026-07-26', chapterMeta: MOCK_LESSON });
    completeGrammarTopicWithCheck(appState, 2, 'L2_g1', { passed: true });

    const resAfter = canUnlockPracticeTask(appState, 2, task, MOCK_LESSON);
    expect(resAfter.canUnlock).toBe(true);
  });

  it('3. Ручная отметка выполнения задания записывает learningEvent', () => {
    unlockDailyGrammarTopic(appState, 2, { dateKey: '2026-07-26', chapterMeta: MOCK_LESSON });
    completeGrammarTopicWithCheck(appState, 2, 'L2_g1', { passed: true });

    const res = completePracticeTask(appState, 2, 'L02-workbook-1a', { dateKey: '2026-07-26' });
    expect(res.changed).toBe(true);
    expect(appState.chapters[2].checklist['L02-workbook-1a']).toBe(true);

    const event = appState.learningEvents.find(
      (e) => e.eventType === 'practice-task-completed' && e.taskId === 'L02-workbook-1a'
    );
    expect(event).toBeDefined();
    expect(event.dateKey).toBe('2026-07-26');
  });

  it('4. Поддерживает Undo (отмену) выполнения практического задания', () => {
    unlockDailyGrammarTopic(appState, 2, { dateKey: '2026-07-26', chapterMeta: MOCK_LESSON });
    completeGrammarTopicWithCheck(appState, 2, 'L2_g1', { passed: true });
    completePracticeTask(appState, 2, 'L02-workbook-1a');

    expect(appState.chapters[2].checklist['L02-workbook-1a']).toBe(true);

    const undoRes = undoPracticeTask(appState, 2, 'L02-workbook-1a');
    expect(undoRes.changed).toBe(true);
    expect(appState.chapters[2].checklist['L02-workbook-1a']).toBe(false);

    const reopenEvent = appState.learningEvents.find(
      (e) => e.eventType === 'practice-task-reopened' && e.taskId === 'L02-workbook-1a'
    );
    expect(reopenEvent).toBeDefined();
  });

  it('5. Повторное завершение после Undo не позволяет фармить XP', () => {
    appState.chapters[2].checklist.L2_g1 = true;
    const first = completePracticeTask(appState, 2, 'L02-workbook-1a', { now: 100 });
    undoPracticeTask(appState, 2, 'L02-workbook-1a', { now: 150 });
    const second = completePracticeTask(appState, 2, 'L02-workbook-1a', { now: 200 });
    expect(first.rewardGranted).toBe(true);
    expect(second.rewardGranted).toBe(false);
    expect(
      appState.learningEvents.filter((event) => event.eventType === 'practice-task-completed')
    ).toHaveLength(1);
  });

  it('6. reading-writing открывается строго по порядку', () => {
    const chapter = {
      ...MOCK_LESSON,
      practice: [
        {
          id: 'rw-1',
          type: 'workbook',
          section: 'reading-writing',
          title: 'Чтение 1',
          relatedGrammarIds: [],
        },
        {
          id: 'rw-2',
          type: 'workbook',
          section: 'reading-writing',
          title: 'Чтение 2',
          relatedGrammarIds: [],
        },
      ],
    };
    expect(canUnlockPracticeTask(appState, 2, chapter.practice[0], chapter).canUnlock).toBe(true);
    expect(canUnlockPracticeTask(appState, 2, chapter.practice[1], chapter)).toMatchObject({
      canUnlock: false,
      reason: 'previous-practice-incomplete',
    });
    appState.chapters[2].checklist['rw-1'] = true;
    expect(canUnlockPracticeTask(appState, 2, chapter.practice[1], chapter).canUnlock).toBe(true);
  });
});
