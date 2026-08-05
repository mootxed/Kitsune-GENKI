/* state/migrations/migrate-v6-to-v7.js — Migration v6 -> v7 */

export const migrationV6ToV7 = {
  from: 6,
  to: 7,
  migrate(oldState) {
    const baseState = { ...oldState };
    const existingPrior = Array.isArray(baseState.priorKnowledgeChapterIds)
      ? baseState.priorKnowledgeChapterIds
      : [];
    const legacyCompleted = Array.isArray(baseState.studyPlan?.completedChapters)
      ? baseState.studyPlan.completedChapters
      : [];
    const appChapters = baseState.chapters || {};

    const newPrior = new Set(
      existingPrior.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    );

    for (const id of legacyCompleted) {
      const chId = Number(id);
      if (!Number.isInteger(chId) || chId <= 0) continue;
      const chState = appChapters[chId];
      const isActuallyCompleted = Boolean(
        chState?.completedAt ||
        (chState?.checklist &&
          Object.keys(chState.checklist).length > 0 &&
          Object.values(chState.checklist).every((val) => val === true))
      );
      if (!isActuallyCompleted) {
        newPrior.add(chId);
      }
    }

    return {
      ...baseState,
      priorKnowledgeChapterIds: [...newPrior].sort((a, b) => a - b),
      version: 7,
    };
  },
};
