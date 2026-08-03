import { describe, it, expect, beforeEach } from 'vitest';
import { defaultState } from '../state/store.js';
import {
  buildStudyPlanContentCatalog,
  previewStudyPlanFromPreferences,
  commitStudyPlanFromPreferences,
} from '../src/study-plan-creation.js';
import { StudyPlan } from '../studyplan.js';
import { getTodayDateKey } from '../src/local-date.js';

describe('Unified Study Plan Creation & Catalog Service', () => {
  let state;

  beforeEach(() => {
    state = defaultState();
  });

  it('buildStudyPlanContentCatalog enriches chapter metadata with workbook practice metrics', () => {
    const contentIndex = [
      { id: 1, title: 'Глава 1', words: Array(30).fill({}), notes: Array(4).fill({}) },
    ];
    const workbookData = {
      chapters: [
        {
          chapterId: 1,
          practice: [
            {
              id: 'L1_wb_1',
              section: 'conversation-grammar',
              required: true,
              estimatedMinutes: 15,
            },
            { id: 'L1_wb_2', section: 'reading-writing', required: true, estimatedMinutes: 20 },
          ],
        },
      ],
    };

    const catalogFull = buildStudyPlanContentCatalog(contentIndex, workbookData, {
      enabled: true,
      includeConversationGrammar: true,
      includeReadingWriting: true,
    });
    expect(catalogFull.chapters[0].requiredTotalMinutes).toBe(30 * 1 + 4 * 10 + 30 + 15 + 20);

    const catalogNoRW = buildStudyPlanContentCatalog(contentIndex, workbookData, {
      enabled: true,
      includeConversationGrammar: true,
      includeReadingWriting: false,
    });
    expect(catalogNoRW.chapters[0].requiredTotalMinutes).toBe(30 * 1 + 4 * 10 + 30 + 15);

    const catalogDisabledWB = buildStudyPlanContentCatalog(contentIndex, workbookData, {
      enabled: false,
    });
    expect(catalogDisabledWB.chapters[0].requiredTotalMinutes).toBe(30 * 1 + 4 * 10 + 30);
  });

  it('previewStudyPlanFromPreferences does not mutate in-memory state', () => {
    const preferences = {
      startDate: getTodayDateKey(),
      studyDays: [1, 2, 3, 4, 5],
      dailyCapacityMinutes: 30,
      workbookSettings: { enabled: true },
    };
    const catalog = buildStudyPlanContentCatalog([
      { id: 1, words: Array(10).fill({}), notes: Array(2).fill({}) },
    ]);

    const stateBefore = JSON.stringify(state);
    const preview = previewStudyPlanFromPreferences(preferences, catalog);

    expect(preview.valid).toBe(true);
    expect(JSON.stringify(state)).toBe(stateBefore);
  });

  it('recalculateFuturePlan uses same catalog weights', () => {
    const contentIndex = [
      { id: 1, title: 'Глава 1', words: Array(30).fill({}), notes: Array(4).fill({}) },
      { id: 2, title: 'Глава 2', words: Array(20).fill({}), notes: Array(2).fill({}) },
    ];
    const catalog = buildStudyPlanContentCatalog(contentIndex, null, { enabled: true });
    const preferences = {
      startDate: getTodayDateKey(),
      studyDays: [1, 3, 5],
      dailyCapacityMinutes: 30,
    };
    const preview = previewStudyPlanFromPreferences(preferences, catalog);
    commitStudyPlanFromPreferences(state, preferences, preview);

    const recalced = StudyPlan.recalculateFuturePlan(state.studyPlan, catalog.chapters, [1], {
      today: getTodayDateKey(),
    });

    expect(recalced).not.toBeNull();
    expect(recalced.error).toBeUndefined();
  });

  it('returns available deadline days separately from required study days', () => {
    const catalog = buildStudyPlanContentCatalog([
      { id: 1, words: Array(20).fill({}), notes: Array(2).fill({}) },
    ]);
    const preview = previewStudyPlanFromPreferences(
      {
        startDate: getTodayDateKey(),
        studyDays: [0, 1, 2, 3, 4, 5, 6],
        targetType: 'days',
        targetValue: 10,
        dailyCapacityMinutes: 30,
      },
      catalog
    );

    expect(preview.availableStudyDays).toBe(10);
    expect(preview.requiredStudyDays).not.toBe(preview.availableStudyDays);
  });

  it('caps adaptive FSRS reserve at 60% and warns about queue conflict', () => {
    const now = Date.now();
    state.srs = Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => [
        `L1_V${index}:recognition`,
        {
          id: `L1_V${index}:recognition`,
          itemId: `L1_V${index}`,
          skill: 'recognition',
          due: now - 1,
          reps: 1,
          state: 2,
        },
      ])
    );
    const catalog = buildStudyPlanContentCatalog([
      { id: 1, words: Array(20).fill({}), notes: Array(2).fill({}) },
    ]);

    const preview = previewStudyPlanFromPreferences(
      {
        startDate: getTodayDateKey(),
        studyDays: [0, 1, 2, 3, 4, 5, 6],
        targetType: 'days',
        targetValue: 30,
        dailyCapacityMinutes: 30,
      },
      catalog,
      { state, now }
    );

    expect(preview.queueReviewMinutes).toBe(20);
    expect(preview.reviewReserveMinutes).toBe(18);
    expect(preview.reviewLoadExceedsCap).toBe(true);
    expect(preview.warnings.join(' ')).toContain('очередью FSRS');
  });
});
