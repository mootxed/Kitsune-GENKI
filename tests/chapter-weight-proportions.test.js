import { describe, test, expect } from 'vitest';
import {
  buildStudyPlanContentCatalog,
  previewStudyPlanFromPreferences,
} from '../src/study-plan-creation.js';
import { StudyPlan, calculateChapterWeight } from '../studyplan.js';
import { sameLessonId } from '../src/courses/course-context.js';
import { getTodayDateKey } from '../src/local-date.js';

describe('Chapter Weight Proportions & Primary Generation vs Recalculation', () => {
  test('calculateChapterWeight uses requiredTotalMinutes when present', () => {
    const ch1 = { id: 1, requiredTotalMinutes: 100, importanceWeight: 1 };
    const ch2 = { id: 2, requiredTotalMinutes: 200, importanceWeight: 1 };

    const w1 = calculateChapterWeight(ch1);
    const w2 = calculateChapterWeight(ch2);

    expect(w2).toBe(2 * w1);
  });

  test('chapter with twice as much required practice receives more study days in initial plan and recalculation', () => {
    const rawChapters = [
      {
        id: 1,
        title: 'Глава 1',
        words: Array(20).fill({ id: 'w' }),
        notes: Array(3).fill({ id: 'g' }),
        practice: [
          { id: 'p1', section: 'conversation-grammar', required: true, estimatedMinutes: 10 },
        ],
      },
      {
        id: 2,
        title: 'Глава 2',
        words: Array(20).fill({ id: 'w' }),
        notes: Array(3).fill({ id: 'g' }),
        practice: [
          { id: 'p1', section: 'conversation-grammar', required: true, estimatedMinutes: 10 },
          { id: 'p2', section: 'conversation-grammar', required: true, estimatedMinutes: 50 },
          { id: 'p3', section: 'conversation-grammar', required: true, estimatedMinutes: 50 },
        ],
      },
    ];

    const catalog = buildStudyPlanContentCatalog(rawChapters, null, { enabled: true });
    const prefs = {
      startDate: getTodayDateKey(),
      studyDays: [1, 2, 3, 4, 5, 6, 0],
      dailyCapacityMinutes: 30,
      targetType: 'days',
      targetValue: 20,
      priorKnowledgeChapterIds: [],
    };

    const preview = previewStudyPlanFromPreferences(prefs, catalog);
    expect(preview.valid).toBe(true);

    const plan = preview.previewPlan;
    const seg1 = plan.segments.find((s) => sameLessonId(s.chapterId, 1));
    const seg2 = plan.segments.find((s) => sameLessonId(s.chapterId, 2));

    expect(seg2.assignedDates.length).toBeGreaterThan(seg1.assignedDates.length);

    // Recalculate plan with no completed chapters
    const recalc = StudyPlan.recalcPlan(plan, catalog.chapters, [], {});
    const rSeg1 = recalc.segments.find((s) => sameLessonId(s.chapterId, 1));
    const rSeg2 = recalc.segments.find((s) => sameLessonId(s.chapterId, 2));

    expect(rSeg2.assignedDates.length).toBeGreaterThan(rSeg1.assignedDates.length);
    expect(rSeg2.assignedDates.length / rSeg1.assignedDates.length).toBeCloseTo(
      seg2.assignedDates.length / seg1.assignedDates.length,
      0
    );
  });
});
