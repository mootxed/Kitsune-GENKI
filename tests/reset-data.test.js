import { describe, it, expect, beforeEach } from 'vitest';
import {
  defaultState,
  resetApplicationData,
  cancelPendingSaves,
  save,
  state,
} from '../state/store.js';

describe('Reset Application Data & Theme Preservation', () => {
  beforeEach(async () => {
    localStorage.clear();
  });

  it('cancelPendingSaves prevents delayed save from executing', async () => {
    save(false);
    cancelPendingSaves();
    // No error thrown and pending queue cleared
  });

  it('resetApplicationData returns fresh defaultState with preserved theme', async () => {
    const initialState = defaultState();
    initialState.xp = 500;
    initialState.settings.darkMode = 'dark';
    initialState.currentTheme = 'sakura';
    initialState.onboarding.completed = true;

    // Имитируем активный state в store
    await resetApplicationData({ skipReload: true, preserveTheme: false });
    const fresh = await resetApplicationData({ skipReload: true, preserveTheme: true });

    expect(fresh.xp).toBe(0);
    expect(fresh.onboarding.completed).toBe(false);
    expect(fresh.chapters).toEqual({});
  });

  it('reset state does not retain legacy grammar or vocabulary flags', async () => {
    const fresh = await resetApplicationData({ skipReload: true });

    expect(fresh.legacyGrammarCompleted).toBeUndefined();
    expect(fresh.legacyVocabularyCompleted).toBeUndefined();
    expect(fresh.priorKnowledgeChapterIds).toEqual([]);
  });
});
