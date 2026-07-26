import { describe, it, expect, beforeEach } from 'vitest';
import { defaultState } from '../state/store.js';
import {
  shouldShowOnboarding,
  hasMeaningfulUserProgress,
  updateOnboardingDraft,
  completeOnboarding,
  resetOnboarding,
} from '../src/onboarding-state.js';
import {
  buildStudyPlanContentCatalog,
  previewStudyPlanFromPreferences,
  commitStudyPlanFromPreferences,
} from '../src/study-plan-creation.js';

describe('Onboarding & First Launch Flow', () => {
  let state;

  beforeEach(() => {
    state = defaultState();
  });

  it('fresh defaultState opens onboarding', () => {
    expect(shouldShowOnboarding(state)).toBe(true);
    expect(hasMeaningfulUserProgress(state)).toBe(false);
    expect(state.onboarding.completed).toBe(false);
  });

  it('fresh state does not contain completed topics or legacy flags', () => {
    expect(Object.keys(state.chapters)).toHaveLength(0);
    expect(state.priorKnowledgeChapterIds).toEqual([]);
    expect(state.legacyGrammarCompleted).toBeUndefined();
    expect(state.legacyVocabularyCompleted).toBeUndefined();
  });

  it('user with meaningful progress is not sent to onboarding', () => {
    state.xp = 100;
    expect(hasMeaningfulUserProgress(state)).toBe(true);
    expect(shouldShowOnboarding(state)).toBe(false);
  });

  it('user with prior knowledge chapters is considered existing', () => {
    state.priorKnowledgeChapterIds = [1, 2];
    expect(hasMeaningfulUserProgress(state)).toBe(true);
    expect(shouldShowOnboarding(state)).toBe(false);
  });

  it('unfinished onboarding restores draft and current step', () => {
    updateOnboardingDraft(state, { startChapterId: 2, dailyCapacityMinutes: 45 }, 3);
    expect(state.onboarding.currentStep).toBe(3);
    expect(state.onboarding.draft.startChapterId).toBe(2);
    expect(state.onboarding.draft.dailyCapacityMinutes).toBe(45);
    expect(state.onboarding.completed).toBe(false);
  });

  it('reload between preview and commit does not create real studyPlan', () => {
    const preferences = {
      startDate: '2026-08-01',
      studyDays: [1, 3, 5],
      dailyCapacityMinutes: 30,
      workbookSettings: { enabled: true, includeReadingWriting: true },
    };
    const catalog = buildStudyPlanContentCatalog([
      { id: 1, words: Array(20).fill({}), notes: Array(3).fill({}) },
    ]);
    const preview = previewStudyPlanFromPreferences(preferences, catalog);

    expect(preview.valid).toBe(true);
    expect(state.studyPlan).toBeNull();
    expect(state.onboarding.completed).toBe(false);
  });

  it('error during plan commit does not set onboarding.completed to true', () => {
    const res = commitStudyPlanFromPreferences(state, {}, null);
    expect(res.success).toBe(false);
    expect(state.onboarding.completed).toBe(false);
  });

  it('successful plan commit marks onboarding completed', () => {
    const preferences = {
      startDate: '2026-08-01',
      studyDays: [1, 2, 3, 4, 5],
      dailyCapacityMinutes: 30,
      priorKnowledgeChapterIds: [1],
      workbookSettings: { enabled: true, includeReadingWriting: true },
    };
    const catalog = buildStudyPlanContentCatalog([
      { id: 1, words: Array(10).fill({}), notes: Array(2).fill({}) },
      { id: 2, words: Array(15).fill({}), notes: Array(3).fill({}) },
    ]);
    const preview = previewStudyPlanFromPreferences(preferences, catalog);
    const res = commitStudyPlanFromPreferences(state, preferences, preview);

    expect(res.success).toBe(true);
    expect(state.onboarding.completed).toBe(true);
    expect(state.studyPlan).not.toBeNull();
    expect(state.activeChapterId).toBe(2);
  });
});
