import { describe, test, expect } from 'vitest';
import { isVocabularyBlockCompleted, evaluateChapterCompletion } from '../src/chapter-progress.js';

describe('Vocabulary Undo & Chapter Reopening', () => {
  test('undoing vocabulary completion removes completedAt and reopens chapter', () => {
    const chapterMeta = {
      id: 1,
      words: [{ id: 'w1' }, { id: 'w2' }],
      notes: [],
      practice: [],
    };

    const state = {
      activeChapterId: 1,
      priorKnowledgeChapterIds: [],
      chapters: {
        1: {
          started: true,
          completedAt: 1700000000000,
          requiredSectionsCompletedAt: 1700000000000,
          completionRewardedAt: 1700000000000,
          checklist: {
            dialog: true,
            listening: true,
            reading: true,
          },
        },
      },
      studyPlan: {
        completedChapters: [1],
        segments: [
          {
            id: 'seg1',
            type: 'chapter',
            chapterId: 1,
            status: 'completed',
            completedAt: 1700000000000,
          },
        ],
      },
      srs: {},
    };

    // Before undo, simulate words incomplete in SRS (no reps)
    expect(isVocabularyBlockCompleted(state, 1, chapterMeta)).toBe(false);

    // Run evaluateChapterCompletion
    const res = evaluateChapterCompletion(state, 1, { chapters: [chapterMeta] });

    expect(res.changed).toBe(true);
    expect(res.reopened).toBe(true);
    expect(state.chapters[1].completedAt).toBeNull();
    expect(state.studyPlan.completedChapters).not.toContain(1);
    expect(state.studyPlan.segments[0].status).toBe('planned');
    expect(state.chapters[1].completionRewardedAt).toBe(1700000000000); // Reward not revoked
  });
});
