import { describe, expect, it } from 'vitest';
import { migrateGenki1StateV15 } from '../src/courses/genki-1/migrations/state-v15.js';
import {
  bindActiveCourseProgress,
  switchActiveCourse,
  syncActiveCourseProgress,
} from '../src/courses/course-state.js';

function v14State() {
  return {
    version: 14,
    activeChapterId: 4,
    chapters: {
      4: {
        started: true,
        checklist: { vocab: true, L4_g1: true, dialog: true },
      },
    },
    priorKnowledgeChapterIds: [1, 2],
    vocabularyUnlocks: {
      4: {
        '2026-07-30': { itemIds: ['L4_V001'], occurredAt: 100 },
      },
    },
    grammarUnlocks: { 4: { '2026-07-30': ['L4_g1'] } },
    grammarProgress: { 4: { L4_g1: { attempts: 2 } } },
    practiceUnlocks: { 4: { '2026-07-30': ['dialog', 'L04-wb-cg-01'] } },
    srs: {
      'L4_V001::recall': {
        id: 'L4_V001::recall',
        itemId: 'L4_V001',
        skill: 'recall',
        stability: 12.5,
        difficulty: 4.2,
        due: 1780000000000,
        reps: 8,
        lapses: 1,
      },
    },
    reviewEvents: [
      {
        eventId: 'event-1',
        cardId: 'L4_V001::recall',
        itemId: 'L4_V001',
        reviewedAt: 1770000000000,
      },
    ],
    pendingReviewLogs: [
      {
        eventId: 'event-2',
        cardId: 'L4_V001::recall',
        itemId: 'L4_V001',
        reviewedAt: 1770000001000,
      },
    ],
    masteryArchive: {
      L4_V001: { evidenceCount: 5 },
    },
    learningEvents: [{ eventId: 'learn-1', chapterId: 4, itemId: 'L4_V001' }],
    dailyPlan: {
      dateKey: '2026-07-30',
      chapterId: 4,
      tasks: [{ action: { chapterId: 4, itemIds: ['L4_V001'] } }],
    },
    dailyPlanHistory: [],
    studyPlan: {
      segments: [{ type: 'chapter', chapterId: 4, status: 'active' }],
      completedChapters: [1, 2],
    },
    workbookSettings: { enabled: true, includeReadingWriting: false },
  };
}

describe('state v14 -> v15 course migration', () => {
  it('namespaces references and preserves every FSRS scheduling field and review event', () => {
    const source = v14State();
    const cardBefore = globalThis.structuredClone(source.srs['L4_V001::recall']);
    const migrated = migrateGenki1StateV15(source);
    const card = migrated.srs['genki-1:vocabulary:L4_V001::recall'];

    expect(migrated.version).toBe(15);
    expect(migrated.activeCourseId).toBe('genki-1');
    expect(migrated.activeChapterId).toBe('genki-1:lesson-4');
    expect(migrated.chapters['genki-1:lesson-4'].started).toBe(true);
    expect(card).toMatchObject({
      ...cardBefore,
      id: 'genki-1:vocabulary:L4_V001::recall',
      itemId: 'genki-1:vocabulary:L4_V001',
      courseId: 'genki-1',
      lessonId: 'genki-1:lesson-4',
    });
    expect(card.stability).toBe(cardBefore.stability);
    expect(card.difficulty).toBe(cardBefore.difficulty);
    expect(card.due).toBe(cardBefore.due);
    expect(migrated.reviewEvents[0]).toMatchObject({
      eventId: 'event-1',
      cardId: 'genki-1:vocabulary:L4_V001::recall',
      itemId: 'genki-1:vocabulary:L4_V001',
      reviewedAt: 1770000000000,
    });
    expect(migrated.pendingReviewLogs[0].eventId).toBe('event-2');
    expect(migrated.masteryArchive['genki-1:vocabulary:L4_V001']).toEqual({
      evidenceCount: 5,
    });
    expect(migrated.courses['genki-1'].currentLessonId).toBe('genki-1:lesson-4');
  });

  it('is deterministic and idempotent', () => {
    const once = migrateGenki1StateV15(v14State());
    expect(migrateGenki1StateV15(once)).toEqual(once);
    expect(migrateGenki1StateV15(v14State())).toEqual(once);
  });

  it('archives unknown lesson references instead of deleting them', () => {
    const source = v14State();
    source.activeChapterId = 'unresolved-lesson';
    const migrated = migrateGenki1StateV15(source);
    expect(migrated.activeChapterId).toBe('unresolved-lesson');
    expect(migrated.courseMigrationArchive.unknownReferences).toContainEqual({
      path: 'activeChapterId',
      value: 'unresolved-lesson',
    });
  });
});

describe('course progress isolation', () => {
  it('switches the active projection without mixing lesson progress or global FSRS cards', () => {
    const state = {
      activeCourseId: 'genki-1',
      courses: {},
      srs: {
        'genki-1:vocabulary:L1_V001': { id: 'genki-1:vocabulary:L1_V001', stability: 8 },
        'test-course:vocabulary:hello': { id: 'test-course:vocabulary:hello', stability: 3 },
      },
    };
    bindActiveCourseProgress(state, 'genki-1', '1.0.0');
    state.activeChapterId = 'genki-1:lesson-2';
    state.chapters['genki-1:lesson-2'] = { started: true, checklist: {} };
    syncActiveCourseProgress(state);

    switchActiveCourse(state, 'test-course', '0.0.1');
    expect(state.activeChapterId).toBeNull();
    expect(state.chapters).toEqual({});
    state.activeChapterId = 'test-course:lesson-alpha';
    state.chapters['test-course:lesson-alpha'] = { started: true, checklist: {} };
    syncActiveCourseProgress(state);

    switchActiveCourse(state, 'genki-1');
    expect(state.activeChapterId).toBe('genki-1:lesson-2');
    expect(state.chapters['genki-1:lesson-2'].started).toBe(true);
    expect(state.courses['test-course'].lessonProgress['test-course:lesson-alpha'].started).toBe(
      true
    );
    expect(state.srs['genki-1:vocabulary:L1_V001'].stability).toBe(8);
    expect(state.srs['test-course:vocabulary:hello'].stability).toBe(3);
  });
});
