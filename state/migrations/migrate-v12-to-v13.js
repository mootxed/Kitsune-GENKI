/* state/migrations/migrate-v12-to-v13.js — Migration v12 -> v13 */

export const migrationV12ToV13 = {
  from: 12,
  to: 13,
  migrate(oldState) {
    const baseState = { ...oldState };
    const chapters = { ...(baseState.chapters || {}) };
    for (const [chapterId, chapterValue] of Object.entries(chapters)) {
      const chapter = { ...(chapterValue || {}) };
      const checklist = { ...(chapter.checklist || {}) };
      const chId = Number(chapterId);

      const legacyDialog = `L${chId}_p_dialog`;
      const legacyListening = `L${chId}_p_listening`;
      const legacyReading = `L${chId}_p_reading`;

      if (checklist[legacyDialog] === true || checklist.dialog === true) {
        checklist.dialog = true;
      }
      delete checklist[legacyDialog];

      if (checklist[legacyListening] === true || checklist.listening === true) {
        checklist.listening = true;
      }
      delete checklist[legacyListening];

      if (checklist[legacyReading] === true || checklist.reading === true) {
        checklist.reading = true;
      }
      delete checklist[legacyReading];

      chapter.checklist = checklist;
      chapters[chapterId] = chapter;
    }

    return {
      ...baseState,
      chapters,
      version: 13,
    };
  },
};
