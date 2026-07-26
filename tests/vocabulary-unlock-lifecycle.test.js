/* tests/vocabulary-unlock-lifecycle.test.js — Stage 2 Vocabulary Batch Lifecycle Integration Tests */
import { describe, it, expect, beforeEach } from 'vitest';
import { defaultState } from '../state/store.js';
import { State } from 'ts-fsrs';
import {
  ensureTodayVocabularyBatch,
  getOldestIncompleteVocabularyBatch,
  isVocabularyItemIntroduced,
  getVocabularyBatchProgress,
  getNextStudyAction,
  buildVocabularyBatchSessionQueue,
} from '../src/vocabulary-unlock-plan.js';
import { ensureChapterVocabularyCards } from '../src/chapter-vocabulary.js';
import { StudyPlan } from '../studyplan.js';

function makeMockLesson(chapterId, wordCount = 30) {
  const words = [];
  for (let i = 1; i <= wordCount; i++) {
    words.push({
      id: `L${chapterId}_word_${i}`,
      japanese: `Word ${i}`,
      english: `Meaning ${i}`,
      chapterId,
    });
  }
  return { id: chapterId, title: `Chapter ${chapterId}`, words };
}

describe('Stage 2: Full Lifecycle of Daily Vocabulary Batches', () => {
  let state;

  beforeEach(() => {
    state = defaultState();
  });

  it('1. Начало главы создаёт первую порцию', () => {
    const lesson = makeMockLesson(1, 30);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });
    state.chapters[1] = { started: true, startedAt: Date.now() };

    const res = ensureTodayVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      words: lesson.words,
    });

    expect(res.created).toBe(true);
    expect(res.unlockedCount).toBeGreaterThan(0);
    expect(state.vocabularyUnlocks[1]?.['2026-07-26']).toBeDefined();
    expect(state.vocabularyUnlocks[1]['2026-07-26'].itemIds.length).toBe(res.unlockedCount);
  });

  it('2. Следующий учебный день создаёт вторую порцию автоматически после завершения первой', () => {
    const lesson = makeMockLesson(1, 30);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });
    state.chapters[1] = { started: true };

    // Day 1: Unlock batch
    const res1 = ensureTodayVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      words: lesson.words,
    });
    expect(res1.created).toBe(true);
    const day1ItemIds = res1.unlockedItemIds;

    // Complete Day 1 batch by adding review events for all items
    day1ItemIds.forEach((itemId, idx) => {
      state.reviewEvents.push({
        eventId: `rev_${idx}`,
        eventType: 'review',
        itemId,
        cardId: `L1_${itemId}_rec`,
        reviewedAt: Date.now(),
      });
    });

    // Day 2: Auto-unlock second batch
    const res2 = ensureTodayVocabularyBatch(state, 1, {
      dateKey: '2026-07-27',
      words: lesson.words,
    });

    expect(res2.created).toBe(true);
    expect(res2.unlockedCount).toBeGreaterThan(0);
    expect(state.vocabularyUnlocks[1]['2026-07-27']).toBeDefined();
    // Second batch must not duplicate first batch items
    res2.unlockedItemIds.forEach((id) => {
      expect(day1ItemIds.includes(id)).toBe(false);
    });
  });

  it('3. Повторный рендер не создаёт новую порцию', () => {
    const lesson = makeMockLesson(1, 30);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });
    state.chapters[1] = { started: true };

    const res1 = ensureTodayVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      words: lesson.words,
    });
    expect(res1.created).toBe(true);

    const countBefore = res1.unlockedCount;

    // Second call on same date
    const res2 = ensureTodayVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      words: lesson.words,
    });

    expect(res2.created).toBe(false);
    expect(res2.alreadyUnlockedToday).toBe(true);
    expect(state.vocabularyUnlocks[1]['2026-07-26'].itemIds.length).toBe(countBefore);
  });

  it('4. Перезапуск приложения не создаёт дубликат', () => {
    const lesson = makeMockLesson(1, 30);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });
    state.chapters[1] = { started: true };

    ensureTodayVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      words: lesson.words,
    });

    // Simulate save & reload from IndexedDB
    const reloadedState = JSON.parse(JSON.stringify(state));

    const res = ensureTodayVocabularyBatch(reloadedState, 1, {
      dateKey: '2026-07-26',
      words: lesson.words,
    });

    expect(res.created).toBe(false);
    expect(res.alreadyUnlockedToday).toBe(true);
  });

  it('5. День отдыха не создаёт порцию', () => {
    const lesson = makeMockLesson(1, 30);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });
    state.chapters[1] = { started: true };

    // Plan where study days of week are Monday (1) and Wednesday (3)
    state.studyPlan = {
      startDate: '2026-07-27', // Monday
      deadline: '2026-08-10',
      studyDaysOfWeek: [1, 3],
      segments: [
        {
          type: 'chapter',
          chapterId: 1,
          assignedDates: ['2026-07-27', '2026-07-29'],
          dateStatuses: {
            '2026-07-28': 'rest-day',
          },
        },
      ],
    };

    // Tuesday 2026-07-28 is rest day
    const res = ensureTodayVocabularyBatch(state, 1, {
      dateKey: '2026-07-28',
      plan: state.studyPlan,
      words: lesson.words,
    });

    expect(res.created).toBe(false);
    expect(res.reason).toBe('rest-day');
  });

  it('6. Приостановленный План не создаёт порцию', () => {
    const lesson = makeMockLesson(1, 30);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });
    state.chapters[1] = { started: true };
    state.studyPlan = {
      startDate: '2026-07-26',
      studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      paused: true,
      segments: [{ type: 'chapter', chapterId: 1, assignedDates: ['2026-07-26'] }],
    };

    const res = ensureTodayVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      plan: state.studyPlan,
      words: lesson.words,
    });

    expect(res.created).toBe(false);
    expect(res.reason).toBe('plan-paused');
  });

  it('7. Незавершённая вчерашняя порция блокирует сегодняшнюю', () => {
    const lesson = makeMockLesson(1, 30);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });
    state.chapters[1] = { started: true };

    // Day 1 batch unlocked, but 0 reviews done
    ensureTodayVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      words: lesson.words,
    });

    // Day 2 attempt
    const res = ensureTodayVocabularyBatch(state, 1, {
      dateKey: '2026-07-27',
      words: lesson.words,
    });

    expect(res.created).toBe(false);
    expect(res.blockedByPreviousBatch).toBe(true);
    expect(res.previousBatchDateKey).toBe('2026-07-26');
  });

  it('8. После завершения старой порции новая открывается только при следующем допустимом вызове', () => {
    const lesson = makeMockLesson(1, 30);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });
    state.chapters[1] = { started: true };

    // Day 1 batch unlocked
    const res1 = ensureTodayVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      words: lesson.words,
    });

    // Day 2 attempt -> blocked
    const res2 = ensureTodayVocabularyBatch(state, 1, {
      dateKey: '2026-07-27',
      words: lesson.words,
    });
    expect(res2.blockedByPreviousBatch).toBe(true);

    // Complete Day 1 batch by adding reviews
    res1.unlockedItemIds.forEach((itemId, idx) => {
      state.reviewEvents.push({
        eventId: `rev_${idx}`,
        eventType: 'review',
        itemId,
        reviewedAt: Date.now(),
      });
    });

    // Verify Day 2 batch is NOT unlocked immediately just by completing Day 1
    expect(state.vocabularyUnlocks[1]['2026-07-27']).toBeUndefined();

    // Call coordinator on Day 2 -> now unlocks!
    const res3 = ensureTodayVocabularyBatch(state, 1, {
      dateKey: '2026-07-27',
      words: lesson.words,
    });

    expect(res3.created).toBe(true);
    expect(state.vocabularyUnlocks[1]['2026-07-27']).toBeDefined();
  });

  it('9. Batch-сессия содержит только нужные itemIds', () => {
    const lesson1 = makeMockLesson(1, 10);
    const lesson2 = makeMockLesson(2, 10);
    ensureChapterVocabularyCards(state, lesson1, { planLocked: true });
    ensureChapterVocabularyCards(state, lesson2, { planLocked: true });
    state.chapters[1] = { started: true };

    // Unlock batch for chapter 1
    const res = ensureTodayVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      words: lesson1.words,
    });

    const queue = buildVocabularyBatchSessionQueue(state, 1, '2026-07-26');

    expect(queue.length).toBeGreaterThan(0);
    // All cards in queue must belong to chapter 1 batch itemIds
    const allowedSet = new Set(res.unlockedItemIds);
    queue.forEach((card) => {
      expect(card.planLocked).toBe(false);
      expect(card.id.startsWith('L1_')).toBe(true);
      const itemId = card.id.split('_').slice(0, 3).join('_');
      expect(allowedSet.has(itemId)).toBe(true);
    });
  });

  it('10. Главная кнопка и карточка дня выбирают одинаковое действие', () => {
    const lesson = makeMockLesson(1, 20);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });
    state.chapters[1] = { started: true };
    state.activeChapterId = 1;

    // Create today's batch
    ensureTodayVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      words: lesson.words,
    });

    const action = getNextStudyAction(state, {
      activeChapterId: 1,
      today: '2026-07-26',
    });

    expect(action.type).toBe('today-vocab-batch');
    expect(action.action).toBe('vocab-session');
    expect(action.chapterId).toBe(1);
    expect(action.title).toBe('Новые слова');
  });

  it('11. Undo возвращает слово в незавершённое состояние', () => {
    const itemId = 'L1_word_1';
    state.srs = {
      [`L1_${itemId}_rec`]: { id: `L1_${itemId}_rec`, reps: 0, state: State.New },
    };

    expect(isVocabularyItemIntroduced(state, itemId)).toBe(false);

    // Add review event
    const revEvent = {
      eventId: 'rev_1',
      eventType: 'review',
      itemId,
      cardId: `L1_${itemId}_rec`,
      reviewedAt: Date.now(),
    };
    state.reviewEvents = [revEvent];

    expect(isVocabularyItemIntroduced(state, itemId)).toBe(true);

    // Undo event
    revEvent.undoneAt = Date.now();

    expect(isVocabularyItemIntroduced(state, itemId)).toBe(false);
  });

  it('12. Просмотр главы не завершает задачу', () => {
    const lesson = makeMockLesson(1, 10);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });
    state.chapters[1] = { started: true };

    ensureTodayVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      words: lesson.words,
    });

    const progressBefore = getVocabularyBatchProgress(state, 1, '2026-07-26');
    expect(progressBefore.completed).toBe(0);
    expect(progressBefore.isCompleted).toBe(false);

    // Simulate viewing chapter screen / reading properties
    const active = state.chapters[1];
    expect(active.started).toBe(true);

    const progressAfter = getVocabularyBatchProgress(state, 1, '2026-07-26');
    expect(progressAfter.completed).toBe(0);
    expect(progressAfter.isCompleted).toBe(false);
  });

  it('13. Полное прохождение порции помечает её выполненной', () => {
    const lesson = makeMockLesson(1, 5);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });
    state.chapters[1] = { started: true };

    const res = ensureTodayVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      words: lesson.words,
    });

    const itemIds = res.unlockedItemIds;
    expect(itemIds.length).toBe(5);

    itemIds.forEach((itemId, idx) => {
      state.reviewEvents.push({
        eventId: `rev_${idx}`,
        eventType: 'review',
        itemId,
        reviewedAt: Date.now(),
      });
    });

    const progress = getVocabularyBatchProgress(state, 1, '2026-07-26');
    expect(progress.completed).toBe(5);
    expect(progress.remaining).toBe(0);
    expect(progress.isCompleted).toBe(true);
  });

  it('14. После завершения всех слов новые порции не создаются', () => {
    const lesson = makeMockLesson(1, 5);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });
    state.chapters[1] = { started: true };

    // Unlock all words (limit 5)
    ensureTodayVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      limit: 5,
      words: lesson.words,
    });

    // Complete day 1
    lesson.words.forEach((w, idx) => {
      state.reviewEvents.push({
        eventId: `rev_${idx}`,
        eventType: 'review',
        itemId: w.id,
        reviewedAt: Date.now(),
      });
    });

    // Try unlocking next day when no locked words remain
    const res = ensureTodayVocabularyBatch(state, 1, {
      dateKey: '2026-07-27',
      words: lesson.words,
    });

    expect(res.created).toBe(false);
    expect(res.reason).toBe('chapter-completed');
  });

  it('15. Пересчёт Плана не создаёт порцию задним числом', () => {
    const lesson = makeMockLesson(1, 20);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });
    state.chapters[1] = { started: true };

    state.studyPlan = StudyPlan.generatePlan(
      { startDate: '2026-07-20', totalDays: 14, studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
      [lesson]
    );

    // Recalculate plan today '2026-07-26'
    const recalcResult = StudyPlan.recalculateFuturePlan(state.studyPlan, [lesson], [], {
      today: '2026-07-26',
    });
    state.studyPlan = recalcResult;

    // Check unlocks: no retroactive unlocks created for past dates
    const unlocks = state.vocabularyUnlocks[1] || {};
    expect(unlocks['2026-07-20']).toBeUndefined();
    expect(unlocks['2026-07-21']).toBeUndefined();
    expect(unlocks['2026-07-25']).toBeUndefined();
  });
});
