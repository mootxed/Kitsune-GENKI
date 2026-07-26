import { describe, expect, it } from 'vitest';
import { defaultState } from '../state/store.js';
import { ensureChapterVocabularyCards } from '../src/chapter-vocabulary.js';
import { getChapterVocabularyProgress } from '../src/vocabulary-unlock-plan.js';
import { evaluateAndCompleteChapter, isVocabularyBlockCompleted } from '../src/chapter-progress.js';

const chapter = {
  id: 1,
  words: [{ id: 'L1_word_1' }, { id: 'L1_word_2' }],
  notes: [{ note_id: 1, title: 'Grammar' }],
  practice: [{ id: 'L01-wb-cg-01', title: 'Practice', required: true }],
};

function preparedState() {
  const state = defaultState();
  state.chapters[1] = {
    started: true,
    checklist: {
      L1_g1: true,
      'L01-wb-cg-01': true,
      dialog: true,
      listening: true,
      reading: true,
    },
  };
  ensureChapterVocabularyCards(state, chapter, { planLocked: true });
  for (const card of Object.values(state.srs)) card.planLocked = false;
  return state;
}

describe('evidence-based chapter vocabulary progress', () => {
  it('does not complete vocabulary when words are only unlocked', () => {
    const state = preparedState();
    const progress = getChapterVocabularyProgress(state, 1, chapter);

    expect(progress).toMatchObject({
      totalWords: 2,
      lockedWords: 0,
      unlockedWords: 2,
      introducedWords: 0,
      remainingToIntroduce: 2,
      allUnlocked: true,
      isCompleted: false,
      ratio: 0,
    });
    expect(isVocabularyBlockCompleted(state, 1, chapter)).toBe(false);
  });

  it('completes only after every word has active review evidence', () => {
    const state = preparedState();
    state.reviewEvents.push(
      { eventType: 'review', eventId: 'r1', cardId: 'L1_word_1', itemId: 'L1_word_1' },
      { eventType: 'review', eventId: 'r2', cardId: 'L1_word_2', itemId: 'L1_word_2' }
    );

    expect(getChapterVocabularyProgress(state, 1, chapter)).toMatchObject({
      introducedWords: 2,
      isCompleted: true,
      ratio: 1,
    });
  });

  it('Undo returns vocabulary to incomplete', () => {
    const state = preparedState();
    state.reviewEvents.push(
      { eventType: 'review', eventId: 'r1', cardId: 'L1_word_1', itemId: 'L1_word_1' },
      {
        eventType: 'review',
        eventId: 'r2',
        cardId: 'L1_word_2',
        itemId: 'L1_word_2',
        undoneAt: 200,
      }
    );

    expect(getChapterVocabularyProgress(state, 1, chapter)).toMatchObject({
      introducedWords: 1,
      isCompleted: false,
    });
  });

  it('completes the chapter without checklist.vocab and grants the reward once', () => {
    const state = preparedState();
    state.reviewEvents.push(
      { eventType: 'review', eventId: 'r1', cardId: 'L1_word_1', itemId: 'L1_word_1' },
      { eventType: 'review', eventId: 'r2', cardId: 'L1_word_2', itemId: 'L1_word_2' }
    );

    const first = evaluateAndCompleteChapter(state, 1, { chapters: [chapter], now: 100 });
    const second = evaluateAndCompleteChapter(state, 1, { chapters: [chapter], now: 200 });

    expect(first).toMatchObject({ changed: true, rewardGranted: true, completedAt: 100 });
    expect(second).toMatchObject({ changed: false, alreadyCompleted: true });
    expect(state.chapters[1].checklist.vocab).toBeUndefined();
    expect(
      state.learningEvents.filter((event) => event.eventType === 'chapter-completed')
    ).toHaveLength(1);
  });
});
