/* tests/vocabulary-unlock-plan.test.js — Tests for gradual vocabulary unlocking */
import { describe, it, expect, beforeEach } from 'vitest';
import { defaultState } from '../state/store.js';
import { SRS } from '../srs.js';
import { State } from 'ts-fsrs';
import {
  DEFAULT_DAILY_NEW_VOCABULARY_LIMIT,
  unlockDailyVocabularyBatch,
  getVocabularyBatchProgress,
  normalizeVocabularyLockState,
  countRemainingLockedWords,
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

  it('4. On the next day, the next portion is unlocked', () => {
    const lesson = makeMockLesson(1, 60);
    ensureChapterVocabularyCards(state, lesson, { planLocked: true });

    unlockDailyVocabularyBatch(state, 1, { dateKey: '2026-07-26', words: lesson.words });
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

    unlockDailyVocabularyBatch(state, 1, { dateKey: '2026-07-26', words: lesson.words }); // 17
    unlockDailyVocabularyBatch(state, 1, { dateKey: '2026-07-27', words: lesson.words }); // 17
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
