import { describe, it, expect } from 'vitest';
import {
  getGrammarTopicPrerequisiteStatus,
  completeGrammarTopicWithCheck,
  getGrammarTopicStatus,
} from '../src/grammar-plan.js';
import { prioritizeGrammarPrerequisiteVocabulary } from '../src/vocabulary-unlock-plan.js';
import quizData from '../public/data/genki-lesson-01-grammar-quiz.json';

describe('Grammar Prerequisites & Cancel Behavior', () => {
  const mockTopic = quizData.topics[1]; // L1_g2 (prerequisite: L1_g1, requiredVocab: L1_V017, L1_V023, etc.)

  function createInitialState() {
    return {
      chapters: {
        1: {
          started: true,
          checklist: {},
        },
      },
      grammarUnlocks: {
        1: {
          '2026-07-26': ['L1_g1', 'L1_g2'],
        },
      },
      srs: {
        card_1: { id: 'card_1', itemId: 'L1_V017', planLocked: false, reps: 1, state: 1 },
        card_2: { id: 'card_2', itemId: 'L1_V023', planLocked: false, reps: 1, state: 1 },
        card_3: { id: 'card_3', itemId: 'L1_V025', planLocked: false, reps: 1, state: 1 },
        card_4: { id: 'card_4', itemId: 'L1_V053', planLocked: false, reps: 1, state: 1 },
      },
      reviewEvents: [
        { eventType: 'review', itemId: 'L1_V017' },
        { eventType: 'review', itemId: 'L1_V023' },
        { eventType: 'review', itemId: 'L1_V025' },
        { eventType: 'review', itemId: 'L1_V053' },
      ],
      grammarProgress: {},
      learningEvents: [],
    };
  }

  it('blocks topic access if required vocabulary has not been introduced', () => {
    const state = createInitialState();
    state.chapters[1].checklist['L1_g1'] = true;
    // Remove review events for L1_V053 so it is not introduced
    state.reviewEvents = state.reviewEvents.filter((e) => e.itemId !== 'L1_V053');
    delete state.srs.card_4;

    const status = getGrammarTopicPrerequisiteStatus(state, 1, mockTopic);
    expect(status.satisfied).toBe(false);
    expect(status.missingVocabularyIds).toContain('L1_V053');
    expect(status.reason).toBe('missing-vocabulary-prerequisites');
  });

  it('blocks topic access if prerequisite grammar topic is incomplete', () => {
    const state = createInitialState();
    // L1_g1 is not completed in state.chapters[1].checklist
    const status = getGrammarTopicPrerequisiteStatus(state, 1, mockTopic);
    expect(status.satisfied).toBe(false);
    expect(status.missingGrammarIds).toContain('L1_g1');
  });

  it('allows topic access when all vocabulary & grammar prerequisites are met', () => {
    const state = createInitialState();
    state.chapters[1].checklist['L1_g1'] = true;

    const status = getGrammarTopicPrerequisiteStatus(state, 1, mockTopic);
    expect(status.satisfied).toBe(true);
    expect(status.missingVocabularyIds.length).toBe(0);
    expect(status.missingGrammarIds.length).toBe(0);
    expect(status.reason).toBeNull();
  });

  it('handles cancel in completeGrammarTopicWithCheck without recording attempts or score', () => {
    const state = createInitialState();
    state.chapters[1].checklist['L1_g1'] = true;

    const result = completeGrammarTopicWithCheck(state, 1, 'L1_g2', { canceled: true });

    expect(result.canceled).toBe(true);
    expect(result.completed).toBe(false);
    expect(result.changed).toBe(false);
    expect(result.reason).toBe('canceled');

    // Verify state was not mutated with attempts or learning events
    expect(state.grammarProgress?.[1]?.[mockTopic.id]?.attempts).toBeUndefined();
    expect(state.learningEvents.length).toBe(0);
  });

  it('completes topic when 2/3 questions (67%) are answered correctly', () => {
    const state = createInitialState();
    state.chapters[1].checklist['L1_g1'] = true;

    const checkResult = { passed: true, score: 67, correctCount: 2, totalQuestions: 3 };
    const result = completeGrammarTopicWithCheck(state, 1, 'L1_g2', checkResult, {
      chapterMeta: { id: 1, notes: quizData.topics },
    });

    expect(result.completed).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.rewardGranted).toBe(true);
    expect(getGrammarTopicStatus(state, 1, 'L1_g2')).toBe('completed');
  });

  it('does not complete topic when score fails passing threshold', () => {
    const state = createInitialState();
    state.chapters[1].checklist['L1_g1'] = true;

    const checkResult = { passed: false, score: 33, correctCount: 1, totalQuestions: 3 };
    const result = completeGrammarTopicWithCheck(state, 1, 'L1_g2', checkResult, {
      chapterMeta: { id: 1, notes: quizData.topics },
    });

    expect(result.completed).toBe(false);
    expect(result.reason).toBe('check-failed');
    expect(state.grammarProgress[1]['L1_g2'].attempts).toBe(1);
    expect(state.grammarProgress[1]['L1_g2'].lastScore).toBe(33);
  });

  it('does not grant duplicate rewards on repeat completion', () => {
    const state = createInitialState();
    state.chapters[1].checklist['L1_g1'] = true;

    const checkResult = { passed: true, score: 100 };
    const firstRes = completeGrammarTopicWithCheck(state, 1, 'L1_g2', checkResult, {
      chapterMeta: { id: 1, notes: quizData.topics },
    });
    expect(firstRes.rewardGranted).toBe(true);

    const secondRes = completeGrammarTopicWithCheck(state, 1, 'L1_g2', checkResult, {
      chapterMeta: { id: 1, notes: quizData.topics },
    });
    expect(secondRes.completed).toBe(false);
    expect(secondRes.alreadyCompleted).toBe(true);
  });

  it('rejects unknown topic IDs', () => {
    const state = createInitialState();
    const result = completeGrammarTopicWithCheck(
      state,
      1,
      'UNKNOWN_TOPIC_99',
      { passed: true },
      {
        chapterMeta: { id: 1, notes: quizData.topics },
      }
    );
    expect(result.completed).toBe(false);
    expect(result.reason).toBe('topic-not-found');
  });

  it('prioritizes upcoming grammar topic vocabulary in prioritizeGrammarPrerequisiteVocabulary', () => {
    const lockedWords = [
      { id: 'L1_V001' },
      { id: 'L1_V002' },
      { id: 'L1_V017' },
      { id: 'L1_V003' },
      { id: 'L1_V023' },
    ];

    const upcomingTopic = {
      requiredVocabularyIds: ['L1_V017', 'L1_V023'],
    };

    const prioritized = prioritizeGrammarPrerequisiteVocabulary({
      lockedWordIds: lockedWords,
      upcomingGrammarTopic: upcomingTopic,
      targetCount: 3,
    });

    expect(prioritized.map((w) => w.id)).toEqual(['L1_V017', 'L1_V023', 'L1_V001']);
  });
});
