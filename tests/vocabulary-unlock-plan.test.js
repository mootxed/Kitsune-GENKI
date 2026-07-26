/* tests/vocabulary-unlock-plan.test.js — Tests for gradual vocabulary unlocking */
import { describe, it, expect, beforeEach } from 'vitest';
import { defaultState } from '../state/store.js';
import { SRS } from '../srs.js';
import { State } from 'ts-fsrs';
import {
  DEFAULT_DAILY_NEW_VOCABULARY_LIMIT,
  FALLBACK_DAILY_NEW_VOCABULARY_LIMIT,
  MIN_DAILY_VOCABULARY_TARGET,
  MAX_DAILY_VOCABULARY_TARGET,
  unlockDailyVocabularyBatch,
  getVocabularyBatchProgress,
  normalizeVocabularyLockState,
  countRemainingLockedWords,
  calculateDailyVocabularyTarget,
  getRemainingChapterStudyDates,
  distributeVocabularyAcrossDates,
  getTodayVocabularyUnlockDecision,
} from '../src/vocabulary-unlock-plan.js';
import { ensureChapterVocabularyCards } from '../src/chapter-vocabulary.js';
import { dueCards, allCards } from '../src/srs-helpers.js';
import { limitNewCardsForSession, countAvailableCardsForSession } from '../src/srs-limits.js';
import { validateImportData } from '../src/backup-manager.js';

