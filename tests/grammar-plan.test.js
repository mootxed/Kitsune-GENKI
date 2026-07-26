import { describe, it, expect, beforeEach } from 'vitest';
import { defaultState } from '../state/store.js';
import {
  canUnlockNextGrammarTopic,
  completeGrammarTopicWithCheck,
  getGrammarTopicStatus,
  isFirstVocabularyBatchCompleted,
  unlockDailyGrammarTopic,
} from '../src/grammar-plan.js';

const MOCK_LESSON = {
  id: 2,
  lesson_id: 2,
  title: 'Урок 2',
  words: [{ id: 'L2_V001' }, { id: 'L2_V002' }],
  notes: [
    { note_id: 1, title: 'Грамматика 1: これ, それ', content: '...' },
    { note_id: 2, title: 'Грамматика 2: この, その', content: '...' },
  ],
};

describe('Task 4: Gradual Grammar Delivery (src/grammar-plan.js)', () => {
  let appState;

  beforeEach(() => {
    appState = defaultState();
    appState.chapters[2] = { started: true, checklist: {} };
    appState.studyPlan = {
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

  it('1. Не выдаёт грамматику до завершения первой словарной порции', () => {
    const decision = canUnlockNextGrammarTopic(appState, 2, {
      dateKey: '2026-07-26',
      chapterMeta: MOCK_LESSON,
    });
    expect(decision.canUnlock).toBe(false);
    expect(decision.reason).toBe('vocabulary-prerequisite-not-met');
  });

  it('2. Открывает первую тему грамматики после завершения первой словарной порции', () => {
    appState.vocabularyUnlocks = {
      2: {
        '2026-07-26': { itemIds: ['L2_V001'], occurredAt: Date.now() },
      },
    };
    appState.reviewEvents = [{ eventType: 'review', itemId: 'L2_V001', reviewedAt: Date.now() }];

    expect(isFirstVocabularyBatchCompleted(appState, 2, '2026-07-26')).toBe(true);

    const unlockRes = unlockDailyGrammarTopic(appState, 2, {
      dateKey: '2026-07-26',
      chapterMeta: MOCK_LESSON,
    });
    expect(unlockRes.unlocked).toBe(true);
    expect(unlockRes.topic.id).toBe('L2_g1');
    expect(getGrammarTopicStatus(appState, 2, 'L2_g1', MOCK_LESSON)).toBe('unlocked');
  });

  it('3. Выдаёт не более 1 темы за учебный день', () => {
    appState.vocabularyUnlocks = {
      2: { '2026-07-26': { itemIds: ['L2_V001'] } },
    };
    appState.reviewEvents = [{ eventType: 'review', itemId: 'L2_V001' }];

    unlockDailyGrammarTopic(appState, 2, { dateKey: '2026-07-26', chapterMeta: MOCK_LESSON });

    const secondTry = unlockDailyGrammarTopic(appState, 2, {
      dateKey: '2026-07-26',
      chapterMeta: MOCK_LESSON,
    });
    expect(secondTry.unlocked).toBe(false);
    expect(secondTry.reason).toBe('already-unlocked-today');
  });

  it('4. Не открывает следующую тему, пока предыдущая не завершена', () => {
    appState.vocabularyUnlocks = {
      2: { '2026-07-26': { itemIds: ['L2_V001'] } },
    };
    appState.reviewEvents = [{ eventType: 'review', itemId: 'L2_V001' }];
    unlockDailyGrammarTopic(appState, 2, { dateKey: '2026-07-26', chapterMeta: MOCK_LESSON });

    // В следующий день первая тема ещё не завершена (статус unlocked, но не completed)
    const nextDayRes = unlockDailyGrammarTopic(appState, 2, {
      dateKey: '2026-07-27',
      chapterMeta: MOCK_LESSON,
    });
    expect(nextDayRes.unlocked).toBe(false);
    expect(nextDayRes.reason).toBe('previous-topic-incomplete');
  });

  it('5. Прохождение короткой проверки успешно завершает грамматическую тему', () => {
    appState.vocabularyUnlocks = {
      2: { '2026-07-26': { itemIds: ['L2_V001'] } },
    };
    appState.reviewEvents = [{ eventType: 'review', itemId: 'L2_V001' }];
    unlockDailyGrammarTopic(appState, 2, { dateKey: '2026-07-26', chapterMeta: MOCK_LESSON });

    const checkRes = completeGrammarTopicWithCheck(appState, 2, 'L2_g1', {
      passed: true,
      score: 100,
    });
    expect(checkRes.completed).toBe(true);
    expect(getGrammarTopicStatus(appState, 2, 'L2_g1', MOCK_LESSON)).toBe('completed');

    // На следующий день теперь можно открыть L2_g2
    const nextDayRes = unlockDailyGrammarTopic(appState, 2, {
      dateKey: '2026-07-27',
      chapterMeta: MOCK_LESSON,
    });
    expect(nextDayRes.unlocked).toBe(true);
    expect(nextDayRes.topic.id).toBe('L2_g2');
  });

  it('6. Не открывает грамматику в день отдыха', () => {
    appState.studyPlan.segments[0].dateStatuses['2026-07-26'] = 'rest-day';
    appState.vocabularyUnlocks = {
      2: { '2026-07-26': { itemIds: ['L2_V001'] } },
    };
    appState.reviewEvents = [{ eventType: 'review', itemId: 'L2_V001' }];

    const res = unlockDailyGrammarTopic(appState, 2, {
      dateKey: '2026-07-26',
      chapterMeta: MOCK_LESSON,
    });
    expect(res.unlocked).toBe(false);
    expect(res.reason).toBe('rest-day');
  });
});
