/* state/migrations/migrate-v5-to-v6.js — Migration v5 -> v6 */

export const migrationV5ToV6 = {
  from: 5,
  to: 6,
  migrate(oldState) {
    return {
      ...oldState,
      pendingReviewLogs: Array.isArray(oldState.pendingReviewLogs)
        ? oldState.pendingReviewLogs
        : [],
      version: 6,
    };
  },
};
