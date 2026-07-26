import { describe, it, expect, beforeEach } from 'vitest';
import { getAllPlanStudyDates, mergeUpdatedPlanWithHistory } from '../studyplan.js';
import { isVocabularyBlockCompleted, getRequiredChapterSections } from '../src/chapter-progress.js';
import { openPlanEditor, closePlanEditor } from '../ui/plan.js';

describe('Study Plan Stabilization Unit Tests', () => {
  describe('1. Selector getAllPlanStudyDates', () => {
    it('extracts unique sorted study dates from segments', () => {
      const plan = {
        segments: [
          { type: 'chapter', chapterId: 1, assignedDates: ['2026-08-05', '2026-08-01'] },
          { type: 'chapter', chapterId: 2, assignedDates: ['2026-08-03', '2026-08-01'] },
        ],
      };
      const dates = getAllPlanStudyDates(plan);
      expect(dates).toEqual(['2026-08-01', '2026-08-03', '2026-08-05']);
    });

    it('returns empty array when plan or segments are empty', () => {
      expect(getAllPlanStudyDates(null)).toEqual([]);
      expect(getAllPlanStudyDates({})).toEqual([]);
      expect(getAllPlanStudyDates({ segments: [] })).toEqual([]);
    });
  });

  describe('2. mergeUpdatedPlanWithHistory', () => {
    it('merges new generated plan with existing plan preserving history and past dates', () => {
      const today = '2026-08-10';
      const existingPlan = {
        startDate: '2026-08-01',
        deadline: '2026-10-01',
        history: [{ eventId: 'ev1', type: 'chapter-complete' }],
        completedChapters: [1],
        dateStatuses: { '2026-08-02': 'completed' },
        vocabularySchedule: { '2026-08-02': [10, 11] },
        segments: [
          {
            type: 'chapter',
            chapterId: 1,
            status: 'completed',
            assignedDates: ['2026-08-01', '2026-08-02'],
          },
          {
            type: 'chapter',
            chapterId: 2,
            status: 'planned',
            assignedDates: ['2026-08-03', '2026-08-04'],
          },
        ],
      };

      const generatedPlan = {
        startDate: '2026-08-01',
        deadline: '2026-11-01',
        history: [
          { eventId: 'ev1', type: 'chapter-complete' },
          { eventId: 'ev2', type: 'plan-updated' },
        ],
        completedChapters: [],
        dateStatuses: { '2026-08-12': 'planned' },
        vocabularySchedule: { '2026-08-12': [12, 13] },
        segments: [
          {
            type: 'chapter',
            chapterId: 2,
            status: 'planned',
            assignedDates: ['2026-08-12', '2026-08-13'],
          },
        ],
      };

      const merged = mergeUpdatedPlanWithHistory(existingPlan, generatedPlan, { today });

      expect(merged.history).toHaveLength(2);
      expect(merged.completedChapters).toEqual([1]);
      expect(merged.dateStatuses['2026-08-02']).toBe('completed');
      expect(merged.vocabularySchedule['2026-08-02']).toEqual([10, 11]);
      expect(merged.segments[0].chapterId).toBe(1);
    });
  });

  describe('3. isVocabularyBlockCompleted safeguard', () => {
    it('returns false when chapterMeta.words is missing or empty and no evidence exists', () => {
      const appState = { chapters: { 1: { started: true, checklist: {} } } };
      expect(isVocabularyBlockCompleted(appState, 1, null)).toBe(false);
      expect(isVocabularyBlockCompleted(appState, 1, { words: [] })).toBe(false);
    });

    it('returns true when prior knowledge or explicit evidence is present', () => {
      const appState = { priorKnowledgeChapterIds: [1], chapters: { 1: { started: true } } };
      expect(isVocabularyBlockCompleted(appState, 1, null)).toBe(true);
    });
  });

  describe('4. Workbook settings in checklist and required sections', () => {
    it('excludes workbook tasks when workbook is disabled', () => {
      const chapterMeta = {
        id: 1,
        practice: [
          { id: 'p1', title: 'Task 1', type: 'workbook', section: 'conversation-grammar' },
          { id: 'p2', title: 'Task 2', type: 'reading', section: 'reading' },
        ],
      };
      const settings = { enabled: false };
      const sections = getRequiredChapterSections(chapterMeta, settings);
      expect(sections.some((s) => s.id === 'p1')).toBe(false);
      expect(sections.some((s) => s.id === 'p2')).toBe(true);
    });
  });

  describe('5. Form state management openPlanEditor / closePlanEditor', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="plan-form-container" class="hidden"><h3 id="plan-form-title"></h3></div>
        <div id="plan-view-container"></div>
        <div id="plan-controls"></div>
        <button id="plan-generate-btn">Создать план</button>
      `;
    });

    it('openPlanEditor shows form and hides view container', () => {
      const state = { studyPlan: { totalDays: 30 } };
      openPlanEditor(state);
      expect(document.querySelector('#plan-form-container').classList.contains('hidden')).toBe(
        false
      );
      expect(document.querySelector('#plan-view-container').classList.contains('hidden')).toBe(
        true
      );
    });

    it('closePlanEditor hides form and shows view container', () => {
      const state = { studyPlan: { totalDays: 30 } };
      openPlanEditor(state);
      closePlanEditor(state);
      expect(document.querySelector('#plan-form-container').classList.contains('hidden')).toBe(
        true
      );
      expect(document.querySelector('#plan-view-container').classList.contains('hidden')).toBe(
        false
      );
    });
  });
});