function makeMockLesson(chapterId, wordCount) {
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

describe('Vocabulary Unlock Plan', () => {
  let state;

  beforeEach(() => {
    state = defaultState();
  });

  it('1. Upon starting a chapter with 60 words, exactly the first 17 are unlocked', () => {
    const lesson = makeMockLesson(1, 60);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });

    const result = unlockDailyVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      limit: DEFAULT_DAILY_NEW_VOCABULARY_LIMIT,
      words: lesson.words,
    });

    expect(result.unlockedCount).toBe(17);
    expect(result.unlockedItemIds.length).toBe(17);
    expect(result.remainingLockedCount).toBe(43);
  });

  it('2. The remaining 43 cards exist in storage but are excluded from dueCards and allCards', () => {
    const lesson = makeMockLesson(1, 60);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });
    unlockDailyVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      words: lesson.words,
    });

    const due = dueCards(state.srs, 1);
    const unlocked = allCards(state.srs, 1, false);
    const totalWithLocked = allCards(state.srs, 1, true);

    expect(due.length).toBe(17);
    expect(unlocked.length).toBe(17);
    expect(totalWithLocked.length).toBe(60);
    expect(countAvailableCardsForSession(dueCards(state.srs, 1), state.srs)).toBe(17);
  });

  it('3. Repeated call on the same day does not unlock another 17 words', () => {
    const lesson = makeMockLesson(1, 60);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });

    const first = unlockDailyVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      words: lesson.words,
    });
    const second = unlockDailyVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      words: lesson.words,
    });

    expect(first.unlockedCount).toBe(17);
    expect(second.alreadyUnlockedToday).toBe(true);
    expect(second.unlockedCount).toBe(0);
    expect(countRemainingLockedWords(state, 1, lesson.words)).toBe(43);
  });

  it('4. On the next day, the next portion is unlocked if previous batch is completed', () => {
    const lesson = makeMockLesson(1, 60);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });

    const day1 = unlockDailyVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      words: lesson.words,
    });
    // Mark day 1 cards completed
    const unlockedSet = new Set(day1.unlockedItemIds);
    Object.values(state.srs).forEach((c) => {
      if (unlockedSet.has(c.id) || (c.id && unlockedSet.has(c.id.split(':')[1]))) {
        c.reps = 1;
        c.state = State.Review;
      }
    });

    const day2 = unlockDailyVocabularyBatch(state, 1, {
      dateKey: '2026-07-27',
      words: lesson.words,
    });

    expect(day2.unlockedCount).toBe(17);
    expect(day2.remainingLockedCount).toBe(26);
    expect(allCards(state.srs, 1, false).length).toBe(34);
  });

  it('5. The last portion can be smaller than 17', () => {
    const lesson = makeMockLesson(1, 40);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });

    const b1 = unlockDailyVocabularyBatch(state, 1, { dateKey: '2026-07-26', words: lesson.words }); // 17
    const s1 = new Set(b1.unlockedItemIds);
    Object.values(state.srs).forEach((c) => {
      if (s1.has(c.id) || (c.id && s1.has(c.id.split(':')[1]))) {
        c.reps = 1;
        c.state = State.Review;
      }
    });

    const b2 = unlockDailyVocabularyBatch(state, 1, { dateKey: '2026-07-27', words: lesson.words }); // 17
    const s2 = new Set(b2.unlockedItemIds);
    Object.values(state.srs).forEach((c) => {
      if (s2.has(c.id) || (c.id && s2.has(c.id.split(':')[1]))) {
        c.reps = 1;
        c.state = State.Review;
      }
    });

    const day3 = unlockDailyVocabularyBatch(state, 1, {
      dateKey: '2026-07-28',
      words: lesson.words,
    }); // 6

    expect(day3.unlockedCount).toBe(6);
    expect(day3.remainingLockedCount).toBe(0);
    expect(allCards(state.srs, 1, false).length).toBe(40);
  });

  it('6. A chapter with 10 words unlocks all 10 words immediately', () => {
    const lesson = makeMockLesson(1, 10);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });

    const result = unlockDailyVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      words: lesson.words,
    });

    expect(result.unlockedCount).toBe(10);
    expect(result.remainingLockedCount).toBe(0);
  });

  it('7. Existing cards with history are not locked by migration', () => {
    state.srs['L1_word_1'] = SRS.newCard('L1_word_1', { planLocked: true });
    state.srs['L1_word_1'].reps = 5;
    state.srs['L1_word_1'].state = State.Review;

    normalizeVocabularyLockState(state);

    expect(state.srs['L1_word_1'].planLocked).toBe(false);
  });

  it('8. Previously studied chapter cards (priorKnowledgeChapterIds) are not locked', () => {
    state.priorKnowledgeChapterIds = [1];
    const lesson = makeMockLesson(1, 20);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });

    const unlocked = allCards(state.srs, 1, false);
    expect(unlocked.length).toBe(20);
    expect(Object.values(state.srs).every((c) => c.planLocked === false)).toBe(true);
  });

  it('9. Re-encountered already studied word does not consume limit of new portion', () => {
    // Word 1 already studied in Chapter 1
    state.srs['L1_word_1'] = SRS.newCard('L1_word_1', { planLocked: false });
    state.srs['L1_word_1'].reps = 1;

    // Chapter 2 lesson contains L1_word_1 and 20 new words
    const words = [{ id: 'L1_word_1', chapterId: 2 }, ...makeMockLesson(2, 20).words];
    const lesson = { id: 2, words };

    ensureChapterVocabularyCards(state, lesson, { planLocked: true });

    const result = unlockDailyVocabularyBatch(state, 2, { dateKey: '2026-07-26', words });

    // L1_word_1 is already unlocked, so batch picks 17 NEW locked words from Ch 2
    expect(result.unlockedCount).toBe(17);
    expect(result.unlockedItemIds.includes('L1_word_1')).toBe(false);
  });

  it('10. planLocked cards are excluded from dueCards and available session counters', () => {
    const lesson = makeMockLesson(1, 30);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });

    expect(dueCards(state.srs, 1).length).toBe(0);
    expect(countAvailableCardsForSession(dueCards(state.srs, 1), state.srs)).toBe(0);
  });

  it('11. Overdue and normal due cards come before today new words in session limit', () => {
    state.srs['review_1'] = SRS.newCard('review_1', { planLocked: false });
    state.srs['review_1'].state = State.Review;
    state.srs['review_1'].due = Date.now() - 10000; // Overdue

    state.srs['new_1'] = SRS.newCard('new_1', { planLocked: false });
    state.srs['new_1'].state = State.New;

    const due = dueCards(state.srs);
    const session = limitNewCardsForSession(due, state.srs);

    expect(session[0].id).toBe('review_1');
  });

  it('12. Daily task is not completed just by opening screen', () => {
    const lesson = makeMockLesson(1, 10);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });
    unlockDailyVocabularyBatch(state, 1, { dateKey: '2026-07-26', words: lesson.words });

    const progress = getVocabularyBatchProgress(state, 1, '2026-07-26');
    expect(progress.isCompleted).toBe(false);
    expect(progress.started).toBe(0);
    expect(progress.completed).toBe(0);
  });

  it('13. Daily task progress updates after real review events', () => {
    const lesson = makeMockLesson(1, 2);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });
    unlockDailyVocabularyBatch(state, 1, { dateKey: '2026-07-26', words: lesson.words });

    // Review card for L1_word_1
    state.srs['L1_word_1'].reps = 1;
    state.srs['L1_word_1'].state = State.Learning;
    state.reviewEvents = [
      {
        eventId: 'rev_1',
        cardId: 'L1_word_1',
        itemId: 'L1_word_1',
        eventType: 'review',
        firstAttemptCorrect: true,
        reviewedAt: Date.now(),
      },
    ];

    const progress = getVocabularyBatchProgress(state, 1, '2026-07-26');
    expect(progress.started).toBe(1);
    expect(progress.completed).toBe(1);
    expect(progress.isCompleted).toBe(false);

    // Review L1_word_2
    state.srs['L1_word_2'].reps = 1;
    state.srs['L1_word_2'].state = State.Learning;
    state.reviewEvents.push({
      eventId: 'rev_2',
      cardId: 'L1_word_2',
      itemId: 'L1_word_2',
      eventType: 'review',
      firstAttemptCorrect: true,
      reviewedAt: Date.now(),
    });

    const finalProgress = getVocabularyBatchProgress(state, 1, '2026-07-26');
    expect(finalProgress.completed).toBe(2);
    expect(finalProgress.isCompleted).toBe(true);
  });

  it('14. Rest day does not automatically unlock a new portion', () => {
    const lesson = makeMockLesson(1, 30);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });
    unlockDailyVocabularyBatch(state, 1, { dateKey: '2026-07-26', words: lesson.words });

    // No unlock call on rest day 2026-07-27
    const remaining = countRemainingLockedWords(state, 1, lesson.words);
    expect(remaining).toBe(13);
  });

  it('15. Repeated render/access does not change count of unlocked words', () => {
    const lesson = makeMockLesson(1, 30);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });
    unlockDailyVocabularyBatch(state, 1, { dateKey: '2026-07-26', words: lesson.words });

    const unlockedBefore = allCards(state.srs, 1, false).length;
    unlockDailyVocabularyBatch(state, 1, { dateKey: '2026-07-26', words: lesson.words });
    const unlockedAfter = allCards(state.srs, 1, false).length;

    expect(unlockedBefore).toBe(17);
    expect(unlockedAfter).toBe(17);
  });

  it('16. Backup export and import preserve vocabularyUnlocks state', async () => {
    const lesson = makeMockLesson(1, 20);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });
    unlockDailyVocabularyBatch(state, 1, { dateKey: '2026-07-26', words: lesson.words });

    const exportData = {
      app: 'kitsune_genki',
      exportType: 'full_localstorage',
      schemaVersion: '5.0',
      timestamp: new Date().toISOString(),
      data: { state },
    };

    const validation = validateImportData(exportData);
    expect(validation.valid).toBe(true);
    expect(validation.data.data.state.vocabularyUnlocks['1']['2026-07-26']).toBeDefined();
  });

  it('17. Undo of review event reverts daily task progress', () => {
    const lesson = makeMockLesson(1, 1);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });
    unlockDailyVocabularyBatch(state, 1, { dateKey: '2026-07-26', words: lesson.words });

    const ev = {
      eventId: 'rev_1',
      cardId: 'L1_word_1',
      itemId: 'L1_word_1',
      eventType: 'review',
      firstAttemptCorrect: true,
      reviewedAt: Date.now(),
      undoneAt: null,
    };
    state.reviewEvents = [ev];
    state.srs['L1_word_1'].reps = 1;

    expect(getVocabularyBatchProgress(state, 1, '2026-07-26').isCompleted).toBe(true);

    // Undo event
    ev.undoneAt = Date.now();
    state.srs['L1_word_1'].reps = 0;
    state.srs['L1_word_1'].state = State.New;

    expect(getVocabularyBatchProgress(state, 1, '2026-07-26').isCompleted).toBe(false);
  });
});

