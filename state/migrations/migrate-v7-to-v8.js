/* state/migrations/migrate-v7-to-v8.js — Migration v7 -> v8 */

export const migrationV7ToV8 = {
  from: 7,
  to: 8,
  migrate(oldState) {
    const baseState = { ...oldState };
    const history =
      baseState.miniGameWordHistory && typeof baseState.miniGameWordHistory === 'object'
        ? baseState.miniGameWordHistory
        : {};
    return {
      ...baseState,
      miniGameWordHistory: {
        wordSearch: {
          recentSessions: Array.isArray(history.wordSearch?.recentSessions)
            ? history.wordSearch.recentSessions.slice(-5)
            : [],
        },
        crossword: {
          recentSessions: Array.isArray(history.crossword?.recentSessions)
            ? history.crossword.recentSessions.slice(-5)
            : [],
        },
      },
      version: 8,
    };
  },
};
