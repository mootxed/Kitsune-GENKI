/* state/migrations/migrate-v10-to-v11.js — Migration v10 -> v11 */

export const migrationV10ToV11 = {
  from: 10,
  to: 11,
  migrate(oldState) {
    const baseState = { ...oldState };
    const chapters = { ...(baseState.chapters || {}) };
    for (const [chapterId, chapterValue] of Object.entries(chapters)) {
      const chapter = { ...(chapterValue || {}) };
      chapter.checklist = { ...(chapter.checklist || {}) };
      if (chapter.checklist.vocab === true) chapter.legacyVocabularyCompleted = true;
      chapters[chapterId] = chapter;
    }
    return {
      ...baseState,
      chapters,
      grammarUnlocks:
        baseState.grammarUnlocks && typeof baseState.grammarUnlocks === 'object'
          ? baseState.grammarUnlocks
          : {},
      grammarProgress:
        baseState.grammarProgress && typeof baseState.grammarProgress === 'object'
          ? baseState.grammarProgress
          : {},
      practiceUnlocks:
        baseState.practiceUnlocks && typeof baseState.practiceUnlocks === 'object'
          ? baseState.practiceUnlocks
          : {},
      dailyPlan:
        baseState.dailyPlan && typeof baseState.dailyPlan === 'object' ? baseState.dailyPlan : null,
      dailyPlanHistory: Array.isArray(baseState.dailyPlanHistory) ? baseState.dailyPlanHistory : [],
      dailyCapacityMinutes:
        Number(baseState.dailyCapacityMinutes) > 0 ? Number(baseState.dailyCapacityMinutes) : 30,
      workbookSettings: {
        includeReadingWriting: baseState.workbookSettings?.includeReadingWriting !== false,
      },
      version: 11,
    };
  },
};