describe('Stage 1: Dynamic Daily Vocabulary Batch Calculations', () => {
  let state;

  beforeEach(() => {
    state = defaultState();
  });

  it('1. 60 words and 4 study days are distributed evenly', () => {
    const dist = distributeVocabularyAcrossDates(60, [
      '2026-07-26',
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
    ]);
    expect(dist).toEqual({
      '2026-07-26': 15,
      '2026-07-27': 15,
      '2026-07-28': 15,
      '2026-07-29': 15,
    });
  });

  it('2. 57 words and 4 study days give close portions with difference <= 1', () => {
    const dist = distributeVocabularyAcrossDates(57, [
      '2026-07-26',
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
    ]);
    expect(dist).toEqual({
      '2026-07-26': 15,
      '2026-07-27': 14,
      '2026-07-28': 14,
      '2026-07-29': 14,
    });
  });

  it('3. Uses reserve day when 3 or more study days are available if target <= 25', () => {
    const res = calculateDailyVocabularyTarget({ remainingWords: 40, remainingStudyDays: 3 });
    expect(res.reserveDays).toBe(1);
    expect(res.effectiveVocabularyDays).toBe(2);
    expect(res.target).toBe(20);
    expect(res.insufficientDays).toBe(false);
  });

  it('4. Does not use reserve day when only 2 study days remain', () => {
    const res = calculateDailyVocabularyTarget({ remainingWords: 30, remainingStudyDays: 2 });
    expect(res.reserveDays).toBe(0);
    expect(res.effectiveVocabularyDays).toBe(2);
    expect(res.target).toBe(15);
    expect(res.insufficientDays).toBe(false);
  });

  it('5. After 17 words already unlocked, remaining words are recalculated over remaining dates', () => {
    const lesson = makeMockLesson(1, 57);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });

    // Day 1 unlocks 17
    const day1 = unlockDailyVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      limit: 17,
      words: lesson.words,
    });
    expect(day1.remainingLockedCount).toBe(40);

    // Complete day 1
    const uSet = new Set(day1.unlockedItemIds);
    Object.values(state.srs).forEach((c) => {
      if (uSet.has(c.id) || (c.id && uSet.has(c.id.split(':')[1]))) {
        c.reps = 1;
        c.state = State.Review;
      }
    });

    const mockPlan = {
      studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      segments: [
        {
          type: 'chapter',
          chapterId: 1,
          assignedDates: ['2026-07-26', '2026-07-27', '2026-07-28', '2026-07-29'],
        },
      ],
    };

    const decision = getTodayVocabularyUnlockDecision(state, 1, {
      plan: mockPlan,
      dateKey: '2026-07-27',
      words: lesson.words,
    });

    // 40 words over 3 remaining study dates (2026-07-27, 2026-07-28, 2026-07-29).
    // Effective days = 2 (reserve 1), 40 / 2 = 20 words.
    expect(decision.target).toBe(20);
  });

  it('6. Skipped day does not create two batches at once', () => {
    const lesson = makeMockLesson(1, 50);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });

    const mockPlan = {
      studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      segments: [
        {
          type: 'chapter',
          chapterId: 1,
          assignedDates: ['2026-07-26', '2026-07-27', '2026-07-28'],
        },
      ],
    };

    // User skipped 2026-07-26 and opens app on 2026-07-27
    const result = unlockDailyVocabularyBatch(state, 1, {
      plan: mockPlan,
      dateKey: '2026-07-27',
      words: lesson.words,
    });

    expect(result.unlockedCount).toBe(25); // 50 / 2 remaining dates
    expect(result.alreadyUnlockedToday).toBe(false);
    expect(result.blockedByPreviousBatch).toBe(false);
  });

  it('7. Uncompleted previous batch blocks unlocking a new batch', () => {
    const lesson = makeMockLesson(1, 40);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });

    // Day 1 unlock
    unlockDailyVocabularyBatch(state, 1, { dateKey: '2026-07-26', words: lesson.words });

    // Day 2 attempt without completing Day 1
    const day2Decision = getTodayVocabularyUnlockDecision(state, 1, {
      dateKey: '2026-07-27',
      words: lesson.words,
    });
    expect(day2Decision.blockedByPreviousBatch).toBe(true);
    expect(day2Decision.shouldUnlock).toBe(false);

    const day2Result = unlockDailyVocabularyBatch(state, 1, {
      dateKey: '2026-07-27',
      words: lesson.words,
    });
    expect(day2Result.blockedByPreviousBatch).toBe(true);
    expect(day2Result.unlockedCount).toBe(0);
  });

  it('8. Fallback (17) is used when Study Plan is missing', () => {
    const lesson = makeMockLesson(1, 40);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });

    const decision = getTodayVocabularyUnlockDecision(state, 1, {
      plan: null,
      dateKey: '2026-07-26',
      words: lesson.words,
    });
    expect(decision.target).toBe(FALLBACK_DAILY_NEW_VOCABULARY_LIMIT);
    expect(decision.reason).toBe('fallback-no-plan');
  });

  it('9. insufficientDays is set when schedule is too tight', () => {
    const res = calculateDailyVocabularyTarget({ remainingWords: 80, remainingStudyDays: 2 });
    expect(res.insufficientDays).toBe(true);
    expect(res.target).toBe(MAX_DAILY_VOCABULARY_TARGET); // 25
    expect(res.requiredDailyTarget).toBe(40);
  });

  it('10. Batch target does not exceed protective maximum (25)', () => {
    const res = calculateDailyVocabularyTarget({ remainingWords: 100, remainingStudyDays: 3 });
    expect(res.target).toBe(25);
    expect(res.target).toBeLessThanOrEqual(MAX_DAILY_VOCABULARY_TARGET);
  });

  it('11. Repeated call on the same date remains idempotent', () => {
    const lesson = makeMockLesson(1, 30);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });

    const call1 = unlockDailyVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      words: lesson.words,
    });
    const call2 = unlockDailyVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      words: lesson.words,
    });

    expect(call1.unlockedCount).toBe(FALLBACK_DAILY_NEW_VOCABULARY_LIMIT);
    expect(call2.alreadyUnlockedToday).toBe(true);
    expect(call2.unlockedCount).toBe(0);
  });

  it('12. Previously unlocked batches remain unchanged after plan recalculation', () => {
    const lesson = makeMockLesson(1, 40);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });

    const batch1 = unlockDailyVocabularyBatch(state, 1, {
      dateKey: '2026-07-26',
      words: lesson.words,
    });
    expect(batch1.unlockedCount).toBe(17);

    // Simulate plan recalculation
    state.studyPlan = {
      studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      segments: [
        {
          type: 'chapter',
          chapterId: 1,
          assignedDates: ['2026-07-26', '2026-07-28', '2026-07-29', '2026-07-30'],
        },
      ],
    };

    expect(state.vocabularyUnlocks['1']['2026-07-26'].itemIds.length).toBe(17);
    const unlockedCards = Object.values(state.srs).filter((c) => c.planLocked === false);
    expect(unlockedCards.length).toBe(17);
  });

  it('13. Only real assignedDates of segment are counted', () => {
    const mockPlan = {
      studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      segments: [
        {
          type: 'chapter',
          chapterId: 1,
          assignedDates: ['2026-07-26', '2026-07-28'],
        },
      ],
    };

    const dates = getRemainingChapterStudyDates(mockPlan, 1, '2026-07-26');
    expect(dates).toEqual(['2026-07-26', '2026-07-28']);
  });

  it('14. Rest days and dates outside segment are ignored', () => {
    const mockPlan = {
      studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      segments: [
        {
          type: 'chapter',
          chapterId: 1,
          assignedDates: ['2026-07-26', '2026-07-27', '2026-07-28'],
          dateStatuses: {
            '2026-07-27': 'rest-day',
          },
        },
      ],
    };

    const dates = getRemainingChapterStudyDates(mockPlan, 1, '2026-07-26');
    expect(dates).toEqual(['2026-07-26', '2026-07-28']);
  });

  it('15. No new batches unlocked after chapter completion', () => {
    const lesson = makeMockLesson(1, 5);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });

    // Unlock all 5 words
    unlockDailyVocabularyBatch(state, 1, { dateKey: '2026-07-26', words: lesson.words });

    const decision = getTodayVocabularyUnlockDecision(state, 1, {
      dateKey: '2026-07-27',
      words: lesson.words,
    });

    expect(decision.shouldUnlock).toBe(false);
    expect(decision.reason).toBe('chapter-completed');
  });
});
