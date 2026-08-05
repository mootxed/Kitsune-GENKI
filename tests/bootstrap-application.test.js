/* tests/bootstrap-application.test.js — Integration & lifecycle tests for bootstrapApplication */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { bootstrapApplication } from '../bootstrap/bootstrap-application.js';

describe('bootstrapApplication Lifecycle', () => {
  let mockDependencies;

  beforeEach(() => {
    mockDependencies = {
      state: {
        initialized: false,
        settings: { notifyEnabled: false },
        srs: {},
        courses: { genki1: { lessonIds: [] } },
        activeCourseId: 'genki1',
        streak: { count: 0, lastActive: null },
      },
      save: vi.fn().mockResolvedValue(true),
      loadState: vi.fn().mockResolvedValue(true),
      SRS: { setReviewLogger: vi.fn() },
      QuestsManager: {
        initializeQuests: vi.fn(),
        checkQuestReset: vi.fn(),
      },
      AchievementSystem: {},
      nav: vi.fn(),
      updateTabIndicator: vi.fn(),
      speakJapanese: vi.fn(),
      stopSpeaking: vi.fn(),
      formatTimeUntilReset: vi.fn(),
    };

    // Ensure DOM loader element exists
    document.body.innerHTML = '<div id="app-loader"></div><div id="app"></div>';
  });

  test('bootstrapApplication runs all startup steps in order and returns cleanup handle', async () => {
    const result = await bootstrapApplication(mockDependencies);

    expect(mockDependencies.loadState).toHaveBeenCalled();
    expect(mockDependencies.QuestsManager.initializeQuests).toHaveBeenCalledWith(
      mockDependencies.state
    );
    expect(mockDependencies.state.initialized).toBe(true);
    expect(typeof result.cleanup).toBe('function');

    result.cleanup();
  });
});
