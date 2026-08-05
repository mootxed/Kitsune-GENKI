/* state/migrations/migrate-v11-to-v12.js — Migration v11 -> v12 */

import { hasMeaningfulUserProgress } from '../../src/onboarding-state.js';

export const migrationV11ToV12 = {
  from: 11,
  to: 12,
  migrate(oldState) {
    const baseState = { ...oldState };
    const chapters = { ...(baseState.chapters || {}) };
    for (const [chapterId, chapterValue] of Object.entries(chapters)) {
      const chapter = { ...(chapterValue || {}) };
      chapter.checklist = { ...(chapter.checklist || {}) };
      if (chapter.checklist.grammar === true) {
        chapter.legacyCompletionEvidence = {
          ...(chapter.legacyCompletionEvidence || {}),
          grammar: true,
        };
        delete chapter.checklist.grammar;
      }
      if (chapter.checklist.dialog === true) {
        chapter.checklist[`L${chapterId}_p_dialog`] = true;
        delete chapter.checklist.dialog;
      }
      if (chapter.checklist.listening === true) {
        chapter.checklist[`L${chapterId}_p_listening`] = true;
        delete chapter.checklist.listening;
      }
      if (chapter.checklist.reading === true) {
        chapter.checklist[`L${chapterId}_p_reading`] = true;
        delete chapter.checklist.reading;
      }
      chapters[chapterId] = chapter;
    }

    const hasProgress = hasMeaningfulUserProgress(baseState);
    const onboarding = {
      schemaVersion: 1,
      completed: hasProgress,
      currentStep: 0,
      draft: null,
      completedAt: hasProgress ? baseState.updatedAt || Date.now() : null,
      ...(baseState.onboarding || {}),
    };
    if (hasProgress) onboarding.completed = true;

    return {
      ...baseState,
      chapters,
      onboarding,
      workbookSettings: {
        enabled: baseState.workbookSettings?.enabled !== false,
        includeConversationGrammar:
          baseState.workbookSettings?.includeConversationGrammar !== false,
        includeReadingWriting: baseState.workbookSettings?.includeReadingWriting !== false,
      },
      version: 12,
    };
  },
};
