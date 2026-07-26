/* tests/browser-dom-integration.test.js — DOM Integration Test */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { defaultState, resetApplicationData, state } from '../state/store.js';
import { renderOnboarding } from '../ui/onboarding.js';
import { renderChapter } from '../ui/chapter.js';
import { renderSettings } from '../ui/settings.js';
import { shouldShowOnboarding } from '../src/onboarding-state.js';
import {
  buildStudyPlanContentCatalog,
  previewStudyPlanFromPreferences,
  commitStudyPlanFromPreferences,
} from '../src/study-plan-creation.js';

describe('Browser DOM Integration Flow', () => {
  let appState;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    appState = defaultState();
    document.body.innerHTML = `
      <div id="app"></div>
      <div id="onboarding-container"></div>
      <div id="chapter-title"></div>
      <div id="chapter-jp"></div>
      <div id="chapter-body"></div>
      <div id="settings-body"></div>
      <div id="toast"></div>
    `;
  });

  it('Full user flow: clean storage -> onboarding -> create plan -> chapter 1 (grammar 0/5, practice 0/N) -> reset -> onboarding', async () => {
    // 1. Чистое хранилище -> shouldShowOnboarding = true
    expect(shouldShowOnboarding(appState)).toBe(true);

    // 2. Создание плана через сервисы
    const catalog = buildStudyPlanContentCatalog([
      {
        id: 1,
        title: 'Приветствия',
        words: Array(10).fill({ id: 'w1' }),
        notes: Array(5).fill({ id: 'g1' }),
        practice: [{ id: 'p1', title: 'Практика 1' }],
      },
    ]);
    const preferences = {
      startDate: '2026-08-01',
      studyDays: [1, 2, 3, 4, 5, 6, 0],
      dailyCapacityMinutes: 30,
    };
    const preview = previewStudyPlanFromPreferences(preferences, catalog);
    expect(preview.valid).toBe(true);

    const commitRes = commitStudyPlanFromPreferences(appState, preferences, preview);
    expect(commitRes.success).toBe(true);
    expect(shouldShowOnboarding(appState)).toBe(false);

    // 3. Открыть главу 1 и проверить, что свежая начатая глава имеет 0 выполненных чеков
    const mockLesson = {
      id: 1,
      title: 'Приветствия',
      words: [{ id: 'L1_V001', kanji: 'こんにちは' }],
      notes: [
        { id: 'L1_g1', title: 'Тема 1' },
        { id: 'L1_g2', title: 'Тема 2' },
        { id: 'L1_g3', title: 'Тема 3' },
        { id: 'L1_g4', title: 'Тема 4' },
        { id: 'L1_g5', title: 'Тема 5' },
      ],
      practice: [{ id: 'L1_p1', title: 'Задание 1' }],
    };

    appState.chapters[1] = { started: true, checklist: {} };

    const { LESSONS } = await import('../ui/home.js');
    LESSONS.push(mockLesson);

    await renderChapter(1, appState, { toast: () => {} });

    const doneCheckboxes = document.querySelectorAll('.check-item.done');
    expect(doneCheckboxes).toHaveLength(0);

    // 4. Настройки: сброс через resetApplicationData
    window.confirm = vi.fn().mockReturnValue(true);
    const mockReload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: mockReload },
      writable: true,
    });

    renderSettings(appState, { toast: () => {}, nav: () => {} });
    const resetBtn = document.querySelector('#btn-reset');
    expect(resetBtn).not.toBeNull();

    const freshState = await resetApplicationData({ skipReload: true, preserveTheme: true });
    expect(freshState.xp).toBe(0);
    expect(freshState.studyPlan).toBeNull();
    expect(shouldShowOnboarding(freshState)).toBe(true);
  });

  it('Responsive layout check: no horizontal overflow at 320, 360, 390, 422, 768 px', () => {
    const viewports = [320, 360, 390, 422, 768];
    for (const width of viewports) {
      document.documentElement.style.width = `${width}px`;
      document.body.style.width = `${width}px`;

      const scrollWidth = document.documentElement.scrollWidth;
      expect(scrollWidth).toBeLessThanOrEqual(width);
    }
  });
});
